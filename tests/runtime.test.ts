import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { effect, stop } from 'vue';
import { createRuntime } from '../src/app/runtime';
import { createGameStore } from '../src/app/store';
import { createInitialState } from '../src/state/create-state';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import { enqueueProject } from '../src/simulation/project-queue';
import { requestPurchaseModule } from '../src/simulation/purchases';
import { migrateV28 } from '../src/state/migrations';
import { validateAndMigrateSave } from '../src/state/validate-save';
import { validateProjectRecords } from '../src/state/validate-projects';
import { validateCivilization } from '../src/state/validate-civilization';
import { persistGame } from '../src/state/persistence';
import { settlePurchaseQueue } from '../src/simulation/purchases';
import { createMilestoneState } from './fixtures/milestones';

function environment(t: TestContext) {
  const writes = new Map<string, string>();
  let clock = 1_000_000;
  let monotonic = 0;
  let failRead = false;
  let failWrite = false;
  let reads = 0;
  let saves = 0;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem(key: string) { reads++; if (failRead) throw Error('denied'); return writes.get(key) ?? null; },
    setItem(key: string, value: string) { saves++; if (failWrite) throw Error('quota'); writes.set(key, value); },
  } });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  t.mock.method(Date, 'now', () => clock);
  t.mock.method(performance, 'now', () => monotonic);
  t.mock.method(Math, 'random', () => .5);
  return {
    writes,
    state: () => createInitialState(CONFIG.version, 600, clock),
    advance(seconds: number) { clock += seconds * 1000; monotonic += seconds * 1000; },
    set failRead(value: boolean) { failRead = value; },
    set failWrite(value: boolean) { failWrite = value; },
    get reads() { return reads; },
    get saves() { return saves; },
  };
}

test('runtime achievement scan logs a newly reached condition once', t => {
  const env = environment(t);
  const runtime = createRuntime(); runtime.load();
  runtime.state.buildings.swarmSatellite = 4096;
  env.advance(1); runtime.tick(1);
  assert.ok(runtime.state.achievements.includes('swarmEclipse'));
  env.advance(1); runtime.tick(1);
  assert.equal(runtime.state.logs.filter(row => row.type === 'achievement' && row.text.includes('遮天蔽日')).length, 1);
});

test('runtime initializes technology prices using the existing tier rules', () => {
  assert.equal(TECHNOLOGIES.titaniumSmelting.cost.knowledge, 42000);
  assert.equal(TECHNOLOGIES.steelSafe.cost.knowledge, 17500);
});

test('load clamps the candidate save and never mutates the previous state', t => {
  const env = environment(t);
  const runtime = createRuntime();
  const previous = runtime.state;
  previous.resources.wood = 99999;
  const saved = env.state();
  saved.resources.wood = 1e9;
  env.writes.set(CONFIG.saveKey, JSON.stringify(saved));
  runtime.load();
  assert.equal(previous.resources.wood, 99999);
  assert.ok(runtime.state.resources.wood < 1e9);
  assert.equal(runtime.saveFailed, false);
});

test('load never settles offline time and resets the live clock', t => {
  const env = environment(t);
  const saved = env.state();
  saved.time = 40;
  saved.lastSaved -= 4000;
  env.writes.set(CONFIG.saveKey, JSON.stringify(saved));
  const runtime = createRuntime();
  env.advance(2);
  runtime.load();
  // 4000s since the save and 2s before load are both discarded.
  assert.equal(runtime.state.time, 40);
  runtime.load();
  assert.equal(runtime.state.time, 40);
  assert.equal(env.reads, 1);
  runtime.tick(.2);
  assert.equal(runtime.state.time, 40);
  env.advance(.2);
  runtime.tick(.2);
  assert.equal(runtime.state.time, 40.2);
});

test('future save timestamps clamp to a slow device clock without advancing time', t => {
  const env = environment(t);
  const saved = env.state();
  saved.lastSaved += 7 * 86400000; // Importing on a device over 24 hours behind.
  env.writes.set(CONFIG.saveKey, JSON.stringify(saved));
  const runtime = createRuntime();
  runtime.load();
  assert.equal(runtime.state.time, 0);
  assert.equal(runtime.state.lastSaved, Date.now());
  assert.equal(runtime.saveBlocked, false);
});

test('load is idempotent for a new game', t => {
  environment(t);
  const runtime = createRuntime();
  runtime.load();
  const logs = runtime.state.logs.length;
  runtime.load();
  assert.equal(runtime.state.logs.length, logs);
});

