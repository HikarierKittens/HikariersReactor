import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TECHNOLOGIES } from '../src/data/technologies';
import { BUILDINGS } from '../src/data/buildings';
import type { GameState } from '../src/types/state';
import { validateCurrentSave } from '../src/state/validate-save';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateProduction } from '../src/simulation/production';
import { calculateStorageDetails, calculateStorageTotals } from '../src/simulation/storage';
import { calculateStorageBonuses } from '../src/simulation/storage-bonuses';
import { calculateResourceBreakdown } from '../src/simulation/resource-breakdown';
import { calculateBuildingCost, calculateBuildingScale, calculateDynamicCreep } from '../src/simulation/costs';
import { calculateFactoryCapacity } from '../src/simulation/factory';
import { calculateWorkerCapacity } from '../src/simulation/building-production';
import { countRunningBuildings } from '../src/simulation/housing';
import { isBuildingUnlocked, isTechnologyUnlocked } from '../src/simulation/unlocks';
import { requestPurchaseModule, buyBuildingNow, buyBuildingsInBatch, queuePurchase, settlePurchaseQueue, SPACE_RIPPER_COMPLETED_LOG } from '../src/simulation/purchases';
import { createMilestoneState } from './fixtures/milestones';
import type { ResourceId } from '../src/types/economy';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const near = (a: number, b: number, label?: string) => assert.ok(Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(b)), `${label ?? ''}: ${a} != ${b}`);
const context = { now: 0, eventInterval: 60, housingCapacity: () => 1e6, clampResources: () => {} };
const ERA = ['hyperspaceMiningSurvey', 'gasCloudAccretion', 'highTechFarmPlatform', 'fusionPower', 'largeMiningShips'] as const;

function eraState(): GameState {
  const s = createMilestoneState('beacon');
  s.tech.push(...ERA);
  s.buildings.gasCloudMiningShip = 1; // unlocks deuterium
  Object.assign(s.resources, { energy: 1e6, water: 1e4, helium3: 1e4, e710: 5e3, food: 1e4, deuterium: 1e3 });
  return s;
}

test('completing the space ripper logs the main-story completion exactly once on every build path', () => {
  assert.equal(SPACE_RIPPER_COMPLETED_LOG, '当前游戏主线部分已完成喵，请等待未来更新喵');
  const count = (s: GameState) => s.logs.filter(entry => entry.text === SPACE_RIPPER_COMPLETED_LOG).length;
  const ready = (segments: number) => {
    const s = eraState();
    s.tech.push('dimensionPioneer');
    s.buildings.spaceRipper = segments;
    for (const resource of Object.keys(BUILDINGS.spaceRipper.cost) as ResourceId[]) s.resources[resource] = 1e12;
    return s;
  };
  // Direct buy: segment 99 is silent, segment 100 logs once as an event.
  const direct = ready(98);
  assert.ok(buyBuildingNow(direct, 'spaceRipper', 0).bought);
  assert.equal(count(direct), 0, '99 segments do not log');
  assert.ok(buyBuildingNow(direct, 'spaceRipper', 0).bought);
  assert.equal(direct.buildings.spaceRipper, 100);
  assert.equal(count(direct), 1);
  assert.equal(direct.logs[0]?.type, 'progress');
  assert.equal(buyBuildingNow(direct, 'spaceRipper', 0).bought, false, 'cannot exceed 100 segments');
  assert.equal(count(direct), 1);
  // Batch buy spanning the final segment.
  const batch = ready(95);
  assert.equal(buyBuildingsInBatch(batch, 'spaceRipper', 10, 0).bought, 5);
  assert.equal(count(batch), 1);
  // Queue completion of the final segment.
  const queued = ready(99);
  assert.notEqual(queuePurchase(queued, 'build', 'spaceRipper').status, 'rejected');
  settlePurchaseQueue(queued, 0);
  assert.equal(queued.buildings.spaceRipper, 100);
  assert.equal(count(queued), 1);
});

