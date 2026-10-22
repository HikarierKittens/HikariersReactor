import {
  UNIFICATION_ALLOY_CONTAINER_SLOTS, UNIFICATION_BANK_BONUS, UNIFICATION_CONTAINER_SLOTS,
  UNIFICATION_FUEL_DEPOT_BONUS, UNIFICATION_HANGAR_STORAGE_MULTIPLIER, UNIFICATION_WAREHOUSE_MULTIPLIER,
} from '../data/neighbors';
import { isWorldUnified } from './neighbors';
import type { BuildingId } from '../types/buildings';
import type { GameState } from '../types/state';

type TechOnly = Pick<GameState, 'tech'>;

/**
 * 世界统一's storage payoff, kept in one place because it is spread over two collectors:
 * `containers.ts` owns container slot counts, `storage-bonuses.ts` owns per-building capacity.
 *
 * These replaced a blanket +25% on every ordinary resource. The blanket multiplier raised every
 * cap for free, which made building storage pointless; these target the storage facilities so
 * the extra room arrives by owning them.
 */
export function unificationContainerSlots(state: TechOnly): number {
  return isWorldUnified(state) ? UNIFICATION_CONTAINER_SLOTS : 0;
}

export function unificationAlloyContainerSlots(state: TechOnly): number {
  return isWorldUnified(state) ? UNIFICATION_ALLOY_CONTAINER_SLOTS : 0;
}

/** Multiplier 世界统一 applies to the building's own resource capacity (1 = no bonus). */
export function unificationStorageMultiplierFor(id: BuildingId, state: TechOnly): number {
  if (!isWorldUnified(state)) return 1;
  if (id === 'hangar') return UNIFICATION_HANGAR_STORAGE_MULTIPLIER;
  if (id === 'warehouse' || id === 'storageHub') return UNIFICATION_WAREHOUSE_MULTIPLIER;
  return 1;
}

/** 燃料库 / 轨道燃料库 / 星系燃料库: applies to their 石油 / 氦-3 / 铀 capacity only. */
export function unificationFuelMultiplier(state: TechOnly): number {
  return isWorldUnified(state) ? 1 + UNIFICATION_FUEL_DEPOT_BONUS : 1;
}

/** 银行 / 猫咖 cash capacity. */
export function unificationCashMultiplier(state: TechOnly): number {
  return isWorldUnified(state) ? 1 + UNIFICATION_BANK_BONUS : 1;
}
