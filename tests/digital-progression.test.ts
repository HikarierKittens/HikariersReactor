import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { BUILDINGS } from '../src/data/buildings';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import { RESOURCES } from '../src/data/resources';
import { createInitialState } from '../src/state/create-state';
import { validateCurrentSave } from '../src/state/validate-save';
import { isBuildingUnlocked, isResourceUnlocked, isTechnologyUnlocked } from '../src/simulation/unlocks';
import { researchTechnologyNow, requestPurchaseModule, settlePurchaseQueue, AI_CORE_CALIBRATION_LOG } from '../src/simulation/purchases';
import { calculateBuildingCost } from '../src/simulation/costs';
import { isContainerAssignable } from '../src/simulation/containers';

const context = { now: 1_000_000, eventInterval: 60, housingCapacity: () => 1e6, clampResources: () => {} };
const fresh = () => createInitialState(CONFIG.version, 60, context.now);
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/pre-beta0.6.5-schema31.json', import.meta.url), 'utf8'));
const digitalIds = ['gatewayRouter', 'downloadExecutable', 'quantumStorage', 'downloadCache', 'subcomputeNode', 'quantizedCompressionModule', 'dataCompression', 'cpuDecoder', 'cellCore', 'memoryCore', 'ethMiner', 'dataDecryptionModule'] as const;
const fields = ['buildings', 'workers', 'stoppedBuildings'] as const;

test('digital definitions preserve cost formats and use explicit byte price scales', () => {
  assert.deepEqual(TECHNOLOGIES.aiCoreCalibration.pre, []);
  assert.equal(TECHNOLOGIES.aiCoreCalibration.tier, 22);
  assert.deepEqual(TECHNOLOGIES.aiCoreCalibration.cost, { knowledge: 2500000 });
  assert.deepEqual(TECHNOLOGIES.binaryWorld.cost, { knowledge: 2500000, bytes: 1000 });
  assert.deepEqual(TECHNOLOGIES.binaryWorld.pre, ['aiCoreCalibration']);
  const state = fresh();
  for (const [id, scale] of [['gatewayRouter', 1.3], ['quantumStorage', 1.27], ['downloadCache', 1.24]] as const) {
    assert.deepEqual(BUILDINGS[id].cost, { bytes: 1000 });
    assert.deepEqual(BUILDINGS[id].costScales, { bytes: scale });
    assert.equal(calculateBuildingCost(id, 0, state).bytes, 1000);
  }
  assert.deepEqual(BUILDINGS.gatewayRouter.input, { energy: 25 });
  assert.equal(BUILDINGS.gatewayRouter.output, undefined);
  assert.equal(BUILDINGS.gatewayRouter.bandwidth, 5);
  for (const id of ['downloadExecutable', 'quantumStorage', 'downloadCache'] as const) assert.equal(BUILDINGS[id].bandwidthUse, 1);
  assert.equal(BUILDINGS.downloadExecutable.max, 1);
  assert.deepEqual(BUILDINGS.downloadExecutable.cost, { bytes: 0 });
  assert.equal(RESOURCES.bytes.cap, 10000);
  assert.equal(isContainerAssignable('bytes', state), false);
});

test('calibration needs a completed Penrose sphere, not another unstated technology', () => {
  const state = fresh(); state.resources.knowledge = 2500000;
  for (const segments of [0, 1, 99]) {
    state.buildings.penroseSphere = 0;
    state.buildings.penroseSphereSegments = segments;
    assert.equal(isTechnologyUnlocked('aiCoreCalibration', state), false);
    assert.equal(researchTechnologyNow(state, 'aiCoreCalibration').bought, false);
    assert.equal(state.buildings.gatewayRouter, 0);
  }
  state.buildings.penroseSphereSegments = 0; state.buildings.penroseSphere = 1;
  assert.equal(isTechnologyUnlocked('aiCoreCalibration', state), true);
  assert.equal(isResourceUnlocked('bytes', state), false);
  assert.equal(researchTechnologyNow(state, 'aiCoreCalibration').bought, true);
  assert.equal(state.resources.knowledge, 0);
  assert.equal(state.buildings.gatewayRouter, 1);
  assert.equal(state.stoppedBuildings.gatewayRouter, 0);
  assert.equal(isResourceUnlocked('bytes', state), true);
  assert.equal(isBuildingUnlocked('downloadExecutable', state), true);
  assert.equal(isBuildingUnlocked('quantumStorage', state), false);
  assert.equal(state.logs.filter(log => log.text === AI_CORE_CALIBRATION_LOG).length, 1);
  assert.equal(researchTechnologyNow(state, 'aiCoreCalibration').bought, false);
  assert.equal(state.buildings.gatewayRouter, 1);
  state.resources.knowledge = 2500000; state.resources.bytes = 1000;
  assert.equal(researchTechnologyNow(state, 'binaryWorld').bought, true);
  assert.equal(state.resources.bytes, 0);
  assert.equal(isBuildingUnlocked('quantumStorage', state), true);
  assert.equal(isBuildingUnlocked('downloadCache', state), true);
});

