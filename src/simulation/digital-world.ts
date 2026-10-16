import { calculateMasteryMultiplier } from './crafting';
import { countRunningBuildings } from './housing';
import type { GameState } from '../types/state';
import type { ResourceAmounts } from '../types/economy';

export interface DigitalSupport {
  gatewayUnits: number;
  capacity: number;
  used: number;
  downloadUnits: number;
  quantumStorageUnits: number;
  cacheUnits: number;
}

/** Pure allocation; paid fractional gateways provide bandwidth, consumers need whole units. */
export function calculateDigitalSupport(state: GameState, availableEnergy: number, dt = 1): DigitalSupport {
  if (!Number.isFinite(dt) || dt <= 0) throw new RangeError('dt must be positive and finite');
  const gatewayUnits = Math.min(countRunningBuildings('gatewayRouter', state), Math.max(0, availableEnergy) / (25 * dt));
  const capacity = gatewayUnits * 5;
  let remaining = Math.floor(capacity + 1e-8);
  const grant = (requested: number) => {
    const units = Math.min(remaining, requested);
    remaining -= units;
    return units;
  };
  const downloadUnits = grant(Math.min(1, countRunningBuildings('downloadExecutable', state)));
  const quantumStorageUnits = grant(countRunningBuildings('quantumStorage', state));
  const cacheUnits = grant(countRunningBuildings('downloadCache', state));
  return { gatewayUnits, capacity, used: downloadUnits + quantumStorageUnits + cacheUnits, downloadUnits, quantumStorageUnits, cacheUnits };
}

export function settleDigitalSupport(state: GameState, pool: ResourceAmounts, dt = 1): DigitalSupport {
  const support = calculateDigitalSupport(state, pool.energy, dt);
  pool.energy = Math.max(0, pool.energy - support.gatewayUnits * 25 * dt);
  return support;
}

export function calculateDigitalByteCapacity(support: Pick<DigitalSupport, 'quantumStorageUnits'>): number {
  return 10000 + 10000 * support.quantumStorageUnits;
}

export function calculateDigitalProduction(state: GameState, support: DigitalSupport, knowledgeProduction: number) {
  const allocation = support.downloadUnits > 0 ? Math.max(0, Math.min(100, state.downloadAllocation || 0)) / 100 : 0;
  const divertedKnowledge = Math.max(0, knowledgeProduction) * allocation;
  const byteProduction = divertedKnowledge * .01 * calculateMasteryMultiplier('bytes', state) * (1 + .1 * support.cacheUnits);
  return { ...support, allocation: allocation * 100, knowledgeProduction: Math.max(0, knowledgeProduction), divertedKnowledge, byteProduction, byteCapacity: calculateDigitalByteCapacity(support) };
}

/**
 * Observe finalized positive credits, not the inventory or net income. Redirect
 * immediately, so later upkeep can only spend knowledge actually retained.
 * The proxy wraps a fresh local settlement pool; the caller's state is untouched.
 */
export function createDigitalProductionPool(state: GameState, support: DigitalSupport, dt: number) {
  let knowledgeProduction = 0;
  const pool = new Proxy({ ...state.resources }, {
    set(target, property, value) {
      if (property === 'knowledge' && typeof value === 'number' && value > target.knowledge) {
        const credit = value - target.knowledge;
        knowledgeProduction += credit / dt;
        const conversion = calculateDigitalProduction(state, support, credit);
        target.knowledge = value - conversion.divertedKnowledge;
        target.bytes += conversion.byteProduction;
      } else {
        Reflect.set(target, property, value);
      }
      return true;
    },
  });
  return { pool, result: () => calculateDigitalProduction(state, support, knowledgeProduction) };
}
