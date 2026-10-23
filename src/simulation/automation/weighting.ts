import { BUILDINGS } from '../../data/buildings';
import { DEFAULT_BUILDING_WEIGHT, buildingWeightKey } from '../../data/automation';
import { TECHNOLOGIES } from '../../data/technologies';
import { REGIONAL_MISSIONS, isRegionalMissionAvailable, isRegionalMissionCompleted, type RegionalMissionId } from '../space-missions';
import { isPurchaseAllowed } from '../purchases';
import { buildPriceContext, calculateBuildingCost, canPayCost } from '../costs';
import { calculateProduction } from '../production';
import { countRunningBuildings } from '../housing';
import { calculateWorkerCapacity } from '../building-production';
import { getBuildingPowerDemand } from '../power-grid';
import { isPowerProducer } from '../power';
import { calculateSupportPreview } from '../support-preview';
import { calculateStorageTotals } from '../storage';
import { createConditionContext } from './conditions';
import { listValue, numericValue, stringValue } from './policy';
import type { AutomationValues } from './policy';
import type { BuildingId } from '../../types/buildings';
import type { ResourceId } from '../../types/economy';
import type { TechnologyId } from '../../types/technologies';
import type { GameState } from '../../types/state';

/**
 * 建造与研究规划：把"接下来做什么"从执行模块里拆出来，便于单独测试，也让界面能解释脚本的下一步。
 *
 * 排序由三层叠加而成，**顺序固定、结果确定**（脚本重复运行必须得到同一个结果）：
 * 1. 硬约束：当前可建造 / 可研究、前置链已满足；
 * 2. 玩家优先列表（`buildingPriority` / `researchPriority`）——排进列表的目标整体前移；
 * 3. 权重：等级分 + 成本，再乘以条件权重倍率（`buildingWeighting*`）。
 *
 * 列表、黑名单、上限、权重倍率这些玩家可调项全部从这里读，因此界面改一个数字就会改变脚本行为。
 */

const TIER_WEIGHT = 100;

/** 把建筑成本折算成一个粗略权重，只用于排序，不参与任何结算。 */
export function buildCostWeight(id: BuildingId, state: GameState): number {
  const building = BUILDINGS[id];
  const cost = building.cost ?? {};
  const count = state.buildings[id] || 0;
  const scale = building.costScales ?? {};
  return Object.entries(cost).reduce((sum, [resource, value]) => {
    if (typeof value !== 'number') return sum;
    const factor = Number(scale[resource as keyof typeof scale] ?? 1) ** count;
    return sum + value * factor;
  }, 0);
}

const tierCache = new Map<BuildingId, number>();

/** 建造前置链深度：只看 `buildingRequired` 链，每多一层 +1。渲染器只读，因此可以缓存。 */
export function buildTier(id: BuildingId, seen: Set<BuildingId> = new Set()): number {
  const cached = tierCache.get(id);
  if (cached !== undefined) return cached;
  if (seen.has(id)) return 0;
  seen.add(id);
  const parent = BUILDINGS[id]?.buildingRequired;
  const tier = parent ? 1 + buildTier(parent, seen) : 0;
  tierCache.set(id, tier);
  return tier;
}

/** 该建筑是否还允许继续建造（分段工程用 `segmentedRequired`，其余用 `max`）。 */
function underLimit(state: GameState, id: BuildingId, values: AutomationValues): boolean {
  const building = BUILDINGS[id];
  const hardLimit = building.segmentedRequired ?? building.max ?? Infinity;
  const configured = numericValue(values, 'buildingMaxPerType');
  const limit = configured > 0 ? Math.min(configured, hardLimit) : hardLimit;
  return (state.buildings[id] || 0) < limit;
}

export interface WeightSignals {
  /** 电力供不应求。 */
  powerShort: boolean;
  /** 电力余量超过需求的一半。 */
  powerSurplus: boolean;
  /** 有研究因知识上限不足而无法进行。 */
  knowledgeBlocked: boolean;
  /** 有资源接近储量上限。 */
  storageTight: boolean;
  /** 有建筑因缺原料停转。 */
  supplyShort: boolean;
  /** 住房已经不够用。 */
  housingTight: boolean;
  /** 有未使用的集装箱。 */
  crateIdle: boolean;
  /** 有未完全运作的质量喷射器。 */
  ejectorIdle: boolean;
}