test('downward exploration unlocks T22 CPU research in order with exact costs', () => {
  const state = fresh(); state.tech.push('aiCoreCalibration', 'binaryWorld');
  for (const [id, cost, pre] of [
    ['downwardProbe', 2750000, 'binaryWorld'],
    ['subcomputeNode', 2500000, 'downwardProbe'],
    ['quantizedCompression', 2500000, 'subcomputeNode'],
  ] as const) {
    assert.equal(TECHNOLOGIES[id].tier, 22);
    assert.deepEqual(TECHNOLOGIES[id].pre, [pre]);
    assert.deepEqual(TECHNOLOGIES[id].cost, { knowledge: cost });
    state.resources.knowledge = cost;
    assert.equal(isTechnologyUnlocked(id, state), true);
    assert.equal(researchTechnologyNow(state, id).bought, true);
    assert.equal(state.resources.knowledge, 0);
  }
  for (const [id, scale] of [['subcomputeNode', 1.275], ['quantizedCompressionModule', 1.25]] as const) {
    assert.equal(isBuildingUnlocked(id, state), true);
    assert.deepEqual(BUILDINGS[id].cost, id === 'quantizedCompressionModule' ? { knowledge: 100000, bytes: 10000 } : { bytes: 10000 });
    assert.deepEqual(BUILDINGS[id].costScales, id === 'quantizedCompressionModule' ? { knowledge: scale, bytes: scale } : { bytes: scale });
    assert.equal(calculateBuildingCost(id, 1, state).bytes, 10000 * scale);
  }
  const locked = fresh();
  assert.equal(isTechnologyUnlocked('downwardProbe', locked), false);
  assert.equal(isTechnologyUnlocked('subcomputeNode', locked), false);
  assert.equal(isTechnologyUnlocked('quantizedCompression', locked), false);
  assert.equal(isBuildingUnlocked('subcomputeNode', locked), false);
  assert.equal(isBuildingUnlocked('quantizedCompressionModule', locked), false);
});

test('new T22 research, mixed costs and special-resource order match the balance update', () => {
  const state = fresh(); state.tech.push('aiCoreCalibration', 'binaryWorld', 'downwardProbe', 'subcomputeNode');
  assert.equal(isTechnologyUnlocked('dataCompressor', state), false);
  assert.equal(isTechnologyUnlocked('cpuDecoding', state), true);
  state.tech.push('quantizedCompression');
  for (const id of ['dataCompressor', 'cpuDecoding'] as const) {
    assert.equal(TECHNOLOGIES[id].tier, 22); assert.deepEqual(TECHNOLOGIES[id].cost, { knowledge: 3000000 });
    state.resources.knowledge = 3000000;
    assert.equal(researchTechnologyNow(state, id).bought, true);
  }
  assert.deepEqual(TECHNOLOGIES.dataCompressor.pre, ['quantizedCompression', 'subcomputeNode']);
  for (const [id, cost, scale] of [
    ['dataCompression', { knowledge: 50000, bytes: 10000 }, 1.285],
    ['cpuDecoder', { knowledge: 50000, bytes: 20000, nanoAlloy: 10000 }, 1.25],
  ] as const) {
    assert.equal(isBuildingUnlocked(id, state), true); assert.deepEqual(BUILDINGS[id].cost, cost);
    for (const [resource, price] of Object.entries(cost)) {
      assert.equal(BUILDINGS[id].costScales?.[resource as keyof typeof cost], scale);
      assert.ok(Math.abs(calculateBuildingCost(id, 1, state)[resource as keyof typeof cost]! - price * scale) < 1e-8);
    }
  }
  const keys = Object.keys(RESOURCES); assert.equal(keys.indexOf('bytes'), keys.indexOf('knowledge') + 1);
});

