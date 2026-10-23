import { isTechnologyUnlocked } from '../unlocks';
import { changeFactoryAssignment, changeWorkerAssignment } from '../commands';
import { buildPriceContext, calculateBuildingCost } from '../costs';
import { calculateWorkerCapacity } from '../building-production';
import { calculateProduction } from '../production';
import { applyAutoBuild, applyAutoCraft, applyAutoPower, applyAutoResearch, applyAutoWorkers, syncAutoWorkerSettings } from './modules';
import { createConditionContext, evaluateConditionRow } from './conditions';
import { resolveAutomation } from './policy';
import { buildAnchor, nextAutomationMission } from './planning';
import { calculateSupportPreview } from '../support-preview';
import { calculateAffordableProjectPercent, investInProject, isProjectAtLimit, isProjectUnlocked } from '../projects';
import { calculateAutomationHousingCapacity } from './conditions';
import { isPurchaseAllowed, queuePurchase, removeQueuedPurchase, requestPurchaseModule } from '../purchases';
import type { AutomationValues } from './policy';
import type { AutomationConfig, AutomationRunReport, AutomationTrigger } from '../../types/automation';
import type { BuildingId } from '../../types/buildings';
import type { TechnologyId } from '../../types/technologies';
import type { FactoryLineId } from '../../types/economy';
import type { GameState } from '../../types/state';

/**
 * 自动化引擎：一次运行 = 解析选项 → 触发器 → 各模块 → 扩展步。
 *
 * 三条不变量：
 * 1. 每 tick 只运行一次（由 runtime 调用），引擎本身不再 tick；
 * 2. 一切动作共用 `maxActionsPerRun` 预算，限制卡顿；
 * 3. 出错进入安全模式：记录原因并停止，避免同一异常每 tick 重复抛出。
 */

export interface AutomationEngine {
  /** 读取当前配置；界面修改后立即生效，不需要重建引擎。 */
  config: () => AutomationConfig;
  tick: (state: GameState) => AutomationRunReport;
  readonly fault: () => string | null;
  clearFault: () => void;
}

export interface EngineOptions {
  config: () => AutomationConfig;
  /** 可注入的随机源，测试用固定值。 */
  random?: () => number;
}

