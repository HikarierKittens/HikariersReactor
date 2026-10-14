import { calculateEjectionCapacity, createBlackHoleState, isEjectableResource } from '../simulation/black-hole';
import type { GameState } from '../types/state';

/** Run-scoped black hole; older saves without the record start from the initial mass.
 * Call after buildings are validated so allocations can be checked against capacity. */
export function validateBlackHole(raw: Record<string, unknown>, state: GameState): void {
  const fresh = createBlackHoleState();
  const value = raw.blackHole;
  if (value === undefined) { state.blackHole = fresh; return; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('黑洞记录无效。');
  const source = value as Record<string, unknown>;
  if (Object.keys(source).some(key => !['mass', 'exoticMass', 'unstable', 'ejection'].includes(key))) throw Error('黑洞记录无效。');
  const { mass, exoticMass, unstable, ejection } = source;
  if (typeof mass !== 'number' || !Number.isFinite(mass) || mass < 0
    || typeof exoticMass !== 'number' || !Number.isFinite(exoticMass) || exoticMass < 0
    || typeof unstable !== 'boolean') throw Error('黑洞质量无效。');
  if (!ejection || typeof ejection !== 'object' || Array.isArray(ejection)) throw Error('质量喷射分配无效。');
  let total = 0;
  for (const [id, rate] of Object.entries(ejection as Record<string, unknown>)) {
    if (!isEjectableResource(id) || typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) throw Error('质量喷射分配无效。');
    if (rate > 0) fresh.ejection[id] = rate;
    total += rate;
  }
  if (total > calculateEjectionCapacity(state) + 1e-9) throw Error('质量喷射分配超过喷射容量。');
  fresh.mass = mass; fresh.exoticMass = exoticMass; fresh.unstable = unstable;
  state.blackHole = fresh;
}
