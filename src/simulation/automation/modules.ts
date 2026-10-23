import { CRAFT_RECIPES } from '../../data/resources';
import { BUILDINGS } from '../../data/buildings';
import { calculateWorkerCapacity } from '../building-production';
import { countSparePopulation } from '../ship-crew';
import { calculateCraftingMultiplier, calculateMaxCraftable } from '../crafting';
import { calculateTechCost } from '../government';
import { calculateStorageTotals } from '../storage';
import { calculateSupportPreview } from '../support-preview';
import { purchaseQueueCapacity } from '../queue-settings';
import { isResourceUnlocked, isTechnologyUnlocked } from '../unlocks';
import { isPurchaseAllowed, requestPurchaseModule, researchTechnologyNow } from '../purchases';
import { rankBuildTargets, rankResearchTargets } from './weighting';
import { getBuildingPowerDemand, reconcilePowerActivationOrder, setBuildingPowerEnabled } from '../power-grid';
import { calculateProduction } from '../production';
import { AUTO_WORKER_JOBS, setAutoWorkerEnabled, setAutoWorkerLimit, setAutoWorkersEnabled } from '../auto-workers';
import { changeEjectionAllocation, stabilizeBlackHole } from '../black-hole';
import { changeContainerAssignment } from '../commands';
import { changeDownloadAllocation } from '../download-command';
import { changeFactoryAssignment, changeSmelterAssignment } from '../commands';
import { completeRegionalMissionNow } from '../space-missions';
import { isProjectUnlocked, investInProject } from '../projects';
import { listValue, numericValue, stringValue } from './policy';
import type { AutomationValues } from './policy';
import type { GameState } from '../../types/state';
import type { BuildingId } from '../../types/buildings';
import type { CraftId, ResourceId } from '../../types/economy';

/**
 * 自动化的执行动作。
 *
 * 每个动作都**只调用现有命令函数**：自动建造走 `requestPurchaseModule`，自动研究走
 * `researchTechnologyNow`，工作分配读写 `autoWorkers`，开关走 `power-grid`。因此自动化的
 * 结果与玩家手动操作走同一套结算，不会出现"脚本以为买了、实际没买"。
 *
 * 模块只接收已解析的 `AutomationValues`（默认值 + 覆盖表结果），不读配置原文。
 */

// ---------------------------------------------------------------- 工作分配

/**
 * 用空闲人口填补已启用岗位，保留 `reservePopulation` 只空闲猫猫；从不从其他岗位调人。
 *
 * 岗位填充顺序优先使用玩家配置的 `jobPriority`，其次使用游戏里排好的 `autoWorkers.priority`。
 */
export function applyAutoWorkers(state: GameState, values: AutomationValues): number {
  if (values.autoWorkers !== true) return 0;
  const reserve = Math.max(0, Math.floor(numericValue(values, 'reservePopulation')));
  const perJobLimit = Math.max(0, Math.floor(numericValue(values, 'jobFillLimit')));
  const disabled = new Set(listValue(values, 'jobDisabled'));
  const configured = listValue(values, 'jobPriority') as BuildingId[];
  const order: BuildingId[] = configured.length > 0
    ? configured
    : (state.autoWorkers.priority as BuildingId[]);
  let idle = countSparePopulation(state) - reserve;
  if (idle <= 0) return 0;
  let assigned = 0;
  // 原料优先：`AUTO_WORKER_JOBS` 负责食物与后续产业，但伐木/采石的产出是"造不造得起"的前提。
  // 它们不在自动分配的岗位表里，缺了就会把所有猫猫填进食物的上限、整条建造链停摆。
  for (const { job, resource } of MATERIAL_JOBS) {
    if (idle <= 0) break;
    if ((state.buildings[job] || 0) <= 0 || !isJobUnlocked(state, job, false)) continue;
    const current = state.workers[job] || 0;
    if (current >= MATERIAL_MIN_WORKERS) continue;
    const needed = materialDeficit(state, resource);
    if (needed <= 0) continue;
    const amount = Math.min(idle, Math.max(0, MATERIAL_MIN_WORKERS - current));
    state.workers[job] = current + amount;
    idle -= amount;
    assigned += amount;
  }
  // 教授的格子要单独看：`school` 不在岗位优先级表里时，空闲人口会全部灌进觅食这类岗位，
  // 知识产量一直是 0，科技树永远停在开局（实测：跑满 3000 tick 仍是 3 项科技）。
  const teacherSlots = Math.max(0, calculateWorkerCapacity('school', state) - (state.workers.school || 0));
  if (idle > 0 && teacherSlots > 0 && (calculateProduction(state, 1).rates.knowledge || 0) <= 0) {
    const amount = Math.min(idle, teacherSlots);
    state.workers.school = (state.workers.school || 0) + amount;
    idle -= amount;
    assigned += amount;
  }
  for (const id of order) {
    if (idle <= 0) break;
    if (disabled.has(id)) continue;
    const building = BUILDINGS[id];
    if (!building) continue;
    if (building.unlimited) continue;
    const job = state.autoWorkers.jobs[id];
    // 优先列表里明确点名的岗位即使未在自动分配表里启用，也按容量填满。
    const listed = configured.includes(id);
    if (!listed && (!job?.enabled || !isJobUnlocked(state, id))) continue;
    if (listed && !isJobUnlocked(state, id)) continue;
    const capacity = calculateWorkerCapacity(id, state);
    if (!Number.isFinite(capacity)) continue;
    const gameLimit = job && Number.isSafeInteger(job.limit) && job.limit >= 0 ? job.limit : -1;
    let target = gameLimit === -1 ? capacity : Math.min(capacity, gameLimit);
    if (perJobLimit > 0) target = Math.min(target, perJobLimit);
    const amount = Math.min(idle, Math.max(0, target - (state.workers[id] || 0)));
    if (!(amount > 0)) continue;
    state.workers[id] = (state.workers[id] || 0) + amount;
    idle -= amount;
    assigned += amount;
    if (values.autoWorkersFollowCapacity === true && (state.workers[id] || 0) >= capacity) continue;
  }
  return assigned;
}

