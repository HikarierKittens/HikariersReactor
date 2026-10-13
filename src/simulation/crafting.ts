import { CONFIG } from '../data/config';
import { CRAFT_RECIPES, RESOURCES } from '../data/resources';
import { isResourceUnlocked } from './unlocks';
import { calculateSupportPreview } from './support-preview';
import { countAsrielResidents } from './asriel';
import { calculateEffectiveParticleCount, isChallengeGeneActive } from './challenges';
import type { AsrielSupport } from '../types/economy';
import type { CraftId, ResourceId, ResourceAmounts } from '../types/economy';
import type { GameState } from '../types/state';

/** Production-only effective count; storage and actual particle balances remain linear. */
export function calculateEffectiveParticles(particles: number, softCap: number = CONFIG.particleProductionSoftCap): number {
  const count = Number.isFinite(particles) ? Math.max(0, particles) : 0;
  const cap = Number.isFinite(softCap) && softCap > 0 ? softCap : CONFIG.particleProductionSoftCap;
  const strength = CONFIG.particleProductionDecayStrength;
  const scale = cap / 2;
  if (count <= cap) return cap / strength * Math.log1p(strength * count / cap);
  return cap / strength * Math.log1p(strength)
    + scale / (1 + strength) * Math.log1p((count - cap) / scale);
}
export function calculateParticleMultiplier(id: ResourceId, state: Pick<GameState, 'prestige'> & Partial<GameState>): number {
  const softCap = CONFIG.particleProductionSoftCap + (state.prestige?.casimir || 0);
  const originalBonus = calculateEffectiveParticles(calculateEffectiveParticleCount(state), softCap) * (RESOURCES[id]?.crafted ? .00125 : .005);
  // Only raw particle holdings pass through diminishing returns. Accelerator
  // additions are linear on that original bonus and never softened again.
  const acceleratorBonus = isChallengeGeneActive(state, 'particleImbalance') ? 0 : originalBonus * .1 * (state.buildings?.particleAccelerator || 0);
  return id === 'energy' ? 1 : 1 + originalBonus + acceleratorBonus;
}
export function calculateFoundryMultiplier(state: Pick<GameState, 'tech' | 'buildings'>): number {
  return state.tech.includes('castingToolUpgrade') ? 1 + (state.buildings.foundry || 0) * .03 : 1;
}
export function calculateCraftingMultiplier(id: ResourceId, state: GameState, support?: AsrielSupport): number {
  let planetary = 1;
  if (state.resources && state.workers && state.population !== undefined && state.stoppedBuildings && state.buildings.planetaryFoundry) {
    const allocation = support || calculateSupportPreview(state).asriel;
    planetary += .03 * (allocation.allocations.planetaryFoundry || 0) * countAsrielResidents(state, allocation);
  }
  const accelerator = isChallengeGeneActive(state, 'particleImbalance') && RESOURCES[id]?.crafted
    ? 1 + .0125 * (state.buildings.particleAccelerator || 0) : 1;
  return calculateParticleMultiplier(id, state) * calculateFoundryMultiplier(state) * planetary * accelerator;
}
export function countCraftWorkers(state: Pick<GameState, 'craftWorkers'>): number {
  return Object.values(state.craftWorkers).reduce((sum, count) => sum + count, 0);
}
/** Player craft assignment: bounded by foundry workers, unlocked recipes, and integer steps. */
export function changeCraftAssignment(state: GameState, id: string, delta: number): number {
  if (!Object.hasOwn(CRAFT_RECIPES, id) || !isResourceUnlocked(id, state) || !Number.isSafeInteger(delta) || !delta) return 0;
  const craft = id as CraftId;
  const amount = delta > 0
    ? Math.min(delta, state.workers.foundry - countCraftWorkers(state))
    : -Math.min(-delta, state.craftWorkers[craft]);
  if (!amount) return 0;
  state.craftWorkers[craft] += amount;
  return amount;
}
export function trimAssignedCraftWorkers(state: Pick<GameState, 'workers' | 'craftWorkers'>): void {
  let spare = state.workers.foundry;
  for (const id of Object.keys(CRAFT_RECIPES) as CraftId[]) {
    state.craftWorkers[id] = Math.min(state.craftWorkers[id], spare);
    spare -= state.craftWorkers[id];
  }
}
/** These bonuses apply only to assigned artisans, never to manual forging. */
export function calculateAutomaticCraftingMultipliers(state: Pick<GameState, 'crispr'>) {
  return {
    input: state.crispr.includes('masterArtisan') ? 2 : 1,
    output: (state.crispr.includes('technician') ? 2 : 1) * (state.crispr.includes('masterArtisan') ? 2 : 1),
  };
}
export function settleAutomaticCrafting(state: GameState, pool: ResourceAmounts, dt: number, support?: AsrielSupport) {
  const artisan = calculateAutomaticCraftingMultipliers(state);
  const inputs: Partial<Record<`craft:${CraftId}`, number>> = {};
  const outputs: Partial<Record<`craft:${CraftId}`, number>> = {};
  const allocation = support || calculateSupportPreview(state).asriel;
  let availableWorkers = Math.min(state.workers.foundry, (state.buildings.foundry || 0) + (allocation.allocations.planetaryFoundry || 0));
  for (const id of Object.keys(CRAFT_RECIPES) as CraftId[]) {
    const recipe = CRAFT_RECIPES[id], count = Math.min(state.craftWorkers[id] || 0, availableWorkers);
    availableWorkers -= count;
    if (!count || !isResourceUnlocked(id, state)) continue;
    let amount = count * recipe.rate * dt;
    const ingredients = Object.entries(recipe.input) as [ResourceId, number][];
    for (const [resource, value] of ingredients) amount = Math.min(amount, pool[resource] / (value * artisan.input));
    amount = Math.max(0, amount);
    for (const [resource, value] of ingredients) pool[resource] -= value * amount * artisan.input;
    const output = amount * calculateCraftingMultiplier(id, state, support) * artisan.output;
    pool[id] += output;
    inputs[`craft:${id}`] = amount * artisan.input / dt;
    outputs[`craft:${id}`] = output / dt;
  }
  return { inputs, outputs };
}

/** Unlock validation belongs to the command boundary, not the recipe calculation. */
export function calculateMaxCraftable(id: CraftId, state: Pick<GameState, 'resources'>): number {
  const recipe = CRAFT_RECIPES[id];
  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER - Math.floor(state.resources[id]),
    ...Object.entries(recipe.input).map(([resource, amount]) => Math.floor(state.resources[resource as ResourceId] / amount))));
}
