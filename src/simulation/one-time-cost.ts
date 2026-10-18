import type { ResourceRecipe } from '../types/economy';

/** Power is fixed supply, never a stockpile used to fund a one-time purchase.
 * Do not apply this to operational input/output recipes or per-second fuel. */
export function withoutPowerCost(cost: ResourceRecipe): ResourceRecipe {
  return Object.fromEntries(Object.entries(cost).filter(([id]) => id !== 'energy'));
}
