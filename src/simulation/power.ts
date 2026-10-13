import { calculateSpaceFuelMultiplier, calculatePoweredWaystations } from './space-fuel';
import { BUILDINGS } from '../data/buildings';
import { calculateQuantumLevel, calculateSwarmSupportCapacity } from './quantum';
import { calculateBuildingInput, calculateBuildingOutput } from './building-production';
import { countRunningBuildings } from './housing';
import type { ProductionInputs } from './building-production';
import type { BuildingId } from '../types/buildings';
import type { ResourceId, ResourceAmounts } from '../types/economy';
import type { GameState } from '../types/state';

export function isPowerProducer(id: BuildingId): boolean {
  return BUILDINGS[id].powerPlant === true || id === 'generator';
}
export interface PowerResult { outputs: ProductionInputs; inputUnits: ProductionInputs; energy: number }
/** Mutates only the caller's working pool. Generation has no happiness multiplier. */
export function settlePowerPlants(pool: ResourceAmounts, dt: number, state: GameState, quantumLevel?: number): PowerResult {
  const outputs: ProductionInputs = {}, inputUnits: ProductionInputs = {};
  let energy = 0;
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    if (!isPowerProducer(id)) continue;
    // Segmented plants (空间撕裂者) count only complete units; alwaysRunning plants ignore stops.
    const running = countRunningBuildings(id, state);
    // Use the existing power pool for geothermal fuel discounts to avoid recursive generation previews.
    const recipe = id === 'geothermalPlant'
      ? { helium3: .5 * calculateSpaceFuelMultiplier(state, calculatePoweredWaystations(state, pool, dt)) }
      : calculateBuildingInput(id, state);
    const inputs = Object.entries(recipe) as [ResourceId, number][];
    let ratio = 1;
    for (const [resource, amount] of inputs) {
      if (amount > 0 && running > 0) ratio = Math.min(ratio, Math.max(0, pool[resource] || 0) / (amount * running * dt));
    }
    const actual = id === 'swarmSatellite'
      ? Math.min(running, Math.floor(calculateSwarmSupportCapacity(state, quantumLevel ?? (state.tech.includes('quantumSwarm') ? calculateQuantumLevel(state, dt) : 0))))
      : id === 'hydrogenPowerPlant' ? Math.min(running, Math.floor((Math.max(0, pool.water) + 1e-8) / (2 * dt)))
       : running * Math.max(0, ratio);
    outputs[id] = actual;
    inputUnits[id] = actual;
    for (const [resource, amount] of inputs) pool[resource] = Math.max(0, (pool[resource] || 0) - amount * actual * dt);
    for (const [resource, amount] of Object.entries(calculateBuildingOutput(id, state)) as [ResourceId, number][]) {
      pool[resource] = (pool[resource] || 0) + amount * actual * dt;
      if (resource === 'energy') energy += amount * actual;
    }
  }
  return { outputs, inputUnits, energy };
}
