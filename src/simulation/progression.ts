import { updateStageThreeProgress } from './stage-three';
import { updateStoryProgress } from './story';
import { syncPrestigeUnlocks } from './prestige-unlocks';
import { RESOURCES } from '../data/resources';
import { LOG_TYPES } from '../data/progression';
import { updateAchievementTracking } from './achievement-tracking';
import { meetsResourceUnlock, isResourceUnlocked } from './unlocks';
import type { ResourceId } from '../types/economy';
import type { AchievementId, GameState, LogType } from '../types/state';

/** Newest-first capped log; the caller owns every notification decision. */
export function addLog(state: GameState, text: string, type: string = 'progress'): void {
  const safe = (LOG_TYPES as readonly string[]).includes(type) ? type as LogType : 'progress';
  state.logs.unshift({ time: state.time, text, type: safe });
  state.logs = state.logs.slice(0, 80);
}

/** Apply sticky unlocks and return new achievements for caller-owned notifications. */
export function updateProgression(state: GameState): AchievementId[] {
  for (const id of Object.keys(RESOURCES) as ResourceId[]) {
    if (meetsResourceUnlock(id, state) && !state.unlockedResources.includes(id)) state.unlockedResources.push(id);
  }
  syncPrestigeUnlocks(state);
  updateStageThreeProgress(state);
  updateStoryProgress(state);
  if (isResourceUnlocked('fur', state)) state.furUnlocked = true;
  return updateAchievementTracking(state);
}
