import { calculateSupportPreview } from './support-preview';
import { BUILDINGS } from '../data/buildings';
import { RESOURCES } from '../data/resources';
import { calculateStorageBonuses } from './storage-bonuses';
import { CRISPR_UPGRADES } from '../data/crispr';
import { calculateCrisprStorageBonus } from './crispr';
import { isContainerAssignable, calculateContainerUnitCapacity } from './containers';
import { formatNumber } from '../shared/format';
import { countRunningBuildings } from './housing';
import { calculateFreightCapacityMultiplier, calculateRipperKnowledgeBonusValue } from './building-effects';
import type { BuildingId } from '../types/buildings';
import type { ResourceId, AsrielSupport } from '../types/economy';
import type { MoonSupport } from './moon';
import type { GameState } from '../types/state';

export interface StorageSnapshot {
  stageThree?: { repeaters?: number; ports?: number; freight: number; civilian: number; iceShips?: number; asteroidBases?: number };
  e710ContainerUnits?: number;
  e710WarehouseUnits?: number;
  researchStationUnits?: number;
  blackHoleStationUnits?: number;
  biologyUnits: number;
  dataCenterUnits: number;
  moonBaseUnits: number;
  moon: MoonSupport;
  asriel: AsrielSupport;
}
export interface StorageDetails { rows: { name: string; value: number }[]; total: number }

/** One row contribution inside the shared storage pass. */
interface StorageRowContext {
  counts: Partial<Record<BuildingId, number>>;
  freightMultiplier: number;
  crispr: { particleUpgrade?: string; particleBonus: number; casimirBonus: number };
}

/**
 * Shared single-pass core: every building contributes once, per-resource amounts
 * accumulate into `totals` while `rows` records detail for one optional resource.
 * Ordering and name strings must match the historical per-resource loop exactly.
 */
function baseStorage(resource: ResourceId, state: GameState): number {
  return RESOURCES[resource].cap + (resource === 'energy' && state.tech.includes('batteryConcentrationRing') ? 90000 : 0);
}

