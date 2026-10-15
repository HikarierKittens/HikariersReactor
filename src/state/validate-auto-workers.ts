import { AUTO_WORKER_JOBS, createAutoWorkersState } from '../simulation/auto-workers';
import type { BuildingId } from '../types/buildings';
import type { GameState } from '../types/state';

function isAutoWorkersRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Absent old-save settings default off; incomplete known job lists extend safely. */
export function validateAutoWorkers(raw: Record<string, unknown>, state: GameState): void {
  const fresh = createAutoWorkersState();
  if (!Object.hasOwn(raw, 'autoWorkers')) { state.autoWorkers = fresh; return; }
  const value = raw.autoWorkers;
  if (!isAutoWorkersRecord(value)
    || Object.keys(value).some(key => !['enabled', 'priority', 'jobs'].includes(key))
    || typeof value.enabled !== 'boolean'
    || !Array.isArray(value.priority)
    || !isAutoWorkersRecord(value.jobs)) throw Error('自动分配工人设置无效。');
  const priority: BuildingId[] = [];
  for (const id of value.priority) {
    if (typeof id !== 'string' || !AUTO_WORKER_JOBS.includes(id as BuildingId) || priority.includes(id as BuildingId)) throw Error('自动分配工人优先级无效。');
    priority.push(id as BuildingId);
  }
  fresh.enabled = value.enabled;
  fresh.priority = [...priority, ...AUTO_WORKER_JOBS.filter(id => !priority.includes(id))];
  for (const [id, job] of Object.entries(value.jobs)) {
    if (!AUTO_WORKER_JOBS.includes(id as BuildingId) || !isAutoWorkersRecord(job)
      || Object.keys(job).some(key => !['enabled', 'limit'].includes(key))
      || typeof job.enabled !== 'boolean'
      || typeof job.limit !== 'number' || !Number.isSafeInteger(job.limit) || job.limit < -1) throw Error('自动分配工人岗位设置无效。');
    fresh.jobs[id as BuildingId] = { enabled: job.enabled, limit: job.limit };
  }
  state.autoWorkers = fresh;
}
