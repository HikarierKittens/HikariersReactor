import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { CONFIG } from '../src/data/config';
import { createRuntime } from '../src/app/runtime';
import { normalizeSchema31Save } from '../src/state/save-compatibility';
import { validateCurrentSave } from '../src/state/validate-save';

const context = { now: 1_000_000, eventInterval: 60, housingCapacity: () => 1e6, clampResources: () => {} };
const fields = ['buildings', 'workers', 'stoppedBuildings'] as const;
function historicalSave() {
  // Derive a nonzero retirement case from the immutable previous-release artifact.
  const raw = JSON.parse(readFileSync(new URL('./fixtures/pre-beta0.6.5-schema31.json', import.meta.url), 'utf8'));
  raw.buildings.batteryStation = 7;
  raw.workers.batteryStation = 0;
  raw.stoppedBuildings.batteryStation = 3;
  raw.resources.energy = 12345.5;
  raw.queue.push({ uid: 8001, kind: 'build', id: 'batteryStation' });
  for (const id of ['energyStorage', 'batteryConcentrationRing']) if (!raw.tech.includes(id)) raw.tech.push(id);
  return raw;
}
function freeze(value: any): void {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
}

test('schema31 retires positive/stopped/queued battery stations without mutating or losing other progress', () => {
  const raw = historicalSave(), before = structuredClone(raw);
  freeze(raw);
  const normalized = normalizeSchema31Save(raw);
  for (const field of fields) {
    assert.equal(Object.hasOwn(normalized[field] as object, 'batteryStation'), false);
    assert.equal(Object.hasOwn(BUILDINGS, 'batteryStation'), false);
  }
  const loaded = validateCurrentSave(raw, context);
  const reference = structuredClone(before);
  for (const field of fields) delete reference[field].batteryStation;
  reference.resources.energy = 0;
  reference.queue = reference.queue.filter((q: any) => q.id !== 'batteryStation');
  assert.deepEqual(loaded, validateCurrentSave(reference, context));
  assert.deepEqual(loaded.queue, before.queue.filter((q: any) => q.id !== 'batteryStation'));
  assert.deepEqual(loaded.tech, before.tech);
  assert.deepEqual(raw, before);
  assert.deepEqual(validateCurrentSave(JSON.parse(JSON.stringify(loaded)), context), loaded);
});

test('pending retired research is removed, but already earned IDs remain historical progress', () => {
  const raw = historicalSave();
  raw.tech = raw.tech.filter((id: string) => id !== 'energyStorage' && id !== 'batteryConcentrationRing');
  raw.queue.push({ uid: 8002, kind: 'tech', id: 'energyStorage' }, { uid: 8003, kind: 'tech', id: 'batteryConcentrationRing' });
  const loaded = validateCurrentSave(raw, context);
  assert.deepEqual(loaded.queue, raw.queue.filter((q: any) => !['batteryStation', 'energyStorage', 'batteryConcentrationRing'].includes(q.id)));
  assert.equal(loaded.tech.includes('energyStorage'), false);
});

test('explicit malformed legacy energy and retired records are not silently repaired', () => {
  for (const value of [undefined, null, '0', false, -1, NaN, Infinity, {}, []]) {
    const raw = historicalSave(); raw.resources.energy = value;
    assert.throws(() => validateCurrentSave(raw, context), /资源/);
  }
  for (const field of fields) for (const value of [null, '0', -1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const raw = historicalSave(); raw[field].batteryStation = value;
    assert.throws(() => validateCurrentSave(raw, context), /储能站/);
  }
  const worker = historicalSave(); worker.workers.batteryStation = 1;
  assert.throws(() => validateCurrentSave(worker, context));
  const stopped = historicalSave(); stopped.stoppedBuildings.batteryStation = 8;
  assert.throws(() => validateCurrentSave(stopped, context));
  const duplicate = historicalSave(); duplicate.queue.push({ uid: 8001, kind: 'build', id: 'batteryStation' });
  assert.throws(() => validateCurrentSave(duplicate, context), /队列/);
  const segmented = historicalSave(); segmented.queue.at(-1).segments = 1;
  assert.throws(() => validateCurrentSave(segmented, context), /队列/);
  const unknown = historicalSave(); unknown.buildings.unknownBuilding = 1;
  assert.throws(() => validateCurrentSave(unknown, context), /经济/);
});

test('previous-release power load/import/reload and protected-save recovery retain non-power progress', async t => {
  const storage = new Map<string, string>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  t.mock.method(Date, 'now', () => context.now);
  const raw = historicalSave(), json = JSON.stringify(raw);
  const check = (state: ReturnType<typeof createRuntime>['state']) => {
    for (const field of fields) assert.equal(Object.hasOwn(state[field], 'batteryStation'), false);
    assert.equal(state.resources.energy, 0);
    assert.deepEqual(state.tech, raw.tech);
    assert.deepEqual(state.queue, raw.queue.filter((q: any) => q.id !== 'batteryStation'));
    for (const field of ['achievements', 'logs', 'stageThree', 'story'] as const) assert.deepEqual(state[field], raw[field]);
    assert.equal(state.buildings.spaceRipper, raw.buildings.spaceRipper);
  };
  storage.set(CONFIG.saveKey, json);
  const runtime = createRuntime(); runtime.load(); assert.equal(runtime.saveBlocked, false); check(runtime.state);
  assert.equal(runtime.save(), true);
  const reloaded = createRuntime(); reloaded.load(); check(reloaded.state);
  const bad = historicalSave(); bad.resources.energy = 'invalid'; const badBytes = JSON.stringify(bad);
  storage.set(CONFIG.saveKey, badBytes);
  const protectedRuntime = createRuntime(); protectedRuntime.load();
  assert.equal(protectedRuntime.saveBlocked, true); assert.equal(protectedRuntime.save(), false);
  assert.equal(storage.get(CONFIG.saveKey), badBytes); assert.equal(protectedRuntime.exportProtectedSave(), badBytes);
  await assert.rejects(() => protectedRuntime.importSave(badBytes));
  assert.equal(await protectedRuntime.importSave(json), true); assert.equal(protectedRuntime.saveBlocked, false); check(protectedRuntime.state);
  const recovered = createRuntime(); recovered.load(); check(recovered.state);
});
