import { GOVERNMENTS, reformCooldown } from './government';
import { isChallengeGeneActive } from './challenges';
import { calculateMaxCraftable, calculateCraftingMultiplier } from './crafting';
import { BUILDINGS } from '../data/buildings';
import { calculateWorkerCapacity, countUsedWorkers } from './building-production';
import { trimAssignedCraftWorkers } from './crafting';
import type { BuildingId } from '../types/buildings';
import { CRAFT_RECIPES } from '../data/resources';
import { isResourceUnlocked } from './unlocks';
import type { GameState, GovernmentId } from '../types/state';
import type { CraftId, ResourceId, FactoryLineId } from '../types/economy';
import { calculateSmelterSlotCapacity, countFreeFactoryLines } from './factory';
import { isFactoryLineUnlocked } from './factory-settlement';

import { calculateContainerRecipe, calculateContainerCapacity, countAssignedContainers, isContainerAssignable, calculateAlloyContainerCapacity, countAssignedAlloyContainers, ALLOY_CONTAINER_RECIPE } from './containers';
import { payResourceCost } from './costs';
import { abandonOccupation, executeRaid } from './neighbors';
import { buildRaidEconomy } from './neighbor-economy';
import { SPACE_MISSIONS, completeRegionalMissionNow } from './space-missions';

export function createContainers(state: GameState, count: number): number {
  const recipe = calculateContainerRecipe(state);
  if (!Number.isSafeInteger(count) || count < 1 || !Object.keys(recipe).every(id => isResourceUnlocked(id, state))) return 0;
  const ingredients = Object.entries(recipe) as [ResourceId, number][];
  const amount = Math.min(count, calculateContainerCapacity(state) - state.containers, ...ingredients.map(([id, value]) => Math.floor((state.resources[id] + 1e-8) / value)));
  if (amount <= 0 || !payResourceCost(state.resources, Object.fromEntries(ingredients.map(([id, value]) => [id, value * amount])))) return 0;
  state.containers += amount;
  return amount;
}
/** The caller must clamp resources after capacity decreases. */
export function changeContainerAssignment(state: GameState, id: string, delta: number): number {
  if (!isContainerAssignable(id, state) || !Number.isSafeInteger(delta) || !delta) return 0;
  const resource = id as ResourceId;
  const amount = delta > 0 ? Math.min(delta, state.containers - countAssignedContainers(state)) : -Math.min(-delta, state.containerAssignments[resource]);
  if (amount) state.containerAssignments[resource] += amount;
  return amount;
}

export function createAlloyContainers(state: GameState, count: number): number {
  if (!state.tech.includes('superContainers') || !Number.isSafeInteger(count) || count < 1 || !isResourceUnlocked('alloy', state)) return 0;
  const price = ALLOY_CONTAINER_RECIPE.alloy!;
  const amount = Math.min(count, calculateAlloyContainerCapacity(state) - state.alloyContainers, Math.floor((state.resources.alloy + 1e-8) / price));
  if (amount <= 0 || !payResourceCost(state.resources, { alloy: price * amount })) return 0;
  state.alloyContainers += amount;
  return amount;
}
/** The caller must clamp resources after capacity decreases, exactly as for ordinary containers. */
export function changeAlloyContainerAssignment(state: GameState, id: string, delta: number): number {
  if (!state.tech.includes('superContainers') || !isContainerAssignable(id, state) || !Number.isSafeInteger(delta) || !delta) return 0;
  const resource = id as ResourceId;
  const amount = delta > 0 ? Math.min(delta, state.alloyContainers - countAssignedAlloyContainers(state)) : -Math.min(-delta, state.alloyContainerAssignments[resource]);
  if (amount) state.alloyContainerAssignments[resource] += amount;
  return amount;
}

/**
 * Assign or withdraw factory lines.
 *
 * Growing a line needs free capacity, but any shortfall is drawn out of the 合金生产线
 * instead (beta 0.9.28): alloy is the default sink for new factories, so it doubles as
 * the pool the player converts away from. Alloy never borrows from itself.
 */
