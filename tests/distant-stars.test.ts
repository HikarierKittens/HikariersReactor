import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { BUILDINGS } from '../src/data/buildings';
import { TECHNOLOGIES } from '../src/data/technologies';
import { RESOURCES, CRAFT_RECIPES, FACTORY_OPTIONS } from '../src/data/resources';
import { createInitialState } from '../src/state/create-state';
import { validateCurrentSave } from '../src/state/validate-save';
import { calculateProduction } from '../src/simulation/production';
import { calculateResourceBreakdown, calculateResourceFactorRows } from '../src/simulation/resource-breakdown';
import { calculateStorageDetails, calculateStorageTotals } from '../src/simulation/storage';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateBuildingOutput, calculateWorkerCapacity } from '../src/simulation/building-production';
import { calculateCraftingMultiplier } from '../src/simulation/crafting';
import { calculateTrainingDuration } from '../src/simulation/government';
import { calculateSmelterSlotCapacity, countSteelSmelterSlots } from '../src/simulation/factory';
import { changeSmelterAssignment } from '../src/simulation/commands';
import { applyResearchSideEffects, OVERCLOCKING13_LOG } from '../src/simulation/purchases';
import { isBuildingUnlocked, isResourceUnlocked, isTechnologyUnlocked } from '../src/simulation/unlocks';
import { isContainerAssignable } from '../src/simulation/containers';
import { calculateBuildingScale } from '../src/simulation/costs';
import { countRunningBuildings } from '../src/simulation/housing';
import { calculateRegionalMissionCost } from '../src/simulation/space-missions';
import { getBuildingEffectRows } from '../src/simulation/building-effects';
import { calculateBuildingInput } from '../src/simulation/building-production';
import { supplyPower } from './support/power';
import type { ResourceId } from '../src/types/economy';
import type { TechnologyId } from '../src/types/technologies';

const fresh = () => createInitialState(CONFIG.version, 60, 0);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const near = (a: number, b: number, label = '') => assert.ok(Math.abs(a - b) < 1e-7, `${label} ${a} != ${b}`);
const ctx = { now: 0, eventInterval: 60, housingCapacity: () => 1e6, clampResources: () => {} };
const snap = (s: ReturnType<typeof fresh>) => { const p = calculateSupportPreview(s); return { ...p, moonBaseUnits: p.moon.baseUnits }; };

test('distant-star technology chain matches the requested prerequisites and prices', () => {
  const expect: [TechnologyId, TechnologyId[], number, number][] = [
    ['overclocking13', ['ripperOverclock'], 20, 1500000], ['superMetal', ['overclocking13'], 20, 1500000],
    ['grapheneProcessing', ['superMetal'], 20, 1500000], ['nanoAlloy', ['grapheneProcessing', 'superMetal'], 20, 1550000],
    ['virtualReality', ['nanoAlloy'], 20, 1600000], ['virtualTraining', ['virtualReality'], 20, 1600000],
    ['virtualEntertainment', ['virtualReality', 'aerogel'], 20, 1650000], ['aerogel', ['nanoAlloy', 'grapheneProcessing'], 20, 1600000],
    ['plasmaResearch', ['virtualReality', 'nanoAlloy'], 20, 1500000], ['plasmaMining', ['plasmaResearch'], 20, 1500000],
    ['energyShield', ['nanoAlloy', 'plasmaResearch', 'aerogel'], 21, 1750000], ['stellarForge', ['energyShield'], 21, 1800000],
    ['penroseTheory', ['energyShield'], 21, 2000000],
  ];
  for (const [id, pre, tier, knowledge] of expect) {
    assert.deepEqual([...TECHNOLOGIES[id].pre].sort(), [...pre].sort(), id);
    assert.equal(TECHNOLOGIES[id].tier, tier, id);
    assert.equal(TECHNOLOGIES[id].cost.knowledge, knowledge, id);
  }
  assert.equal(TECHNOLOGIES.virtualReality.cost.nanoAlloy, 2500);
  assert.deepEqual(TECHNOLOGIES.plasmaResearch.cost, { knowledge: 1500000, graphene: 5000, nanoAlloy: 2000 });
  assert.deepEqual(TECHNOLOGIES.plasmaMining.cost, { knowledge: 1500000, graphene: 10000, nanoAlloy: 5000 });
  assert.deepEqual(TECHNOLOGIES.energyShield.cost, { knowledge: 1750000, nanoAlloy: 10000, aerogel: 10000 });
  assert.deepEqual(TECHNOLOGIES.penroseTheory.cost, { knowledge: 2000000, nanoAlloy: 10000, aerogel: 10000, e710: 2500 });
  assert.equal(TECHNOLOGIES.overclocking13.desc!.includes('极限超频吗，有意思'), true);
  assert.equal(TECHNOLOGIES.stellarForge.spaceMissionRequired, 'neutronStar');
  assert.equal(TECHNOLOGIES.penroseTheory.spaceMissionRequired, 'blackHole');
});

