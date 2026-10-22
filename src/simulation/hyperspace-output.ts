import { calculateProductionMultiplier } from './multipliers';
import { calculateAdamantiteProcessorBonus, calculateAiGrapheneMultiplier } from './ai-data-center';
import type { BuildingId } from '../types/buildings';
import type { ResourceId } from '../types/economy';
import type { GameState } from '../types/state';

/** Funded-ratio producers in 遥远星际 (hyperspace regions plus 天元六alpha星区). */
export const HYPERSPACE_SOURCE_IDS: readonly BuildingId[] = ['comprehensiveMiningFacility', 'gasCloudMiningShip', 'highTechFarmPlatform', 'metalMiningShip', 'fuelMiningShip', 'adamantiteMiningShip', 'grapheneFactory'];
/**
 * Hyperspace buildings with maintenance but no resource output (settled after the sources).
 * 危险物质库 joined them in beta 0.9.28: it now carries 10 电力 + 0.25 氘/s upkeep, so its
 * E-710/中子 capacity must follow the funded units instead of the owned count.
 * AI数据中心 has no output either; its upkeep is what the power grid reserves, and this
 * loop is where that reservation becomes an actual pool debit.
 */
export const HYPERSPACE_CONSUMER_IDS: readonly BuildingId[] = ['e710ResearchStation', 'hazardousMaterialStorage', 'aiDataCenter', 'blackHoleStation', 'massEjector'];
/** Resource-local factor. The former 超空间太空港 +25% bonus was removed; fundedPorts is kept for call-site stability. */
export function calculateHyperspaceOutputFactor(resource: ResourceId, state: GameState, happiness: number, fundedPorts: number, quantumLevel = 0): number {
  void fundedPorts;
  // AI数据中心 (高级石墨烯加工) scales graphene only. The level is threaded in so a
  // settlement path never has to solve quantum a second time just to price one resource.
  return calculateProductionMultiplier(resource, happiness, state)
    * (resource === 'graphene' ? calculateAiGrapheneMultiplier(state, quantumLevel) : 1);
}
/** Only whole powered, running 精金精炼站 grant the miner bonus. Callers pass the settled units. */
export function calculateHyperspaceLocalMultiplier(id: BuildingId, state: Pick<GameState, 'tech' | 'buildings' | 'stoppedBuildings'>, fundedProcessors = 0): number {
  // 高级精金加工 raises each station's value from 10% to 10% + 2% per running AI数据中心.
  return id === 'adamantiteMiningShip'
    ? 1 + calculateAdamantiteProcessorBonus(state) * fundedProcessors : 1;
}
