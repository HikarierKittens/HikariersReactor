import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { RESOURCES } from '../src/data/resources';
import { createInitialState } from '../src/state/create-state';
import { settleQuantumCores } from '../src/simulation/quantum';
import { settlePowerPlants } from '../src/simulation/power';
import { allocateMoonSupport } from '../src/simulation/moon';
import { settleSpaceProduction } from '../src/simulation/space-settlement';
import { settleE710WarehousePower, settleResearchAndCulture } from '../src/simulation/power-consumers';
import { buildSettlementLedger, type SettlementLedger } from '../src/simulation/support-preview';
import { replaySettledPool } from '../src/simulation/pool-replay';
import { createMilestoneState } from './fixtures/milestones';
import type { GameState } from '../src/types/state';
import type { ResourceId } from '../src/types/economy';

/** Independent supply-first sequential settlers on a clone pool. */
function legacySequentialPool(state: GameState, ledger: SettlementLedger, dt: number, happiness: number) {
  const pool = { ...state.resources };
  const inputUnits: Record<string, number> = {}, outputs: Record<string, number> = {};
  const plants = settlePowerPlants(pool, dt, state);
  const aiSupercoreUnits = settleQuantumCores(state, pool, dt);
  inputUnits.aiSupercore = outputs.aiSupercore = aiSupercoreUnits;
  Object.assign(outputs, plants.outputs); Object.assign(inputUnits, plants.inputUnits);
  const space = settleSpaceProduction(state, pool, dt, happiness, plants.inputUnits.geothermalPlant || 0, plants.inputUnits.hydrogenPowerPlant || 0);
  Object.assign(inputUnits, space.inputs); Object.assign(outputs, space.outputs);
  const e710WarehouseUnits = settleE710WarehousePower(state, pool, dt);
  inputUnits.e710Warehouse = outputs.e710Warehouse = e710WarehouseUnits;
  const consumers = settleResearchAndCulture(state, pool, dt);
  Object.assign(inputUnits, consumers.inputs); Object.assign(outputs, consumers.outputs);
  return { pool, inputUnits, outputs, space, aiSupercoreUnits, e710WarehouseUnits, biologyUnits: consumers.biologyUnits, dataUnits: consumers.dataUnits };
}

const near = (actual: number, expected: number, message: string) => assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${message}: ${actual} vs ${expected}`);

function scenarios(): [string, GameState, number][] {
  const list: [string, GameState, number][] = [];
  const add = (label: string, state: GameState) => { for (const dt of [.2, 1]) list.push([`${label}@dt${dt}`, state, dt]); };
  add('fresh', createInitialState(CONFIG.version, 60, 0));
  for (const stage of ['moon', 'space', 'remote', 'beacon', 'postBeacon'] as const) {
    const state = createMilestoneState(stage);
    state.resources.energy = 4; state.resources.water = 1; // low-power stress
    add(stage, state);
  }
  const rich = createMilestoneState('postBeacon');
  Object.assign(rich.resources, { energy: 1e6, water: 1e5, helium3: 1e5, oil: 1e5, food: 1e5 });
  rich.buildings.ironMiningShip = 5; rich.buildings.hydrogenPowerPlant = 3; rich.buildings.e710Container = 4;
  rich.buildings.e710Warehouse = 2; rich.buildings.biologyLab = 3; rich.buildings.observatory = 2;
  rich.buildings.aiSupercore = 100; rich.buildings.broadcast = 2; rich.buildings.touristStation = 2;
  rich.stoppedBuildings.ironMiningShip = 1; rich.stoppedBuildings.biologyLab = 1;
  add('rich', rich);
  return list;
}

test('pool replay from the settlement ledger matches the sequential settlers exactly', () => {
  for (const [label, state, dt] of scenarios()) {
    const before = JSON.stringify(state);
    const ledger = buildSettlementLedger(state, dt);
    const happiness = 0.8621; // arbitrary actual-happiness value; outputs must follow it
    const expected = legacySequentialPool(state, ledger, dt, happiness);
    const replayed = replaySettledPool(state, ledger, dt, happiness);
    for (const id of Object.keys(RESOURCES) as ResourceId[]) {
      near(replayed.pool[id] ?? 0, expected.pool[id] ?? 0, `${label} pool.${id}`);
    }
    assert.deepEqual(replayed.inputUnits, expected.inputUnits, `${label} inputUnits`);
    assert.deepEqual(replayed.outputs, expected.outputs, `${label} outputs`);
    assert.equal(JSON.stringify(state), before, `${label} state mutated`);
  }
});