/** 一次算好所有信号，避免每座建筑都重跑结算。 */
export function collectWeightSignals(state: GameState): WeightSignals {
  const production = calculateProduction(state, 1);
  const caps = createConditionContext(state).storageCaps();
  const powerUsed = production.power?.used ?? 0;
  const powerAvailable = production.power?.available ?? 0;
  const knowledgeBlocked = (Object.keys(TECHNOLOGIES) as TechnologyId[]).some(id => {
    const cost = TECHNOLOGIES[id].knowledgeCost ?? 0;
    return cost > 0 && !state.tech.includes(id) && cost > (caps.knowledge || 0);
  });
  const storageTight = (Object.keys(caps) as ResourceId[]).some(id => {
    const cap = caps[id] || 0;
    return cap > 0 && (state.resources[id] || 0) / cap >= 0.9;
  });
  const supplyShort = (Object.keys(state.stoppedBuildings ?? {}) as BuildingId[]).some(id => (state.stoppedBuildings[id] || 0) > 0);
  const housing = createConditionContext(state).housing();
  const containersFree = state.containers - Object.values(state.containerAssignments ?? {}).reduce((sum, value) => sum + (value || 0), 0);
  return {
    powerShort: powerAvailable < 0,
    powerSurplus: powerUsed > 0 && powerAvailable > powerUsed * 0.5,
    knowledgeBlocked,
    storageTight,
    supplyShort,
    housingTight: housing <= state.population + 1,
    crateIdle: containersFree > 0,
    ejectorIdle: (state.buildings.massEjector || 0) > 0 && Object.keys(state.blackHole.ejection ?? {}).length === 0,
  };
}

/**
 * 每个建筑对储量上限的“增量画像”，按 (建筑, 当前建筑数量) 缓存。
 *
 * 不能只看注册表里有没有 `*Cap` 字段：仓库这类建筑的上限贡献由 `storage.ts` 的建筑表
 * 统一计算，注册表条目本身不带任何 cap 字段（实测“仓库”因此一个权重键都不命中，
 * 权重表对它完全无效）。可靠判据是**试算**：多一座这个建筑，储量上限有没有变。
 *
 * 试算要跑两次 `calculateStorageTotals`，而排序会对每座建筑各调一次；不缓存时
 * 单个 tick 就是数百次全量试算（实测一条测试因此跑到 77 秒）。
 */
const storageProfileCache = new Map<string, string[]>();

/** 该建筑当前数量下会让哪些资源的储量上限变大。 */
function storageGains(id: BuildingId, state: GameState): string[] {
  const count = state.buildings[id] || 0;
  const key = `${id}:${count}`;
  const cached = storageProfileCache.get(key);
  if (cached !== undefined) return cached;
  const support = calculateSupportPreview(state);
  const snapshot = { ...support, moonBaseUnits: support.moon.baseUnits };
  const before = calculateStorageTotals(state, snapshot);
  const probe = { ...state, buildings: { ...state.buildings, [id]: count + 1 } };
  const after = calculateStorageTotals(probe, snapshot);
  const gained: string[] = [];
  for (const resource of Object.keys(after) as ResourceId[]) {
    const delta = (after[resource] || 0) - (before[resource] || 0);
    if (Number.isFinite(delta) && delta > 0) gained.push(resource);
  }
  // 上限受科技 / CRISPR / 支持单位影响，缓存只在这条状态线内有效；条目数有上限就够用。
  if (storageProfileCache.size > 4096) storageProfileCache.clear();
  storageProfileCache.set(key, gained);
  return gained;
}

/** 集装箱类建筑：注册表里带集装箱字段的那些。 */
function isContainerBuilding(id: BuildingId): boolean {
  const building = BUILDINGS[id];
  return (building.containerCap ?? 0) > 0 || (building.storageContainers ?? 0) > 0 || (building.spaceContainerCap ?? 0) > 0;
}

/** 住房建筑：注册表带 `cap` 的就是住房（`housing.ts` 用同一判据列出全部住房）。 */
function isHousingBuilding(id: BuildingId): boolean {
  return (BUILDINGS[id].cap ?? 0) > 0;
}

/** 该建筑命中的权重倍率键（可能多个，按顺序相乘）。 */
export function weightingKeysFor(id: BuildingId, state: GameState, signals: WeightSignals): string[] {
  const keys: string[] = [];
  if ((state.buildings[id] || 0) === 0) keys.push('buildingWeightingNew');
  const demand = getBuildingPowerDemand(id, state);
  const producesPower = isPowerProducer(id);
  if (demand > 0 && signals.powerShort) keys.push('buildingWeightingUnderpowered');
  if (producesPower && signals.powerShort) keys.push('buildingWeightingNeedfulPowerPlant');
  if (producesPower && signals.powerSurplus) keys.push('buildingWeightingUselessPowerPlant');
  const gains = storageGains(id, state);
  // 知识上限建筑同样只能靠试算判断：学校这类条目在注册表里没有 knowledgeCap 字段。
  if (gains.includes('knowledge') && signals.knowledgeBlocked) keys.push('buildingWeightingNeedfulKnowledge');
  if (gains.includes('knowledge') && !signals.knowledgeBlocked) keys.push('buildingWeightingUselessKnowledge');
  if (signals.storageTight && gains.length > 0) keys.push('buildingWeightingNeedStorage');
  if (isHousingBuilding(id) && !signals.housingTight) keys.push('buildingWeightingUselessHousing');
  if (id === 'massEjector' && signals.ejectorIdle) keys.push('buildingWeightingUnusedEjectors');
  if (isContainerBuilding(id) && !signals.crateIdle) keys.push('buildingWeightingCrateUseless');
  if (demand > 0 && (state.buildings[id] || 0) > 0 && countRunningBuildings(id, state) < (state.buildings[id] || 0)) {
    keys.push('buildingWeightingNonOperating');
  }
  if (signals.supplyShort && (BUILDINGS[id].input !== undefined || id === 'warehouse')) keys.push('buildingWeightingMissingSupply');
  return keys;
}

