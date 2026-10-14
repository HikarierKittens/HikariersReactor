import { RESOURCES } from '../data/resources';
import type { ResourceAmounts, ResourceId } from '../types/economy';
import type { BlackHoleState, GameState } from '../types/state';

/** Initial black-hole mass; the 引力转化 bonus counts only mass above this. */
export const BLACK_HOLE_INITIAL_MASS = 10;
/** Exotic mass that triggers the unstable quantum excitation event. */
export const BLACK_HOLE_UNSTABLE_EXOTIC = .025;
/** 稳定黑洞 converts exotic mass into ordinary mass at this ratio. */
export const BLACK_HOLE_STABILIZE_RATIO = 40;
/** Neutrons thrown in by 稳定黑洞 (also its research cost). */
export const BLACK_HOLE_STABILIZE_NEUTRONS = 100000;
/** Ejection capacity (units/s) per funded 质量喷射器. */
export const MASS_EJECTOR_CAPACITY = 1000;
/** 引力转化: Penrose sphere energy per ordinary mass above 10, and per exotic mass. */
export const GRAVITY_ENERGY_PER_MASS = 5;
export const GRAVITY_ENERGY_PER_EXOTIC = 50;
export const BLACK_HOLE_UNSTABLE_LOG = '黑洞被发现不稳定量子激发态，科学家提出了新的研究方案';
export const MASS_EJECTION_UNLOCK_LOG = '资源管理中解锁了新的面板';

/** Mass per ejected unit, roughly proportional to molecular weight (×1e-8).
 * Crafted goods weigh about as much as their recipe inputs. */
export const EJECTION_MASSES: Partial<Record<ResourceId, number>> = {
  deuterium: .00000002, helium3: .00000003, coal: .00000012, nanotubes: .00000012, graphene: .00000012,
  water: .00000018, fur: .0000002, wood: .0000003, food: .0000003, polymer: .0000003, aluminum: .00000027,
  titanium: .00000048, iron: .00000056, metal: .00000058, stone: .0000006, alloy: .0000006, copper: .00000064,
  oil: .00000114, cement: .0000012, iridium: .00000192, uranium: .00000238, adamantite: .000003, neutron: .00001,
  aerogel: .000001, metalPlate: .0000027, plank: .000003, wroughtIron: .0000056, brick: .000006, mithril: .0000192,
};
/** Exotic matter only adds exotic mass. */
export const EXOTIC_EJECTION_MASSES: Partial<Record<ResourceId, number>> = { e710: .0000005, nanoAlloy: .00000002 };

export function createBlackHoleState(): BlackHoleState {
  return { mass: BLACK_HOLE_INITIAL_MASS, exoticMass: 0, unstable: false, ejection: {} };
}

/** Ordinary resources except cash, plus crafted goods; never energy or knowledge. */
export function isEjectableResource(id: string): id is ResourceId {
  if (!Object.hasOwn(RESOURCES, id) || id === 'cash') return false;
  const resource = RESOURCES[id as ResourceId];
  return !resource.special || !!resource.crafted;
}
export function isExoticResource(id: ResourceId): boolean {
  return Object.hasOwn(EXOTIC_EJECTION_MASSES, id);
}
export function ejectionMass(id: ResourceId): number {
  return EXOTIC_EJECTION_MASSES[id] ?? EJECTION_MASSES[id] ?? 0;
}

/** Built capacity: allocations are limited by owned ejectors, not by their power state. */
export function calculateEjectionCapacity(state: Pick<GameState, 'buildings'>): number {
  return MASS_EJECTOR_CAPACITY * (state.buildings.massEjector || 0);
}
export function calculateAllocatedEjection(state: Pick<GameState, 'blackHole'>): number {
  return Object.values(state.blackHole.ejection).reduce((sum, value) => sum + (value || 0), 0);
}

/** Change one allocation; the total never exceeds the built capacity. */
export function changeEjectionAllocation(state: GameState, id: string, delta: number): boolean {
  if (!isEjectableResource(id) || !Number.isFinite(delta) || delta === 0) return false;
  const current = state.blackHole.ejection[id] || 0;
  const free = Math.max(0, calculateEjectionCapacity(state) - calculateAllocatedEjection(state));
  const next = Math.max(0, Math.min(current + delta, current + free));
  if (next === current) return false;
  if (next > 0) state.blackHole.ejection[id] = next;
  else delete state.blackHole.ejection[id];
  return true;
}