function accumulateStorageRows(
  state: GameState, snapshot: StorageSnapshot, detailResource: ResourceId | null,
  totals: Partial<Record<ResourceId, number>> | null, rows: StorageDetails['rows'] | null,
  replayResource: ResourceId | null = null,
): void {
  const crispr = calculateCrisprStorageBonus(state);
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    const count = id === 'anchorFreightStation' ? (state.buildings[id] ? snapshot.stageThree?.freight ?? calculateSupportPreview(state).stageThree.freight : 0)
      : id === 'iceMiningShip' ? (state.buildings[id] ? snapshot.stageThree?.iceShips ?? calculateSupportPreview(state).stageThree.iceShips : 0)
      : id === 'asteroidBase' ? (state.buildings[id] ? snapshot.stageThree?.asteroidBases ?? calculateSupportPreview(state).stageThree.asteroidBases : 0)
      : id === 'civilianRouteStation' ? (state.buildings[id] ? snapshot.stageThree?.civilian ?? calculateSupportPreview(state).stageThree.civilian : 0)
      : id === 'e710Container' ? (detailResource === 'e710' ? snapshot.e710ContainerUnits ?? calculateSupportPreview(state).e710ContainerUnits : 0)
      : id === 'e710Warehouse' ? (detailResource === 'e710' ? snapshot.e710WarehouseUnits ?? calculateSupportPreview(state).e710WarehouseUnits : 0)
      : id === 'moonBase' ? snapshot.moonBaseUnits
      : id === 'biologyLab' ? snapshot.biologyUnits
      : id === 'observatory' ? snapshot.dataCenterUnits
      : id === 'moonObservatory' ? snapshot.moon.allocations.moonObservatory || 0
      : id === 'ecologicalDome' ? snapshot.asriel.allocations.ecologicalDome || 0
      : id === 'alienMaterialLab' ? snapshot.asriel.allocations.alienMaterialLab || 0
      : id === 'hyperspaceSpaceport' ? (state.buildings[id] ? snapshot.stageThree?.ports ?? calculateSupportPreview(state).stageThree.ports : 0)
      : id === 'e710ResearchStation' ? (state.buildings[id] ? snapshot.researchStationUnits ?? calculateSupportPreview(state).researchStationUnits : 0) : state.buildings[id];
    const freightMultiplier = id === 'anchorFreightStation' && count > 0
      ? calculateFreightCapacityMultiplier(state, snapshot.stageThree?.asteroidBases ?? (state.buildings.asteroidBase ? calculateSupportPreview(state).stageThree.asteroidBases : 0)) : 1;
    const bonuses = calculateStorageBonuses(id, state, snapshot.moon, snapshot.asriel);
    const record = (resource: ResourceId, value: number) => {
      if (!value) return;
      // Batched replay passes record only the replayed resource's bonuses; every
      // other resource was already counted in the shared ordinary pass.
      if (replayResource && resource !== replayResource) return;
      if (totals) totals[resource] = (totals[resource] || 0) + value;
      if (rows && resource === detailResource) rows.push({ name: BUILDINGS[id].name + ' ×' + formatNumber(count), value });
    };
    for (const [resource, base] of Object.entries(bonuses) as [ResourceId, number][]) record(resource, base * count * freightMultiplier);
  }
  if (detailResource && isContainerAssignable(detailResource, state)) {
    for (const [label, assignments, multiplier] of [['集装箱', state.containerAssignments, 1], ['合金集装箱', state.alloyContainerAssignments, 4]] as const) {
      const count = assignments[detailResource] || 0;
      const boxes = count * calculateContainerUnitCapacity(state) * multiplier;
      if (!boxes) continue;
      if (totals) totals[detailResource] = (totals[detailResource] || 0) + boxes;
      if (rows) rows.push({ name: label + ' ×' + formatNumber(count), value: boxes });
    }
  }
  if (!detailResource && totals) {
    // The batched ordinary pass must also carry container assignments for every
    // assignable resource, matching the per-resource detail rows exactly.
    for (const resource of Object.keys(RESOURCES) as ResourceId[]) {
      if (!isContainerAssignable(resource, state)) continue;
      const assigned = (state.containerAssignments[resource] || 0) + 4 * (state.alloyContainerAssignments[resource] || 0);
      if (!assigned) continue;
      totals[resource] = (totals[resource] || 0) + assigned * calculateContainerUnitCapacity(state);
    }
  }
  if (detailResource === 'cash') {
    const intelligentBanking = state.tech.includes('intelligentBankingSystem');
    const perCat = intelligentBanking ? 1000 : state.tech.includes('savingsBonds') ? 500 : state.tech.includes('stockTrading') ? 250 : 0;
    if (perCat && state.population) {
      const value = state.population * perCat;
      if (totals) totals.cash = (totals.cash || 0) + value;
      if (rows) rows.push({ name: intelligentBanking ? '智能化银行系统' : state.tech.includes('savingsBonds') ? '储蓄债券' : '股票交易', value });
    }
    const exchanges = state.arpaBuildings?.stockExchange || 0;
    if (exchanges && rows) {
      // Exchange interest scales the running rows subtotal, preserving cash row order.
      const interest = rows.reduce((total, row) => total + row.value, 0) * .1 * exchanges;
      if (totals) totals.cash = (totals.cash || 0) + interest;
      rows.push({ name: '证券交易所 ×' + formatNumber(exchanges), value: interest });
    } else if (exchanges && totals) {
      totals.cash = (totals.cash || 0) + (totals.cash || 0) * .1 * exchanges;
    }
    // Cash is not special: the detail path scales its rows subtotal by CRISPR too,
    // with both bonuses on the same pre-bonus subtotal (matching the non-cash branch).
    if (rows) {
      const preBonusSubtotal = rows.reduce((total, row) => total + row.value, 0);
      if (crispr.particleUpgrade && crispr.particleBonus) {
        if (totals) totals.cash = (totals.cash || 0) + preBonusSubtotal * crispr.particleBonus;
        rows.push({ name: CRISPR_UPGRADES[crispr.particleUpgrade].name, value: preBonusSubtotal * crispr.particleBonus });
      }
      if (crispr.casimirBonus) {
        if (totals) totals.cash = (totals.cash || 0) + preBonusSubtotal * crispr.casimirBonus;
        rows.push({ name: CRISPR_UPGRADES.casimirEffect.name, value: preBonusSubtotal * crispr.casimirBonus });
      }
      pushDarkEnergyRow(state, 'cash', totals, rows);
    }
  } else if (detailResource && !RESOURCES[detailResource].special && rows) {
    // CRISPR bonuses both scale the same pre-bonus row subtotal (additive bonus rows);
    // the batched totals replay the identical per-resource math in calculateStorageTotals.
    const preBonusSubtotal = rows.reduce((total, row) => total + row.value, 0);
    if (crispr.particleUpgrade && crispr.particleBonus) {
      if (totals) totals[detailResource] = (totals[detailResource] || 0) + preBonusSubtotal * crispr.particleBonus;
      rows.push({ name: CRISPR_UPGRADES[crispr.particleUpgrade].name, value: preBonusSubtotal * crispr.particleBonus });
    }
    if (crispr.casimirBonus) {
      if (totals) totals[detailResource] = (totals[detailResource] || 0) + preBonusSubtotal * crispr.casimirBonus;
      rows.push({ name: CRISPR_UPGRADES.casimirEffect.name, value: preBonusSubtotal * crispr.casimirBonus });
    }
    pushDarkEnergyRow(state, detailResource, totals, rows);
  }
  if (totals && detailResource && !totals[detailResource]) totals[detailResource] ||= 0;
}