test('OC-13 needs the full ripper, logs the black hole once, and renames nothing in saves', () => {
  const s = fresh(); s.tech.push('ripperOverclock'); s.buildings.spaceRipperSegments = 99;
  assert.equal(isTechnologyUnlocked('overclocking13', s), false);
  s.buildings.spaceRipperSegments = 0; s.buildings.spaceRipper = 1;
  const before = [...s.tech]; s.tech.push('overclocking13');
  applyResearchSideEffects(s, 'overclocking13', before);
  applyResearchSideEffects(s, 'overclocking13', [...s.tech]);
  assert.equal(s.logs.filter(entry => entry.text === OVERCLOCKING13_LOG).length, 1);
});

test('new buildings have the requested creep tiers and region upkeep without support', () => {
  const scales: [keyof typeof BUILDINGS, number][] = [['adamantiteMiningShip', 1.27], ['adamantiteProcessor', 1.26], ['grapheneFactory', 1.25], ['vrCenter', 1.275], ['stellarForge', 1.275], ['blackHoleStation', 1.3]];
  for (const [id, scale] of scales) for (const value of Object.values(BUILDINGS[id].costScales || {})) near(value, scale, id);
  for (const id of ['adamantiteMiningShip', 'adamantiteProcessor', 'grapheneFactory', 'stellarForge', 'blackHoleStation', 'penroseSphere'] as const) {
    assert.equal(BUILDINGS[id].support, undefined, id);
    for (const [resource, scale] of Object.entries(BUILDINGS[id].costScales || {})) if (!BUILDINGS[id].segmentedRequired) near(scale, calculateBuildingScale(id, resource as ResourceId, fresh()), id);
  }
  assert.ok(BUILDINGS.grapheneFactory.cost.adamantite! > 0);
  assert.ok(BUILDINGS.stellarForge.cost.nanoAlloy! > 0 && BUILDINGS.stellarForge.cost.mithril! > 0);
  assert.deepEqual(BUILDINGS.vrCenter.cost, { cash: 500000, nanoAlloy: 10000, aerogel: 2500 });
  assert.deepEqual(BUILDINGS.blackHoleStation.cost, { cash: 1000000, knowledge: 100000, neutron: 2500, adamantite: 500, e710: 100 });
  assert.deepEqual(BUILDINGS.penroseSphereSegments.cost, { cash: 2000000, neutron: 400, adamantite: 15000, graphene: 20000, nanoAlloy: 5000, mithril: 500 });
  assert.deepEqual(BUILDINGS.penroseSphere.cost, {});
  assert.equal(BUILDINGS.hyperspaceSpaceport.desc!.includes('+25%'), false);
});

