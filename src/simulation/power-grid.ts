import { BUILDINGS } from '../data/buildings';
import { hasContinuousEnergyInput } from './building-production';
import { countRunningBuildings } from './housing';
import { clampSoldiersToArmyLimit } from './military';
import { settlePowerPlants, isPowerProducer } from './power';
import type { BuildingId } from '../types/buildings';
import type { GameState } from '../types/state';

export interface PowerActivation { id: BuildingId; count: number }
const IDS = Object.keys(BUILDINGS) as BuildingId[];
/**
 * Loads whose power is an optional upgrade rather than a prerequisite: a brownout
 * only withholds the upgrade, it must never stop the building. 实验室 keeps its
 * 猫猫科学家 jobs and output while unpowered (only capacity drops to 1000), so it
 * requests power and reports `failed` for the shortage marker, but the grid must
 * not add its units to the effective `stoppedBuildings`.
 */
const POWER_DEMAND_ONLY_IDS: readonly BuildingId[] = ['lab'];
const GRID = Symbol('powerGrid');
type GridState = GameState & { [GRID]?: PowerGrid };
export interface PowerGrid {
  generated: number; requested: number; used: number; available: number;
  allocated: Partial<Record<BuildingId, number>>;
  failed: Partial<Record<BuildingId, number>>;
  state: GameState;
}
/**
 * `available` is headroom: `generated - requested`, signed, where `requested`
 * covers every enabled load whether or not it was funded. It is deliberately not
 * the clamped leftover budget of `PowerBudget.available` (which `used` derives
 * from) and not the settled flow that `resource-breakdown` reports as `net`
 * (`generated - used`). The three only coincide when every enabled load is
 * funded. Simulation code must not treat `available` as spendable energy.
 */
/** Fixed electrical demand per complete building, kept self-contained so the
 *  power grid never re-enters fuel-discount or quantum previews (which would
 *  recurse through settlement). Fuel costs stay in the recipes; only the
 *  technology-gated electrical demand matters here. */
