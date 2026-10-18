import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import { BUILDINGS } from '../src/data/buildings';
import { RESOURCES } from '../src/data/resources';
import { createInitialState } from '../src/state/create-state';
import type { GameState } from '../src/types/state';
import { validateCurrentSave } from '../src/state/validate-save';
import { calculateSupportPreview, buildSettlementLedger } from '../src/simulation/support-preview';
import { calculateProduction } from '../src/simulation/production';
import { calculateStorageDetails } from '../src/simulation/storage';
import { calculateStorageBonuses } from '../src/simulation/storage-bonuses';
import { calculateResourceBreakdown } from '../src/simulation/resource-breakdown';
import { isBuildingUnlocked, isTechnologyUnlocked } from '../src/simulation/unlocks';
import { requestPurchaseModule } from '../src/simulation/purchases';
import { isContainerAssignable } from '../src/simulation/containers';
import { advancePopulationGrowth, calculateGrowthMultiplier } from '../src/simulation/population';
import { calculateProductionMultiplier } from '../src/simulation/multipliers';
import { createMilestoneState } from './fixtures/milestones';
import { supplyPower } from './support/power';
import type { BuildingId } from '../src/types/buildings';
import type { ResourceId } from '../src/types/economy';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const near = (a: number, b: number, label?: string) => assert.ok(Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(b)), `${label ?? ''}: ${a} != ${b}`);
const context = { now: 0, eventInterval: 60, housingCapacity: () => 1e6, clampResources: () => {} };

function beaconState(): GameState {
  const s = createMilestoneState('beacon');
  Object.assign(s.resources, { water: 1e4, helium3: 1e4, e710: 5e3, food: 1e4 });
  supplyPower(s, 1e6);
  return s;
}

const eraTechs = ['hyperspaceMiningSurvey', 'gasCloudAccretion', 'highTechFarmPlatform', 'fusionPower', 'largeMiningShips'] as const;
const eraBuildings = ['comprehensiveMiningFacility', 'gasCloudMiningShip', 'highTechFarmPlatform', 'fusionPowerPlant', 'metalMiningShip', 'fuelMiningShip'] as const;

test('maintenance rebalance charges exact helium and energy per funded unit once', () => {
  for (const dt of [.2, 1]) {
    const s = beaconState();
    s.buildings.hyperspaceSpaceport = 1; s.buildings.iceMiningShip = 1; s.buildings.constraintArray = 1;
    s.buildings.aiSupercore = 0; // exclude quantum core helium from this comparison.
    const support = calculateSupportPreview(s, dt);
    // Port helium 5/s, ice ship helium 5/s, array energy 50/s and e710 .25/s.
    const energyPerSecond = 30 + 5 + 50;
    near(support.power.available, 1e6 - energyPerSecond, 'energy debit');
    near(support.pool.helium3, s.resources.helium3 - (5 + 5) * dt, 'helium debit');
    near(support.pool.e710, s.resources.e710 - .25 * dt, 'array e710 debit');
    const p = calculateProduction(s, dt);
    near(calculateResourceBreakdown('energy', s, p).net, p.rates.energy, 'energy breakdown');
    // Geothermal helium maintenance is now 0.5 * fuel multiplier.
    s.buildings.geothermalPlant = 1; s.tech.push('helium3ExtractionOptimization');
    const geoLedger = buildSettlementLedger(s, dt);
    near(geoLedger.plants.inputUnits.geothermalPlant ?? 0, 1, 'geothermal funded');
    // Mining ships helium 2/s, e710 ship helium 3/s.
    const belt = beaconState();
    belt.buildings.iridiumMiningShip = 1; belt.buildings.ironMiningShip = 1; belt.buildings.e710MiningShip = 1;
    belt.buildings.aiSupercore = 0; // exclude quantum core helium from this comparison.
    supplyPower(belt, 1e6); belt.resources.helium3 = 1e4;
    const beltPreview = calculateSupportPreview(belt, dt);
    near(beltPreview.pool.helium3, 1e4 - (2 + 2 + 3) * dt, 'belt helium debit');
  }
});

