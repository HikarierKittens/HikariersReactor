import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS, BUILDING_COST_SCALES } from '../src/data/buildings';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { MIN_BUILDING_SCALE, calculateBuildingCost, calculateBuildingScale, isBuildingFullyBuilt } from '../src/simulation/costs';
import type { BuildingId } from '../src/types/buildings';
import type { ResourceId } from '../src/types/economy';

test('metal refinery and cement workshop carry their extra creep in the raw registry scale', () => {
  const state = fresh();
  for (const resource of Object.keys(BUILDINGS.metalRefinery.cost) as ResourceId[]) {
    assert.equal(BUILDINGS.metalRefinery.costScales![resource], 1.195);
    assert.equal(calculateBuildingScale('metalRefinery', resource, state), 1.195);
    assert.equal(calculateBuildingCost('metalRefinery', 5, state)[resource], Math.ceil(BUILDINGS.metalRefinery.cost[resource]! * 1.195 ** 5));
  }
});

test('refinery creep does not spill into battery stations and both scale registries agree', () => {
  const state = fresh();
  for (const resource of ['stone', 'iron', 'metal', 'cash'] as const) {
    assert.equal(BUILDINGS.batteryStation.costScales![resource], 1.17);
    assert.equal(calculateBuildingScale('batteryStation', resource, state), 1.17);
    assert.equal(BUILDING_COST_SCALES.batteryStation![resource], BUILDINGS.batteryStation.costScales![resource]);
    assert.equal(BUILDING_COST_SCALES.metalRefinery![resource], BUILDINGS.metalRefinery.costScales![resource]);
  }
});

test('cement workshop carries .025 extra creep in its registry scale for construction resources', () => {
  const state = fresh();
  for (const resource of ['wood', 'stone', 'cash'] as const) {
    assert.equal(BUILDINGS.cementWorkshop.costScales![resource], 1.195);
    assert.equal(calculateBuildingScale('cementWorkshop', resource, state), 1.195);
    assert.equal(calculateBuildingCost('cementWorkshop', 5, state)[resource], Math.ceil(BUILDINGS.cementWorkshop.cost[resource]! * 1.195 ** 5));
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
    if (BUILDINGS[id].segmentedRequired || id === 'interstellarDock') continue;
    for (const raw of Object.values(BUILDINGS[id].costScales ?? {})) assert.ok(raw >= MIN_BUILDING_SCALE, id);
  }
});

test('cost creep precedes additive CRISPR, industrialism and neutron material discounts', () => {
  const state = fresh();
  state.crispr = ['materialEfficiency', 'innovativeMaterials', 'structuralReinforcement', 'physicsLaws', 'halfLife3'];
  state.government = 'industrialism';
  state.tech.push('neutronConstructionMaterials');
  // Factory base 1.17, dynamics: CRISPR -.05 + industrialism -.005 => 1.115.
  close(calculateBuildingScale('factory', 'cash', state), 1.115);
  assert.equal(calculateBuildingCost('factory', 5, state).cash, Math.ceil(BUILDINGS.factory.cost.cash! * 1.115 ** 5));
  // Nest base 1.17, dynamics: CRISPR -.05 + neutron material -.01 => 1.11.
  for (const id of ['nest', 'nestMKII'] as const) {
    for (const [resource, raw] of Object.entries(BUILDINGS[id].costScales!)) {
      const scale = raw - .05 - .01;
      close(calculateBuildingScale(id, resource as ResourceId, state), scale);
      assert.equal(calculateBuildingCost(id, 5, state)[resource as ResourceId], Math.ceil(BUILDINGS[id].cost[resource as ResourceId]! * scale ** 5));
    }
  }
});

