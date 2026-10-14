import { calculateSupportPreview } from './support-preview';
import { ARRAY_STABILITY, REPEATER_BONUS_PER_ARRAY } from './building-effects';
import type { GameState } from '../types/state';
import type { ResourceAmounts } from '../types/economy';
import type { BuildingId } from '../types/buildings';
export interface StageThreeSupport { repeaters: number; hydrogenPlants: number; arrays: number; relays: number; freight: number; civilian: number; capacity: number; used: number; available: number; ports: number; iceShips: number; asteroidBases: number; asteroidCapacity: number; asteroidUsed: number; asteroidAvailable: number }
/** Whole funded units, after original lunar/Asriel maintenance. Only mutates the working pool. */
export function settleStageThreeSupport(state: GameState, pool: ResourceAmounts, dt: number, hydrogenPlants = 0): StageThreeSupport {
  const running = (id: BuildingId) => Math.max(0, (state.buildings[id] || 0) - (state.stoppedBuildings[id] || 0));
  const arrays = state.tech.includes('fieldConstraintTheory') ? Math.min(running('constraintArray'), Math.floor((pool.energy + 1e-8) / (50 * dt)), Math.floor((pool.e710 + 1e-8) / (.25 * dt))) : 0;
  pool.energy = Math.max(0, pool.energy - arrays * 50 * dt);
  pool.e710 = Math.max(0, pool.e710 - arrays * .25 * dt);
  const repeaters = state.tech.includes('accessPointBeacon') ? Math.min(running('signalRepeater'), Math.floor((pool.energy + 1e-8) / (10 * dt))) : 0;
  pool.energy = Math.max(0, pool.energy - repeaters * 10 * dt);
  const beacon = state.tech.includes('dimensionBeaconDeployment') && state.stageThree.remoteLinked;
  const ports = beacon ? Math.min(running('hyperspaceSpaceport'), Math.floor((pool.energy + 1e-8) / (30 * dt)), Math.floor((pool.helium3 + 1e-8) / (5 * dt))) : 0;
  pool.energy = Math.max(0, pool.energy - ports * 30 * dt);
  pool.helium3 = Math.max(0, pool.helium3 - ports * 5 * dt);
  const capacity = arrays * (ARRAY_STABILITY + REPEATER_BONUS_PER_ARRAY * repeaters) + ports * 4;
  const relays = state.tech.includes('dualEndCoupling') && state.stageThree.signalCompleted ? Math.min(running('shortRangeRelay'), Math.floor(capacity / 2), Math.floor((pool.energy + 1e-8) / (10 * dt))) : 0;
  pool.energy = Math.max(0, pool.energy - relays * 10 * dt);
  const linked = state.tech.includes('anomalyTopology') && state.stageThree.remoteLinked;
  const freight = linked ? Math.min(running('anchorFreightStation'), Math.floor((capacity - relays * 2) / 2), Math.floor((pool.energy + 1e-8) / (15 * dt))) : 0;
  pool.energy = Math.max(0, pool.energy - freight * 15 * dt);
  const civilian = linked ? Math.min(running('civilianRouteStation'), Math.floor((capacity - relays * 2 - freight * 2) / 2), Math.floor((pool.energy + 1e-8) / (15 * dt)), Math.floor((pool.food + 1e-8) / (50 * dt))) : 0;
  pool.energy = Math.max(0, pool.energy - civilian * 15 * dt);
  pool.food = Math.max(0, pool.food - civilian * 50 * dt);
  const asteroidCapacity = ports * 2 + hydrogenPlants;
  const iceShips = Math.min(running('iceMiningShip'), asteroidCapacity, Math.floor((pool.energy + 1e-8) / (5 * dt)), Math.floor((pool.helium3 + 1e-8) / (5 * dt)));
  pool.energy = Math.max(0, pool.energy - iceShips * 5 * dt);
  pool.helium3 = Math.max(0, pool.helium3 - iceShips * 5 * dt);
  const asteroidBases = state.buildings.iceMiningShip > 0 ? Math.min(running('asteroidBase'), asteroidCapacity - iceShips, Math.floor((pool.energy + 1e-8) / (10 * dt))) : 0;
  pool.energy = Math.max(0, pool.energy - asteroidBases * 10 * dt);
  const used = (relays + freight + civilian) * 2;
  const asteroidUsed = iceShips + asteroidBases;
  return { repeaters, hydrogenPlants, arrays, relays, freight, civilian, capacity, used, available: capacity - used, ports, iceShips, asteroidBases, asteroidCapacity, asteroidUsed, asteroidAvailable: asteroidCapacity - asteroidUsed };
}
export function calculateStageThreeSupport(state: GameState, dt = 1): StageThreeSupport { return calculateSupportPreview(state, dt).stageThree; }
