import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { ACHIEVEMENTS } from '../src/data/progression';
import { RESOURCES } from '../src/data/resources';
import { createInitialState } from '../src/state/create-state';
import { calculateProduction } from '../src/simulation/production';
import { calculateResourceBreakdown, calculateResourceFactorRows } from '../src/simulation/resource-breakdown';
import { calculateCraftingMultiplier, calculateFoundryMultiplier, calculateGlobalOutputMultiplier, calculateParticleMultiplier } from '../src/simulation/crafting';
import { craftManually } from '../src/simulation/commands';
import { getAchievementMasteryBonus } from '../src/simulation/achievement-tracking';
import type { AchievementId, GameState } from '../src/types/state';
import type { ResourceId } from '../src/types/economy';

const fresh = () => createInitialState(CONFIG.version, 60, 0);
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
function mastered(base: GameState, level = 3): GameState {
  const state = structuredClone(base);
  state.achievements = ['nuclearCuriosity'];
  state.achievementLevels = { nuclearCuriosity: level as 0 | 1 | 2 | 3 };
  return state;
}
function parity(state: GameState, resources: ResourceId[]) {
  const result = calculateProduction(state);
  for (const id of resources) near(calculateResourceBreakdown(id, state, result).net, result.rates[id]);
  return result;
}

test('zero mastery preserves global factors, stocks and production baseline', () => {
  const state = fresh();
  state.workers.forage = 2;
  const legacy = structuredClone(state);
  delete legacy.achievementLevels;
  assert.equal(getAchievementMasteryBonus(state), 0);
  assert.deepEqual(calculateProduction(state), calculateProduction(legacy));
  for (const id of Object.keys(RESOURCES) as ResourceId[]) {
    assert.equal(calculateGlobalOutputMultiplier(id, state), calculateParticleMultiplier(id, state));
  }
  assert.equal(calculateResourceFactorRows('food', state, calculateProduction(state)).rows.some(r => r.name === '精通'), false);
});

test('each highest achievement level contributes 0.25%, 0.5%, 0.75%, or 1% exactly once', () => {
  const base = fresh(); base.workers.forage = 2;
  const baseline = calculateProduction(base).rates.food;
  for (const level of [0, 1, 2, 3]) {
    const state = mastered(base, level), bonus = (level + 1) * .0025;
    near(getAchievementMasteryBonus(state), bonus);
    const before = structuredClone(state), result = parity(state, ['food']);
    near(result.rates.food, baseline * (1 + bonus));
    assert.deepEqual(state, before, 'preview must not alter stocks or prestige');
    const rows = calculateResourceFactorRows('food', state, result).rows.filter(r => r.name === '精通');
    assert.deepEqual(rows, [{ name: '精通', value: `+${bonus * 100}%`, child: false }]);
  }
});

test('seven achievements sum their highest grades before the independent multiplier', () => {
  const state = fresh();
  state.achievements = Object.keys(ACHIEVEMENTS) as AchievementId[];
  state.achievementLevels = Object.fromEntries(state.achievements.map(id => [id, 3]));
  state.prestige.particles = 100;
  near(getAchievementMasteryBonus(state), .07);
  for (const id of Object.keys(RESOURCES) as ResourceId[]) {
    near(calculateGlobalOutputMultiplier(id, state), calculateParticleMultiplier(id, state) * (id === 'energy' ? 1 : 1.07));
  }
});

test('ordinary output, tax, soldiers and titanium byproducts gain mastery but inputs and energy do not', () => {
  const base = fresh();
  base.population = 4; base.soldiers = 2; base.workers.forage = 2;
  base.buildings.smelter = 1; base.buildings.generator = 1;
  base.tech.push('titaniumSmelting');
  Object.assign(base.resources, { iron: 1000, coal: 1000, energy: 1000, food: 1000 });
  const state = mastered(base), plain = calculateProduction(base), result = parity(state, ['food', 'cash', 'fur', 'metal', 'titanium', 'energy']);
  for (const id of ['food', 'cash', 'fur', 'metal', 'titanium'] as ResourceId[]) {
    near(calculateResourceBreakdown(id, state, result).income, calculateResourceBreakdown(id, base, plain).income * 1.01);
    near(calculateResourceBreakdown(id, state, result).expense, calculateResourceBreakdown(id, base, plain).expense);
  }
  near(result.rates.energy, plain.rates.energy);
  assert.deepEqual(result.inputUnits, plain.inputUnits);
  assert.equal(calculateResourceFactorRows('energy', state, result).rows.some(r => r.name === '精通'), false);
});

test('manual forging and artisans receive mastery once alongside foundry, not in costs', () => {
  const base = fresh(); base.buildings.foundry = 3; base.workers.foundry = 1; base.craftWorkers.plank = 1;
  base.tech.push('castingToolUpgrade'); base.resources.wood = 1000;
  base.prestige.particles = 100;
  const state = mastered(base);
  near(calculateFoundryMultiplier(state), calculateFoundryMultiplier(base));
  near(calculateCraftingMultiplier('plank', state), calculateCraftingMultiplier('plank', base) * 1.01);
  const plain = calculateProduction(base), result = parity(state, ['plank', 'wood']);
  assert.ok(plain.outputs['craft:plank']! > 0);
  near(result.outputs['craft:plank']!, plain.outputs['craft:plank']! * 1.01);
  near(result.inputUnits['craft:plank']!, plain.inputUnits['craft:plank']!);
  const plainManual = structuredClone(base), manual = structuredClone(state);
  assert.equal(craftManually(plainManual, 'plank', 2), 2);
  assert.equal(craftManually(manual, 'plank', 2), 2);
  near(manual.resources.plank - state.resources.plank, (plainManual.resources.plank - base.resources.plank) * 1.01);
  near(manual.resources.wood, plainManual.resources.wood);
  assert.equal(calculateResourceFactorRows('plank', state, result).rows.filter(r => r.name === '精通').length, 1);
});

test('factory actual output and breakdown receive mastery once with unchanged line ingredients', () => {
  const base = fresh(); base.buildings.factory = 1; base.lines.alloy = 1;
  Object.assign(base.resources, { iron: 1000, copper: 1000, energy: 1000 });
  const state = mastered(base), plain = calculateProduction(base), result = parity(state, ['alloy', 'iron', 'copper', 'energy']);
  assert.ok(plain.rates.alloy > 0);
  near(result.rates.alloy, plain.rates.alloy * 1.01);
  near(result.rates.iron, plain.rates.iron); near(result.rates.copper, plain.rates.copper); near(result.rates.energy, plain.rates.energy);
  assert.equal(calculateResourceFactorRows('alloy', state, result).rows.filter(r => r.name === '精通').length, 1);
});

test('multi-resource hyperspace and new distant sources gain mastery per resource with exact breakdown parity', () => {
  const base = fresh();
  Object.assign(base.buildings, { metalMiningShip: 1, grapheneFactory: 1, adamantiteMiningShip: 1 });
  Object.assign(base.resources, { energy: 10000, helium3: 1000, deuterium: 1000, oil: 1000 });
  const state = mastered(base), ids: ResourceId[] = ['stone', 'copper', 'aluminum', 'graphene', 'adamantite', 'energy'];
  const plain = calculateProduction(base), result = parity(state, ids);
  for (const id of ids.filter(id => id !== 'energy')) {
    assert.ok(plain.rates[id] > 0, id);
    near(result.rates[id], plain.rates[id] * 1.01);
  }
  near(result.rates.energy, plain.rates.energy);
  assert.deepEqual(result.inputUnits, plain.inputUnits);
});
