import { calculateRefiningMultiplier } from './refining';
import { BUILDINGS } from '../data/buildings';
import { RESOURCES } from '../data/resources';
import { calculateGovernmentMultiplier } from './government';
import { calculateGlobalOutputMultiplier } from './crafting';
import { isChallengeGeneActive } from './challenges';
import type { BuildingId } from '../types/buildings';
import type { ResourceId } from '../types/economy';
import type { GameState } from '../types/state';

/** Legacy hook kept for save compatibility: communityCenter no longer boosts production. */
export function calculateCommunityMultiplier(id: string, state: Pick<GameState, 'buildings'>): number {
  return 1;
}
export function calculateKnowledgeMultiplier(state: Pick<GameState, 'buildings'>, dataUnits: number): number {
  return 1 + (Object.keys(BUILDINGS) as BuildingId[]).reduce((sum, id) => sum + (id === 'observatory' ? dataUnits : state.buildings[id] || 0) * (BUILDINGS[id].knowledgeBoost || 0), 0);
}
export function calculateAluminumMultiplier(state: GameState): number { return calculateRefiningMultiplier('aluminum', state); }
/** Particle imbalance repurposes accelerators for ordinary production, including knowledge. */
export function calculateChallengeAcceleratorMultiplier(id: string, state: Pick<GameState, 'buildings'> & Partial<GameState>): number {
  return isChallengeGeneActive(state, 'particleImbalance') && Object.hasOwn(RESOURCES, id)
    && id !== 'energy'
    ? 1 + (RESOURCES[id as ResourceId].crafted ? .0125 : .05) * (state.buildings.particleAccelerator || 0) : 1;
}
export function calculateProductionMultiplier(id: string, happiness: number, state: GameState): number {
  if (id === 'bytes') return 1;
  return happiness / 100 * calculateCommunityMultiplier(id, state) * calculateRefiningMultiplier(id, state)
    * (id === 'cash' ? 1 : calculateGovernmentMultiplier(id, state)) * calculateChallengeAcceleratorMultiplier(id, state);
}
export function calculateFactoryOutputMultiplier(id: ResourceId, happiness: number, state: GameState, knowledge: number): number {
  return (RESOURCES[id].crafted || id === 'energy' ? 1 : calculateProductionMultiplier(id, happiness, state) * (id === 'knowledge' ? knowledge : 1))
    * calculateGlobalOutputMultiplier(id, state) * (RESOURCES[id].crafted ? calculateChallengeAcceleratorMultiplier(id, state) : 1) * (state.government === 'industrialism' ? 1.25 : 1)
    * (id === 'polymer' && state.tech.includes('titaniumAlloyReactor') ? 1.5 : 1);
}
