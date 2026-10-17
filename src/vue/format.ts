import { formatNumber, floorWithPrecision } from '../shared/format';
import { calculateHousingDetails } from '../simulation/housing';
import { calculateStorageDetails } from '../simulation/storage';
import { uiPreview } from './preview-cache';
import { previewMorale } from '../simulation/production';
import { calculateSupportPreview } from '../simulation/support-preview';
import { isResourceUnlocked, isBuildingUnlocked, isTechnologyUnlocked } from '../simulation/unlocks';
import type { GameState } from '../types/state';
import type { ResourceId } from '../types/economy';
import type { StorageSnapshot } from '../simulation/storage';
import type { DeepReadonly } from '../shared/readonly';

export function fmt(n: number): string {
  return formatNumber(n);
}

export function duration(s: number): string {
  s = Math.max(0, Math.floor(s));
  if (s >= 3600) return `${fmt(Math.floor(s / 3600))} h ${Math.floor((s % 3600) / 60)} min`;
  if (s >= 60) return `${Math.floor(s / 60)} min ${s % 60} s`;
  return `${s} s`;
}

export function percent(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
}

/** Display-only storage snapshot: identical reservations to the settlement tick. */
export function storageSnapshot(state: GameState, dt: number = 1, revision?: number): DeepReadonly<StorageSnapshot> {
  const { moon, asriel, biologyUnits, dataCenterUnits, e710ContainerUnits, e710WarehouseUnits, researchStationUnits, blackHoleStationUnits, stageThree, digital } = revision === undefined ? calculateSupportPreview(state, dt) : uiPreview.support(state, revision, dt);
  return { biologyUnits, dataCenterUnits, moonBaseUnits: moon.baseUnits, moon, asriel, e710ContainerUnits, e710WarehouseUnits, researchStationUnits, blackHoleStationUnits, stageThree, digital };
}

export function storageCap(resource: ResourceId, state: GameState, revision?: number): number {
  return calculateStorageDetails(resource, state, storageSnapshot(state, 1, revision)).total;
}

export function housingCapacity(state: GameState, revision?: number): number {
  const snapshot = revision === undefined ? calculateSupportPreview(state) : uiPreview.support(state, revision);
  return calculateHousingDetails(state, snapshot.asriel, snapshot.stageThree, snapshot.digital)
    .reduce((sum, row) => sum + row.value, 0);
}

export function capacity(state: GameState, revision?: number): number {
  return floorWithPrecision(housingCapacity(state, revision));
}

/** Live lunar support balance, from the same allocation the settlement tick uses. */
export function moonSnapshot(state: GameState, dt: number = 1, revision?: number) {
  return (revision === undefined ? calculateSupportPreview(state, dt) : uiPreview.support(state, revision, dt)).moon;
}

/** Display-only morale snapshot sharing settlement's power reservations. */
export function moraleSnapshot(state: GameState, dt: number = 1, revision?: number) {
  return revision === undefined ? previewMorale(state, dt) : uiPreview.production(state, revision, dt).morale;
}

export function resourceUnlocked(id: string, state: GameState): boolean {
  return isResourceUnlocked(id, state);
}

export function buildingUnlocked(id: string, state: GameState): boolean {
  return isBuildingUnlocked(id, state);
}

export function techUnlocked(id: string, state: GameState): boolean {
  return isTechnologyUnlocked(id, state);
}

export function clickMultiplier(event: MouseEvent | KeyboardEvent): number {
  return (event.ctrlKey ? 10 : 1) * (event.shiftKey ? 25 : 1) * (event.altKey ? 100 : 1);
}

export function orderedCostEntries(cost: Record<string, number>): [string, number][] {
  const priority = (id: string): number => id === 'cash' ? 0 : id === 'knowledge' ? 1 : 2;
  return Object.entries(cost).sort(([a], [b]) => priority(a) - priority(b));
}
