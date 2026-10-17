import { calculateGlobalOutputMultiplier, calculateMasteryMultiplier } from './crafting';
import { calculateProductionMultiplier } from './multipliers';
import { BUILDINGS } from '../data/buildings';
import { countRunningBuildings } from './housing';
import { calculateQuantumLevel } from './quantum';
import type { GameState } from '../types/state';
import type { ResourceAmounts } from '../types/economy';

export interface DigitalSupport {
  gatewayUnits: number;
  capacity: number;
  used: number;
  downloadUnits: number;
  quantumStorageUnits: number;
  cacheUnits: number;
  subcomputeUnits: number;
  compressionUnits: number;
  dataCompressionUnits: number;
  decoderUnits: number;
  cellUnits: number;
  memoryUnits: number;
  minerUnits: number;
  decryptionUnits: number;
  softRouterUnits: number;
  aesUnits: number;
  worldSimulatorUnits: number;
  agiComponentUnits: number;
  coreCoolerUnits: number;
  ascensionCoreUnits: number;
  ascensionEnergyUse: number;
  energyUse: number;
  cpuCapacity: number;
  cpuUsed: number;
}

/** Pure allocation; paid fractional gateways provide bandwidth, consumers need whole units. */
export function calculateDigitalSupport(state: GameState, availableEnergy: number, dt = 1): DigitalSupport {
  if (!Number.isFinite(dt) || dt <= 0) throw new RangeError('dt must be positive and finite');
  const softRouterUnits = countRunningBuildings('softRouterNode', state);
  const suppliedEnergy = Math.max(0, availableEnergy) + softRouterUnits * 10 * dt;
  const gatewayUnits = Math.min(countRunningBuildings('gatewayRouter', state), suppliedEnergy / (25 * dt));
  let energy = Math.max(0, suppliedEnergy - gatewayUnits * 25 * dt);
  const power = (requested: number, cost: number) => {
    const units = Math.min(requested, Math.floor((energy + 1e-8) / (cost * dt)));
    energy -= units * cost * dt;
    return units;
  };
  const cellUnits = power(countRunningBuildings('cellCore', state), 25);
  const capacity = gatewayUnits * (state.tech.includes('layer3Switch') ? 7.5 : 5) + softRouterUnits * 4;
  let remaining = Math.floor(capacity + 1e-8);
  const grant = (requested: number, cost = 1) => {
    const units = Math.min(Math.floor(remaining / cost), requested);
    remaining -= units * cost;
    return units;
  };
  const downloadUnits = grant(Math.min(1, countRunningBuildings('downloadExecutable', state)));
  const quantumStorageUnits = grant(countRunningBuildings('quantumStorage', state));
  const cacheUnits = grant(countRunningBuildings('downloadCache', state));
  const subcomputeUnits = grant(countRunningBuildings('subcomputeNode', state), 3);
  const cpuCapacity = subcomputeUnits * 2 + cellUnits * (state.tech.includes('cellMultithreading') ? 4 : 3) + softRouterUnits * 3;
  const compressionUnits = Math.min(cpuCapacity, countRunningBuildings('quantizedCompressionModule', state));
  const dataCompressionUnits = Math.min(cpuCapacity - compressionUnits, countRunningBuildings('dataCompression', state));
  const decoderUnits = grant(Math.min(cpuCapacity - compressionUnits - dataCompressionUnits, countRunningBuildings('cpuDecoder', state)), 2);
  let cpuRemaining = cpuCapacity - compressionUnits - dataCompressionUnits - decoderUnits;
  const memoryUnits = power(Math.min(cpuRemaining, countRunningBuildings('memoryCore', state)), 5);
  cpuRemaining -= memoryUnits;
  const minerUnits = power(Math.min(cpuRemaining, countRunningBuildings('ethMiner', state)), 10);
  cpuRemaining -= minerUnits;
  const decryptionCpu = BUILDINGS.dataDecryptionModule.cpuComputeUse!;
  const decryptionUnits = Math.min(Math.floor(cpuRemaining / decryptionCpu), countRunningBuildings('dataDecryptionModule', state));
  return { gatewayUnits, capacity, used: downloadUnits + quantumStorageUnits + cacheUnits + subcomputeUnits * 3 + decoderUnits * 2,
    downloadUnits, quantumStorageUnits, cacheUnits, subcomputeUnits, compressionUnits, dataCompressionUnits, decoderUnits,
    cellUnits, memoryUnits, minerUnits, decryptionUnits,
    cpuCapacity, cpuUsed: compressionUnits + dataCompressionUnits + decoderUnits + memoryUnits + minerUnits + decryptionUnits * decryptionCpu };
}

