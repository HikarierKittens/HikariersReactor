import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createRuntime } from '../src/app/runtime';
import { BUILDINGS } from '../src/data/buildings';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import { createInitialState } from '../src/state/create-state';
import { normalizeSchema31Save } from '../src/state/save-compatibility';
import { validateCurrentSave } from '../src/state/validate-save';
import { calculateBuildingCost, calculateBuildingScale, HARMONY_BUILDING_IDS, isBuildingFullyBuilt } from '../src/simulation/costs';
import { countRunningBuildings } from '../src/simulation/housing';
import { isPowerProducer, settlePowerPlants } from '../src/simulation/power';
import { calculateProduction } from '../src/simulation/production';
import { calculateResourceBreakdown, calculateResourceFactorRows } from '../src/simulation/resource-breakdown';
import { requestPurchaseModule, researchTechnologyNow, settlePurchaseQueue } from '../src/simulation/purchases';
import { isBuildingUnlocked, isTechnologyUnlocked } from '../src/simulation/unlocks';
import type { ResourceId } from '../src/types/economy';

const context = { now: 1_000_000, eventInterval: 60, housingCapacity: () => 1e6, clampResources: () => {} };
const fresh = () => createInitialState(31, 60, context.now);
const fixtureText = () => readFileSync(new URL('./fixtures/pre-beta0.6.5-schema31.json', import.meta.url), 'utf8');
const fixture = () => JSON.parse(fixtureText());
const fields = ['buildings', 'workers', 'stoppedBuildings'] as const;
const price = { cash: 1000000, adamantite: 5000, graphene: 2500, nanoAlloy: 5000 };
function fund(state: ReturnType<typeof fresh>, segments: number) {
  for (const [resource, value] of Object.entries(price)) state.resources[resource as ResourceId] = value * segments;
}

test('Dyson technology uses real T20 prerequisites and T21 knowledge price', () => {
  const tech = TECHNOLOGIES.dysonSphere;
  assert.equal(tech.name, '戴森球'); assert.equal(tech.tier, 21);
  assert.equal(tech.knowledgeCost, 1750000); assert.deepEqual(tech.cost, { knowledge: 1750000 });
  assert.deepEqual(tech.pre, ['superMetal', 'grapheneProcessing', 'nanoAlloy']);
  assert.equal(tech.desc, '随着技术进步，终于可以见到真正的戴森球了。');
  for (const missing of tech.pre) {
    const state = fresh(); state.tech = tech.pre.filter(id => id !== missing); state.resources.knowledge = 1750000;
    assert.equal(isTechnologyUnlocked('dysonSphere', state), false);
    assert.equal(researchTechnologyNow(state, 'dysonSphere').bought, false);
  }
  const state = fresh(); state.tech = [...tech.pre]; state.resources.knowledge = 1750000;
  assert.equal(isBuildingUnlocked('dysonSphere', state), false);
  assert.equal(isTechnologyUnlocked('dysonSphere', state), true);
  assert.equal(researchTechnologyNow(state, 'dysonSphere').bought, true);
  assert.equal(state.resources.knowledge, 0); assert.equal(isBuildingUnlocked('dysonSphere', state), true);
});

test('Dyson segments have fixed costs, cap at 100 and join non-ground harmony pricing', () => {
  const state = fresh(); state.tech.push('dysonSphere');
  assert.equal(BUILDINGS.dysonSphere.segmentedRequired, 100);
  assert.equal(BUILDINGS.dysonSphere.segmentEffects, true);
  assert.equal(BUILDINGS.dysonSphere.alwaysRunning, true);
  assert.equal(isPowerProducer('dysonSphere'), true);
  assert.equal(HARMONY_BUILDING_IDS.has('dysonSphere'), true);
  state.prestige.harmonyCrystals = 1000000;
  for (const count of [0, 1, 99]) {
    assert.deepEqual(calculateBuildingCost('dysonSphere', count, state), price);
    for (const resource of Object.keys(price) as ResourceId[]) assert.equal(calculateBuildingScale('dysonSphere', resource, state), 1);
  }
  state.buildings.dysonSphere = 99; fund(state, 2);
  assert.equal(isBuildingFullyBuilt('dysonSphere', state), false);
  assert.equal(requestPurchaseModule(state, 'build', 'dysonSphere', 0).status, 'buy-now');
  assert.equal(state.buildings.dysonSphere, 100); assert.equal(isBuildingFullyBuilt('dysonSphere', state), true);
  assert.equal(requestPurchaseModule(state, 'build', 'dysonSphere', 0).status, 'rejected');
  assert.equal(state.resources.cash, price.cash);
});

