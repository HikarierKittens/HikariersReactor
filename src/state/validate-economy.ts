import { BUILDINGS } from '../data/buildings';
import { calculateFactoryCapacity, countAssignedLines } from '../simulation/factory';
import { isFactoryLineUnlocked } from '../simulation/factory-settlement';
import { RESOURCES, CRAFT_RECIPES, FACTORY_OPTIONS } from '../data/resources';
import { calculateWorkerCapacity } from '../simulation/building-production';
import { validateSaveNumber } from './validation';
import { OPTIONAL_BUILDING_KEYS, DEFAULT_ZERO_RESOURCES, isOptionalBuildingKey, isDefaultZeroResource } from './save-defaults';

// The generated legacy bridge strips imports; re-exported helpers would be undefined there.
// Keep the local wrappers so the inlined const arrays satisfy the generated VM suites.
void isOptionalBuildingKey; void isDefaultZeroResource;
import type { GameState } from '../types/state';
import type { BuildingId } from '../types/buildings';
import type { ResourceId, CraftId } from '../types/economy';

/** Optional lookup retains legacy missing-field behavior without trusting JSON values. */
function savedField(record: unknown, key: string): unknown {
  return record == null ? undefined : (record as Record<string, unknown>)[key];
}
export function validateFactoryAssignments(raw: unknown, state: GameState): void {
  for (const option of FACTORY_OPTIONS) {
    const saved = savedField(raw, option.id);
    const count = validateSaveNumber(saved === undefined ? 0 : saved, 0, Number.MAX_SAFE_INTEGER, '生产线分配');
    state.lines[option.id] = count;
    if (!Number.isInteger(count) || (count > 0 && !isFactoryLineUnlocked(option.id, state))) throw Error('生产线分配无效。');
  }
  if (countAssignedLines(state) > calculateFactoryCapacity(state)) throw Error('生产线分配超过工厂数量。');
}

export function validateEconomyRecords(raw: Record<string, unknown>, state: GameState): void {
  for (const id of Object.keys(RESOURCES) as ResourceId[]) {
    const saved = savedField(raw.resources, id);
    state.resources[id] = validateSaveNumber(isDefaultZeroResource(id) && saved === undefined ? 0 : saved, 0, 1e100, '资源');
  }
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    const building = BUILDINGS[id];
    // Infinity is a comparison bound only; saved counts must remain finite safe integers.
    // Only explicitly additive keys may be absent; malformed present values are rejected.
    const saved = savedField(raw.buildings, id);
    state.buildings[id] = validateSaveNumber(isOptionalBuildingKey(id) && saved === undefined ? 0 : saved, 0, building.max ?? Infinity, '建筑');
  }
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    const building = BUILDINGS[id];
    const workerCap = id === 'catCafe' ? state.buildings.catCafe * (building.artistSlots || 0) : calculateWorkerCapacity(id, state);
    const saved = savedField(raw.workers, id);
    state.workers[id] = validateSaveNumber(isOptionalBuildingKey(id) && saved === undefined ? 0 : saved, 0, workerCap, '工作分配');
    if (!Number.isSafeInteger(state.buildings[id]) || !Number.isSafeInteger(state.workers[id]) || (!building.output && !building.workerOutput && !building.artistSlots && !building.craftSlots && state.workers[id])) throw Error('建筑或工作分配无效。');
  }
  // Merge the former cafe-specific assignments into the shared artist job.
  const artists = state.workers.theater + state.workers.catCafe;
  if (!Number.isSafeInteger(artists) || artists > calculateWorkerCapacity('theater', state)) throw Error('艺术家分配超额。');
  state.workers.theater = artists;
  state.workers.catCafe = 0;
  // Planetary foundries extend the existing shared artisan assignment, not a second job.
  const artisans = state.workers.foundry + state.workers.planetaryFoundry;
  if (!Number.isSafeInteger(artisans) || artisans > calculateWorkerCapacity('foundry', state)) throw Error('工匠分配超额。');
  state.workers.foundry = artisans;
  state.workers.planetaryFoundry = 0;
  for (const id of Object.keys(CRAFT_RECIPES) as CraftId[]) {
    state.craftWorkers[id] = validateSaveNumber(savedField(raw.craftWorkers, id), 0, state.workers.foundry, '工匠分配');
    if (!Number.isInteger(state.craftWorkers[id])) throw Error('工匠分配无效。');
  }
  if (Object.values(state.craftWorkers).reduce((sum, count) => sum + count, 0) > state.workers.foundry) throw Error('工匠分配超额。');
}
