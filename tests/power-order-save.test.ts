import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createRuntime } from '../src/app/runtime';
import { normalizeSchema31Save } from '../src/state/save-compatibility';
import { validateCurrentSave } from '../src/state/validate-save';
import { createInitialState } from '../src/state/create-state';
import { constructBuildingState, applyResearchSideEffects } from '../src/simulation/purchases';

const context = { now: 1_000_000, eventInterval: 60, housingCapacity: () => 1e6, clampResources: () => {} };
const historical = () => JSON.parse(readFileSync(new URL('./fixtures/pre-beta0.6.5-schema31.json', import.meta.url), 'utf8'));
function freeze(value: any): void {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
}

test('new powered buildings consume only spare grid supply and preserve activation order', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.buildings.solarSatellite = 1; // +5 power
  constructBuildingState(state, 'biologyLab', 0);
  constructBuildingState(state, 'biologyLab', 0);
  constructBuildingState(state, 'biologyLab', 0);
  assert.equal(state.buildings.biologyLab, 3);
  assert.equal(state.stoppedBuildings.biologyLab, 1);
  assert.equal(state.powerActivationOrder!.filter(entry => entry.id === 'biologyLab').reduce((sum, entry) => sum + entry.count, 0), 2);
});

test('support-stopped construction never reclassifies an old enabled unit as newly built', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.buildings.planetaryFoundry = 1;
  state.powerActivationOrder = [{ id: 'planetaryFoundry', count: 1 }];
  constructBuildingState(state, 'planetaryFoundry', 0);
  assert.equal(state.buildings.planetaryFoundry, 2);
  assert.equal(state.stoppedBuildings.planetaryFoundry, 1);
  assert.deepEqual(state.powerActivationOrder, [{ id: 'planetaryFoundry', count: 1 }]);
});

test('segmented powered construction registers complete units only and preserves explicit ascension stop', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.buildings.aiSupercoreSegments = 98;
  constructBuildingState(state, 'aiSupercoreSegments', 0);
  assert.equal(state.buildings.aiSupercore, 0);
  assert.equal(state.buildings.aiSupercoreSegments, 99);
  assert.equal(state.stoppedBuildings.aiSupercore, 0);
  assert.equal(state.powerActivationOrder!.some(entry => entry.id === 'aiSupercore'), false);
  constructBuildingState(state, 'aiSupercoreSegments', 0);
  assert.equal(state.buildings.aiSupercore, 1);
  assert.equal(state.buildings.aiSupercoreSegments, 0);
  assert.equal(state.stoppedBuildings.aiSupercore, 1);
  state.buildings.agiAscensionCoreSegments = 99;
  state.buildings.solarSatellite = 100000;
  constructBuildingState(state, 'agiAscensionCoreSegments', 0);
  assert.equal(state.buildings.agiAscensionCore, 1);
  assert.equal(state.buildings.agiAscensionCoreSegments, 0);
  assert.equal(state.stoppedBuildings.agiAscensionCore, 1);
  assert.equal(state.powerActivationOrder!.some(entry => entry.id === 'agiAscensionCore'), false);
});

test('research-gift router obeys the same spare-power default shutdown', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.tech.push('aiCoreCalibration');
  applyResearchSideEffects(state, 'aiCoreCalibration', []);
  assert.equal(state.buildings.gatewayRouter, 1);
  assert.equal(state.stoppedBuildings.gatewayRouter, 1);
});

test('previous-release saves gain an empty activation-order fallback immutably', () => {
  const raw = historical(), before = structuredClone(raw);
  freeze(raw);
  assert.deepEqual(normalizeSchema31Save(raw).powerActivationOrder, []);
  const loaded = validateCurrentSave(raw, context);
  assert.deepEqual(loaded.powerActivationOrder, []);
  assert.deepEqual(raw, before);
  assert.deepEqual(validateCurrentSave(JSON.parse(JSON.stringify(loaded)), context), loaded);
});

