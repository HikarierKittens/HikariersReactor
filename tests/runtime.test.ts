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

test('future save timestamps load without advancing time', t => {
  const env = environment(t);
  const saved = env.state();
  saved.lastSaved += 1000;
  env.writes.set(CONFIG.saveKey, JSON.stringify(saved));
  const runtime = createRuntime();
  runtime.load();
  assert.equal(runtime.state.time, 0);
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
