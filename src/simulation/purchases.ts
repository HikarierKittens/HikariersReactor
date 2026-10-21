import { buildingQueueUsage, queuedBuildingSegments, segmentedQueueBatchSize, purchaseQueueCapacity } from './queue-settings';
export { purchaseQueueCapacity } from './queue-settings';
import { calculateSupportPreview } from './support-preview';
import { countRunningBuildings } from './housing';
import { reconcilePowerActivationOrder, registerBuiltPowerUnits } from './power-grid';
import { calculateSwarmSupportCapacity } from './quantum';
import { recordKnowledgeSpent } from './statistics';
import { addLog } from './progression';
import { MASS_EJECTION_UNLOCK_LOG, stabilizeBlackHole } from './black-hole';
import { BUILDINGS } from '../data/buildings';
import { TECHNOLOGIES } from '../data/technologies';
import { ARPA_PROJECTS } from '../data/projects';
import { calculateTechCost } from './government';
import { calculateBuildingCost, canPayCost, payResourceCost } from './costs';
import { calculateProjectCost, calculateProjectRemainingCost, isProjectUnlocked, isProjectAtLimit } from './projects';
import { isBuildingUnlocked, isTechnologyUnlocked } from './unlocks';
import { applyWorldUnification } from './neighbors';
import { hasContinuousEnergyInput, calculateBuildingName } from './building-production';
import type { BuildingId } from '../types/buildings';
import type { TechnologyId } from '../types/technologies';
import type { ResourceRecipe } from '../types/economy';
import type { ArpaProjectId, GameState, QueueItem } from '../types/state';

import { REGIONAL_MISSIONS, calculateRegionalMissionCost, completeRegionalMissionNow, isRegionalMissionAvailable, isRegionalMissionCompleted, isRegionalMissionId, markRegionalMissionCompleted, type RegionalMissionId } from './space-missions';

import { SHIP_COMPONENTS, calculateShipComponentRemainingCost, investInShipComponent, isShipComponentId, isShipComponentUnlocked, type ShipComponentId } from './spaceship';

export type PurchaseKind = 'build' | 'tech' | 'arpa' | 'mission' | 'ship';

/** Queue settings are intentionally read defensively so old saves remain valid while
 * newer schemas can add queue-related technology effects. */
function setting(state: GameState, key: string, fallback = false): boolean {
  const settings = (state as GameState & { settings?: Record<string, unknown> }).settings;
  return typeof settings?.[key] === 'boolean' ? settings[key] as boolean : fallback;
}

export function queueLength(state: GameState, kind: 'build' | 'tech'): number {
  return kind === 'build' ? buildingQueueUsage(state.queue) : state.queue.filter(item => item.kind === 'tech').length;
}

/** Mirrors the legacy purchase gate: unlock state plus remaining build capacity. */
export function isPurchaseAllowed(state: GameState, kind: string, id: string): boolean {
  if (kind === 'ship') return isShipComponentId(id) && isShipComponentUnlocked(id, state) && !state.shipComponents?.[id];
  if (kind === 'mission') return isRegionalMissionId(id) && isRegionalMissionAvailable(state, id) && !isRegionalMissionCompleted(state, id);
  if (kind === 'arpa') return isProjectUnlocked(id, state) && !isProjectAtLimit(id, state);
  if (kind === 'tech') {
    // Prestige-reset techs (奇异失控) only run through their confirmation dialog.
    return Object.hasOwn(TECHNOLOGIES, id)
      && !TECHNOLOGIES[id as TechnologyId].prestigeReset
      && !state.tech.includes(id as TechnologyId)
      && isTechnologyUnlocked(id, state);
  }
  if (kind === 'build') {
    if (!Object.hasOwn(BUILDINGS, id)) return false;
    const building = id as BuildingId;
    // Completed forms have no cost and are never bought directly.
    if (BUILDINGS[building].buildable === false) return false;
    if (isConstructionBlocked(state, building)) return false;
    return isBuildingUnlocked(id, state) && (state.buildings[building] || 0) < (BUILDINGS[building].segmentedRequired ?? BUILDINGS[building].max ?? Infinity);
  }
  return false;
}

