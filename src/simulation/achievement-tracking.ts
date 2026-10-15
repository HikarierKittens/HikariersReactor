import { ACHIEVEMENTS } from '../data/progression';
import type { AchievementTracking, GameState, SnapshotAchievementId } from '../types/state';

export const SNAPSHOT_ACHIEVEMENT_IDS: readonly SnapshotAchievementId[] = [
  'artificialCelestial', 'swarmEclipse', 'worldExecution', 'overclockPrince',
];

/** Fresh runs can earn their first false -> true transition. */
export function createAchievementTracking(): AchievementTracking {
  return { artificialCelestial: false, swarmEclipse: false, worldExecution: false, overclockPrince: false };
}

/** Baseline legacy saves at their current conditions, never at historical progress. */
export function snapshotAchievementConditions(state: GameState): AchievementTracking {
  return Object.fromEntries(SNAPSHOT_ACHIEVEMENT_IDS.map(id => [id, ACHIEVEMENTS[id].test(state)])) as AchievementTracking;
}

/** Snapshot awards only; reset-event achievements must be granted by successful resets. */
export function updateAchievementTracking(state: GameState): SnapshotAchievementId[] {
  const current = snapshotAchievementConditions(state);
  const previous = state.achievementTracking;
  const unlocked: SnapshotAchievementId[] = [];
  for (const id of SNAPSHOT_ACHIEVEMENT_IDS) {
    if (previous?.[id] === false && current[id] && !state.achievements.includes(id)) {
      state.achievements.push(id);
      unlocked.push(id);
    }
  }
  // Missing runtime tracking is treated like an imported legacy baseline too.
  state.achievementTracking = current;
  return unlocked;
}