test('community center replaces production bonus with growth +10%', () => {
  const s = createInitialState(CONFIG.version, 60, 0);
  assert.equal(calculateGrowthMultiplier(s), 1.5);
  s.buildings.communityCenter = 1;
  assert.equal(calculateGrowthMultiplier(s), 1.5 * 1.1);
  // The old resource-production +25% hook is gone; production multipliers are
  // identical at the same happiness whether or not the center exists.
  const without = createInitialState(CONFIG.version, 60, 0);
  for (const id of ['wood', 'food', 'cash'] as const) {
    assert.equal(calculateProductionMultiplier(id, 100, s), calculateProductionMultiplier(id, 100, without), id);
  }
});

test('dimension beacon drops to T17 and era techs form the exact research chain', () => {
  assert.equal(TECHNOLOGIES.dimensionBeaconDeployment.tier, 17);
  assert.equal(TECHNOLOGIES.hyperspaceMiningSurvey.tier, 18);
  assert.deepEqual(TECHNOLOGIES.hyperspaceMiningSurvey.cost, { knowledge: 700000, e710: 1000 });
  assert.equal(TECHNOLOGIES.hyperspaceMiningSurvey.pre[0], 'dimensionBeaconDeployment');
  assert.deepEqual(TECHNOLOGIES.gasCloudAccretion.cost, { knowledge: 720000, e710: 1000 });
  assert.equal(TECHNOLOGIES.gasCloudAccretion.pre[0], 'hyperspaceMiningSurvey');
  assert.deepEqual(TECHNOLOGIES.highTechFarmPlatform.cost, { knowledge: 750000 });
  assert.equal(TECHNOLOGIES.highTechFarmPlatform.pre[0], 'gasCloudAccretion');
  assert.deepEqual(TECHNOLOGIES.fusionPower.cost, { knowledge: 850000 });
  assert.equal(TECHNOLOGIES.fusionPower.pre[0], 'gasCloudAccretion');
  assert.deepEqual(TECHNOLOGIES.largeMiningShips.cost, { knowledge: 850000 });
  assert.deepEqual(TECHNOLOGIES.largeMiningShips.pre, ['hyperspaceMiningSurvey', 'gasCloudAccretion']);
  const s = beaconState();
  // Research each era tech in order so the next prerequisite unlocks.
  for (const id of eraTechs) { assert.equal(isTechnologyUnlocked(id, s), true, id); s.tech.push(id); }
  // Without its parent researched the child stays locked.
  const early = beaconState();
  assert.equal(isTechnologyUnlocked('gasCloudAccretion', early), false, 'gasCloudAccretion before survey');
  early.tech.push('hyperspaceMiningSurvey');
  assert.equal(isTechnologyUnlocked('gasCloudAccretion', early), true, 'gasCloudAccretion after survey');
  early.tech.push('gasCloudAccretion');
  assert.equal(isTechnologyUnlocked('largeMiningShips', early), true, 'largeMiningShips after both parents');
});

