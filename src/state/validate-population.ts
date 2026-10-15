import { CONFIG } from '../data/config';
import { validateSaveNumber } from './validation';
import type { GameState } from '../types/state';

/** Clock and housing preview are supplied by the caller, not read from global runtime. */
export function validatePopulationRecords(raw: Record<string, unknown>, state: GameState, housing: number, now: number): void {
  // Housing may fall below population during normal play; it limits growth, not saves.
  void housing;
  state.population = validateSaveNumber(raw.population, 0, Number.MAX_SAFE_INTEGER, '猫口');
  if (!Number.isSafeInteger(state.population) || Object.values(state.workers).reduce((sum, count) => sum + count, 0) > state.population) throw Error('猫口分配无效。');
  state.time = validateSaveNumber(raw.time, 0, 1e12, '文明时间');
  // Metadata only: another device's faster clock must not make progress unloadable.
  state.lastSaved = Math.min(now, validateSaveNumber(raw.lastSaved, 0, Infinity, '存档时间'));
  state.growth = validateSaveNumber(raw.growth, 0, CONFIG.growthMax, '增长进度');
  state.growthTarget = validateSaveNumber(raw.growthTarget, 0, CONFIG.growthMax, '增长间隔');
}