/** Withdraw ejected resources from the working pool; returns actual units/s per resource.
 * Funded ejectors scale every allocation down proportionally when power is short. */
export function settleMassEjection(state: GameState, pool: ResourceAmounts, dt: number, fundedEjectors: number): Partial<Record<ResourceId, number>> {
  const ejected: Partial<Record<ResourceId, number>> = {};
  const allocated = calculateAllocatedEjection(state);
  if (!allocated || !fundedEjectors || dt <= 0) return ejected;
  const factor = Math.min(1, MASS_EJECTOR_CAPACITY * fundedEjectors / allocated);
  for (const [id, rate] of Object.entries(state.blackHole.ejection) as [ResourceId, number][]) {
    if (!rate || !isEjectableResource(id)) continue;
    const taken = Math.min(rate * factor * dt, Math.max(0, pool[id] || 0));
    if (taken <= 0) continue;
    pool[id] -= taken;
    ejected[id] = taken / dt;
  }
  return ejected;
}

/** Mass gained per second from an ejection result. */
export function calculateEjectedMassRate(ejected: Partial<Record<ResourceId, number>>): { mass: number; exoticMass: number } {
  let mass = 0, exoticMass = 0;
  for (const [id, rate] of Object.entries(ejected) as [ResourceId, number][]) {
    if (isExoticResource(id)) exoticMass += rate * ejectionMass(id);
    else mass += rate * ejectionMass(id);
  }
  return { mass, exoticMass };
}

/** Apply settled ejection to the black hole; returns true when it just became unstable. */
export function applyMassEjection(state: GameState, ejected: Partial<Record<ResourceId, number>>, dt: number): boolean {
  const rate = calculateEjectedMassRate(ejected);
  state.blackHole.mass += rate.mass * dt;
  state.blackHole.exoticMass += rate.exoticMass * dt;
  if (!state.blackHole.unstable && state.blackHole.exoticMass >= BLACK_HOLE_UNSTABLE_EXOTIC - 1e-12) {
    state.blackHole.unstable = true;
    return true;
  }
  return false;
}

/** 稳定黑洞: exotic ×40 plus the thrown-in neutrons become ordinary mass; exotic resets. */
export function stabilizeBlackHole(state: GameState): void {
  const hole = state.blackHole;
  hole.mass += hole.exoticMass * BLACK_HOLE_STABILIZE_RATIO + BLACK_HOLE_STABILIZE_NEUTRONS * ejectionMass('neutron');
  hole.exoticMass = 0;
  hole.unstable = false;
}

/** 引力转化 bonus for the whole Penrose sphere (not per segment). */
export function calculateGravityConversionEnergy(state: Pick<GameState, 'tech' | 'blackHole'>): number {
  if (!state.tech.includes('gravityConversion')) return 0;
  return Math.max(0, state.blackHole.mass - BLACK_HOLE_INITIAL_MASS) * GRAVITY_ENERGY_PER_MASS
    + Math.max(0, state.blackHole.exoticMass) * GRAVITY_ENERGY_PER_EXOTIC;
}

/** 暗能量 from 黑洞重置: 1 + 1.5·√(mass above 10 + 40×exotic), soft-capped at 10 (×0.25 beyond), at least 1. */
export const DARK_ENERGY_SOFT_CAP = 10;
export function calculateDarkEnergyReward(state: Pick<GameState, 'blackHole'>): number {
  const effective = Math.max(0, state.blackHole.mass - BLACK_HOLE_INITIAL_MASS) + Math.max(0, state.blackHole.exoticMass) * BLACK_HOLE_STABILIZE_RATIO;
  const raw = 1 + 1.5 * Math.sqrt(effective);
  return Math.max(1, Math.floor(raw <= DARK_ENERGY_SOFT_CAP ? raw : DARK_ENERGY_SOFT_CAP + (raw - DARK_ENERGY_SOFT_CAP) * .25));
}

/** Fixed 8-decimal display used for black-hole masses. */
export function formatBlackHoleMass(value: number): string {
  return value.toFixed(8);
}