test('new technologies have the requested tiers, prices and prerequisites', () => {
  assert.equal(TECHNOLOGIES.dimensionPioneer.tier, 19);
  assert.deepEqual(TECHNOLOGIES.dimensionPioneer.cost, { knowledge: 1000000 });
  assert.deepEqual(TECHNOLOGIES.dimensionPioneer.pre, ['hyperspaceMiningSurvey', 'gasCloudAccretion']);
  assert.equal(TECHNOLOGIES.highTechFactory.tier, 18);
  assert.deepEqual(TECHNOLOGIES.highTechFactory.cost, { knowledge: 800000 });
  assert.deepEqual(TECHNOLOGIES.highTechFactory.pre, ['highTechFarmPlatform']);
  assert.equal(TECHNOLOGIES.higherDimensionalStorage.tier, 19);
  assert.deepEqual(TECHNOLOGIES.higherDimensionalStorage.pre, ['dimensionPioneer']);
  const s = createMilestoneState('beacon');
  assert.equal(isTechnologyUnlocked('dimensionPioneer', s), false);
  s.tech.push('hyperspaceMiningSurvey', 'gasCloudAccretion');
  assert.equal(isTechnologyUnlocked('dimensionPioneer', s), true);
  assert.equal(isTechnologyUnlocked('highTechFactory', s), false);
  s.tech.push('highTechFarmPlatform');
  assert.equal(isTechnologyUnlocked('highTechFactory', s), true);
  s.tech.push('dimensionPioneer', 'highTechFactory');
  assert.equal(isBuildingUnlocked('spaceRipper', s), true);
  assert.equal(isBuildingUnlocked('highTechFactory', s), true);
  // 高维存储 needs the completed ripper: 99 segments are not enough.
  s.buildings.spaceRipper = 99;
  assert.equal(isTechnologyUnlocked('higherDimensionalStorage', s), false);
  s.buildings.spaceRipper = 100;
  assert.equal(isTechnologyUnlocked('higherDimensionalStorage', s), true);
  s.resources.knowledge = TECHNOLOGIES.higherDimensionalStorage.cost.knowledge!;
  assert.equal(requestPurchaseModule(s, 'tech', 'higherDimensionalStorage', 0).status, 'buy-now');
  assert.equal(s.resources.knowledge, 0);
});

test('space ripper is a 100-segment project whose fixed price never creeps', () => {
  const s = eraState();
  s.tech.push('dimensionPioneer');
  const def = BUILDINGS.spaceRipper;
  assert.equal(def.segmentedRequired, 100);
  assert.deepEqual(def.cost, { cash: 2500000, alloy: 50000, polymer: 50000, iridium: 5000, neutron: 2500, nanotubes: 100000, e710: 50, mithril: 10000 });
  // Flavor only: the +100 energy and +20% knowledge effects are listed as tooltip effect rows.
  assert.equal(def.desc, '[AMD友情赞助] 这个巨大的装置撕开了空间的边界。');
  // Even with every CRISPR material gene and many owned segments the price is fixed.
  s.crispr = ['materialEfficiency', 'innovativeMaterials', 'structuralReinforcement', 'physicsLaws', 'halfLife3'];
  for (const count of [0, 1, 57, 99]) assert.deepEqual(calculateBuildingCost('spaceRipper', count, s), def.cost, `segment ${count}`);
  for (const resource of Object.keys(def.cost) as ResourceId[]) {
    assert.equal(calculateBuildingScale('spaceRipper', resource, s), 1);
    assert.deepEqual(calculateDynamicCreep('spaceRipper', resource, s), []);
  }
  // Buying segments charges the fixed price each time and stops at 100.
  Object.assign(s.resources, def.cost);
  assert.equal(requestPurchaseModule(s, 'build', 'spaceRipper', 0).status, 'buy-now');
  assert.equal(s.buildings.spaceRipper, 1);
  s.buildings.spaceRipper = 100;
  Object.assign(s.resources, def.cost);
  assert.equal(requestPurchaseModule(s, 'build', 'spaceRipper', 0).status, 'rejected');
});