/** 原料岗位：产出决定"造不造得起"，必须排在食物岗位之前。 */
const MATERIAL_JOBS: readonly { job: BuildingId; resource: ResourceId }[] = [
  { job: 'lumber', resource: 'wood' },
  { job: 'quarry', resource: 'stone' },
];

/** 原料岗位的最低人数：先补到 1 只（能让产量从 0 变成正数），之后按缺口逐个补。 */
const MATERIAL_MIN_WORKERS = 1;

/**
 * 岗位是否已解锁：所在科技已研究（`theater` 的科技挂在猫咖上）。
 *
 * `skipUnlimited` 用于自动分配表：那里排除不限人数的岗位（例如伐木/采石的容量是
 * `Infinity`，会自动吃掉全部空闲人口，导致食物岗位饿死）。原料岗位自己处理，不受这条限制。
 */
export function isJobUnlocked(state: GameState, id: BuildingId, skipUnlimited = true): boolean {
  const building = BUILDINGS[id];
  if (!building) return false;
  if (skipUnlimited && building.unlimited) return false;
  return state.tech.includes(building.tech) || (id === 'theater' && state.tech.includes(BUILDINGS.catCafe.tech));
}

/**
 * 原料缺口：产量为 0、且仓库里另一种原料还有存货或队列里挂着建造单时返回 1，否则 0。
 * "仓库里有另一种原料"是关键——两种原料同时见底时补谁都没用，先让食物岗位把人喂住。
 */
function materialDeficit(state: GameState, resource: ResourceId): number {
  if ((calculateProduction(state, 1).rates[resource] || 0) > 0) return 0;
  const others = (['wood', 'stone'] as ResourceId[]).filter(id => id !== resource);
  const stocked = others.some(id => (state.resources[id] || 0) > 0);
  return stocked || state.queue.some(item => item.kind === 'build') ? 1 : 0;
}

/** 让"游戏设置里的自动分配"与自动化开关保持一致；只改自动分配本身，不动已分配工人。 */
export function syncAutoWorkerSettings(state: GameState, values: AutomationValues): void {
  const enabled = values.autoWorkers === true;
  if (state.autoWorkers.enabled !== enabled) setAutoWorkersEnabled(state, enabled);
  if (!enabled) return;
  for (const id of AUTO_WORKER_JOBS) {
    const job = state.autoWorkers.jobs[id];
    if (!job || job.enabled) continue;
    setAutoWorkerEnabled(state, id, true);
    setAutoWorkerLimit(state, id, -1);
  }
}

// ---------------------------------------------------------------- 自动研究

