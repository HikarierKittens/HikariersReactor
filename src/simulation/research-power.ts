import { calculateSupportPreview } from './support-preview';
import { settlePowerPlants } from './power';
import { allocateMoonSupport } from './moon';
import { allocateAsrielSupport } from './asriel';
import type { ResourceAmounts, ResourceId } from '../types/economy';
import type { GameState } from '../types/state';

export function calculateResearchPowerPool(state: GameState, dt: number): ResourceAmounts {
  const preview = calculateSupportPreview(state, dt);
  // The preview reserves biology power too; this API returns the pool before it.
  return { ...preview.pool, energy: preview.pool.energy + preview.biologyUnits * 2 * dt };
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
