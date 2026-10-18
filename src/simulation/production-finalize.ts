import { calculateTaxBase, calculateBankerMultiplier, calculateGovernmentMultiplier, calculateFurMultiplier } from './government';
import { calculateProductionMultiplier } from './multipliers';
import { calculateGlobalOutputMultiplier } from './crafting';
import { calculateFoodPerCat } from './population';
import { calculateStorageDetails, calculateStorageTotals } from './storage';
import type { StorageSnapshot } from './storage';
import type { GameState } from '../types/state';
import type { ResourceAmounts, ResourceId } from '../types/economy';

export function settlePopulationIncome(state: GameState, pool: ResourceAmounts, happiness: number, dt: number) {
  const catTax = calculateTaxBase(state) * calculateBankerMultiplier(state) * calculateGovernmentMultiplier('cash', state)
    * calculateProductionMultiplier('cash', happiness, state) * calculateGlobalOutputMultiplier('cash', state);
  const soldierFur = state.soldiers * .2 * calculateFurMultiplier(state) * calculateProductionMultiplier('fur', happiness, state) * calculateGlobalOutputMultiplier('fur', state);
  pool.cash += catTax * dt;
  pool.fur += soldierFur * dt;
  return { catTax, soldierFur };
}
/** Net food reports full demand even when the actual pool reaches zero. */
export function finalizeProduction(state: GameState, pool: ResourceAmounts, before: ResourceAmounts, dt: number, snapshot: StorageSnapshot) {
  const foodBefore = pool.food, foodDemand = state.population * calculateFoodPerCat(state);
  pool.food = Math.max(0, pool.food - foodDemand * dt);
  const rates = Object.fromEntries((Object.keys(pool) as ResourceId[]).map(id => [id, (pool[id] - before[id]) / dt])) as ResourceAmounts;
  rates.food = (foodBefore - before.food) / dt - foodDemand;
  // Energy reports unused fixed power, not a stock delta. Never persist the
  // temporary power * dt pool, including when an old save contains energy.
  rates.energy = Math.max(0, pool.energy / dt);
  const capped = { ...pool, energy: 0 };
  const caps = calculateStorageTotals(state, snapshot);
  for (const id of Object.keys(capped) as ResourceId[]) capped[id] = Math.min(capped[id], caps[id]);
  return { pool: capped, rates, starving: foodBefore + 1e-8 < foodDemand * dt };
}