test('queued Dyson project settles per funded segment and generates immediately', () => {
  const state = fresh(); state.tech.push('dysonSphere');
  const result = requestPurchaseModule(state, 'build', 'dysonSphere', 0, true);
  assert.equal(result.status, 'queued');
  assert.ok(result.queued?.kind === 'build'); assert.equal(result.queued.segments, 10);
  fund(state, 3); settlePurchaseQueue(state, 0);
  assert.equal(state.buildings.dysonSphere, 3);
  assert.ok(state.queue[0]?.kind === 'build'); assert.equal(state.queue[0].segments, 7);
  assert.equal(calculateProduction(state, 1).rates.energy, 30);
  fund(state, 7); settlePurchaseQueue(state, 0);
  assert.equal(state.buildings.dysonSphere, 10); assert.deepEqual(state.queue, []);
});

test('every Dyson segment generates 10/s exactly once without morale, workers, fuel or stop dependence', () => {
  for (const segments of [0, 1, 7, 99, 100]) {
    const state = fresh(); state.buildings.dysonSphere = segments;
    state.stoppedBuildings.dysonSphere = segments;
    assert.equal(countRunningBuildings('dysonSphere', state), segments);
    const pool = { ...state.resources };
    const power = settlePowerPlants(pool, 2, state);
    assert.equal(power.energy, segments * 10); assert.equal(pool.energy, segments * 20);
    assert.equal(power.outputs.dysonSphere, segments);
    const production = calculateProduction(state, 1);
    assert.equal(production.rates.energy, segments * 10);
    if (segments) {
      const entry = calculateResourceBreakdown('energy', state, production).entries.find(row => row.id === 'dysonSphere');
      assert.equal(entry?.value, segments * 10);
      assert.ok(calculateResourceFactorRows('energy', state, production).rows.some(row => row.name === '戴森球' && row.value === `+${segments * 10}/s`));
    }
  }
});

test('Dyson UI stays in alphaSector, outside ground, with segmented tooltip and registry production rows', () => {
  const panel = readFileSync(new URL('../src/vue/components/BuildingsPanel.vue', import.meta.url), 'utf8');
  assert.match(panel, /const SPACE_IDS[^\n]*'dysonSphere'/);
  assert.match(panel, /id: 'alphaSector'[^\n]*'dysonSphere'/);
  const tooltip = readFileSync(new URL('../src/vue/components/TooltipPanel.vue', import.meta.url), 'utf8');
  assert.match(tooltip, /'penroseSphere', 'dysonSphere', 'massEjector'\]\.includes\(id\)\) tip.description/);
  assert.match(tooltip, /add\('分段进度'/);
  assert.match(tooltip, /orderedCostEntries\(calculateBuildingOutput\(id, state\)\)/);
});

test('previous release schema31 adds only absent Dyson records without mutating frozen input', () => {
  const raw = fixture(), before = structuredClone(raw);
  for (const field of fields) { assert.equal(Object.hasOwn(raw[field], 'dysonSphere'), false); Object.freeze(raw[field]); }
  Object.freeze(raw);
  const loaded = validateCurrentSave(raw, context);
  for (const field of fields) assert.equal(loaded[field].dysonSphere, 0);
  assert.deepEqual(raw, before);
  assert.deepEqual(validateCurrentSave(JSON.parse(JSON.stringify(loaded)), context), loaded);
  for (const field of ['tech', 'queue', 'achievements', 'logs', 'story', 'stageThree'] as const) assert.deepEqual(loaded[field], before[field]);
  const normalized = normalizeSchema31Save(raw);
  for (const field of fields) assert.equal((normalized[field] as Record<string, unknown>).dysonSphere, 0);
});

