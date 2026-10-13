import { shallowRef } from 'vue';
import { createRuntime } from './runtime';
import type { Runtime } from './runtime';
import type { GameState } from '../types/state';

/**
 * The simulation owns plain mutable state; Vue only observes a version counter.
 * Every mutation must go through `mutate` so the view re-renders exactly once per action.
 */
export interface GameStore {
  readonly runtime: Runtime;
  readonly state: () => GameState;
  readonly revision: () => number;
  mutate: <T>(action: (state: GameState) => T) => T;
  refresh: () => void;
}

export function createGameStore(): GameStore {
  const runtime = createRuntime();
  const revision = shallowRef(0);
  return {
    runtime,
    state: () => runtime.state,
    revision: () => revision.value,
    mutate<T>(action: (state: GameState) => T): T {
      try {
        return action(runtime.state);
      } finally {
        // Even an action that throws may already have changed the plain state.
        revision.value++;
      }
    },
    refresh(): void {
      revision.value++;
    },
  };
}
