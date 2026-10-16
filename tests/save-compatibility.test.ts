import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateCurrentSave } from '../src/state/validate-save';
import { normalizeSchema31Save } from '../src/state/save-compatibility';
import { isTechnologyUnlocked } from '../src/simulation/unlocks';
import { requestPurchaseModule, settlePurchaseQueue } from '../src/simulation/purchases';

const context = { now: 1_000_000, eventInterval: 60, housingCapacity: () => 1e6, clampResources: () => {} };
const fields = ['buildings', 'workers', 'stoppedBuildings'] as const;
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/pre-beta0.6.5-schema31.json', import.meta.url), 'utf8'));
function freeze(value: any): void {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
}

test('frozen pre-beta0.6.5 JSON upgrades only missing building entries and roundtrips without losing progress', () => {
  const raw = fixture();
  for (const field of fields) assert.equal(Object.hasOwn(raw[field], 'hazardousMaterialStorage'), false);
  const before = structuredClone(raw); freeze(raw);
  const state = validateCurrentSave(raw, context);
  const expected = structuredClone(before);
  for (const field of fields) for (const id of ['hazardousMaterialStorage', 'gatewayRouter', 'downloadExecutable', 'quantumStorage', 'downloadCache', 'subcomputeNode', 'quantizedCompressionModule', 'dataCompression', 'cpuDecoder']) expected[field][id] = 0;
  for (const field of ['resources', 'containerAssignments', 'alloyContainerAssignments']) expected[field].bytes = 0;
  expected.downloadAllocation = 0;
  assert.deepEqual(state, expected);
  assert.deepEqual(validateCurrentSave(JSON.parse(JSON.stringify(state)), context), state);
  assert.deepEqual(raw, before);
  const normalized = normalizeSchema31Save(raw);
  assert.notEqual(normalized, raw);
  for (const field of fields) assert.notEqual(normalized[field], raw[field]);
});

for (const count of [0, 99]) test(`historical ripperOverclock survives ${count} segments; new research stays gated`, () => {
  const raw = fixture(); raw.buildings.spaceRipper = count;
  const state = validateCurrentSave(raw, context);
  assert.ok(state.tech.includes('ripperOverclock'));
  state.tech = state.tech.filter(id => id !== 'ripperOverclock');
  state.resources.knowledge = 1e9;
  assert.equal(isTechnologyUnlocked('ripperOverclock', state), false);
  assert.equal(requestPurchaseModule(state, 'tech', 'ripperOverclock', 0).status, 'rejected');
  const bad = fixture(); bad.tech = bad.tech.filter((id: string) => id !== 'dimensionPioneer'); bad.buildings.spaceRipper = 0; bad.queue = [];
  assert.throws(() => validateCurrentSave(bad, context), /科技前置关系无效/);
});

test('historical queued overclock loads but cannot bypass the live research gate', () => {
  for (const count of [0, 99]) {
    const raw = fixture(); raw.buildings.spaceRipper = count;
    raw.tech = raw.tech.filter((id: string) => id !== 'ripperOverclock');
    raw.queue = [{ uid: 2, kind: 'tech', id: 'ripperOverclock' }];
    const state = validateCurrentSave(raw, context);
    assert.deepEqual(state.queue, raw.queue);
    state.resources.knowledge = 1e9;
    settlePurchaseQueue(state, 0);
    assert.equal(state.tech.includes('ripperOverclock'), false);
    assert.equal(state.resources.knowledge, 1e9);
    assert.deepEqual(state.queue, []);
    raw.tech = raw.tech.filter((id: string) => id !== 'dimensionPioneer');
    assert.throws(() => validateCurrentSave(raw, context));
  }
});

test('compatibility defaults never repair malformed explicit entries or unrelated missing data', () => {
  for (const field of fields) {
    for (const value of [null, undefined, '0', false, -1, .5, Infinity, NaN, {}, []]) {
      const raw = fixture(); raw[field].hazardousMaterialStorage = value;
      const before = structuredClone(raw);
      assert.throws(() => validateCurrentSave(raw, context), `${field}: ${String(value)}`);
      assert.deepEqual(raw, before);
    }
    for (const value of [null, undefined, [], 'invalid']) {
      const raw = fixture(); raw[field] = value;
      assert.throws(() => validateCurrentSave(raw, context));
    }
    const missing = fixture(); delete missing[field].nest;
    assert.throws(() => validateCurrentSave(missing, context));
    const unknown = fixture(); unknown[field].unknownBuilding = 0;
    assert.throws(() => validateCurrentSave(unknown, context));
  }
  for (const field of ['resources', 'containerAssignments', 'alloyContainerAssignments', 'craftWorkers', 'lines', 'arpaBuildings', 'arpaProgress']) {
    const raw = fixture(); delete raw[field][Object.keys(raw[field])[0]!];
    assert.throws(() => validateCurrentSave(raw, context), field);
  }
  for (let version = 12; version <= 30; version++) {
    const raw = fixture(); raw.version = version;
    assert.equal(normalizeSchema31Save(raw), raw);
    assert.throws(() => validateCurrentSave(raw, context), /版本不受支持/);
  }
});
