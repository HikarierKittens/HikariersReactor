import type { BuildingId } from '../types/buildings';
import type { ResourceId } from '../types/economy';

/** Single source for which saved fields may be absent in older saves.
 * Missing keys default to zero; explicitly malformed present values stay rejected.
 * Three registries describe different layers and must not be merged:
 * - OPTIONAL_BUILDING_KEYS: counts and worker rows defaultable when the whole field is absent.
 * - NEW_BUILDING_STOPPED: stopped-count rows defaultable when absent (independent whitelist).
 * - DEFAULT_ZERO_RESOURCES: resource and container amounts defaultable when absent. */

export const OPTIONAL_BUILDING_KEYS: readonly BuildingId[] = ['signalRepeater', 'hydrogenPowerPlant', 'hyperspaceSpaceport', 'iceMiningShip', 'asteroidBase', 'constraintArray', 'shortRangeRelay', 'anchorFreightStation', 'civilianRouteStation', 'asrielControlTower', 'alienMaterialLab', 'aiSupercore', 'swarmFactory', 'e710Container', 'e710MiningShip', 'e710Warehouse', 'e710Reactor', 'miningDrone', 'oilExtractor', 'particleAccelerator', 'spaceWaystation', 'planetaryFoundry', 'spaceGarrison', 'geothermalPlant',
  'swarmControlStation', 'swarmSatellite', 'atmosphericCollector', 'galacticFuelDepot',
  'talosMoonMiningStation', 'iridiumMiningShip', 'ironMiningShip', 'interstellarDock',
  'comprehensiveMiningFacility', 'gasCloudMiningShip', 'highTechFarmPlatform', 'fusionPowerPlant', 'metalMiningShip', 'fuelMiningShip',
  'spaceRipper', 'highTechFactory', 'e710ResearchStation'];

export const NEW_BUILDING_STOPPED: readonly BuildingId[] = ['signalRepeater', 'hydrogenPowerPlant', 'hyperspaceSpaceport', 'iceMiningShip', 'asteroidBase', 'constraintArray', 'shortRangeRelay', 'anchorFreightStation', 'civilianRouteStation', 'asrielControlTower', 'alienMaterialLab', 'aiSupercore', 'swarmFactory', 'e710Container', 'e710MiningShip', 'e710Warehouse', 'e710Reactor', 'miningDrone', 'oilExtractor', 'swarmControlStation', 'swarmSatellite', 'atmosphericCollector', 'galacticFuelDepot', 'talosMoonMiningStation', 'iridiumMiningShip', 'ironMiningShip', 'interstellarDock', 'comprehensiveMiningFacility', 'gasCloudMiningShip', 'highTechFarmPlatform', 'fusionPowerPlant', 'metalMiningShip', 'fuelMiningShip', 'spaceRipper', 'highTechFactory', 'e710ResearchStation'];

export const DEFAULT_ZERO_RESOURCES: readonly ResourceId[] = ['water', 'neutron', 'e710', 'nanotubes', 'deuterium'];

/** Missing-key defaults use these registries; unknown ids must never silently pass. */
export function isOptionalBuildingKey(id: BuildingId): boolean {
  return OPTIONAL_BUILDING_KEYS.includes(id);
}

export function isDefaultZeroResource(id: ResourceId): boolean {
  return DEFAULT_ZERO_RESOURCES.includes(id);
}
