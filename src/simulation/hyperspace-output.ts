import { calculateProductionMultiplier } from './multipliers';
import type { BuildingId } from '../types/buildings';
import type { ResourceId } from '../types/economy';
import type { GameState } from '../types/state';

/** Funded-ratio producers in 遥远星际 (hyperspace regions plus 天元六alpha星区). */
export const HYPERSPACE_SOURCE_IDS: readonly BuildingId[] = ['comprehensiveMiningFacility', 'gasCloudMiningShip', 'highTechFarmPlatform', 'metalMiningShip', 'fuelMiningShip', 'adamantiteMiningShip', 'grapheneFactory'];
/** Hyperspace buildings with maintenance but no resource output (settled after the sources). */
export const HYPERSPACE_CONSUMER_IDS: readonly BuildingId[] = ['e710ResearchStation', 'blackHoleStation', 'massEjector'];
export function isHyperspaceSource(id: BuildingId): boolean {
  return id === 'iceMiningShip' || HYPERSPACE_SOURCE_IDS.includes(id);
}
/** Resource-local factor. The former 超空间太空港 +25% bonus was removed; fundedPorts is kept for call-site stability. */
export function calculateHyperspaceOutputFactor(resource: ResourceId, state: GameState, happiness: number, fundedPorts: number): number {
  void fundedPorts;
  return calculateProductionMultiplier(resource, happiness, state);
}
/** Only whole powered, running 精金精炼站 grant the miner bonus. Callers pass the settled units. */
export function calculateHyperspaceLocalMultiplier(id: BuildingId, state: Pick<GameState, 'buildings'>, fundedProcessors = 0): number {
  void state;
  return id === 'adamantiteMiningShip' ? 1 + .2 * fundedProcessors : 1;
}
