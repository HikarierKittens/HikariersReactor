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

/** Queue limits are intentionally exposed without changing queue settlement/runtime flow. */
export function buildingQueueCapacity(state: GameState): number {
  return (2 + state.tech.reduce((sum, id) => sum + (TECHNOLOGIES[id]?.buildingQueueBonus ?? 0), 0)) * (state.crispr.includes('architect') ? 2 : 1);
}

export function researchQueueCapacity(state: GameState): number {
  return (2 + state.tech.reduce((sum, id) => sum + (TECHNOLOGIES[id]?.researchQueueBonus ?? 0), 0)) * (state.crispr.includes('architect') ? 2 : 1);
}

export function isQueueSettingEnabled(state: GameState, key: QueueSettingKey): boolean {
  return state.settings?.[key] ?? DEFAULT_GAME_SETTINGS[key];
}
