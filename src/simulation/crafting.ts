import { getAchievementMasteryBonus } from './achievement-tracking';
import { occupationOutputMultiplier } from './neighbors';
import { CONFIG } from '../data/config';
import { CRAFT_RECIPES, RESOURCES } from '../data/resources';
import { isResourceUnlocked } from './unlocks';
import { calculateSupportPreview } from './support-preview';
import { countAsrielResidents } from './asriel';
import { calculateEffectiveParticleCount, isChallengeGeneActive } from './challenges';
import { geneBonus, geneExtraBonus } from './genes';
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
  const originalBonus = calculateEffectiveParticles(calculateEffectiveParticleCount(state), softCap) * (RESOURCES[id]?.crafted ? .000625 : .005);
  // Only raw particle holdings pass through diminishing returns. Accelerator
  // additions are linear on that original bonus and never softened again.
  const acceleratorBonus = isChallengeGeneActive(state, 'particleImbalance') ? 0 : originalBonus * .1 * (state.buildings?.particleAccelerator || 0);
  return id === 'energy' ? 1 : 1 + originalBonus + acceleratorBonus;
}
/** Independent output-only mastery; never modifies stocks, costs or energy. */
export function calculateMasteryMultiplier(id: ResourceId, state: Pick<GameState, 'prestige'> & Partial<GameState>): number {
  return id === 'energy' ? 1 : 1 + getAchievementMasteryBonus(state);
}
/** Shared final resource factor, applied once at each production credit boundary. */
export function calculateGlobalOutputMultiplier(id: ResourceId, state: Pick<GameState, 'prestige'> & Partial<GameState>): number {
  // 占领: each occupied neighbour is a flat +5% to every resource, applied as one factor.
  const occupation = state.neighbors ? occupationOutputMultiplier(state as GameState) : 1;
  return calculateParticleMultiplier(id, state) * calculateMasteryMultiplier(id, state) * occupation;
}
/**
 * 锻造工具加成: a single additive pool of *building-sourced* tool bonuses —
 * 铸造厂 (with 锻造工具加成 tech), 恒星熔炉 and 行星铸造厂. The pool is applied as
 * one independent factor, so two tool sources never multiply each other.
 *
 * The 技工/工匠大师 CRISPR upgrades are deliberately NOT here: they raise the
 * artisan's base output (see `calculateAutomaticCraftingMultipliers`), so they are
 * part of the base figure rather than a listed bonus.
 */
export interface ForgingToolBonus {
  /** Total additive bonus, 0.03 = +3%. */
  total: number;
  /** Per-source breakdown, in a stable display order. */
  entries: { id: string; name: string; value: number }[];
}

export function calculateForgingToolBonus(
  state: Pick<GameState, 'tech' | 'buildings'> & Partial<GameState>,
  planetaryResidents = 0,
  planetaryAllocated = 0,
): ForgingToolBonus {
  const entries: { id: string; name: string; value: number }[] = [];
  const foundries = state.buildings.foundry || 0;
  if (state.tech.includes('castingToolUpgrade') && foundries > 0) {
    entries.push({ id: 'foundry', name: '铸造厂', value: foundries * .03 });
  }
  const stellar = state.buildings.stellarForge || 0;
  if (stellar > 0) entries.push({ id: 'stellarForge', name: '恒星熔炉', value: stellar * .1 });
  if (planetaryAllocated > 0 && planetaryResidents > 0) {
    entries.push({ id: 'planetaryFoundry', name: '行星铸造厂', value: .03 * planetaryAllocated * planetaryResidents });
  }
  return { total: entries.reduce((sum, entry) => sum + entry.value, 0), entries };
}

/** 行星铸造厂 residents are only counted once the support preview is available. */
function planetaryResidentCount(state: GameState, support?: AsrielSupport): number {
  if (!state.resources || !state.workers || state.population === undefined || !state.stoppedBuildings) return 0;
  const allocation = support || calculateSupportPreview(state).asriel;
  return countAsrielResidents(state, allocation);
}

/** Additive tool bonus as a single independent multiplier (1 + Σ sources). */
export function calculateForgingToolMultiplier(state: GameState, support?: AsrielSupport): number {
  const planetaryResidents = state.buildings.planetaryFoundry ? planetaryResidentCount(state, support) : 0;
  const planetaryAllocated = state.buildings.planetaryFoundry
    ? (support?.allocations.planetaryFoundry ?? calculateSupportPreview(state).asriel.allocations.planetaryFoundry ?? 0) : 0;
  return 1 + calculateForgingToolBonus(state, planetaryResidents, planetaryAllocated).total;
}

