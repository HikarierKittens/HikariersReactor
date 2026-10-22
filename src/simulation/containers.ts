import { BUILDINGS } from '../data/buildings';
import { RESOURCES } from '../data/resources';
import { isResourceUnlocked } from './unlocks';
import { unificationAlloyContainerSlots, unificationContainerSlots } from './unification-storage';
import type { BuildingId } from '../types/buildings';
import type { ResourceId, ResourceRecipe } from '../types/economy';
import type { GameState } from '../types/state';

/** 超级集装箱 raises 集装仓库 to 25; 中子库 replaces 格纳库's ordinary cap with 40.
 *  世界统一 adds a flat +10 slots to both (on top of whichever upgrade applies). */
export function calculateBuildingContainerCap(id: BuildingId, state: Pick<GameState, 'tech'>): number {
  if (id === 'hangar') return (state.tech.includes('neutronVault') ? 40 : BUILDINGS[id].containerCap || 0) + unificationContainerSlots(state);
  if (id === 'containerWarehouse') return (state.tech.includes('superContainers') ? 25 : BUILDINGS[id].containerCap || 0) + unificationContainerSlots(state);
  return BUILDINGS[id].containerCap || 0;
}
export function calculateContainerCapacity(state: Pick<GameState, 'buildings' | 'tech'>): number {
  return (Object.keys(BUILDINGS) as BuildingId[]).reduce((sum, id) => sum + calculateBuildingContainerCap(id, state) * state.buildings[id], 0);
}
/** Alloy slots require 超级集装箱: 集装仓库 10, 格纳库 15 (replaced by 25 with 中子库).
 *  世界统一 adds a flat +5 to both. */
export function calculateBuildingAlloyContainerCap(id: BuildingId, state: Pick<GameState, 'tech'>): number {
  if (!state.tech.includes('superContainers')) return 0;
  const base = id === 'containerWarehouse' ? 10 : id === 'hangar' ? (state.tech.includes('neutronVault') ? 25 : 15) : 0;
  return base ? base + unificationAlloyContainerSlots(state) : 0;
}
export function calculateAlloyContainerCapacity(state: Pick<GameState, 'buildings' | 'tech'>): number {
  return (['containerWarehouse', 'hangar'] as const).reduce((sum, id) => sum + calculateBuildingAlloyContainerCap(id, state) * (state.buildings[id] || 0), 0);
}
export function countAssignedAlloyContainers(state: Pick<GameState, 'alloyContainerAssignments'>): number {
  return Object.values(state.alloyContainerAssignments).reduce((sum, count) => sum + count, 0);
}
export function countAssignedContainers(state: Pick<GameState, 'containerAssignments'>): number {
  return Object.values(state.containerAssignments).reduce((sum, count) => sum + count, 0);
}
export function isContainerAssignable(id: string, state: GameState): boolean {
  return Object.hasOwn(RESOURCES, id) && !RESOURCES[id as ResourceId].special
    && !['water', 'oil', 'uranium', 'cash', 'helium3', 'deuterium', 'mithril', 'neutron', 'e710', 'nanotubes', 'aerogel'].includes(id) && isResourceUnlocked(id, state);
}
export function calculateContainerUnitCapacity(state: Pick<GameState, 'tech'>): number {
  // 250 base; 钢集装箱 ×2, 强化集装箱 ×2, 铱合金集装箱 ×2.5 (1000 → 2500 with all three).
  return (state.tech.includes('steelContainers') ? 500 : 250) * (state.tech.includes('reinforcedContainers') ? 2 : 1)
    * (state.tech.includes('iridiumAlloyContainers') ? 2.5 : 1);
}
/** Four ordinary containers' worth, sharing every container upgrade. */
export function calculateAlloyContainerUnitCapacity(state: Pick<GameState, 'tech'>): number {
  return 4 * calculateContainerUnitCapacity(state);
}
export const ALLOY_CONTAINER_RECIPE: ResourceRecipe = { alloy: 10 };
export function calculateContainerRecipe(state: Pick<GameState, 'tech'>): ResourceRecipe {
  return state.tech.includes('steelContainers') ? { metal: 50 } : { iron: 25 };
}