export function settleDigitalSupport(state: GameState, pool: ResourceAmounts, dt = 1): DigitalSupport {
  const support = calculateDigitalSupport(state, pool.energy, dt);
  pool.energy = Math.max(0, pool.energy - (support.gatewayUnits * 25 + support.cellUnits * 25 + support.memoryUnits * 5 + support.minerUnits * 10) * dt);
  return support;
}

export function calculateDigitalByteCapacity(support: Pick<DigitalSupport, 'quantumStorageUnits' | 'dataCompressionUnits' | 'memoryUnits'>): number {
  return 10000 + 10000 * support.quantumStorageUnits * (1 + .25 * support.dataCompressionUnits)
    + 50000 * support.memoryUnits * (1 + .15 * support.dataCompressionUnits);
}

export function calculateDigitalProduction(state: GameState, support: DigitalSupport, knowledgeProduction: number, quantumLevel?: number, happiness = state.happiness) {
  const allocation = support.downloadUnits > 0 ? Math.max(0, Math.min(100, state.downloadAllocation || 0)) / 100 : 0;
  const divertedKnowledge = Math.max(0, knowledgeProduction) * allocation;
  const neuralMultiplier = state.tech.includes('neuralNetwork') ? 1 + .01 * (quantumLevel ?? calculateQuantumLevel(state)) : 1;
  const byteProduction = divertedKnowledge * .01 * calculateMasteryMultiplier('bytes', state) * (1 + .1 * support.cacheUnits) * neuralMultiplier;
  const decoderProduction = support.decoderUnits * 100 * neuralMultiplier;
  const encryptedProduction = support.decryptionUnits * BUILDINGS.dataDecryptionModule.output!.encryptedData! * (1 + .25 * support.decryptionUnits) * calculateMasteryMultiplier('encryptedData', state);
  const minerProduction = support.minerUnits * 512 * calculateProductionMultiplier('cash', happiness, state) * calculateGlobalOutputMultiplier('cash', state);
  return { ...support, allocation: allocation * 100, knowledgeProduction: Math.max(0, knowledgeProduction), divertedKnowledge, byteProduction, decoderProduction, encryptedProduction, minerProduction, neuralMultiplier, byteCapacity: calculateDigitalByteCapacity(support) };
}

/**
 * Observe finalized positive credits, not the inventory or net income. Redirect
 * immediately, so later upkeep can only spend knowledge actually retained.
 * The proxy wraps a fresh local settlement pool; the caller's state is untouched.
 */
export function createDigitalProductionPool(state: GameState, support: DigitalSupport, dt: number, happiness = state.happiness) {
  let knowledgeProduction = 0;
  const quantumLevel = state.tech.includes('neuralNetwork') ? calculateQuantumLevel(state, dt) : 0;
  const digital = calculateDigitalProduction(state, support, 0, quantumLevel, happiness);
  const initial = { ...state.resources };
  initial.bytes += digital.decoderProduction * dt;
  initial.encryptedData += digital.encryptedProduction * dt;
  initial.cash += digital.minerProduction * dt;
  const pool = new Proxy(initial, {
    set(target, property, value) {
      if (property === 'knowledge' && typeof value === 'number' && value > target.knowledge) {
        const credit = value - target.knowledge;
        knowledgeProduction += credit / dt;
        const conversion = calculateDigitalProduction(state, support, credit, quantumLevel, happiness);
        target.knowledge = value - conversion.divertedKnowledge;
        target.bytes += conversion.byteProduction;
      } else {
        Reflect.set(target, property, value);
      }
      return true;
    },
  });
  return { pool, result: () => calculateDigitalProduction(state, support, knowledgeProduction, quantumLevel, happiness) };
}
