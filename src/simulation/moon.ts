import { calculateBuildingInput } from './building-production';
import { calculateSpaceFuelMultiplier } from './space-fuel';
import type { BuildingId } from '../types/buildings';
import type { ResourceAmounts } from '../types/economy';
import type { GameState } from '../types/state';

export type MoonSupportedBuilding = 'iridiumMine' | 'helium3Mine' | 'moonObservatory';
export interface MoonSupport {
  capacity: number;
  used: number;
  available: number;
  baseUnits: number;
  beaconUnits?: number;
  allocations: Record<MoonSupportedBuilding, number>;
}

/** Read-only allocation; caller owns power generation and maintenance payment. */
export function allocateMoonSupport(
  state: GameState,
  resources: ResourceAmounts,
  dt: number,
  fuelMultiplier = calculateSpaceFuelMultiplier(state),
): MoonSupport {
  const running = (id: BuildingId): number => Math.max(0, (state.buildings[id] || 0) - (state.stoppedBuildings[id] || 0));
  const baseUnits = Math.min(running('moonBase'),
    Math.floor((Math.max(0, resources.oil || 0) + 1e-8) / (2 * fuelMultiplier * dt)),
    Math.floor((Math.max(0, resources.energy || 0) + 1e-8) / (4 * dt)));
  // Enabled beacons reserve power after lunar bases; stopped beacons consume nothing.
  const beaconEnergy = calculateBuildingInput('navigationBeacon', state).energy || 2;
  const beaconUnits = Math.min(running('navigationBeacon'),
    Math.floor((Math.max(0, resources.energy - baseUnits * 4 * dt) + 1e-8) / (beaconEnergy * dt)));
  const capacity = baseUnits * 2 + beaconUnits;
  let available = capacity;
  const allocations: Record<MoonSupportedBuilding, number> = { iridiumMine: 0, helium3Mine: 0, moonObservatory: 0 };
  const priority: readonly MoonSupportedBuilding[] = ['iridiumMine', 'helium3Mine', 'moonObservatory'];
  for (const id of priority) {
    allocations[id] = Math.min(running(id), available);
    available -= allocations[id];
  }
  return { capacity, used: capacity - available, available, baseUnits, beaconUnits, allocations };
}
