import { BUILDINGS } from '../data/buildings';
import { countRunningBuildings } from '../simulation/housing';
import type { BuildingId } from '../types/buildings';
import type { GameState } from '../types/state';

/** Partial legacy order is valid; the power grid appends missing enabled units deterministically. */
export function validatePowerActivationOrder(raw: Record<string, unknown>, state: GameState): void {
  const value = raw.powerActivationOrder;
  if (!Array.isArray(value)) throw Error('供电开启顺序无效。');
  const totals = new Map<BuildingId, number>();
  state.powerActivationOrder = value.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || Object.keys(entry).length !== 2 || !Object.hasOwn(entry, 'id') || !Object.hasOwn(entry, 'count')
      || typeof entry.id !== 'string' || !Object.hasOwn(BUILDINGS, entry.id)
      || !Number.isSafeInteger(entry.count) || entry.count <= 0) throw Error('供电开启顺序无效。');
    const id = entry.id as BuildingId;
    const total = (totals.get(id) || 0) + entry.count;
    if (!Number.isSafeInteger(total) || total > countRunningBuildings(id, state)) throw Error('供电开启顺序数量无效。');
    totals.set(id, total);
    return { id, count: entry.count as number };
  });
}
