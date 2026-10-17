import type { GameState, PrestigeResourceId } from '../types/state';

export const PRESTIGE_RESOURCE_IDS: readonly PrestigeResourceId[] = ['particles', 'casimir', 'darkEnergy', 'harmonyCrystals'];

/** Displayed once ever held: the sticky record, or a currently positive amount. */
export function isPrestigeResourceUnlocked(state: Pick<GameState, 'prestige'> & Partial<Pick<GameState, 'prestigeUnlocked'>>, id: PrestigeResourceId): boolean {
  return (state.prestigeUnlocked?.includes(id) ?? false) || (state.prestige[id] || 0) > 0;
}

/** Record every currently held prestige resource; never removes an entry. */
export function syncPrestigeUnlocks(state: Pick<GameState, 'prestige' | 'prestigeUnlocked'>): void {
  for (const id of PRESTIGE_RESOURCE_IDS) {
    if ((state.prestige[id] || 0) > 0 && !state.prestigeUnlocked.includes(id)) state.prestigeUnlocked.push(id);
  }
}