/** Each 暗能量 raises ordinary-resource storage by 1%, multiplied after the CRISPR bonuses. */
export const DARK_ENERGY_STORAGE_RATE = .01;
export function calculateDarkEnergyStorageBonus(state: Pick<GameState, 'prestige'>): number {
  return Math.max(0, state.prestige.darkEnergy || 0) * DARK_ENERGY_STORAGE_RATE;
}
function pushDarkEnergyRow(state: GameState, resource: ResourceId, totals: Partial<Record<ResourceId, number>> | null, rows: StorageDetails['rows']): void {
  const bonus = calculateDarkEnergyStorageBonus(state);
  if (!bonus) return;
  const subtotal = rows.reduce((total, row) => total + row.value, 0);
  if (totals) totals[resource] = (totals[resource] || 0) + subtotal * bonus;
  rows.push({ name: '暗能量加成', value: subtotal * bonus });
}

/** Per completed 空间撕裂者: 20% plus 1% per funded 黑洞星际站. */
export function calculateRipperKnowledgeBonus(state: GameState, snapshot: Pick<StorageSnapshot, 'blackHoleStationUnits'>): number {
  const stations = state.buildings.blackHoleStation ? snapshot.blackHoleStationUnits ?? calculateSupportPreview(state).blackHoleStationUnits : 0;
  return calculateRipperKnowledgeBonusValue(stations);
}

export function calculateStorageDetails(resource: ResourceId, state: GameState, snapshot: StorageSnapshot): StorageDetails {
  if (RESOURCES[resource].crafted) return { rows: [], total: Infinity };
  const rows: StorageDetails['rows'] = [{ name: '基础储量', value: baseStorage(resource, state) }];
  const totals: Partial<Record<ResourceId, number>> = { [resource]: baseStorage(resource, state) };
  accumulateStorageRows(state, snapshot, resource, totals, rows);
  // Each completed 空间撕裂者 raises the knowledge cap by 20% (passive, ignores funding).
  if (resource === 'knowledge') {
    const ripperCores = countRunningBuildings('spaceRipper', state);
    if (ripperCores) {
      const subtotal = totals[resource] || 0;
      const bonus = calculateRipperKnowledgeBonus(state, snapshot) * ripperCores;
      totals[resource] = subtotal * (1 + bonus);
      rows.push({ name: '空间撕裂者', value: subtotal * bonus });
    }
  }
  return { rows, total: totals[resource]! };
}

