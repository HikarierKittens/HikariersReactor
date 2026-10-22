/** Moved verbatim out of tests/modules.test.ts during the 2026-10-22 split.
 *  Keep the assertions unchanged: they are the historical regression net. */
import { CONFIG } from '../src/data/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enqueueProject, advanceProjectQueue } from '../src/simulation/project-queue';
import { investInProject } from '../src/simulation/projects';
import { createInitialState } from '../src/state/create-state';

test('gene sequencing requires genetics, costs one million, and resets each run', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.resources.knowledge = 1000000;
  assert.equal(investInProject('geneSequencing', state, 100, () => 0), 0);
  state.tech.push('genetics');
  assert.equal(investInProject('geneSequencing', state, 75, () => 0), 75);
  assert.equal(state.resources.knowledge, 250000);
  assert.equal(enqueueProject(state, 'geneSequencing', 10), 1);
  assert.equal(enqueueProject(state, 'geneSequencing'), 0);
  advanceProjectQueue(state, 1, () => 0);
  assert.equal(state.arpaBuildings.geneSequencing, 1);
  assert.equal(state.resources.knowledge, 0);
  state.resources.knowledge = 1000000;
  assert.equal(investInProject('geneSequencing', state, 100, () => 0), 0);
  assert.equal(createInitialState(CONFIG.version, 60, 0).arpaBuildings.geneSequencing, 0);
});

test('project queue preserves partial funding, timing and unique projects', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.tech.push('arpa', 'rocketry');
  assert.equal(enqueueProject(state, 'rocketPlatform', 10), 1);
  assert.equal(enqueueProject(state, 'rocketPlatform'), 0);
  state.resources.metal = 100; state.resources.alloy = 50;
  assert.deepEqual(advanceProjectQueue(state, .5, () => 0), { completed: 0, dirty: false });
  assert.deepEqual(advanceProjectQueue(state, .5, () => 0), { completed: 0, dirty: true });
  assert.equal(state.arpaProgress.rocketPlatform, 1);
  assert.equal(state.queue.length, 1);
  assert.equal(state.resources.metal, 0);
  state.resources.metal = 9900; state.resources.alloy = 4950;
  assert.deepEqual(advanceProjectQueue(state, 1, () => 0), { completed: 1, dirty: true });
  assert.equal(state.arpaBuildings.rocketPlatform, 1);
  assert.equal(state.queue.length, 0);
  assert.equal(enqueueProject(state, 'rocketPlatform'), 0);
});

test('monument investment changes material only on completion', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.tech.push('monument'); state.resources.stone = 100000;
  let randomCalls = 0;
  const random = () => { randomCalls++; return 0; };
  assert.equal(investInProject('monument', state, 50, random), 50);
  assert.equal(randomCalls, 0); assert.equal(state.monumentMaterial, 'stone');
  assert.equal(investInProject('monument', state, 100, random), 50);
  assert.equal(randomCalls, 1); assert.equal(state.monumentMaterial, 'aluminum');
  assert.equal(state.arpaBuildings.monument, 1); assert.equal(state.resources.stone, 0);
});