/** 按研究排序立即研究可支付科技；`researchFillQueue` 打开时把其余目标加入队列。 */
export function applyAutoResearch(state: GameState, values: AutomationValues): number {
  if (values.autoResearch !== true) return 0;
  const mode = stringValue(values, 'researchOrder');
  if (mode === 'manual') return 0;
  const keep = Math.max(0, numericValue(values, 'researchKeepKnowledge'));
  const maxQueue = Math.max(0, numericValue(values, 'researchMaxQueue'));
  const moonAvailable = () => calculateSupportPreview(state).moon.available;
  const queueCap = maxQueue > 0 ? Math.min(maxQueue, purchaseQueueCapacity(state, 'tech')) : purchaseQueueCapacity(state, 'tech');
  let researched = 0;
  for (const id of rankResearchTargets(state, values)) {
    if (!isTechnologyUnlocked(id, state)) continue;
    const affordable = (calculateTechCost(id, state).knowledge || 0) <= (state.resources.knowledge || 0) - keep;
    if (!affordable) {
      if (values.researchFillQueue === true
        && !state.queue.some(item => item.kind === 'tech' && item.id === id)
        && state.queue.filter(item => item.kind === 'tech').length < queueCap) {
        requestPurchaseModule(state, 'tech', id, moonAvailable, true);
      }
      continue;
    }
    if (researchTechnologyNow(state, id).bought) researched++;
  }
  return researched;
}

// ---------------------------------------------------------------- 自动建造

/**
 * 按规划顺序尝试建造：能立刻付钱的直接买，付不起的交给队列。
 *
 * 顺序取自 `rankBuildTargets`（优先列表 + 权重表），而不是注册表顺序——注册表顺序会把
 * 采石排在伐木前面，实测会把木材吃光导致两边一起停摆。
 */
