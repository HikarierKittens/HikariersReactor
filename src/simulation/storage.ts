import { calculateSupportPreview } from './support-preview';
import { calculateDigitalByteCapacity, type DigitalSupport } from './digital-world';
import { BUILDINGS } from '../data/buildings';
import { RESOURCES } from '../data/resources';
import { calculateStorageBonuses, calculateLabKnowledgeCapacity } from './storage-bonuses';
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
  digital?: DigitalSupport;
  stageThree?: { repeaters?: number; ports?: number; freight: number; civilian: number; iceShips?: number; asteroidBases?: number };
  e710ContainerUnits?: number;
  e710WarehouseUnits?: number;
  /** Funded 危险物质库 units: its capacity now follows the 10 电力 + 0.25 氘/s upkeep. */
  hazardousStorageUnits?: number;
  researchStationUnits?: number;
  blackHoleStationUnits?: number;
  biologyUnits: number;
  dataCenterUnits: number;
  /** Funded 实验室 units (powered AFTER 电力); each adds a further 1000 knowledge cap. */
  labUnits?: number;
  moonBaseUnits: number;
  moon: MoonSupport;
  asriel: AsrielSupport;
}
export interface StorageDetails { rows: { name: string; value: number }[]; total: number }

/** Legacy callers supply only part of the paid snapshot. Resolve missing support
 * lazily once per storage calculation, never cache across mutable state changes.
 * Supplied values (including zero) remain authoritative; the input is untouched.
 */
function withStorageSupportFallback(state: GameState, snapshot: StorageSnapshot): StorageSnapshot {
  let fallback: ReturnType<typeof calculateSupportPreview> | undefined;
  const support = () => fallback ??= calculateSupportPreview(state);
  return {
    ...snapshot,
    get digital() { return snapshot.digital ?? support().digital; },
    get stageThree() {
      if (!snapshot.stageThree) return support().stageThree;
      return {
        ...snapshot.stageThree,
        get ports() { return snapshot.stageThree!.ports ?? support().stageThree.ports; },
        get iceShips() { return snapshot.stageThree!.iceShips ?? support().stageThree.iceShips; },
        get asteroidBases() { return snapshot.stageThree!.asteroidBases ?? support().stageThree.asteroidBases; },
      };
    },
    get e710ContainerUnits() { return snapshot.e710ContainerUnits ?? support().e710ContainerUnits; },
    get e710WarehouseUnits() { return snapshot.e710WarehouseUnits ?? support().e710WarehouseUnits; },
    get hazardousStorageUnits() { return snapshot.hazardousStorageUnits ?? support().hazardousStorageUnits; },
    get labUnits() { return snapshot.labUnits ?? support().labUnits; },
    get researchStationUnits() { return snapshot.researchStationUnits ?? support().researchStationUnits; },
    get blackHoleStationUnits() { return snapshot.blackHoleStationUnits ?? support().blackHoleStationUnits; },
  };
}

/** Base capacity before any building: the resource's own cap. Electricity is a supply
 *  budget, not an inventory, so it never has storage. */
function baseStorage(resource: ResourceId): number {
  return resource === 'energy' ? 0 : RESOURCES[resource].cap;
}

