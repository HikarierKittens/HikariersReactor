import { CONFIG } from '../data/config';
import type { GameState } from '../types/state';
import type { BuildingId } from '../types/buildings';
import { trimAssignedCraftWorkers } from './crafting';
import { addLog } from './progression';
import { recordStarvation } from './statistics';

/** Jobs share civilian population; the existing independent army is left untouched. */
export function reconcilePopulationAssignments(state: GameState): void {
  let spare = state.population;
  for (const id of Object.keys(state.workers) as BuildingId[]) {
    state.workers[id] = Math.min(state.workers[id], spare);
    spare -= state.workers[id];
  }
  trimAssignedCraftWorkers(state);
}

/** Count only the part of this step spent without food, never time spent eating reserves. */
export function advanceStarvation(state: GameState, dt: number, foodRate: number, foodBefore = 0): void {
  if (state.resources.food > 0 || foodRate >= 0 || state.population <= 0) {
    state.starvationElapsed = 0;
    return;
  }
  if (foodBefore > 0) state.starvationElapsed = 0;
  const hungrySeconds = Math.max(0, dt - foodBefore / -foodRate);
  state.starvationElapsed += hungrySeconds;
  const deaths = Math.min(state.population, Math.floor((state.starvationElapsed + 1e-9) / 10));
  if (!deaths) return;
  state.starvationElapsed = Math.max(0, state.starvationElapsed - deaths * 10);
  state.population -= deaths;
  recordStarvation(state, deaths);
  reconcilePopulationAssignments(state);
  for (let i = 0; i < deaths; i++) addLog(state, '一只猫猫饿死了.....', 'event');
  if (state.population === 0) state.starvationElapsed = 0;
}

export function sampleGrowthTarget(state: Pick<GameState, 'population'>, random: () => number = Math.random): number {
  return state.population < 20
    ? CONFIG.growthFastMin + random() * (CONFIG.growthFastMax - CONFIG.growthFastMin)
    : CONFIG.growthMin + random() * (CONFIG.growthMax - CONFIG.growthMin);
}
export function averageGrowthTarget(state: Pick<GameState, 'population'>): number {
  return state.population < 20 ? (CONFIG.growthFastMin + CONFIG.growthFastMax) / 2 : (CONFIG.growthMin + CONFIG.growthMax) / 2;
}
export function calculateFoodPerCat(state: Pick<GameState, 'buildings'>): number {
  return CONFIG.foodPerCat * (state.buildings.communityCenter ? .9 : 1);
}
export function calculateGrowthMultiplier(state: Pick<GameState, 'tech' | 'buildings'> & Partial<Pick<GameState, 'crispr'>>): number {
  return (state.tech.includes('scientificBreeding') ? 1.25 : 1) * (state.crispr?.includes('coreReplication') ? 1.15 : 1)
    * (state.buildings.communityCenter ? 1.1 : 1);
}
/** Cats above the current housing capacity leave immediately; the independent army is untouched. */
export function enforcePopulationCapacity(state: GameState, capacity: number): number {
  const limit = Math.max(0, Math.floor(capacity + 1e-9));
  const lost = Math.max(0, state.population - limit);
  if (!lost) return 0;
  state.population -= lost;
  state.growth = 0;
  state.growthTarget = 0;
  reconcilePopulationAssignments(state);
  addLog(state, `猫口超出住房上限，${lost}只猫猫离开了文明。`, 'event');
  return lost;
}
/** Preserve one arrival per simulation step, even when the supplied step is large. */
export function advancePopulationGrowth(state: GameState, dt: number, foodRate: number, capacity: number, random: () => number = Math.random): void {
  if (foodRate >= -1e-8 && state.resources.food > 0 && state.population < capacity) {
    state.growth += dt * calculateGrowthMultiplier(state);
    if (!state.growthTarget) state.growthTarget = sampleGrowthTarget(state, random);
    if (state.growth >= state.growthTarget) {
      state.growth -= state.growthTarget;
      state.growthTarget = 0;
      state.population++;
    }
  } else {
    state.growth = 0;
    state.growthTarget = 0;
  }
}
