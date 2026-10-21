import { calculateArmyLimit, calculateOperationalSoldierCapacity, calculateTrainingDuration } from './government';
import { calculateProduction } from './production';
import type { GameState } from '../types/state';

/**
 * Remove soldiers above the current army limit.
 *
 * The army may never hold more soldiers than its switched-on capacity provides, so callers
 * that change capacity — switching a 军营 off, loading a save — invoke this and the excess
 * disappears immediately. Payment is not part of the limit: a resource dip pauses training
 * (advanceSoldierTraining) without deleting anyone.
 *
 * Returns how many soldiers were removed; nothing is written when the army already fits.
 */
export function clampSoldiersToArmyLimit(state: GameState): number {
  if (!Number.isSafeInteger(state.soldiers) || state.soldiers <= 0) return 0;
  const limit = calculateArmyLimit(state);
  if (state.soldiers <= limit) return 0;
  const removed = state.soldiers - limit;
  state.soldiers = Math.max(0, limit);
  // A removed soldier leaves nothing to finish training for.
  if (state.soldiers >= limit) state.trainingProgress = 0;
  return removed;
}

/** Advances training only; resources, logging and rendering are owned by the caller. */
export function advanceSoldierTraining(state: GameState, dt: number, paidGarrisonUnits?: number, digital?: { worldSimulatorUnits: number }): void {
  // Resolve a single paid snapshot only when a caller has not provided the needed units.
  const result = (paidGarrisonUnits === undefined && state.buildings.spaceGarrison > 0)
    || (digital === undefined && state.buildings.worldSimulator > 0) ? calculateProduction(state, dt) : undefined;
  const paid = paidGarrisonUnits ?? result?.inputUnits.spaceGarrison ?? 0;
  const capacity = calculateOperationalSoldierCapacity(state, paid, digital ?? result?.digital);
  // Soldiers above the hard limit are removed before training so the army can never exceed it.
  clampSoldiersToArmyLimit(state);
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
  // Training can never push the army past its limit.
  clampSoldiersToArmyLimit(state);
}
