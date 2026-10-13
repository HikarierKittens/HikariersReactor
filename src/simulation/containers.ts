import { BUILDINGS } from '../data/buildings';
import { RESOURCES } from '../data/resources';
import { isResourceUnlocked } from './unlocks';
import type { BuildingId } from '../types/buildings';
import type { ResourceId, ResourceRecipe } from '../types/economy';
import type { GameState } from '../types/state';

export function calculateContainerCapacity(state: Pick<GameState, 'buildings'>): number {
  return (Object.keys(BUILDINGS) as BuildingId[]).reduce((sum, id) => sum + (BUILDINGS[id].containerCap || 0) * state.buildings[id], 0);
}
export function calculateSpaceContainerCapacity(state: Pick<GameState, 'buildings'>): number {
  return (Object.keys(BUILDINGS) as BuildingId[]).reduce((sum, id) => sum + (BUILDINGS[id].spaceContainerCap || 0) * state.buildings[id], 0);
}
export function countAssignedContainers(state: Pick<GameState, 'containerAssignments'>): number {
  return Object.values(state.containerAssignments).reduce((sum, count) => sum + count, 0);
}
export function isContainerAssignable(id: string, state: GameState): boolean {
  return Object.hasOwn(RESOURCES, id) && !RESOURCES[id as ResourceId].special
    && !['water', 'oil', 'uranium', 'cash', 'helium3', 'deuterium', 'mithril', 'neutron', 'e710', 'nanotubes'].includes(id) && isResourceUnlocked(id, state);
}
export function calculateContainerUnitCapacity(state: Pick<GameState, 'tech'>): number {
  return (state.tech.includes('steelContainers') ? 500 : 250) * (state.tech.includes('reinforcedContainers') ? 2 : 1);
}
export function calculateContainerRecipe(state: Pick<GameState, 'tech'>): ResourceRecipe {
  return state.tech.includes('steelContainers') ? { metal: 50 } : { iron: 25 };
}
