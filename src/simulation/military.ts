import { calculateOperationalSoldierCapacity, calculateTrainingDuration } from './government';
import { calculateProduction } from './production';
import type { GameState } from '../types/state';

/** Advances training only; resources, logging and rendering are owned by the caller. */
export function advanceSoldierTraining(state: GameState, dt: number, paidGarrisonUnits?: number): void {
  const paid = paidGarrisonUnits ?? (state.buildings.spaceGarrison ? calculateProduction(state, dt).inputUnits.spaceGarrison || 0 : 0);
  const capacity = calculateOperationalSoldierCapacity(state, paid);
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
