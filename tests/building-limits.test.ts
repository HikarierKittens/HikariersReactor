import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { persistGame } from '../src/state/persistence';
import { validateAndMigrateSave } from '../src/state/validate-save';
import { validateEconomyRecords, validateFactoryAssignments } from '../src/state/validate-economy';
import { validateSaveQueue } from '../src/state/validate-queue';
import { calculateBuildingCost } from '../src/simulation/costs';
import { calculateWorkerCapacity } from '../src/simulation/building-production';
import { buyBuildingNow, buyBuildingsInBatch, isPurchaseAllowed, requestPurchaseModule, settlePurchaseQueue } from '../src/simulation/purchases';

import { calculateFactoryCapacity, trimFactoryAssignments, countAssignedLines } from '../src/simulation/factory';

test('stopped factories remove capacity and retract largest assignments first', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.buildings.factory = 10;
  state.lines.alloy = 7;
  state.lines.polymer = 3;
  state.stoppedBuildings.factory = 4;
  assert.equal(calculateFactoryCapacity(state), 6);
  assert.equal(trimFactoryAssignments(state), 4);
  assert.equal(state.lines.alloy, 3);
  assert.equal(state.lines.polymer, 3);
  assert.equal(countAssignedLines(state), 6);
  state.stoppedBuildings.factory = 10;
  assert.equal(trimFactoryAssignments(state), 6);
  assert.equal(countAssignedLines(state), 0);
  state.stoppedBuildings.factory = 0;
  assert.equal(calculateFactoryCapacity(state), 10);
  assert.equal(countAssignedLines(state), 0);
});

function makeState() {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.tech.push('survival');
  return state;
}
function fund(state: ReturnType<typeof makeState>) {
  // Real scaled costs at 300 are finite and well below the resource save bound.
  state.resources.wood = state.resources.stone = state.resources.cash = 1e30;
}

test('ordinary buildings and nests remain purchasable at and beyond 300', () => {
  for (const id of ['forage', 'nest'] as const) {
    const state = makeState();
    state.buildings[id] = 300;
    fund(state);
    assert.equal(BUILDINGS[id].max, undefined);
    assert.equal(isPurchaseAllowed(state, 'build', id), true);
    const cost = calculateBuildingCost(id, 300, state);
    const before = state.resources.wood;
    assert.equal(buyBuildingNow(state, id, 0).bought, true);
    assert.equal(state.buildings[id], 301);
    assert.equal(state.resources.wood, before - cost.wood!);
    assert.equal(requestPurchaseModule(state, 'build', id, 0).status, 'buy-now');
    assert.equal(state.buildings[id], 302);
  }
});

test('queue and batch construction cross 300 without pruning or truncation', () => {
  const state = makeState();
  state.buildings.forage = 299;
  state.tech.push('communityAdmin');
  for (let i = 0; i < 3; i++) assert.equal(requestPurchaseModule(state, 'build', 'forage', 0).status, 'queued');
  assert.deepEqual(validateSaveQueue(state.queue, state), state.queue);
  fund(state);
  assert.equal(buyBuildingsInBatch(state, 'forage', 4, 0).bought, 4);
  assert.equal(state.buildings.forage, 303);
  const settled = settlePurchaseQueue(state, 0);
  assert.equal(settled.pruned, false);
  assert.equal(settled.entries.filter(entry => entry.completed).length, 3);
  assert.equal(state.buildings.forage, 306);
  assert.equal(state.queue.length, 0);
});

test('explicit community limit reserves queued capacity and rejects invalid saves', () => {
  const state = makeState();
  state.tech.push('community');
  assert.equal(BUILDINGS.communityCenter.max, 1);
  assert.equal(requestPurchaseModule(state, 'build', 'communityCenter', 0).status, 'queued');
  assert.equal(requestPurchaseModule(state, 'build', 'communityCenter', 0).status, 'rejected');
  fund(state);
  assert.equal(buyBuildingsInBatch(state, 'communityCenter', 10, 0).bought, 0);
  const settled = settlePurchaseQueue(state, 0).entries[0]; assert.ok(settled);
  assert.equal(settled.completed, true);
  assert.equal(state.buildings.communityCenter, 1);
  assert.equal(buyBuildingNow(state, 'communityCenter', 0).bought, false);
  assert.throws(() => validateSaveQueue([{ uid: 1, kind: 'build', id: 'communityCenter' }], state), /建筑上限/);
  state.buildings.communityCenter = 2;
  assert.throws(() => validateEconomyRecords({ ...state }, makeState()), /建筑数据无效/);
  const batch = makeState();
  batch.tech.push('community');
  fund(batch);
  assert.equal(buyBuildingsInBatch(batch, 'communityCenter', 10, 0).bought, 1);
});

test('save roundtrip preserves buildings, workers, stopped counts and queue above 300', () => {
  const state = makeState();
  state.buildings.forage = 1000001;
  state.buildings.nest = 301;
  state.workers.forage = 601;
  state.population = 601;
  state.stoppedBuildings.forage = 400;
  assert.equal(calculateWorkerCapacity('forage', state), 1000001);
  assert.equal(requestPurchaseModule(state, 'build', 'forage', 0).status, 'queued');
  let json = '';
  assert.equal(persistGame(state, { setItem: (_key, value) => { json = value; } }, 'save', 0), true);
  const loaded = validateAndMigrateSave(JSON.parse(json), {
    now: 0, eventInterval: 60, housingCapacity: () => 602, clampResources: () => {},
  });
  assert.deepEqual(loaded.buildings, state.buildings);
  assert.deepEqual(loaded.workers, state.workers);
  assert.deepEqual(loaded.stoppedBuildings, state.stoppedBuildings);
  assert.deepEqual(loaded.queue, state.queue);
  assert.ok(Object.values(loaded.buildings).every(Number.isSafeInteger));
});

test('large factory assignments follow capacity rather than the old million cutoff', () => {
  const state = makeState();
  state.buildings.factory = 1000001;
  state.tech.push(BUILDINGS.factory.tech);
  validateFactoryAssignments({ ...state.lines, alloy: 1000001 }, state);
  assert.equal(state.lines.alloy, 1000001);
  assert.throws(() => validateFactoryAssignments({ ...state.lines, alloy: Number.MAX_SAFE_INTEGER + 1 }, state), /生产线分配数据无效/);
});

test('unbounded gameplay still rejects non-finite and unsafe saved building counts', () => {
  for (const count of [Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, 300.5]) {
    const state = makeState();
    state.buildings.forage = count;
    assert.throws(() => validateEconomyRecords({ ...state }, makeState()), /建筑/);
    assert.throws(() => validateEconomyRecords(JSON.parse(JSON.stringify(state)), makeState()), /建筑/);
  }
});
