import { BUILDINGS } from '../data/buildings';
import { CONFIG } from '../data/config';
import type { GameState } from '../types/state';

/**
 * 医院: each built hospital heals one wounded soldier per game day.
 *
 * Healing is fractional in the short term and only moves whole soldiers, so the leftover
 * progress is carried in `state.hospitalProgress`. Without that carry, a 0.2s tick would
 * round every fraction to zero and the hospital would never heal anything.
 */

/** Wounded soldiers healed per game day, one per hospital. */
export const HOSPITAL_HEAL_PER_DAY = 1;

/** Hospitals that actually work: complete, running units only. */
export function workingHospitals(state: Pick<GameState, 'buildings' | 'stoppedBuildings'>): number {
  const built = state.buildings.hospital || 0;
  const stopped = state.stoppedBuildings.hospital || 0;
  return Math.max(0, built - stopped);
}

/** Healed soldiers per second at the current hospital count. */
export function hospitalHealRate(state: Pick<GameState, 'buildings' | 'stoppedBuildings'>): number {
  return workingHospitals(state) * HOSPITAL_HEAL_PER_DAY / CONFIG.secondsPerDay;
}

/**
 * Advance healing and move recovered soldiers back into the army.
 *
 * Returns how many soldiers recovered this step (usually 0). Healing is routine upkeep and
 * deliberately writes no log: the hospital would otherwise spam the 80-entry log every
 * few seconds while a raid left many soldiers wounded.
 */
export function advanceHospital(state: GameState, dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  const rate = hospitalHealRate(state);
  if (rate <= 0 || state.wounded <= 0) {
    // No patients or no capacity: drop stale progress so a later hospital does not
    // instantly heal a soldier from time banked while it was stopped.
    state.hospitalProgress = 0;
    return 0;
  }
  state.hospitalProgress += rate * dt;
  const healed = Math.min(state.wounded, Math.floor(state.hospitalProgress));
  if (healed <= 0) return 0;
  state.wounded -= healed;
  state.soldiers += healed;
  state.hospitalProgress -= healed;
  if (state.wounded === 0) state.hospitalProgress = 0;
  return healed;
}

/** Tooltip row value: whole-day rate, so the panel reads in the same unit the design uses. */
export function hospitalHealPerDay(state: Pick<GameState, 'buildings' | 'stoppedBuildings'>): number {
  return workingHospitals(state) * HOSPITAL_HEAL_PER_DAY;
}

/** True when the hospital can currently do anything (used for the tooltip note). */
export function isHospitalIdle(state: Pick<GameState, 'buildings' | 'stoppedBuildings' | 'wounded'>): boolean {
  return workingHospitals(state) > 0 && state.wounded <= 0;
}

export const HOSPITAL_NAME = BUILDINGS.hospital.name;
