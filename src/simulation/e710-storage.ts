import { calculateSpaceFuelMultiplier } from './space-fuel';
import type { GameState } from '../types/state';
import type { ResourceAmounts } from '../types/economy';

/** Only fully maintained containers provide storage; callers own the supplied pool. */
export function calculateE710ContainerUnits(state: GameState, pool: ResourceAmounts, dt = 1, fuelMultiplier = calculateSpaceFuelMultiplier(state)): number {
  const running = Math.max(0, (state.buildings.e710Container || 0) - (state.stoppedBuildings?.e710Container || 0));
  return Math.min(running, Math.floor((Math.max(0, pool.helium3 || 0) + 1e-8) / (.5 * fuelMultiplier * dt)));
}
