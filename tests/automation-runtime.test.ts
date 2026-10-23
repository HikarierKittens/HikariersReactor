import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createRuntime } from '../src/app/runtime';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { createDefaultAutomationConfig, AUTOMATION_STORAGE_KEY, loadAutomationConfig } from '../src/state/automation-storage';

/**
 * 运行时接线：自动化必须真的在 tick 里跑起来，同时**不能**干扰存档流程。
 * 这两件事都很容易在重构中被悄悄破坏，所以分开断言。
 */

function environment(t: TestContext) {
  const writes = new Map<string, string>();
  let clock = 2_000_000;
  let monotonic = 0;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem(key: string) { return writes.get(key) ?? null; },
    setItem(key: string, value: string) { writes.set(key, value); },
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
    advance(seconds: number) { clock += seconds * 1000; monotonic += seconds * 1000; },
  };
}

/** 一个已经能跑起自动化的中期状态：有住房、有学校空位、有知识可花。 */
function readyState() {
  const state = createInitialState(CONFIG.version, 600, 2_000_000);
  state.population = 6;
  state.buildings.nest = 5;
  state.buildings.forage = 3;
  state.buildings.lumber = 2;
  state.buildings.quarry = 2;
  state.buildings.school = 1;
  state.tech.push('survival', 'tools', 'writing', 'mining', 'storage', 'music');
  state.resources.food = 500;
  state.resources.wood = 300;
  state.resources.stone = 300;
  state.resources.cash = 800;
  state.resources.knowledge = 2000;
  return state;
}

function enabledConfig() {
  const config = createDefaultAutomationConfig();
  Object.assign(config.values, { master: true, autoWorkers: true, autoBuild: true, autoResearch: true, tickInterval: 1 });
  return config;
}

test('自动化在 tick 里真正运行：开启后研究推进，关闭后完全不动', t => {
  const env = environment(t);
  env.writes.set(CONFIG.saveKey, JSON.stringify(readyState()));

  const active = createRuntime(enabledConfig());
  active.load();
  const techBefore = active.state.tech.length;
  for (let i = 0; i < 6; i++) { env.advance(1); active.tick(1); }
  assert.ok(active.state.tech.length > techBefore, `自动化应在 tick 中推进科技：${techBefore} -> ${active.state.tech.length}`);
  assert.ok(active.automationReport, '运行后应留下可读的运行报告');
  assert.equal(active.automationReport?.fault, null);

  // 同一个状态，主开关关闭：tick 不应该带来任何科技变化。
  env.writes.set(CONFIG.saveKey, JSON.stringify(readyState()));
  const idle = createRuntime({ ...createDefaultAutomationConfig() });
  idle.load();
  const idleBefore = idle.state.tech.length;
  for (let i = 0; i < 6; i++) { env.advance(1); idle.tick(1); }
  assert.equal(idle.state.tech.length, idleBefore);
});

test('自动化设置独立持久化，且不写进游戏存档', t => {
  const env = environment(t);
  env.writes.set(CONFIG.saveKey, JSON.stringify(readyState()));
  const runtime = createRuntime(createDefaultAutomationConfig());
  runtime.load();
  const config = enabledConfig();
  config.values.autoBuildKeepCash = 123;
  assert.equal(runtime.setAutomation(config), true);
  // 存在独立键下。
  assert.ok(env.writes.has(AUTOMATION_STORAGE_KEY));
  const restored = loadAutomationConfig({ getItem: key => env.writes.get(key) ?? null });
  assert.equal(restored.config.values.autoBuildKeepCash, 123);
  assert.equal(restored.restored, false);
  // 游戏存档本身不含自动化选项：存档 schema 与它无关。
  runtime.save();
  const saved = env.writes.get(CONFIG.saveKey) ?? '';
  assert.ok(!saved.includes('autoBuildKeepCash'), '自动化设置不得进入游戏存档');
});

test('自动化存储读不出来时回退默认值，游戏照常启动并可以正常存档', t => {
  const env = environment(t);
  env.writes.set(CONFIG.saveKey, JSON.stringify(readyState()));
  env.writes.set(AUTOMATION_STORAGE_KEY, '{broken json');
  const runtime = createRuntime();
  runtime.load();
  assert.equal(runtime.saveBlocked, false);
  assert.equal(runtime.state.buildings.nest, 5);
  assert.equal(runtime.automation.values.master, false);
  assert.equal(runtime.save(), true);
});