/** 综合权重：等级分 + 成本，再乘全部命中的倍率。倍率为 0 表示这一类暂时不造。 */
export function buildWeight(id: BuildingId, state: GameState, signals: WeightSignals, values: AutomationValues): number {
  let weight = buildTier(id) * TIER_WEIGHT + buildCostWeight(id, state);
  for (const key of weightingKeysFor(id, state, signals)) {
    const multiplier = numericValue(values, key);
    weight *= Number.isFinite(multiplier) ? multiplier : 1;
  }
  // 每座建筑自己的权重（默认 100，与参考脚本的 `bld_w_<id>` 一致）。
  // 它是最后一道乘数：设成 0 就只停掉这一座，不影响同类建筑的情境倍率。
  const own = numericValue(values, buildingWeightKey(id));
  if (Number.isFinite(own)) weight *= own / DEFAULT_BUILDING_WEIGHT;
  return weight;
}

/**
 * 可建造目标排序（建造模块按这个顺序逐个尝试）。
 *
 * 只返回**当前可建造**的条目：不可建造的条目即使排在最前也买不到，混进来只会拖慢每一轮。
 * 能立刻付钱的排最前面，避免"排序第一的差 15 木材、排序第三的能付清"时脚本空转几百 tick。
 */
export function rankBuildTargets(state: GameState, values: AutomationValues): BuildingId[] {
  // 一次 tick 内会排好几次序（住房、锚点、自动建造各一次），结果却只取决于
  // 状态对象与这套配置。缓存键用状态对象本身 + 配置引用，换任一就失效。
  const cached = rankCache.get(state);
  if (cached && cached.values === values) return cached.ids;
  const ids = computeRankBuildTargets(state, values);
  // WeakMap 自己回收，不需要容量控制：键没了条目就没了。
  rankCache.set(state, { values, ids });
  return ids;
}

const rankCache = new WeakMap<GameState, { values: AutomationValues; ids: BuildingId[] }>();

function computeRankBuildTargets(state: GameState, values: AutomationValues): BuildingId[] {
  const context = buildPriceContext(state);
  const mode = stringValue(values, 'buildingMode');
  const blacklist = listValue(values, 'buildingBlacklist');
  const priority = listValue(values, 'buildingPriority');
  const signals = collectWeightSignals(state);

  let rows = (Object.keys(BUILDINGS) as BuildingId[])
    .filter(id => underLimit(state, id, values))
    .filter(id => !blacklist.includes(id))
    .filter(id => isPurchaseAllowed(state, 'build', id))
    .map(id => ({
      id,
      owned: (state.buildings[id] || 0) > 0,
      listed: priority.indexOf(id) >= 0 ? priority.indexOf(id) : Infinity,
      weight: buildWeight(id, state, signals, values),
    }))
    // 倍率归零的目标直接淘汰：这是权重表“暂时不要造”的表达方式。
    .filter(row => row.weight > 0);

  if (mode === 'queue') {
    const queued = new Set(state.queue.flatMap(item => (item.kind === 'build' ? [item.id] : [])));
    rows = rows.filter(row => queued.has(row.id));
  }
  rows.sort((a, b) => (a.listed - b.listed) || (Number(a.owned) - Number(b.owned)) || (b.weight - a.weight));
  const ranked = rows.map(row => row.id);
  const affordable = ranked.filter(id => canPayCost(state.resources, calculateBuildingCost(id, state.buildings[id] || 0, state, context)));
  return [...affordable, ...ranked.filter(id => !affordable.includes(id))];
}

/**
 * 建造锚点：自动化用来判断"该先造什么"的唯一目标。
 *
 * 四个硬约束：
 * 1. 必须是**当前可建造**的条目，否则脚本会一直等一个够不着的目标；
 * 2. 必须**能被收入流水支撑**（见 `needsCash`），否则会出现"永远差一点资金"的死循环；
 * 3. 必须优先对齐队列：结算只会为**排队中**的条目付钱，锚点排在队列外等于白等；
 * 4. 必须**来得及**：资源上限封顶时，成本比仓库容量还大的目标永远付不起，脚本会守着它
 *    几百个 tick 一动不动（实测：木材 261 / 石料 46，锚点要 304 木材 152 石料）。
 */
