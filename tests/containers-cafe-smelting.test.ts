/** Moved verbatim out of tests/modules.test.ts during the 2026-10-22 split.
 *  Keep the assertions unchanged: they are the historical regression net. */
import { CONFIG } from '../src/data/config';
import assert from 'node:assert/strict';
import { supplyPower } from './support/power';
import { test } from 'node:test';
import { calculateBuildingOutput, calculateWorkerCapacity } from '../src/simulation/building-production';
import { calculateArtistEffect, calculateMorale } from '../src/simulation/morale';
import { changeWorkerAssignment, changeContainerAssignment } from '../src/simulation/commands';
import { isContainerAssignable, countAssignedContainers, calculateContainerCapacity, calculateAlloyContainerCapacity, calculateAlloyContainerUnitCapacity } from '../src/simulation/containers';
import { createAlloyContainers, changeAlloyContainerAssignment } from '../src/simulation/commands';
import { createMilestoneState } from './fixtures/milestones';
import { validateStorageAssignments } from '../src/state/validation';
import { resetRunState } from '../src/simulation/prestige';
import { chipFactoryOutputMultiplier } from '../src/simulation/chip-factory';
import { BUILDINGS } from '../src/data/buildings';
import { calculateContainerUnitCapacity } from '../src/simulation/containers';
import { calculateBuildingInput } from '../src/simulation/building-production';
import { calculateResourceBreakdown, calculateResourceFactorRows } from '../src/simulation/resource-breakdown';
import { TECHNOLOGIES } from '../src/data/technologies';
import type { TechnologyId } from '../src/types/technologies';
import { validateAndMigrateSave } from '../src/state/validate-save';
import { createInitialState } from '../src/state/create-state';
import { calculateProduction } from '../src/simulation/production';
import { validateEconomyRecords } from '../src/state/validate-economy';

test('超级集装箱 is T8 51.4k; warehouses gain 25 ordinary / 10 alloy slots and hangars 15 alloy slots', () => {
  assert.deepEqual([TECHNOLOGIES.superContainers.tier, TECHNOLOGIES.superContainers.cost, TECHNOLOGIES.superContainers.pre], [8, { knowledge: 51400 }, ['automatedStorage']]);
  const s = createInitialState(CONFIG.version, 60, 0);
  s.buildings.containerWarehouse = 2; s.buildings.hangar = 3;
  assert.equal(calculateContainerCapacity(s), 130);
  assert.equal(calculateAlloyContainerCapacity(s), 0);
  s.tech.push('superContainers');
  assert.equal(calculateContainerCapacity(s), 140);
  assert.equal(calculateAlloyContainerCapacity(s), 65);
  assert.equal(calculateAlloyContainerUnitCapacity(s), 1000);
  for (const tech of ['steelContainers', 'reinforcedContainers', 'iridiumAlloyContainers'] as const) {
    s.tech.push(tech);
    assert.equal(calculateAlloyContainerUnitCapacity(s), 4 * calculateContainerUnitCapacity(s));
  }
  assert.equal(calculateAlloyContainerUnitCapacity(s), 10000);
});

test('alloy containers manufacture for 10 alloy, allocate independently, save and validate strictly', () => {
  const s = createInitialState(CONFIG.version, 60, 0);
  s.buildings.containerWarehouse = 1; s.buildings.factory = 1;
  s.resources.alloy = 35;
  assert.equal(createAlloyContainers(s, 10), 0);
  s.tech.push('superContainers');
  assert.equal(createAlloyContainers(s, 10), 3);
  assert.equal(s.resources.alloy, 5);
  assert.equal(changeAlloyContainerAssignment(s, 'wood', 10), 3);
  assert.equal(s.containerAssignments.wood, 0);
  assert.equal(changeAlloyContainerAssignment(s, 'oil', 1), 0);
  assert.equal(changeAlloyContainerAssignment(s, 'wood', .5), 0);
  const raw = JSON.parse(JSON.stringify(s));
  validateStorageAssignments(raw, s);
  assert.equal(s.alloyContainerAssignments.wood, 3);
  assert.equal(changeAlloyContainerAssignment(s, 'wood', -10), -3);
  assert.equal(s.alloyContainers, 3);
  for (const value of [-1, .5, 11, null]) {
    assert.throws(() => validateStorageAssignments({ ...raw, alloyContainers: value }, s), /合金集装箱/);
  }
  assert.throws(() => validateStorageAssignments({ ...raw, alloyContainerAssignments: null }, s), /合金集装箱/);
  assert.throws(() => validateStorageAssignments({ ...raw, alloyContainerAssignments: { ...raw.alloyContainerAssignments, stone: 1 } }, s), /合金集装箱/);
  delete raw.alloyContainers; delete raw.alloyContainerAssignments;
  assert.throws(() => validateStorageAssignments(raw, s), /合金集装箱/);
});