export function getBuildingPowerDemand(id: BuildingId, state: GameState): number {
  if (isPowerProducer(id)) return 0;
  if (id === 'navigationBeacon') return state.tech.includes('spaceBroadcasting') ? 3 : 2;
  if (id === 'metalRefinery') return state.tech.includes('advancedMetalRefining') ? 4 : 0;
  if (id === 'aiSupercore') return 100;
  if (id === 'agiAscensionCore') return Math.max(0, 10000 - 100 * Math.max(0, (state.buildings.coreCooler || 0) - (state.stoppedBuildings?.coreCooler || 0)));
  if (id === 'refinery') return state.tech.includes('crudeOilRefiningOptimization') ? 2 : BUILDINGS.refinery.input?.energy || 0;
  if (['mine', 'coalMine', 'lumber', 'quarry'].includes(id)) return state.tech.includes('automatedMining') ? 1 : 0;
  if (id === 'cementWorkshop') return state.tech.includes('cementMixer') ? 2 : 0;
  if (id === 'lab') return state.tech.includes('electricity') ? 2 : 0;
  return BUILDINGS[id].input?.energy || 0;
}
/** Older saves and programmatic fixtures get a deterministic registry-order fallback. */
export function reconcilePowerActivationOrder(state: GameState): PowerActivation[] {
  const remaining = new Map(IDS.map(id => [id, countRunningBuildings(id, state)]));
  const result: PowerActivation[] = [];
  const append = (id: BuildingId, requested: number) => {
    const count = Math.min(remaining.get(id) || 0, requested);
    if (!(count > 0)) return;
    remaining.set(id, (remaining.get(id) || 0) - count);
    const last = result[result.length - 1];
    if (last?.id === id) last.count += count;
    else result.push({ id, count });
  };
  for (const entry of state.powerActivationOrder || []) append(entry.id, entry.count);
  for (const id of IDS) append(id, remaining.get(id) || 0);
  return result;
}
/** No persistent state is changed by brownouts. Only this scoped view is stopped. */
export function calculatePowerGrid(state: GameState, dt = 1, quantumLevel = 0, generatedOverride?: number): PowerGrid {
  if (!Number.isFinite(dt) || dt <= 0) throw new RangeError('dt must be positive and finite');
  const existing = (state as GridState)[GRID];
  if (existing) return existing;
  const generated = generatedOverride ?? settlePowerPlants({ ...state.resources }, dt, state, quantumLevel).energy;
  if (!Number.isFinite(generated) || generated < 0) throw new RangeError('power generation must be nonnegative and finite');
  const allocated: PowerGrid['allocated'] = {}, failed: PowerGrid['failed'] = {};
  let remaining = generated, requested = 0;
  // A blocked older request retains priority: newer buildings cannot leapfrog it.
  let blocked = false;
  for (const { id, count } of reconcilePowerActivationOrder(state)) {
    const demand = getBuildingPowerDemand(id, state);
    requested += count * demand;
    const funded = demand === 0 ? count : blocked ? 0 : Math.min(count, Math.floor((remaining + 1e-8) / demand));
    allocated[id] = (allocated[id] || 0) + funded;
    if (demand > 0) {
      remaining = Math.max(0, remaining - funded * demand);
      if (funded < count) { failed[id] = (failed[id] || 0) + count - funded; blocked = true; }
    }
  }
  const stoppedBuildings = { ...state.stoppedBuildings };
  for (const [id, count] of Object.entries(failed) as [BuildingId, number][]) {
    if (POWER_DEMAND_ONLY_IDS.includes(id)) continue;
    stoppedBuildings[id] = (stoppedBuildings[id] || 0) + count;
  }
  const effective = { ...state, stoppedBuildings } as GridState;
  const grid: PowerGrid = { generated, requested, used: generated - remaining, available: generated - requested, allocated, failed, state: effective };
  effective[GRID] = grid;
  return grid;
}
export function setBuildingPowerEnabled(state: GameState, id: BuildingId, delta: number): void {
  if (!hasContinuousEnergyInput(id, state) || !Number.isSafeInteger(delta)) return;
  const order = reconcilePowerActivationOrder(state);
  const running = countRunningBuildings(id, state);
  const total = BUILDINGS[id].segmentEffects ? state.buildings[id] : Math.floor(state.buildings[id] / (BUILDINGS[id].segmentedRequired || 1));
  const next = Math.max(0, Math.min(total, running + delta));
  state.stoppedBuildings[id] = total - next;
  if (next > running) order.push({ id, count: next - running });
  else {
    let remove = running - next;
    for (let i = order.length - 1; i >= 0 && remove; i--) {
      const entry = order[i]!;
      if (entry.id !== id) continue;
      const count = Math.min(entry.count, remove); entry.count -= count; remove -= count;
    }
  }
  state.powerActivationOrder = order.filter(entry => entry.count > 0);
  // 军营 supplies the army ceiling: soldiers above the switched-on capacity are removed at
  // once instead of lingering as an unexplainable surplus. Other buildings leave the army alone.
  if (id === 'barracks') clampSoldiersToArmyLimit(state);
}
/** Called after construction; new units never displace an already enabled load. */
export function registerBuiltPowerUnits(state: GameState, id: BuildingId, beforeCompleted: number): void {
  const completed = BUILDINGS[id].segmentEffects ? state.buildings[id] : Math.floor(state.buildings[id] / (BUILDINGS[id].segmentedRequired || 1));
  const added = completed - beforeCompleted;
  if (!(added > 0)) return;
  const newlyEnabled = Math.min(added, countRunningBuildings(id, state));
  // Hide new units while evaluating the previous requests and their persistent order.
  const previous = { ...state, stoppedBuildings: { ...state.stoppedBuildings, [id]: (state.stoppedBuildings[id] || 0) + newlyEnabled } };
  const order = reconcilePowerActivationOrder(previous);
  const demand = getBuildingPowerDemand(id, state);
  const available = calculatePowerGrid(previous).available;
  const enabled = demand > 0 ? Math.min(newlyEnabled, Math.max(0, Math.floor((available + 1e-8) / demand))) : newlyEnabled;
  state.stoppedBuildings[id] = (state.stoppedBuildings[id] || 0) + newlyEnabled - enabled;
  if (enabled) order.push({ id, count: enabled });
  state.powerActivationOrder = order;
}
