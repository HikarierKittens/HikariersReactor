import { RESOURCES } from '../data/resources';
import { calculateProduction } from './production';
import { calculateStorageTotals } from './storage';
import { calculateSupportPreview } from './support-preview';
import type { RaidEconomyContext } from './neighbors';
import type { GameState } from '../types/state';
import type { ResourceId } from '../types/economy';

/**
 * Raid economics live here, not in `neighbors.ts`.
 *
 * `production` reaches `crafting`, which imports `neighbors` for the occupation bonus, so
 * reading production from inside `neighbors` would close a module cycle. Keeping the
 * bridge in its own module lets `neighbors` stay pure and dependency-free.
 */

/** Per-second rates and storage ceilings for every resource a raid can touch. */
export function buildRaidEconomy(state: GameState, revision?: number): RaidEconomyContext {
  const result = calculateProduction(state, 1);
  const production: Partial<Record<ResourceId, number>> = {};
  for (const [resource, rate] of Object.entries(result.rates) as [ResourceId, number][]) {
    if (Number.isFinite(rate) && rate > 0) production[resource] = rate;
  }
  return { production, capacity: raidCapacity(state, revision) };
}

/** Storage ceilings come from the same storage rules the resource panel shows. */
export function raidCapacity(state: GameState, revision?: number): Partial<Record<ResourceId, number>> {
  const support = calculateSupportPreview(state);
  void revision;
  const snapshot = {
    biologyUnits: support.biologyUnits,
    dataCenterUnits: support.dataCenterUnits,
    labUnits: support.labUnits,
    moonBaseUnits: support.moon.baseUnits,
    moon: support.moon,
    asriel: support.asriel,
    e710ContainerUnits: support.e710ContainerUnits,
    e710WarehouseUnits: support.e710WarehouseUnits,
    researchStationUnits: support.researchStationUnits,
    blackHoleStationUnits: support.blackHoleStationUnits,
    stageThree: support.stageThree,
    digital: support.digital,
  };
  const totals = calculateStorageTotals(state, snapshot);
  const capacity: Partial<Record<ResourceId, number>> = {};
  for (const resource of Object.keys(RESOURCES) as ResourceId[]) {
    const total = totals[resource];
    if (Number.isFinite(total) && total > 0) capacity[resource] = total;
  }
  return capacity;
}
