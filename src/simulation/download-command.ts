import type { GameState } from '../types/state';

/** UI allocation commands cannot create non-finite or out-of-range save data. */
export function changeDownloadAllocation(state: GameState, value: number): void {
  if (!Number.isFinite(value) || !state.tech.includes('aiCoreCalibration') || state.buildings.downloadExecutable < 1) return;
  state.downloadAllocation = Math.max(0, Math.min(100, Math.round(value)));
}