/** A completed building with a unit cap (AGI cores: one) blocks further construction phases. */
export function isConstructionBlocked(state: Pick<GameState, 'buildings'>, id: BuildingId): boolean {
  const into = BUILDINGS[id].completesInto;
  if (!into) return false;
  const cap = BUILDINGS[into].max;
  return cap !== undefined && (state.buildings[into] || 0) >= cap;
}

/** Current price for one queue step: remaining ARPA share, full tech cost, or scaled build cost. */
export function calculateQueueCost(state: GameState, kind: string, id: string, segments = 1): ResourceRecipe {
  if (kind === 'ship' && isShipComponentId(id)) return calculateShipComponentRemainingCost(id, state);
  if (kind === 'mission' && isRegionalMissionId(id)) return calculateRegionalMissionCost(state, id);
  if (kind === 'arpa') return calculateProjectRemainingCost(id, state);
  if (kind === 'tech') return calculateTechCost(id as TechnologyId, state);
  const building = id as BuildingId;
  const cost = calculateBuildingCost(building, state.buildings[building] || 0, state);
  return BUILDINGS[building].segmentedRequired && segments !== 1
    ? Object.fromEntries(Object.entries(cost).map(([resource, value]) => [resource, value * segments])) : cost;
}

/** Next queue uid; empty queues restart at 1 like the legacy Math.max(0, ...[]) + 1. */
export function nextQueueUid(state: Pick<GameState, 'queue'>): number {
  return Math.max(0, ...state.queue.map(item => item.uid)) + 1;
}

/** Moon support available before this construction, matching legacy per-building checks. */
export type MoonAvailability = number | ((state: GameState) => number);
/** Check free support before each construction; never displace existing enabled units. */
export function constructBuildingState(state: GameState, id: BuildingId, moonAvailable: MoonAvailability): void {
  const building = BUILDINGS[id];
  // A capped completed project (one AGI core) stops accepting segments once it exists.
  if (isConstructionBlocked(state, id)) return;
  const required = building.segmentedRequired;
  const beforeCompleted = required && !building.segmentEffects ? Math.floor(state.buildings[id] / required) : state.buildings[id];
  const beforeRunning = countRunningBuildings(id, state);
  const alwaysEnable = setting(state, 'alwaysEnableNewBuildings', false);
  let insufficient = false;
  if (!alwaysEnable) {
    if (id === 'shortRangeRelay' || id === 'anchorFreightStation' || id === 'civilianRouteStation') {
      insufficient = calculateSupportPreview(state).stageThree.available < 2;
    } else if (id === 'iceMiningShip' || id === 'asteroidBase') {
      insufficient = calculateSupportPreview(state).stageThree.asteroidAvailable < 1;
    } else if (building.moonSupport) {
      const available = typeof moonAvailable === 'function' ? moonAvailable(state) : moonAvailable;
      insufficient = available < building.moonSupport;
    } else if (building.support && id !== 'asrielSpaceport') {
      insufficient = calculateSupportPreview(state).asriel.available < building.support;
    } else if ((building.swarmSupport || 0) < 0) {
      const capacity = Math.floor(calculateSwarmSupportCapacity(state));
      insufficient = capacity - countRunningBuildings('swarmSatellite', state) < -building.swarmSupport!;
    }
  }
  state.buildings[id] += 1;
  // Construction phase reached the required segments: consume them and place the completed
  // building, which is a different registry entry with its own (full) effects and no cost.
  if (building.completesInto && required && state.buildings[id] >= required) {
    const complete = building.completesInto;
    state.buildings[id] -= required;
    const beforeComplete = countRunningBuildings(complete, state);
    state.buildings[complete] += 1;
    // Ascension is destructive: completion always waits for an explicit player start,
    // including queued/bulk purchases and regardless of the auto-enable preference.
    if (complete === 'agiAscensionCore' || (insufficient && !BUILDINGS[complete].alwaysRunning)) {
      state.stoppedBuildings[complete] = (state.stoppedBuildings[complete] || 0) + 1;
    }
    if (countRunningBuildings(complete, state) > beforeComplete) registerBuiltPowerUnits(state, complete, beforeComplete);
    addLog(state, `${calculateBuildingName(complete, state)}建造完成。`, 'progress');
  }
  if (insufficient) {
    state.stoppedBuildings[id] = (state.stoppedBuildings[id] || 0) + 1;
  }
  if (countRunningBuildings(id, state) > beforeRunning) registerBuiltPowerUnits(state, id, beforeCompleted);
  else state.powerActivationOrder = reconcilePowerActivationOrder(state);
  if (id === 'massEjector' && state.buildings[id] === 1) addLog(state, MASS_EJECTION_UNLOCK_LOG, 'progress');
}
export const STABILIZE_BLACK_HOLE_LOG = '黑洞已稳定：奇异质量按40倍转化为普通质量，并加入了100k中子的质量。';
export const AI_CORE_CALIBRATION_LOG = 'AI超级核心似乎出现了错误，需要重新校准，在校准过程中一些工程师神秘失踪，最后我们发现他们把自己数字化了！';
export const OVERCLOCKING13_LOG = '空间撕裂者在虚空中撕开了空间，形成了一个黑洞！';

