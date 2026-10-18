import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { calculateProduction } from '../src/simulation/production';
import { calculateBuildingInput, calculateWorkerCapacity, hasContinuousEnergyInput } from '../src/simulation/building-production';
import { settleAutomationPower } from '../src/simulation/power-consumers';
import { calculateResourceBreakdown, calculateResourceFactorRows } from '../src/simulation/resource-breakdown';
import { changeWorkerAssignment } from '../src/simulation/commands';
import { applyResearchSideEffects } from '../src/simulation/purchases';
import { isBuildingUnderworking } from '../src/vue/building-status';
import { supplyPower } from './support/power';

test('fractional automation payments never leave negative floating energy', () => {
  for (const id of ['cementWorkshop', 'mine', 'coalMine'] as const) {
    const s = createInitialState(CONFIG.version, 60, 0);
    s.tech.push('cementMixer', 'automatedMining'); s.buildings[id] = 1;
    for (const dt of [.2, .3, .7, 1]) for (const energy of [.1, .29, .57, .99]) {
      const pool = { ...s.resources, energy };
      settleAutomationPower(s, pool, dt);
      assert.ok(pool.energy >= 0, `${id}: ${pool.energy}`);
    }
  }
});

function gatheringState() {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.tech.push('tools');
  state.buildings.lumber = 2;
  state.buildings.quarry = 3;
  state.workers.lumber = 4;
  state.workers.quarry = 6;
  supplyPower(state, 100);
  return state;
}
function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should equal ${expected}`);
}

test('automatedMining gates gathering controls, energy expense, and the separate 5% multiplier', () => {
  const state = gatheringState();
  const manual = calculateProduction(state);
  assert.equal(hasContinuousEnergyInput('lumber', state), false);
  assert.equal(hasContinuousEnergyInput('quarry', state), false);
  assert.equal(manual.inputUnits.automatedLumber, 0);
  assert.equal(manual.inputUnits.automatedQuarry, 0);
  assert.deepEqual(manual.power, { generated: 100, used: 0, available: 100 });
  close(manual.rates.energy, 100);
  close(manual.rates.wood, 4 * 3 * 1.04);
  close(manual.rates.stone, 6 * 3 * 1.06);
  state.tech.push('automatedMining');
  const before = structuredClone(state);
  const powered = calculateProduction(state);
  assert.equal(hasContinuousEnergyInput('lumber', state), true);
  assert.equal(hasContinuousEnergyInput('quarry', state), true);
  assert.deepEqual(calculateBuildingInput('lumber', state), {});
  assert.deepEqual(calculateBuildingInput('quarry', state), {});
  assert.equal(powered.inputUnits.automatedLumber, 2);
  assert.equal(powered.inputUnits.automatedQuarry, 3);
  assert.deepEqual(powered.power, { generated: 100, used: 5, available: 95 });
  close(powered.rates.energy, 95);
  close(powered.rates.wood, manual.rates.wood * 1.1);
  close(powered.rates.stone, manual.rates.stone * 1.15);
  assert.deepEqual(state, before, 'preview must not mutate assignments or resources');
});

test('gathering automation funds only full units for every dt and leaves fractional reserves unused', () => {
  for (const dt of [.2, 1, 3]) {
    const state = gatheringState();
    state.tech.push('automatedMining');
    supplyPower(state, 3.75);
    const result = calculateProduction(state, dt);
    assert.equal(result.inputUnits.automatedLumber, 2);
    assert.equal(result.inputUnits.automatedQuarry, 1);
    assert.equal(result.power.generated, 3.75);
    assert.equal(result.power.used, 3);
    close(result.power.available, 3.75 - result.powerGrid.requested);
    close(result.rates.energy, 3.75 - result.powerGrid.requested);
    assert.equal(result.pool.energy, 0, 'electricity is a fixed budget, not stored');
    close(result.rates.wood, 4 * 3 * 1.04 * 1.1);
    close(result.rates.stone, 6 * 3 * 1.06 * 1.05);
    assert.equal(isBuildingUnderworking('lumber', state, result), false);
    assert.equal(isBuildingUnderworking('quarry', state, result), true);
    supplyPower(state, .75);
    const unfunded = calculateProduction(state, dt);
    assert.equal(unfunded.inputUnits.automatedLumber, 0);
    assert.equal(unfunded.inputUnits.automatedQuarry, 0);
    assert.equal(unfunded.power.used, 0);
    close(unfunded.power.generated, .75);
    close(unfunded.power.available, .75 - unfunded.powerGrid.requested);
    close(unfunded.rates.energy, .75 - unfunded.powerGrid.requested);
    close(unfunded.rates.wood, 4 * 3 * 1.04);
    close(unfunded.rates.stone, 6 * 3 * 1.06);
  }
});

test('automation preserves cement and mine priority before lumber and quarry', () => {
  const state = gatheringState();
  state.tech.push('automatedMining', 'cementMixer');
  state.buildings.cementWorkshop = 1;
  state.buildings.mine = 1;
  state.buildings.coalMine = 1;
  const pool = { ...state.resources, energy: 7.5 };
  const result = settleAutomationPower(state, pool, 1);
  assert.equal(result.mixerUnits, 1);
  assert.equal(result.miningUnits, 1);
  assert.equal(result.coalMiningUnits, 1);
  assert.equal(result.lumberUnits, 2);
  assert.equal(result.quarryUnits, 1);
  close(pool.energy, .5);
});

test('stopping gathering buildings disables automation only, retaining owned boosts and unlimited base jobs', () => {
  const state = gatheringState();
  state.tech.push('automatedMining');
  state.stoppedBuildings.lumber = 1;
  state.stoppedBuildings.quarry = 3;
  state.workers.lumber = 30;
  state.workers.quarry = 40;
  const result = calculateProduction(state);
  assert.equal(result.inputUnits.automatedLumber, 1);
  assert.equal(result.inputUnits.automatedQuarry, 0);
  assert.deepEqual(result.power, { generated: 100, used: 1, available: 99 });
  close(result.rates.energy, 99);
  close(result.rates.wood, 30 * 3 * 1.04 * 1.05);
  close(result.rates.stone, 40 * 3 * 1.06);
  assert.equal(isBuildingUnderworking('lumber', state, result), false);
  assert.equal(isBuildingUnderworking('quarry', state, result), false);
  state.buildings.lumber = state.buildings.quarry = 0;
  state.stoppedBuildings.lumber = state.stoppedBuildings.quarry = 0;
  const withoutBuildings = calculateProduction(state);
  close(withoutBuildings.rates.wood, 30 * 3);
  close(withoutBuildings.rates.stone, 40 * 3);
});

test('energy breakdown and child factors report funded gathering buildings without double expense', () => {
  const state = gatheringState();
  state.tech.push('automatedMining');
  const result = calculateProduction(state);
  const energy = calculateResourceBreakdown('energy', state, result);
  const lumber = energy.entries.find(e => e.id === 'automatedLumber');
  const quarry = energy.entries.find(e => e.id === 'automatedQuarry');
  assert.equal(lumber?.name, '自动化伐木场消耗');
  assert.equal(quarry?.name, '自动化采石场消耗');
  assert.equal(lumber?.value, -2);
  assert.equal(quarry?.value, -3);
  close(energy.net, result.rates.energy);
  for (const [resource, name, value, owned] of [
    ['wood', '供能伐木场', '+10%', '伐木场'],
    ['stone', '供能采石场', '+15%', '采石场'],
  ] as const) {
    const rows = calculateResourceFactorRows(resource, state, result).rows;
    const funded = rows.findIndex(row => row.name === name);
    assert.ok(funded > 0);
    assert.deepEqual(rows[funded], { name, value, child: true });
    const ownedRow = rows[funded - 1]; assert.ok(ownedRow);
    assert.equal(ownedRow.name, owned, 'funded factor follows the existing owned boost');
    const breakdown = calculateResourceBreakdown(resource, state, result);
    close(breakdown.net, result.rates[resource]);
  }
});

test('research defaults newly powered gathering buildings off without changing worker assignments', () => {
  const state = gatheringState();
  const previousTech = [...state.tech];
  state.tech.push('automatedMining');
  const effects = applyResearchSideEffects(state, 'automatedMining', previousTech);
  assert.ok(effects.poweredShutdown.includes('lumber'));
  assert.ok(effects.poweredShutdown.includes('quarry'));
  assert.equal(state.stoppedBuildings.lumber, 2);
  assert.equal(state.stoppedBuildings.quarry, 3);
  const result = calculateProduction(state);
  assert.equal(result.inputUnits.automatedLumber, 0);
  assert.equal(result.inputUnits.automatedQuarry, 0);
  assert.deepEqual(result.power, { generated: 100, used: 0, available: 100 });
  close(result.rates.energy, 100);
  close(result.rates.wood, 4 * 3 * 1.04);
  close(result.rates.stone, 6 * 3 * 1.06);
  assert.equal(state.workers.lumber, 4);
  assert.equal(state.workers.quarry, 6);
});

test('manual gathering worker assignments remain unlimited and independent of automation power and stops', () => {
  for (const automated of [false, true]) {
    const state = gatheringState();
    if (automated) state.tech.push('automatedMining');
    state.population = 80;
    supplyPower(state, 0);
    state.stoppedBuildings.lumber = 2;
    state.stoppedBuildings.quarry = 3;
    assert.equal(calculateWorkerCapacity('lumber', state), Infinity);
    assert.equal(calculateWorkerCapacity('quarry', state), Infinity);
    assert.equal(changeWorkerAssignment(state, 'lumber', 20), 20);
    assert.equal(changeWorkerAssignment(state, 'quarry', 20), 20);
    assert.equal(changeWorkerAssignment(state, 'lumber', -10), -10);
    const before = { ...state.workers };
    calculateProduction(state, .2);
    assert.deepEqual(state.workers, before);
    assert.equal(state.workers.lumber, 14);
    assert.equal(state.workers.quarry, 26);
  }
});