test('new resources: zero base caps, containers, anchor storage and unlock rules', () => {
  const s = fresh();
  for (const id of ['graphene', 'nanoAlloy', 'adamantite'] as ResourceId[]) assert.equal(RESOURCES[id].cap, 0);
  assert.equal(RESOURCES.aerogel.crafted, true);
  assert.deepEqual(CRAFT_RECIPES.aerogel, { input: { graphene: 10, nanoAlloy: 5 }, rate: .05 });
  assert.deepEqual(FACTORY_OPTIONS.find(option => option.id === 'nanoAlloy')!.input, { graphene: 5, adamantite: 2 });
  assert.equal(isResourceUnlocked('adamantite', s), false);
  s.buildings.adamantiteMiningShip = 1; assert.equal(isResourceUnlocked('adamantite', s), true);
  s.tech.push('containerManagement', 'grapheneProcessing', 'nanoAlloy');
  for (const id of ['graphene', 'nanoAlloy', 'adamantite']) assert.equal(isContainerAssignable(id, s), true, id);
  assert.equal(isContainerAssignable('aerogel', s), false);
  s.tech.push('fieldConstraintTheory');
  s.buildings.constraintArray = 2; s.buildings.anchorFreightStation = 1; Object.assign(s.resources, { e710: 1, helium3: 1e4 });
  supplyPower(s, 200);
  const totals = calculateStorageTotals(s, snap(s));
  for (const id of ['graphene', 'nanoAlloy', 'adamantite'] as ResourceId[]) {
    near(calculateStorageDetails(id, s, snap(s)).rows.find(row => row.name.includes('锚点货运站'))!.value, 32000, id);
    near(totals[id], calculateStorageDetails(id, s, snap(s)).total, id);
  }
});

function alpha() {
  const s = fresh(); s.tech.push('superMetal', 'grapheneProcessing');
  Object.assign(s.resources, { helium3: 1000, deuterium: 1000, oil: 1000 });
  supplyPower(s, 1000);
  return s;
}
test('alpha-sector miners and graphene settle like hyperspace sources with breakdown parity', () => {
  for (const dt of [.2, 1]) {
    const s = alpha(); s.buildings.adamantiteMiningShip = 2; s.buildings.grapheneFactory = 1; s.buildings.adamantiteProcessor = 3;
    const before = clone(s), p = calculateProduction(s, dt); assert.deepEqual(s, before);
    // 精金精炼站 grants +10% per funded station (beta 0.9.28, was 20%): 2 miners × 1.3.
    near(p.rates.adamantite, .5 * 1.3); near(p.rates.graphene, 1.5);
    // Each refinery now burns 5 电力/s instead of 10: 3 funded = 15, plus the graphene
    // factory (5) and the two miners' own 5 each = 30 in total.
    near(p.power.generated, 1000); near(p.power.used, 30); near(p.power.available, 970);
    near(p.rates.energy, 970, 'energy');
    near(p.rates.helium3, -10); near(p.rates.deuterium, -2); near(p.rates.oil, -15);
    for (const id of ['adamantite', 'graphene', 'energy', 'helium3', 'deuterium', 'oil'] as ResourceId[]) near(calculateResourceBreakdown(id, s, p).net, p.rates[id], id);
    const rows = calculateResourceFactorRows('adamantite', s, p).rows;
    assert.ok(rows.some(row => row.name === '精金精炼站' && row.child), 'processor row under the miner');
  }
  const short = alpha(); short.buildings.adamantiteMiningShip = 1; short.resources.deuterium = .5;
  near(calculateProduction(short, 1).rates.adamantite, .125);
});

test('stellar forge generates 25 energy/s while keeping its passive forge effects', () => {
  const s = fresh(); s.buildings.stellarForge = 2;
  for (const dt of [.2, 1]) {
    const p = calculateProduction(s, dt);
    near(p.rates.energy, 50);
    near(calculateResourceBreakdown('energy', s, p).net, 50);
  }
  assert.equal(calculateSmelterSlotCapacity(s), 4);
});

