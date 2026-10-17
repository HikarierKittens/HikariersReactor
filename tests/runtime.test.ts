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
import { validateAndMigrateSave } from '../src/state/validate-save';
import { validateProjectRecords } from '../src/state/validate-projects';
import { validateCivilization } from '../src/state/validate-civilization';
import { persistGame } from '../src/state/persistence';
import { settlePurchaseQueue } from '../src/simulation/purchases';
import { createMilestoneState } from './fixtures/milestones';
import { readFileSync } from 'node:fs';

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

test('pre-beta0.6.5 load, import and protected-save recovery preserve earned progress', t => {
  const env = environment(t);
  const json = readFileSync(new URL('./fixtures/pre-beta0.6.5-schema31.json', import.meta.url), 'utf8');
  const original = JSON.parse(json);
  original.prestige.harmonyCrystals = 0;
  original.prestige.ascensionResets = 0;
  original.statistics.lifetime.harmonyCrystalsEarned = 0;
  env.writes.set(CONFIG.saveKey, json);
  const runtime = createRuntime(); runtime.load();
  assert.equal(runtime.saveBlocked, false);
  const check = (state: typeof runtime.state) => {
    for (const field of ['buildings', 'workers', 'stoppedBuildings'] as const) assert.equal(state[field].hazardousMaterialStorage, 0);
    for (const field of ['tech', 'queue', 'logs', 'prestige', 'achievements', 'stageThree', 'statistics', 'story'] as const) assert.deepEqual(state[field], original[field]);
    assert.equal(state.time, original.time);
    assert.equal(state.clicks, original.clicks);
    assert.equal(state.buildings.spaceRipper, 99);
  };
  check(runtime.state);
  assert.equal(runtime.save(), true);
  const reloaded = createRuntime(); reloaded.load(); check(reloaded.state);
  env.writes.set(CONFIG.saveKey, '{broken');
  const protectedRuntime = createRuntime(); protectedRuntime.load();
  assert.equal(protectedRuntime.saveBlocked, true);
  assert.equal(protectedRuntime.save(), false);
  assert.equal(env.writes.get(CONFIG.saveKey), '{broken');
  assert.equal(protectedRuntime.importSave(json), true);
  assert.equal(protectedRuntime.saveBlocked, false);
  check(protectedRuntime.state);
  const recovered = createRuntime(); recovered.load(); check(recovered.state);
});

test('ascension prestige roundtrips and malformed new fields preserve protected save bytes', t => {
  const env = environment(t);
  const state = env.state();
  state.prestige.harmonyCrystals = 8; state.prestige.ascensionResets = 3;
  state.prestigeUnlocked = ['harmonyCrystals']; state.statistics.lifetime.harmonyCrystalsEarned = 11;
  env.writes.set(CONFIG.saveKey, JSON.stringify(state));
  const runtime = createRuntime(); runtime.load();
  assert.equal(runtime.saveBlocked, false); assert.equal(runtime.state.prestige.harmonyCrystals, 8);
  assert.equal(runtime.state.statistics.lifetime.harmonyCrystalsEarned, 11);
  assert.equal(runtime.save(), true);
  const reloaded = createRuntime(); reloaded.load();
  assert.equal(reloaded.state.prestige.ascensionResets, 3);
  assert.deepEqual(reloaded.state.prestigeUnlocked, ['harmonyCrystals']);
  const malformed = JSON.parse(JSON.stringify(state)); malformed.prestige.harmonyCrystals = '8';
  const badBytes = JSON.stringify(malformed); env.writes.set(CONFIG.saveKey, badBytes);
  const protectedRuntime = createRuntime(); protectedRuntime.load();
  assert.equal(protectedRuntime.saveBlocked, true); assert.equal(protectedRuntime.save(), false);
  assert.equal(env.writes.get(CONFIG.saveKey), badBytes);
  assert.equal(protectedRuntime.importSave(JSON.stringify(state)), true);
  assert.equal(protectedRuntime.saveBlocked, false);
  const recovered = createRuntime(); recovered.load();
  assert.equal(recovered.state.prestige.harmonyCrystals, 8);
  assert.equal(recovered.state.statistics.lifetime.harmonyCrystalsEarned, 11);
});

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

