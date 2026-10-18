import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { calculateProduction, previewMorale } from '../src/simulation/production';
import { buildSettlementLedger } from '../src/simulation/support-preview';
import { replaySettledPool } from '../src/simulation/pool-replay';
import { settlePowerPlants } from '../src/simulation/power';
import { advanceGameTick } from '../src/simulation/tick';
import { calculateMorale } from '../src/simulation/morale';
import { calculatePoweredWaystations } from '../src/simulation/space-fuel';

test('direct morale fallback ignores saved electricity', () => {
  const state = fresh();
  state.buildings.broadcast = 1;
  state.resources.energy = 100000;
  const result = calculateMorale(state, .2, { generatorEnergy: 0, generatorSpeed: 0, coalRatio: 1, moonBaseUnits: 0, biologyUnits: 0, dataCenterUnits: 0 });
  assert.equal(result.broadcast, 0);
  assert.equal(result.powerUsed, 0);
});

test('direct fuel preview reserves cores and digital before waystation power', () => {
  const state = fresh();
  state.buildings.solarSatellite = 22;
  state.buildings.aiSupercore = 100;
  state.resources.helium3 = 10000;
  state.resources.energy = 1000000;
  state.buildings.softRouterNode = 1;
  state.buildings.spaceWaystation = 2;
  for (const dt of [.2, 1, 3]) {
    assert.equal(calculatePoweredWaystations(state, undefined, dt), 0);
    assert.equal(buildSettlementLedger(state, dt).waystations, 0);
  }
  state.stoppedBuildings.softRouterNode = 1;
  assert.equal(calculatePoweredWaystations(state), 2);
  assert.equal(buildSettlementLedger(state).waystations, 2);
});

const fresh = () => createInitialState(CONFIG.version, 60, 0);
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('saved energy never funds production, support, or morale', () => {
  const empty = fresh();
  empty.buildings.biologyLab = 2;
  empty.buildings.observatory = 2;
  empty.buildings.gatewayRouter = 1;
  const stocked = structuredClone(empty);
  stocked.resources.energy = 1e12;
  for (const dt of [.2, 1, 4]) {
    assert.deepEqual(calculateProduction(stocked, dt), calculateProduction(empty, dt));
    assert.deepEqual(buildSettlementLedger(stocked, dt), buildSettlementLedger(empty, dt));
    assert.deepEqual(previewMorale(stocked, dt), previewMorale(empty, dt));
    assert.equal(calculateProduction(stocked, dt).inputUnits.biologyLab, 0);
  }
  assert.equal(stocked.resources.energy, 1e12, 'previews must not mutate saved data');
});

test('fixed generation and priority allocations do not scale with dt', () => {
  const state = fresh();
  state.buildings.solarSatellite = 1; // fixed +5
  state.buildings.biologyLab = 2; // first -4
  state.buildings.observatory = 1; // cannot fund -3
  for (const dt of [.1, .2, 1, 5]) {
    const result = calculateProduction(state, dt);
    near(result.power.generated, 5);
    near(result.power.used, 4);
    near(result.power.available, 1);
    assert.equal(result.inputUnits.biologyLab, 2);
    assert.equal(result.inputUnits.observatory, 0);
    near(result.rates.energy, 1);
    assert.equal(result.pool.energy, 0);
    const ledger = buildSettlementLedger(state, dt);
    near(replaySettledPool(state, ledger, dt, result.morale.happiness).pool.energy, dt);
  }
});

test('AI supercores receive newly generated power before digital consumers', () => {
  const state = fresh();
  state.buildings.solarSatellite = 20; // +100
  state.buildings.aiSupercore = 100; // one complete segmented core, -100
  state.buildings.gatewayRouter = 1;
  state.resources.helium3 = 1000;
  for (const dt of [.2, 1, 2]) {
    const result = calculateProduction(state, dt);
    assert.equal(result.inputUnits.aiSupercore, 1);
    assert.equal(result.digital.gatewayUnits, 0);
    assert.deepEqual(result.power, { generated: 100, used: 100, available: 0 });
    near(result.rates.helium3, -25);
    assert.equal(buildSettlementLedger(state, dt).aiSupercoreUnits, 1);
  }
});

test('power plants reset scratch supply but their non-energy fuel still scales with dt', () => {
  const state = fresh();
  state.buildings.hydrogenPowerPlant = 2;
  state.resources.water = 100;
  state.resources.energy = 999999;
  for (const dt of [.2, 1, 3]) {
    const pool = { ...state.resources };
    const plants = settlePowerPlants(pool, dt, state);
    near(plants.energy, 70);
    near(pool.energy, 70 * dt);
    near(pool.water, 100 - 4 * dt);
  }
});

test('ticks discard unused supply instead of accumulating an energy inventory', () => {
  const state = fresh();
  state.buildings.solarSatellite = 2;
  state.resources.energy = 123456;
  const hooks = { happiness: () => 1, capacity: () => 100, event: () => {}, projects: () => {}, purchases: () => {}, unlocks: () => {} };
  for (const dt of [.2, 1, 3]) {
    advanceGameTick(state, dt, hooks);
    assert.equal(state.resources.energy, 0);
    assert.deepEqual(calculateProduction(state).power, { generated: 10, used: 0, available: 10 });
  }
});
