import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import { createInitialState } from '../src/state/create-state';
import { calculateBuildingOutput } from '../src/simulation/building-production';
import { TECH_CATEGORIES } from '../src/vue/tech-categories';
import type { GameState } from '../src/types/state';

function fresh(): GameState {
  return createInitialState(CONFIG.version, 60, 0);
}

test('钛铱合金面板: T15, 400k knowledge + 1500 iridium + 2500 titanium, unlocked by 量子蜂群', () => {
  const tech = TECHNOLOGIES.titaniumIridiumPanels;
  assert.equal(tech.name, '钛铱合金面板');
  assert.equal(tech.tier, 15);
  assert.equal(tech.knowledgeCost, 400000);
  assert.deepEqual(tech.cost, { knowledge: 400000, iridium: 1500, titanium: 2500 });
  assert.deepEqual(tech.pre, ['quantumSwarm']);
  assert.ok(TECH_CATEGORIES.titaniumIridiumPanels, 'technology needs a category');
});

test('石墨烯导电板: T20, 1.65M knowledge + 5000 graphene, unlocked by 石墨烯加工 + 钛铱合金面板', () => {
  const tech = TECHNOLOGIES.grapheneConductivePlate;
  assert.equal(tech.name, '石墨烯导电板');
  assert.equal(tech.tier, 20);
  assert.equal(tech.knowledgeCost, 1650000);
  assert.deepEqual(tech.cost, { knowledge: 1650000, graphene: 5000 });
  assert.deepEqual(tech.pre, ['grapheneProcessing', 'titaniumIridiumPanels']);
  assert.ok(TECH_CATEGORIES.grapheneConductivePlate, 'technology needs a category');
});

test('蜂群卫星 base output stays 0.5 in the registry', () => {
  assert.equal(BUILDINGS.swarmSatellite.output?.energy, .5);
});

test('each technology raises 蜂群卫星 energy by its own fixed amount, and they stack additively', () => {
  const base = fresh();
  assert.equal(calculateBuildingOutput('swarmSatellite', base).energy, .5);

  const panels = fresh();
  panels.tech.push('titaniumIridiumPanels');
  // 0.5 + 0.15 — a flat bonus, not a multiplier, so it does not scale with the base.
  assert.equal(calculateBuildingOutput('swarmSatellite', panels).energy, .65);

  const plates = fresh();
  plates.tech.push('grapheneConductivePlate');
  assert.equal(calculateBuildingOutput('swarmSatellite', plates).energy, .6);

  const both = fresh();
  both.tech.push('titaniumIridiumPanels', 'grapheneConductivePlate');
  // Independent, non-interfering effects: 0.5 + 0.15 + 0.1, not 0.5 x 1.15 x 1.1.
  assert.equal(calculateBuildingOutput('swarmSatellite', both).energy, .75);
});

test('the two satellite technologies leave every other building output untouched', () => {
  const before = fresh();
  const after = fresh();
  after.tech.push('titaniumIridiumPanels', 'grapheneConductivePlate');
  for (const id of Object.keys(BUILDINGS) as (keyof typeof BUILDINGS)[]) {
    if (id === 'swarmSatellite') continue;
    assert.deepEqual(
      calculateBuildingOutput(id, after),
      calculateBuildingOutput(id, before),
      `${id} must not change`,
    );
  }
});
