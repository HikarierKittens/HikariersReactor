import { BUILDINGS } from '../data/buildings';
import { countRunningBuildings } from '../simulation/housing';
import { calculateRunningSmelterSlots } from '../simulation/factory';
import { allocateShipCrew, SHIP_CREW_SIZE } from '../simulation/ship-crew';
import type { BuildingId } from '../types/buildings';
import type { GameState } from '../types/state';
import type { ProductionResult } from '../simulation/production';

/** Enabled mining ships that lost their crew to a population shortage. */
export function countUndercrewedShips(id: BuildingId, state: GameState): number {
  if (!Object.hasOwn(SHIP_CREW_SIZE, id)) return 0;
  const crew = allocateShipCrew(state);
  return Math.max(0, countRunningBuildings(id, state) - (crew.working[id as keyof typeof crew.working] || 0));
}

/** Compare enabled units with the actual allocation, never with boosted output. */
export function isBuildingUnderworking(id: BuildingId, state: GameState, result: ProductionResult): boolean {
  const enabled = countRunningBuildings(id, state);
  if (!enabled) return false;
  const definition = BUILDINGS[id];
  // Buildings whose effect is applied directly (军营, 医院, 住宅…) draw no upkeep and never pass
  // through settlement, so there is nothing for the player to fix: they must not be marked short.
  const hasSettlementFootprint = !!(definition.input && Object.keys(definition.input).length)
    || !!definition.output || !!definition.workerOutput || !!definition.powerPlant
    || !!definition.support || !!definition.moonSupport;
  if (!hasSettlementFootprint) return false;
  let actual: number;
  if (id === 'cementWorkshop' && state.tech.includes('cementMixer')) actual = result.inputUnits.cementMixer || 0;
  else if (id === 'mine' && state.tech.includes('automatedMining')) actual = result.inputUnits.automatedMining || 0;
  else if (id === 'coalMine' && state.tech.includes('automatedMining')) actual = result.inputUnits.automatedCoalMining || 0;
  else if (id === 'lumber' && state.tech.includes('automatedMining')) actual = result.inputUnits.automatedLumber || 0;
  else if (id === 'quarry' && state.tech.includes('automatedMining')) actual = result.inputUnits.automatedQuarry || 0;
  else actual = result.inputUnits[id] || 0;
  // Vacant worker positions alone are not a power/resource shortage.
  const expected = BUILDINGS[id].workerOutput && !BUILDINGS[id].support && !BUILDINGS[id].moonSupport
    && !['cementWorkshop', 'mine', 'coalMine'].includes(id)
    && !(state.tech.includes('automatedMining') && (id === 'lumber' || id === 'quarry'))
    ? Math.min(state.workers[id] || 0, enabled * (BUILDINGS[id].slots || 5))
    // 冶炼厂 settles per steel-assigned slot; idle slots are a choice, not a shortage.
    : id === 'smelter' ? calculateRunningSmelterSlots(state) : enabled;
  return actual + 1e-8 < expected;
}