test('only a completed ripper adds +100 energy/s and +20% knowledge capacity', () => {
  for (const dt of [.2, 1]) {
    const s = eraState();
    s.tech.push('dimensionPioneer');
    s.buildings.aiSupercore = 100;
    s.buildings.spaceRipper = 99;
    const partial = calculateProduction(s, dt);
    const snapPartial = { ...calculateSupportPreview(s, dt), moonBaseUnits: 0 };
    const baseKnowledge = calculateStorageDetails('knowledge', s, snapPartial).total;
    assert.equal(countRunningBuildings('spaceRipper', s), 0);
    s.buildings.spaceRipper = 100;
    // Stopping records are ignored: the ripper is always running once complete.
    s.stoppedBuildings.spaceRipper = 0;
    const full = calculateProduction(s, dt);
    near(full.rates.energy - partial.rates.energy, 100, 'ripper energy');
    near(calculateResourceBreakdown('energy', s, full).net, full.rates.energy, 'energy breakdown');
    const snap = { ...calculateSupportPreview(s, dt), moonBaseUnits: 0 };
    const details = calculateStorageDetails('knowledge', s, snap);
    near(details.total, baseKnowledge * 1.2, 'knowledge +20%');
    near(details.rows.find(row => row.name === '空间撕裂者')?.value ?? 0, baseKnowledge * .2, 'ripper row');
    near(calculateStorageTotals(s, snap).knowledge, details.total, 'totals match details');
  }
});

test('撕裂者超频 is a T19 1M-knowledge tech after 破维先锋 that doubles ripper energy to 200/s', () => {
  const tech = TECHNOLOGIES.ripperOverclock;
  assert.equal(tech.tier, 19);
  assert.deepEqual(tech.cost, { knowledge: 1000000 });
  assert.deepEqual(tech.pre, ['dimensionPioneer']);
  for (const dt of [.2, 1]) {
    const s = eraState();
    s.tech.push('dimensionPioneer');
    s.buildings.aiSupercore = 100;
    s.buildings.spaceRipper = 100;
    const normal = calculateProduction(s, dt).rates.energy;
    s.tech.push('ripperOverclock');
    const overclocked = calculateProduction(s, dt);
    near(overclocked.rates.energy - normal, 100, 'overclock adds another 100 energy/s');
    near(calculateResourceBreakdown('energy', s, overclocked).net, overclocked.rates.energy, 'energy breakdown');
    // Unfinished rippers still produce nothing, overclocked or not.
    s.buildings.spaceRipper = 99;
    near(calculateProduction(s, dt).rates.energy, normal - 100, 'incomplete ripper');
  }
});

test('high-tech factory adds 2 lines and 2 cement worker slots, costing 10 energy and 0.5 deuterium', () => {
  for (const dt of [.2, 1]) {
    const s = eraState();
    s.tech.push('highTechFactory');
    const def = BUILDINGS.highTechFactory;
    assert.equal(def.desc, '工厂生产线+2，水泥工人上限+2, 电力-10/s，氘-0.5/s');
    assert.equal(def.costScales?.cash, 1.25);
    s.buildings.highTechFactory = 1;
    assert.equal(calculateFactoryCapacity(s), calculateFactoryCapacity({ ...s, buildings: { ...s.buildings, highTechFactory: 0 } }) + 2);
    const workshops = s.buildings.cementWorkshop || 0;
    assert.equal(calculateWorkerCapacity('cementWorkshop', s), workshops * (BUILDINGS.cementWorkshop.slots || 0) + 2);
    const before = clone(s);
    const p = calculateProduction(s, dt);
    assert.deepEqual(s, before, 'production preview is pure');
    near(p.inputUnits.highTechFactory ?? 0, 1, 'funded');
    const without = calculateProduction({ ...clone(s), buildings: { ...s.buildings, highTechFactory: 0 } }, dt);
    near(without.rates.energy - p.rates.energy, 10, 'energy upkeep');
    near((without.rates.deuterium ?? 0) - (p.rates.deuterium ?? 0), .5, 'deuterium upkeep');
    near(calculateResourceBreakdown('deuterium', s, p).net, p.rates.deuterium ?? 0, 'deuterium breakdown');
    near(calculateResourceBreakdown('energy', s, p).net, p.rates.energy, 'energy breakdown');
    // Without deuterium the factory is unfunded and its lines stop.
    s.resources.deuterium = 0; s.stoppedBuildings.gasCloudMiningShip = 1;
    s.lines.alloy = 2;
    const dry = calculateProduction(s, dt);
    assert.ok((dry.inputUnits.highTechFactory ?? 0) < 1e-9, 'no deuterium, no factory');
    assert.ok((dry.inputUnits.alloy ?? 0) < 1e-9, 'unpowered lines idle');
    // Stopped factories give no line capacity.
    s.stoppedBuildings.highTechFactory = 1;
    assert.equal(calculateFactoryCapacity(s), calculateFactoryCapacity({ ...s, buildings: { ...s.buildings, highTechFactory: 0 } }));
  }
});

