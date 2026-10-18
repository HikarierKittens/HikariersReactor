import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { BUILDINGS } from '../src/data/buildings';
import { createInitialState } from '../src/state/create-state';
import { calculateProduction } from '../src/simulation/production';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateWorkerCapacity } from '../src/simulation/building-production';
import { isBuildingUnderworking } from '../src/vue/building-status';
import { validateEconomyRecords } from '../src/state/validate-economy';
import { validateStorageAssignments } from '../src/state/validation';
import { supplyPower } from './support/power';

const fresh = () => createInitialState(CONFIG.version, 60, 0);

function poweredState(energy: number) {
  const state = fresh();
  state.buildings.asrielSpaceport = 1;
  state.buildings.asrielControlTower = 3;
  state.buildings.asrielResidence = 6;
  supplyPower(state, energy);
  state.resources.helium3 = 100;
  state.resources.food = 100;
  return state;
}

test('control towers add one support per fully powered enabled unit after port reservation', () => {
  const state = poweredState(10.9);
  const before = structuredClone(state);
  const support = calculateSupportPreview(state).asriel;
  assert.equal(support.ports, 1);
  assert.equal(support.towers, 2);
  assert.equal(support.capacity, 6);
  assert.equal(support.used, 6);
  assert.equal(support.allocations.asrielResidence, 6);
  assert.equal(support.available, 0);
  assert.equal(support.support, 6);
  assert.deepEqual(state, before);
  state.stoppedBuildings.asrielControlTower = 2;
  assert.equal(calculateSupportPreview(state).asriel.towers, 1);
  supplyPower(state, 6.999);
  const shortage = calculateSupportPreview(state).asriel;
  assert.equal(shortage.ports, 1);
  assert.equal(shortage.towers, 0, 'partial power cannot provide fractional support');
  assert.equal(shortage.capacity, 4);
});

test('tower support allocates in the existing residence/mine/dome/foundry/lab priority', () => {
  const state = poweredState(15);
  state.buildings.asrielResidence = 1;
  state.buildings.asrielMine = 2;
  state.buildings.ecologicalDome = 2;
  state.buildings.planetaryFoundry = 2;
  state.buildings.alienMaterialLab = 2;
  const support = calculateSupportPreview(state).asriel;
  assert.deepEqual(support.allocations, { asrielResidence: 1, asrielMine: 2, ecologicalDome: 2, planetaryFoundry: 2, alienMaterialLab: 0, vrCenter: 0 });
  assert.equal(support.capacity, 7);
});

test('built towers can operate independently of port fuel or enabled ports and have no jobs', () => {
  const state = poweredState(4);
  state.resources.helium3 = 0;
  state.resources.food = 0;
  const support = calculateSupportPreview(state).asriel;
  assert.equal(support.ports, 0);
  assert.equal(support.towers, 2);
  assert.equal(support.capacity, 2);
  state.stoppedBuildings.asrielSpaceport = 1;
  assert.equal(calculateSupportPreview(state).asriel.towers, 2);
  assert.equal(calculateWorkerCapacity('asrielControlTower', state), 0);
  assert.equal(BUILDINGS.asrielControlTower.asrielSupport, undefined, 'tower generates rather than consumes support');
});

test('preview and production reserve towers exactly once before downstream factories and research', () => {
  for (const dt of [.2, 1, 3]) {
    const state = poweredState(9);
    state.buildings.asrielControlTower = 2;
    state.buildings.factory = 1;
    state.buildings.biologyLab = 1;
    const before = structuredClone(state);
    const preview = calculateSupportPreview(state, dt);
    const result = calculateProduction(state, dt);
    assert.deepEqual(preview.asriel, result.asriel);
    assert.equal(result.asriel.towers, 2);
    assert.equal(result.inputUnits.asrielControlTower, 2);
    assert.equal(result.outputs.asrielControlTower, 2);
    assert.equal(result.inputUnits.factory, 0);
    assert.equal(preview.biologyUnits, 0);
    assert.equal(preview.pool.energy, 0);
    assert.deepEqual(result.power, { generated: 9, used: 9, available: 0 });
    assert.ok(Math.abs(result.rates.energy) < 1e-8);
    assert.deepEqual(state, before);
    assert.equal(isBuildingUnderworking('asrielControlTower', state, result), false);
    supplyPower(state, 8);
    const shortage = calculateProduction(state, dt);
    assert.equal(shortage.asriel.towers, 1);
    assert.equal(isBuildingUnderworking('asrielControlTower', state, shortage), true);
    state.stoppedBuildings.asrielControlTower = 2;
    assert.equal(isBuildingUnderworking('asrielControlTower', state, calculateProduction(state, dt)), false);

  }
});

test('waystation and lunar maintenance precede port and tower power allocation', () => {
  const state = poweredState(16);
  state.buildings.spaceWaystation = 1;
  state.buildings.moonBase = 1;
  state.resources.oil = 100;
  const preview = calculateSupportPreview(state);
  assert.equal(preview.waystations, 1);
  assert.equal(preview.moon.baseUnits, 1);
  assert.equal(preview.asriel.ports, 1);
  assert.equal(preview.asriel.towers, 1);
  assert.equal(preview.pool.energy, 0);
  assert.deepEqual(preview.asriel, calculateProduction(state).asriel);
});

test('tower save records reject missing counts and malformed present values', () => {
  const raw = fresh();
  for (const field of ['buildings', 'workers', 'stoppedBuildings'] as const) Reflect.deleteProperty(raw[field], 'asrielControlTower');
  const before = structuredClone(raw);
  assert.throws(() => validateEconomyRecords(raw as unknown as Record<string, unknown>, fresh()));
  assert.throws(() => validateStorageAssignments(raw, fresh()));
  assert.deepEqual(raw, before);
  for (const field of ['buildings', 'workers', 'stoppedBuildings'] as const) {
    for (const bad of [null, '0', -1, .5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const malformed = fresh();
      (malformed[field] as Record<string, unknown>).asrielControlTower = bad;
      assert.throws(() => {
        const state = fresh();
        validateEconomyRecords(malformed as unknown as Record<string, unknown>, state);
        validateStorageAssignments(malformed, state);
      }, `${field} must reject ${String(bad)}`);
    }
  }
  const roundtrip = fresh();
  roundtrip.buildings.asrielControlTower = 3;
  roundtrip.stoppedBuildings.asrielControlTower = 1;
  const restored = fresh();
  validateEconomyRecords(roundtrip as unknown as Record<string, unknown>, restored);
  validateStorageAssignments(roundtrip, restored);
  assert.equal(restored.buildings.asrielControlTower, 3);
  assert.equal(restored.stoppedBuildings.asrielControlTower, 1);
  roundtrip.workers.asrielControlTower = 1;
  assert.throws(() => validateEconomyRecords(roundtrip as unknown as Record<string, unknown>, fresh()));
});