test('purchase settlement runs and ARPA only advances with real elapsed time', t => {
  const env = environment(t);
  const runtime = createRuntime();
  runtime.load();
  runtime.state.tech.push('survival');
  assert.equal(requestPurchaseModule(runtime.state, 'build', 'nest', 0).status, 'queued');
  runtime.state.resources.wood = 100;
  runtime.state.resources.stone = 100;
  runtime.state.resources.cash = 100;
  env.advance(.2);
  runtime.tick(.2);
  assert.equal(runtime.state.buildings.nest, 1);
  assert.equal(runtime.state.queue.length, 0);
  assert.equal(runtime.state.arpaQueueElapsed, .2);
  runtime.state.tech.push('arpa', 'rocketry');
  assert.equal(enqueueProject(runtime.state, 'rocketPlatform'), 1);
  env.advance(.2);
  runtime.tick(.2);
  assert.equal(runtime.state.arpaQueueElapsed, .4);
  assert.equal(runtime.state.arpaBuildings.rocketPlatform, 0);
});

test('failed persistence is visible and preserves the last successful timestamp', t => {
  const env = environment(t);
  const runtime = createRuntime();
  runtime.load();
  assert.equal(runtime.save(), true);
  const before = env.writes.get(CONFIG.saveKey);
  const timestamp = runtime.state.lastSaved;
  env.advance(1);
  env.failWrite = true;
  assert.equal(runtime.save(), false);
  assert.equal(runtime.saveFailed, true);
  assert.equal(runtime.state.lastSaved, timestamp);
  assert.equal(env.writes.get(CONFIG.saveKey), before);
  env.failWrite = false;
  assert.equal(runtime.save(), true);
  assert.equal(runtime.saveFailed, false);
  assert.equal(runtime.state.lastSaved, timestamp + 1000);
});

for (const raw of ['{broken', '', '{"version":999}']) {
  test(`invalid save is protected against automatic and manual overwrite: ${JSON.stringify(raw)}`, t => {
    const env = environment(t);
    env.writes.set(CONFIG.saveKey, raw);
    const runtime = createRuntime();
    runtime.load();
    assert.equal(runtime.saveBlocked, true);
    assert.equal(runtime.saveFailed, true);
    env.advance(11);
    runtime.tick(.2);
    assert.equal(runtime.save(), false);
    assert.equal(env.saves, 0);
    assert.equal(env.writes.get(CONFIG.saveKey), raw);
    assert.equal(runtime.reset('hard'), true);
    assert.equal(runtime.saveBlocked, false);
    assert.equal(JSON.parse(env.writes.get(CONFIG.saveKey)!).time, 0);
  });
}

test('read failure also protects the unknown existing save', t => {
  const env = environment(t);
  env.failRead = true;
  const runtime = createRuntime();
  runtime.load();
  env.advance(10);
  runtime.tick(.2);
  assert.equal(runtime.saveBlocked, true);
  assert.equal(env.saves, 0);
});

test('automatic saves use actual elapsed time rather than nominal interval', t => {
  const env = environment(t);
  const runtime = createRuntime();
  runtime.load();
  runtime.tick(1000);
  assert.equal(env.saves, 0);
  env.advance(10);
  runtime.tick(.2);
  assert.equal(env.saves, 1);
  assert.equal(JSON.parse(env.writes.get(CONFIG.saveKey)!).time, 10);
});

test('replacement validates atomically, persists, and clears previous clock debt', t => {
  const env = environment(t);
  const runtime = createRuntime();
  runtime.load();
  const previous = runtime.state;
  assert.throws(() => runtime.importSave('{broken'));
  assert.throws(() => runtime.replaceState({ version: 999 }));
  assert.equal(runtime.state, previous);
  assert.equal(env.saves, 0);
  env.advance(30);
  const replacement = env.state();
  replacement.clicks = 42;
  assert.equal(runtime.replaceState(replacement), true);
  assert.notEqual(runtime.state, replacement);
  runtime.tick(.2);
  assert.equal(runtime.state.time, 0);
  assert.equal(JSON.parse(env.writes.get(CONFIG.saveKey)!).clicks, 42);
  env.advance(2);
  const timestamp = runtime.state.lastSaved;
  const exported = JSON.parse(runtime.exportSave());
  assert.equal(exported.lastSaved, timestamp + 2000);
  assert.equal(runtime.state.lastSaved, timestamp);
});

test('accepted import exposes persistence failure without losing imported progress', t => {
  const env = environment(t);
  const runtime = createRuntime();
  runtime.load();
  const imported = env.state();
  imported.clicks = 22;
  env.failWrite = true;
  assert.equal(runtime.importSave(JSON.stringify(imported)), false);
  assert.equal(runtime.state.clicks, 22);
  assert.equal(runtime.saveFailed, true);
});

