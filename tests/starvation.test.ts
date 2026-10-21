import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { advanceGameTick, simulateElapsed, type TickHooks } from '../src/simulation/tick';
import { createNeighborsState } from '../src/simulation/neighbors';
import { advanceStarvation, enforcePopulationCapacity } from '../src/simulation/population';
import { advanceSoldierTraining } from '../src/simulation/military';

const hooks: TickHooks = {
  // Ample housing isolates starvation from the over-capacity rule (food stays at 0, so no growth).
  happiness: () => 100, capacity: () => 1000, event: () => {},
  projects: () => {}, purchases: () => {}, unlocks: () => {},
};
/** Fixed neighbours so two fixtures are comparable in the offline/live parity test. */
function seeded() {
  let value = 1;
  return () => { value = (value * 16807) % 2147483647; return value / 2147483647; };
}

function fixture(population = 5) {
  const state = createInitialState(CONFIG.version, 1e9, 0);
  state.population = population;
  state.neighbors = createNeighborsState(seeded());
  return state;
}

test('continuous zero-food shortage kills exactly one cat every ten seconds and logs an event', () => {
  const state = fixture();
  for (let i = 0; i < 49; i++) advanceGameTick(state, .2, hooks);
  assert.equal(state.population, 5);
  advanceGameTick(state, .2, hooks);
  assert.equal(state.population, 4);
  assert.equal(state.statistics.run.starved, 1);
  assert.equal(state.statistics.lifetime.starved, 1);
  const entry = state.logs[0]; assert.ok(entry);
  assert.equal(entry.text, '一只猫猫饿死了.....');
  assert.equal(entry.type, 'event');
  simulateElapsed(10, dt => advanceGameTick(state, dt, hooks));
  assert.equal(state.population, 3);
  assert.equal(state.logs.length, 2);
});

test('food recovery or nonnegative production clears the consecutive shortage timer', () => {
  const state = fixture();
  advanceStarvation(state, 9, -1);
  state.resources.food = 1;
  advanceStarvation(state, 1, -1);
  assert.equal(state.starvationElapsed, 0);
  state.resources.food = 0;
  advanceStarvation(state, 9, -1);
  advanceStarvation(state, 1, 0);
  assert.equal(state.starvationElapsed, 0);
  advanceStarvation(state, 9, -1);
  assert.equal(state.population, 5);
  advanceStarvation(state, 1, 1);
  assert.equal(state.starvationElapsed, 0);
});

test('the depletion step counts only seconds after stored food runs out', () => {
  const state = fixture(1);
  state.resources.food = CONFIG.foodPerCat * .5;
  advanceGameTick(state, 1, hooks);
  assert.equal(state.starvationElapsed, .5);
  simulateElapsed(9, dt => advanceGameTick(state, dt, hooks));
  assert.equal(state.population, 1);
  advanceGameTick(state, .5, hooks);
  assert.equal(state.population, 0);
});

test('deaths immediately trim workers and craft assignments without killing unrelated soldiers', () => {
  const state = fixture(3);
  // 木板 is the recipe a fresh save can already work; a still-locked recipe would
  // release its artisans instead of trimming them by available slots.
  state.buildings.foundry = 1;
  state.workers.foundry = 3;
  state.craftWorkers.plank = 3;
  state.soldiers = 1;
  advanceStarvation(state, 10, -1);
  assert.equal(state.population, 2);
  assert.equal(state.workers.foundry, 2);
  assert.equal(state.craftWorkers.plank, 2);
  assert.equal(state.soldiers, 1);
  assert.equal(state.statistics.run.soldierDeaths, 0);
  advanceStarvation(state, 10, -1);
  assert.equal(state.soldiers, 1);
  advanceStarvation(state, 10, -1);
  assert.equal(state.population, 0);
  assert.equal(state.soldiers, 1);
  assert.equal(state.workers.foundry, 0);
  assert.equal(state.craftWorkers.plank, 0);
  assert.equal(state.statistics.run.soldierDeaths, 0);
  assert.equal(state.statistics.lifetime.soldierDeaths, 0);
});

test('multiple deaths cannot make population negative or record nonexistent cats', () => {
  const state = fixture(2);
  advanceStarvation(state, 100, -1);
  assert.equal(state.population, 0);
  assert.equal(state.starvationElapsed, 0);
  assert.equal(state.statistics.run.starved, 2);
  assert.equal(state.logs.length, 2);
  advanceStarvation(state, 100, -1);
  assert.equal(state.statistics.run.starved, 2);
});

test('starvation preserves the existing independent army and training rules', () => {
  const state = fixture(1);
  state.tech.push('military');
  state.buildings.barracks = 10;
  advanceSoldierTraining(state, 300);
  assert.equal(state.soldiers, 10);
  advanceStarvation(state, 10, -1);
  assert.equal(state.population, 0);
  assert.equal(state.soldiers, 10);
  advanceSoldierTraining(state, 300);
  assert.equal(state.soldiers, 20);
  assert.equal(state.trainingProgress, 0);
  assert.equal(state.statistics.run.soldierDeaths, 0);
});

test('offline and live step simulation share starvation and game-day accounting', () => {
  const offline = fixture(), live = fixture();
  simulateElapsed(35.5, dt => advanceGameTick(offline, dt, hooks));
  for (let i = 0; i < 35; i++) advanceGameTick(live, 1, hooks);
  advanceGameTick(live, .5, hooks);
  assert.deepEqual(offline, live);
  assert.equal(offline.population, 2);
  assert.ok(Math.abs(offline.statistics.run.days - 35.5 / CONFIG.secondsPerDay) < 1e-10);
  assert.equal(offline.statistics.lifetime.days, offline.statistics.run.days);
});

test('one configured game year records the same number of game days', () => {
  const state = fixture(0);
  simulateElapsed(CONFIG.daysPerYear * CONFIG.secondsPerDay, dt => advanceGameTick(state, dt, hooks));
  assert.ok(Math.abs(state.statistics.run.days - CONFIG.daysPerYear) < 1e-8);
});

test('cats above housing capacity leave at once, trimming jobs but not soldiers', () => {
  const state = fixture(8);
  state.resources.food = 1e6;
  state.workers.foundry = 6;
  state.craftWorkers.plank = 2;
  // Two barracks (limit 4) keep the soldiers below their own ceiling: population loss must not
  // touch an army that fits.
  state.buildings.barracks = 2;
  state.soldiers = 4;
  advanceGameTick(state, .1, { ...hooks, capacity: () => 5 });
  assert.equal(state.population, 5);
  assert.equal(state.soldiers, 4);
  // Craft workers are a subset of foundry workers.
  assert.equal(state.workers.foundry, 5);
  assert.ok(state.craftWorkers.plank <= state.workers.foundry);
  assert.equal(state.logs[0]!.text, '猫口超出住房上限，3只猫猫离开了文明。');
  // At the cap nothing more is lost and no further log is written.
  advanceGameTick(state, .1, { ...hooks, capacity: () => 5 });
  assert.equal(state.population, 5);
  assert.equal(state.logs.filter(entry => entry.text.includes('离开了文明')).length, 1);
});

test('fractional capacity floors and zero capacity empties population', () => {
  const state = fixture(4);
  assert.equal(enforcePopulationCapacity(state, 2.9), 2);
  assert.equal(state.population, 2);
  assert.equal(enforcePopulationCapacity(state, 0), 2);
  assert.equal(state.population, 0);
  assert.equal(enforcePopulationCapacity(state, 0), 0);
});
