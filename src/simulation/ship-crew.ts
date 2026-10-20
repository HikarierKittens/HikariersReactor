import { countUsedWorkers } from './building-production';
import type { BuildingId } from '../types/buildings';
import type { GameState } from '../types/state';

/**
 * 采矿船操作员: every enabled outer-system mining ship holds cat crew out of the
 * idle population. The job is derived, never stored in `state.workers`, so saves
 * keep schema 31 and the count cannot drift from the enabled ships.
 */
export const SHIP_CREW_JOB_NAME = '采矿船操作员';

/** Crew per enabled ship. Order is the staffing priority: earlier ships keep their crew. */
export const SHIP_CREW_SIZE: Readonly<Partial<Record<BuildingId, number>>> = { iridiumMiningShip: 1, ironMiningShip: 1, e710MiningShip: 2 };
export const SHIP_CREW_IDS = ['iridiumMiningShip', 'ironMiningShip', 'e710MiningShip'] as const;
export type ShipCrewId = typeof SHIP_CREW_IDS[number];

export interface ShipCrew {
  /** Ships that actually got a full crew, per ship type. */
  working: Record<ShipCrewId, number>;
  /** Crew currently operating ships. */
  operators: number;
  /** Crew the enabled ships would need for all of them to work. */
  required: number;
  /** Crew any enabled ship type is missing (0 when everybody has a crew). */
  shortfall: number;
}

type CrewState = Pick<GameState, 'population' | 'workers' | 'buildings' | 'stoppedBuildings'>;

function enabledShips(state: CrewState, id: ShipCrewId): number {
  return Math.max(0, Math.floor((state.buildings[id] || 0) - (state.stoppedBuildings?.[id] || 0)));
}

/**
 * Ships draw from the idle population left after manual job assignments, in
 * `SHIP_CREW_IDS` order; once the idle cats run out the remaining (last enabled)
 * ships stop working until population or assignments free a crew.
 */
export function allocateShipCrew(state: CrewState): ShipCrew {
  let idle = Math.max(0, Math.floor(state.population || 0) - countUsedWorkers(state));
  const working = { iridiumMiningShip: 0, ironMiningShip: 0, e710MiningShip: 0 } as Record<ShipCrewId, number>;
  let operators = 0, required = 0;
  for (const id of SHIP_CREW_IDS) {
    const crew = SHIP_CREW_SIZE[id] || 0, enabled = enabledShips(state, id);
    required += enabled * crew;
    const staffed = crew > 0 ? Math.min(enabled, Math.floor(idle / crew)) : enabled;
    working[id] = staffed;
    operators += staffed * crew;
    idle -= staffed * crew;
  }
  return { working, operators, required, shortfall: required - operators };
}

/** Enabled ships of one type that lost their crew (drives the yellow toggle state). */
export function countUndercrewedShips(state: CrewState, id: BuildingId): number {
  if (!Object.hasOwn(SHIP_CREW_SIZE, id)) return 0;
  return Math.max(0, enabledShips(state, id as ShipCrewId) - allocateShipCrew(state).working[id as ShipCrewId]);
}

/** Idle cats after both manual assignments and the ship crews they support. */
export function countSparePopulation(state: GameState): number {
  return Math.max(0, Math.floor(state.population || 0) - countUsedWorkers(state) - allocateShipCrew(state).operators);
}
