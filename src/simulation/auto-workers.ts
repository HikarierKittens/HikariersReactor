import { BUILDINGS } from '../data/buildings';
import { calculateWorkerCapacity } from './building-production';
import { countSparePopulation } from './ship-crew';
import type { BuildingId } from '../types/buildings';
import type { AutoWorkersState, GameState } from '../types/state';

/** Canonical worker jobs in UI order, excluding unlimited and output-only buildings. */
export const AUTO_WORKER_JOBS: readonly BuildingId[] = [
  'forage', 'cementWorkshop', 'mine', 'coalMine', 'theater',
  'school', 'lab', 'foundry', 'bank', 'asrielResidence',
];

export function createAutoWorkersState(): AutoWorkersState {
  return {
    enabled: false,
    priority: [...AUTO_WORKER_JOBS],
    jobs: Object.fromEntries(AUTO_WORKER_JOBS.map(id => [id, { enabled: false, limit: -1 }])),
  };
}

function isAutoWorkerJob(id: string): id is BuildingId {
  return AUTO_WORKER_JOBS.includes(id as BuildingId);
}

/** Configuration changes never remove workers or rebalance existing assignments. */
export function setAutoWorkersEnabled(state: GameState, enabled: boolean): boolean {
  if (typeof enabled !== 'boolean') return false;
  state.autoWorkers.enabled = enabled;
  return true;
}

export function setAutoWorkerEnabled(state: GameState, id: string, enabled: boolean): boolean {
  if (!isAutoWorkerJob(id) || typeof enabled !== 'boolean') return false;
  const job = state.autoWorkers.jobs[id] ?? { enabled: false, limit: -1 };
  state.autoWorkers.jobs[id] = { ...job, enabled };
  return true;
}

export function setAutoWorkerLimit(state: GameState, id: string, limit: number): boolean {
  if (!isAutoWorkerJob(id) || !Number.isSafeInteger(limit) || limit < -1) return false;
  const job = state.autoWorkers.jobs[id] ?? { enabled: false, limit: -1 };
  state.autoWorkers.jobs[id] = { ...job, limit };
  return true;
}

/** Move source immediately before target; unaffected jobs retain their relative order. */
export function moveAutoWorkerPriority(state: GameState, sourceId: string, targetId: string): boolean {
  if (!isAutoWorkerJob(sourceId) || !isAutoWorkerJob(targetId) || sourceId === targetId) return false;
  const priority = state.autoWorkers.priority;
  const source = priority.indexOf(sourceId), target = priority.indexOf(targetId);
  if (source < 0 || target < 0) return false;
  priority.splice(source, 1);
  priority.splice(priority.indexOf(targetId), 0, sourceId);
  return true;
}

/** Fill only idle civilian population, respecting physical slots and configured total limits. */
export function applyAutoWorkerAssignment(state: GameState): number {
  if (!state.autoWorkers.enabled) return 0;
  // Mining-ship crews are drawn from the same idle pool; automatic filling must
  // not starve them, so only the cats beyond the crew count are assignable.
  let idle = countSparePopulation(state);
  let assigned = 0;
  for (const id of state.autoWorkers.priority) {
    if (idle <= 0) break;
    if (!isAutoWorkerJob(id)) continue;
    const job = state.autoWorkers.jobs[id], building = BUILDINGS[id];
    if (!job?.enabled || building.unlimited
      || !(state.tech.includes(building.tech) || (id === 'theater' && state.tech.includes(BUILDINGS.catCafe.tech)))) continue;
    if (!Number.isSafeInteger(job.limit) || job.limit < -1) continue;
    const capacity = calculateWorkerCapacity(id, state);
    if (!Number.isFinite(capacity)) continue;
    const target = job.limit === -1 ? capacity : Math.min(capacity, job.limit);
    const amount = Math.min(idle, Math.max(0, target - state.workers[id]));
    state.workers[id] += amount;
    idle -= amount;
    assigned += amount;
  }
  return assigned;
}
