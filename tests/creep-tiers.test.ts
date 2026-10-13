import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { calculateBuildingCost, calculateBuildingScale, calculateDynamicCreep, isBuildingFullyBuilt, type DynamicCreepTerm } from '../src/simulation/costs';
import type { BuildingId } from '../src/types/buildings';
import type { ResourceId } from '../src/types/economy';

const fresh = () => createInitialState(CONFIG.version, 60, 0);
const sum = (terms: DynamicCreepTerm[]) => Number(terms.reduce((total, term) => total + term.value, 0).toFixed(12));

test('base creep is exactly the registry scale; dynamic terms default to empty', () => {
  const state = fresh();
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    if (BUILDINGS[id].segmentedRequired) continue;
    for (const [resource, raw] of Object.entries(BUILDINGS[id].costScales ?? {})) {
      assert.equal(calculateBuildingScale(id, resource as ResourceId, state), raw, `${id}/${resource}`);
      assert.deepEqual(calculateDynamicCreep(id, resource as ResourceId, state), [], `${id}/${resource} no dynamics`);
    }
  }
});

test('dynamic terms stack additively: CRISPR + government + tech each listed once', () => {
  const state = fresh();
  state.crispr = ['materialEfficiency', 'innovativeMaterials', 'structuralReinforcement', 'physicsLaws', 'halfLife3'];
  state.government = 'industrialism';
  state.tech.push('neutronConstructionMaterials');
  // Nest: CRISPR -.05 + neutron material -.01 => base 1.17 - .06 = 1.11.
  const nestTerms = calculateDynamicCreep('nest', 'wood', state);
  assert.equal(nestTerms.length, 2);
  assert.equal(sum(nestTerms), -.06);
  assert.equal(calculateBuildingScale('nest', 'wood', state), 1.11);
  // Factory: CRISPR -.05 + industrialism -.005 on base 1.17 => 1.115.
  const factoryTerms = calculateDynamicCreep('factory', 'cash', state);
  assert.equal(factoryTerms.length, 2);
  assert.equal(sum(factoryTerms), -.055);
  assert.equal(calculateBuildingScale('factory', 'cash', state), 1.115);
  // Warehouse: only CRISPR -.05 on base 1.25 => 1.20.
  assert.deepEqual(calculateDynamicCreep('warehouse', 'wood', state).map(t => t.value), [-.05]);
  assert.equal(calculateBuildingScale('warehouse', 'wood', state), 1.2);
});

test('dynamic creep cannot push the scale below 1 so prices always rise', () => {
  const state = fresh();
  state.crispr = ['materialEfficiency', 'innovativeMaterials', 'structuralReinforcement', 'physicsLaws', 'halfLife3'];
  // aiSupercore base 1: 1 -.05 floored at 1.
  assert.equal(calculateBuildingScale('aiSupercore', 'cash', state), 1);
});

test('different resources of one building may use different base creeps', () => {
  const state = fresh();
  const scales = BUILDINGS.anchorFreightStation.costScales!;
  assert.equal(scales.cash, 1.2);
  assert.equal(scales.e710, 1.2);
  // signalRepeater intentionally uses a different scale set (1.21) than the freight station (1.2).
  const repeater = BUILDINGS.signalRepeater.costScales!;
  assert.equal(repeater.cash, 1.21);
  assert.equal(calculateBuildingScale('signalRepeater', 'copper', state), 1.21);
  assert.equal(calculateBuildingScale('anchorFreightStation', 'iridium', state), 1.2);
});

test('prices compound from base + dynamic and the first purchase stays at raw cost', () => {
  const state = fresh();
  // Theater base 1.17 (registry), no dynamics.
  assert.equal(calculateBuildingCost('theater', 4, state).wood, Math.ceil(60 * 1.17 ** 4));
  // Warehouse fixed 1.25.
  assert.equal(calculateBuildingCost('warehouse', 4, state).wood, Math.ceil(80 * 1.25 ** 4));
  // Granary base 1.25.
  assert.equal(calculateBuildingCost('granary', 2, state).wood, Math.ceil(100 * 1.25 ** 2));
  const expected = { ...BUILDINGS.granary.cost };
  assert.deepEqual(calculateBuildingCost('granary', 0, state), expected);
});

test('once-only completion detection covers max buildings and segmented cores only', () => {
  const state = fresh();
  assert.equal(isBuildingFullyBuilt('communityCenter', state), false);
  state.buildings.communityCenter = 1;
  assert.equal(isBuildingFullyBuilt('communityCenter', state), true);
  state.buildings.aiSupercore = 100;
  assert.equal(isBuildingFullyBuilt('aiSupercore', state), true);
  state.buildings.warehouse = 300;
  assert.equal(isBuildingFullyBuilt('warehouse', state), false);
  assert.equal(isBuildingFullyBuilt('forage', state), false);
});
