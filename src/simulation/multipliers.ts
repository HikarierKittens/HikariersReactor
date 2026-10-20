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
export function calculateKnowledgeMultiplier(state: Pick<GameState, 'buildings'>, dataUnits: number, digital?: { aesUnits?: number }): number {
  return 1 + (Object.keys(BUILDINGS) as BuildingId[]).reduce((sum, id) => sum + (id === 'observatory' ? dataUnits : id === 'aesComputeModule' ? digital?.aesUnits ?? 0 : state.buildings[id] || 0) * (BUILDINGS[id].knowledgeBoost || 0), 0);
}
export function calculateAluminumMultiplier(state: GameState): number { return calculateRefiningMultiplier('aluminum', state); }
/** Particle imbalance repurposes accelerators for ordinary production, including knowledge. */
export function calculateChallengeAcceleratorMultiplier(id: string, state: Pick<GameState, 'buildings'> & Partial<GameState>): number {
  return isChallengeGeneActive(state, 'particleImbalance') && Object.hasOwn(RESOURCES, id)
    && id !== 'energy'
    ? 1 + (RESOURCES[id as ResourceId].crafted ? .0125 : .05) * (state.buildings.particleAccelerator || 0) : 1;
}
/**
 * 幸福度产量倍率. Below the 100% baseline every point still costs 1% output; the
 * part above 100% is deliberately flatter: each point grants +0.5% global output
 * (150% → ×1.25, 200% → ×1.5). Energy and crafted goods never use this multiplier.
 */
export function calculateHappinessMultiplier(happiness: number): number {
  if (!Number.isFinite(happiness)) return 1;
  return happiness <= 100 ? Math.max(0, happiness) / 100 : 1 + (happiness - 100) * .005;
}
export function calculateProductionMultiplier(id: string, happiness: number, state: GameState): number {
  return calculateHappinessMultiplier(happiness) * calculateCommunityMultiplier(id, state) * calculateRefiningMultiplier(id, state)
    * (id === 'cash' ? 1 : calculateGovernmentMultiplier(id, state)) * calculateChallengeAcceleratorMultiplier(id, state);
}
export function calculateFactoryOutputMultiplier(id: ResourceId, happiness: number, state: GameState, knowledge: number): number {
  return (RESOURCES[id].crafted || id === 'energy' ? 1 : calculateProductionMultiplier(id, happiness, state) * (id === 'knowledge' ? knowledge : 1))
    * calculateGlobalOutputMultiplier(id, state) * (RESOURCES[id].crafted ? calculateChallengeAcceleratorMultiplier(id, state) : 1) * (state.government === 'industrialism' ? 1.25 : 1)
    * (id === 'polymer' && state.tech.includes('titaniumAlloyReactor') ? 1.5 : 1);
}
