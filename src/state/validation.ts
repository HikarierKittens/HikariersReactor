import { BUILDINGS } from '../data/buildings';
import { RESOURCES } from '../data/resources';
import { calculateContainerCapacity, countAssignedContainers, isContainerAssignable } from '../simulation/containers';
import type { BuildingId } from '../types/buildings';
import type { ResourceId } from '../types/economy';
import type { GameState } from '../types/state';
import { NEW_BUILDING_STOPPED, isDefaultZeroResource } from './save-defaults';

export function validateStorageAssignments(raw: { stoppedBuildings?: unknown; containers?: unknown; containerAssignments?: unknown }, state: GameState): void {
  const stopped = raw.stoppedBuildings as Record<string, unknown> | null | undefined;
  for (const id of ['catCafe', 'touristCenter']) if (!Number.isInteger(stopped?.[id])) throw Error('商业设施停用数量无效');
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    const saved = stopped?.[id];
    const newBuilding = NEW_BUILDING_STOPPED.includes(id);
    const ownedUnits = Math.floor(state.buildings[id] / (BUILDINGS[id].segmentedRequired || 1));
    state.stoppedBuildings[id] = Math.min(ownedUnits, validateSaveNumber(newBuilding ? (saved === undefined ? 0 : saved) : saved ?? 0, 0, ownedUnits, '停用建筑'));
    if (!Number.isSafeInteger(state.stoppedBuildings[id])) throw Error('停用建筑数据无效。');
  }
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) if (BUILDINGS[id].alwaysRunning) state.stoppedBuildings[id] = 0;
  state.containers = validateSaveNumber(raw.containers, 0, calculateContainerCapacity(state), '集装箱');
  if (!Number.isSafeInteger(state.containers)) throw Error('集装箱数量无效。');
  const assignments = raw.containerAssignments;
  if (!assignments || typeof assignments !== 'object' || Object.keys(assignments).some(id => !Object.hasOwn(RESOURCES, id))) throw Error('集装箱分配无效。');
  const values = assignments as Record<string, unknown>;
  for (const id of Object.keys(RESOURCES) as ResourceId[]) {
    const count = validateSaveNumber(isDefaultZeroResource(id) && values[id] === undefined ? 0 : values[id], 0, state.containers, '集装箱分配');
    if (!Number.isSafeInteger(count)) throw Error('集装箱分配无效。');
    // Previously supported mithril allocations become idle containers on load.
    if (id === 'mithril') {
      state.containerAssignments[id] = 0;
      continue;
    }
    if (count && !isContainerAssignable(id, state)) throw Error('集装箱分配无效。');
    state.containerAssignments[id] = count;
  }
  if (countAssignedContainers(state) > state.containers) throw Error('已分配集装箱超过持有量。');
}

/** Validate untrusted JSON without coercion; retain existing save error messages. */
export function validateSaveNumber(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw Error(label + '数据无效。');
  return value;
}
export function validateSaveIds<T extends string>(value: unknown, dictionary: Record<T, unknown>): T[] {
  if (!Array.isArray(value) || new Set(value).size !== value.length || value.some(id => typeof id !== 'string' || !Object.hasOwn(dictionary, id))) throw Error('存档项目无效。');
  return [...value] as T[];
}
