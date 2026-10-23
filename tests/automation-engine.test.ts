import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { createDefaultAutomationConfig } from '../src/state/automation-storage';
import { blankConditionRow } from '../src/data/automation';
import { createConditionContext, evaluateConditionRow } from '../src/simulation/automation/conditions';
import { resolveAutomation } from '../src/simulation/automation/policy';
import { createAutomationEngine } from '../src/simulation/automation/engine';
import type { GameState } from '../src/types/state';
import type { AutomationConfig } from '../src/types/automation';

/**
 * 自动化跑的是**具体行为**：条件判断、覆盖表、引擎的开关语义与幂等性。
 * 每个断言都绑定到一个能真实出错的机制，不做"能不崩就算过"的恒真检查。
 */

function fresh(): GameState {
  const state = createInitialState(CONFIG.version, 60, 11);
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
  // 研究类断言需要知识：知识上限由建筑决定，所以直接给足并留出余量。
  state.resources.knowledge = 2000;
  return state;
}

function config(patch: Record<string, number | boolean | string> = {}): AutomationConfig {
  const created = createDefaultAutomationConfig();
  Object.assign(created.values, patch);
  return created;
}

test('条件表按 operator 逐条比较，且只在行上带值时输出取值', () => {
  const state = fresh();
  const context = createConditionContext(state);
  const row = { ...blankConditionRow(), left: 'resourceQuantity' as const, leftArg: 'wood', operator: '>=' as const, right: 'number' as const, rightArg: '300' };
  // 没有 value 的行只回答"成不成立"，不产出取值——否则覆盖表会把 undefined 写进设置。
  assert.deepEqual(evaluateConditionRow(context, row), { matched: true });
  assert.equal(evaluateConditionRow(context, { ...row, value: 7 }).value, 7);

  const notMatched = evaluateConditionRow(context, { ...row, rightArg: '301' });
  assert.equal(notMatched.matched, false);
  assert.equal(notMatched.value, undefined);

  // 取一个不存在的资源参数：读取器返回 undefined，条件判否而不是抛错或误判为真。
  assert.equal(evaluateConditionRow(context, { ...row, leftArg: 'no-such-resource' }).matched, false);
  // 未知操作符同样拒绝执行，保证旧配置不会在升级后突然全为真。
  assert.equal(evaluateConditionRow(context, { ...row, operator: '~~~' as never }).matched, false);
});

test('覆盖表自上而下、首个命中生效，并报告被改写的键', () => {
  const state = fresh();
  const created = config({ maxActionsPerRun: 10, autoCraft: true });
  const wood = (value: string) => ({
    ...blankConditionRow(), left: 'resourceQuantity' as const, leftArg: 'wood', operator: '>=' as const, right: 'number' as const, rightArg: value,
  });
  created.overrides.maxActionsPerRun = [{ ...wood('1000'), value: 3 }, { ...wood('300'), value: 7 }];
  created.overrides.autoCraft = [{ ...wood('300'), value: false }];

  const resolved = resolveAutomation(created, createConditionContext(state));
  // 第一条不命中（木材没有 1000），第二条命中：7 而不是 3。
  assert.equal(resolved.values.maxActionsPerRun, 7);
  assert.equal(resolved.values.autoCraft, false);
  assert.ok(resolved.overridden.has('maxActionsPerRun'));
  assert.ok(resolved.overridden.has('autoCraft'));
  // 没写覆盖表的键保持原值，且不被标记为覆盖。
  assert.equal(resolved.values.researchKeepKnowledge, 0);
  assert.equal(resolved.overridden.has('researchKeepKnowledge'), false);
});

test('覆盖行给出类型不符的取值时忽略该行，退回原值', () => {
  const state = fresh();
  const created = config({ autoCraft: true });
  created.overrides.autoCraft = [{ ...blankConditionRow(), value: 'not-a-boolean' }];
  const resolved = resolveAutomation(created, createConditionContext(state));
  assert.equal(resolved.values.autoCraft, true);
  assert.equal(resolved.overridden.has('autoCraft'), false);
});

test('主开关关闭时一个动作都不做，连自动分配也不碰', () => {
  const state = fresh();
  const before = JSON.stringify({ workers: state.workers, queue: state.queue, buildings: state.buildings });
  const engine = createAutomationEngine({ config: () => config({ master: false, autoWorkers: true, autoBuild: true }) });
  for (let i = 0; i < 20; i++) {
    assert.equal(engine.tick(state).actions, 0);
  }
  assert.equal(JSON.stringify({ workers: state.workers, queue: state.queue, buildings: state.buildings }), before);
});