export interface ResearchSideEffects {
  poweredShutdown: BuildingId[];
  unlockedContainers: boolean;
}

/**
 * Newly powered buildings default to stopped so the player explicitly enables them.
 * Call after pushing the researched tech; previousTech is the tech list before research.
 */
export function applyResearchSideEffects(state: GameState, id: TechnologyId, previousTech: TechnologyId[]): ResearchSideEffects {
  if (id === 'dimensionBeaconDeployment' && !previousTech.includes(id)) addLog(state, '投放维度探测信标后，虚空之中传来了另一个信号');
  if (id === 'overclocking13' && !previousTech.includes(id)) addLog(state, OVERCLOCKING13_LOG, 'progress');
  // 世界统一 dissolves the rival states: occupations are released and their effects end,
  // replaced by the flat unification bonuses read from `tech`.
  if (id === 'worldUnification' && !previousTech.includes(id)) applyWorldUnification(state);
  // 稳定黑洞 is repeatable: apply once, then drop it so it reappears on the next instability.
  if (id === 'stabilizeBlackHole') {
    stabilizeBlackHole(state);
    state.tech = state.tech.filter(tech => tech !== id);
    addLog(state, STABILIZE_BLACK_HOLE_LOG, 'progress');
  }
  const before = { ...state, tech: previousTech };
  const poweredShutdown: BuildingId[] = [];
  for (const buildingId of Object.keys(BUILDINGS) as BuildingId[]) {
    if ((state.buildings[buildingId] || 0) > 0
      && !hasContinuousEnergyInput(buildingId, before)
      && hasContinuousEnergyInput(buildingId, state)) {
      state.stoppedBuildings[buildingId] = state.buildings[buildingId];
      poweredShutdown.push(buildingId);
    }
  }
  state.powerActivationOrder = reconcilePowerActivationOrder(state);
  // Only actual research awards the bootstrap router; loading an earned tech never does.
  // Like construction, the gift starts stopped if the current grid cannot fund it.
  if (id === 'aiCoreCalibration' && !previousTech.includes(id)) {
    const beforeCompleted = state.buildings.gatewayRouter;
    state.buildings.gatewayRouter += 1;
    registerBuiltPowerUnits(state, 'gatewayRouter', beforeCompleted);
    addLog(state, AI_CORE_CALIBRATION_LOG, 'progress');
  }
  return { poweredShutdown, unlockedContainers: id === 'containerManagement' };
}

