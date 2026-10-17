import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { validateAndMigrateSave } from '../src/state/validate-save';
import { launchNuclearPrestige, resetRunState } from '../src/simulation/prestige';
import { createStatistics, recordGameDays, recordKnowledgeSpent, recordParticlesEarned, recordSoldierDeaths, recordStarvation } from '../src/simulation/statistics';
import type { StatisticsState } from '../src/simulation/statistics';
const fresh = () => createInitialState(CONFIG.version, 60, 0);
const context = { now: 0, eventInterval: 60, housingCapacity: () => 1, clampResources: () => {} };

test('statistics helpers support old partial states and invalid input is a no-op', () => {
  const state: StatisticsState = {};
  recordKnowledgeSpent(state, 123.5); recordStarvation(state, 2); recordSoldierDeaths(state, 3); recordGameDays(state, .25); recordParticlesEarned(state, 4);
  assert.deepEqual(state.statistics, { lifetime: { knowledgeSpent: 123.5, starved: 2, soldierDeaths: 3, days: .25, particlesEarned: 4, casimirEarned: 0, darkEnergyEarned: 0, harmonyCrystalsEarned: 0 }, run: { knowledgeSpent: 123.5, starved: 2, soldierDeaths: 3, days: .25 } });
  const before = JSON.stringify(state);
  for (const value of [-1, NaN, Infinity, 0]) recordKnowledgeSpent(state, value);
  assert.equal(JSON.stringify(state), before);
});

test('missing statistics reject without deriving counters from holdings or CRISPR', () => {
  const raw = JSON.parse(JSON.stringify(fresh()));
  delete raw.statistics; delete raw.starvationElapsed;
  raw.time = 2005; raw.prestige.particles = 7; raw.crispr = ['materialEfficiency', 'innovativeMaterials'];
  const before = structuredClone(raw);
  assert.throws(() => validateAndMigrateSave(raw, context));
  assert.deepEqual(raw, before);
  for (const field of ['statistics', 'starvationElapsed']) {
    const missing = JSON.parse(JSON.stringify(fresh())); delete missing[field];
    assert.throws(() => validateAndMigrateSave(missing, context), field);
  }
});

test('statistics validation preserves fractions and rejects corrupt counters', () => {
  const state = fresh(); recordGameDays(state, .125); state.starvationElapsed = 1.25;
  const restored = validateAndMigrateSave(state, context);
  assert.equal(restored.statistics.run.days, .125); assert.equal(restored.starvationElapsed, 1.25);
  for (const value of [-1, NaN, Infinity, '5']) {
    const raw = JSON.parse(JSON.stringify(state)); raw.statistics.run.days = value;
    assert.throws(() => validateAndMigrateSave(raw, context));
  }
});

test('soft/nuclear preserve lifetime only; reward counted once; hard clears all', () => {
  const state = fresh(); recordKnowledgeSpent(state, 50); recordGameDays(state, 405.5); recordStarvation(state, 2); recordSoldierDeaths(state, 1); recordParticlesEarned(state, 9);
  state.starvationElapsed = 4; state.prestige.particles = 9; state.tech.push('nuclearProgram'); state.nuclearProgress = 100;
  const before = JSON.stringify(state);
  const soft = resetRunState(state, 'soft', 60, 0)!.next;
  assert.deepEqual(soft.statistics.lifetime, state.statistics.lifetime); assert.notEqual(soft.statistics.lifetime, state.statistics.lifetime);
  assert.deepEqual(soft.statistics.run, createStatistics().run); assert.equal(soft.starvationElapsed, 0);
  const nuclear = launchNuclearPrestige(state, 60, 0)!;
  assert.equal(nuclear.next.statistics.lifetime.particlesEarned, 9 + nuclear.reward);
  assert.equal(nuclear.next.statistics.lifetime.days, 405.5); assert.deepEqual(nuclear.next.statistics.run, createStatistics().run);
  const hard = resetRunState(state, 'hard', 60, 0)!.next;
  assert.deepEqual(hard.statistics, createStatistics()); assert.equal(hard.starvationElapsed, 0);
  assert.equal(JSON.stringify(state), before);
});
