import type { GameState } from '../types/state';

/** Previewing production never calls this: activation requires a committed simulation tick. */
export function updateStageThreeProgress(state: GameState, result?: { inputUnits: Record<string, number> }): void {
  if (result && (result.inputUnits.aiSupercore || 0) > 0) state.stageThree.coreActivated = true;
}
/** Mapping the anomaly opens the 超空间 world view directly. */
export function isHyperspaceUnlocked(state: Pick<GameState, 'tech'>): boolean {
  return state.tech.includes('anomalyMapping');
}
/** Stage three has begun, but the anomaly has not yet been mapped. */
export function isEarlyStageThree(state: Pick<GameState, 'stageThree' | 'tech'>): boolean {
  return state.stageThree.coreActivated && !isHyperspaceUnlocked(state);
}
