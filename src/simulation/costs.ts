import { BUILDINGS } from '../data/buildings';
import { calculateCrisprCostReduction } from './crispr';
import { applySpaceFuelDiscount } from './space-fuel';
import { calculateQuantumLevel } from './quantum';
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

/** Collect every active dynamic creep contribution for one building/resource. */
export function calculateDynamicCreep(id: BuildingId, resource: ResourceId, state: Pick<GameState, 'government'> & Partial<Pick<GameState, 'crispr' | 'tech' | 'buildings'>>): DynamicCreepTerm[] {
  const terms: DynamicCreepTerm[] = [];
  // Segmented projects have a permanent creep of exactly 1: no dynamic term may apply.
  if (BUILDINGS[id].segmentedRequired) return terms;
  const crispr = calculateCrisprCostReduction(state);
  if (crispr) terms.push({ label: 'CRISPR 材料基因', value: -crispr });
  if (id === 'factory' && state.government === 'industrialism') terms.push({ label: '工业至上体制', value: -.005 });
  if (['nest', 'nestMKII'].includes(id) && state.tech?.includes('neutronConstructionMaterials')) terms.push({ label: '中子结构建材', value: -.01 });
  return terms;
}

/** Actual creep = base (registry scale) + Σ dynamic terms, floored at 1 to keep prices rising. */
export function calculateBuildingScale(id: BuildingId, resource: ResourceId, state: Pick<GameState, 'government'> & Partial<Pick<GameState, 'crispr' | 'tech' | 'buildings'>>): number {
  const scale = BUILDINGS[id].costScales?.[resource];
  if (scale === undefined) throw new Error(`Missing cost scale: ${id}/${resource}`);
  const dynamic = calculateDynamicCreep(id, resource, state).reduce((sum, term) => sum + term.value, 0);
  return Math.max(1, Number((scale + dynamic).toFixed(12)));
}

/** True when a once-only building (max count or segmented completion) is fully built.
 * AI超级核心 is the only segmented building (100 segments, no further max);
 * communityCenter is the only max:1 building; all other buildings have no cap. */
export function isBuildingFullyBuilt(id: BuildingId, state: Pick<GameState, 'buildings'>): boolean {
  const building = BUILDINGS[id];
  const owned = state.buildings[id] || 0;
  if (building.segmentedRequired) {
    const segments = building.max ?? building.segmentedRequired;
    return owned >= segments;
  }
  return building.max !== undefined && owned >= building.max;
}
export function calculateBuildingCost(id: BuildingId, count: number, state: GameState, context?: PriceContext): ResourceRecipe {
  // Segmented projects (AI超级核心, 空间撕裂者) always charge the fixed per-segment
  // price: creep is exactly 1 and dynamic creep terms (CRISPR etc.) never apply.
  if (BUILDINGS[id].segmentedRequired) return { ...BUILDINGS[id].cost };
  let logDiscount = 0;
  if (id === 'swarmSatellite') {
    const quantum = state.tech?.includes('quantumSwarm') && state.resources
      ? context?.quantumLevel ?? calculateQuantumLevel(state)
      : 0;
    const percent = .1 + (state.tech?.includes('quantumSwarm') ? Math.floor(quantum / 5) * .01 : 0);
    const factories = state.buildings?.swarmFactory || 0;
    logDiscount = factories > 0 ? factories * Math.log(Math.max(Number.MIN_VALUE, 1 - percent)) : 0;
  }
  if (id === 'swarmFactory' && state.tech?.includes('swarmFactoryOptimization') && state.resources) {
    const ironShips = context?.ironMiningShips ?? (calculateProduction(state).inputUnits.ironMiningShip || 0);
    logDiscount = ironShips * Math.log(.95);
  }
  const discounted = logDiscount !== 0;
  return applySpaceFuelDiscount(id, Object.fromEntries(Object.entries(BUILDINGS[id].cost)
    .filter(([resource]) => resource !== 'cash' || id !== 'nest' || count >= 5)
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
  return (Object.entries(cost) as [ResourceId, number][]).every(([id, value]) => Number.isFinite(value) && value >= 0 && resources[id] + 1e-8 >= value);
}
/** All-or-nothing payment. The epsilon and floor preserve existing save/economy behavior. */
export function payResourceCost(resources: ResourceAmounts, cost: ResourceRecipe): boolean {
  if (!canPayCost(resources, cost)) return false;
  for (const [id, value] of Object.entries(cost) as [ResourceId, number][]) resources[id] = Math.max(0, resources[id] - value);
  return true;
}
