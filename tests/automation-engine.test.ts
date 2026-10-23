import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { createDefaultAutomationConfig } from '../src/state/automation-storage';
import { CONDITION_SOURCES, DEFAULT_BUILDING_WEIGHT, blankConditionRow, blankTrigger, buildingWeightKey } from '../src/data/automation';
import { BUILDINGS } from '../src/data/buildings';
import type { BuildingId } from '../src/types/buildings';
import { createConditionContext, evaluateConditionRow, readConditionSource } from '../src/simulation/automation/conditions';
import type { AutomationValues } from '../src/simulation/automation/policy';
import { resolveAutomation } from '../src/simulation/automation/policy';
import { createAutomationEngine } from '../src/simulation/automation/engine';
import { buildWeight, collectWeightSignals, rankBuildTargets } from '../src/simulation/automation/weighting';
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

function config(patch: Record<string, unknown> = {}): AutomationConfig {
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

test('buildingMaxPerType 对自动建造与住房补建同时生效', () => {
  // 上限只挡一条建造路径是不够的：住房补建走的是另一条路径，实测会绕过上限。
  const capped = fresh();
  // 配置对象必须在 tick 之外建好：`config()` 每 tick 调一次，写成内联调用会每次都新建一份，
  // 让排序缓存永远失效（实测把一条测试拖到 37 秒）。
  const cappedConfig = config({ master: true, autoBuild: true, buildingMaxPerType: 1 });
  const engine = createAutomationEngine({ config: () => cappedConfig, random: () => 0.5 });
  for (let i = 0; i < 120; i++) engine.tick(capped);
  const overLimit = Object.entries(capped.buildings).filter(([id, count]) => count > 1 && id !== 'nest' && id !== 'forage' && id !== 'lumber' && id !== 'quarry');
  assert.deepEqual(overLimit, [], '上限为 1 时不该出现 2 座以上的建筑');
  assert.ok((capped.buildings.nest || 0) <= 5, `住房不应超过初始的 5 座，实际 ${capped.buildings.nest}`);

  const open = fresh();
  const openConfig = config({ master: true, autoBuild: true });
  const free = createAutomationEngine({ config: () => openConfig, random: () => 0.5 });
  for (let i = 0; i < 120; i++) free.tick(open);
  const before = fresh().buildings;
  const grew = (Object.keys(open.buildings) as (keyof typeof open.buildings)[])
    .some(id => (open.buildings[id] || 0) > (before[id] || 0));
  assert.ok(grew, '不设上限时应能建出多于初始数量的建筑');
});

test('autoBuildHousing 关闭后不再补住房；打开时才补', () => {
  const off = fresh();
  // 人口已顶到住房上限：此时唯一的出路是加建住房，关闭开关就应该真的不动。
  off.population = 15;
  const offConfig = config({ master: true, autoBuild: true, autoBuildHousing: false });
  const engineOff = createAutomationEngine({ config: () => offConfig, random: () => 0.5 });
  const nestBefore = off.buildings.nest || 0;
  for (let i = 0; i < 30; i++) engineOff.tick(off);
  assert.equal(off.buildings.nest || 0, nestBefore);

  const on = fresh();
  on.population = 15;
  const onConfig = config({ master: true, autoBuild: true, autoBuildHousing: true });
  const engineOn = createAutomationEngine({ config: () => onConfig, random: () => 0.5 });
  for (let i = 0; i < 30; i++) engineOn.tick(on);
  assert.ok((on.buildings.nest || 0) > (nestBefore || 0) || on.queue.some(item => item.kind === 'build'), '打开开关后应推进住房');
});

test('buildingBlacklist 里的建筑不会被自动建造', () => {
  const state = fresh();
  state.tech.push('storage');
  state.resources.wood = 5000;
  state.resources.cash = 5000;
  const blacklistConfig = config({ master: true, autoBuild: true, buildingBlacklist: ['warehouse'] });
  const engine = createAutomationEngine({ config: () => blacklistConfig, random: () => 0.5 });
  for (let i = 0; i < 60; i++) engine.tick(state);
  assert.equal(state.buildings.warehouse || 0, 0, '黑名单里的仓库不应被建造');
  assert.equal(state.queue.filter(item => item.kind === 'build' && item.id === 'warehouse').length, 0, '也不应进队列');
});

test('权重倍率真的参与排序：倍率为 0 时该类别消失，倍率提高时排名上升', () => {
  const state = fresh();
  state.tech.push('storage');
  state.buildings.warehouse = 1;
  state.resources.wood = 5000;
  state.resources.stone = 5000;
  state.resources.cash = 5000;
  // 把储量顶满：`buildingWeightingNeedStorage` 只在储量告急时命中。
  const context = createConditionContext(state);
  for (const key of Object.keys(context.storageCaps())) state.resources[key as keyof typeof state.resources] = context.storageCaps()[key as never] as never;
  const signals = collectWeightSignals(state);
  assert.equal(signals.storageTight, true, '前提：储量确实告急，否则这条规则不会命中');

  const withWeight = (multiplier: number) => ({ ...config({ master: true }).values, buildingWeightingNeedStorage: multiplier });
  const boosted = withWeight(5), killed = withWeight(0), neutral = withWeight(1);
  assert.ok(buildWeight('warehouse', state, signals, boosted) > buildWeight('warehouse', state, signals, neutral), '倍率 5 的权重应高于倍率 1');
  assert.equal(buildWeight('warehouse', state, signals, killed), 0, '倍率 0 的权重应归零');

  // 归零后必须真的从候选里淘汰，否则界面上的“设为 0 表示不再造”是假的。
  assert.equal(rankBuildTargets(state, killed).includes('warehouse'), false, '倍率归零的仓库不应出现在建造候选里');
  assert.equal(rankBuildTargets(state, neutral).includes('warehouse'), true, '倍率正常时仓库应在候选里');
});

test('触发器的 chain 让后续条目等前一条完成', () => {
  const state = fresh();
  state.resources.wood = 5000;
  state.resources.cash = 5000;
  const chained = config({ master: true, autoBuild: false, autoTrigger: true });
  // 第一条永不完成（要求 99 座巢），第二条理应被链条挡住。
  chained.triggers = [
    { ...blankTrigger(1), action: 'build', actionId: 'nest', actionCount: 99, left: 'number', leftArg: '1', operator: '==', right: 'number', rightArg: '1' },
    { ...blankTrigger(2), chain: true, action: 'build', actionId: 'warehouse', actionCount: 1, left: 'number', leftArg: '1', operator: '==', right: 'number', rightArg: '1' },
  ];
  const engine = createAutomationEngine({ config: () => chained, random: () => 0.5 });
  for (let i = 0; i < 20; i++) engine.tick(state);
  assert.equal(state.buildings.warehouse || 0, 0, 'chain 后面的触发器在前一条完成前不应执行');

  // 去掉 chain，第二条立刻能动。
  const unchained = config({ master: true, autoBuild: false, autoTrigger: true });
  unchained.triggers = [
    { ...blankTrigger(1), action: 'build', actionId: 'nest', actionCount: 99, left: 'number', leftArg: '1', operator: '==', right: 'number', rightArg: '1' },
    { ...blankTrigger(2), chain: false, action: 'build', actionId: 'warehouse', actionCount: 1, left: 'number', leftArg: '1', operator: '==', right: 'number', rightArg: '1' },
  ];
  const state2 = fresh();
  state2.resources.wood = 5000;
  state2.resources.cash = 5000;
  const engine2 = createAutomationEngine({ config: () => unchained, random: () => 0.5 });
  for (let i = 0; i < 20; i++) engine2.tick(state2);
  assert.ok((state2.buildings.warehouse || 0) > 0 || state2.queue.some(item => item.kind === 'build' && item.id === 'warehouse'), '不串联时应推进');
});

test('每个条件来源都能在真实状态上读出值：没有永远返回 undefined 的摆设来源', () => {
  // 这条挡的是"注册表里加了来源、读取器却没实现"：界面上可选、实际永远不成立。
  const state = fresh();
  state.buildings.warehouse = 1;
  state.buildings.mine = 1;
  state.workers.school = 1;
  const context = createConditionContext(state);
  const probes: Record<string, string> = {
    number: '5', boolean: 'true', string: 'x',
    resourceQuantity: 'food', resourceCap: 'food', resourceRatio: 'food', resourceIncome: 'food',
    resourceUnlocked: 'food', resourceSatisfied: 'food', resourceSatisfyRatio: 'food',
    buildingCount: 'nest', buildingRunning: 'nest', buildingStopped: 'nest', buildingUnlocked: 'nest',
    buildingPurchasable: 'nest', buildingQueued: 'nest', buildingCost: 'nest.wood', buildingAffordable: 'nest',
    techResearched: 'writing', techUnlocked: 'storage', techCostKnowledge: 'storage',
    population: '', idlePopulation: '', housingCapacity: '',
    jobWorkers: 'school', jobCapacity: 'school', jobUnlocked: 'school',
    happiness: '', taxRate: '', government: '', gameDays: '', clicks: '',
    queueLength: 'build', missionCompleted: 'asrielMissionCompleted', missionAvailable: 'asriel',
    soldierCount: '', woundedCount: '', armyLimit: '',
    neighborControlled: 'commonwealth', neighborMilitary: 'commonwealth',
    arpaCount: 'monument', arpaProgress: 'monument', arpaUnlocked: 'monument',
    shipComponentReady: 'hull', craftWorkers: '', factoryLineWorkers: 'alloy', smelterIdle: '',
    blackHoleMass: '', exoticMassRatio: '', ejectionAllocated: '',
    prestigeParticles: '', prestigeCasimir: '', prestigeDarkEnergy: '', prestigeCrystals: '',
    prestigeResets: 'nuclear', prestigeType: '', nuclearProgress: '',
    geneLevel: 'goodCat', dnaStock: 'C', speciesTrait: 'smart',
    containerFree: '', alloyContainerFree: '',
    resourceId: 'food', buildingId: 'nest', techId: 'writing',
  };
  const unresolved = CONDITION_SOURCES
    .filter(source => readConditionSource(context, source.id, probes[source.id] ?? '') === undefined)
    .map(source => source.id);
  assert.deepEqual(unresolved, [], '这些条件来源读不出值');
  // 反过来：注册表里的每一个来源都必须在探针表里点名，否则新增来源不会被这条测试覆盖。
  assert.deepEqual(Object.keys(probes).sort(), CONDITION_SOURCES.map(source => source.id).sort());
});

test('只打开主开关就能养活殖民地：四个保命模块默认开启', () => {
  // 玩家打开主开关却什么都没配置时，脚本必须至少不会饿死人口。
  // 实测（默认全关时）觅食岗位一个人都不派，食物线在 100 tick 内清零、人口归零。
  const config = createDefaultAutomationConfig();
  for (const key of ['autoWorkers', 'autoBuild', 'autoBuildHousing', 'autoResearch']) {
    assert.equal(config.values[key], true, `${key} 应默认开启`);
  }
  assert.equal(config.values.master, false, '主开关本身仍然默认关闭');

  const state = fresh();
  state.population = 6;
  config.values.master = true;
  const engine = createAutomationEngine({ config: () => config, random: () => 0.5 });
  const before = { pop: state.population, buildings: Object.values(state.buildings).reduce((a, b) => a + b, 0) };
  for (let i = 0; i < 80; i++) engine.tick(state);
  assert.ok((state.workers.forage || 0) > 0, `应派出觅食工人，实际 ${state.workers.forage}`);
  assert.ok(state.population > 0, `人口不应归零，实际 ${state.population}`);
  const after = Object.values(state.buildings).reduce((a, b) => a + b, 0);
  assert.ok(after > before.buildings, `建筑应增长：${before.buildings} -> ${after}`);
});

test('每座建筑都有自己的权重：提高会前移，归零会彻底退出候选', () => {
  // 对齐参考脚本的 `bld_w_<id>`：情境倍率管"这一类"，自身权重管"这一座"。
  const state = fresh();
  const signals = collectWeightSignals(state);
  const base = config({ master: true }).values as AutomationValues;
  const withOwn = (id: string, value: number): AutomationValues => ({ ...base, [buildingWeightKey(id)]: value });

  // 1. 权重是乘数：1000 应当是默认 100 的十倍。
  const normal = buildWeight('school', state, signals, base);
  assert.ok(normal > 0, '默认权重应为正');
  assert.ok(Math.abs(buildWeight('school', state, signals, withOwn('school', 1000)) - normal * 10) < 1e-6);
  // 2. 0 表示这一座不再自动建造。
  assert.equal(buildWeight('school', state, signals, withOwn('school', 0)), 0);
  assert.equal(rankBuildTargets(state, withOwn('school', 0)).includes('school'), false, '权重为 0 的建筑不该出现在候选里');
  assert.equal(rankBuildTargets(state, base).includes('school'), true, '默认权重下应该在候选里');

  // 3. 提高一座原本靠后的建筑，它必须真的前移（只断言不报错等于没测）。
  const ranked = rankBuildTargets(state, base);
  const tail = ranked[ranked.length - 1];
  assert.ok(tail, '前提：候选非空');
  const boosted = rankBuildTargets(state, withOwn(tail, 1000));
  assert.ok(boosted.indexOf(tail) < ranked.indexOf(tail), `${tail} 应前移：${ranked.indexOf(tail)} -> ${boosted.indexOf(tail)}`);

  // 4. 压低但不到 0：仍然合法，只是排到后面。
  const head = ranked[1];
  assert.ok(head, '前提：候选至少两项');
  const lowered = rankBuildTargets(state, withOwn(head, 0.01));
  assert.ok(lowered.includes(head), '压低不归零时仍在候选里');
  assert.ok(lowered.indexOf(head) > ranked.indexOf(head), `${head} 应后移`);
});

test('建筑权重的键覆盖注册表里的每一座建筑，默认值一致', () => {
  // 漏一座建筑就等于"这座建筑无法单独调"，而这一节的用途正是逐座调。
  const config = createDefaultAutomationConfig();
  const missing = (Object.keys(BUILDINGS) as BuildingId[]).filter(id => !Object.hasOwn(config.values, buildingWeightKey(id)));
  assert.deepEqual(missing, [], '这些建筑没有独立权重');
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    assert.equal(config.values[buildingWeightKey(id)], DEFAULT_BUILDING_WEIGHT, `${id} 的默认权重`);
  }
});