test('queued research grants exactly one free router on settlement, never enqueue', () => {
  const state = fresh(); state.buildings.penroseSphere = 1;
  assert.equal(requestPurchaseModule(state, 'tech', 'aiCoreCalibration', 0, true).status, 'queued');
  assert.equal(state.buildings.gatewayRouter, 0);
  settlePurchaseQueue(state, 0); assert.equal(state.buildings.gatewayRouter, 0);
  state.resources.knowledge = 2500000;
  settlePurchaseQueue(state, 0); settlePurchaseQueue(state, 0);
  assert.equal(state.buildings.gatewayRouter, 1);
  assert.equal(state.logs.filter(log => log.text === AI_CORE_CALIBRATION_LOG).length, 1);
  assert.equal(requestPurchaseModule(state, 'build', 'downloadExecutable', 0).status, 'buy-now');
  assert.equal(requestPurchaseModule(state, 'build', 'downloadExecutable', 0).status, 'rejected');
});

test('previous schema31 JSON gains only additive defaults and earned tech never awards load-time router', () => {
  const raw = fixture(); raw.tech.push('aiCoreCalibration');
  const before = structuredClone(raw);
  for (const value of Object.values(raw)) if (value && typeof value === 'object') Object.freeze(value);
  Object.freeze(raw);
  const state = validateCurrentSave(raw, context);
  assert.deepEqual(raw, before);
  for (const field of fields) for (const id of digitalIds) assert.equal(state[field][id], 0);
  for (const field of ['resources', 'containerAssignments', 'alloyContainerAssignments'] as const) {
    assert.equal(state[field].bytes, 0);
    assert.equal(Object.hasOwn(before[field], 'encryptedData'), false);
    assert.equal(state[field].encryptedData, 0);
  }
  assert.equal(state.downloadAllocation, 0);
  assert.deepEqual(state.tech, before.tech);
  assert.deepEqual(state.logs, before.logs);
  // Schema 32 remaps segmented queue entries to their construction-phase IDs.
  assert.deepEqual(state.queue, (before.queue as Record<string, unknown>[]).map(item => item.kind === 'build' && item.id === 'spaceRipper'
    ? { ...item, id: 'spaceRipperSegments' } : item));
  assert.deepEqual(validateCurrentSave(JSON.parse(JSON.stringify(state)), context), state);
});

test('strict digital boundaries retain explicit values and reject malformed records without repair', () => {
  for (const allocation of [0, .5, 100]) {
    const raw = fixture(); raw.downloadAllocation = allocation;
    assert.equal(validateCurrentSave(raw, context).downloadAllocation, allocation);
  }
  for (const allocation of [undefined, null, '0', false, -1, 101, Infinity, NaN, {}, []]) {
    const raw = fixture(); raw.downloadAllocation = allocation;
    assert.throws(() => validateCurrentSave(raw, context));
  }
  for (const field of fields) for (const id of digitalIds) for (const value of [undefined, null, '0', -1, .5, Infinity]) {
    const raw = fixture(); raw[field][id] = value;
    const before = structuredClone(raw);
    assert.throws(() => validateCurrentSave(raw, context));
    assert.deepEqual(raw, before);
  }
  for (const field of ['resources', 'containerAssignments', 'alloyContainerAssignments']) for (const id of ['bytes', 'encryptedData']) for (const value of [undefined, null, '0', false, -1, Infinity, NaN, {}, []]) {
    const raw = fixture(); raw[field][id] = value;
    const before = structuredClone(raw);
    assert.throws(() => validateCurrentSave(raw, context));
    assert.deepEqual(raw, before);
  }
  const malformed = fixture(); delete malformed.resources.cash;
  assert.throws(() => validateCurrentSave(malformed, context));
});
