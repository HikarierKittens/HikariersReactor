import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateCurrentSave } from '../src/state/validate-save';
import { normalizeSchema31Save } from '../src/state/save-compatibility';
import { createInitialState } from '../src/state/create-state';
import { CONFIG } from '../src/data/config';
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
  for (const field of fields) for (const id of ['dysonSphere', 'hazardousMaterialStorage', 'gatewayRouter', 'downloadExecutable', 'quantumStorage', 'downloadCache', 'subcomputeNode', 'quantizedCompressionModule', 'dataCompression', 'cpuDecoder', 'cellCore', 'memoryCore', 'ethMiner', 'dataDecryptionModule', 'softRouterNode', 'aesComputeModule', 'worldSimulator', 'agiCoreComponent', 'coreCooler', 'agiAscensionCore', 'solarFarm', 'hospital']) expected[field][id] = 0;
  for (const field of ['resources', 'containerAssignments', 'alloyContainerAssignments']) {
    expected[field].bytes = 0;
    expected[field].encryptedData = 0;
    assert.equal(Object.hasOwn(before[field], 'encryptedData'), false);
  }
  for (const field of fields) delete expected[field].batteryStation;
  expected.resources.energy = 0;
  expected.downloadAllocation = 0;
  expected.powerActivationOrder = [];
  // 临近势力 arrived after this frozen snapshot: both new fields are backfilled.
  expected.wounded = 0;
  expected.hospitalProgress = 0;
  expected.neighbors = { values: state.neighbors.values, occupied: [], lastActionTime: null };
  expected.prestige.harmonyCrystals = 0;
  expected.prestige.ascensionResets = 0;
  expected.statistics.lifetime.harmonyCrystalsEarned = 0;
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

test('retargeted prerequisites keep historical research but never open new research', () => {
  const raw = fixture();
  // The frozen fixture earned electronics/oilTechnology before beta 0.7.3 added
  // the 工业化 parent, so it loads without the new gate.
  assert.ok(raw.tech.includes('electronics') && raw.tech.includes('oilTechnology'));
  assert.ok(!raw.tech.includes('industrialization'));
  const state = validateCurrentSave(raw, context);
  assert.ok(state.tech.includes('electronics')); assert.ok(state.tech.includes('oilTechnology'));
  // Future research still requires the new parent: without it the gate is closed.
  const target = createInitialState(CONFIG.version, 60, 0);
  target.tech = ['electricity', 'automation', 'titaniumSmelting'];
  target.resources.knowledge = 1e9;
  assert.equal(isTechnologyUnlocked('industrialization', target), true);
  assert.equal(isTechnologyUnlocked('electronics', target), false);
  assert.equal(isTechnologyUnlocked('oilTechnology', target), false);
  target.tech.push('industrialization');
  assert.equal(isTechnologyUnlocked('electronics', target), true);
  assert.equal(isTechnologyUnlocked('oilTechnology', target), true);
  // The exemption tolerates only the new parent; any other missing prerequisite still fails.
  const broken = fixture(); broken.tech = broken.tech.filter((id: string) => id !== 'electricity');
  assert.throws(() => validateCurrentSave(broken, context), /科技前置关系无效/);
});

test('factories built before the 工业化 retarget survive, but the gate still closes for new ones', () => {
  const raw = fixture();
  raw.buildings.factory = 3;
  const state = validateCurrentSave(raw, context);
  assert.equal(state.buildings.factory, 3);
  assert.ok(!state.tech.includes('industrialization'));
  // A save that never earned the previous 自动化 gate cannot smuggle factories in.
  const smuggled = fixture();
  smuggled.tech = smuggled.tech.filter((id: string) => id !== 'automation' && id !== 'industrialization');
  smuggled.buildings.factory = 1;
  assert.throws(() => validateCurrentSave(smuggled, context), /建筑尚未解锁/);
});

test('historical queued overclock loads but cannot bypass the live research gate', () => {  for (const count of [0, 99]) {
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

test('new ascension fields default only when absent and malformed explicit values are rejected', () => {
  const ids = ['softRouterNode', 'aesComputeModule', 'worldSimulator', 'agiCoreComponent', 'coreCooler', 'agiAscensionCore'];
  for (const field of fields) for (const id of ids) {
    for (const value of [undefined, null, '0', false, -1, .5, NaN, Infinity, {}, []]) {
      const raw = fixture(); raw[field][id] = value;
      const before = structuredClone(raw);
      assert.throws(() => validateCurrentSave(raw, context), `${field}/${id}/${String(value)}`);
      assert.deepEqual(raw, before);
    }
  }
  for (const key of ['harmonyCrystals', 'ascensionResets']) {
    for (const value of [undefined, null, '0', false, -1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, {}, []]) {
      const raw = fixture(); raw.prestige[key] = value;
      assert.throws(() => validateCurrentSave(raw, context), `${key}/${String(value)}`);
    }
  }
  for (const value of [undefined, null, '0', false, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, {}, []]) {
    const raw = fixture(); raw.statistics.lifetime.harmonyCrystalsEarned = value;
    assert.throws(() => validateCurrentSave(raw, context));
  }
  const earned = fixture(); earned.prestige.harmonyCrystals = 12; earned.prestige.ascensionResets = 3;
  earned.prestigeUnlocked.push('harmonyCrystals'); earned.statistics.lifetime.harmonyCrystalsEarned = 19;
  const loaded = validateCurrentSave(earned, context);
  assert.equal(loaded.prestige.harmonyCrystals, 12); assert.equal(loaded.prestige.ascensionResets, 3);
  assert.equal(loaded.statistics.lifetime.harmonyCrystalsEarned, 19);
  assert.deepEqual(validateCurrentSave(JSON.parse(JSON.stringify(loaded)), context), loaded);
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
