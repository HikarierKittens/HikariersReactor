import { withoutPowerCost } from './one-time-cost';
import { BUILDINGS } from '../data/buildings';
import { calculateCrisprCostReduction } from './crispr';
import { applySpaceFuelDiscount } from './space-fuel';
import { calculateQuantumLevel, calculateQuantumSwarmFactoryReduction } from './quantum';
import { calculateProduction } from './production';
import { calculateSupportPreview } from './support-preview';
import type { BuildingId } from '../types/buildings';
import type { ResourceId, ResourceAmounts, ResourceRecipe } from '../types/economy';
import type { GameState } from '../types/state';

/** Pre-computed price inputs so repeated UI quotes avoid full production/quantum solves.
 * Undefined fields fall back to the existing self-computation paths, preserving legacy behavior. */
export interface PriceContext { quantumLevel?: number; ironMiningShips?: number }

/** Build a price context once per display revision; never authorizes a payment by itself. */
export function buildPriceContext(state: GameState, dt = 1): PriceContext {
  const context: PriceContext = {};
  if (state.tech?.includes('quantumSwarm') && state.resources) context.quantumLevel = calculateQuantumLevel(state, dt);
  context.ironMiningShips = calculateSupportPreview(state, dt).ironMiningShips;
  return context;
}

/**
 * Creep architecture (2026-10 redesign): every building carries its **base
 * creep** in the registry (`costScales` — fixed data, only game updates change
 * it). Effects during a run are **dynamic creep** terms, each listed once:
 * CRISPR materials, government policy and tech reductions. Actual creep is
 * `base + Σ dynamic` per resource (one building may use different scales per
 * resource). Segmented projects keep their fixed prices (creep terms still
 * exist for them, but the price formula ignores creep for segments).
 */
export interface DynamicCreepTerm { label: string; value: number }

/** Non-ground regions: orbital/planetary, hyperspace and digital-world buildings.
 * ARPA projects are not BuildingIds and never pass through this pricing path. */
export const HARMONY_BUILDING_IDS = new Set<BuildingId>([
  'touristStation', 'solarSatellite', 'researchSatellite', 'orbitalFuelDepot', 'navigationBeacon',
  'moonBase', 'iridiumMine', 'helium3Mine', 'moonObservatory',
  'asrielSpaceport', 'asrielControlTower', 'asrielResidence', 'asrielMine', 'ecologicalDome', 'hangar', 'spaceFactory', 'starRingStation', 'planetaryFoundry', 'spaceGarrison', 'alienMaterialLab', 'vrCenter', 'geothermalPlant',
  'swarmControlStation', 'swarmSatellite', 'swarmFactory', 'atmosphericCollector', 'galacticFuelDepot', 'talosMoonMiningStation', 'miningDrone', 'oilExtractor', 'aiSupercore',
  'iridiumMiningShip', 'ironMiningShip', 'e710MiningShip', 'e710Container', 'e710Warehouse', 'e710Reactor', 'interstellarDock',
  'constraintArray', 'signalRepeater', 'shortRangeRelay', 'anchorFreightStation', 'civilianRouteStation', 'hyperspaceSpaceport', 'iceMiningShip', 'asteroidBase', 'hydrogenPowerPlant', 'comprehensiveMiningFacility', 'gasCloudMiningShip', 'highTechFarmPlatform', 'fusionPowerPlant', 'metalMiningShip', 'fuelMiningShip', 'spaceRipper', 'highTechFactory', 'e710ResearchStation',
  'adamantiteMiningShip', 'adamantiteProcessor', 'grapheneFactory', 'stellarForge', 'hazardousMaterialStorage', 'aiDataCenter', 'blackHoleStation', 'penroseSphere', 'dysonSphere', 'massEjector',
  'gatewayRouter', 'downloadExecutable', 'quantumStorage', 'downloadCache', 'subcomputeNode', 'quantizedCompressionModule', 'dataCompression', 'cpuDecoder', 'cellCore', 'memoryCore', 'ethMiner', 'dataDecryptionModule',
  'softRouterNode', 'aesComputeModule', 'worldSimulator', 'agiCoreComponent', 'coreCooler', 'agiAscensionCore',
]);
export function calculateHarmonyCreepReduction(state: Partial<Pick<GameState, 'prestige'>>): number {
  const harmony = state.prestige?.harmonyCrystals ?? 0;
  return (Math.log(50 + harmony) - Math.log(50)) * .01;
}

/** Collect every active dynamic creep contribution for one building/resource. */
export function calculateDynamicCreep(id: BuildingId, resource: ResourceId, state: Pick<GameState, 'government'> & Partial<Pick<GameState, 'crispr' | 'tech' | 'buildings' | 'prestige'>>): DynamicCreepTerm[] {
  const terms: DynamicCreepTerm[] = [];
  // Segmented projects have a permanent creep of exactly 1: no dynamic term may apply.
  if (BUILDINGS[id].segmentedRequired) return terms;
  const harmony = HARMONY_BUILDING_IDS.has(id) ? calculateHarmonyCreepReduction(state) : 0;
  if (harmony) terms.push({ label: '和谐水晶', value: -harmony });
  const crispr = calculateCrisprCostReduction(state);
  if (crispr) terms.push({ label: 'CRISPR 材料基因', value: -crispr });
  if (id === 'factory' && state.government === 'industrialism') terms.push({ label: '工业至上体制', value: -.005 });
  if (['nest', 'nestMKII'].includes(id) && state.tech?.includes('steelBuildingMaterials')) terms.push({ label: '钢制建材', value: -.01 });
  if (['nest', 'nestMKII'].includes(id) && state.tech?.includes('neutronConstructionMaterials')) terms.push({ label: '中子结构建材', value: -.01 });
  return terms;
}

