import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS, BUILDING_CASH_COSTS, BUILDING_COST_SCALES } from '../src/data/buildings';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { MIN_BUILDING_SCALE, calculateBuildingCost, calculateBuildingScale, isBuildingFullyBuilt } from '../src/simulation/costs';
import type { BuildingId } from '../src/types/buildings';
import type { ResourceId } from '../src/types/economy';

test('legacy cash and scale registries cover every building without shared mutable scale recipes', () => {
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    const definition = BUILDINGS[id];
    assert.equal(BUILDING_CASH_COSTS[id], definition.cost.cash, `${id}: cash parity`);
    assert.deepEqual(BUILDING_COST_SCALES[id], definition.costScales, `${id}: scale parity`);
    if (definition.costScales) assert.notEqual(BUILDING_COST_SCALES[id], definition.costScales);
  }
});

test('metal refinery and cement workshop carry their extra creep in the raw registry scale', () => {
  const state = fresh();
  for (const resource of Object.keys(BUILDINGS.metalRefinery.cost) as ResourceId[]) {
    assert.equal(BUILDINGS.metalRefinery.costScales![resource], 1.195);
    assert.equal(calculateBuildingScale('metalRefinery', resource, state), 1.195);
    assert.equal(calculateBuildingCost('metalRefinery', 5, state)[resource], Math.ceil(BUILDINGS.metalRefinery.cost[resource]! * 1.195 ** 5));
  }
});

test('retired battery stations have no registry or cost scale entry', () => {
  assert.equal(Object.hasOwn(BUILDINGS, 'batteryStation'), false);
  assert.equal(Object.hasOwn(BUILDING_COST_SCALES, 'batteryStation'), false);
  assert.equal(Object.hasOwn(BUILDING_CASH_COSTS, 'batteryStation'), false);
});

test('cement workshop carries .045 extra creep (.025 + balance .02) in its registry scale for construction resources', () => {
  const state = fresh();
  for (const resource of ['wood', 'stone', 'cash'] as const) {
    assert.equal(BUILDINGS.cementWorkshop.costScales![resource], 1.215);
    assert.equal(calculateBuildingScale('cementWorkshop', resource, state), 1.215);
    assert.equal(calculateBuildingCost('cementWorkshop', 5, state)[resource], Math.ceil(BUILDINGS.cementWorkshop.cost[resource]! * 1.215 ** 5));
  }
  assert.deepEqual(calculateBuildingCost('cementWorkshop', 0, state), { wood: 100, stone: 80, cash: 35 });
});

const fresh = () => createInitialState(CONFIG.version, 60, 0);
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('base creep equals the registry scale and dynamic terms only come from active effects', () => {
  const state = fresh();
  const rawRegistry = JSON.stringify(BUILDINGS);
  // No global +0.01 and no adjustment table: the registry scale IS the base
  // creep; with no active dynamics the runtime scale equals the registry value.
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    for (const [resource, raw] of Object.entries(BUILDINGS[id].costScales ?? {})) {
      close(calculateBuildingScale(id, resource as ResourceId, state), raw);
    }
  }
  assert.equal(JSON.stringify(BUILDINGS), rawRegistry);
});

test('once-only buildings report fully built while ordinary buildings never do', () => {
  const state = fresh();
  assert.equal(isBuildingFullyBuilt('communityCenter', state), false);
  state.buildings.communityCenter = 1;
  assert.equal(isBuildingFullyBuilt('communityCenter', state), true);
  assert.equal(isBuildingFullyBuilt('aiSupercore', state), false);
  state.buildings.aiSupercore = 99;
  assert.equal(isBuildingFullyBuilt('aiSupercore', state), false);
  state.buildings.aiSupercore = 100;
  assert.equal(isBuildingFullyBuilt('aiSupercore', state), true);
  for (const id of ['nest', 'warehouse', 'factory', 'theater'] as const) {
    state.buildings[id] = 5;
    assert.equal(isBuildingFullyBuilt(id, state), false, id);
  }
});

test('the first purchase retains every raw building cost and the early nest cash exception', () => {
  const state = fresh();
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    const expected = { ...BUILDINGS[id].cost };
    if (id === 'nest') delete expected.cash;
    assert.deepEqual(calculateBuildingCost(id, 0, state), expected, id);
  }
});

test('AI segmented construction keeps fixed costs at every count even with discounts', () => {
  const state = fresh();
  assert.ok(BUILDINGS.aiSupercore.segmentedRequired);
  for (const count of [0, 1, 10, 100, 1000]) {
    assert.deepEqual(calculateBuildingCost('aiSupercore', count, state), BUILDINGS.aiSupercore.cost);
  }
  state.crispr = ['materialEfficiency', 'innovativeMaterials', 'structuralReinforcement', 'physicsLaws', 'halfLife3'];
  state.government = 'industrialism';
  state.tech.push('neutronConstructionMaterials');
  for (const count of [0, 1, 100]) {
    assert.deepEqual(calculateBuildingCost('aiSupercore', count, state), BUILDINGS.aiSupercore.cost);
  }
});

