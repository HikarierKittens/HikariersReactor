import type { GameState } from '../types/state';
import type { ResourceAmounts, ResourceRecipe } from '../types/economy';
import { settlePowerPlants } from './power';
import { settleQuantumCores } from './quantum';
import { settleDigitalSupport } from './digital-world';

export const SPACE_BUILDING_IDS: readonly string[] = [
  'e710Container', 'e710MiningShip', 'e710Warehouse', 'e710Reactor', 'miningDrone', 'oilExtractor',
  'touristStation', 'solarSatellite', 'researchSatellite', 'orbitalFuelDepot', 'navigationBeacon',
  'moonBase', 'iridiumMine', 'helium3Mine', 'moonObservatory',
  'swarmControlStation', 'swarmSatellite', 'atmosphericCollector', 'galacticFuelDepot', 'talosMoonMiningStation', 'iridiumMiningShip', 'ironMiningShip',
  'asrielSpaceport', 'asrielResidence', 'asrielMine', 'ecologicalDome', 'hangar', 'spaceFactory', 'starRingStation', 'planetaryFoundry', 'spaceGarrison', 'geothermalPlant',
];
type FuelState = GameState;
/** Waystations reserve whole-unit power before lunar and Asriel maintenance. */
export function calculatePoweredWaystations(state: FuelState, pool?: ResourceAmounts, dt = 1): number {
  const enabled = Math.max(0, (state.buildings?.spaceWaystation || 0) - (state.stoppedBuildings?.spaceWaystation || 0));
  if (!enabled) return 0;
  if (!pool) {
    if (!state.resources) return 0;
    pool = { ...state.resources };
    settlePowerPlants(pool, dt, state);
    // Match the ledger prefix without calling the full support preview here:
    // that would recurse through geothermal fuel-discount calculation.
    settleQuantumCores(state, pool, dt);
    settleDigitalSupport(state, pool, dt);
  }
  return Math.min(enabled, Math.floor((Math.max(0, pool.energy) + 1e-8) / (5 * dt)));
}
export function reserveWaystationPower(state: FuelState, pool: ResourceAmounts, dt: number): number {
  const count = calculatePoweredWaystations(state, pool, dt);
  pool.energy = Math.max(0, pool.energy - count * 5 * dt);
  return count;
}
/** Maintenance callers can supply the paid count for the current timestep. */
export function calculateSpaceFuelMultiplier(state: FuelState, count = calculatePoweredWaystations(state)): number {
  return Math.max(Number.MIN_VALUE, .95 ** count);
}
export function applySpaceFuelDiscount(id: string, recipe: ResourceRecipe, state: FuelState): ResourceRecipe {
  // Also prevents generation previews recursively requesting another power preview.
  if (!SPACE_BUILDING_IDS.includes(id) || !Object.keys(recipe).some(r => r === 'oil' || r === 'helium3')) return { ...recipe };
  const factor = calculateSpaceFuelMultiplier(state);
  return Object.fromEntries(Object.entries(recipe).map(([resource, amount]) => [resource,
    (resource === 'oil' || resource === 'helium3') ? Math.max(Number.MIN_VALUE, amount * factor) : amount]));
}
export function calculateAsrielMissionCost(state: FuelState): number {
  return Math.max(Number.MIN_VALUE, 5000 * calculateSpaceFuelMultiplier(state));
}
