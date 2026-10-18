import { withoutPowerCost } from './one-time-cost';
import type { ResourceId, ResourceRecipe } from '../types/economy';

/** Paid fractions in percent, independent of current prices. */
export function resourceCompletionPercent(cost: ResourceRecipe, progress: ResourceRecipe): number {
  const entries = Object.entries(withoutPowerCost(cost)).filter(([, total]) => total > 0);
  return entries.length ? Math.min(...entries.map(([id]) => progress[id as ResourceId] || 0)) : 100;
}

export function calculateResourceRemainingCost(cost: ResourceRecipe, progress: ResourceRecipe): ResourceRecipe {
  return Object.fromEntries(Object.entries(withoutPowerCost(cost)).map(([id, total]) => [id, total * (100 - (progress[id as ResourceId] || 0)) / 100]));
}

/** Maximum percentage any one resource can contribute; other resources never gate it. */
export function affordableResourcePercent(cost: ResourceRecipe, stock: ResourceRecipe, progress: ResourceRecipe, requested = 100): number {
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  return Math.max(0, ...Object.entries(withoutPowerCost(cost)).map(([key, total]) => {
    const id = key as ResourceId;
    const available = stock[id] || 0;
    return total > 0 && Number.isFinite(available)
      ? Math.max(0, Math.min(requested, 100 - (progress[id] || 0), available / total * 100)) : 0;
  }));
}

/** Mutates stock and paid fractions, never crosses the current level or a requested per-resource cap. */
export function investResourceProgress(cost: ResourceRecipe, stock: ResourceRecipe, progress: ResourceRecipe, requested = 100, minimumPercent = 0): { investedPercent: number; spent: ResourceRecipe; complete: boolean } {
  const spent: ResourceRecipe = {};
  let investedPercent = 0;
  if (Number.isFinite(requested) && requested > 0) for (const [key, total] of Object.entries(withoutPowerCost(cost))) {
    const id = key as ResourceId;
    const available = stock[id] || 0;
    const paid = progress[id] || 0;
    if (!(total > 0) || !Number.isFinite(available) || available <= 0 || paid >= 100) continue;
    const remaining = total * (100 - paid) / 100;
    const amount = Math.min(available, total * Math.min(requested, 100) / 100, remaining);
    // Queued funding waits for at least 1% per resource; the final remainder
    // may be smaller, but must be affordable in full. Manual funding stays unrestricted.
    const minimum = Math.min(remaining, total * minimumPercent / 100);
    if (!(amount > 0) || amount + 1e-9 < minimum) continue;
    stock[id] = Math.max(0, available - amount);
    spent[id] = amount;
    const contribution = amount / total * 100;
    progress[id] = amount >= remaining ? 100 : Math.min(100, paid + contribution);
    investedPercent = Math.max(investedPercent, contribution);
  }
  return { investedPercent, spent, complete: resourceCompletionPercent(cost, progress) === 100 };
}
