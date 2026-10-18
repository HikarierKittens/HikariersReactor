import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS, BUILDING_GROUPS } from '../src/data/buildings';
import { TECHNOLOGIES } from '../src/data/technologies';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { calculateTechnologyTier } from '../src/simulation/technology';
import { isTechnologyUnlocked, isBuildingUnlocked } from '../src/simulation/unlocks';
import { calculateBuildingOutput } from '../src/simulation/building-production';
import { KEY_TECHNOLOGIES } from '../src/vue/tech-tree';
import type { GameState } from '../src/types/state';

const fresh = (): GameState => createInitialState(CONFIG.version, 60, 0);
/** Met so the 工业化 gate itself is not what a case is testing. */
const INDUSTRIAL_PARENTS = ['electricity', 'automation', 'titaniumSmelting'] as const;

test('工业化 is a gold-accented T8 node gated on electricity, automation and titanium smelting', () => {
  const definition = TECHNOLOGIES.industrialization;
  assert.equal(definition.name, '工业化');
  assert.equal(definition.tier, 8);
  assert.equal(calculateTechnologyTier('industrialization'), 8);
  assert.equal(definition.knowledgeCost, 42000);
  assert.deepEqual(definition.cost, { knowledge: 42000 });
  assert.deepEqual([...definition.pre].sort(), [...INDUSTRIAL_PARENTS].sort());
  assert.ok(KEY_TECHNOLOGIES.has('industrialization'), 'node tech renders with the gold border');
  const state = fresh();
  for (const [missing, expected] of [[[], false], [['electricity'], false], [['electricity', 'automation'], false],
    [['electricity', 'automation', 'titaniumSmelting'], true]] as const) {
    state.tech = [...missing];
    assert.equal(isTechnologyUnlocked('industrialization', state), expected, missing.join('+') || 'none');
  }
});

test('太阳能发电 unlocks photovoltaic plants after electronics', () => {
  const definition = TECHNOLOGIES.solarPower;
  assert.equal(definition.name, '太阳能发电');
  assert.equal(definition.tier, 8);
  assert.equal(calculateTechnologyTier('solarPower'), 8);
  assert.equal(definition.knowledgeCost, 50000);
  assert.deepEqual(definition.cost, { knowledge: 50000 });
  assert.deepEqual(definition.pre, ['electronics']);
  const state = fresh();
  state.tech = ['electricity'];
  assert.equal(isTechnologyUnlocked('solarPower', state), false); assert.equal(isBuildingUnlocked('solarFarm', state), false);
  state.tech.push('industrialization', 'electronics');
  assert.equal(isTechnologyUnlocked('solarPower', state), true);
  assert.equal(isBuildingUnlocked('solarFarm', state), false, 'the plant still needs its own technology');
  state.tech.push('solarPower');
  assert.equal(isBuildingUnlocked('solarFarm', state), true);
});

test('光伏电站 is a clean 4-power plant in the energy group', () => {
  const building = BUILDINGS.solarFarm;
  assert.equal(building.name, '光伏电站');
  assert.equal(building.tech, 'solarPower');
  assert.deepEqual(building.cost, { cash: 10000, copper: 1000, iron: 1000, metal: 100 });
  assert.deepEqual(building.costScales, { cash: 1.225, copper: 1.225, iron: 1.225, metal: 1.225 });
  assert.deepEqual(building.output, { energy: 4 });
  assert.equal(building.powerPlant, true);
  assert.equal(building.input, undefined, 'a solar farm burns no fuel');
  assert.equal(building.slots, 0);
  assert.deepEqual(BUILDING_GROUPS.find(group => group.id === 'energy')?.buildings,
    ['generator', 'solarFarm', 'oilGenerator', 'fissionGenerator']);
  // Generation feeds the fixed budget without a fuel or support gate.
  const state = fresh();
  state.tech = ['electricity', 'industrialization', 'electronics', 'solarPower'];
  state.buildings.solarFarm = 3;
  assert.equal(calculateBuildingOutput('solarFarm', state).energy, 4);
});

test('retargeted technologies require 工业化 while keeping explicit tiers and prices', () => {
  for (const [id, knowledge] of [['electronics', 42000], ['oilTechnology', 45000]] as const) {
    const definition = TECHNOLOGIES[id];
    assert.equal(definition.tier, 8, id);
    assert.equal(calculateTechnologyTier(id), 8, id);
    assert.equal(definition.knowledgeCost, knowledge, id);
    assert.equal(definition.cost.knowledge, knowledge, id);
    assert.ok(definition.pre.includes('industrialization'), id);
    const state = fresh();
    state.tech = [...INDUSTRIAL_PARENTS];
    assert.equal(isTechnologyUnlocked(id, state), false, `${id} without 工业化`);
    state.tech.push('industrialization');
    assert.equal(isTechnologyUnlocked(id, state), true, `${id} with 工业化`);
  }
  assert.deepEqual(TECHNOLOGIES.electronics.pre, ['industrialization', 'electricity']);
  assert.deepEqual(TECHNOLOGIES.oilTechnology.pre, ['industrialization']);
});

test('合金钻头 and 合金链锯 are gated on 工业化 instead of 自动化', () => {
  for (const id of ['alloyDrill', 'alloyChainsaw'] as const) {
    assert.deepEqual(TECHNOLOGIES[id].pre, ['industrialization'], id);
    const state = fresh();
    state.tech = ['electricity', 'automation'];
    assert.equal(isTechnologyUnlocked(id, state), false, `${id} still open on 自动化 alone`);
    state.tech.push('industrialization');
    state.buildings.factory = 1;
    state.resources.alloy = 1;
    assert.equal(isTechnologyUnlocked(id, state), true, id);
  }
});

test('工厂 and its production lines unlock on 工业化 rather than 自动化', () => {
  assert.equal(BUILDINGS.factory.tech, 'industrialization');
  const state = fresh();
  state.tech = ['electricity', 'automation'];
  assert.equal(isBuildingUnlocked('factory', state), false);
  state.tech.push('industrialization');
  assert.equal(isBuildingUnlocked('factory', state), true);
});
