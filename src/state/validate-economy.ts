import { BUILDINGS } from '../data/buildings';
import { calculateFactoryCapacity, countAssignedLines, calculateSmelterSlotCapacity } from '../simulation/factory';
import { isFactoryLineUnlocked } from '../simulation/factory-settlement';
import { RESOURCES, CRAFT_RECIPES, FACTORY_OPTIONS } from '../data/resources';
import { calculateWorkerCapacity } from '../simulation/building-production';
import { validateSaveNumber } from './validation';

import type { GameState } from '../types/state';
import type { BuildingId } from '../types/buildings';
import type { ResourceId, CraftId } from '../types/economy';

/** Read a required record without coercing untrusted values. */
function savedField(record: unknown, key: string): unknown {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw Error('经济记录无效。');
  return (record as Record<string, unknown>)[key];
}
export function validateFactoryAssignments(raw: unknown, state: GameState): void {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(id => !FACTORY_OPTIONS.some(option => option.id === id))) throw Error('生产线分配无效。');
  for (const option of FACTORY_OPTIONS) {
    const saved = savedField(raw, option.id);
    const count = validateSaveNumber(saved, 0, Number.MAX_SAFE_INTEGER, '生产线分配');
    state.lines[option.id] = count;
    if (!Number.isInteger(count) || (count > 0 && !isFactoryLineUnlocked(option.id, state))) throw Error('生产线分配无效。');
  }
  if (countAssignedLines(state) > calculateFactoryCapacity(state)) throw Error('生产线分配超过工厂数量。');
}
/** Validate the current idle smelter slot count. */
export function validateSmelterAssignments(raw: unknown, state: GameState): void {
  const idle = validateSaveNumber(raw, 0, calculateSmelterSlotCapacity(state), '冶炼厂工位');
  if (!Number.isInteger(idle)) throw Error('冶炼厂工位无效。');
  state.smelterIdle = idle;
}

export function validateEconomyRecords(raw: Record<string, unknown>, state: GameState): void {
  for (const [field, registry] of [['resources', RESOURCES], ['buildings', BUILDINGS], ['workers', BUILDINGS], ['craftWorkers', CRAFT_RECIPES]] as const) {
    const value = raw[field];
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(id => !Object.hasOwn(registry, id))) throw Error('经济记录无效。');
  }
  for (const id of Object.keys(RESOURCES) as ResourceId[]) {
    const saved = savedField(raw.resources, id);
    state.resources[id] = validateSaveNumber(saved, 0, 1e100, '资源');
  }
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    const building = BUILDINGS[id];
    // Infinity is a comparison bound only; saved counts must remain finite safe integers.
    const saved = savedField(raw.buildings, id);
    state.buildings[id] = validateSaveNumber(saved, 0, building.max ?? Infinity, '建筑');
  }
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    const building = BUILDINGS[id];
    const workerCap = id === 'catCafe' ? state.buildings.catCafe * (building.artistSlots || 0) : calculateWorkerCapacity(id, state);
    const saved = savedField(raw.workers, id);
    state.workers[id] = validateSaveNumber(saved, 0, workerCap, '工作分配');
    if (!Number.isSafeInteger(state.buildings[id]) || !Number.isSafeInteger(state.workers[id]) || (!building.output && !building.workerOutput && !building.artistSlots && !building.craftSlots && state.workers[id])) throw Error('建筑或工作分配无效。');
  }
  if (state.workers.catCafe !== 0 || state.workers.planetaryFoundry !== 0) throw Error('共享工作分配无效。');
  for (const id of Object.keys(CRAFT_RECIPES) as CraftId[]) {
    const saved = savedField(raw.craftWorkers, id);
    state.craftWorkers[id] = validateSaveNumber(saved, 0, state.workers.foundry, '工匠分配');
    if (!Number.isInteger(state.craftWorkers[id])) throw Error('工匠分配无效。');
  }
  if (Object.values(state.craftWorkers).reduce((sum, count) => sum + count, 0) > state.workers.foundry) throw Error('工匠分配超额。');
}
