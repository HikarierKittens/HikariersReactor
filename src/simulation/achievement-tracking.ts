import { ACHIEVEMENTS, ACHIEVEMENT_MASTERY_PER_GRADE } from '../data/progression';
import type { AchievementId, AchievementTracking, GameState, SnapshotAchievementId } from '../types/state';

/** Missing grades on an earned achievement are the base grade, not a backfill. */
export function getAchievementLevel(state: Partial<Pick<GameState, 'achievements' | 'achievementLevels'>>,  id: AchievementId): number | undefined {
  return state.achievements?.includes(id) ? state.achievementLevels?.[id] ?? 0 : undefined;
}

/** Each achievement contributes only its best grade: .25%, .5%, .75%, or 1%. */
export function getAchievementMasteryBonus(state: Partial<Pick<GameState, 'achievements' | 'achievementLevels'>>): number {
  return [...new Set(state.achievements ?? [])].reduce((sum, id) => sum + ((getAchievementLevel(state, id) ?? 0) + 1) * ACHIEVEMENT_MASTERY_PER_GRADE, 0);
}

/** Only challenge genes actually active in this run determine its achievement grade. */
export function getCurrentAchievementLevel(state: GameState): number {
  return Math.min(3, state.challenge.genes.length);
}

/** Caller must establish a real completion; returns true only for a new/better award. */
export function awardAchievement(state: GameState, id: AchievementId, level = getCurrentAchievementLevel(state)): boolean {
  const previous = getAchievementLevel(state, id);
  if (previous !== undefined && previous >= level) return false;
  if (previous === undefined) state.achievements.push(id);
  state.achievementLevels = { ...state.achievementLevels, [id]: level };
  return true;
}

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
    if (previous?.[id] === false && current[id] && awardAchievement(state, id)) {
      unlocked.push(id);
    }
  }
  // Missing runtime tracking is treated like an imported legacy baseline too.
  state.achievementTracking = current;
  return unlocked;
}
