import { STORY_CHAPTER_IDS } from '../simulation/story';
import type { GameState, StoryChapterId } from '../types/state';

export function validateStoryArchive(raw: Record<string, unknown>, state: GameState): void {
  {
    const value = raw.story;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('文明剧情档案无效。');
    const record = value as Record<string, unknown>;
    const validIds = (ids: unknown): ids is StoryChapterId[] => Array.isArray(ids)
      && ids.every(id => typeof id === 'string' && (STORY_CHAPTER_IDS as readonly string[]).includes(id))
      && new Set(ids).size === ids.length;
    if (!validIds(record.unlocked) || !validIds(record.read)) throw Error('文明剧情章节无效。');
    if (record.read.some(id => !(record.unlocked as StoryChapterId[]).includes(id))) throw Error('已读剧情尚未解锁。');
    state.story = { unlocked: [...record.unlocked], read: [...record.read] };
  }
}
