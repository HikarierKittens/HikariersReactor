import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { calculatePowerGrid, setBuildingPowerEnabled } from '../src/simulation/power-grid';
import { calculateProduction } from '../src/simulation/production';
import { buildSettlementLedger } from '../src/simulation/support-preview';
const fresh = () => createInitialState(CONFIG.version, 60, 0);

test('last-enabled batches fail only excess whole units, recover without changing user switches', () => {
  const s = fresh();
  s.buildings.solarSatellite = 1; // 5
  s.buildings.biologyLab = 3; // 6
  s.powerActivationOrder = [{ id: 'biologyLab', count: 3 }];
  const before = structuredClone(s);
  const grid = calculatePowerGrid(s);
  assert.equal(grid.available, -1);
  assert.equal(grid.allocated.biologyLab, 2);
  assert.equal(grid.failed.biologyLab, 1);
  assert.equal(grid.used, 4);
  assert.deepEqual(s, before);
  for (const dt of [.2, 1, 3]) {
    const result = calculateProduction(s, dt);
    assert.equal(result.power.available, -1);
    assert.equal(result.inputUnits.biologyLab, 2);
    assert.equal(result.power.used, 4);
    assert.equal(buildSettlementLedger(s, dt).biologyUnits, 2);
  }
  s.buildings.solarSatellite = 2;
  assert.equal(calculateProduction(s).inputUnits.biologyLab, 3);
  assert.equal(calculatePowerGrid(s).failed.biologyLab, undefined);
  assert.equal(s.stoppedBuildings.biologyLab || 0, 0);
});

test('turning off and back on appends priority; stopping a failed unit releases its request', () => {
  const s = fresh();
  s.buildings.solarSatellite = 1;
  s.buildings.biologyLab = 2;
  s.buildings.observatory = 1;
  s.powerActivationOrder = [{ id: 'biologyLab', count: 2 }, { id: 'observatory', count: 1 }];
  assert.equal(calculateProduction(s).inputUnits.observatory, 0);
  setBuildingPowerEnabled(s, 'biologyLab', -2);
  setBuildingPowerEnabled(s, 'biologyLab', 2);
  let result = calculateProduction(s);
  assert.equal(result.inputUnits.observatory, 1);
  assert.equal(result.inputUnits.biologyLab, 1);
  assert.equal(result.power.available, -2);
  setBuildingPowerEnabled(s, 'biologyLab', -1);
  result = calculateProduction(s);
  assert.equal(result.power.available, 0);
  assert.equal(result.powerGrid.failed.biologyLab, undefined);
});

test('generation fuel shortage fails latest load and replenishment restores it', () => {
  const s = fresh();
  s.buildings.hydrogenPowerPlant = 1;
  s.buildings.biologyLab = 2;
  s.resources.water = 0;
  s.powerActivationOrder = [{ id: 'biologyLab', count: 2 }];
  assert.equal(calculateProduction(s).power.available, -4);
  assert.equal(calculateProduction(s).inputUnits.biologyLab, 0);
  s.resources.water = 10;
  assert.equal(calculateProduction(s).inputUnits.biologyLab, 2);
});

test('earlier digital and ground loads take priority over later cores without negative settlement', () => {
  const s = fresh();
  s.buildings.solarSatellite = 20;
  s.buildings.aiSupercore = 1;
  s.buildings.gatewayRouter = 1;
  s.resources.helium3 = 1000;
  s.powerActivationOrder = [{ id: 'gatewayRouter', count: 1 }, { id: 'aiSupercore', count: 1 }];
  const result = calculateProduction(s);
  assert.equal(result.digital.gatewayUnits, 1);
  assert.equal(result.inputUnits.aiSupercore, 0);
  assert.equal(result.power.available, -25);
  assert.equal(result.powerGrid.failed.aiSupercore, 1);
  assert.ok(Object.values(result.inputUnits).every(n => n >= 0 && Number.isFinite(n)));
});