/** All resource caps in one shared building pass; totals match calculateStorageDetails exactly. */
export function calculateStorageTotals(state: GameState, snapshot: StorageSnapshot): Record<ResourceId, number> {
  const totals: Partial<Record<ResourceId, number>> = {};
  for (const resource of Object.keys(RESOURCES) as ResourceId[]) {
    totals[resource] = RESOURCES[resource].crafted ? Infinity : baseStorage(resource, state);
  }
  // One shared building pass covers every resource whose contributions are
  // resource-independent; cash replays separately (exchange interest scales its rows
  // subtotal), and e710 replays because its container/warehouse counts are funded units.
  accumulateStorageRows(state, snapshot, null, totals, null);
  totals.cash = RESOURCES.cash.cap;
  accumulateStorageRows(state, snapshot, 'cash', totals, null, 'cash');
  if (state.buildings.e710Container || state.buildings.e710Warehouse) {
    const supportUnits = snapshot.e710ContainerUnits ?? calculateSupportPreview(state).e710ContainerUnits;
    const warehouseUnits = snapshot.e710WarehouseUnits ?? calculateSupportPreview(state).e710WarehouseUnits;
    if (supportUnits || warehouseUnits) {
      // Replay e710 the same way the detail path does: containers then warehouses
      // contribute their funded-unit bonuses to the e710 subtotal only.
      totals.e710 = RESOURCES.e710.cap;
      accumulateStorageRows(state, snapshot, 'e710', totals, null, 'e710');
    }
  }
  // CRISPR bonuses scale each resource's own subtotal, so replay them per resource
  // exactly as the detail path does: both bonuses scale the same pre-bonus subtotal.
  const crispr = calculateCrisprStorageBonus(state);
  if (crispr.particleBonus || crispr.casimirBonus) {
    for (const resource of Object.keys(RESOURCES) as ResourceId[]) {
      if (RESOURCES[resource].crafted || RESOURCES[resource].special) continue;
      const subtotal = totals[resource] || 0;
      totals[resource] = subtotal + subtotal * (crispr.particleBonus + crispr.casimirBonus);
    }
  }
  // 暗能量 multiplies the post-CRISPR subtotal independently (not added to the particle bonus).
  const darkBonus = calculateDarkEnergyStorageBonus(state);
  if (darkBonus) {
    for (const resource of Object.keys(RESOURCES) as ResourceId[]) {
      if (RESOURCES[resource].crafted || RESOURCES[resource].special) continue;
      totals[resource] = (totals[resource] || 0) * (1 + darkBonus);
    }
  }
  // Each completed 空间撕裂者 raises the knowledge cap by 20% (passive, ignores funding).
  // Same post-CRISPR subtotal as the detail row, so both paths agree exactly.
  const ripperCores = countRunningBuildings('spaceRipper', state);
  if (ripperCores) totals.knowledge = (totals.knowledge || 0) * (1 + calculateRipperKnowledgeBonus(state, snapshot) * ripperCores);
  return totals as Record<ResourceId, number>;
}
/** Drop only what a lowered cap can no longer hold, reporting whether anything was lost. */
export function clampResourcesToCaps(state: GameState, snapshot: StorageSnapshot): boolean {
  let lost = false;
  const totals = calculateStorageTotals(state, snapshot);
  for (const id of Object.keys(RESOURCES) as ResourceId[]) {
    if (state.resources[id] > totals[id]) { state.resources[id] = totals[id]; lost = true; }
  }
  return lost;
}