test('ordinary creep never drops below 1.005; segmented and specified scales are exempt', () => {
  assert.equal(MIN_BUILDING_SCALE, 1.005);
  const state = fresh();
  state.crispr = ['materialEfficiency', 'innovativeMaterials', 'structuralReinforcement', 'physicsLaws', 'halfLife3'];
  state.tech.push('steelBuildingMaterials', 'neutronConstructionMaterials');
  // Temporarily lower 猫窝's registry scale so the -0.07 dynamics would push it under the floor.
  const original = BUILDINGS.nest.costScales!.wood!;
  try {
    BUILDINGS.nest.costScales!.wood = 1.06;
    assert.equal(calculateBuildingScale('nest', 'wood', state), MIN_BUILDING_SCALE);
    assert.equal(calculateBuildingCost('nest', 10, state).wood, Math.ceil(BUILDINGS.nest.cost.wood! * 1.005 ** 10));
    BUILDINGS.nest.costScales!.wood = 1.1;
    close(calculateBuildingScale('nest', 'wood', state), 1.03);
  } finally {
    BUILDINGS.nest.costScales!.wood = original;
  }
  // Exemptions keep their own creep of exactly 1.
  assert.equal(calculateBuildingScale('aiSupercore', 'cash', state), 1);
  assert.equal(calculateBuildingScale('spaceRipper', 'cash', state), 1);
  assert.equal(calculateBuildingScale('interstellarDock', 'cash', state), 1);
  // Every ordinary registry scale sits at or above the floor.
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    if (BUILDINGS[id].segmentedRequired || id === 'interstellarDock' || id === 'downloadExecutable') continue;
    for (const raw of Object.values(BUILDINGS[id].costScales ?? {})) assert.ok(raw >= MIN_BUILDING_SCALE, id);
  }
});

test('cost creep precedes additive CRISPR, industrialism and neutron material discounts', () => {
  const state = fresh();
  state.crispr = ['materialEfficiency', 'innovativeMaterials', 'structuralReinforcement', 'physicsLaws', 'halfLife3'];
  state.government = 'industrialism';
  state.tech.push('neutronConstructionMaterials');
  // Factory base 1.19, dynamics: CRISPR -.05 + industrialism -.005 => 1.135.
  close(calculateBuildingScale('factory', 'cash', state), 1.135);
  assert.equal(calculateBuildingCost('factory', 5, state).cash, Math.ceil(BUILDINGS.factory.cost.cash! * 1.135 ** 5));
  // Nest base 1.17, dynamics: CRISPR -.05 + neutron material -.01 => 1.11.
  for (const id of ['nest', 'nestMKII'] as const) {
    for (const [resource, raw] of Object.entries(BUILDINGS[id].costScales!)) {
      const scale = raw - .05 - .01;
      close(calculateBuildingScale(id, resource as ResourceId, state), scale);
      assert.equal(calculateBuildingCost(id, 5, state)[resource as ResourceId], Math.ceil(BUILDINGS[id].cost[resource as ResourceId]! * scale ** 5));
    }
  }
});

test('balance pass: 17 ground buildings carry +0.02 base creep in both registries', () => {
  const raised: Partial<Record<BuildingId, number>> = {
    school: 1.19, library: 1.19, lab: 1.19, observatory: 1.19, biologyLab: 1.19, trainingCamp: 1.19,
    cementWorkshop: 1.215, smelter: 1.19, foundry: 1.19, refinery: 1.19, factory: 1.19, generator: 1.19,
    theater: 1.19, broadcast: 1.19, bank: 1.27, oilGenerator: 1.19, fissionGenerator: 1.19,
  };
  for (const [id, scale] of Object.entries(raised) as [BuildingId, number][]) {
    for (const [resource, raw] of Object.entries(BUILDINGS[id].costScales!)) {
      // 实验室 knowledge kept its own lower creep (1.15 → 1.17).
      close(raw, id === 'lab' && resource === 'knowledge' ? 1.17 : scale);
      assert.equal(BUILDING_COST_SCALES[id]![resource as ResourceId], raw, `${id}/${resource}`);
    }
  }
});

test('balance pass: 农场 +0.03, 伐木场/采石场/采矿场/煤矿/住宅楼 +0.01 base creep in both registries', () => {
  const raised: Partial<Record<BuildingId, number>> = { forage: 1.2, lumber: 1.18, quarry: 1.18, mine: 1.18, coalMine: 1.18, apartment: 1.18 };
  for (const [id, scale] of Object.entries(raised) as [BuildingId, number][]) {
    for (const [resource, raw] of Object.entries(BUILDINGS[id].costScales!)) {
      close(raw, scale);
      assert.equal(BUILDING_COST_SCALES[id]![resource as ResourceId], raw, `${id}/${resource}`);
    }
  }
});
