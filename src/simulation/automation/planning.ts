import { BUILDINGS } from '../../data/buildings';
import { REGIONAL_MISSIONS, isRegionalMissionAvailable, isRegionalMissionCompleted, type RegionalMissionId } from '../space-missions';
import { isPurchaseAllowed } from '../purchases';
import { buildPriceContext, calculateBuildingCost, canPayCost } from '../costs';
import { calculateProduction } from '../production';
import { createConditionContext } from './conditions';
import type { BuildingId } from '../../types/buildings';
import type { ResourceId } from '../../types/economy';
import type { GameState } from '../../types/state';

/**
 * 建造规划：把"该先造什么"从模块里拆出来，便于单独测试，也让界面能解释脚本的下一步。
 *
 * 排序刻意简单可读且**确定**：
 * 1. 从未拥有过的建筑优先（通常是解锁链上的关键一环）；
 * 2. 成本（按资源种类折算的加权和）最低的优先；
 * 3. 同价按注册表顺序，保证结果稳定可复现——脚本重复运行必须得到同一个结果。
 */

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

/**
 * 可建造目标排序（建造模块按这个顺序逐个尝试）：已拥有的、能立刻付钱的排最前面。
 *
 * 只返回**当前可建造**的条目：不可建造的条目即使排在最前也买不到，混进来只会拖慢每一轮。
 * 把能付钱的提到前面是为了避免"排序第一的买不起 15 木材（缺木材），排序第三的能付清"
 * 时脚本一直空转——实测这个状态可以持续几百个 tick。
 */
export function rankBuildTargets(state: GameState): BuildingId[] {
  const context = buildPriceContext(state);
  const rows = plannedTargets(state);
  const affordable = rows.filter(row => canPayCost(state.resources, calculateBuildingCost(row.id, state.buildings[row.id] || 0, state, context)));
  return [...affordable, ...rows.filter(row => !affordable.includes(row))].map(row => row.id);
}

const TIER_WEIGHT = 100;

/**
 * 建造锚点：自动化用来判断"该先造什么"的唯一目标。
 *
 * 排序 = 等级分 + 基础成本。等级分来自建造前置链深度（`buildingRequired`），让原料建筑
 * 排在民用建筑前面。只看成本会实测卡死：伐木产木材、采石耗木材，先造采石会把木材吃光。
 *
 * 四个硬约束：
 * 1. 必须是**当前可建造**的条目，否则脚本会一直等一个够不着的目标；
 * 2. 必须**能被收入流水支撑**（见 `isCashSustainable`），否则会出现"卡在 12 资金、
 *    永远差一点"的死循环——前一层建筑把资金吃光了；
 * 3. 必须优先对齐队列：结算只会为**排队中**的条目付钱，锚点排在队列外等于白等；
 * 4. 必须**来得及**：资源上限封顶时，成本比仓库容量还大的目标永远付不起，脚本会守着它
 *    几百个 tick 一动不动（实测：木材 261 / 石料 46，锚点要 304 木材 152 石料）。
 */
export function buildAnchor(state: GameState): BuildingId | null {
  const context = buildPriceContext(state);
  const rows = plannedTargets(state)
    .filter(row => isCashSustainable(state, row.id))
    .filter(row => isReachable(state, row.id, context))
    .map(row => ({
      ...row,
      affordable: canPayCost(state.resources, calculateBuildingCost(row.id, state.buildings[row.id] || 0, state, context)),
      queued: state.queue.some(item => item.kind === 'build' && item.id === row.id),
    }));
  const ranked = [...rows.filter(row => row.affordable), ...rows.filter(row => !row.affordable)];
  const queued = ranked.findIndex(row => row.queued);
  if (queued > 0) ranked.unshift(...ranked.splice(queued, 1));
  return ranked[0]?.id ?? null;
}

/**
 * 目标是否"够得着"：每项成本都不能超过该资源的仓库上限。
 *
 * 上限未知或该资源此刻有正产量时不拦——产量会把库存继续推高，迟早付得起。
 */
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

function plannedTargets(state: GameState): { id: BuildingId; owned: boolean; score: number }[] {
  return (Object.keys(BUILDINGS) as BuildingId[])
    .filter(id => isPurchaseAllowed(state, 'build', id)
      && (state.buildings[id] || 0) < (BUILDINGS[id].segmentedRequired ?? BUILDINGS[id].max ?? Infinity))
    .map(id => ({
      id,
      owned: (state.buildings[id] || 0) > 0,
      score: buildTier(id) * TIER_WEIGHT + buildCostWeight(id, state),
    }))
    .sort((a, b) => (Number(a.owned) - Number(b.owned)) || (a.score - b.score));
}

/** 资金收入为 0 时，需要花资金的目标就是不可达的：先攒钱的门路得由玩家自己开。 */
function isCashSustainable(state: GameState, id: BuildingId): boolean {
  if (((BUILDINGS[id].cost?.cash ?? 0) as number) <= 0) return true;
  return previewCashIncome(state) > 0;
}

function previewCashIncome(state: GameState): number {
  return calculateProduction(state, 1).rates.cash || 0;
}

const tierCache = new Map<BuildingId, number>();

/** 建造前置链深度：只看 `buildingRequired` 链，每多一层 +1。渲染器只读，因此可以缓存。 */
export function buildTier(id: BuildingId, seen: Set<BuildingId> = new Set()): number {
  const cached = tierCache.get(id);
  if (cached !== undefined) return cached;
  if (seen.has(id)) return 0;
  seen.add(id);
  const parent = BUILDINGS[id].buildingRequired;
  const tier = parent ? 1 + buildTier(parent, seen) : 0;
  tierCache.set(id, tier);
  return tier;
}

/** 下一个值得推进的区域探索任务：已解锁、未完成、前置已完成。 */
export function nextAutomationMission(state: GameState): RegionalMissionId | null {
  for (const id of Object.keys(REGIONAL_MISSIONS) as RegionalMissionId[]) {
    if (isRegionalMissionCompleted(state, id) || !isRegionalMissionAvailable(state, id)) continue;
    return id;
  }
  return null;
}
