import { calculateProduction } from '../simulation/production';
import { calculateSupportPreview } from '../simulation/support-preview';
import type { GameState } from '../types/state';
import type { DeepReadonly } from '../shared/readonly';

/** UI-only snapshots. Never use these results to authorize or execute a command.
 * Callers treat returned snapshots as read-only; production/support own separate pools.
 * State identity, explicit view revision and dt are all part of the cache key.
 */
export function createUiPreviewCache(calculators = {
  production: calculateProduction,
  support: calculateSupportPreview,
}) {
  type Entry = { production?: ReturnType<typeof calculateProduction>; support?: ReturnType<typeof calculateSupportPreview> };
  const states = new WeakMap<GameState, { revision: number; steps: Map<number, Entry> }>();
  function entry(state: GameState, revision: number, dt: number): Entry {
    if (!Number.isFinite(dt) || dt <= 0) throw new RangeError('dt must be positive and finite');
    let version = states.get(state);
    if (!version || version.revision !== revision) {
      version = { revision, steps: new Map() };
      states.set(state, version);
    }
    let result = version.steps.get(dt);
    if (!result) {
      // Bound unusual callers using many preview horizons in one view revision.
      const oldest = version.steps.keys().next();
      if (version.steps.size >= 4 && !oldest.done) version.steps.delete(oldest.value);
      result = {};
      version.steps.set(dt, result);
    }
    return result;
  }
  return {
    production(state: GameState, revision: number, dt = 1): DeepReadonly<ReturnType<typeof calculateProduction>> {
      const snapshot = entry(state, revision, dt);
      return snapshot.production ??= calculators.production(state, dt);
    },
    support(state: GameState, revision: number, dt = 1): DeepReadonly<ReturnType<typeof calculateSupportPreview>> {
      const snapshot = entry(state, revision, dt);
      return snapshot.support ??= calculators.support(state, dt);
    },
  };
}
export const uiPreview = createUiPreviewCache();
