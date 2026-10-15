import type { GameStore } from './store';
import { RESOURCES } from '../data/resources';
import type { ResourceId } from '../types/economy';
import { isResourceUnlocked } from '../simulation/unlocks';
import { calculateSupportPreview } from '../simulation/support-preview';
import { calculateStorageTotals } from '../simulation/storage';

/** One-shot developer action; uses the same funded capacities as the resource UI. */
export function fillUnlockedResources(store: GameStore): { filled: ResourceId[]; skipped: ResourceId[] } {
  const filled: ResourceId[] = [], skipped: ResourceId[] = [];
  store.mutate(state => {
    const support = calculateSupportPreview(state);
    const caps = calculateStorageTotals(state, { ...support, moonBaseUnits: support.moon.baseUnits });
    for (const id of Object.keys(RESOURCES) as ResourceId[]) {
      if (!isResourceUnlocked(id, state)) continue;
      const cap = caps[id];
      if (!Number.isFinite(cap) || cap <= 0) { skipped.push(id); continue; }
      state.resources[id] = cap;
      filled.push(id);
    }
  });
  return { filled, skipped };
}

declare global {
  interface Window { fillUnlockedResources?: () => ReturnType<typeof fillUnlockedResources>; }
}

export function installDebugConsole(store: GameStore): () => void {
  const command = () => fillUnlockedResources(store);
  window.fillUnlockedResources = command;
  return () => { if (window.fillUnlockedResources === command) delete window.fillUnlockedResources; };
}