test('alloy containers survive full JSON validation and clear on run reset', () => {
  const s = createMilestoneState('ground', { extraTech: ['automatedStorage', 'superContainers', 'warehouseUpgrade', 'containerManagement'] });
  s.buildings.containerWarehouse = 1;
  s.alloyContainers = 2; s.alloyContainerAssignments.wood = 2;
  const context = { now: 0, eventInterval: 60, housingCapacity: () => 1000, clampResources: () => {} };
  const raw = JSON.parse(JSON.stringify(s));
  const loaded = validateAndMigrateSave(raw, context);
  assert.equal(loaded.alloyContainers, 2);
  assert.equal(loaded.alloyContainerAssignments.wood, 2);
  const snapshot = JSON.stringify(raw);
  const reset = resetRunState(loaded, 'soft', 60, 1);
  assert.ok(reset);
  assert.equal(reset.next.alloyContainers, 0);
  assert.equal(reset.next.alloyContainerAssignments.wood, 0);
  assert.equal(JSON.stringify(raw), snapshot);
});

test('mithril rejects containers and invalid saved allocations', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.buildings.spaceFactory = 1;
  state.buildings.containerWarehouse = 1;
  state.containers = 5;
  state.resources.mithril = 123;
  assert.equal(isContainerAssignable('mithril', state), false);
  assert.equal(changeContainerAssignment(state, 'mithril', 2), 0);
  assert.equal(state.containerAssignments.mithril, 0);
  const raw = JSON.parse(JSON.stringify(state));
  raw.containerAssignments.mithril = 3;
  assert.throws(() => validateStorageAssignments(raw, state));
  assert.equal(state.containers, 5);
  assert.equal(state.containerAssignments.mithril, 0);
  assert.equal(countAssignedContainers(state), 0);
  assert.equal(state.resources.mithril, 123);
  raw.containerAssignments.mithril = -1;
  assert.throws(() => validateStorageAssignments(raw, state), /集装箱分配/);
});

test('cat cafes provide one artist job each without changing automatic cash output', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  // Isolate the artist mechanics from the default species traits, which also move these numbers.
  state.speciesTraits = { traits: [] };
  state.tech.push('catCafe');
  state.population = 10;
  state.buildings.catCafe = 2;
  assert.equal(calculateWorkerCapacity('catCafe', state), 0);
  assert.equal(calculateWorkerCapacity('theater', state), 2);
  changeWorkerAssignment(state, 'theater', 3);
  assert.equal(state.workers.theater, 2);
  assert.equal(state.workers.catCafe, 0);
  state.buildings.theater = 1;
  changeWorkerAssignment(state, 'theater', 1);
  assert.equal(state.workers.theater, 3);
  const power = { generatorSpeed: 0, generatorEnergy: 0, coalRatio: 0, moonBaseUnits: 0, biologyUnits: 0, dataCenterUnits: 0 };
  const morale = calculateMorale(state, 1, power);
  assert.equal(morale.artistCount, 3);
  assert.equal(morale.artists, 3 * calculateArtistEffect(state));
  assert.equal(calculateBuildingOutput('catCafe', state).cash, 10);
  state.tech.push('theaterUpgrade');
  assert.equal(calculateMorale(state, 1, power).artists, 6);
  changeWorkerAssignment(state, 'theater', -1);
  assert.equal(state.workers.theater, 2);
  assert.equal(state.workers.catCafe, 0);
});