export function createAutomationEngine(options: EngineOptions): AutomationEngine {
  const random = options.random ?? Math.random;
  let fault: string | null = null;
  let tickIndex = 0;
  return {
    config: options.config,
    fault: () => fault,
    clearFault: () => { fault = null; },
    tick(state) {
      let config: AutomationConfig;
      let values: AutomationValues;
      try {
        // `options.config()` 也要包进 try：配置由界面层提供，读配置本身可能抛错
        // （导入中途被替换、存储实现异常）。脚本的任何异常都不允许冒到 tick 外面，
        // 否则整帧结算会被打断——自动化是可选功能，不能拖垮游戏主循环。
        config = options.config();
        values = resolveAutomation(config, createConditionContext(state)).values;
      } catch (error) {
        fault = describe(error);
        return { actions: 0, fault };
      }
      if (values.master !== true) { fault = null; return { actions: 0, fault: null }; }
      if (fault !== null && values.safeMode === true) return { actions: 0, fault };
      const interval = Math.max(1, Math.round(Number(values.tickInterval) || 1));
      tickIndex = (tickIndex + 1) % interval;
      if (tickIndex !== 0) return { actions: 0, fault: null };
      let budget = Math.max(1, Math.round(Number(values.maxActionsPerRun) || 40));
      let actions = 0;
      const spend = (count = 1) => { budget -= count; actions += count; };
      try {
        syncAutoWorkerSettings(state, values);
        // 顺序有讲究：扩展步先跑。它负责补住房和原料岗位——`applyAutoWorkers` 只碰自动分配
        // 岗位表，住房满/原料空转时它帮不上忙，而这两件事不解决，后面所有购买都会一直失败
        // （实测：全部猫猫被填进觅食，木材、石料零产出，脚本空转几百个 tick）。
        // 之后才是补岗 → 入队建造目标 → 触发器 → 直接购买 → 锻造与供电。
        actions += runFrontier(state, values, spend, random);
        // 扩展步与自动分配都要用人口，但只有最后一步才真正扣掉闲人：
        // 先跑 `applyAutoWorkers` 会把猫猫塞满食物岗位，扩展步就没人口可调了。
        actions += applyAutoWorkers(state, values);
        if (values.autoBuild === true) actions += enqueueAnchor(state, spend);
        if (values.autoTrigger === true) actions += runTriggers(state, config.triggers, values, spend, random);
        actions += applyAutoResearch(state, values);
        actions += applyAutoBuild(state, values);
        actions += applyAutoCraft(state, values);
        actions += applyAutoPower(state, values);
        fault = null;
        return { actions, fault: null };
      } catch (error) {
        const message = describe(error);
        fault = message;
        return { actions, fault: message };
      }
    },
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

// ---------------------------------------------------------------- 触发器

function runTriggers(
  state: GameState,
  triggers: readonly AutomationTrigger[],
  values: AutomationValues,
  spend: (count?: number) => void,
  random: () => number,
): number {
  const limit = Math.max(1, Math.round(Number(values.triggerRepeatLimit) || 1));
  let actions = 0;
  let previousDone = true;
  for (const trigger of triggers) {
    if (!trigger.enabled) continue;
    // `chain` 表示"上一条完成后本条才开始"；未启用或已完成的条目不影响后续链条。
    if (trigger.chain && !previousDone) { previousDone = false; continue; }
    const outcome = runTrigger(state, trigger, limit, spend, random);
    previousDone = outcome.done;
    actions += outcome.acts;
  }
  return actions;
}

function runTrigger(state: GameState, trigger: AutomationTrigger, limit: number, spend: (count?: number) => void, random: () => number): { done: boolean; acts: number } {
  let acts = 0;
  for (let attempt = 0; attempt < limit; attempt++) {
    if (!triggerCondition(state, trigger)) break;
    if (!performTriggerAction(state, trigger, random)) break;
    spend();
    acts++;
    if (triggerDone(state, trigger)) break;
  }
  return { done: triggerDone(state, trigger), acts };
}

function triggerCondition(state: GameState, trigger: AutomationTrigger): boolean {
  return evaluateConditionRow(createConditionContext(state), {
    left: trigger.left, leftArg: trigger.leftArg, operator: trigger.operator, right: trigger.right, rightArg: trigger.rightArg,
  }).matched;
}

/** 动作目标达到要求后不再重复；研究类以"已研究"为完成。 */
export function triggerDone(state: GameState, trigger: AutomationTrigger): boolean {
  if (trigger.action === 'research' || trigger.action === 'queueResearch') return state.tech.includes(trigger.actionId as TechnologyId);
  if (trigger.action === 'arpa') return (state.arpaBuildings[trigger.actionId as keyof typeof state.arpaBuildings] || 0) >= trigger.actionCount;
  return (state.buildings[trigger.actionId as BuildingId] || 0) >= trigger.actionCount;
}

/** 返回 true 表示本次真的改变了状态（用于预算计数）。 */
function performTriggerAction(state: GameState, trigger: AutomationTrigger, random: () => number): boolean {
  const moonAvailable = () => calculateSupportPreview(state).moon.available;
  if (trigger.action === 'research' || trigger.action === 'queueResearch') {
    if (!isTechnologyUnlocked(trigger.actionId, state) || state.tech.includes(trigger.actionId as TechnologyId)) return false;
    const result = requestPurchaseModule(state, 'tech', trigger.actionId, moonAvailable, trigger.action === 'queueResearch');
    return result.status === 'buy-now' || result.status === 'queued';
  }
  if (trigger.action === 'arpa') {
    if (!isProjectUnlocked(trigger.actionId, state) || isProjectAtLimit(trigger.actionId, state)) return false;
    const percent = calculateAffordableProjectPercent(trigger.actionId, state, 100);
    if (percent <= 0) return false;
    investInProject(trigger.actionId, state, percent, random, 1);
    return true;
  }
  if (!isPurchaseAllowed(state, 'build', trigger.actionId)) return false;
  // 建造类触发器同样必须进队列：`requestPurchaseModule(state, 'build', ...)` 在付不起时
  // 返回的是 `queue-full`，而不做任何事——显式入队才能让目标真的被推进。
  if (trigger.action === 'queueBuild' || state.buildings[trigger.actionId as BuildingId] === 0) {
    return queuePurchase(state, 'build', trigger.actionId as BuildingId).status === 'queued';
  }
  const result = requestPurchaseModule(state, 'build', trigger.actionId, moonAvailable, false);
  return result.status === 'buy-now';
}

// ---------------------------------------------------------------- 扩展步：让脚本真的能推进度

/**
 * `applyAutoBuild` 只买"已经能买"的建筑；付不起时它会一直等。扩展步让脚本能继续往前走：
 * 1. 住房满了就补住房：住房是人口上限，人口决定产出与资金收入，卡住就全盘停摆；
 * 2. 原料岗位：伐木/采石的产出是"造不造得起"的前提，产量为 0 时补人（有空闲人口时逐个补）；
 * 3. 打开工厂/冶炼厂生产线；4. 推进可用的区域探索。
 * 每 tick 最多做一件，且只在确实改变了状态时消耗预算。
 */
function runFrontier(state: GameState, values: AutomationValues, spend: (count?: number) => void, random: () => number): number {
  if (values.autoBuild !== true) return 0;
  // 食物是生存底线，永远第一步：饿死会把猫猫数打回 0，脚本再也起不来。
  // 它必须排在补住房之前——住房判断本身不占人口，但补完住房会立刻把新人口拉去干活。
  const foodsBefore = state.workers.forage || 0;
  ensureFoodCrew(state);
  if ((state.workers.forage || 0) > foodsBefore) { spend(); return 1; }
  if (state.population >= Math.floor(calculateAutomationHousingCapacity(state)) - 0.5) {
    for (const id of HOUSING) {
      if ((state.buildings[id] || 0) <= 0 || !isPurchaseAllowed(state, 'build', id)) continue;
      if (queuePurchase(state, 'build', id).status === 'queued') { spend(); return 1; }
    }
  }
  // 知识产量为 0 且学校还空着时，学者优先于其它岗位：科技树不动，后面的建筑根本不会解锁。
  // 排在原料缺口之前——木材、石料一旦补满，这里就再也轮不到（实测：跑满 3000 tick 仍是 3 项科技）。
  if (needsTeacher(state)) {
    if (changeWorkerAssignment(state, 'school', 1) > 0) { spend(); return 1; }
    // 学校抢不过觅食的岗位容量，只能明确从别的岗位调一只过去。
    if (moveWorkerTo(state, 'school')) { spend(); return 1; }
  }
  // 成本缺口优先：缺木材就补伐木、缺石料就补采石。只看"产量为 0"会让脚本在半路空转
  // （实测：木材堆到 400 上限、石料停在 4，建造目标一直付不起，几百个 tick 一动不动）。
  for (const job of deficientJobs(state)) {
    if ((state.buildings[job] || 0) <= 0) continue;
    if (assignOne(state, job)) { spend(); return 1; }
  }
  // 只是产量为 0（仓库里不缺货）时也补人，避免长链条上的某项一直空转。
  for (const job of liveJobs(state)) {
    if ((state.buildings[job] || 0) <= 0) continue;
    if (assignOne(state, job)) { spend(); return 1; }
  }
  if (state.buildings.factory > 0 && Object.values(state.lines).some(count => count === 0)) {
    for (const line of Object.keys(state.lines) as FactoryLineId[]) {
      if (state.lines[line] !== 0) continue;
      if (changeFactoryAssignment(state, line, 1) > 0) { spend(); return 1; }
    }
  }
  const mission = values.autoResearch === true ? nextAutomationMission(state) : null;
  if (mission) {
    const result = requestPurchaseModule(state, 'mission', mission, () => calculateSupportPreview(state).moon.available, true);
    if (result.status === 'buy-now' || result.status === 'queued') { spend(); return 1; }
  }
  void random;
  return 0;
}

/**
 * 食物是生存底线：这一轮无论如何先把觅食岗位补到安全线。
 *
 * 返回 false 表示"这一步已经用掉了本 tick 的动作"（补了人或腾了人）。饿死会把猫猫数打回 0，
 * 之后一切归零、脚本再也起不来，所以食物判断必须压在所有其它动作之前。
 */
function ensureFoodCrew(state: GameState): boolean {
  if ((state.buildings.forage || 0) <= 0) return true;
  if (foodBuffered(state)) return true;
  // 先补空位；没有空位时从别的原料岗位挪一只回来（反过来由 `freeWorkerFor` 挪出去）。
  const before = state.workers.forage || 0;
  changeWorkerAssignment(state, 'forage', 1);
  if ((state.workers.forage || 0) > before) return true;
  for (const donor of FREE_WORKER_DONORS) {
    if (donor === 'forage') continue;
    if ((state.workers[donor] || 0) <= 0) continue;
    if (changeWorkerAssignment(state, donor, -1) <= 0) continue;
    changeWorkerAssignment(state, 'forage', 1);
    if ((state.workers.forage || 0) > before) return true;
    changeWorkerAssignment(state, donor, 1);
  }
  return true;
}

/**
 * 往某个岗位补一只猫猫。先找空闲人口，没有空位时从觅食岗位临时挪一只（食物安全时）。
 *
 * 注意 `changeWorkerAssignment` 的返回值是"调整后的岗位人数"，不是差值——人数本来就是 0 时
 * 它会返回 0，看上去像失败，所以这里只认"人数确实变了"。
 */
function assignOne(state: GameState, job: BuildingId): boolean {
  if (!canHoldMore(state, job)) return false;
  const before = state.workers[job] || 0;
  changeWorkerAssignment(state, job, 1);
  if ((state.workers[job] || 0) > before) return true;
  return moveWorkerTo(state, job);
}

/** 还有教授空位、却没有知识产出：科技树不推进，后面的建筑根本不会解锁。 */
function needsTeacher(state: GameState): boolean {
  if ((state.buildings.school || 0) <= 0) return false;
  if ((calculateProduction(state, 1).rates.knowledge || 0) > 0) return false;
  return canHoldMore(state, 'school');
}

/** 岗位还能不能进人：`lumber`/`quarry` 上限是无穷，其它岗位吃完就不再补。 */
function canHoldMore(state: GameState, job: BuildingId): boolean {
  const capacity = calculateWorkerCapacity(job, state);
  return !Number.isFinite(capacity) || (state.workers[job] || 0) < capacity;
}

/**
 * 值得补人的岗位。木材和石料都要看：`quarry` 生产时会消耗木材，只盯着"木材产量为 0"会给
 * 采石补上一个闲人，接着把仓库里最后一点木材花光，两边一起停摆（实测）。
 *
 * 木材见底（产量 0 或存量不足）时不补采石：那时补采石等于把最后一点木材烧掉。
 */
function liveJobs(state: GameState): BuildingId[] {
  const rates = calculateProduction(state, 1).rates;
  const starved = (rates.wood || 0) <= 0 || (state.resources.wood || 0) < WOOD_RESERVE;
  const jobs: BuildingId[] = [];
  if ((rates.wood || 0) <= 0) jobs.push('lumber');
  if (!starved && (rates.stone || 0) <= 0) jobs.push('quarry');
  if (!jobs.length) {
    if ((state.buildings.lumber || 0) > 0) jobs.push('lumber');
    else if ((state.buildings.quarry || 0) > 0) jobs.push('quarry');
  }
  return jobs;
}

/** 木材存量低于这个数就先专心补伐木：采石每造一份石料都要花木材。 */
const WOOD_RESERVE = 50;

/**
 * 按"建造缺口"排出的原料岗位：锚点造价减去仓库存量，缺哪一项就补哪一项对应的岗位。
 * 采石不消耗木材，所以木料和石料可以并行补；建造费里的木材大头来自采石本身。
 */
function deficientJobs(state: GameState): BuildingId[] {
  const anchor = buildAnchor(state);
  if (!anchor) return [];
  const cost = calculateBuildingCost(anchor, state.buildings[anchor] || 0, state, buildPriceContext(state));
  const jobs: BuildingId[] = [];
  if ((cost.wood || 0) > (state.resources.wood || 0)) jobs.push('lumber');
  if ((cost.stone || 0) > (state.resources.stone || 0)) jobs.push('quarry');
  // 学校还空着却没人做学问时也把学校算进来：科技树不推进，后面的建筑根本不会解锁。
  if ((calculateProduction(state, 1).rates.knowledge || 0) <= 0 && (state.buildings.school || 0) > 0) jobs.unshift('school');
  return jobs;
}

/**
 * 从别的岗位挪一只猫猫去 `job`。
 *
 * 住房满了以后总人口是死的，会被觅食岗位填满，伐木/采石永远分不到人（实测整局停在
 * "木材 25、产量 0"）。只要求挪完食物产量仍为正：真的饿了 `ensureFoodCrew` 会把猫猫调回去。
 */
function moveWorkerTo(state: GameState, job: BuildingId): boolean {
  if (!canHoldMore(state, job)) return false;
  for (const donor of FREE_WORKER_DONORS) {
    if (donor === job) continue;
    if ((state.workers[donor] || 0) <= 0) continue;
    changeWorkerAssignment(state, donor, -1);
    if (!isFoodSafe(state)) {
      changeWorkerAssignment(state, donor, 1);
      continue;
    }
    if (changeWorkerAssignment(state, job, 1) > 0) {
      ensureFoodCrew(state);
      return true;
    }
    changeWorkerAssignment(state, donor, 1);
  }
  return false;
}

/** 可以被临时抽人的岗位。 */
const FREE_WORKER_DONORS: readonly BuildingId[] = ['forage', 'lumber', 'quarry', 'school'];

/**
 * 挪完这只猫猫以后食物还够不够吃。
 *
 * 判断依据是**产量方向**而不是库存：食物上限通常只有几百，按库存判断永远攒不够
 * （实测：仓库满 400，按人口算出的阈值却要 2700）。产量为正、且挪完仍为正，就说明这只
 * 猫猫可以走——真的饿了 `ensureFoodCrew` 会立刻把它调回来。
 */
function isFoodSafe(state: GameState): boolean {
  if ((calculateProduction(state, 1).rates.food || 0) <= 0) return false;
  return (state.workers.forage || 0) > 0;
}

/** 食物产量为正就算"吃得住"。 */
function foodBuffered(state: GameState): boolean {
  return (calculateProduction(state, 1).rates.food || 0) > 0;
}

/** 住房建筑：人口上限的唯一来源，卡住时必须优先补。 */
const HOUSING: readonly BuildingId[] = ['nest', 'nestMKII', 'apartment', 'catHut'];

/**
 * 把建造锚点加入队列。锚点已拥有但还能继续加建时由 `applyAutoBuild` 直接购买；
 * 这里只负责"从零开始的下一座"，避免和直接购买重复。
 *
 * 队列满时先清掉**已经造好**的建筑条目：那多半是脚本上一轮排进去的加建单，
 * 结算不再需要它，白占位置会让锚点永远排不进来。玩家还没造过的目标不动。
 */
function enqueueAnchor(state: GameState, spend: (count?: number) => void): number {
  const anchor = buildAnchor(state);
  if (!anchor) return 0;
  if (state.queue.some(item => item.kind === 'build' && item.id === anchor)) return 0;
  let result = queuePurchase(state, 'build', anchor);
  if (result.status !== 'queued') {
    const stale = state.queue.find(item => item.kind === 'build' && (state.buildings[item.id] || 0) > 0);
    if (!stale) return 0;
    removeQueuedPurchase(state, stale.uid);
    result = queuePurchase(state, 'build', anchor);
    if (result.status !== 'queued') return 0;
  }
  spend();
  return 1;
}