test('reset persists immediately and preserves only the selected reset data', t => {
  const env = environment(t);
  const runtime = createRuntime();
  runtime.load();
  runtime.state.prestige.particles = 7;
  runtime.state.clicks = 100;
  assert.equal(runtime.reset('soft'), true);
  assert.equal(runtime.state.prestige.particles, 7);
  assert.equal(runtime.state.prestige.softResets, 1);
  assert.equal(runtime.state.clicks, 0);
  assert.equal(JSON.parse(env.writes.get(CONFIG.saveKey)!).prestige.particles, 7);
  assert.equal(runtime.reset('hard'), true);
  assert.equal(runtime.state.prestige.particles, 0);
  assert.equal(JSON.parse(env.writes.get(CONFIG.saveKey)!).prestige.particles, 0);
});

test('store signals one revision per refresh, mutation, or partially failed mutation', t => {
  environment(t);
  const store = createGameStore();
  let renders = 0;
  const watcher = effect(() => { store.revision(); renders++; });
  store.refresh();
  assert.equal(renders, 2);
  store.mutate(state => { state.clicks++; });
  assert.equal(renders, 3);
  assert.throws(() => store.mutate(state => { state.clicks++; throw Error('partial'); }));
  assert.equal(renders, 4);
  assert.equal(store.state().clicks, 2);
  stop(watcher);
});

const saveContext = { now: 1000, eventInterval: 60, housingCapacity: () => 1, clampResources: () => {} };

for (const timestamp of [-1, NaN, Infinity, -Infinity, null, '1000']) {
  test(`save metadata rejects malformed timestamp ${String(timestamp)}`, () => {
    const raw = { ...createInitialState(CONFIG.version, 60, 0), lastSaved: timestamp };
    assert.throws(() => validateAndMigrateSave(raw, saveContext), /存档时间/);
  });
}

test('v28 migration initializes absent additions without resetting valid present progress', () => {
  const raw = createMilestoneState('moon', { buildings: { asrielSpaceport: 2 } });
  raw.version = 28;
  raw.resources.mithril = 42;
  raw.stoppedBuildings.asrielSpaceport = 1;
  const snapshot = JSON.stringify(raw);
  const migrated = migrateV28(raw as unknown as Record<string, unknown>);
  assert.equal((migrated.resources as typeof raw.resources).mithril, 42);
  assert.equal((migrated.buildings as typeof raw.buildings).asrielSpaceport, 2);
  assert.equal(migrated.asrielMissionCompleted, true);
  const restored = validateAndMigrateSave(raw, saveContext);
  assert.equal(restored.resources.mithril, 42);
  assert.equal(restored.buildings.asrielSpaceport, 2);
  assert.equal(restored.stoppedBuildings.asrielSpaceport, 1);
  assert.equal(restored.asrielMissionCompleted, true);
  assert.equal(JSON.stringify(raw), snapshot);
  const absent = structuredClone(raw) as unknown as Record<string, unknown>;
  for (const field of ['resources', 'containerAssignments', 'craftWorkers']) delete (absent[field] as Record<string, unknown>).mithril;
  for (const field of ['buildings', 'workers', 'stoppedBuildings']) {
    for (const id of ['moonObservatory', 'asrielSpaceport', 'asrielResidence', 'asrielMine', 'ecologicalDome', 'hangar', 'spaceFactory', 'starRingStation']) delete (absent[field] as Record<string, unknown>)[id];
  }
  delete absent.asrielMissionCompleted; delete absent.asrielMissionQueued;
  const initialized = migrateV28(absent);
  assert.equal((initialized.resources as typeof raw.resources).mithril, 0);
  assert.equal((initialized.buildings as typeof raw.buildings).asrielSpaceport, 0);
  assert.equal(initialized.asrielMissionCompleted, false);
});

test('v28 migration does not launder malformed or locked additions', () => {
  for (const value of [null, [], 'bad', 4]) {
    assert.throws(() => migrateV28({ version: 28, resources: value }), /旧存档字段/);
  }
  const raw = createInitialState(28, 60, 0);
  assert.throws(() => validateAndMigrateSave({ ...raw, resources: { ...raw.resources, mithril: -1 } }, saveContext), /资源/);
  assert.throws(() => validateAndMigrateSave({ ...raw, buildings: { ...raw.buildings, asrielSpaceport: 1 } }, saveContext), /解锁/);
  assert.throws(() => validateAndMigrateSave({ ...raw, asrielMissionCompleted: null }, saveContext), /Asriel/);
});

