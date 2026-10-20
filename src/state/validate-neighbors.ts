import { NEIGHBOR_IDS, type NeighborId } from '../data/neighbors';
import { validateSaveNumber } from './validation';
import type { GameState } from '../types/state';

/**
 * Strict 临近势力 boundary.
 *
 * Values are ranges rather than exact spawn rolls because they grow over time; the
 * upper bound is the growth cap. An occupied id must exist and appear once, so a
 * hand-edited save cannot inflate the output multiplier.
 */
export function validateNeighbors(raw: Record<string, unknown>, state: GameState): void {
  const source = raw.neighbors;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw Error('临近势力数据无效。');
  const record = source as Record<string, unknown>;
  if (Object.keys(record).some(key => !['values', 'occupied', 'lastActionTime'].includes(key))) throw Error('临近势力数据无效。');

  const values = record.values;
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw Error('临近势力数据无效。');
  const valueRecord = values as Record<string, unknown>;
  if (Object.keys(valueRecord).some(key => !(NEIGHBOR_IDS as readonly string[]).includes(key))) throw Error('临近势力数据无效。');
  if ((NEIGHBOR_IDS as readonly string[]).some(id => !Object.hasOwn(valueRecord, id))) throw Error('临近势力数据无效。');

  for (const id of NEIGHBOR_IDS) {
    const entry = valueRecord[id];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw Error('临近势力数据无效。');
    const fields = entry as Record<string, unknown>;
    if (Object.keys(fields).some(key => !['military', 'economy', 'opinion'].includes(key))) throw Error('临近势力数据无效。');
    // Growth is capped at twice the spawn maximum; allow a little slack for float error.
    state.neighbors.values[id] = {
      military: validateSaveNumber(fields.military, 0, 200.001, '势力军事实力'),
      economy: validateSaveNumber(fields.economy, 0, 200.001, '势力经济实力'),
      opinion: validateSaveNumber(fields.opinion, 0, 100, '势力好感度'),
    };
  }

  const occupied = record.occupied;
  if (!Array.isArray(occupied)) throw Error('临近势力数据无效。');
  const seen = new Set<string>();
  for (const id of occupied) {
    if (typeof id !== 'string' || !(NEIGHBOR_IDS as readonly string[]).includes(id)) throw Error('临近势力数据无效。');
    if (seen.has(id)) throw Error('临近势力数据无效。');
    seen.add(id);
  }
  state.neighbors.occupied = occupied as NeighborId[];

  state.neighbors.lastActionTime = record.lastActionTime === null || record.lastActionTime === undefined
    ? null
    : validateSaveNumber(record.lastActionTime, 0, Number.MAX_SAFE_INTEGER, '临近势力行动时间');
}
