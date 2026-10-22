/** Moved verbatim out of tests/modules.test.ts during the 2026-10-22 split.
 *  Keep the assertions unchanged: they are the historical regression net. */
import { CONFIG } from '../src/data/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { persistGame } from '../src/state/persistence';
import { validateAndMigrateSave } from '../src/state/validate-save';
import { createInitialState } from '../src/state/create-state';
import { validateCivilization } from '../src/state/validate-civilization';
import { validateFactoryAssignments, validateEconomyRecords } from '../src/state/validate-economy';

test('persistence writes timestamped JSON and reports storage failure', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  const writes = new Map<string, string>();
  assert.equal(persistGame(state, { setItem: (key, value) => { writes.set(key, value); } }, 'save', 123), true);
  assert.equal(JSON.parse(writes.get('save')!).lastSaved, 123);
  assert.equal(persistGame(state, { setItem: () => { throw Error('quota'); } }, 'save', 456), false);
  assert.equal(state.lastSaved, 123);
  assert.equal(JSON.parse(writes.get('save')!).lastSaved, 123);
});

test('strict compatibility-named entry roundtrips current saves immutably', () => {
 const state = createInitialState(CONFIG.version, 60, 0);
 const context = { now: 0, eventInterval: 60, housingCapacity: () => 1, clampResources: () => {} };
 const raw = JSON.parse(JSON.stringify(state)), before = structuredClone(raw);
 const restored = validateAndMigrateSave(raw, context);
 assert.deepEqual(restored, state); assert.deepEqual(raw, before); assert.notEqual(restored, raw);
 assert.deepEqual(validateAndMigrateSave(JSON.parse(JSON.stringify(restored)), context), restored);
});

test('every historical save schema 12 through 30 is rejected without mutation', () => {
 const state = createInitialState(CONFIG.version, 60, 0);
 const context = { now: 0, eventInterval: 60, housingCapacity: () => 1, clampResources: () => {} };
 for (const version of Array.from({ length: 19 }, (_, i) => i + 12)) {
  const raw = { ...structuredClone(state), version }, before = structuredClone(raw);
  assert.throws(() => validateAndMigrateSave(raw, context), /版本|兼容/);
  assert.deepEqual(raw, before);
 }
});

test('economy save validation preserves defaults and rejects invalid assignments', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  validateEconomyRecords({ ...state }, state);
  assert.throws(() => validateFactoryAssignments(undefined, state));
  assert.deepEqual(state.lines, { alloy: 0, polymer: 0, fur: 0, nanotubes: 0, nanoAlloy: 0 });
  assert.throws(() => validateFactoryAssignments({ ...state.lines, alloy: .5 }, state), /生产线分配无效/);
  assert.throws(() => validateFactoryAssignments({ ...state.lines, fur: 1 }, state), /生产线分配无效/);
  assert.throws(() => validateEconomyRecords({ ...state, resources: { ...state.resources, food: '10' } }, state), /资源数据无效/);
  assert.throws(() => validateEconomyRecords({ ...state, buildings: { ...state.buildings, nest: .5 } }, state), /建筑或工作分配无效/);
});

test('civilization save validation rejects invalid prestige and military progress', () => {
  const source = createInitialState(CONFIG.version, 60, 0);
  const raw: Record<string, unknown> = { ...source };
  const target = createInitialState(CONFIG.version, 60, 0);
  validateCivilization(raw, target);
  assert.deepEqual(target.prestige, source.prestige);
  assert.throws(() => validateCivilization({ ...raw, prestige: { ...source.prestige, particles: .5 } }, target), /整数/);
  assert.throws(() => validateCivilization({ ...raw, government: 'democracy' }, target), /尚未解锁/);
  assert.throws(() => validateCivilization({ ...raw, trainingProgress: 1 }, target), /训练进度/);
  assert.throws(() => validateCivilization({ ...raw, nuclearProgress: 1 }, target), /核弹工程/);
});