test('710 research station: tech, +1 scientist slot, +50k funded knowledge cap, 25 energy and 1 deuterium', () => {
  assert.equal(TECHNOLOGIES.e710ResearchStation.tier, 19);
  assert.deepEqual(TECHNOLOGIES.e710ResearchStation.cost, { knowledge: 850000 });
  assert.deepEqual(TECHNOLOGIES.e710ResearchStation.pre, ['hyperspaceMiningSurvey', 'gasCloudAccretion']);
  const def = BUILDINGS.e710ResearchStation;
  assert.equal(def.desc, '猫猫科学家上限+1. 知识容量+50k， 电力-25/s，氘-1/s');
  for (const scale of Object.values(def.costScales || {})) assert.equal(scale, 1.25);
  const locked = createMilestoneState('beacon');
  locked.tech.push('hyperspaceMiningSurvey');
  assert.equal(isTechnologyUnlocked('e710ResearchStation', locked), false);
  locked.tech.push('gasCloudAccretion');
  assert.equal(isTechnologyUnlocked('e710ResearchStation', locked), true);
  assert.equal(isBuildingUnlocked('e710ResearchStation', locked), false);
  locked.tech.push('e710ResearchStation');
  assert.equal(isBuildingUnlocked('e710ResearchStation', locked), true);
  for (const dt of [.2, 1]) {
    const s = eraState();
    s.tech.push('e710ResearchStation');
    const labs = calculateWorkerCapacity('lab', s);
    s.buildings.e710ResearchStation = 2;
    assert.equal(calculateWorkerCapacity('lab', s), labs + 2, 'scientist cap +1 each');
    const p = calculateProduction(s, dt);
    near(p.inputUnits.e710ResearchStation ?? 0, 2, 'funded');
    const without = calculateProduction({ ...clone(s), buildings: { ...s.buildings, e710ResearchStation: 0 } }, dt);
    near(without.rates.energy - p.rates.energy, 50, 'energy upkeep');
    near((without.rates.deuterium ?? 0) - (p.rates.deuterium ?? 0), 2, 'deuterium upkeep');
    near(calculateResourceBreakdown('deuterium', s, p).net, p.rates.deuterium ?? 0, 'deuterium breakdown');
    const snap = { ...calculateSupportPreview(s, dt), moonBaseUnits: 0 };
    const noStation = { ...calculateSupportPreview({ ...clone(s), buildings: { ...s.buildings, e710ResearchStation: 0 } }, dt), moonBaseUnits: 0 };
    const details = calculateStorageDetails('knowledge', s, snap);
    near(details.rows.find(row => row.name.startsWith('710研究站'))?.value ?? 0, 100000, 'station row');
    near(calculateStorageTotals(s, snap).knowledge, details.total, 'totals match details');
    assert.ok(details.total > calculateStorageDetails('knowledge', s, noStation).total, 'cap increases');
    // Only one station's deuterium is available: one funded unit, half the storage.
    s.resources.deuterium = 1 * dt; s.stoppedBuildings.gasCloudMiningShip = 1;
    const short = { ...calculateSupportPreview(s, dt), moonBaseUnits: 0 };
    assert.equal(short.researchStationUnits, 1);
    near(calculateStorageDetails('knowledge', s, short).rows.find(row => row.name.startsWith('710研究站'))?.value ?? 0, 50000, 'only funded stations store');
  }
  // Scientist assignments up to the raised cap survive a save round trip; above it they are rejected.
  const s = eraState();
  s.tech.push('e710ResearchStation');
  s.buildings.e710ResearchStation = 1;
  s.workers.lab = calculateWorkerCapacity('lab', s);
  s.population = Math.max(s.population, Object.values(s.workers).reduce((a, b) => a + b, 0));
  assert.equal(validateCurrentSave(clone(s), context).workers.lab, s.workers.lab);
  const over = clone(s); over.buildings.e710ResearchStation = 0;
  assert.throws(() => validateCurrentSave(over, context));
});