test('运算间隔按 tick 生效：间隔为 3 时每三 tick 才运行一次', () => {
  // 计数器属于引擎实例，所以必须用同一个引擎、同一份状态连续调用。
  // 服务端为每次运行单独记一次"是否运行过"：这里用引擎自己的报告，逐次落到位置 3、6。
  const state = fresh();
  const engine = createAutomationEngine({ config: () => config({ master: true, tickInterval: 3, autoResearch: true }) });
  const ran: number[] = [];
  for (let i = 1; i <= 6; i++) {
    // 每个 tick 前把知识补回上限，保证"运行了就一定有事可做"。
    state.resources.knowledge = 2000;
    const result = engine.tick(state);
    if (result.actions > 0) ran.push(i);
  }
  assert.deepEqual(ran, [3, 6]);
});

test('间隔为 1 时每个 tick 都运行', () => {
  const state = fresh();
  const engine = createAutomationEngine({ config: () => config({ master: true, tickInterval: 1, autoResearch: true }) });
  // 第 1 次调用就该运行：计数器从 0 开始，第一次推进后正好落在 1 % 1 === 0。
  const before = state.tech.length;
  engine.tick(state);
  assert.ok(state.tech.length > before);
});

test('同一个状态连续运行是幂等的：第二次不会再做出同样的动作', () => {
  const state = fresh();
  const engine = createAutomationEngine({ config: () => config({ master: true, autoWorkers: true, autoBuild: true, autoResearch: true }), random: () => 0.5 });
  engine.tick(state);
  const queueAfterFirst = state.queue.length;
  const buildingsAfterFirst = JSON.stringify(state.buildings);
  // 不再推进游戏时间，只重复运行脚本：状态已是最优响应，不应该继续堆队列或重复建造。
  for (let i = 0; i < 5; i++) engine.tick(state);
  assert.ok(state.queue.length <= queueAfterFirst + 1, `队列不应无限增长：${queueAfterFirst} -> ${state.queue.length}`);
  assert.equal(JSON.stringify(state.buildings), buildingsAfterFirst);
});

test('相同的初始状态与注入随机源得到完全相同的结果（可复现）', () => {
  function runOnce(): string {
    const state = fresh();
    const engine = createAutomationEngine({ config: () => config({ master: true, autoWorkers: true, autoBuild: true, autoResearch: true }), random: () => 0.5 });
    const actions: number[] = [];
    for (let i = 0; i < 40; i++) actions.push(engine.tick(state).actions);
    return JSON.stringify({ actions, workers: state.workers, queue: state.queue.map(item => `${item.kind}:${item.id}`), tech: [...state.tech].sort() });
  }
  assert.equal(runOnce(), runOnce());
});

test('自动研究真的会研究：知识够时科技数量增加', () => {
  const state = fresh();
  const before = state.tech.length;
  const engine = createAutomationEngine({ config: () => config({ master: true, autoResearch: true }) });
  engine.tick(state);
  assert.ok(state.tech.length > before, `应该研究出新科技：${before} -> ${state.tech.length}`);
});

test('自动研究关闭时不动科技树', () => {
  const state = fresh();
  const before = [...state.tech].sort();
  const engine = createAutomationEngine({ config: () => config({ master: true, autoResearch: false, autoBuild: false, autoWorkers: false }) });
  engine.tick(state);
  assert.deepEqual([...state.tech].sort(), before);
});

test('引擎异常被记录成 fault 而不是抛出：安全模式下随后停止动作', () => {
  const state = fresh();
  // 用一个会在求值阶段抛错的配置工厂：这是脚本最可能遇到外部异常的位置
  // （例如配置在运行途中被换成不完整对象），必须被捕获而不是让整帧崩掉。
  let broken = false;
  const engine = createAutomationEngine({
    config: () => {
      if (broken) throw new Error('配置读不出来');
      return config({ master: true, autoResearch: true });
    },
  });
  assert.equal(engine.tick(state).fault, null);
  broken = true;
  const failed = engine.tick(state);
  assert.ok(failed.fault, '应记录故障信息');
  assert.match(String(failed.fault), /配置读不出来/);
  assert.equal(engine.fault(), failed.fault);
  // 安全模式（默认开启）下，有未清除的故障就不再执行动作。
  const afterFault = engine.tick(state);
  assert.equal(afterFault.actions, 0);
  engine.clearFault();
  assert.equal(engine.fault(), null);
});