export interface DirectPurchase {
  bought: boolean;
  firstFactory: boolean;
  poweredShutdown: BuildingId[];
  unlockedContainers: boolean;
}

/** Immediate single building purchase: pay scaled cost, construct, report first-factory unlock. */
export function buyBuildingNow(state: GameState, id: BuildingId, moonAvailable: MoonAvailability): DirectPurchase {
  const empty: DirectPurchase = { bought: false, firstFactory: false, poweredShutdown: [], unlockedContainers: false };
  if (!isPurchaseAllowed(state, 'build', id)
    || state.buildings[id] + queuedBuildingSegments(state.queue, id) >= (BUILDINGS[id].segmentedRequired ?? BUILDINGS[id].max ?? Infinity)) return empty;
  const cost = calculateBuildingCost(id, state.buildings[id], state);
  if (!payResourceCost(state.resources, cost)) return empty;
  recordKnowledgeSpent(state, cost.knowledge || 0);
  const firstFactory = state.buildings.factory === 0;
  constructBuildingState(state, id, moonAvailable);
  return { bought: true, firstFactory: firstFactory && state.buildings.factory > 0, poweredShutdown: [], unlockedContainers: false };
}

/** Immediate single technology purchase: pay, push, then apply powered-building side effects. */
export function researchTechnologyNow(state: GameState, id: TechnologyId): DirectPurchase {
  const empty: DirectPurchase = { bought: false, firstFactory: false, poweredShutdown: [], unlockedContainers: false };
  if (!Object.hasOwn(TECHNOLOGIES, id) || state.tech.includes(id) || !isTechnologyUnlocked(id, state)) return empty;
  const cost = calculateTechCost(id, state);
  if (!payResourceCost(state.resources, cost)) return empty;
  recordKnowledgeSpent(state, cost.knowledge || 0);
  const previousTech = [...state.tech];
  state.tech.push(id);
  const effects = applyResearchSideEffects(state, id, previousTech);
  return { bought: true, firstFactory: false, ...effects };
}

export type PurchaseRequest = 'buy-now' | 'queued' | 'queue-full' | 'rejected';
export interface RequestedPurchase {
  status: PurchaseRequest;
  direct?: DirectPurchase;
  queued?: QueueItem;
}

/**
 * Immediate clicks first buy when affordable, matching legacy button behavior.
 * ARPA projects intentionally stay out of this path and use their own queue entry.
 */
export function requestPurchaseModule(state: GameState, kind: string, id: string, moonAvailable: MoonAvailability, forceQueue = false): RequestedPurchase {
  if ((kind !== 'build' && kind !== 'tech' && kind !== 'mission' && kind !== 'ship') || !isPurchaseAllowed(state, kind, id)) return { status: 'rejected' };
  if (kind === 'ship') {
    const component = id as ShipComponentId;
    if (state.queue.some(item => item.kind === 'ship' && item.id === component)) return { status: 'rejected' };
    return queuePurchase(state, 'ship', component);
  }
  if (kind === 'mission') {
    const mission = id as RegionalMissionId;
    if (state.queue.some(item => item.kind === 'mission' && item.id === mission)) return { status: 'rejected' };
    if (!forceQueue && canPayCost(state.resources, calculateRegionalMissionCost(state, mission))) {
      if (!completeRegionalMissionNow(state, mission)) return { status: 'rejected' };
      return { status: 'buy-now', direct: { bought: true, firstFactory: false, poweredShutdown: [], unlockedContainers: false } };
    }
    return queuePurchase(state, 'mission', mission);
  }
  if (kind === 'tech') {
    const tech = id as TechnologyId;
    if (state.queue.some(item => item.kind === 'tech' && item.id === tech)) return { status: 'rejected' };
    if (!forceQueue && canPayCost(state.resources, calculateQueueCost(state, kind, id))) {
      const direct = researchTechnologyNow(state, tech);
      if (direct.bought) return { status: 'buy-now', direct };
    } else {
      return queuePurchase(state, kind, tech);
    }
    return { status: 'rejected' };
  }
  const building = id as BuildingId;
  const proposed = [...state.queue, { uid: nextQueueUid(state), kind: 'build', id: building } as QueueItem];
  if (buildingQueueUsage(proposed) > purchaseQueueCapacity(state, 'build')) return { status: 'queue-full' };
  const pending = queuedBuildingSegments(state.queue, building);
  if (isConstructionBlocked(state, building)) return { status: 'rejected' };
  if (state.buildings[building] + pending >= (BUILDINGS[building].segmentedRequired ?? BUILDINGS[building].max ?? Infinity)) return { status: 'rejected' };
  if (!forceQueue && canPayCost(state.resources, calculateQueueCost(state, kind, id))) {
    const direct = buyBuildingNow(state, building, moonAvailable);
    if (direct.bought) return { status: 'buy-now', direct };
    return { status: 'rejected' };
  }
  return queuePurchase(state, kind, building);
}