export function applyAutoBuild(state: GameState, values: AutomationValues): number {
  if (values.autoBuild !== true) return 0;
  if (stringValue(values, 'buildingMode') === 'manual') return 0;
  const keepCash = Math.max(0, numericValue(values, 'autoBuildKeepCash'));
  const passes = Math.max(1, Math.min(12, Math.round(numericValue(values, 'buildingBuildPassCount') || 1)));
  const respectQueue = values.buildingPriorityRespectQueue === true;
  // `autoBuildHousing` 关闭时，住房不该从任何一条路径被建成（自动建造会顺带选中它）。
  const targets = values.autoBuildHousing === false
    ? rankBuildTargets(state, values).filter(id => !HOUSING_IDS.includes(id))
    : rankBuildTargets(state, values);
  let bought = 0;
  for (let pass = 0; pass < passes; pass++) {
    let progressed = false;
    for (const id of targets) {
      if (!isPurchaseAllowed(state, 'build', id)) continue;
      if (respectQueue && state.queue.some(item => item.kind === 'build' && item.id === id)) continue;
      if (keepCash > 0 && needsCash(id) && (state.resources.cash || 0) <= keepCash) continue;
      if (requestPurchaseModule(state, 'build', id, () => calculateSupportPreview(state).moon.available, false).status === 'buy-now') {
        bought++;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return bought;
}

/** 住房建筑：`autoBuildHousing` 关闭时从自动建造里整体排除。 */
const HOUSING_IDS: readonly BuildingId[] = ['nest', 'nestMKII', 'apartment', 'catHut'];

/** 该建筑是否消耗资金；用注册表基价判断，不受递增与折扣影响。 */
const needsCash = (id: BuildingId): boolean => ((BUILDINGS[id].cost?.cash ?? 0) as number) > 0;

// ---------------------------------------------------------------- 自动锻造

/** 原料高于保留比例、产物低于目标比例时补足锻造物。 */
export function applyAutoCraft(state: GameState, values: AutomationValues): number {
  if (values.autoCraft !== true) return 0;
  if (!(state.buildings.foundry > 0 || state.buildings.planetaryFoundry > 0 || (state.buildings.stellarForge || 0) > 0)) return 0;
  const reserve = Math.min(1, Math.max(0, numericValue(values, 'craftReserveRatio')));
  const target = Math.min(1, Math.max(0, numericValue(values, 'craftTargetRatio')));
  const maxPerRun = Math.max(1, Math.round(numericValue(values, 'craftMaxPerRun') || 1));
  const blacklist = new Set(listValue(values, 'craftBlacklist'));
  const priority = listValue(values, 'craftPriority') as CraftId[];
  const order: CraftId[] = priority.length > 0 ? priority : (Object.keys(CRAFT_RECIPES) as CraftId[]);
  const support = calculateSupportPreview(state);
  const caps = calculateStorageTotals(state, { ...support, moonBaseUnits: support.moon.baseUnits });
  let crafted = 0;
  for (const id of order) {
    if (crafted >= maxPerRun) break;
    const recipe = CRAFT_RECIPES[id];
    if (!recipe || blacklist.has(id)) continue;
    if (!Object.keys(recipe.input).every(key => isResourceUnlocked(key, state))) continue;
    const cap = caps[id] || 0;
    if (cap <= 0 || (state.resources[id] || 0) >= cap * target) continue;
    const maximum = calculateMaxCraftable(id, state);
    if (maximum <= 0) continue;
    const capByIngredients = Math.min(...(Object.keys(recipe.input) as ResourceId[]).map(key => {
      const ingredientCap = caps[key] || 0;
      const spare = Math.max(0, (state.resources[key] || 0) - ingredientCap * reserve);
      return Math.floor(spare / (recipe.input[key] || 1));
    }));
    const amount = Math.min(maximum, capByIngredients, maxPerRun - crafted);
    if (!(amount > 0)) continue;
    const multiplier = calculateCraftingMultiplier(id, state, support.asriel);
    for (const [key, value] of Object.entries(recipe.input) as [ResourceId, number][]) state.resources[key] = Math.max(0, (state.resources[key] || 0) - value * amount);
    state.resources[id] = (state.resources[id] || 0) + amount * multiplier;
    crafted += amount;
  }
  return crafted;
}

// ---------------------------------------------------------------- 建筑开关（供电）

/**
 * 电力余量低于保留值时，按供电开启顺序的倒序关闭负载，直到余量回到保留值。
 *
 * 关闭顺序来自游戏自己的 `powerActivationOrder`；玩家配置了 `powerPriority` 时，列表里
 * 靠后的建筑优先被关。
 */
export function applyAutoPower(state: GameState, values: AutomationValues): number {
  if (values.autoPower !== true) return 0;
  const reserve = Math.max(0, numericValue(values, 'autoPowerReserve'));
  const maxShutdown = Math.max(1, Math.round(numericValue(values, 'powerMaxShutdownPerRun') || 1));
  const priority = values.autoPowerPriority === true ? listValue(values, 'powerPriority') : [];
  let remaining = calculateProduction(state, 1).power.available;
  if (remaining >= reserve) return 0;
  const loads = reconcilePowerActivationOrder(state).filter(entry => getBuildingPowerDemand(entry.id, state) > 0);
  if (!loads.length) return 0;
  // 优先关掉“不在优先列表里”的建筑：列表越靠后越先关。
  const rank = (id: BuildingId) => {
    if (priority.length === 0) return 0;
    const index = priority.indexOf(id);
    return index < 0 ? -1 : index;
  };
  const ordered = [...loads].sort((a, b) => rank(a.id) - rank(b.id));
  let changed = 0;
  for (let i = 0; i < ordered.length && remaining < reserve && changed < maxShutdown; i++) {
    const entry = ordered[i];
    if (!entry) continue;
    const perUnit = getBuildingPowerDemand(entry.id, state);
    if (!(perUnit > 0)) continue;
    const amount = Math.min(entry.count, Math.ceil((reserve - remaining) / perUnit), maxShutdown - changed);
    if (!(amount > 0)) continue;
    setBuildingPowerEnabled(state, entry.id, -amount);
    remaining += perUnit * amount;
    changed += amount;
  }
  return changed;
}

// ---------------------------------------------------------------- 工厂与冶炼

/** 有空闲生产线时，按配置顺序把空闲工人分配到生产线上。 */
export function applyAutoFactoryLines(state: GameState, values: AutomationValues): number {
  if (values.autoFactoryLines !== true) return 0;
  const priority = listValue(values, 'factoryLinePriority');
  if (priority.length === 0) return 0;
  let assigned = 0;
  for (const id of priority) {
    if (countSparePopulation(state) <= 0) break;
    if (!(id in state.lines)) continue;
    const before = state.lines[id as keyof typeof state.lines] || 0;
    const after = changeFactoryAssignment(state, id, Number.MAX_SAFE_INTEGER);
    if (after > before) assigned += after - before;
  }
  return assigned;
}

/** 冶炼厂保留指定数量的空闲工位，避免全部被钢占满。 */
export function applyAutoSmelter(state: GameState, values: AutomationValues): number {
  if (values.autoSmelterIdle !== true) return 0;
  const keep = Math.max(0, Math.round(numericValue(values, 'craftKeepSpace')));
  if (state.smelterIdle >= keep) return 0;
  const before = state.smelterIdle;
  changeSmelterAssignment(state, keep - before);
  return state.smelterIdle - before;
}

// ---------------------------------------------------------------- 存储与喷射

/** 按配置顺序把空闲集装箱分配给资源。 */
export function applyAutoStorage(state: GameState, values: AutomationValues): number {
  if (values.autoStorage !== true) return 0;
  const priority = listValue(values, 'storagePriority') as ResourceId[];
  if (priority.length === 0) return 0;
  const target = Math.min(1, Math.max(0, numericValue(values, 'storageReserveRatio')));
  const support = calculateSupportPreview(state);
  const caps = calculateStorageTotals(state, { ...support, moonBaseUnits: support.moon.baseUnits });
  let assigned = 0;
  for (const id of priority) {
    const cap = caps[id] || 0;
    if (cap <= 0) continue;
    if ((state.resources[id] || 0) / cap < target) continue;
    const before = state.containerAssignments[id] || 0;
    const after = changeContainerAssignment(state, id, 1);
    if (after > before) assigned += after - before;
  }
  return assigned;
}

/** 把已经满仓的资源喷进黑洞；失控时按开关决定是否停止。 */
export function applyAutoEject(state: GameState, values: AutomationValues): number {
  if (values.autoEject !== true) return 0;
  if (values.autoEjectWhenUnstable === true && state.blackHole.unstable) return 0;
  if ((state.buildings.massEjector || 0) <= 0) return 0;
  const priority = listValue(values, 'ejectPriority') as ResourceId[];
  const keep = Math.min(1, Math.max(0, numericValue(values, 'ejectKeepRatio')));
  const support = calculateSupportPreview(state);
  const caps = calculateStorageTotals(state, { ...support, moonBaseUnits: support.moon.baseUnits });
  let changed = 0;
  for (const id of priority) {
    const cap = caps[id] || 0;
    if (cap <= 0) continue;
    if ((state.resources[id] || 0) / cap < keep) continue;
    if (changeEjectionAllocation(state, id, 1)) changed++;
  }
  return changed;
}

/** 奇异质量失控时自动稳定黑洞。 */
export function applyAutoStabilize(state: GameState, values: AutomationValues): number {
  if (values.autoStabilizeBlackHole !== true) return 0;
  if (!state.blackHole.unstable) return 0;
  stabilizeBlackHole(state);
  return 1;
}

/** 下载带宽分配。 */
export function applyAutoDownload(state: GameState, values: AutomationValues): number {
  if (values.autoDownload !== true) return 0;
  const target = Math.min(100, Math.max(0, Math.round(numericValue(values, 'downloadAllocation'))));
  if (state.downloadAllocation === target) return 0;
  changeDownloadAllocation(state, target);
  return 1;
}

// ---------------------------------------------------------------- ARPA 与任务

const ARPA_ORDER = ['rocketPlatform', 'geneSequencing', 'monument', 'stockExchange', 'arpaResearchInstitute'];

/** 按配置顺序自动投入 ARPA 项目。 */
export function applyAutoArpa(state: GameState, values: AutomationValues, random: () => number): number {
  if (values.autoArpa !== true) return 0;
  const priority = listValue(values, 'arpaPriority');
  const order = priority.length > 0 ? priority : ARPA_ORDER;
  const mode = stringValue(values, 'arpaInvest');
  const fixed = Math.min(100, Math.max(1, Math.round(numericValue(values, 'arpaInvestPercent'))));
  let invested = 0;
  for (const id of order) {
    if (!Object.hasOwn(state.arpaBuildings, id) || !isProjectUnlocked(id, state)) continue;
    const percent = mode === 'full' ? 100 : mode === 'fixed' ? fixed : 100;
    const spent = investInProject(id, state, percent, random, 0);
    if (spent > 0) invested++;
    if (mode !== 'full') break;
  }
  return invested;
}

/** 按配置顺序完成区域探索任务。 */
export function applyAutoMission(state: GameState, values: AutomationValues): number {
  if (values.autoMission !== true) return 0;
  // 任务顺序来自配置；没有配置时不猜，交给 `nextAutomationMission` 的默认注册表顺序。
  const order = listValue(values, 'missionPriority');
  let completed = 0;
  for (const id of order) {
    if (completeRegionalMissionNow(state, id)) completed++;
  }
  return completed;
}

