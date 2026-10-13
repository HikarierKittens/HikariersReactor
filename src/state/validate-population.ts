import { CONFIG } from '../data/config';
import { validateSaveNumber } from './validation';
import type { GameState } from '../types/state';

/** Clock and housing preview are supplied by the caller, not read from global runtime. */
export function validatePopulationRecords(raw: Record<string, unknown>, state: GameState, housing: number, now: number): void {
  state.legacyPopulationCeiling = validateSaveNumber(raw.legacyPopulationCeiling ?? 0, 0, 10000, '旧档人口');
  if (!Number.isInteger(state.legacyPopulationCeiling)) throw Error('旧档人口无效。');
  // Existing saves may exceed current housing; preserve that acceptance rule.
  state.population = validateSaveNumber(raw.population, 0, Math.max(housing, state.legacyPopulationCeiling, 1, Number(raw.population)), '猫口');
  if (!Number.isSafeInteger(state.population) || Object.values(state.workers).reduce((sum, count) => sum + count, 0) > state.population) throw Error('猫口分配无效。');
  state.time = validateSaveNumber(raw.time, 0, 1e12, '文明时间');
  state.lastSaved = validateSaveNumber(raw.lastSaved, 0, now + 86400000, '存档时间');
  state.growth = validateSaveNumber(raw.growth, 0, CONFIG.growthMax, '增长进度');
  state.growthTarget = validateSaveNumber(raw.growthTarget ?? 0, 0, CONFIG.growthMax, '增长间隔');
}
