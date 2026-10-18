import type { GameState } from '../../src/types/state';

/**
 * Test-only fixed supply. Solar satellites generate 5 energy/s each and burn no
 * fuel, so a fractional count represents an exact watts budget. Simulation code
 * accepts fractional counts; real purchases and saves never contain them.
 */
export function supplyPower(state: GameState, watts: number): void {
  state.buildings.solarSatellite = watts / 5;
}

/** Adds to any solar satellites the scenario already owns. */
export function addPower(state: GameState, watts: number): void {
  state.buildings.solarSatellite = (state.buildings.solarSatellite || 0) + watts / 5;
}
