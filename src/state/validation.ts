import { BUILDINGS } from '../data/buildings';
import { RESOURCES } from '../data/resources';
import { calculateContainerCapacity, countAssignedContainers, isContainerAssignable, calculateAlloyContainerCapacity, countAssignedAlloyContainers } from '../simulation/containers';
import type { BuildingId } from '../types/buildings';
import type { ResourceId } from '../types/economy';
import type { GameState } from '../types/state';

export function validateStorageAssignments(raw: { stoppedBuildings?: unknown; containers?: unknown; containerAssignments?: unknown; alloyContainers?: unknown; alloyContainerAssignments?: unknown }, state: GameState): void {
  const stopped = raw.stoppedBuildings as Record<string, unknown> | null | undefined;
  if (!stopped || typeof stopped !== 'object' || Array.isArray(stopped) || Object.keys(stopped).some(id => !Object.hasOwn(BUILDINGS, id))) throw Error('停用建筑数据无效。');
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    const saved = stopped?.[id];
    const ownedUnits = Math.floor(state.buildings[id] / (BUILDINGS[id].segmentedRequired || 1));
    state.stoppedBuildings[id] = validateSaveNumber(saved, 0, ownedUnits, '停用建筑');
    if (!Number.isSafeInteger(state.stoppedBuildings[id])) throw Error('停用建筑数据无效。');
  }
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) if (BUILDINGS[id].alwaysRunning && state.stoppedBuildings[id] !== 0) throw Error('常开建筑不能停用。');
  state.containers = validateSaveNumber(raw.containers, 0, calculateContainerCapacity(state), '集装箱');
  if (!Number.isSafeInteger(state.containers)) throw Error('集装箱数量无效。');
  const assignments = raw.containerAssignments;
  if (!assignments || typeof assignments !== 'object' || Array.isArray(assignments) || Object.keys(assignments).some(id => !Object.hasOwn(RESOURCES, id))) throw Error('集装箱分配无效。');
  const values = assignments as Record<string, unknown>;
  for (const id of Object.keys(RESOURCES) as ResourceId[]) {
    const count = validateSaveNumber(values[id], 0, state.containers, '集装箱分配');
    if (!Number.isSafeInteger(count)) throw Error('集装箱分配无效。');
    if (count && !isContainerAssignable(id, state)) throw Error('集装箱分配无效。');
    state.containerAssignments[id] = count;
  }
  if (countAssignedContainers(state) > state.containers) throw Error('已分配集装箱超过持有量。');
  state.alloyContainers = validateSaveNumber(raw.alloyContainers, 0, calculateAlloyContainerCapacity(state), '合金集装箱');
  if (!Number.isSafeInteger(state.alloyContainers)) throw Error('合金集装箱数量无效。');
  const alloyAssignments = raw.alloyContainerAssignments;
  if (!alloyAssignments || typeof alloyAssignments !== 'object' || Array.isArray(alloyAssignments) || Object.keys(alloyAssignments).some(id => !Object.hasOwn(RESOURCES, id))) throw Error('合金集装箱分配无效。');
  const alloyValues = alloyAssignments as Record<string, unknown> | undefined;
  for (const id of Object.keys(RESOURCES) as ResourceId[]) {
    const value = alloyValues?.[id];
    const count = validateSaveNumber(value, 0, state.alloyContainers, '合金集装箱分配');
    if (!Number.isSafeInteger(count) || (count > 0 && !isContainerAssignable(id, state))) throw Error('合金集装箱分配无效。');
    state.alloyContainerAssignments[id] = count;
  }
  if (countAssignedAlloyContainers(state) > state.alloyContainers) throw Error('已分配合金集装箱超过持有量。');
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
