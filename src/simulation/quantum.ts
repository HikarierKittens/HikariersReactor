import { calculateSupportPreview } from './support-preview';
import { calculateStorageDetails } from './storage';
import { countRunningBuildings } from './housing';
import type { StorageSnapshot } from './storage';
import type { GameState } from '../types/state';
import type { ResourceAmounts } from '../types/economy';

export interface QuantumSnapshot {
  knowledgeCapacity: number;
  base: number;
  cores: number;
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
  const base = state.tech.includes('artificialIntelligenceII') ? knowledgeCapacity / 100000 : 0;
  const cores = fundedCores ?? 0;
  const level = Math.floor(base * (1 + .25 * cores) * 100) / 100;
  return { knowledgeCapacity, base, cores, level };
}
export function calculateQuantumLevel(state: GameState, dt = 1): number { return calculateQuantumSnapshot(state, undefined, undefined, dt).level; }
export function calculateSwarmSupportCapacity(state: GameState, quantumLevel?: number): number {
  return countRunningBuildings('swarmControlStation', state) * (20 + (state.tech.includes('quantumSwarm') ? quantumLevel ?? calculateQuantumLevel(state) : 0));
}
export function calculateQuantumManufacturingMultiplier(state: GameState, quantumLevel: number): number {
  return state.tech.includes('quantumManufacturing') ? 1 + .1 * quantumLevel : 1;
}
