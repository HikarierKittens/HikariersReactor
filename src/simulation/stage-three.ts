import { canPayCost, payResourceCost } from './costs';
import { updateStoryProgress } from './story';
import type { GameState } from '../types/state';
import type { ResourceRecipe } from '../types/economy';
export type StageThreeExperimentId = 'signal' | 'transfer' | 'remote';
export const STAGE_THREE_EXPERIMENTS: Record<StageThreeExperimentId, { name: string; cost: ResourceRecipe; stability: number }> = {
  remote: { name: '远端连接验证', cost: { energy: 16000, e710: 100, helium3: 20000, nanotubes: 6000 }, stability: 0 },
  signal: { name: '信号传递实验', cost: { energy: 4000, e710: 15, nanotubes: 2500 }, stability: 0 },
  transfer: { name: '首次物质转移', cost: { energy: 10000, metal: 2000, alloy: 2000, e710: 50 }, stability: 0 },
};
/** Previewing production never calls this: activation requires a committed simulation tick. */
export function updateStageThreeProgress(state: GameState, result?: { inputUnits: Record<string, number> }): void {
  if (result && (result.inputUnits.aiSupercore || 0) > 0) state.stageThree.coreActivated = true;
  if (result && state.tech.includes('anomalyMapping') && (result.inputUnits.constraintArray || 0) > 0) state.stageThree.fieldStabilized = true;
}
/** Mapping the anomaly opens the 超空间 world view directly. */
export function isHyperspaceUnlocked(state: Pick<GameState, 'tech'>): boolean {
  return state.tech.includes('anomalyMapping');
}
/** Stage three has begun, but the anomaly has not yet been mapped. */
export function isEarlyStageThree(state: Pick<GameState, 'stageThree' | 'tech'>): boolean {
  return state.stageThree.coreActivated && !isHyperspaceUnlocked(state);
}
export function stageThreeExperimentAvailable(state: GameState, id: StageThreeExperimentId): boolean {
  if (!Object.hasOwn(STAGE_THREE_EXPERIMENTS, id)) return false;
  const s = state.stageThree;
  if (!s.coreActivated) return false;
  if (id === 'signal') return !s.signalCompleted && s.fieldStabilized && state.tech.includes('dualEndCoupling');
  if (id === 'remote') return !s.remoteLinked && s.transferCompleted && state.tech.includes('anomalyTopology') && state.arpaBuildings.remoteAnchor > 0;
  return !s.transferCompleted && s.signalCompleted && state.tech.includes('finiteAperture');
}
export function runStageThreeExperiment(state: GameState, id: StageThreeExperimentId): boolean {
  if (!Object.hasOwn(STAGE_THREE_EXPERIMENTS, id) || !stageThreeExperimentAvailable(state, id)) return false;
  const experiment = STAGE_THREE_EXPERIMENTS[id];
  if (!canPayCost(state.resources, experiment.cost)) return false;
  // Experiments pay only their one-time resource cost; facility support is independent.
  if (!payResourceCost(state.resources, experiment.cost)) return false;
  if (id === 'signal') state.stageThree.signalCompleted = true;
  if (id === 'transfer') state.stageThree.transferCompleted = true;
  if (id === 'remote') state.stageThree.remoteLinked = true;
  updateStageThreeProgress(state);
  updateStoryProgress(state);
  return true;
}