export type QueuePurchaseArguments = ['build', BuildingId] | ['tech', TechnologyId] | ['mission', RegionalMissionId] | ['ship', ShipComponentId];
export function queuePurchase(state: GameState, ...[kind, id]: QueuePurchaseArguments): RequestedPurchase {
  if (!isPurchaseAllowed(state, kind, id)
    || (kind !== 'build' && state.queue.some(item => item.kind === kind && item.id === id))) return { status: 'rejected' };
  const lane = kind === 'mission' || kind === 'ship' ? 'build' : kind;
  const uid = nextQueueUid(state);
  const item: QueueItem = kind === 'build' ? { uid, kind, id }
    : kind === 'tech' ? { uid, kind, id }
    : kind === 'mission' ? { uid, kind, id } : { uid, kind, id };
  if (item.kind === 'build') {
    if (!isPurchaseAllowed(state, kind, id)) return { status: 'rejected' };
    const definition = BUILDINGS[item.id];
    const remaining = (definition.segmentedRequired ?? definition.max ?? Infinity) - state.buildings[item.id] - queuedBuildingSegments(state.queue, item.id);
    if (remaining <= 0) return { status: 'rejected' };
    if (definition.segmentedRequired) item.segments = Math.min(segmentedQueueBatchSize(item.id), remaining);
  }
  const used = lane === 'build' ? buildingQueueUsage([...state.queue, item]) : queueLength(state, lane) + 1;
  if (buildingQueueUsage([...state.queue, item]) + state.queue.filter(entry => entry.kind === 'tech').length + (kind === 'tech' ? 1 : 0) > 100 || used > purchaseQueueCapacity(state, lane)) return { status: 'queue-full' };
  state.queue.push(item);
  return { status: 'queued', queued: item };
}

export function removeQueuedPurchase(state: GameState, uid: number): QueueItem | null {
  const index = state.queue.findIndex(item => item.uid === uid);
  if (index < 0) return null;
  const [removed] = state.queue.splice(index, 1);
  return removed ?? null;
}

export interface SettledQueueEntry {
  uid: number;
  kind: 'build' | 'tech' | 'mission' | 'ship';
  id: BuildingId | TechnologyId | RegionalMissionId | ShipComponentId;
  pruned: boolean;
  completed: boolean;
  firstFactory: boolean;
  poweredShutdown: BuildingId[];
  unlockedContainers: boolean;
}
export interface SettledQueue { entries: SettledQueueEntry[]; pruned: boolean; dirty: boolean }
/**
 * FIFO settlement without deposits: drop stale entries, stop at ARPA entries, then buy while affordable.
 * Moon availability is injected so the simulation stays independent of live support previews.
 */
