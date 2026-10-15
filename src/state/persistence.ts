import type { GameState } from '../types/state';

export interface SaveWriter { setItem(key: string, value: string): void }
/** Failure is reported without overwriting or resetting the in-memory game. */
export function persistGame(state: GameState, storage: SaveWriter, key: string, now: number): boolean {
  const previousSaved = state.lastSaved;
  state.lastSaved = now;
  try {
    storage.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    state.lastSaved = previousSaved;
    return false;
  }
}
