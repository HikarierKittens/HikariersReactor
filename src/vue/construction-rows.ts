import { BUILDINGS } from '../data/buildings';
import { isConstructionBlocked } from '../simulation/purchases';
import type { BuildingId } from '../types/buildings';
import type { GameState } from '../types/state';

/**
 * Construction phases of every segmented project, keyed by the completed building they become.
 * Both building panels render the phase immediately before its completed form.
 */
const SEGMENT_PHASES: Partial<Record<BuildingId, BuildingId[]>> = (() => {
  const map: Partial<Record<BuildingId, BuildingId[]>> = {};
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    const into = BUILDINGS[id].completesInto;
    if (into) (map[into] ||= []).push(id);
  }
  return map;
})();

/**
 * Segmented projects are one-off (beta 0.9.10): a finished project retires its construction phase,
 * so the row disappears instead of offering segments that could never be used. An unfinished
 * project keeps exactly one phase row, directly before its completed form.
 *
 * beta 0.9.26: the completed form is **hidden until the project is finished**. Both records
 * share one display name by design (`tests/segmented-naming.test.ts` forbids a suffix), and
 * while the project is untouched both rows also show `0`, so the player reported seeing
 * 「两个戴森球」. A row that can only be looked at — never bought, never toggled — carries no
 * information before completion, so it is dropped until the phase row retires itself.
 */
export function withConstructionPhases(list: BuildingId[], state: Pick<GameState, 'buildings'>): BuildingId[] {
  return list.flatMap(id => {
    const phases = (SEGMENT_PHASES[id] || []).filter(phase => !isConstructionBlocked(state, phase));
    // While a construction phase is still purchasable, it is the only row for this project:
    // the completed form cannot be bought or toggled yet, so showing it would just repeat
    // the same name with the same `0` count.
    if (phases.length) return phases;
    // No phase left: either the project is finished (show the completed form) or it was
    // never segmented at all (the `id` is a plain building and belongs in the list).
    return [id];
  });
}
