import { SHIP_COMPONENTS, calculateShipComponentProgress, isShipComponentId } from '../simulation/spaceship';
import type { GameState, ShipComponentId, ShipResourceProgress } from '../types/state';

function shipRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${label}无效。`);
  return value as Record<string, unknown>;
}
/** Old saves omit these fields. Explicit malformed or contradictory paid/completed records are rejected. */
export function validateSaveSpaceship(raw: Record<string, unknown>, state: GameState): void {
  state.shipResourceProgress = {};
  state.shipComponents = { hull: false, energyCore: false, computer: false, ecosystem: false, electromagneticEngine: false, fuel: false };
  if (raw.shipResourceProgress !== undefined) {
    const projects = shipRecord(raw.shipResourceProgress, '飞船投资进度');
    for (const [id, value] of Object.entries(projects)) {
      if (!isShipComponentId(id)) throw Error('飞船组件无效。');
      const values = shipRecord(value, '飞船资源进度');
      const progress: ShipResourceProgress = {};
      for (const [resource, percent] of Object.entries(values)) {
        const definition = SHIP_COMPONENTS[id];
        if (!(Object.hasOwn(definition.cost, resource) || (resource === 'population' && definition.population))) throw Error('飞船资源无效。');
        if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) throw Error('飞船资源进度无效。');
        if (resource === 'population' && !Number.isInteger(percent / 10)) throw Error('飞船猫口进度无效。');
        (progress as Record<string, number>)[resource] = percent;
      }
      state.shipResourceProgress[id] = progress;
    }
  }
  const completed = raw.shipComponents === undefined ? {} : shipRecord(raw.shipComponents, '飞船完成状态');
  for (const [id, value] of Object.entries(completed)) {
    if (!isShipComponentId(id) || typeof value !== 'boolean') throw Error('飞船完成状态无效。');
  }
  for (const id of Object.keys(SHIP_COMPONENTS) as ShipComponentId[]) {
    const derived = calculateShipComponentProgress(id, state) === 100;
    if (Object.hasOwn(completed, id) && completed[id] !== derived) throw Error('飞船完成状态与投资进度不一致。');
    state.shipComponents[id] = derived;
  }
  if (!state.shipComponents.hull) {
    for (const [id, progress] of Object.entries(state.shipResourceProgress)) {
      if (id !== 'hull' && Object.values(progress).some(percent => percent > 0)) throw Error('船体完成前不能投资其他飞船组件。');
    }
  }
}