/** Lowest actual creep any ordinary building may reach after all dynamic reductions. */
export const MIN_BUILDING_SCALE = 1.005;

/** Actual creep = base (registry scale) + Σ dynamic terms, floored at MIN_BUILDING_SCALE.
 * Exempt: segmented projects (fixed creep 1) and explicitly specified registry scales that
 * are already below the floor (e.g. the once-only 星际船坞 at 1), which keep their own value. */
export function calculateBuildingScale(id: BuildingId, resource: ResourceId, state: Pick<GameState, 'government'> & Partial<Pick<GameState, 'crispr' | 'tech' | 'buildings' | 'prestige'>>): number {
  const scale = BUILDINGS[id].costScales?.[resource];
  if (scale === undefined) throw new Error(`Missing cost scale: ${id}/${resource}`);
  const dynamic = calculateDynamicCreep(id, resource, state).reduce((sum, term) => sum + term.value, 0);
  const floor = BUILDINGS[id].segmentedRequired || scale < MIN_BUILDING_SCALE ? Math.min(1, scale) : MIN_BUILDING_SCALE;
  return Math.max(floor, Number((scale + dynamic).toFixed(12)));
}

/** True when a once-only building (max count or segmented completion) is fully built.
 * AI超级核心 is the only segmented building (100 segments, no further max);
 * communityCenter is the only max:1 building; all other buildings have no cap. */
export function isBuildingFullyBuilt(id: BuildingId, state: Pick<GameState, 'buildings'>): boolean {
  const building = BUILDINGS[id];
  const owned = state.buildings[id] || 0;
  // Completed forms of segmented projects exist only once they are built, so owning one means
  // the project is finished even when the entry declares no unit cap.
  if (building.buildable === false) return owned >= (building.max ?? 1);
  if (building.segmentedRequired) {
    const segments = building.max ?? building.segmentedRequired;
    return owned >= segments;
  }
  return building.max !== undefined && owned >= building.max;
}
export function calculateBuildingCost(id: BuildingId, count: number, state: GameState, context?: PriceContext): ResourceRecipe {
  // Segmented projects (AI超级核心, 空间撕裂者) always charge the fixed per-segment
  // price: creep is exactly 1 and dynamic creep terms (CRISPR etc.) never apply.
  if (BUILDINGS[id].segmentedRequired) return withoutPowerCost(BUILDINGS[id].cost);
  let logDiscount = 0;
  if (id === 'swarmSatellite') {
    const quantum = state.tech?.includes('quantumSwarm') && state.resources
      ? context?.quantumLevel ?? calculateQuantumLevel(state)
      : 0;
    const percent = calculateQuantumSwarmFactoryReduction(state, quantum);
    const factories = state.buildings?.swarmFactory || 0;
    // Factories compound, but the final satellite price never falls below 5%.
    logDiscount = factories > 0 ? Math.max(Math.log(.05), factories * Math.log(Math.max(.05, 1 - percent))) : 0;
  }
  if (id === 'swarmFactory' && state.tech?.includes('swarmFactoryOptimization') && state.resources) {
    const ironShips = context?.ironMiningShips ?? (calculateProduction(state).inputUnits.ironMiningShip || 0);
    logDiscount = ironShips * Math.log(.95);
  }
  const discounted = logDiscount !== 0;
  return applySpaceFuelDiscount(id, Object.fromEntries(Object.entries(BUILDINGS[id].cost)
    .filter(([resource]) => resource !== 'energy' && (resource !== 'cash' || id !== 'nest' || count >= 5))
    .map(([resource, value]) => {
      const scale = calculateBuildingScale(id, resource as ResourceId, state);
      const residence = id === 'asrielResidence' && state.tech?.includes('neutronConstructionMaterials') ? .85 : 1;
      // Log-space multiplication prevents Infinity * 0 when scale and discounts oppose.
      const price = discounted
        ? Math.max(Number.MIN_VALUE, Math.exp(Math.log(value) + count * Math.log(scale) + Math.log(residence) + logDiscount))
        : Math.ceil(value * scale ** count * residence);
      return [resource, price];
    })), state);
}
export function canPayCost(resources: ResourceAmounts, cost: ResourceRecipe): boolean {
  return (Object.entries(withoutPowerCost(cost)) as [ResourceId, number][]).every(([id, value]) => Number.isFinite(value) && value >= 0 && resources[id] + 1e-8 >= value);
}
/** All-or-nothing payment. The epsilon and floor preserve existing save/economy behavior. */
export function payResourceCost(resources: ResourceAmounts, cost: ResourceRecipe): boolean {
  if (!canPayCost(resources, cost)) return false;
  for (const [id, value] of Object.entries(withoutPowerCost(cost)) as [ResourceId, number][]) resources[id] = Math.max(0, resources[id] - value);
  return true;
}
