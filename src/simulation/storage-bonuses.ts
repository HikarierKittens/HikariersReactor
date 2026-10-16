import { isResourceUnlocked } from './unlocks';
import { BUILDINGS } from '../data/buildings';
import type { BuildingId } from '../types/buildings';
import { countAsrielResidents } from './asriel';
import type { AsrielSupport, ResourceId, ResourceRecipe } from '../types/economy';
import type { GameState } from '../types/state';
import type { MoonSupport } from './moon';

export const WAREHOUSE_RESOURCES: ResourceId[] = ['wood', 'stone', 'fur', 'copper', 'iron', 'aluminum', 'cement', 'coal', 'metal'];
export const ADVANCED_STORAGE_RESOURCES: ResourceId[] = [...WAREHOUSE_RESOURCES, 'titanium', 'alloy'];

/** The caller supplies a support snapshot so sub-second simulation and UI agree. */
export function calculateStorageBonuses(id: BuildingId, state: GameState, moon: MoonSupport | null, asriel?: AsrielSupport | null): ResourceRecipe {
  const upgraded = state.tech.includes('warehouseUpgrade');
  const instituteMultiplier = 1 + .04 * (state.arpaBuildings?.arpaResearchInstitute || 0);
  const warehouseMultiplier = (state.tech.includes('dimensionCompression') ? instituteMultiplier : 1)
    * (state.tech.includes('iridiumAlloyWarehouse') ? 2 : 1);
  if (id === 'anchorFreightStation') return Object.fromEntries(['wood', 'cement', 'stone', 'iron', 'coal', 'copper', 'aluminum', 'titanium', 'metal', 'oil', 'uranium', 'alloy', 'polymer', 'iridium',
    // 遥远星际 materials join once unlocked.
    ...(['adamantite', 'graphene', 'nanoAlloy'] as const).filter(resource => isResourceUnlocked(resource, state))].map(resource => [resource, 32000]));
  // 高维存储 (higherDimensionalStorage) doubles these hyperspace storage facilities
  // (+100% on each base contribution) and gives spaceports a flat water store.
  const higherDimensional = state.tech.includes('higherDimensionalStorage');
  const dimensional = higherDimensional ? 2 : 1;
  if (id === 'hyperspaceSpaceport') return {
    helium3: 16000 * dimensional,
    ...(higherDimensional ? { water: 16000 } : {}),
    ...(isResourceUnlocked('deuterium', state) ? { deuterium: 8000 * dimensional } : {}),
  };
  if (id === 'iceMiningShip') return { water: 100 };
  if (id === 'asteroidBase') return {
    water: 8000 * dimensional,
    helium3: 4000 * dimensional,
    neutron: 8000 * dimensional,
    ...(isResourceUnlocked('deuterium', state) ? { deuterium: 2000 * dimensional } : {}),
  };
  if (id === 'hazardousMaterialStorage') return { e710: 500, neutron: 32000 };
  if (id === 'civilianRouteStation') return { cash: 32000 * dimensional, food: 32000 * dimensional };
  if (id === 'e710Container') return { e710: 50 };
  if (id === 'e710Warehouse') return { e710: 200 };
  if (id === 'granary') return { food: 500 };
  if (id === 'bank' || id === 'catCafe') {
    // Vault upgrades add to the flat base before additive percentage bonuses;
    // intelligent banking doubles the full per-building contribution afterwards.
    const multiplier = (1 + (state.tech.includes('iridiumAlloyWarehouse') ? .2 : 0))
      * (state.tech.includes('intelligentBankingSystem') ? 2 : 1);
    if (id === 'catCafe') {
      const base = 4000 + (state.tech.includes('iridiumSteelVault') ? 2500 : 0)
        + (state.tech.includes('neutronVault') ? 3000 : 0);
      return { cash: base * multiplier };
    }
    const base = 1000 + (state.tech.includes('iridiumSteelVault') ? 1500 : 0)
      + (state.tech.includes('vaultExpansion') ? 750 : 0)
      + (state.tech.includes('steelSafe') ? 750 : 0)
      + (state.tech.includes('neutronVault') ? 2000 : 0);
    return { cash: base * multiplier };
  }
  if (id === 'warehouse') return Object.fromEntries((upgraded ? ADVANCED_STORAGE_RESOURCES : WAREHOUSE_RESOURCES).map(r => [r, (upgraded ? 500 : 250) * warehouseMultiplier]));
  if (id === 'biologyLab') return { knowledge: 3000 };
  if (id === 'e710ResearchStation') return { knowledge: 50000 };
  if (id === 'library') return { knowledge: (state.tech.includes('internet') ? 150 : 100)
    * (1 + (state.tech.includes('knowledgeInheritance') ? .1 * state.buildings.particleAccelerator : 0)) };
  if (id === 'school') return { knowledge: (state.tech.includes('internet') ? 750 : 500) * (1 + .05 * (moon?.allocations.moonObservatory || 0)) * instituteMultiplier };
  if (id === 'observatory') return { knowledge: 3000 };
  if (id === 'moonObservatory') return { knowledge: 5000 };
  if (id === 'ecologicalDome') return { food: 2500 };
  // Per supported lab: knowledge follows supported residents; E710 is flat.
  if (id === 'alienMaterialLab') return { knowledge: asriel ? 250 * countAsrielResidents(state, asriel)
    * (1 + (state.tech.includes('stationScienceFacilities') ? .05 * state.buildings.starRingStation : 0)) : 0, e710: 25 };
  if (id === 'spaceWaystation') return { oil: 250, helium3: 250 };
  if (id === 'hangar') return { ...Object.fromEntries(['copper', 'iron', 'cement', 'metal', 'titanium', 'alloy', 'polymer'].map(r => [r, 8000 * warehouseMultiplier])),
    ...(isResourceUnlocked('neutron', state) ? { neutron: 4000 * warehouseMultiplier } : {}),
    ...(isResourceUnlocked('nanotubes', state) ? { nanotubes: 25000 * warehouseMultiplier } : {}) };
  if (id === 'talosMoonMiningStation') return { neutron: 100 };
  if (id === 'galacticFuelDepot') return { oil: 4000, helium3: 2500, uranium: 1500 };
  if (id === 'researchSatellite') return { knowledge: 1500 };
  if (id === 'lab') return { knowledge: 2000 * (1 + .05 * (state.buildings.researchSatellite || 0)) * instituteMultiplier };
  if (id === 'storageHub') return Object.fromEntries(ADVANCED_STORAGE_RESOURCES.map(r => [r, (state.tech.includes('intelligentStorage') ? 2500 : 1500) * warehouseMultiplier]));
  if (id === 'moonBase') return { iridium: 100 };
  if (id === 'orbitalFuelDepot') return { oil: 2000, helium3: 1000, uranium: 500 };
  if (id === 'fuelDepot') return { oil: 1000, ...(state.tech.includes('uraniumStorage') ? { uranium: 250 } : {}), ...(state.tech.includes('helium3Storage') ? { helium3: 500 } : {}) };
  if (id === 'refinery') return { oil: 250 };
  if (id === 'solarSatellite') return { energy: 500 };
  if (id === 'batteryStation') return { energy: state.tech.includes('batteryConcentrationRing') ? 5000 : 1000 };
  if (id === 'generator') return { energy: 100 };
  const boostResource = BUILDINGS[id].boostResource;
  return boostResource ? { [boostResource]: 100 } : {};
}
