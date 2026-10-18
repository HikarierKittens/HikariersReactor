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
/**
 * Fixed power rates, not stored resources or per-timestep quantities.
 *
 * Two different "available" figures exist in this codebase and they are not
 * interchangeable:
 * - Here, `available` is the *unspent budget* left after the funded settlement,
 *   clamped to `>= 0`, and `used` is derived from it (`generated - available`).
 * - `PowerGrid.available` is `generated - requested`, the *headroom* against every
 *   enabled load. It can be negative when enabled demand exceeds generation.
 * `calculateProduction` returns the grid figures, so the public
 * `ProductionResult.power.available` is the signed headroom, not this clamped
 * budget value. Read `used` when you need what was actually consumed.
 */
export interface PowerBudget { generated: number; used: number; available: number }
export function calculatePowerBudget(generated: number, remaining: number, dt: number): PowerBudget {
  const available = Math.max(0, remaining / dt);
  return { generated, used: Math.max(0, generated - available), available };
}
/**
 * Starts a fresh fixed-power budget in the caller's working pool. Scratch energy
 * is power * dt solely to reuse existing consumer settlement arithmetic; saved
 * energy is never supply. Fuel and all non-energy outputs still scale with dt.
 * Generation has no happiness multiplier.
 */
export function settlePowerPlants(pool: ResourceAmounts, dt: number, state: GameState, quantumLevel?: number): PowerResult {
  if (!Number.isFinite(dt) || dt <= 0) throw new RangeError('dt must be positive and finite');
  const outputs: ProductionInputs = {}, inputUnits: ProductionInputs = {};
  pool.energy = 0;
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