test('adamantite refinery bonuses require whole funded running stations with breakdown parity', () => {
  assert.equal(BUILDINGS.adamantiteMiningShip.output!.adamantite, .25);
  assert.equal(BUILDINGS.adamantiteProcessor.name, '精金精炼站');
  // beta 0.9.28: each funded station gives +10% (was 20%) and burns 5 电力/s (was 10).
  assert.equal(calculateBuildingInput('adamantiteProcessor', fresh()).energy, 5);
  for (const dt of [.2, 1]) {
    // `requested` counts every enabled unit, funded or not: available is generated minus requested.
    // Each unit of `used` is 5 电力 (refineries) plus the miner's own 5 电力 upkeep.
    // `requested` = 5 × enabled processors + 5 for the miner, funded or not.
    for (const [stopped, energy, funded, rate, upkeep, requested] of [
      [0, 25, 2, .3, -15, 15],
      [1, 25, 1, .275, -10, 10],
      [2, 25, 0, .25, -5, 5],
      [0, 9, 0, .25, -5, 15], // Below two refineries' upkeep: no bonus, but the miner still runs.
      [0, 4, 0, 0, 0, 15], // Below even the miner's upkeep: nothing runs at all.
    ] as const) {
      const s = alpha(); s.buildings.adamantiteMiningShip = 1; s.buildings.adamantiteProcessor = 2;
      s.stoppedBuildings.adamantiteProcessor = stopped!; supplyPower(s, energy!);
      const p = calculateProduction(s, dt);
      near(p.inputUnits.adamantiteProcessor!, funded!);
      near(p.power.generated, energy!); near(p.power.used, -upkeep!); near(p.power.available, energy! - requested!);
      near(p.rates.adamantite, rate!); near(p.rates.energy, energy! - requested!, 'energy');
      near(calculateResourceBreakdown('adamantite', s, p).net, p.rates.adamantite, 'adamantite');
      // Energy rows mirror the settled flow (generated − used). rates.energy is the
      // headroom metric (generated − requested); the two only coincide when every
      // enabled load is funded, which is exactly the case this test pins down.
      near(calculateResourceBreakdown('energy', s, p).net, p.power.generated - p.power.used, 'energy');
    }
  }
});

test('star-ring bonus applies to distant ordinary resources while the old port bonus is gone', () => {
  const s = alpha(); s.buildings.grapheneFactory = 1; s.buildings.hyperspaceSpaceport = 1;

  const plain = calculateProduction(s, 1).rates.graphene; near(plain, 1.5);
  s.asrielMissionCompleted = true; s.tech.push('planetaryExploration');
  s.buildings.asrielSpaceport = 1; s.buildings.asrielResidence = 4; s.buildings.starRingStation = 2; s.population = 10; s.workers.asrielResidence = 4;
  Object.assign(s.resources, { helium3: 1e4, food: 1e4 });
  const p = calculateProduction(s, 1);
  const noRing = clone(s); noRing.buildings.starRingStation = 0;
  // 0.25% base per resident: 2 stations × 4 residents.
  near(p.rates.graphene, calculateProduction(noRing, 1).rates.graphene * (1 + .0025 * 2 * 4), 'star ring boosts graphene');
  near(calculateResourceBreakdown('graphene', s, p).net, p.rates.graphene);
});

test('nano-alloy factory line and aerogel craft follow the shared factory and artisan pipelines', () => {
  const s = fresh(); s.tech.push('superMetal', 'grapheneProcessing', 'nanoAlloy', 'aerogel');
  s.buildings.adamantiteMiningShip = 1; s.buildings.factory = 2; s.lines.nanoAlloy = 2; s.buildings.foundry = 1; s.workers.foundry = 2; s.craftWorkers.aerogel = 1;
  Object.assign(s.resources, { graphene: 1000, adamantite: 1000, nanoAlloy: 1000 });
  supplyPower(s, 1000);
  const p = calculateProduction(s, 1);
  assert.equal(p.inputUnits.nanoAlloy, 2);
  near(calculateResourceBreakdown('nanoAlloy', s, p).net, p.rates.nanoAlloy);
  near(calculateResourceBreakdown('graphene', s, p).net, p.rates.graphene);
  near(p.outputs['craft:aerogel'] || 0, .05 * calculateCraftingMultiplier('aerogel', s));
});

