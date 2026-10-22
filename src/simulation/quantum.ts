import { calculateSupportPreview } from './support-preview';
import { calculateStorageDetails } from './storage';
import { countRunningBuildings } from './housing';
import { AI_DATA_CENTER_QUANTUM_BONUS } from './ai-data-center';
import type { StorageSnapshot } from './storage';
import type { GameState } from '../types/state';
import type { ResourceAmounts, ResourceId } from '../types/economy';
import { FACTORY_OPTIONS } from '../data/resources';

/** Industrial products are exactly the outputs of the current factory recipes. */
const FACTORY_PRODUCTS = new Set<ResourceId>(FACTORY_OPTIONS.flatMap(option => Object.keys(option.output) as ResourceId[]));

export interface QuantumSnapshot {
  knowledgeCapacity: number;
  base: number;
  cores: number;
  agi: number;
  /** Funded 运行中 AI数据中心 count (each adds +5% to the base multiplier). */
  centers: number;
  level: number;
}
/** Completed cores are indivisible; partial segments never reserve fuel or grant quantum. */
export function settleQuantumCores(state: GameState, pool: ResourceAmounts, dt = 1): number {
  const cores = Math.min(countRunningBuildings('aiSupercore', state), Math.floor((Math.max(0, pool.helium3) + 1e-8) / (25 * dt)), Math.floor((Math.max(0, pool.energy) + 1e-8) / (100 * dt)));
  pool.helium3 = Math.max(0, pool.helium3 - cores * 25 * dt);
  pool.energy = Math.max(0, pool.energy - cores * 100 * dt);
  return cores;
}
/** Inject the already-funded storage snapshot during settlement to avoid preview recursion. */
export function calculateQuantumSnapshot(state: GameState, snapshot?: StorageSnapshot, fundedCores?: number, dt = 1): QuantumSnapshot {
  if (!snapshot) {
    // Explicit baseline power breaks quantum -> support -> power -> quantum recursion.
    // Core fuel is reserved first, so extra swarm power cannot displace cores.
    // Iterate monotonically from baseline as additional power enables storage.
    let level = 0;
    let result: QuantumSnapshot | undefined;
    for (let pass = 0; pass < 16; pass++) {
      const support = calculateSupportPreview(state, dt, level);
      result = calculateQuantumSnapshot(state, { ...support, moonBaseUnits: support.moon.baseUnits }, support.aiSupercoreUnits);
      if (result.level === level) break;
      level = result.level;
    }
    return result!;
  }
  const knowledgeCapacity = calculateStorageDetails('knowledge', state, snapshot).total;
  const base = state.tech.includes('artificialIntelligenceII') ? Math.log1p(.1 * knowledgeCapacity / 250000) / Math.log1p(.1) : 0;
  const cores = fundedCores ?? 0;
  // The caller's paid digital snapshot is authoritative, including an explicit zero.
  // AGI adds fifty percentage points per funded component to the base multiplier,
  // alongside AI supercores; it cannot grant quantum before AI II unlocks the base.
  const agi = .5 * (snapshot.digital?.agiComponentUnits ?? 0);
  // 每座运行中的 AI数据中心 同样加算 5 个百分点到基础倍率（与 AI超级核心同一层级）。
  // The power grid already writes unfunded units into `stoppedBuildings`, so the running
  // count is the funded count on every settlement path — no extra snapshot field needed.
  const centers = countRunningBuildings('aiDataCenter', state);
  const level = Math.floor(base * (1 + .25 * cores + AI_DATA_CENTER_QUANTUM_BONUS * centers + agi) * 100) / 100;
  return { knowledgeCapacity, base, cores, agi, centers, level };
}
export function calculateQuantumLevel(state: GameState, dt = 1): number { return calculateQuantumSnapshot(state, undefined, undefined, dt).level; }
export function calculateSwarmSupportCapacity(state: GameState, quantumLevel?: number): number {
  return countRunningBuildings('swarmControlStation', state) * (20 + (state.tech.includes('quantumSwarm') ? quantumLevel ?? calculateQuantumLevel(state) : 0));
}
/** Per-factory effect, before compounding; total satellite discount is capped in pricing. */
export function calculateQuantumSwarmFactoryReduction(state: Pick<GameState, 'tech'>, quantumLevel: number): number {
  return .1 + (state.tech.includes('quantumSwarm') ? quantumLevel * .01 : 0);
}
export function calculateQuantumManufacturingMultiplier(state: Pick<GameState, 'tech'>, resource: ResourceId, quantumLevel: number): number {
  if (!state.tech.includes('quantumManufacturing') || !FACTORY_PRODUCTS.has(resource)) return 1;
  return Math.max(0, 1 + (quantumLevel - 1) * (resource === 'fur' ? .125 : .5));
}