export function buildAnchor(state: GameState, values: AutomationValues): BuildingId | null {
  const context = buildPriceContext(state);
  const skipUnreachable = values.buildingSkipUnreachable === true;
  const rows = rankBuildTargets(state, values)
    .filter(id => !needsCash(id) || cashIncome(state) > 0)
    .filter(id => !skipUnreachable || isReachable(state, id, context))
    .map(id => ({
      id,
      affordable: canPayCost(state.resources, calculateBuildingCost(id, state.buildings[id] || 0, state, context)),
      queued: state.queue.some(item => item.kind === 'build' && item.id === id),
    }));
  const ranked = [...rows.filter(row => row.affordable), ...rows.filter(row => !row.affordable)];
  const queued = ranked.findIndex(row => row.queued);
  if (queued > 0) ranked.unshift(...ranked.splice(queued, 1));
  return ranked[0]?.id ?? null;
}

/** 目标是否"够得着"：每项成本都不能超过该资源的仓库上限。 */
function isReachable(state: GameState, id: BuildingId, context: ReturnType<typeof buildPriceContext>): boolean {
  const cost = calculateBuildingCost(id, state.buildings[id] || 0, state, context);
  const caps = createConditionContext(state).storageCaps();
  const rates = calculateProduction(state, 1).rates;
  return Object.entries(cost).every(([resource, value]) => {
    if (typeof value !== 'number' || value <= 0) return true;
    const cap = caps[resource as ResourceId];
    if (cap === undefined || !Number.isFinite(cap)) return true;
    if ((rates[resource as ResourceId] || 0) > 0) return true;
    return value <= cap;
  });
}

/** 该建筑是否消耗资金；用注册表基价判断，不受递增与折扣影响。 */
export function needsCash(id: BuildingId): boolean {
  return ((BUILDINGS[id].cost?.cash ?? 0) as number) > 0;
}

function cashIncome(state: GameState): number {
  return calculateProduction(state, 1).rates.cash || 0;
}

/** 科技层级：前置科技链深度，用于研究排序。 */
export function techTier(id: TechnologyId, seen: Set<TechnologyId> = new Set()): number {
  if (seen.has(id)) return 0;
  seen.add(id);
  const pre = (TECHNOLOGIES[id]?.pre ?? []) as TechnologyId[];
  let best = 0;
  for (const parent of pre) best = Math.max(best, 1 + techTier(parent, seen));
  return best;
}

/** 研究排序：优先列表 → 层级与知识成本。 */
export function rankResearchTargets(state: GameState, values: AutomationValues): TechnologyId[] {
  const mode = stringValue(values, 'researchOrder');
  const blacklist = listValue(values, 'researchBlacklist');
  const priority = listValue(values, 'researchPriority');
  const available = (Object.keys(TECHNOLOGIES) as TechnologyId[]).filter(id => !state.tech.includes(id) && !blacklist.includes(id));
  if (mode === 'cheapest') return [...available].sort((a, b) => (TECHNOLOGIES[a].knowledgeCost ?? 0) - (TECHNOLOGIES[b].knowledgeCost ?? 0));
  const score = (id: TechnologyId) => techTier(id) * 1000 + (TECHNOLOGIES[id].knowledgeCost ?? 0);
  return [...available].sort((a, b) => {
    const ai = priority.indexOf(a), bi = priority.indexOf(b);
    return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi) || score(a) - score(b);
  });
}

/** 下一个值得推进的区域探索任务：已解锁、未完成、前置已完成。 */
export function nextAutomationMission(state: GameState, values?: AutomationValues): RegionalMissionId | null {
  const priority = (values ? listValue(values, 'missionPriority') : []) as RegionalMissionId[];
  const ordered = [
    ...priority.filter(id => Object.hasOwn(REGIONAL_MISSIONS, id)),
    ...(Object.keys(REGIONAL_MISSIONS) as RegionalMissionId[]).filter(id => !priority.includes(id)),
  ];
  for (const id of ordered) {
    if (isRegionalMissionCompleted(state, id) || !isRegionalMissionAvailable(state, id)) continue;
    return id;
  }
  return null;
}

/** 岗位容量是否还没填满；未解锁或没建成时返回 false。 */
export function jobHasRoom(state: GameState, id: BuildingId): boolean {
  if ((state.buildings[id] || 0) <= 0) return false;
  return (state.workers[id] || 0) < calculateWorkerCapacity(id, state);
}