test('powered high-tech factories run two assigned lines each', () => {
  const s = eraState();
  s.tech.push('highTechFactory');
  // Keep the ground/space factories built (alloy stays unlocked) but stopped.
  s.buildings.factory = Math.max(1, s.buildings.factory || 0);
  s.stoppedBuildings.factory = s.buildings.factory;
  s.stoppedBuildings.spaceFactory = s.buildings.spaceFactory || 0;
  s.buildings.highTechFactory = 1;
  for (const key of Object.keys(s.lines)) s.lines[key as keyof typeof s.lines] = 0;
  s.lines.alloy = 2;
  Object.assign(s.resources, { copper: 1e4, iron: 1e4 });
  const p = calculateProduction(s, 1);
  near(p.inputUnits.alloy ?? 0, 2, 'both lines powered');
  // One running ground factory plus the high-tech factory power three lines.
  s.stoppedBuildings.factory = s.buildings.factory - 1;
  s.lines.alloy = 3;
  near(calculateProduction(s, 1).inputUnits.alloy ?? 0, 3, 'ground + high-tech lines');
});

test('higher-dimensional storage doubles hyperspace storage and adds spaceport water', () => {
  const s = eraState();
  s.tech.push('dimensionPioneer');
  s.buildings.spaceRipper = 100;
  const before = {
    port: calculateStorageBonuses('hyperspaceSpaceport', s, null, null),
    base: calculateStorageBonuses('asteroidBase', s, null, null),
    civilian: calculateStorageBonuses('civilianRouteStation', s, null, null),
  };
  assert.deepEqual(before.port, { helium3: 16000, deuterium: 8000 });
  s.tech.push('higherDimensionalStorage');
  assert.deepEqual(calculateStorageBonuses('hyperspaceSpaceport', s, null, null), { helium3: 32000, water: 16000, deuterium: 16000 });
  assert.deepEqual(calculateStorageBonuses('asteroidBase', s, null, null), { water: 16000, deuterium: 4000 });
  assert.deepEqual(calculateStorageBonuses('civilianRouteStation', s, null, null), { cash: 64000, food: 64000 });
  // Funded freight stations: 32000 × (1 + 5% per running base + 100%).

  s.buildings.constraintArray = 3; s.buildings.anchorFreightStation = 1; s.buildings.hyperspaceSpaceport = 1;
  s.buildings.iceMiningShip = 1; s.buildings.asteroidBase = 1;
  const snap = { ...calculateSupportPreview(s, 1), moonBaseUnits: 0 };
  assert.equal(snap.stageThree.freight, 1);
  assert.equal(snap.stageThree.asteroidBases, 1);
  const row = calculateStorageDetails('iron', s, snap).rows.find(item => item.name.startsWith('锚点货运站'));
  near(row?.value ?? 0, 32000 * (1 + .05 + 1), 'freight doubled');
  const water = calculateStorageDetails('water', s, snap);
  near(water.rows.find(item => item.name.startsWith('超空间太空港'))?.value ?? 0, 16000, 'port water');
  near(calculateStorageTotals(s, snap).water, water.total, 'water totals match details');
});

test('new buildings migrate additively and the completed ripper survives a save round trip', () => {
  const s = eraState();
  s.tech.push('dimensionPioneer', 'highTechFactory', 'higherDimensionalStorage');
  s.buildings.spaceRipper = 100; s.buildings.highTechFactory = 2; s.stoppedBuildings.highTechFactory = 1;
  const restored = validateCurrentSave(clone(s), context);
  assert.equal(restored.buildings.spaceRipper, 100);
  assert.equal(restored.buildings.highTechFactory, 2);
  assert.equal(restored.stoppedBuildings.highTechFactory, 1);
  assert.ok(restored.tech.includes('higherDimensionalStorage'));
  // A save claiming 高维存储 without the completed ripper is rejected.
  const bad = clone(s); bad.buildings.spaceRipper = 99;
  assert.throws(() => validateCurrentSave(bad, context));
  const raw = clone(createMilestoneState('beacon')) as unknown as Record<string, unknown>;
  for (const field of ['buildings', 'workers', 'stoppedBuildings']) for (const id of ['spaceRipper', 'highTechFactory']) delete (raw[field] as Record<string, unknown>)[id];
  const migrated = validateCurrentSave(raw, context);
  assert.equal(migrated.buildings.spaceRipper, 0);
  assert.equal(migrated.buildings.highTechFactory, 0);
});
