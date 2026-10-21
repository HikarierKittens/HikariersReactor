import { isShipComponentId, isShipComponentUnlocked, type ShipComponentId } from '../simulation/spaceship';
import { buildingQueueUsage } from '../simulation/queue-settings';
import { BUILDINGS } from '../data/buildings';
import { TECHNOLOGIES } from '../data/technologies';
import { isBuildingUnlocked, isTechnologyUnlocked } from '../simulation/unlocks';
import { isProjectUnlocked } from '../simulation/projects';
import { purchaseQueueCapacity } from '../simulation/purchases';
import { isRegionalMissionId, isRegionalMissionAvailable, isRegionalMissionCompleted, type RegionalMissionId } from '../simulation/space-missions';
import type { BuildingId } from '../types/buildings';
import type { TechnologyId } from '../types/technologies';
import type { ArpaProjectId, GameState, QueueItem } from '../types/state';

/** Reconstruct only whitelisted fields from untrusted queue entries. */
export function validateSaveQueue(value: unknown, state: GameState): QueueItem[] {
  const pending = value;
  if (!Array.isArray(pending) || pending.length > 10000) throw Error('待购队列无效。');
  const seenUID = new Set<number>(), seenTech = new Set<TechnologyId>();
  const buildCounts: Partial<Record<BuildingId, number>> = {};
  const seenMissions = new Set<RegionalMissionId>();
  const seenShip = new Set<ShipComponentId>();
  const validated = pending.map((entry: unknown): QueueItem => {
    if (!entry || typeof entry !== 'object') throw Error('队列项目无效。');
    const q = entry as Record<string, unknown>;
    if ((q.kind !== 'build' && q.kind !== 'tech' && q.kind !== 'arpa' && q.kind !== 'mission' && q.kind !== 'ship') || typeof q.id !== 'string' || typeof q.uid !== 'number' || !Number.isSafeInteger(q.uid) || q.uid < 1 || seenUID.has(q.uid)) throw Error('队列项目无效。');
    seenUID.add(q.uid);
    if (Object.hasOwn(q, 'segments') && (q.kind !== 'build' || !BUILDINGS[q.id as BuildingId]?.segmentedRequired
      || typeof q.segments !== 'number' || !Number.isSafeInteger(q.segments) || q.segments < 1
      || q.segments > BUILDINGS[q.id as BuildingId].segmentedRequired!)) throw Error('分段队列数量无效。');
    if (q.kind === 'ship') {
      const id = q.id;
      if (!isShipComponentId(id) || !isShipComponentUnlocked(id, state) || state.shipComponents?.[id] || seenShip.has(id)) throw Error('飞船组件队列无效。');
      seenShip.add(id);
      return { uid: q.uid, kind: 'ship', id };
    }
    if (q.kind === 'mission') {
      const id = q.id;
      if (!isRegionalMissionId(id) || !isRegionalMissionAvailable(state, id) || isRegionalMissionCompleted(state, id) || seenMissions.has(id)) throw Error('队列任务无效。');
      seenMissions.add(id);
      return { uid: q.uid, kind: 'mission', id };
    }
    if (q.kind === 'tech') {
      const id = q.id as TechnologyId;
      // Historical pending overclock research was legal before the ripper gate.
      // Preserve its queue entry on import; live settlement still uses the full
      // current gate. All other technology prerequisites remain enforced.
      const researchState = id === 'ripperOverclock'
        ? { ...state, buildings: { ...state.buildings, spaceRipper: 1 } } : state;
      if (!Object.hasOwn(TECHNOLOGIES, id) || state.tech.includes(id) || seenTech.has(id) || !isTechnologyUnlocked(id, researchState)) throw Error('队列科技无效。');
      seenTech.add(id);
      return { uid: q.uid, kind: 'tech', id };
    }
    if (q.kind === 'arpa') {
      if (!isProjectUnlocked(q.id, state)) throw Error('工程队列无效');
      return { uid: q.uid, kind: 'arpa', id: q.id as ArpaProjectId };
    }
    const id = q.id as BuildingId;
    // Completed forms of segmented projects have no cost: a queue entry for them is invalid.
    if (!Object.hasOwn(BUILDINGS, id) || BUILDINGS[id].buildable === false || !isBuildingUnlocked(id, state)) throw Error('队列建筑无效。');
    buildCounts[id] = (buildCounts[id] || 0) + (q.segments as number | undefined ?? 1);
    if (state.buildings[id] + buildCounts[id] > (BUILDINGS[id].segmentedRequired ?? BUILDINGS[id].max ?? Infinity)) throw Error('队列超过建筑上限。');
    return { uid: q.uid, kind: 'build', id, ...(Object.hasOwn(q, 'segments') ? { segments: q.segments as number } : {}) };
  });
  const projects = validated;
  const buildingLaneCount = buildingQueueUsage(projects);
  if (buildingLaneCount + projects.filter(item => item.kind === 'tech').length > 100) throw Error('待购队列无效。');
  if (buildingLaneCount > purchaseQueueCapacity(state, 'build')) throw Error('队列超过建筑队列容量。');
  return projects;
}
