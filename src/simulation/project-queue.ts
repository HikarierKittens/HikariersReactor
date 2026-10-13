import { settlePurchaseQueue } from './purchases';
import { calculateSupportPreview } from './support-preview';
import { addLog } from './progression';
import { ARPA_PROJECTS } from '../data/projects';
import { normalizeProjectProgress, isProjectUnlocked, isProjectAtLimit, investInProject } from './projects';
import type { ArpaProjectId, GameState } from '../types/state';
import { buildingQueueCapacity, buildingQueueUsage, isQueueSettingEnabled } from './queue-settings';

export function enqueueProject(state: GameState, id: string, count = 1): number {
  if (!isProjectUnlocked(id, state) || !Number.isSafeInteger(count) || count <= 0) return 0;
  normalizeProjectProgress(state);
  const project = id as ArpaProjectId;
  if (isProjectAtLimit(id, state) || (!ARPA_PROJECTS[project].repeatable && state.queue.some(q => q.kind === 'arpa' && q.id === id))) return 0;
  const pending = state.queue.filter(q => q.kind === 'arpa' && q.id === id).length;
  const amount = Math.min(count, ARPA_PROJECTS[project].repeatable ? Math.max(0, Number.MAX_SAFE_INTEGER - state.arpaBuildings[project] - pending) : 1, Math.max(0, buildingQueueCapacity(state) - buildingQueueUsage(state.queue)));
  let uid = Math.max(0, ...state.queue.map(q => q.uid));
  for (let i = 0; i < amount; i++) state.queue.push({ uid: ++uid, kind: 'arpa', id: project });
  return amount;
}
export function advanceProjectQueue(state: GameState, dt: number, random: () => number): { completed: number; dirty: boolean } {
  const result = { completed: 0, dirty: false };
  normalizeProjectProgress(state);
  if (!Number.isFinite(dt) || dt < 0) return result;
  state.arpaQueueElapsed += dt;
  if (state.arpaQueueElapsed < 1) return result;
  state.arpaQueueElapsed %= 1;
  const ships = settlePurchaseQueue(state, () => calculateSupportPreview(state).moon.available, true, true);
  result.dirty ||= ships.dirty;
  result.completed += ships.entries.filter(entry => entry.kind === 'ship' && entry.completed).length;
  if (!Object.keys(ARPA_PROJECTS).some(id => isProjectUnlocked(id, state))) return result;
  for (let attempts = 0; attempts < 100; attempts++) {
    const index = state.queue.findIndex(q => q.kind === 'arpa');
    if (index < 0) break;
    if (!isQueueSettingEnabled(state, 'unorderedBuildingQueue')
      && state.queue.slice(0, index).some(q => q.kind === 'mission' || q.kind === 'ship')) break;
    const entry = state.queue[index];
    if (!entry || entry.kind !== 'arpa' || !Object.hasOwn(ARPA_PROJECTS, entry.id)) break;
    const before = state.arpaBuildings[entry.id];
    if (isProjectAtLimit(entry.id, state)) { state.queue.splice(index, 1); result.dirty = true; continue; }
    if (!investInProject(entry.id, state, 100, random, 1)) break;
    result.dirty = true;
    if (state.arpaBuildings[entry.id] === before) break;
    state.queue.splice(index, 1); result.completed++;
    addLog(state, `队列中 ${ARPA_PROJECTS[entry.id].name} 已完成`, 'event');
  }
  return result;
}