test('long background gaps settle in bounded batches and replacement discards pending debt', t => {
  const env = environment(t);
  const runtime = createRuntime(); runtime.load();
  env.advance(8 * 3600);
  runtime.tick(.2);
  assert.equal(runtime.state.time, 10, 'never synchronously run 28800 full settlements');
  runtime.tick(.2);
  assert.equal(runtime.state.time, 20, 'remaining debt continues on subsequent turns');
  const replacement = env.state();
  runtime.replaceState(replacement);
  runtime.tick(.2);
  assert.equal(runtime.state.time, 0, 'import/reset cannot inherit another save’s pending simulation');
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

test('historical schema imports reject atomically while current progress roundtrips', () => {
 const raw=createMilestoneState('moon',{buildings:{asrielSpaceport:2}});raw.resources.mithril=42;raw.stoppedBuildings.asrielSpaceport=1;
 const before=structuredClone(raw), restored=validateAndMigrateSave(raw,saveContext);
 assert.deepEqual(raw,before);assert.equal(restored.resources.mithril,42);assert.equal(restored.buildings.asrielSpaceport,2);assert.equal(restored.stoppedBuildings.asrielSpaceport,1);
 assert.deepEqual(validateAndMigrateSave(JSON.parse(JSON.stringify(restored)),saveContext),restored);
 for(let version=12;version<=30;version++){const old={...structuredClone(raw),version},snapshot=structuredClone(old);assert.throws(()=>validateAndMigrateSave(old,saveContext),/版本|兼容/);assert.deepEqual(old,snapshot);}
});

test('retired Asriel queued flag rejects while explicit mission queue work survives', () => {
 const raw=createMilestoneState('moon');raw.asrielMissionCompleted=false;
 raw.queue=[{uid:1,kind:'mission',id:'asriel'}];
 const restored=validateAndMigrateSave(raw,saveContext);assert.deepEqual(restored.queue,raw.queue);
 restored.resources.helium3=10000;settlePurchaseQueue(restored,()=>1);
 assert.equal(restored.asrielMissionCompleted,true);assert.deepEqual(restored.queue,[]);
 for(const value of [true,null])assert.throws(()=>validateAndMigrateSave({...raw,asrielMissionQueued:value},saveContext));
});

test('absent commercial stopped counts reject but explicit malformed counts reject', () => {
  const raw = createInitialState(CONFIG.version, 60, 0);
  const stopped = { ...raw.stoppedBuildings };
  Reflect.deleteProperty(stopped, 'catCafe'); Reflect.deleteProperty(stopped, 'touristCenter');
  assert.throws(() => validateAndMigrateSave({ ...raw, stoppedBuildings: stopped }, saveContext));
  for (const id of ['catCafe', 'touristCenter']) for (const value of [null, -1, .5, 1, '0', NaN, Infinity]) {
    assert.throws(() => validateAndMigrateSave({ ...raw, stoppedBuildings: { ...stopped, [id]: value } }, saveContext));
  }
});

test('explicit project tracking uses strict row invariants and is roundtrip idempotent', () => {
  const fullSave = createMilestoneState('moon');
  fullSave.arpaProgress.monument = 37.5;
  fullSave.arpaResourceProgress.monument = { stone: 37.5 };
  const firstLoad = validateAndMigrateSave(fullSave, saveContext);
  const secondLoad = validateAndMigrateSave(JSON.parse(JSON.stringify(firstLoad)), saveContext);
  assert.deepEqual(secondLoad, firstLoad);
  const raw = createInitialState(CONFIG.version, 60, 0);
  raw.tech = ['arpa', 'rocketry'];
  raw.arpaProgress.rocketPlatform = 37.5;
  raw.arpaResourceProgress.rocketPlatform = { metal: 37.5, alloy: 37.5 };
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
  assert.throws(() => validateProjectRecords(raw as unknown as Record<string, unknown>, restored), /工程进度与投入不一致/);
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

test('display-only history stays tolerant while unknown settings reject', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  assert.throws(() => validateAndMigrateSave({ ...state, settings: { ...state.settings, futureOption: { enabled: true } } }, saveContext), /游戏设置/);
  const restored = validateAndMigrateSave({ ...state, logs: [null, { text: 1, time: 0 }, { text: 'retained', time: 0, type: 'futureType' }] }, saveContext);
  assert.deepEqual(restored.settings, state.settings);
  assert.deepEqual(restored.logs, [{ text: 'retained', time: 0, type: 'progress' }]);
});

test('protected export preserves malformed raw bytes and can retry a failed storage read', t => {
 const env=environment(t), text='  { broken old save\n'; env.writes.set(CONFIG.saveKey,text);
 const runtime=createRuntime();runtime.load();
 env.failRead=true;assert.equal(runtime.exportProtectedSave(),text);
 assert.equal(env.saves,0);assert.equal(runtime.saveBlocked,true);
 const retry=createRuntime();retry.load();
 assert.throws(()=>retry.exportProtectedSave(),/无法读取/);
 env.failRead=false;assert.equal(retry.exportProtectedSave(),text);
 assert.equal(env.writes.get(CONFIG.saveKey),text);
});

for(const version of [12,29,30])test(`incompatible v${version} guides backup before optional hard reset and protects original until successful persistence`,t=>{
 const env=environment(t),raw=JSON.stringify({...env.state(),version});env.writes.set(CONFIG.saveKey,raw);
 const runtime=createRuntime();runtime.load();
 assert.equal(runtime.saveBlocked,true);assert.equal(runtime.saveFailed,true);
 const guidance=runtime.state.logs.map(row=>row.text).join(' ');
 for(const text of ['备份原档','更新后重载或导入备份','schema12～30仍不支持','只有决定放弃原进度','设置','硬重置','完全清空','导出不兼容的旧版本存档'])assert.ok(guidance.includes(text),text);
 env.advance(20);runtime.tick(.2);assert.equal(runtime.save(),false);assert.equal(runtime.reset('soft'),false);
 assert.equal(env.saves,0);assert.equal(env.writes.get(CONFIG.saveKey),raw);
 assert.equal(runtime.exportProtectedSave(),raw);assert.equal(runtime.saveBlocked,true);assert.equal(env.saves,0);
 env.failWrite=true;assert.equal(runtime.reset('hard'),false);assert.equal(runtime.saveBlocked,true);assert.equal(env.writes.get(CONFIG.saveKey),raw);
 assert.ok(runtime.state.logs.some(row=>row.text.includes('新存档写入失败')));
 env.failWrite=false;assert.equal(runtime.reset('hard'),true);assert.equal(runtime.saveBlocked,false);assert.equal(runtime.saveFailed,false);
 assert.throws(()=>runtime.exportProtectedSave(),/未处于保护模式/);
 const saved=JSON.parse(env.writes.get(CONFIG.saveKey)!);assert.equal(saved.version,CONFIG.version);assert.equal(saved.time,0);assert.equal(saved.prestige.particles,0);
});