test('smelter slots keep legacy steel output, auto-assign steel and gain forge slots', () => {
  const s = fresh(); s.tech.push('metallurgy'); s.buildings.smelter = 3;
  Object.assign(s.resources, { iron: 1000, coal: 1000 });
  const legacy = calculateBuildingOutput('smelter', s).metal!;
  near(calculateProduction(s, 1).rates.metal, 3 * legacy);
  assert.equal(countSteelSmelterSlots(s), 3);
  assert.equal(changeSmelterAssignment(s, -2), -2); assert.equal(s.smelterIdle, 2);
  near(calculateProduction(s, 1).rates.metal, legacy);
  assert.equal(changeSmelterAssignment(s, -5), -1); assert.equal(changeSmelterAssignment(s, 9), 3);
  s.buildings.stellarForge = 1; assert.equal(calculateSmelterSlotCapacity(s), 5); assert.equal(countSteelSmelterSlots(s), 5);
  const p = calculateProduction(s, 1); near(p.rates.metal, 5 * legacy); near(calculateResourceBreakdown('metal', s, p).net, p.rates.metal);
  s.stoppedBuildings.smelter = 1; near(calculateProduction(s, 1).rates.metal, 4 * legacy);
  assert.equal(calculateWorkerCapacity('foundry', { ...s, buildings: { ...s.buildings, foundry: 1 } }), (BUILDINGS.foundry.slots ?? 1) + 2);
  const plain = fresh(); near(calculateCraftingMultiplier('plank', s) / calculateCraftingMultiplier('plank', plain), 1.1);
});

test('VR, virtual training, black-hole station and Penrose effects', () => {
  const s = fresh(); s.tech.push('planetaryExploration', 'virtualEntertainment'); s.asrielMissionCompleted = true;
  s.buildings.asrielSpaceport = 1; s.buildings.vrCenter = 1; s.buildings.theater = 10;
  Object.assign(s.resources, { helium3: 100, food: 1000 }); s.population = 10;
  supplyPower(s, 100);
  const base = fresh(); base.buildings.theater = 10; base.population = 10; base.resources.food = 1000;
  near(calculateProduction(s, 1).morale.vr, 2.5);
  s.stoppedBuildings.vrCenter = 1; near(calculateProduction(s, 1).morale.vr, 0);
  const t = fresh(); t.buildings.trainingCamp = 5; const slow = calculateTrainingDuration(t);
  t.tech.push('virtualTraining'); near(calculateTrainingDuration(t), 30 / 2 ** (5 * 8 / 100)); assert.ok(calculateTrainingDuration(t) < slow);
  const k = fresh(); k.buildings.spaceRipper = 1; k.buildings.library = 10;
  const without = calculateStorageDetails('knowledge', k, snap(k)).total;
  k.buildings.blackHoleStation = 2; supplyPower(k, 1000);
  const sub = without / 1.2;
  near(calculateStorageDetails('knowledge', k, snap(k)).total, sub * 1.22);
  near(calculateStorageTotals(k, snap(k)).knowledge, sub * 1.22);
  const pen = fresh(); pen.buildings.penroseSphereSegments = 7;
  assert.equal(countRunningBuildings('penroseSphereSegments', pen), 7);
  near(calculateProduction(pen, 1).rates.energy, 35);
});

test('plasma mining upgrades the asteroid miners', () => {
  const s = fresh(); s.tech.push('plasmaMining', 'asteroidMiningOptimization');
  near(calculateBuildingOutput('iridiumMiningShip', s).iridium!, .15);
  near(calculateBuildingOutput('ironMiningShip', s).iron!, 4);
  near(calculateBuildingOutput('e710MiningShip', s).e710!, .012);
});

