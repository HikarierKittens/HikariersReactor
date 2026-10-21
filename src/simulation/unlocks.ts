import { BUILDINGS } from '../data/buildings';
import { RESOURCES, CRAFT_RECIPES } from '../data/resources';
import type { BuildingId } from '../types/buildings';
import type { ResourceId, CraftId } from '../types/economy';
import type { TechnologyId } from '../types/technologies';
import type { GameState } from '../types/state';

import { RETIRED_TECHNOLOGIES, TECHNOLOGIES } from '../data/technologies';
import { isSpaceMissionCompleted } from './space-missions';
import { isBuildingFullyBuilt } from './costs';

export function isTechnologyUnlocked(id: string, state: GameState): boolean {
  if (!Object.hasOwn(TECHNOLOGIES, id)) return false;
  // Retired research IDs remain valid historical earned progress, never future research.
  if (RETIRED_TECHNOLOGIES.includes(id as TechnologyId)) return false;
  if (id === 'globalObservationCalibration' && !state.stageThree.coreActivated) return false;
  // Ripper technologies require a COMPLETED 空间撕裂者 (all 100 segments), not merely one segment.
  if ((id === 'higherDimensionalStorage' || id === 'ripperOverclock' || id === 'overclocking13') && !isBuildingFullyBuilt('spaceRipper', state)) return false;
  // 质量喷射器 requires a COMPLETED 彭罗斯球体; the two black-hole specials open while it is unstable.
  if ((id === 'massEjector' || id === 'aiCoreCalibration') && !isBuildingFullyBuilt('penroseSphere', state)) return false;
  if ((id === 'stabilizeBlackHole' || id === 'exoticRunaway') && !state.blackHole?.unstable) return false;
  if (id === 'digitalAscension' && !isBuildingFullyBuilt('agiCoreComponent', state)) return false;
  const technology = TECHNOLOGIES[id as TechnologyId];
  // 世界统一 is the payoff of 统一计划: it stays locked until every neighbour is occupied.
  if (technology.occupiedNeighborsRequired !== undefined
    && state.neighbors.occupied.length < technology.occupiedNeighborsRequired) return false;
  return (state.prestige.nuclearResets + (state.prestige.escapeResets || 0) + (state.prestige.blackHoleResets || 0) + (state.prestige.ascensionResets || 0) >= (technology.prestigeResetsRequired || 0))
    && (!technology.kerberosMissionRequired || state.kerberosMissionCompleted)
    && (!technology.spaceMissionRequired || isSpaceMissionCompleted(state, technology.spaceMissionRequired))
    && (!technology.buildingRequired || state.buildings[technology.buildingRequired] > 0)
    && technology.pre.every(parent => state.tech.includes(parent))
    && (!technology.arpaPre || (state.arpaBuildings?.[technology.arpaPre] || 0) >= (technology.arpaRequiredCount ?? 1))
    && (!technology.resourceRequired || isResourceUnlocked(technology.resourceRequired, state));
}

const producers: Partial<Record<ResourceId, BuildingId>> = {
  iron: 'mine', copper: 'mine', coal: 'coalMine', cement: 'cementWorkshop', metal: 'smelter',
  oil: 'refinery', alloy: 'factory', polymer: 'factory', titanium: 'smelter', uranium: 'coalMine',
  aluminum: 'metalRefinery', iridium: 'iridiumMine', mithril: 'spaceFactory', helium3: 'helium3Mine',
};
const requiredTech: Partial<Record<ResourceId, TechnologyId>> = { polymer: 'polymer', titanium: 'titaniumSmelting', uranium: 'nuclearEnergy' };
export function meetsResourceUnlock(resource: string, state: GameState): boolean {
  if (!Object.hasOwn(RESOURCES, resource)) return false;
  const id = resource as ResourceId;
  if (id === 'fur') return !!state.furUnlocked || (state.buildings.factory > 0 && state.tech.includes('syntheticFur'))
    || (Object.keys(BUILDINGS) as BuildingId[]).some(key => (BUILDINGS[key].soldierCap ?? 0) > 0 && state.buildings[key] > 0);
  if (Object.hasOwn(CRAFT_RECIPES, id)) return (state.buildings.foundry > 0 || state.buildings.planetaryFoundry > 0 || (state.buildings.stellarForge || 0) > 0)
    && (id !== 'aerogel' || state.tech.includes('aerogel'))
    && Object.keys(CRAFT_RECIPES[id as CraftId].input).every(key => isResourceUnlocked(key, state));
  if (id === 'water') return state.buildings.iceMiningShip > 0;
  if (id === 'adamantite') return (state.buildings.adamantiteMiningShip || 0) > 0;
  if (id === 'deuterium') return state.buildings.gasCloudMiningShip > 0;
  if (id === 'neutron') return state.buildings.talosMoonMiningStation > 0;
  const alternateProducers: Partial<Record<ResourceId, BuildingId>> = {
    helium3: 'atmosphericCollector', iron: 'ironMiningShip', iridium: 'iridiumMiningShip',
  };
  const alternate = alternateProducers[id];
  if (alternate && state.buildings[alternate] > 0) return true;
  const producer = producers[id], tech = requiredTech[id];
  if (producer) return state.buildings[producer] > 0 && (!tech || state.tech.includes(tech));
  const resourceTech = RESOURCES[id].tech;
  return !resourceTech || state.tech.includes(resourceTech);
}
export function isResourceUnlocked(id: string, state: GameState): boolean {
  return Object.hasOwn(RESOURCES, id) && ((state.unlockedResources || []).includes(id as ResourceId) || meetsResourceUnlock(id, state));
}
export function isBuildingUnlocked(id: string, state: GameState): boolean {
  if (!Object.hasOwn(BUILDINGS, id)) return false;
  const building = BUILDINGS[id as BuildingId];
  if (building.spaceMissionRequired && !isSpaceMissionCompleted(state, building.spaceMissionRequired)) return false;
  if (id === 'geothermalPlant' && !state.kerberosMissionCompleted) return false;
  if (id === 'talosMoonMiningStation' && !state.talosMoonMissionCompleted) return false;
  if (['iridiumMiningShip', 'ironMiningShip'].includes(id) && !state.asteroidBeltMissionCompleted) return false;
  if (!state.tech.includes(building.tech)) return false;
  const needsPort = ['asrielResidence', 'asrielMine', 'ecologicalDome', 'hangar', 'spaceFactory', 'starRingStation', 'spaceWaystation', 'planetaryFoundry', 'spaceGarrison', 'vrCenter'].includes(id);
  if ((id === 'asrielSpaceport' || needsPort) && !state.asrielMissionCompleted) return false;
  if (needsPort && !state.buildings.asrielSpaceport) return false;
  return !building.buildingRequired || state.buildings[building.buildingRequired] > 0;
}
