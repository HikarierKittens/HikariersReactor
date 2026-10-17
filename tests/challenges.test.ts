import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { RESOURCES } from '../src/data/resources';
import { createInitialState } from '../src/state/create-state';
import { validateAndMigrateSave } from '../src/state/validate-save';
import { validateChallenges } from '../src/state/validate-challenges';
import { launchChallenges, calculateEffectiveParticleCount } from '../src/simulation/challenges';
import { craftManually } from '../src/simulation/commands';
import { calculateParticleMultiplier } from '../src/simulation/crafting';
import { calculateCrisprCostReduction, calculateCrisprStorageBonus } from '../src/simulation/crispr';
import { launchNuclearPrestige, resetRunState } from '../src/simulation/prestige';
import { calculateProductionMultiplier, calculateChallengeAcceleratorMultiplier } from '../src/simulation/multipliers';
import type { ChallengeGeneId, GameState } from '../src/types/state';
import type { ResourceId } from '../src/types/economy';

const fresh = () => createInitialState(CONFIG.version, 60, 0);
const context = { now: 0, eventInterval: 60, housingCapacity: () => 1, clampResources: (_state: GameState) => {} };

test('challenge launch requires permanent unlock and commits an independent soft-reset state', () => {
  const state = fresh();
  assert.equal(launchChallenges(state, ['particleImbalance'], 60, 0), null);
  state.crispr = ['challengeGene']; state.prestige.particles = 100;
  state.resources.wood = 200; state.tech = ['writing']; state.achievements = ['nuclearCuriosity']; state.settings.touchOptimization = true;
  state.statistics.lifetime.knowledgeSpent = 42;
  const before = JSON.stringify(state);
  for (const genes of [[], ['unknown'], ['particleImbalance', 'particleImbalance']]) {
    assert.equal(launchChallenges(state, genes as ChallengeGeneId[], 60, 0), null);
    assert.equal(JSON.stringify(state), before);
  }
  const genes: ChallengeGeneId[] = ['particleImbalance', 'geneCollapse', 'industrialFracture'];
  const next = launchChallenges(state, genes, 30, 123)!.next;
  genes.pop();
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(next.challenge, { genes: ['particleImbalance', 'geneCollapse', 'industrialFracture'], modes: [], story: null, particleBaseline: 100 });
  assert.equal(next.prestige.softResets, 1); assert.equal(next.prestige.particles, 100);
  assert.deepEqual(next.crispr, state.crispr); assert.notEqual(next.crispr, state.crispr);
  assert.deepEqual(next.achievements, state.achievements); assert.equal(next.settings.touchOptimization, true);
  assert.equal(next.statistics.lifetime.knowledgeSpent, 42);
  assert.equal(next.resources.wood, 0); assert.deepEqual(next.tech, []);
  assert.equal(calculateEffectiveParticleCount(next), 0);
  next.prestige.particles = 125; assert.equal(calculateEffectiveParticleCount(next), 25);
  next.prestige.particles = 80; assert.equal(calculateEffectiveParticleCount(next), 0);
});

test('all ordinary reset paths clear active challenges and baseline', () => {
  const state = fresh(); state.crispr = ['challengeGene']; state.prestige.particles = 100;
  const active = launchChallenges(state, ['particleImbalance'], 60, 0)!.next;
  active.tech.push('nuclearProgram'); active.nuclearProgress = 100;
  for (const next of [resetRunState(active, 'soft', 60, 0)!.next, resetRunState(active, 'hard', 60, 0)!.next, launchNuclearPrestige(active, 60, 0)!.next]) {
    assert.deepEqual(next.challenge, { genes: [], modes: [], story: null, particleBaseline: 0 });
  }
});

test('save round trips active genes, rejects missing and explicit malformed records', () => {
  const state = fresh(); state.crispr = ['challengeGene']; state.prestige.particles = 100;
  const active = launchChallenges(state, ['particleImbalance', 'industrialFracture'], 60, 0)!.next;
  assert.deepEqual(validateAndMigrateSave(JSON.parse(JSON.stringify(active)), context).challenge, active.challenge);
  const legacy = JSON.parse(JSON.stringify(fresh())); delete legacy.challenge;
  assert.throws(() => validateAndMigrateSave(legacy, context));
  const valid = active.challenge;
  for (const challenge of [undefined, null, [], {}, { ...valid, genes: ['unknown'] }, { ...valid, genes: ['particleImbalance', 'particleImbalance'] }, { ...valid, modes: ['unknown'] }, { ...valid, story: 'unknown' }, { ...valid, particleBaseline: -1 }, { ...valid, particleBaseline: 1.5 }, { ...valid, particleBaseline: Infinity }]) {
    assert.throws(() => validateChallenges({ challenge }, active));
  }
  assert.throws(() => validateChallenges({ challenge: valid }, fresh()));
});

test('imbalance accelerator boosts are linear for all ordinary resources including knowledge only', () => {
  const state = fresh(); state.challenge.genes = ['particleImbalance']; state.buildings.particleAccelerator = 3;
  for (const id of Object.keys(RESOURCES) as ResourceId[]) {
    assert.equal(calculateChallengeAcceleratorMultiplier(id, state), id === 'energy' || id === 'encryptedData' ? 1 : RESOURCES[id].crafted ? 1.0375 : 1.15);
  }
  assert.equal(calculateProductionMultiplier('knowledge', 100, state), 1.15);
  assert.equal(calculateProductionMultiplier('energy', 100, state), 1);
  state.challenge.genes = [];
  assert.equal(calculateProductionMultiplier('knowledge', 100, state), 1);
});

test('challenge effects integrate with particle production, permanent storage and material reduction', () => {
  const state = fresh();
  state.crispr = ['challengeGene', 'spatialReasoning', 'halfLife3', 'geneOptimization']; state.prestige.particles = 100;
  const next = launchChallenges(state, ['particleImbalance', 'geneCollapse'], 60, 0)!.next;
  next.buildings.particleAccelerator = 4;
  assert.equal(calculateParticleMultiplier('food', next), 1);
  assert.equal(calculateCrisprStorageBonus(next).particleBonus, 0);
  assert.equal(calculateCrisprCostReduction(next), .01);
  next.prestige.particles = 125;
  const ordinary = fresh(); ordinary.prestige.particles = 25;
  assert.equal(calculateParticleMultiplier('food', next), calculateParticleMultiplier('food', ordinary));
  assert.equal(calculateCrisprStorageBonus(next).particleBonus, .01);
  assert.ok(next.crispr.includes('geneOptimization'));
  next.challenge.genes = [];
  assert.equal(calculateCrisprCostReduction(next), .05);
});

test('industrial fracture refuses manual crafts without consuming ingredients or producing output', () => {
  const state = fresh(); state.buildings.foundry = 1; state.resources.wood = 100;
  state.challenge.genes = ['industrialFracture'];
  const before = JSON.stringify(state);
  for (const count of [1, 'max'] as const) {
    assert.equal(craftManually(state, 'plank', count), 0); assert.equal(JSON.stringify(state), before);
  }
  state.challenge.genes = []; assert.equal(craftManually(state, 'plank', 1), 1);
});
