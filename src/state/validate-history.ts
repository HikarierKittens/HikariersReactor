import { CONFIG } from '../data/config';
import { LOG_TYPES } from '../data/progression';
import { validateSaveNumber } from './validation';
import type { GameState, LogType } from '../types/state';

export function validateHistory(raw: Record<string, unknown>, state: GameState): void {
  state.starvation = validateSaveNumber(raw.starvation, 0, 65, '饥饿');
  state.eventIn = validateSaveNumber(raw.eventIn, 0, CONFIG.eventMax, '事件');
  state.clicks = validateSaveNumber(raw.clicks, 0, 1e15, '点击次数');
  if (!Array.isArray(raw.effects) || raw.effects.length > 2) throw Error('事件效果无效。');
  for (const entry of raw.effects as unknown[]) {
    if (!entry || typeof entry !== 'object' || (entry as Record<string, unknown>).id !== 'mice') throw Error('事件效果无效。');
    validateSaveNumber((entry as Record<string, unknown>).left, 0, 45, '效果时长');
  }
  // Legacy mice effects are checked but intentionally not restored.
  state.effects = [];
  // Logs are non-authoritative display history: discard malformed rows instead
  // of rejecting otherwise valid progress, and sanitize unknown types below.
  state.logs = [];
  if (!Array.isArray(raw.logs)) return;
  for (const entry of raw.logs.slice(0, 80) as unknown[]) {
    if (!entry || typeof entry !== 'object') continue;
    const log = entry as Record<string, unknown>;
    if (typeof log.text !== 'string' || typeof log.time !== 'number' || !Number.isFinite(log.time)) continue;
    state.logs.push({ time: log.time, text: log.text.slice(0, 300), type: log.type === 'event' && /^队列中 .+ 已完成$/.test(log.text) ? 'queue' : LOG_TYPES.includes(log.type as LogType) ? log.type as LogType : 'progress' });
  }
}