export function settlePurchaseQueue(state: GameState, moonAvailable: MoonAvailability, fundShips = false, shipsOnly = false): SettledQueue {
  const result: SettledQueue = { entries: [], pruned: false, dirty: false };
  const valid = state.queue.filter(item => {
    const allowed = item.kind === 'arpa'
      ? isProjectUnlocked(item.id, state) && !isProjectAtLimit(item.id, state)
      : isPurchaseAllowed(state, item.kind, item.id);
    if (!allowed && item.kind !== 'arpa') {
      result.pruned = true;
      result.dirty = true;
      result.entries.push({
        uid: item.uid, kind: item.kind, id: item.id, pruned: true, completed: false,
        firstFactory: false, poweredShutdown: [], unlockedContainers: false,
      });
    } else if (!allowed) {
      result.pruned = true;
      result.dirty = true;
    }
    return allowed;
  });
  state.queue = valid;
  // Each queued ship component receives one independent staged investment per tick.
  // Ordered construction stops at its first unpaid construction entry; unordered can fund all.
  const buildLane = state.queue.filter(item => item.kind !== 'tech');
  const shipCandidates = setting(state, 'unorderedBuildingQueue', true) ? buildLane : buildLane.slice(0, 1);
  for (const item of shipCandidates) {
    if (item.kind !== 'ship' || !fundShips) continue;
    const investment = investInShipComponent(item.id, 100, state, 1);
    if (investment.investedPercent > 0) result.dirty = true;
    if (investment.completed) {
      state.queue = state.queue.filter(queued => queued.uid !== item.uid);
      result.entries.push({ uid: item.uid, kind: item.kind, id: item.id, pruned: false, completed: true,
        firstFactory: false, poweredShutdown: [], unlockedContainers: false });
    }
  }
  if (shipsOnly) return result;
  for (let attempts = 0; attempts < 200; attempts++) {
    const lanes: ('build' | 'tech')[] = ['build', 'tech'];
    let progressed = false;
    for (const lane of lanes) {
      const unordered = setting(state, lane === 'build' ? 'unorderedBuildingQueue' : 'unorderedResearchQueue', true);
      const candidates = state.queue.map((item, index) => ({ item, index })).filter(row =>
        row.item.kind === lane || (lane === 'build' && (row.item.kind === 'mission' || row.item.kind === 'arpa' || row.item.kind === 'ship')));
      if (!candidates.length) continue;
      const selected = unordered
        ? candidates.find(row => row.item.kind !== 'arpa' && row.item.kind !== 'ship' && canPayCost(state.resources, calculateQueueCost(state, row.item.kind, row.item.id))) || candidates[0]
        : candidates[0];
      if (!selected) continue;
      const current = selected.item;
      if (current.kind === 'arpa' || current.kind === 'ship') continue;
    if (!isPurchaseAllowed(state, current.kind, current.id)) {
      state.queue.splice(selected.index, 1);
      result.dirty = true;
      progressed = true;
      result.entries.push({
        uid: current.uid, kind: current.kind, id: current.id, pruned: true, completed: false,
        firstFactory: false, poweredShutdown: [], unlockedContainers: false,
      });
      continue;
    }
    const cost = calculateQueueCost(state, current.kind, current.id);
    if (!payResourceCost(state.resources, cost)) continue;
    recordKnowledgeSpent(state, cost.knowledge || 0);
    const name = current.kind === 'mission' ? REGIONAL_MISSIONS[current.id].name
      : current.kind === 'tech' ? TECHNOLOGIES[current.id].name : calculateBuildingName(current.id, state);
    const segmented = current.kind === 'build' && BUILDINGS[current.id].segmentedRequired;
    const projectComplete = !segmented || (current.kind === 'build' && (current.segments ?? 1) <= 1);
    if (projectComplete) {
      addLog(state, `队列中 ${name} 已完成`, 'queue');
      state.queue.splice(selected.index, 1);
    } else if (current.kind === 'build') {
      current.segments = (current.segments ?? 1) - 1;
    }
    result.dirty = true;
    progressed = true;
    if (current.kind === 'mission') {
      markRegionalMissionCompleted(state, current.id);
      result.entries.push({
        uid: current.uid, kind: current.kind, id: current.id, pruned: false, completed: true,
        firstFactory: false, poweredShutdown: [], unlockedContainers: false,
      });
    } else if (current.kind === 'tech') {
      const previousTech = [...state.tech];
      state.tech.push(current.id);
      const effects = applyResearchSideEffects(state, current.id, previousTech);
      result.entries.push({
        uid: current.uid, kind: current.kind, id: current.id, pruned: false, completed: true,
        firstFactory: false, ...effects,
      });
    } else {
      const firstFactory = state.buildings.factory === 0;
      constructBuildingState(state, current.id, moonAvailable);
      result.entries.push({
        uid: current.uid, kind: current.kind, id: current.id, pruned: false, completed: projectComplete,
        firstFactory: firstFactory && state.buildings.factory > 0, poweredShutdown: [], unlockedContainers: false,
      });
    }
    }
    if (!progressed) break;
  }
  return result;
}

