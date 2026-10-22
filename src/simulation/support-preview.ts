import { settlePowerPlants, calculatePowerBudget, type PowerBudget } from './power';
import { calculatePowerGrid, type PowerGrid } from './power-grid';
import { settleDigitalSupport, type DigitalSupport } from './digital-world';
import { settleQuantumCores } from './quantum';
import { settleSpaceProduction } from './space-settlement';
import { allocateShipCrew, type ShipCrew } from './ship-crew';
import { settleE710WarehousePower } from './power-consumers';
import type { MoonSupport } from './moon';
import type { GameState } from '../types/state';
import type { ResourceAmounts, AsrielSupport } from '../types/economy';

import type { StageThreeSupport } from './stage-three-support';
export interface SupportPreview {
  /** Budget remaining at this support-preview boundary, in fixed power units. */
  power: PowerBudget;
  digital: DigitalSupport;
  stageThree: StageThreeSupport;
  pool: ResourceAmounts;
  moon: MoonSupport;
  asriel: AsrielSupport;
  biologyUnits: number;
  dataCenterUnits: number;
  /** Funded 实验室 units; each adds a second 1000 knowledge cap after 电力. */
  labUnits: number;
  waystations: number;
  e710ContainerUnits: number;
  e710WarehouseUnits: number;
  aiSupercoreUnits: number;
  metalRefineryUnits: number;
  /** Funded outer-system mining ships, matching the production settlement inputs. */
  ironMiningShips: number;
  /** 采矿船操作员: crew taken from the idle population by the enabled mining ships. */
  shipCrew: ShipCrew;
  /** Whole funded 710研究站 units (knowledge storage). */
  researchStationUnits: number;
  /** Whole funded 危险物质库 units: its E-710/中子 capacity now follows its upkeep. */
  hazardousStorageUnits: number;
  /** Whole funded 黑洞星际站 units (raise the 空间撕裂者 knowledge-cap effect). */
  blackHoleStationUnits: number;
}

/**
 * The one paid settlement per (state, dt, quantumLevel): power plants, quantum
 * cores, waystations, lunar/Asriel/stage-three maintenance, e710 warehouse and
 * research units are derived exactly once. The support preview consumes the
 * unit counts; the production tick consumes the same units through its own
 * pool flow, which must never observe this scratch pool.
 */
export interface SettlementLedger extends SupportPreview {
  grid: PowerGrid;
  /** Space settlement inputs/outputs captured at happiness=1. */
  space: ReturnType<typeof settleSpaceProduction>;
  /** Raw power-plant settlement captured before the space chain (units + energy). */
  plants: ReturnType<typeof settlePowerPlants>;
}

/**
 * Read-only reservation using the production settlements in their exact order.
 * Space source maintenance must be included before powered storage/research;
 * otherwise low-power previews can grant capacity that production cannot run.
 */
export function calculateSupportPreview(state: GameState, dt = 1, quantumLevel?: number): SupportPreview {
  return buildSettlementLedger(state, dt, quantumLevel);
}

/** Shared single settlement: also returns the raw space settlement for production. */
export function buildSettlementLedger(state: GameState, dt = 1, quantumLevel?: number): SettlementLedger {
  if (!Number.isFinite(dt) || dt <= 0) throw new RangeError('dt must be positive and finite');
  const pool = { ...state.resources };
  // Supply first, then reserve AI cores before every other consumer.
  const plants = settlePowerPlants(pool, dt, state, quantumLevel);
  const grid = calculatePowerGrid(state, dt, quantumLevel ?? 0, plants.energy);
  state = grid.state;
  const aiSupercoreUnits = settleQuantumCores(state, pool, dt);
  const digital = settleDigitalSupport(state, pool, dt);
  // Happiness only scales ordinary space outputs, never power or maintenance.
  // The caller's iterated quantum level also reaches the space chain, so the graphene
  // bonus (高级石墨烯加工) reflects the same level this ledger reports instead of
  // solving quantum again from inside its own settlement.
  const space = settleSpaceProduction(state, pool, dt, 1, plants.inputUnits.hydrogenPowerPlant || 0, quantumLevel ?? 0);
  const e710WarehouseUnits = settleE710WarehousePower(state, pool, dt);
  const biologyRunning = Math.max(0, (state.buildings.biologyLab || 0) - (state.stoppedBuildings?.biologyLab || 0));
  const biologyUnits = Math.min(biologyRunning, Math.floor((Math.max(0, pool.energy) + 1e-8) / (2 * dt)));
  pool.energy = Math.max(0, pool.energy - biologyUnits * 2 * dt);
  const dataRunning = Math.max(0, (state.buildings.observatory || 0) - (state.stoppedBuildings?.observatory || 0));
  const dataCenterUnits = Math.min(dataRunning, Math.floor((Math.max(0, pool.energy) + 1e-8) / (3 * dt)));
  // 实验室 consumes 2 power per funded unit once 电力 is known. Reserve the data
  // centre first so this count matches the replay order (biology → data → lab),
  // without changing the published boundary pool, which excludes observatories.
  const labRunning = Math.max(0, (state.buildings.lab || 0) - (state.stoppedBuildings?.lab || 0));
  const labPool = Math.max(0, pool.energy - dataCenterUnits * 3 * dt);
  const labUnits = state.tech.includes('electricity')
    ? Math.min(labRunning, Math.floor((labPool + 1e-8) / (2 * dt))) : 0;
  // Preserve the research-power API: pool reserves biology but not observatories.
  const result = {
    power: { ...calculatePowerBudget(plants.energy, pool.energy, dt), available: grid.available },
    digital,
    stageThree: space.stageThree,
    pool, moon: space.moon, asriel: space.asriel, metalRefineryUnits: space.metalRefineryUnits,
    biologyUnits, dataCenterUnits, labUnits,
    waystations: space.inputs.spaceWaystation || 0,
    e710ContainerUnits: space.e710ContainerUnits, e710WarehouseUnits, aiSupercoreUnits,
    ironMiningShips: space.inputs.ironMiningShip || 0,
    shipCrew: allocateShipCrew(state),
    researchStationUnits: space.inputs.e710ResearchStation || 0,
    hazardousStorageUnits: space.inputs.hazardousMaterialStorage || 0,
    blackHoleStationUnits: space.inputs.blackHoleStation || 0,
    space,
    plants,
  } as SettlementLedger;
  // Internal effective state must not leak into serialized/public support snapshots.
  Object.defineProperty(result, 'grid', { value: grid });
  return result;
}
