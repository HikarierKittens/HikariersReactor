import { calculateSupportPreview } from './support-preview';
import type { GameState } from '../types/state';
import type { ResourceAmounts } from '../types/economy';

const POWERED_METAL_REFINING = Symbol('poweredMetalRefining');
type MetalRefiningContext = { [POWERED_METAL_REFINING]?: number };
/** Scope an exact settlement count, avoiding recursive support/production previews. */
export function withPoweredMetalRefining<S extends object, T>(state: S, units: number, calculate: (context: S) => T): T {
  return calculate({ ...state, [POWERED_METAL_REFINING]: units });
}
export function calculatePoweredMetalRefineryUnits(state: GameState, dt = 1): number {
  if (!state.tech.includes('advancedMetalRefining')) return 0;
  return (state as MetalRefiningContext)[POWERED_METAL_REFINING] ?? calculateSupportPreview(state, dt).metalRefineryUnits;
}
/** Whole enabled buildings only; no workers or fractional power grants. */
export function settleMetalRefining(state: GameState, pool: ResourceAmounts, dt: number): number {
  if (!state.tech.includes('advancedMetalRefining')) return 0;
  const running = Math.max(0, (state.buildings.metalRefinery || 0) - (state.stoppedBuildings?.metalRefinery || 0));
  const units = Math.min(running, Math.floor((Math.max(0, pool.energy) + 1e-8) / (4 * dt)));
  pool.energy = Math.max(0, pool.energy - units * 4 * dt);
  return units;
}
export function calculateRefiningMultiplier(resource: string, state: GameState): number {
  if (!['aluminum', 'metal', 'iridium'].includes(resource)) return 1;
  const owned = state.buildings.metalRefinery || 0;
  const units = !owned || !state.tech?.includes('advancedMetalRefining') ? 0
    : (state as MetalRefiningContext)[POWERED_METAL_REFINING] ?? (state.resources ? calculatePoweredMetalRefineryUnits(state) : 0);
  return resource === 'aluminum' ? 1 + owned * .06 + units * .02 : 1 + units * (resource === 'iridium' ? .005 : .01);
}
