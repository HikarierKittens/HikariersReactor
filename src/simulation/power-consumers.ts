import { calculateBuildingInput } from './building-production';
import { BUILDINGS } from '../data/buildings';
import { countRunningBuildings } from './housing';
import type { GameState } from '../types/state';
import type { ResourceAmounts, ResourceId } from '../types/economy';

/** Reserve complete powered warehouses; partial energy never grants partial capacity. */
export function settleE710WarehousePower(state: GameState, pool: ResourceAmounts, dt: number): number {
  const units = Math.min(countRunningBuildings('e710Warehouse', state), Math.floor((Math.max(0, pool.energy) + 1e-8) / (7 * dt)));
  pool.energy = Math.max(0, pool.energy - units * 7 * dt);
  return units;
}

export function settleResearchAndCulture(state: GameState, pool: ResourceAmounts, dt: number) {
  const inputs: Record<string, number> = {}, outputs: Record<string, number> = {};
  const biologyUnits = Math.min(countRunningBuildings('biologyLab', state), Math.floor((Math.max(0, pool.energy) + 1e-8) / (2 * dt)));
  inputs.biologyLab = outputs.biologyLab = biologyUnits;
  pool.energy = Math.max(0, pool.energy - biologyUnits * 2 * dt);
  const dataUnits = Math.min(countRunningBuildings('observatory', state), Math.floor((Math.max(0, pool.energy) + 1e-8) / (3 * dt)));
  inputs.observatory = outputs.observatory = dataUnits;
  pool.energy = Math.max(0, pool.energy - dataUnits * 3 * dt);
  // 实验室 requests 2 power per unit once 电力 is known, but the power is an
  // *upgrade* only: it raises that unit's knowledge capacity from 1000 to 2000.
  // 猫猫科学家 keep their jobs and output whether or not the lab is funded, so the
  // whole running count stays in `inputUnits.lab` while `labUnits` counts funded
  // upgrades only. It is funded after the data centre so this live path matches the
  // ledger/replay reservation order (biology → data → lab) under power scarcity.
  const labUnits = Math.min(countRunningBuildings('lab', state), Math.floor((Math.max(0, pool.energy) + 1e-8) / (2 * dt)));
  pool.energy = Math.max(0, pool.energy - labUnits * 2 * dt);
  inputs.lab = outputs.lab = countRunningBuildings('lab', state);
  for (const id of ['broadcast', 'touristStation'] as const) {
    const recipe = Object.entries(calculateBuildingInput(id, state)) as [ResourceId, number][];
    let actual = countRunningBuildings(id, state);
    for (const [resource, amount] of recipe) actual = Math.min(actual, Math.max(0, pool[resource]) / (amount * dt));
    inputs[id] = outputs[id] = actual;
    for (const [resource, amount] of recipe) pool[resource] = Math.max(0, pool[resource] - amount * actual * dt);
  }
  return { inputs, outputs, biologyUnits, labUnits, dataUnits };
}

/** Runs after factory maintenance; preserves the original upgrade priority. */
export function settleAutomationPower(state: GameState, pool: ResourceAmounts, dt: number) {
  let mixerUnits = 0, miningUnits = 0, coalMiningUnits = 0, lumberUnits = 0, quarryUnits = 0;
  if (state.tech.includes('cementMixer')) {
    mixerUnits = Math.min(countRunningBuildings('cementWorkshop', state), Math.max(0, pool.energy) / (2 * dt));
    pool.energy = Math.max(0, pool.energy - mixerUnits * 2 * dt);
  }
  if (state.tech.includes('automatedMining')) {
    miningUnits = Math.min(countRunningBuildings('mine', state), Math.max(0, pool.energy) / dt);
    pool.energy = Math.max(0, pool.energy - miningUnits * dt);
    coalMiningUnits = Math.min(countRunningBuildings('coalMine', state), Math.max(0, pool.energy) / dt);
    pool.energy = Math.max(0, pool.energy - coalMiningUnits * dt);
    // Gathering automation funds whole buildings only, after existing mining upgrades.
    lumberUnits = Math.min(countRunningBuildings('lumber', state), Math.floor((Math.max(0, pool.energy) + 1e-8) / dt));
    pool.energy = Math.max(0, pool.energy - lumberUnits * dt);
    quarryUnits = Math.min(countRunningBuildings('quarry', state), Math.floor((Math.max(0, pool.energy) + 1e-8) / dt));
    pool.energy = Math.max(0, pool.energy - quarryUnits * dt);
  }
  return { mixerUnits, miningUnits, coalMiningUnits, lumberUnits, quarryUnits, inputs: { cementMixer: mixerUnits, automatedMining: miningUnits, automatedCoalMining: coalMiningUnits, automatedLumber: lumberUnits, automatedQuarry: quarryUnits } };
}