test('researched Dyson progress and unpaid queue remainder roundtrip without backfilling rewards', () => {
  const state = validateCurrentSave(fixture(), context);
  state.tech.push('overclocking13', 'superMetal', 'grapheneProcessing', 'nanoAlloy', 'dysonSphere');
  state.buildings.spaceRipper = 100;
  state.queue = state.queue.filter(item => !(item.kind === 'build' && item.id === 'spaceRipper'));
  state.buildings.dysonSphere = 17;
  state.queue.push({ uid: 99, kind: 'build', id: 'dysonSphere', segments: 3 });
  const before = structuredClone(state);
  const loaded = validateCurrentSave(JSON.parse(JSON.stringify(state)), context);
  assert.equal(loaded.buildings.dysonSphere, 17);
  assert.ok(loaded.tech.includes('dysonSphere'));
  assert.deepEqual(loaded.queue, state.queue);
  assert.deepEqual(loaded.prestige, state.prestige);
  assert.deepEqual(state, before);
  assert.deepEqual(validateCurrentSave(JSON.parse(JSON.stringify(loaded)), context), loaded);
});

test('Dyson compatibility rejects explicitly malformed records and never restores retired schemas', () => {
  for (const field of fields) for (const value of [undefined, null, false, '0', -1, .5, NaN, Infinity, {}, []]) {
    const raw = fixture(); raw[field].dysonSphere = value;
    const before = structuredClone(raw);
    assert.throws(() => validateCurrentSave(raw, context), `${field}/${String(value)}`);
    assert.deepEqual(raw, before);
  }
  const raw = fixture(); raw.version = 30;
  assert.equal(normalizeSchema31Save(raw), raw); assert.throws(() => validateCurrentSave(raw, context));
});

test('previous-release load/import roundtrips and malformed Dyson data remains protected until recovery', t => {
  const storage = new Map<string, string>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
  } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  t.mock.method(Date, 'now', () => context.now); t.mock.method(Math, 'random', () => .5);
  const json = fixtureText(), original = JSON.parse(json);
  const check = (state: ReturnType<typeof fresh>) => {
    for (const field of fields) assert.equal(state[field].dysonSphere, 0);
    for (const field of ['tech', 'queue', 'achievements', 'logs', 'story', 'stageThree'] as const) assert.deepEqual(state[field], original[field]);
    assert.equal(state.buildings.spaceRipper, 99); assert.equal(state.time, original.time);
  };
  storage.set(CONFIG.saveKey, json);
  const runtime = createRuntime(); runtime.load(); assert.equal(runtime.saveBlocked, false); check(runtime.state);
  assert.equal(runtime.save(), true);
  const reload = createRuntime(); reload.load(); check(reload.state);
  const imported = createRuntime(); assert.equal(imported.importSave(json), true); check(imported.state);
  const malformed = fixture(); malformed.buildings.dysonSphere = '0';
  const badBytes = JSON.stringify(malformed); storage.set(CONFIG.saveKey, badBytes);
  const protectedRuntime = createRuntime(); protectedRuntime.load();
  assert.equal(protectedRuntime.saveBlocked, true); assert.equal(protectedRuntime.save(), false);
  assert.equal(storage.get(CONFIG.saveKey), badBytes); assert.equal(protectedRuntime.exportProtectedSave(), badBytes);
  assert.throws(() => protectedRuntime.importSave(badBytes)); assert.equal(storage.get(CONFIG.saveKey), badBytes);
  assert.equal(protectedRuntime.importSave(json), true); assert.equal(protectedRuntime.saveBlocked, false); check(protectedRuntime.state);
  const recovered = createRuntime(); recovered.load(); check(recovered.state);
});
