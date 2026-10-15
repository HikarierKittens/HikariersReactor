import { BUILDINGS } from '../data/buildings';
import type { GameState, StageThreeState } from '../types/state';
import { updateStageThreeProgress } from '../simulation/stage-three';
export function loadStageThreeState(raw: Record<string, unknown>, state: GameState): void {
  if (!Object.hasOwn(raw, 'stageThree')) return;
  const saved = raw.stageThree;
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw Error('第三阶段状态无效。');
  const result = { ...state.stageThree };
  if (Object.keys(saved).some(key => !Object.hasOwn(result, key))) throw Error('第三阶段状态无效。');
  for (const key of Object.keys(result) as (keyof StageThreeState)[]) {
    if (key === 'remoteLinked' && !Object.hasOwn(saved, key)) { result[key] = false; continue; }
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
  if (s.coreActivated && state.buildings.aiSupercore < (BUILDINGS.aiSupercore.segmentedRequired || 100)) fail();
  if (s.fieldStabilized && state.buildings.constraintArray < 1) fail();
  if (state.tech.includes('globalObservationCalibration') && !s.coreActivated) fail();
  if (s.fieldStabilized && (!s.coreActivated || !state.tech.includes('anomalyMapping') || !state.tech.includes('fieldConstraintTheory'))) fail();
  if (state.tech.includes('dualEndCoupling') && !s.fieldStabilized) fail();
  if (s.signalCompleted && (!s.fieldStabilized || !state.tech.includes('dualEndCoupling'))) fail();
  if (state.tech.includes('finiteAperture') && !s.signalCompleted) fail();
  if (s.transferCompleted && (!s.signalCompleted || !state.tech.includes('finiteAperture'))) fail();
  if (state.tech.includes('anomalyTopology') && !s.transferCompleted) fail();
  if (s.remoteLinked && (!s.transferCompleted || !state.tech.includes('anomalyTopology') || !state.arpaBuildings.remoteAnchor)) fail();
  if (state.tech.includes('dimensionBeaconDeployment') && !s.remoteLinked) fail();
  if (state.tech.includes('hydrogenRecovery') && state.buildings.asteroidBase < 1) fail();
  updateStageThreeProgress(state);
}