function accumulateStorageRows(
  state: GameState, snapshot: StorageSnapshot, detailResource: ResourceId | null,
  totals: Partial<Record<ResourceId, number>> | null, rows: StorageDetails['rows'] | null,
  replayResource: ResourceId | null = null,
): void {
  const crispr = calculateCrisprStorageBonus(state);
  // The caller always supplies a withStorageSupportFallback-wrapped snapshot, so
  // every lazy `?? calculateSupportPreview(state)` here would be unreachable.
  const stageThree = snapshot.stageThree!;
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    const count = id === 'anchorFreightStation' ? (state.buildings[id] ? stageThree.freight : 0)
      : id === 'iceMiningShip' ? (state.buildings[id] ? stageThree.iceShips! : 0)
      : id === 'asteroidBase' ? (state.buildings[id] ? stageThree.asteroidBases! : 0)
      : id === 'civilianRouteStation' ? (state.buildings[id] ? stageThree.civilian : 0)
      : id === 'e710Container' ? (detailResource === 'e710' ? snapshot.e710ContainerUnits! : 0)
      : id === 'e710Warehouse' ? (detailResource === 'e710' ? snapshot.e710WarehouseUnits! : 0)
      : id === 'hazardousMaterialStorage' ? snapshot.hazardousStorageUnits!
      : id === 'moonBase' ? snapshot.moonBaseUnits
      : id === 'quantizedCompressionModule' ? (state.buildings[id] ? snapshot.digital!.compressionUnits : 0)
      : id === 'ethMiner' ? snapshot.digital!.minerUnits
      : id === 'biologyLab' ? snapshot.biologyUnits
      : id === 'observatory' ? snapshot.dataCenterUnits
      : id === 'moonObservatory' ? snapshot.moon.allocations.moonObservatory || 0
      : id === 'ecologicalDome' ? snapshot.asriel.allocations.ecologicalDome || 0
      : id === 'alienMaterialLab' ? snapshot.asriel.allocations.alienMaterialLab || 0
      : id === 'hyperspaceSpaceport' ? (state.buildings[id] ? stageThree.ports! : 0)
      : id === 'e710ResearchStation' ? (state.buildings[id] ? snapshot.researchStationUnits! : 0) : state.buildings[id];
    const freightMultiplier = id === 'anchorFreightStation' && count > 0
      ? calculateFreightCapacityMultiplier(state, stageThree.asteroidBases!, snapshot.digital!.dataCompressionUnits) : 1;
    const bonuses = calculateStorageBonuses(id, state, snapshot.moon, snapshot.asriel, snapshot.digital);
    const record = (resource: ResourceId, value: number) => {
      if (!value) return;
      // Batched replay passes record only the replayed resource's bonuses; every
      // other resource was already counted in the shared ordinary pass.
      if (replayResource && resource !== replayResource) return;
      if (totals) totals[resource] = (totals[resource] || 0) + value;
      if (rows && resource === detailResource) rows.push({ name: BUILDINGS[id].name + ' ×' + formatNumber(count), value });
    };
    for (const [resource, base] of Object.entries(bonuses) as [ResourceId, number][]) record(resource, base * count * freightMultiplier);
    // 实验室 is the one building whose per-unit capacity depends on funding:
    // calculateStorageBonuses reports the base row and this adds only the funded
    // difference through the shared helper, so every entry point agrees. The extra
    // row needs its own label: an identically-named second row was deduplicated in
    // the tooltip, which made the detail look like it never reacted to power.
    if (id === 'lab' && bonuses.knowledge && (!replayResource || replayResource === 'knowledge')) {
      const base = bonuses.knowledge * count;
      const total = calculateLabKnowledgeCapacity(state, count, snapshot.labUnits ?? 0);
      const extra = total - base;
      if (extra) {
        if (totals) totals.knowledge = (totals.knowledge || 0) + extra;
        if (rows && detailResource === 'knowledge') rows.push({ name: BUILDINGS[id].name + ' ×' + formatNumber(count) + '（供电）', value: extra });
      }
    }
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

/** Per completed 空间撕裂者: 20% plus 1% per funded 黑洞星际站. Callers pass an already-resolved snapshot. */
export function calculateRipperKnowledgeBonus(state: GameState, snapshot: Pick<StorageSnapshot, 'blackHoleStationUnits'>): number {
  const stations = state.buildings.blackHoleStation ? snapshot.blackHoleStationUnits ?? 0 : 0;
  return calculateRipperKnowledgeBonusValue(stations);
}

export function calculateStorageDetails(resource: ResourceId, state: GameState, snapshot: StorageSnapshot): StorageDetails {
  if (resource === 'energy') return { rows: [], total: 0 };
  snapshot = withStorageSupportFallback(state, snapshot);
  if (resource === 'bytes') {
    const digital = snapshot.digital!;
    const rows = [{ name: '基础储量', value: 10000 }];
    if (digital.quantumStorageUnits) rows.push({ name: '量子存储器 ×' + formatNumber(digital.quantumStorageUnits), value: digital.quantumStorageUnits * 10000 * (1 + .25 * digital.dataCompressionUnits) });
    if (digital.memoryUnits) rows.push({ name: '记忆核心 ×' + formatNumber(digital.memoryUnits), value: digital.memoryUnits * 50000 * (1 + .15 * digital.dataCompressionUnits) });
    // 字节 is a special resource with its own capacity formula, so it does not reach the
    // ordinary branch below; the prestige bonuses apply to it the same way they apply to
    // every other store. Both CRISPR rows scale the same pre-bonus subtotal, then 暗能量
    // multiplies the result — the same order calculateStorageTotals replays.
    const subtotal = rows.reduce((total, row) => total + row.value, 0);
    const crispr = calculateCrisprStorageBonus(state);
    const particle = subtotal * crispr.particleBonus;
    if (particle && crispr.particleUpgrade) rows.push({ name: CRISPR_UPGRADES[crispr.particleUpgrade].name, value: particle });
    const casimir = crispr.casimirBonus ? subtotal * crispr.casimirBonus : 0;
    if (casimir) rows.push({ name: CRISPR_UPGRADES.casimirEffect.name, value: casimir });
    // 暗能量 multiplies the post-CRISPR subtotal, matching pushDarkEnergyRow's order.
    const dark = calculateDarkEnergyStorageBonus(state);
    if (dark) {
      const scaled = rows.reduce((total, row) => total + row.value, 0) * dark;
      rows.push({ name: '暗能量加成', value: scaled });
    }
    return { rows, total: rows.reduce((total, row) => total + row.value, 0) };
  }
  if (resource === 'encryptedData') {
    const digital = snapshot.digital!;
    const extra = state.tech.includes('encryptedDataAnalysis') ? digital.memoryUnits * 25000 : 0;
    return { rows: [{ name: '基础储量', value: 50000 }, ...(extra ? [{ name: '记忆核心 ×' + formatNumber(digital.memoryUnits), value: extra }] : [])], total: 50000 + extra };
  }
  if (RESOURCES[resource].crafted) return { rows: [], total: Infinity };
  const rows: StorageDetails['rows'] = [{ name: '基础储量', value: baseStorage(resource) }];
  const totals: Partial<Record<ResourceId, number>> = { [resource]: baseStorage(resource) };
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
  snapshot = withStorageSupportFallback(state, snapshot);
  const totals: Partial<Record<ResourceId, number>> = {};
  for (const resource of Object.keys(RESOURCES) as ResourceId[]) {
    totals[resource] = RESOURCES[resource].crafted ? Infinity : baseStorage(resource);
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
  // 字节 has its own capacity formula and is excluded from the ordinary passes above,
  // so apply the same prestige bonuses here in the same order: both CRISPR bonuses on
  // the raw subtotal, then 暗能量 multiplying the result. encryptedData stays exempt.
  const byteBase = calculateDigitalByteCapacity(snapshot.digital!);
  const byteCrispr = crispr.particleBonus + crispr.casimirBonus;
  totals.bytes = byteBase * (1 + byteCrispr) * (1 + darkBonus);
  totals.encryptedData = 50000 + (state.tech.includes('encryptedDataAnalysis') ? snapshot.digital!.memoryUnits * 25000 : 0);
  // Electricity is instantaneous supply; no storage source or multiplier may
  // turn this retained formula resource ID back into an inventory.
  totals.energy = 0;
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
