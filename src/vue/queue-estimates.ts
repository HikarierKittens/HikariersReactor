import type { GameState } from '../types/state';
import type { ResourceAmounts, ResourceId, ResourceRecipe } from '../types/economy';
import { describeQueuedPurchases } from '../simulation/purchases';
import { calculateProjectCost, calculateProjectRemainingCost } from '../simulation/projects';
import { isQueueSettingEnabled } from '../simulation/queue-settings';
import { duration } from './format';

/** Current-rate estimate only: future purchases, production changes and manual spending are unknown. */
export function estimateResourceWait(cost: ResourceRecipe, stock: ResourceAmounts, rates: ResourceAmounts, caps: ResourceAmounts, incremental = false): string {
  let seconds = 0;
  for (const [key, required] of Object.entries(cost)) {
    const id = key as ResourceId;
    const missing = required - stock[id];
    if (missing <= 1e-8) continue;
    if (!incremental && required > caps[id] + 1e-8) return '储量上限不足';
    if (!(rates[id] > 0)) return '暂无完成时间';
    seconds = Math.max(seconds, missing / rates[id]);
  }
  if (!Number.isFinite(seconds)) return '暂无完成时间';
  return seconds > 0 ? `预计 ${duration(Math.ceil(seconds))}后完成` : '即将完成';
}

export function estimateQueueTimes(state: GameState, rates: ResourceAmounts, caps: ResourceAmounts): Map<number, string> {
  const result = new Map<number, string>();
  const committed: Record<'build' | 'tech', ResourceRecipe> = { build: {}, tech: {} };
  const blocked = { build: false, tech: false };
  const seenProjects = new Set<string>();
  for (const item of describeQueuedPurchases(state)) {
    const lane = item.kind === 'tech' ? 'tech' : 'build';
    const fifo = !isQueueSettingEnabled(state, lane === 'tech' ? 'unorderedResearchQueue' : 'unorderedBuildingQueue');
    let cost = item.cost;
    if (item.kind === 'arpa') {
      const id = item.id as keyof GameState['arpaProgress'];
      cost = seenProjects.has(id) ? calculateProjectCost(id, state) : calculateProjectRemainingCost(id, state);
      seenProjects.add(id);
      // Independent fractional deposits can accumulate even below 1% storage capacity.
    }
    const incremental = item.kind === 'arpa' || item.kind === 'ship' || (item.segments ?? 1) > 1;
    const stock = item.kind === 'ship' ? { ...state.resources, population: state.population } : state.resources;
    const currentRates = item.kind === 'ship' ? { ...rates, population: 0 } : rates;
    const cumulative = { ...cost };
    if (fifo) for (const [r, n] of Object.entries(committed[lane])) cumulative[r as ResourceId] = (cumulative[r as ResourceId] || 0) + n;
    // Cumulative costs are spent successively, so compare capacity against each purchase only.
    const segmentCost = item.kind === 'build' && item.segments
      ? Object.fromEntries(Object.entries(cost).map(([r, n]) => [r, n / item.segments!])) : cost;
    const segmentBlocked = item.kind === 'build' && item.segments
      && Object.entries(segmentCost).some(([r, n]) => n > caps[r as ResourceId] + 1e-8);
    const status = segmentBlocked ? '储量上限不足' : estimateResourceWait(cost, stock, currentRates, caps, incremental);
    const text = fifo && blocked[lane] ? '等待前序项目' : status === '储量上限不足' ? status
      : estimateResourceWait(cumulative, stock, currentRates, caps, fifo || incremental);
    result.set(item.uid, text);
    if (fifo) {
      committed[lane] = cumulative;
      if (text === '储量上限不足' || text === '暂无完成时间' || text === '等待前序项目') blocked[lane] = true;
    }
  }
  return result;
}
