import { calculateSoldierCapacity, calculateTrainingDuration } from './government';
import type { GameState } from '../types/state';

/** Advances training only; resources, logging and rendering are owned by the caller. */
export function advanceSoldierTraining(state: GameState, dt: number): void {
  const capacity = calculateSoldierCapacity(state);
  if (!state.tech.includes('military') || state.soldiers >= capacity) {
    state.trainingProgress = 0;
    return;
  }
  state.trainingProgress += dt;
  const duration = calculateTrainingDuration(state);
  const count = Math.min(capacity - state.soldiers, Math.floor(state.trainingProgress / duration));
  state.soldiers += count;
  if (state.soldiers > 0) state.furUnlocked = true;
  state.trainingProgress = state.soldiers >= capacity ? 0 : state.trainingProgress - count * duration;
}
