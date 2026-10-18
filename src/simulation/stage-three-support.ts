import { calculateSupportPreview } from './support-preview';
import { ARRAY_STABILITY, REPEATER_BONUS_PER_ARRAY } from './building-effects';
import type { GameState } from '../types/state';
import type { ResourceAmounts } from '../types/economy';
import type { BuildingId } from '../types/buildings';
export interface StageThreeSupport { repeaters: number; hydrogenPlants: number; arrays: number; relays: number; freight: number; civilian: number; capacity: number; used: number; available: number; ports: number; iceShips: number; asteroidBases: number; asteroidCapacity: number; asteroidUsed: number; asteroidAvailable: number }
/** Whole funded units, after original lunar/Asriel maintenance. Only mutates the working pool. */
export function settleStageThreeSupport(state: GameState, pool: ResourceAmounts, dt: number, hydrogenPlants = 0): StageThreeSupport {
  if (!Number.isFinite(dt) || dt <= 0) throw new RangeError('dt must be positive and finite');
  for (const resource of ['energy', 'e710', 'helium3', 'food'] as const) {
    if (!Number.isFinite(pool[resource])) throw new RangeError(`${resource} funding must be finite`);
  }
  // Bound funding before deriving units, not just after debiting: a negative
  // unit count would turn maintenance into a resource credit.
  const funded = (resource: 'energy' | 'e710' | 'helium3' | 'food', cost: number) => Math.floor((Math.max(0, pool[resource]) + 1e-8) / (cost * dt));
  const running = (id: BuildingId) => Math.max(0, (state.buildings[id] || 0) - (state.stoppedBuildings[id] || 0));
  const arrays = state.tech.includes('fieldConstraintTheory') ? Math.min(running('constraintArray'), funded('energy', 50), funded('e710', .25)) : 0;
  pool.energy = Math.max(0, pool.energy - arrays * 50 * dt);
  pool.e710 = Math.max(0, pool.e710 - arrays * .25 * dt);
  const repeaters = state.tech.includes('accessPointBeacon') ? Math.min(running('signalRepeater'), funded('energy', 10)) : 0;
  pool.energy = Math.max(0, pool.energy - repeaters * 10 * dt);
  const beacon = state.tech.includes('dimensionBeaconDeployment');
  const ports = beacon ? Math.min(running('hyperspaceSpaceport'), funded('energy', 30), funded('helium3', 5)) : 0;
  pool.energy = Math.max(0, pool.energy - ports * 30 * dt);
  pool.helium3 = Math.max(0, pool.helium3 - ports * 5 * dt);
  const capacity = arrays * (ARRAY_STABILITY + REPEATER_BONUS_PER_ARRAY * repeaters) + ports * 4;
  const relays = state.tech.includes('fieldConstraintTheory') ? Math.min(running('shortRangeRelay'), Math.floor(capacity / 2), funded('energy', 10)) : 0;
  pool.energy = Math.max(0, pool.energy - relays * 10 * dt);
  const linked = state.tech.includes('fieldConstraintTheory');
  const freight = linked ? Math.min(running('anchorFreightStation'), Math.floor((capacity - relays * 2) / 2), funded('energy', 15)) : 0;
  pool.energy = Math.max(0, pool.energy - freight * 15 * dt);
  const civilian = linked ? Math.min(running('civilianRouteStation'), Math.floor((capacity - relays * 2 - freight * 2) / 2), funded('energy', 15), funded('food', 50)) : 0;
  pool.energy = Math.max(0, pool.energy - civilian * 15 * dt);
  pool.food = Math.max(0, pool.food - civilian * 50 * dt);
  const asteroidCapacity = ports * 2 + hydrogenPlants;
  const iceShips = Math.min(running('iceMiningShip'), asteroidCapacity, funded('energy', 5), funded('helium3', 5));
  pool.energy = Math.max(0, pool.energy - iceShips * 5 * dt);
  pool.helium3 = Math.max(0, pool.helium3 - iceShips * 5 * dt);
  const asteroidBases = state.buildings.iceMiningShip > 0 ? Math.min(running('asteroidBase'), asteroidCapacity - iceShips, funded('energy', 10)) : 0;
  pool.energy = Math.max(0, pool.energy - asteroidBases * 10 * dt);
  const used = (relays + freight + civilian) * 2;
  const asteroidUsed = iceShips + asteroidBases;
  return { repeaters, hydrogenPlants, arrays, relays, freight, civilian, capacity, used, available: capacity - used, ports, iceShips, asteroidBases, asteroidCapacity, asteroidUsed, asteroidAvailable: asteroidCapacity - asteroidUsed };
}
export function calculateStageThreeSupport(state: GameState, dt = 1): StageThreeSupport { return calculateSupportPreview(state, dt).stageThree; }