test('retired cafe artist assignments reject rather than merge into the shared pool', () => {
 const state = createInitialState(CONFIG.version, 60, 0);
 state.buildings.catCafe = 2; state.buildings.theater = 1;
 state.workers.theater = 1; state.workers.catCafe = 2;
 const raw = structuredClone(state), before = structuredClone(raw);
 assert.throws(() => validateEconomyRecords(raw as unknown as Record<string, unknown>, createInitialState(CONFIG.version, 60, 0)));
 assert.deepEqual(raw, before);
});

test('smelter base steel is 0.5 and electrochemical steel is 1 before oxygen bonus', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  assert.equal(calculateBuildingOutput('smelter', state).metal, .5);
  state.tech.push('electrochemicalSmelting');
  assert.equal(calculateBuildingOutput('smelter', state).metal, 1);
  state.tech.push('oxygenConverter');
  assert.equal(calculateBuildingOutput('smelter', state).metal, 1.2);
});

test('electrochemical smelting raises steel output without power upkeep even at zero energy', () => {
  for (const dt of [.2, 1]) {
    const state = createInitialState(CONFIG.version, 60, 0);
    state.tech.push('metallurgy', 'electricity'); state.buildings.smelter = 2;
    state.resources.iron = 1000; state.resources.coal = 1000; supplyPower(state, 0);
    const before = calculateProduction(state, dt);
    const recipe = calculateBuildingInput('smelter', state);
    state.tech.push('electrochemicalSmelting');
    const after = calculateProduction(state, dt);
    assert.deepEqual(calculateBuildingInput('smelter', state), recipe);
    assert.equal(calculateBuildingInput('smelter', state).energy, undefined);
    assert.ok(Math.abs(after.rates.metal - 2 * before.rates.metal) < 1e-8);
    assert.equal(after.rates.energy, 0);
    assert.equal(calculateResourceBreakdown('energy', state, after).net, 0);
    assert.equal(after.rates.iron, before.rates.iron);
    assert.equal(after.rates.coal, before.rates.coal);
  }
});

test('原油精炼优化 is a T9 70k tech after 化学沉积工艺 and 石油存储', () => {
  const tech = TECHNOLOGIES.crudeOilRefiningOptimization;
  assert.deepEqual([tech.tier, tech.cost, [...tech.pre].sort()], [9, { knowledge: 70000 }, ['chemicalDeposition', 'oilStorage']]);
});

test('原油精炼优化 raises refinery base oil to 1.5/s and power to 2/s in real settlement', () => {
  for (const dt of [.2, 1]) {
    const state = createInitialState(CONFIG.version, 60, 0);
    state.tech.push('oilTechnology'); state.buildings.refinery = 4;
    supplyPower(state, 1e6);
    assert.deepEqual([calculateBuildingOutput('refinery', state), calculateBuildingInput('refinery', state)], [{ oil: 1 }, { energy: .5 }]);
    const before = calculateProduction(state, dt);
    state.tech.push('crudeOilRefiningOptimization');
    assert.deepEqual([calculateBuildingOutput('refinery', state), calculateBuildingInput('refinery', state)], [{ oil: 1.5 }, { energy: 2 }]);
    const after = calculateProduction(state, dt);
    assert.ok(Math.abs(after.rates.oil - 1.5 * before.rates.oil) < 1e-8, `oil ${after.rates.oil} vs ${before.rates.oil}`);
    assert.ok(Math.abs((before.rates.energy - after.rates.energy) - 4 * 1.5) < 1e-8, 'four refineries draw 1.5 more power each');
    // Power short: only the funded share of refineries runs at the new recipe.
    supplyPower(state, 4);
    const short = calculateProduction(state, dt);
    assert.ok(Math.abs((short.inputUnits.refinery ?? 0) - 2) < 1e-8, `funded ${short.inputUnits.refinery}`);
  }
});