export function calculateFoundryMultiplier(state: Pick<GameState, 'tech' | 'buildings'>): number {
  return state.tech.includes('castingToolUpgrade') ? 1 + (state.buildings.foundry || 0) * .03 : 1;
}
export function calculateCraftingMultiplier(id: ResourceId, state: GameState, support?: AsrielSupport): number {
  const accelerator = isChallengeGeneActive(state, 'particleImbalance') && RESOURCES[id]?.crafted
    ? 1 + .0125 * (state.buildings.particleAccelerator || 0) : 1;
  // 锻造工具加成 is one additive pool; 超频锻造 stays an independent multiplier.
  return calculateGlobalOutputMultiplier(id, state) * calculateForgingToolMultiplier(state, support) * accelerator
    * calculateOverclockCraftMultiplier(state);
}
/** 超频锻造: +2% crafted output per level, for manual forging and artisans alike. */
export function calculateOverclockCraftMultiplier(state: Partial<Pick<GameState, 'geneModification'>>): number {
  return 1 + geneBonus(state, 'overclockForging');
}
export function countCraftWorkers(state: Pick<GameState, 'craftWorkers'>): number {
  return Object.values(state.craftWorkers).reduce((sum, count) => sum + count, 0);
}
/**
 * Player craft assignment: bounded by foundry workers, unlocked recipes, and integer steps.
 *
 * Withdrawing (`delta < 0`) is always allowed. A recipe can lose its unlock between
 * releases (秘银 now also needs 合金), and stopping production ahead of the unlock gate
 * would strand those artisans in a slot the player can no longer clear.
 */
export function changeCraftAssignment(state: GameState, id: string, delta: number): number {
  if (!Object.hasOwn(CRAFT_RECIPES, id) || !Number.isSafeInteger(delta) || !delta) return 0;
  if (delta > 0 && !isResourceUnlocked(id, state)) return 0;
  const craft = id as CraftId;
  const amount = delta > 0
    ? Math.min(delta, Math.max(0, state.workers.foundry - countCraftWorkers(state)))
    : -Math.min(-delta, state.craftWorkers[craft]);
  if (!amount) return 0;
  state.craftWorkers[craft] += amount;
  return amount;
}
/**
 * Clamp artisan assignments to the available workshop slots.
 *
 * Locked recipes keep their artisans on purpose. A recipe can lose its unlock between
 * releases (秘银 now also requires 合金), and the panel exposes those stranded rows so the
 * player can reclaim them; clearing them here would make that row vanish before it renders.
 * Only the slot count is enforced, which is what this function is named for.
 */
export function trimAssignedCraftWorkers(state: Pick<GameState, 'workers' | 'craftWorkers'>): void {
  let spare = state.workers.foundry;
  for (const id of Object.keys(CRAFT_RECIPES) as CraftId[]) {
    // A partial or legacy assignment map may omit a recipe; treat it as zero so the
    // spare-slot arithmetic cannot turn into NaN and corrupt every later recipe.
    const assigned = Number.isFinite(state.craftWorkers[id]) ? state.craftWorkers[id] : 0;
    state.craftWorkers[id] = Math.min(assigned, spare);
    spare -= state.craftWorkers[id];
  }
}
/**
 * These bonuses apply only to assigned artisans, never to manual forging.
 *
 * 技工 is an independent 锻造物 multiplier (+100%), shown in the crafted-output
 * detail as its own row. 工匠大师 instead doubles the artisan's throughput
 * (0.05 → 0.1 per second), so both output AND ingredient use double from the rate
 * itself rather than from a modifier — that is what makes it self-balancing.
 *
 * Ingredients are charged from the widened `amount` (see `settleAutomaticCrafting`),
 * so there is deliberately no input multiplier: every artisan bonus here is
 * output-only by construction, and the rate carries the throughput change.
 */
export function calculateAutomaticCraftingMultipliers(state: Pick<GameState, 'crispr'> & Partial<Pick<GameState, 'geneModification'>>): number {
  // 技工 doubles output only; 超频锻造's artisan bonus raises output only too.
  const technician = state.crispr.includes('technician') ? 2 : 1;
  return technician * (1 + geneExtraBonus(state, 'overclockForging'));
}

/** Artisan throughput per second: 0.05 by default, 0.1 with 工匠大师. */
export function artisanCraftRate(baseRate: number, state: Pick<GameState, 'crispr'>): number {
  return state.crispr.includes('masterArtisan') ? baseRate * 2 : baseRate;
}
export function settleAutomaticCrafting(state: GameState, pool: ResourceAmounts, dt: number, support?: AsrielSupport) {
  const outputMultiplier = calculateAutomaticCraftingMultipliers(state);
  const inputs: Partial<Record<`craft:${CraftId}`, number>> = {};
  const outputs: Partial<Record<`craft:${CraftId}`, number>> = {};
  const allocation = support || calculateSupportPreview(state).asriel;
  let availableWorkers = Math.min(state.workers.foundry, (state.buildings.foundry || 0) + (allocation.allocations.planetaryFoundry || 0) + 2 * (state.buildings.stellarForge || 0));
  for (const id of Object.keys(CRAFT_RECIPES) as CraftId[]) {
    const recipe = CRAFT_RECIPES[id], count = Math.min(state.craftWorkers[id] || 0, availableWorkers);
    availableWorkers -= count;
    if (!count || !isResourceUnlocked(id, state)) continue;
    // 工匠大师 doubles the artisan's throughput, so output and ingredients scale together.
    let amount = count * artisanCraftRate(recipe.rate, state) * dt;
    const ingredients = Object.entries(recipe.input) as [ResourceId, number][];
    for (const [resource, value] of ingredients) amount = Math.min(amount, pool[resource] / value);
    amount = Math.max(0, amount);
    for (const [resource, value] of ingredients) pool[resource] -= value * amount;
    const output = amount * calculateCraftingMultiplier(id, state, support) * outputMultiplier;
    pool[id] += output;
    inputs[`craft:${id}`] = amount / dt;
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
