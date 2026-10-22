import type { GameState, StageThreeState } from '../types/state';
export function loadStageThreeState(raw: Record<string, unknown>, state: GameState): void {
  const saved = raw.stageThree;
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw Error('第三阶段状态无效。');
  const result = { ...state.stageThree };
  if (Object.keys(saved).some(key => !Object.hasOwn(result, key))) throw Error('第三阶段状态无效。');
  for (const key of Object.keys(result) as (keyof StageThreeState)[]) {
    if (typeof (saved as Record<string, unknown>)[key] !== 'boolean') throw Error('第三阶段状态无效。');
    result[key] = (saved as StageThreeState)[key];
  }
  state.stageThree = result;
}
export function validateStageThreeProgress(state: GameState): void {
  const s = state.stageThree;
  const fail = () => { throw Error('第三阶段前置进度无效。'); };
  // These are current-run historical events, not permanent prestige flags.
  // Buildings cannot be sold/demolished, and every run reset clears these flags.
  // A stopped or currently unfunded facility remains valid evidence; its absence does not.
  if (s.coreActivated && state.buildings.aiSupercore < 1) fail();
  if (state.tech.includes('globalObservationCalibration') && !s.coreActivated) fail();
  if (state.tech.includes('hydrogenRecovery') && state.buildings.asteroidBase < 1) fail();
}