test('芯片工厂 two output techs stack multiplicatively and only touch chip factories', () => {
  // 只比较芯片工厂自身那一行：总现金里还有「猫猫税收」，它不随这两个科技变化，
  // 直接拿总产出做比值会把加成稀释成 1.16 / 1.4，看起来像加成没生效。
  const cafeRate = (techs: TechnologyId[]) => {
    const state = createInitialState(CONFIG.version, 60, 0);
    state.tech.push('catCafe', ...techs);
    state.population = 10;
    state.buildings.catCafe = 4;
    state.buildings.solarSatellite = 20;
    const result = calculateProduction(state, 1);
    const rows = calculateResourceBreakdown('cash', state, result);
    const row = rows.entries.find(entry => entry.name === '芯片工厂产出');
    assert.ok(row, `chip factory row present [${rows.entries.map(e => e.name).join(' / ')}]`);
    return row.value;
  };
  const plain = createInitialState(CONFIG.version, 60, 0);
  assert.equal(chipFactoryOutputMultiplier(plain), 1, 'no bonus before either tech');
  assert.equal(chipFactoryOutputMultiplier({ tech: ['masterpieceCat'] as typeof plain.tech }), 1.2);
  assert.equal(chipFactoryOutputMultiplier({ tech: ['radiationHardenedChip'] as typeof plain.tech }), 1.25);
  // Independent factors multiply: 1.2 x 1.25 = 1.5, NOT an additive 1.45.
  assert.ok(Math.abs(chipFactoryOutputMultiplier({ tech: ['masterpieceCat', 'radiationHardenedChip'] as typeof plain.tech }) - 1.5) < 1e-9);

  const base = cafeRate([]);
  const withMasterpiece = cafeRate(['masterpieceCat']);
  const withRadiation = cafeRate(['radiationHardenedChip']);
  const withBoth = cafeRate(['masterpieceCat', 'radiationHardenedChip']);
  assert.ok(Math.abs(withMasterpiece / base - 1.2) < 1e-9, `多重曝光技术 x1.2 [${withMasterpiece}/${base}]`);
  assert.ok(Math.abs(withRadiation / base - 1.25) < 1e-9, `抗辐射芯片 x1.25 [${withRadiation}/${base}]`);
  assert.ok(Math.abs(withBoth / base - 1.5) < 1e-9, `两者相乘 x1.5 [${withBoth}/${base}]`);
  assert.ok(Math.abs(withBoth / base - 1.45) > 1e-6, 'not an additive 1.45');
});

test('芯片工厂 detail hides the output techs but still multiplies the settled value', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.tech.push('catCafe', 'masterpieceCat', 'radiationHardenedChip');
  state.population = 10;
  state.buildings.catCafe = 2;
  state.buildings.solarSatellite = 20;
  const result = calculateProduction(state, 1);
  // 产量详细信息 (factor rows) must NOT list either tech: they raise the base output directly.
  const factorNames = calculateResourceFactorRows('cash', state, result).rows.map(row => row.name);
  assert.ok(!factorNames.some(name => name.includes('多重曝光技术')), `no 多重曝光技术 row [${factorNames.join(' / ')}]`);
  assert.ok(!factorNames.some(name => name.includes('抗辐射芯片')), `no 抗辐射芯片 row [${factorNames.join(' / ')}]`);
  // The sources list still shows the chip factory itself, so the bonus is not silently lost from the UI.
  const entryNames = calculateResourceBreakdown('cash', state, result).entries.map(entry => entry.name);
  assert.ok(entryNames.some(name => name.includes('芯片工厂')), `chip factory row present [${entryNames.join(' / ')}]`);
});

test('芯片工厂 techs are ordered as requested: ARPA prerequisite and iridium-gated T12', () => {
  assert.deepEqual(TECHNOLOGIES.masterpieceCat.pre, ['arpa']);
  assert.equal(TECHNOLOGIES.masterpieceCat.name, '多重曝光技术');
  assert.equal(TECHNOLOGIES.radiationHardenedChip.tier, 12);
  assert.equal(TECHNOLOGIES.radiationHardenedChip.resourceRequired, 'iridium');
  assert.deepEqual(TECHNOLOGIES.radiationHardenedChip.cost, { knowledge: 150000, iridium: 1000 });
  assert.equal(BUILDINGS.catCafe.name, '芯片工厂');
  assert.equal(BUILDINGS.catCafe.desc, '卖芯片可比卖牙膏赚钱多了');
});