test('new regions gate buildings behind missions and missing save records reject without backfill', () => {
  const s = fresh(); s.tech.push('energyShield', 'stellarForge', 'penroseTheory');
  assert.equal(isBuildingUnlocked('stellarForge', s), false); assert.equal(isBuildingUnlocked('blackHoleStation', s), false);
  s.neutronStarMissionCompleted = true; assert.equal(isBuildingUnlocked('stellarForge', s), true);
  s.blackHoleMissionCompleted = true; assert.equal(isBuildingUnlocked('penroseSphere', s), true);
  const old = clone(fresh()) as unknown as Record<string, any>;
  old.tech.push('metallurgy'); old.buildings.smelter = 4;
  delete old.smelterIdle; delete old.neutronStarMissionCompleted; delete old.blackHoleMissionCompleted; delete old.lines.nanoAlloy; delete old.craftWorkers.aerogel;
  for (const id of ['graphene', 'nanoAlloy', 'adamantite', 'aerogel']) { delete old.resources[id]; delete old.containerAssignments[id]; }
  for (const field of ['buildings', 'workers', 'stoppedBuildings']) for (const id of ['adamantiteMiningShip', 'vrCenter', 'penroseSphere']) delete old[field][id];
  const before = clone(old); assert.throws(() => validateCurrentSave(old, ctx)); assert.deepEqual(old, before);
  assert.throws(() => validateCurrentSave({ ...fresh(), smelterIdle: 5 }, ctx));
  assert.throws(() => validateCurrentSave({ ...fresh(), smelterIdle: 1.5 }, ctx));
  const bad = clone(fresh()) as unknown as Record<string, any>; bad.buildings.stellarForge = 1; bad.tech.push('stellarForge');
  assert.throws(() => validateCurrentSave(bad, ctx));
});
test('电磁发射器 fuel discount covers only ground and space regions, never hyperspace or 遥远星际', () => {
  const mk = (waystations: number) => {
    const s = createInitialState(CONFIG.version, 60, 0);
    s.tech = Object.keys(TECHNOLOGIES) as TechnologyId[];
    for (const key of Object.keys(s.resources) as ResourceId[]) s.resources[key] = 1e7;
    supplyPower(s, 1e7);
    s.asrielMissionCompleted = true;
    Object.assign(s.buildings, { asrielSpaceport: 1, spaceWaystation: waystations, constraintArray: 2, hyperspaceSpaceport: 1, iceMiningShip: 1, comprehensiveMiningFacility: 1, adamantiteMiningShip: 1, grapheneFactory: 1 });
    return s;
  };
  const off = mk(0), on = mk(4), factor = .95 ** 4;
  // Space-region upkeep, build costs and missions still receive the discount.
  near(calculateBuildingInput('asrielSpaceport', on).helium3!, 2 * factor);
  near(calculateRegionalMissionCost(on, 'misen').helium3!, 30000 * factor);
  // 遥远星际 missions pay full helium-3.
  assert.deepEqual(calculateRegionalMissionCost(on, 'neutronStar'), { helium3: 100000, deuterium: 50000 });
  assert.deepEqual(calculateRegionalMissionCost(on, 'blackHole'), { helium3: 150000, deuterium: 75000 });
  // Hyperspace and 遥远星际 upkeep keeps registry values in settlement and the breakdown.
  for (const id of ['hyperspaceSpaceport', 'iceMiningShip', 'comprehensiveMiningFacility', 'adamantiteMiningShip', 'grapheneFactory'] as const) {
    assert.deepEqual(calculateBuildingInput(id, on), calculateBuildingInput(id, off));
    for (const resource of ['helium3', 'oil'] as const) {
      const value = (s: ReturnType<typeof mk>) => calculateResourceBreakdown(resource, s, calculateProduction(s, 1)).entries.find(entry => entry.id === id && entry.kind === 'expense')?.value || 0;
      near(value(on), -(BUILDINGS[id].input?.[resource] || 0), `${id} ${resource}`);
    }
  }
});
test('完整空间撕裂者 energy row has no fake 原料供应 and its knowledge row follows 黑洞星际站', () => {
  const s = createInitialState(CONFIG.version, 60, 0);
  s.tech.push('dimensionPioneer'); s.buildings.spaceRipper = 1; supplyPower(s, 0);
  const rows = calculateResourceFactorRows('energy', s, calculateProduction(s, 1)).rows;
  assert.ok(rows.some(row => row.name === '空间撕裂者' && row.value === '+100/s'));
  assert.equal(rows.some(row => row.name === '原料供应'), false);
  assert.equal(getBuildingEffectRows('spaceRipper', s, {})[0]!.value, '+20%');
  assert.equal(getBuildingEffectRows('spaceRipper', s, { blackHoleStations: 3 })[0]!.value, '+23%');
  // The tooltip snapshot uses the same funded count as the storage totals.
  s.tech.push('energyShield'); s.blackHoleMissionCompleted = true; s.buildings.blackHoleStation = 3; supplyPower(s, 1000);
  const snapshot = calculateSupportPreview(s);
  assert.equal(snapshot.blackHoleStationUnits, 3);
  assert.equal(getBuildingEffectRows('spaceRipper', s, { blackHoleStations: snapshot.blackHoleStationUnits })[0]!.value, '+23%');
});