test('retired Asriel queued flag normalizes without dropping real queue work', () => {
  const raw = createMilestoneState('moon');
  raw.asrielMissionCompleted = false;
  raw.asrielMissionQueued = true;
  raw.queue = [{ uid: 1, kind: 'mission', id: 'asriel' }];
  const restored = validateAndMigrateSave(raw, saveContext);
  assert.equal(restored.asrielMissionQueued, false);
  assert.deepEqual(restored.queue, raw.queue);
  restored.resources.helium3 = 10000;
  settlePurchaseQueue(restored, () => 1);
  assert.equal(restored.asrielMissionCompleted, true);
  assert.deepEqual(restored.queue, []);
  const stale = { ...raw, queue: [], asrielMissionCompleted: true };
  const normalized = validateAndMigrateSave(stale, saveContext);
  assert.equal(normalized.asrielMissionQueued, false);
  const standalone = createInitialState(CONFIG.version, 60, 0);
  standalone.tech = raw.tech;
  validateCivilization(stale, standalone);
  assert.equal(standalone.asrielMissionQueued, false);
  const locked = createInitialState(CONFIG.version, 60, 0);
  assert.throws(() => validateAndMigrateSave({ ...locked, asrielMissionQueued: true, queue: raw.queue }, saveContext), /队列任务/);
  assert.throws(() => validateAndMigrateSave({ ...raw, asrielMissionQueued: null }, saveContext), /Asriel/);
});

test('absent commercial stopped counts default but explicit malformed counts reject', () => {
  const raw = createInitialState(CONFIG.version, 60, 0);
  const stopped = { ...raw.stoppedBuildings };
  Reflect.deleteProperty(stopped, 'catCafe'); Reflect.deleteProperty(stopped, 'touristCenter');
  const restored = validateAndMigrateSave({ ...raw, stoppedBuildings: stopped }, saveContext);
  assert.equal(restored.stoppedBuildings.catCafe, 0);
  assert.equal(restored.stoppedBuildings.touristCenter, 0);
  for (const id of ['catCafe', 'touristCenter']) for (const value of [null, -1, .5, 1, '0', NaN, Infinity]) {
    assert.throws(() => validateAndMigrateSave({ ...raw, stoppedBuildings: { ...stopped, [id]: value } }, saveContext));
  }
});

test('synthesized project tracking uses explicit-row invariants and is roundtrip idempotent', () => {
  const fullSave = createMilestoneState('moon');
  fullSave.arpaProgress.monument = 37.5;
  const firstLoad = validateAndMigrateSave(fullSave, saveContext);
  const secondLoad = validateAndMigrateSave(JSON.parse(JSON.stringify(firstLoad)), saveContext);
  assert.deepEqual(secondLoad, firstLoad);
  const raw = createInitialState(CONFIG.version, 60, 0);
  raw.tech = ['arpa', 'rocketry'];
  raw.arpaProgress.rocketPlatform = 37.5;
  const restored = createInitialState(CONFIG.version, 60, 0); restored.tech = raw.tech;
  validateProjectRecords(raw as unknown as Record<string, unknown>, restored);
  assert.deepEqual(restored.arpaResourceProgress?.rocketPlatform, { metal: 37.5, alloy: 37.5 });
  const second = createInitialState(CONFIG.version, 60, 0); second.tech = raw.tech;
  validateProjectRecords(restored as unknown as Record<string, unknown>, second);
  assert.deepEqual(second.arpaResourceProgress, restored.arpaResourceProgress);
  assert.deepEqual(second.arpaProgress, restored.arpaProgress);
  for (const tracking of [{}, undefined]) {
    const legacy = { ...raw, arpaResourceProgress: tracking, arpaProgress: { ...raw.arpaProgress, rocketPlatform: 37 } };
    const target = createInitialState(CONFIG.version, 60, 0); target.tech = raw.tech;
    assert.throws(() => validateProjectRecords({ ...legacy, arpaBuildings: { ...raw.arpaBuildings, rocketPlatform: 1 } }, target), /工程投入/);
  }
  raw.arpaProgress.rocketPlatform = 100;
  assert.throws(() => validateProjectRecords(raw as unknown as Record<string, unknown>, restored), /工程投入/);
  raw.arpaResourceProgress = { rocketPlatform: null as never };
  assert.throws(() => validateProjectRecords(raw as unknown as Record<string, unknown>, restored), /工程投入/);
});

test('persistence itself restores timestamp on storage and serialization failures', () => {
  const state = createInitialState(CONFIG.version, 60, 123);
  assert.equal(persistGame(state, { setItem() { throw Error('quota'); } }, 'save', 456), false);
  assert.equal(state.lastSaved, 123);
  Object.defineProperty(state, 'toJSON', { configurable: true, value() { throw Error('serialization'); } });
  assert.equal(persistGame(state, { setItem() { assert.fail('must not write'); } }, 'save', 789), false);
  assert.equal(state.lastSaved, 123);
});

test('display-only history and unknown settings stay tolerant', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  const restored = validateAndMigrateSave({ ...state, settings: { ...state.settings, futureOption: { enabled: true } }, logs: [null, { text: 1, time: 0 }, { text: 'retained', time: 0, type: 'futureType' }] }, saveContext);
  assert.deepEqual(restored.settings, state.settings);
  assert.deepEqual(restored.logs, [{ text: 'retained', time: 0, type: 'progress' }]);
});
