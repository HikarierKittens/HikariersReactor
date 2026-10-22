import { buildSettlementLedger } from './support-preview';
import { calculatePowerGrid } from './power-grid';
import { allocateMoonSupport } from './moon';
import { allocateAsrielSupport } from './asriel';
import type { ResourceAmounts } from '../types/economy';
import type { GameState } from '../types/state';

/** Legacy funding chain for pure maintenance callers; skips biology power by
 *  adding it back exactly as the ledger reserved it, honoring grid failures. */
function maintenancePool(state: GameState, dt: number): ResourceAmounts {
  // The grid lives on SettlementLedger, not the public SupportPreview snapshot.
  const preview = buildSettlementLedger(state, dt);
  const grid = calculatePowerGrid(preview.grid.state, dt);
  const pool = { ...preview.pool, energy: preview.pool.energy + preview.biologyUnits * 2 * dt };
  // Replay lunar/Asriel maintenance debits so upstream callers cannot grant
  // units that the funded settlement chain could not keep running.
  const waystationRunning = Math.max(0, (grid.state.buildings.spaceWaystation || 0) - (grid.state.stoppedBuildings.spaceWaystation || 0));
  const waystations = Math.min(waystationRunning, Math.floor((Math.max(0, pool.energy) + 1e-8) / (5 * dt)));
  pool.energy = Math.max(0, pool.energy - waystations * 5 * dt);
  const fuelMultiplier = Math.max(Number.MIN_VALUE, .95 ** waystations);
  const moon = allocateMoonSupport(grid.state, pool, dt, fuelMultiplier);
  pool.energy = Math.max(0, pool.energy - (moon.baseUnits * 4 + (moon.beaconUnits || 0) * 2) * dt);
  const asriel = allocateAsrielSupport(grid.state, pool, dt, waystations, fuelMultiplier);
  pool.energy = Math.max(0, pool.energy - asriel.towers * 2 * dt);
  return pool;
}
export function calculateResearchPowerPool(state: GameState, dt: number): ResourceAmounts {
  return maintenancePool(state, dt);
}
export function calculateBiologyUnits(state: GameState, dt: number): number {
  const pool = calculateResearchPowerPool(state, dt);
  const running = Math.max(0, (state.buildings.biologyLab || 0) - (state.stoppedBuildings.biologyLab || 0));
  return Math.min(running, Math.floor((Math.max(0, pool.energy) + 1e-8) / (2 * dt)));
}
export function calculateDataCenterUnits(state: GameState, dt: number): number {
  const pool = calculateResearchPowerPool(state, dt);
  const bioRunning = Math.max(0, (state.buildings.biologyLab || 0) - (state.stoppedBuildings.biologyLab || 0));
  const bio = Math.min(bioRunning, Math.floor((Math.max(0, pool.energy) + 1e-8) / (2 * dt)));
  pool.energy = Math.max(0, pool.energy - bio * 2 * dt);
  const running = Math.max(0, (state.buildings.observatory || 0) - (state.stoppedBuildings.observatory || 0));
  return Math.min(running, Math.floor((pool.energy + 1e-8) / (3 * dt)));
}