test('hyperspace buildings fund whole units, never bootstrap, and use ordinary multipliers', () => {
  for (const dt of [.2, 1]) {
    const s = beaconState();
    for (const id of eraTechs) s.tech.push(id);
    for (const id of eraBuildings) { s.buildings[id as BuildingId] = 1; s.stoppedBuildings[id as BuildingId] = 0; }
    s.resources.deuterium = 0;
    // Stop the only deuterium producer so consumers can't bootstrap off
    // same-tick output; they must not run on zero deuterium.
    s.stoppedBuildings.gasCloudMiningShip = 1;
    const empty = calculateProduction(s, dt);
    assert.ok((empty.inputUnits.metalMiningShip || 0) < 1e-9, 'metal ship needs deuterium');
    assert.ok((empty.inputUnits.fuelMiningShip || 0) < 1e-9, 'fuel ship needs deuterium');
    assert.ok((empty.inputUnits.fusionPowerPlant || 0) < 1e-9, 'fusion needs deuterium');
    assert.ok((empty.inputUnits.highTechFarmPlatform || 0) < 1e-9, 'farm needs deuterium');
    s.stoppedBuildings.gasCloudMiningShip = 0;
    // Comprehensive mining facility needs helium; gas ship needs only energy.
    s.resources.helium3 = 10 * dt; // exactly one funded facility for dt
    supplyPower(s, 1e6);
    s.resources.deuterium = 2 * dt; // ample stock so every consumer funds fully
    const p = calculateProduction(s, dt);
    assert.equal(p.inputUnits.comprehensiveMiningFacility, 1);
    assert.equal(p.inputUnits.gasCloudMiningShip, 1);
    assert.equal(p.inputUnits.metalMiningShip, 1);
    // Facility e710 +.05 minus the funded constraint array upkeep -.25.
    near(p.rates.e710 ?? 0, .05 - .25, 'e710 facility output minus array upkeep');
    near(p.rates.neutron ?? 0, .25, 'neutron from facility');
    near(p.rates.uranium ?? 0, .1, 'uranium from facility');
    near(p.rates.helium3, 2 - 10, 'gas ship helium net');
    // Gas produces .25; consumers metal .2 + fuel .2 + fusion .5 + farm .2.
    near(p.rates.deuterium ?? 0, .25 - (.2 + .2 + .5 + .2), 'deuterium net');
    near(p.rates.stone ?? 0, 8, 'metal ship stone');
    near(p.rates.copper ?? 0, 4, 'metal ship copper');
    near(p.rates.coal ?? 0, 2.5, 'fuel ship coal');
    near(p.rates.wood ?? 0, 8, 'farm wood');
    near(p.rates.food ?? 0, 10 - s.population * CONFIG.foodPerCat, 'farm food');
    // Happiness scales ordinary outputs: derive the expectation from actual morale.
    s.population = 0;
    s.resources.deuterium = 2 * dt;
    const happy = calculateProduction(s, dt);
    assert.ok(happy.morale.happiness >= 100, 'zero population removes pop pressure');
    near(happy.rates.copper ?? 0, 4 * happy.morale.happiness / 100, 'copper scales with happiness');
  }
});

test('deuterium unlocks via gas cloud ship with port and base capacities and no containers', () => {
  const s = beaconState();
  assert.equal(isBuildingUnlocked('gasCloudMiningShip', s), false);
  s.tech.push('gasCloudAccretion');
  assert.equal(isBuildingUnlocked('gasCloudMiningShip', s), true);
  assert.equal(RESOURCES.deuterium.cap, 0);
  // Unlocking deuterium is by building the gas cloud ship; before that the port stores none.
  assert.equal(calculateStorageBonuses('hyperspaceSpaceport', s, null, null).deuterium, undefined, 'port deuterium needs unlock');
  s.buildings.gasCloudMiningShip = 1;
  assert.equal(isContainerAssignable('deuterium', s), false);
  s.tech.push('hyperspaceMiningSurvey');
  assert.equal(calculateStorageBonuses('hyperspaceSpaceport', s, null, null).deuterium, 8000);
  assert.equal(calculateStorageBonuses('asteroidBase', s, null, null).deuterium, 2000);
  // Storage details only count funded ships.
  s.buildings.hyperspaceSpaceport = 1;
  s.resources.deuterium = 100;
  const snap = { ...calculateSupportPreview(s, 1), moonBaseUnits: 0 };
  const details = calculateStorageDetails('deuterium', s, snap);
  near(details.rows.find(row => row.name.includes('超空间太空港'))?.value ?? 0, 8000, 'port row');
  near(details.total, 8000, 'deuterium cap from port');
  s.stoppedBuildings.hyperspaceSpaceport = 1;
  const stoppedSnap = { ...calculateSupportPreview(s, 1), moonBaseUnits: 0 };
  const stopped = calculateStorageDetails('deuterium', s, stoppedSnap);
  assert.equal(stopped.rows.some(row => row.name.includes('超空间太空港')), false, 'stopped port gives no capacity');
});

