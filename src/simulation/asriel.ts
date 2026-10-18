import { calculateSpaceFuelMultiplier } from './space-fuel';
import type { BuildingId } from '../types/buildings';
import type { AsrielSupportedBuilding, AsrielSupport, ResourceAmounts } from '../types/economy';
import type { GameState } from '../types/state';

type SupportState = Pick<GameState, 'buildings' | 'stoppedBuildings'>;
const priority: readonly AsrielSupportedBuilding[] = ['asrielResidence', 'asrielMine', 'ecologicalDome', 'planetaryFoundry', 'alienMaterialLab', 'vrCenter'];

/** Caller supplies the available pool after power generation and lunar maintenance. */
export function allocateAsrielSupport(state: GameState, resources: ResourceAmounts, dt: number, waystations = 0, fuelMultiplier = calculateSpaceFuelMultiplier(state)): AsrielSupport {
  if (!Number.isFinite(dt) || dt <= 0) throw new RangeError('dt must be positive and finite');
  if (!Number.isFinite(fuelMultiplier) || fuelMultiplier <= 0) throw new RangeError('fuel multiplier must be positive and finite');
  for (const resource of ['energy', 'helium3', 'food'] as const) {
    if (!Number.isFinite(resources[resource])) throw new RangeError(`${resource} funding must be finite`);
  }
  // A deficit funds zero units, never negative maintenance or negative support.
  const running = (id: BuildingId): number => Math.max(0, (state.buildings[id] || 0) - (state.stoppedBuildings[id] || 0));
  const ports = Math.min(running('asrielSpaceport'), Math.floor((Math.max(0, resources.helium3) + 1e-8) / (2 * fuelMultiplier * dt)),
    Math.floor(Math.max(0, resources.energy) / (5 * dt)), Math.floor(Math.max(0, resources.food) / (25 * dt)));
  // Port maintenance has priority. The caller has not deducted it yet;
  // reserve it locally without mutating the shared resource pool.
  const towerEnergy = Math.max(0, (resources.energy || 0) - ports * 5 * dt);
  const towers = Math.min(running('asrielControlTower'), Math.floor((towerEnergy + 1e-8) / (2 * dt)));
  const capacity = ports * 4 + towers;
  let available = capacity;
  const allocations: Record<AsrielSupportedBuilding, number> = { asrielResidence: 0, asrielMine: 0, ecologicalDome: 0, planetaryFoundry: 0, alienMaterialLab: 0, vrCenter: 0 };
  for (const id of priority) {
    allocations[id] = Math.min(running(id), available);
    available -= allocations[id];
  }
  return { ports, towers, capacity, used: capacity - available, available, allocations, priority, support: capacity };
}

export function countAsrielResidents(state: Pick<GameState, 'population' | 'workers'>, support: AsrielSupport): number {
  return Math.min(state.population, state.workers.asrielResidence || 0, (support.allocations.asrielResidence || 0) * 2);
}

export function isSpaceResourceSource(id: string): boolean {
  // 遥远星际 (hyperspace and alpha-region) ordinary producers also count as space resources.
  return ['iridiumMine', 'helium3Mine', 'asrielMine', 'ecologicalDome', 'atmosphericCollector', 'talosMoonMiningStation', 'iridiumMiningShip', 'ironMiningShip', 'e710MiningShip', 'oilExtractor',
    'iceMiningShip', 'comprehensiveMiningFacility', 'gasCloudMiningShip', 'highTechFarmPlatform', 'metalMiningShip', 'fuelMiningShip', 'adamantiteMiningShip', 'grapheneFactory'].includes(id);
}

export function calculateSpaceMultiplier(id: string, state: Pick<GameState, 'population' | 'workers' | 'buildings' | 'tech'>, support: AsrielSupport): number {
  // Ring bonuses apply only at resource sources, never again to downstream production.
  // Stations are permanently active; laboratories must have remaining Asriel support.
  if (!isSpaceResourceSource(id)) return 1;
  const coefficient = state.tech.includes('starRingOptimization')
    ? .006 + .0001 * (support.allocations.alienMaterialLab || 0)
    : .005;
  return 1 + coefficient * (state.buildings.starRingStation || 0) * countAsrielResidents(state, support);
}
