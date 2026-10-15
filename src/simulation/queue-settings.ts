import { BUILDINGS } from '../data/buildings';
import type { BuildingId } from '../types/buildings';
import type { QueueItem } from '../types/state';
import { TECHNOLOGIES } from '../data/technologies';
import { DEFAULT_GAME_SETTINGS, type GameState, type QueueSettingKey } from '../types/state';

/** Each construction project occupies one slot, including segmented batches. */
export function buildingQueueUsage(queue: readonly QueueItem[]): number {
  return queue.filter(item => item.kind !== 'tech').length;
}
/** Remaining physical segments reserved by projects, not their slot count. */
export function queuedBuildingSegments(queue: readonly QueueItem[], id: BuildingId): number {
  return queue.reduce((sum, item) => sum + (item.kind === 'build' && item.id === id ? item.segments ?? 1 : 0), 0);
}
export function segmentedQueueBatchSize(id: BuildingId): number {
  return Math.max(1, Math.ceil((BUILDINGS[id].segmentedRequired || 1) * .1));
}

/** One capacity policy for purchases, ARPA and queue displays; explicit zero disables a lane. */
export function purchaseQueueCapacity(state: GameState, kind: 'build' | 'tech'): number {
  const multiplier = state.crispr?.includes('architect') ? 2 : 1;
  const explicit = (state as GameState & { queueCapacity?: { build?: number; tech?: number } }).queueCapacity?.[kind];
  if (Number.isFinite(explicit)) return Math.max(0, Math.floor(explicit as number)) * multiplier;
  const defs = TECHNOLOGIES as unknown as Record<string, Record<string, unknown>>;
  const aliases = kind === 'build'
    ? ['buildingQueueCapacity', 'constructionQueueCapacity', 'buildingQueue']
    : ['researchQueueCapacity', 'technologyQueueCapacity', 'researchQueue'];
  let extra = 0;
  for (const id of state.tech) {
    const def = defs[id];
    const effect = def?.queueCapacity;
    const directBonus = kind === 'build' ? def?.buildingQueueBonus : def?.researchQueueBonus;
    if (typeof directBonus === 'number' && Number.isFinite(directBonus)) extra += directBonus;
    if (effect && typeof effect === 'object') {
      const value = (effect as Record<string, unknown>)[kind];
      if (typeof value === 'number' && Number.isFinite(value)) extra += value;
    }
    for (const alias of aliases) if (id === alias) extra++;
  }
  return Math.max(2, Math.floor(2 + extra)) * multiplier;
}
export function buildingQueueCapacity(state: GameState): number { return purchaseQueueCapacity(state, 'build'); }
export function researchQueueCapacity(state: GameState): number { return purchaseQueueCapacity(state, 'tech'); }

export function isQueueSettingEnabled(state: GameState, key: QueueSettingKey): boolean {
  return state.settings?.[key] ?? DEFAULT_GAME_SETTINGS[key];
}
