import { calculateOperationalSoldierCapacity, calculateTrainingDuration } from './government';
import { calculateProduction } from './production';
import type { GameState } from '../types/state';

/** Advances training only; resources, logging and rendering are owned by the caller. */
export function advanceSoldierTraining(state: GameState, dt: number, paidGarrisonUnits?: number, digital?: { worldSimulatorUnits: number }): void {
  // Resolve a single paid snapshot only when a caller has not provided the needed units.
  const result = (paidGarrisonUnits === undefined && state.buildings.spaceGarrison > 0)
    || (digital === undefined && state.buildings.worldSimulator > 0) ? calculateProduction(state, dt) : undefined;
  const paid = paidGarrisonUnits ?? result?.inputUnits.spaceGarrison ?? 0;
  const capacity = calculateOperationalSoldierCapacity(state, paid, digital ?? result?.digital);
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