test('era buildings are gated by their techs and respect region unlock chains', () => {
  const s = beaconState();
  s.tech.push('hyperspaceMiningSurvey');
  assert.equal(isBuildingUnlocked('comprehensiveMiningFacility', s), true);
  assert.equal(isBuildingUnlocked('gasCloudMiningShip', s), false);
  s.tech.push('gasCloudAccretion');
  assert.equal(isBuildingUnlocked('gasCloudMiningShip', s), true);
  assert.equal(isBuildingUnlocked('highTechFarmPlatform', s), false);
  assert.equal(isBuildingUnlocked('fusionPowerPlant', s), false);
  assert.equal(isBuildingUnlocked('metalMiningShip', s), false);
  s.tech.push('highTechFarmPlatform', 'fusionPower');
  assert.equal(isBuildingUnlocked('highTechFarmPlatform', s), true);
  assert.equal(isBuildingUnlocked('fusionPowerPlant', s), true);
  s.tech.push('largeMiningShips');
  assert.equal(isBuildingUnlocked('metalMiningShip', s), true);
  assert.equal(isBuildingUnlocked('fuelMiningShip', s), true);
  // Era tech purchases stay atomic and one-time.
  const buyer = beaconState();
  buyer.tech.push('hyperspaceMiningSurvey');
  buyer.resources.knowledge = 720000; buyer.resources.e710 = 1000;
  assert.equal(requestPurchaseModule(buyer, 'tech', 'gasCloudAccretion', 0).status, 'buy-now');
  assert.equal(buyer.resources.knowledge, 0);
  assert.equal(requestPurchaseModule(buyer, 'tech', 'gasCloudAccretion', 0).status, 'rejected');
});

test('missing and malformed era records reject immutably', () => {
  const raw = clone(beaconState()) as unknown as Record<string, unknown>;
  raw.tech = (raw.tech as string[]).filter(id => !eraTechs.includes(id as (typeof eraTechs)[number]));
  for (const field of ['buildings', 'workers', 'stoppedBuildings']) {
    for (const id of eraBuildings) delete (raw[field] as Record<string, unknown>)[id];
  }
  delete (raw.resources as Record<string, unknown>).deuterium;
  const before = clone(raw);
  assert.throws(() => validateCurrentSave(raw, context));
  assert.deepEqual(raw, before);
  for (const field of ['buildings', 'workers', 'stoppedBuildings']) {
    for (const id of eraBuildings) {
      for (const value of [null, .5]) {
        const bad = clone(beaconState()) as unknown as Record<string, unknown>;
        (bad[field] as Record<string, unknown>)[id] = value;
        assert.throws(() => validateCurrentSave(bad, context));
      }
    }
  }
  const badWater = clone(beaconState());
  (badWater.resources as Record<string, unknown>).deuterium = null;
  assert.throws(() => validateCurrentSave(badWater, context));
});

test('deuterium holdings and era buildings survive a full save round trip', () => {
  const s = beaconState();
  // Test-only solar supply is not part of this era's save fixture (its tech is
  // intentionally un-researched here), so clear it before validating the save.
  supplyPower(s, 0);
  for (const id of eraTechs) s.tech.push(id);
  s.buildings.gasCloudMiningShip = 2; s.buildings.fusionPowerPlant = 1;
  s.resources.deuterium = 123;
  const restored = validateCurrentSave(clone(s), context);
  assert.equal(restored.resources.deuterium, 123);
  assert.equal(restored.buildings.gasCloudMiningShip, 2);
  assert.equal(restored.buildings.fusionPowerPlant, 1);
  assert.ok(restored.tech.includes('fusionPower'));
  const again = validateCurrentSave(clone(restored), context);
  assert.deepEqual(again.resources.deuterium, 123);
});
