import type { GameState } from '../types/state';

export interface SaveWriter { setItem(key: string, value: string): void }
/** Failure is reported without overwriting or resetting the in-memory game. */
export function persistGame(state: GameState, storage: SaveWriter, key: string, now: number): boolean {
  state.lastSaved = now;
  try {
    storage.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
