import { canPayCost, payResourceCost } from './costs';
import { updateStoryProgress } from './story';
import type { GameState } from '../types/state';
import type { ResourceRecipe } from '../types/economy';
export type StageThreeExperimentId = 'probe' | 'signal' | 'transfer' | 'remote';
export const STAGE_THREE_EXPERIMENTS: Record<StageThreeExperimentId, { name: string; cost: ResourceRecipe; stability: number }> = {
  remote: { name: '远端连接验证', cost: { energy: 16000, e710: 100, helium3: 20000, nanotubes: 6000 }, stability: 0 },
  probe: { name: '异常区探测任务', cost: { helium3: 20000, alloy: 5000 }, stability: 0 },
  signal: { name: '信号传递实验', cost: { energy: 4000, e710: 15, nanotubes: 2500 }, stability: 0 },
  transfer: { name: '首次物质转移', cost: { energy: 10000, metal: 2000, alloy: 2000, e710: 50 }, stability: 0 },
};
/** Previewing production never calls this: activation requires a committed simulation tick. */
export function updateStageThreeProgress(state: GameState, result?: { inputUnits: Record<string, number> }): void {
  if (result && (result.inputUnits.aiSupercore || 0) > 0) state.stageThree.coreActivated = true;
  if (state.stageThree.coreActivated && state.stageThree.probeCompleted && state.arpaBuildings.deepSpaceLab > 0 && state.tech.includes('anomalyResponse')) state.stageThree.responseObserved = true;
  if (result && state.stageThree.responseObserved && (result.inputUnits.constraintArray || 0) > 0) state.stageThree.fieldStabilized = true;
}
export function stageThreeExperimentAvailable(state: GameState, id: StageThreeExperimentId): boolean {
  if (!Object.hasOwn(STAGE_THREE_EXPERIMENTS, id)) return false;
  const s = state.stageThree;
  if (!s.coreActivated) return false;
  if (id === 'probe') return !s.probeCompleted && state.tech.includes('anomalyMapping') && state.arpaBuildings.deepSpaceInterferometer > 0;
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
  if (id === 'probe') state.stageThree.probeCompleted = true;
  if (id === 'signal') state.stageThree.signalCompleted = true;
  if (id === 'transfer') state.stageThree.transferCompleted = true;
  if (id === 'remote') state.stageThree.remoteLinked = true;
  updateStageThreeProgress(state);
  updateStoryProgress(state);
  return true;
}