export interface QueuedDisplayItem { uid: number; kind: PurchaseKind; id: string; name: string; icon: string; cost: ResourceRecipe; segments?: number }
/** Queued building prices accumulate earlier same-building entries, exactly like legacy queueItems(). */
export function describeQueuedPurchases(state: GameState): QueuedDisplayItem[] {
  const counts: Partial<Record<BuildingId, number>> = {};
  return state.queue.map(item => {
    if (item.kind === 'ship') {
      const component = SHIP_COMPONENTS[item.id];
      return { ...item, name: component.name, icon: component.icon, cost: calculateShipComponentRemainingCost(item.id, state) };
    }
    if (item.kind === 'mission') {
      return { ...item, name: REGIONAL_MISSIONS[item.id].name, icon: '', cost: calculateRegionalMissionCost(state, item.id) };
    }
    if (item.kind === 'arpa') {
      const project = ARPA_PROJECTS[item.id as ArpaProjectId];
      const cost = Object.fromEntries(Object.entries(calculateProjectCost(item.id, state)).map(([resource, total]) => [resource, total / 100]));
      return { ...item, name: project.name, icon: project.icon, cost };
    }
    if (item.kind === 'tech') {
      const tech = TECHNOLOGIES[item.id];
      return { ...item, name: tech.name, icon: '', cost: calculateTechCost(item.id, state) };
    }
    const building = BUILDINGS[item.id];
    const position = state.buildings[item.id] + (counts[item.id] || 0);
    const segments = item.segments ?? 1;
    counts[item.id] = (counts[item.id] || 0) + segments;
    const individual = calculateBuildingCost(item.id, position, state);
    const cost = building.segmentedRequired ? Object.fromEntries(Object.entries(individual).map(([resource, value]) => [resource, value * segments])) : individual;
    return { ...item, name: calculateBuildingName(item.id, state), icon: building.icon, cost };
  });
}

export interface BatchedPurchase { bought: number; firstFactory: boolean }
/** Batch building clicks pay escalating prices one by one and stop when resources run out. */
export function buyBuildingsInBatch(state: GameState, id: BuildingId, count: number, moonAvailable: MoonAvailability): BatchedPurchase {
  if (!isPurchaseAllowed(state, 'build', id) || !Number.isSafeInteger(count) || count < 1) return { bought: 0, firstFactory: false };
  const pending = queuedBuildingSegments(state.queue, id);
  const limit = Math.min(count, (BUILDINGS[id].segmentedRequired ?? BUILDINGS[id].max ?? Infinity) - state.buildings[id] - pending);
  const firstFactory = state.buildings.factory === 0;
  let bought = 0;
  while (bought < limit) {
    if (!payResourceCost(state.resources, calculateBuildingCost(id, state.buildings[id], state))) break;
    constructBuildingState(state, id, moonAvailable);
    bought += 1;
  }
  return { bought, firstFactory: bought > 0 && firstFactory && state.buildings.factory > 0 };
}