export function changeFactoryAssignment(state: GameState, id: string, delta: number): number {
  if (!Number.isSafeInteger(delta) || !delta || !Object.hasOwn(state.lines, id) || (delta > 0 && !isFactoryLineUnlocked(id, state))) return 0;
  const line = id as FactoryLineId;
  // 合金 is the source, never the recipient, of an internal transfer.
  const available = delta > 0 ? countFreeFactoryLines(state) + (line === 'alloy' ? 0 : state.lines.alloy) : state.lines[line];
  const amount = delta > 0 ? Math.min(delta, available) : -Math.min(-delta, available);
  if (amount) {
    const borrowed = Math.max(0, amount - countFreeFactoryLines(state));
    if (borrowed) state.lines.alloy -= borrowed;
    state.lines[line] += amount;
  }
  return amount;
}
/** Move 冶炼厂工位 between 钢冶炼 (delta > 0) and idle (delta < 0). */
export function changeSmelterAssignment(state: GameState, delta: number): number {
  if (!Number.isSafeInteger(delta) || !delta) return 0;
  const capacity = calculateSmelterSlotCapacity(state);
  const idle = Math.min(state.smelterIdle || 0, capacity);
  const amount = delta > 0 ? Math.min(delta, idle) : -Math.min(-delta, capacity - idle);
  state.smelterIdle = idle - amount;
  return amount;
}
export function completeAsrielMission(state: GameState): boolean {
  return completeRegionalMissionNow(state, 'asriel');
}

export function completeKerberosMission(state: GameState): boolean {
  return completeRegionalMissionNow(state, 'kerberos');
}

/** Backward-compatible immediate-only command; queued clicks use requestPurchaseModule. */
export function completeSpaceMission(state: GameState, id: string): boolean {
  return Object.hasOwn(SPACE_MISSIONS, id) && completeRegionalMissionNow(state, id);
}

export function changeWorkerAssignment(state: GameState, id: string, delta: number): number {
  if (!Object.hasOwn(BUILDINGS, id)) return 0;
  const key = (id === 'catCafe' ? 'theater' : id === 'planetaryFoundry' ? 'foundry' : id) as BuildingId, building = BUILDINGS[key];
  const jobUnlocked = state.tech.includes(building.tech) || (key === 'theater' && state.tech.includes(BUILDINGS.catCafe.tech));
  if ((!building.output && !building.workerOutput && !building.artistSlots && !building.craftSlots)
    || !jobUnlocked || !Number.isSafeInteger(delta) || !delta) return 0;
  const amount = delta > 0 ? Math.min(delta, Math.max(0, state.population - countUsedWorkers(state)), Math.max(0, calculateWorkerCapacity(key, state) - state.workers[key]))
    : -Math.min(-delta, state.workers[key]);
  if (!amount) return 0;
  state.workers[key] += amount;
  if (building.craftSlots) trimAssignedCraftWorkers(state);
  return amount;
}

/** Commands mutate only state; callers own persistence, logs and notifications. */
export function changeTaxRate(state: GameState, value: number): boolean {
  if (!Number.isFinite(value) || value < 0 || value > 30) return false;
  state.taxRate = value;
  return true;
}
export function changeGovernment(state: GameState, id: string): boolean {
  if (!Object.hasOwn(GOVERNMENTS, id)) return false;
  const government = id as GovernmentId;
  if (!state.tech.includes(GOVERNMENTS[government].tech) || state.government === government || reformCooldown(state) > 0) return false;
  state.government = government;
  state.lastReformTime = state.time;
  return true;
}
/** Sends soldiers on a raid; returns false when the action was rejected. */
export function raidNeighbor(state: GameState, id: string, tier: number, soldiers: number): boolean {
  // Loot is derived from the player's own output, so this boundary resolves it once
  // rather than letting the pure raid logic reach back into production.
  return executeRaid(state, id, tier, soldiers, Math.random, buildRaidEconomy(state)).ok;
}
/** Withdraws the garrison from an occupied city. */
export function withdrawFromNeighbor(state: GameState, id: string): boolean {
  return abandonOccupation(state, id);
}
export function craftManually(state: GameState, id: string, count: number | 'max'): number {
  if (isChallengeGeneActive(state, 'industrialFracture') || !Object.hasOwn(CRAFT_RECIPES, id) || !isResourceUnlocked(id, state)) return 0;
  if (count !== 'max' && (!Number.isSafeInteger(count) || count <= 0)) return 0;
  const craft = id as CraftId, maximum = calculateMaxCraftable(craft, state);
  const amount = count === 'max' ? maximum : Math.min(count, maximum);
  if (!amount) return 0;
  for (const [resource, value] of Object.entries(CRAFT_RECIPES[craft].input) as [ResourceId, number][]) state.resources[resource] -= value * amount;
  state.resources[craft] += amount * calculateCraftingMultiplier(craft, state);
  return amount;
}