test('explicit malformed activation order is rejected, not silently reset', () => {
  for (const order of [null, {}, '[]', 1, [null], [{ id: 'unknown', count: 1 }],
    [{ id: 'generator', count: 0 }], [{ id: 'generator', count: -1 }],
    [{ id: 'generator', count: .5 }], [{ id: 'generator', count: NaN }],
    [{ id: 'generator', count: Infinity }], [{ id: 'generator', count: 1, extra: true }],
    [{ id: 'generator' }], Array.from({ length: 10001 }, () => ({ id: 'generator', count: 1 }))]) {
    const raw = historical(); raw.powerActivationOrder = order;
    assert.throws(() => validateCurrentSave(raw, context), /供电开启顺序/);
  }
});

test('an over-count activation batch is clamped to what is running, not rejected', () => {
  // beta 0.9.28 registered power plants in `powerActivationOrder`, so the saved order could
  // exceed the owned count and the next load was rejected. The write side is fixed; a save
  // already written by that build is repaired here instead of stranding the player. Only the
  // excess is dropped -- the rest of the batch survives in order.
  const raw = historical();
  raw.powerActivationOrder = [{ id: 'generator', count: raw.buildings.generator + 1 }];
  const loaded = validateCurrentSave(raw, context);
  assert.equal(
    (loaded.powerActivationOrder || []).filter(entry => entry.id === 'generator').reduce((sum, entry) => sum + entry.count, 0),
    0,
    'a power plant is not a load, so its entries are dropped entirely',
  );
  // A real load keeps the entries it can justify and loses only the excess.
  const load = historical();
  load.buildings.biologyLab = 2; load.stoppedBuildings.biologyLab = 0;
  load.powerActivationOrder = [{ id: 'biologyLab', count: 5 }];
  const repaired = validateCurrentSave(load, context);
  assert.equal(
    (repaired.powerActivationOrder || []).filter(entry => entry.id === 'biologyLab').reduce((sum, entry) => sum + entry.count, 0),
    2,
    'clamped down to the two running labs',
  );
  assert.equal(repaired.buildings.biologyLab, 2, 'the progress itself is untouched');
});

test('ordered activation batches survive save/load/import and protected recovery', async t => {
  const storage = new Map<string, string>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  t.mock.method(Date, 'now', () => context.now);
  const raw = historical();
  raw.buildings.biologyLab = 3; raw.workers.biologyLab = 0; raw.stoppedBuildings.biologyLab = 0;
  raw.powerActivationOrder = [{ id: 'biologyLab', count: 1 }, { id: 'biologyLab', count: 2 }];
  const json = JSON.stringify(raw);
  storage.set(CONFIG.saveKey, json);
  const runtime = createRuntime(); runtime.load();
  assert.equal(runtime.saveBlocked, false);
  assert.deepEqual(runtime.state.powerActivationOrder, raw.powerActivationOrder);
  assert.equal(runtime.save(), true);
  const reload = createRuntime(); reload.load();
  assert.deepEqual(reload.state.powerActivationOrder, raw.powerActivationOrder);
  const invalid = JSON.parse(json); invalid.powerActivationOrder[0].count = 1.5;
  const badBytes = JSON.stringify(invalid); storage.set(CONFIG.saveKey, badBytes);
  const protectedRuntime = createRuntime(); protectedRuntime.load();
  assert.equal(protectedRuntime.saveBlocked, true);
  assert.equal(protectedRuntime.save(), false);
  assert.equal(protectedRuntime.exportProtectedSave(), badBytes);
  assert.equal(storage.get(CONFIG.saveKey), badBytes);
  await assert.rejects(() => protectedRuntime.importSave(badBytes));
  assert.equal(await protectedRuntime.importSave(json), true);
  assert.deepEqual(protectedRuntime.state.powerActivationOrder, raw.powerActivationOrder);
  assert.equal(protectedRuntime.save(), true);
  const recovered = createRuntime(); recovered.load();
  assert.deepEqual(recovered.state.powerActivationOrder, raw.powerActivationOrder);
});
