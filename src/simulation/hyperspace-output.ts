import { RESOURCES } from '../data/resources';
import { calculateProductionMultiplier } from './multipliers';
import type { BuildingId } from '../types/buildings';
import type { ResourceId } from '../types/economy';
import type { GameState } from '../types/state';

export const HYPERSPACE_SOURCE_IDS: readonly BuildingId[] = ['comprehensiveMiningFacility', 'gasCloudMiningShip', 'highTechFarmPlatform', 'metalMiningShip', 'fuelMiningShip'];
/** Hyperspace buildings with maintenance but no resource output (settled after the sources). */
export const HYPERSPACE_CONSUMER_IDS: readonly BuildingId[] = ['e710ResearchStation'];
export function isHyperspaceSource(id: BuildingId): boolean {
  return id === 'iceMiningShip' || HYPERSPACE_SOURCE_IDS.includes(id);
}
/** Resource-local factor: fuels are ordinary too; only special/crafted outputs are excluded. */
export function calculateHyperspaceOutputFactor(resource: ResourceId, state: GameState, happiness: number, fundedPorts: number): number {
  const portBonus = RESOURCES[resource].special || RESOURCES[resource].crafted ? 1 : 1 + .25 * fundedPorts;
  return calculateProductionMultiplier(resource, happiness, state) * portBonus;
}
