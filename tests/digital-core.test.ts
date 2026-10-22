import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import { createInitialState } from '../src/state/create-state';
import { isBuildingUnlocked, isResourceUnlocked, isTechnologyUnlocked } from '../src/simulation/unlocks';
import { calculateDigitalProduction, calculateDigitalSupport, calculateDigitalByteCapacity } from '../src/simulation/digital-world';
import { calculateProduction } from '../src/simulation/production';
import { calculateStorageDetails, calculateStorageTotals } from '../src/simulation/storage';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateResourceBreakdown, calculateResourceFactorRows } from '../src/simulation/resource-breakdown';
import { calculateGlobalOutputMultiplier } from '../src/simulation/crafting';
import { calculateProductionMultiplier } from '../src/simulation/multipliers';
import { supplyPower } from './support/power';

const fresh = () => createInitialState(CONFIG.version, 60, 0);
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
function storage(state: ReturnType<typeof fresh>) {
  const preview = calculateSupportPreview(state);
  return { ...preview, moonBaseUnits: preview.moon.baseUnits };
}

test('core technology costs, prerequisites and live unlocks are explicit', () => {
  const cases = [
    ['deepCore', { knowledge: 3500000, bytes: 100000 }, ['downwardProbe', 'subcomputeNode', 'cpuDecoding']],
    ['neuralNetwork', { knowledge: 4000000, bytes: 500000 }, ['deepCore']],
    ['layer3Switch', { knowledge: 4000000, bytes: 500000 }, ['deepCore']],
    ['cryptocurrency', { knowledge: 4000000, bytes: 250000 }, ['deepCore']],
    ['encryptedDataAnalysis', { knowledge: 5000000, bytes: 1000000 }, ['deepCore']],
    ['cellMultithreading', { knowledge: 5000000, bytes: 1000000, encryptedData: 10000 }, ['encryptedDataAnalysis']],
  ] as const;
  for (const [id, cost, pre] of cases) {
    assert.deepEqual(TECHNOLOGIES[id].cost, cost);
    assert.deepEqual(TECHNOLOGIES[id].pre, pre);
    const state = fresh();
    assert.equal(isTechnologyUnlocked(id, state), false);
    state.tech.push(...pre);
    assert.equal(isTechnologyUnlocked(id, state), true);
    state.tech.pop();
    assert.equal(isTechnologyUnlocked(id, state), false);
  }
  const state = fresh();
  for (const id of ['cellCore', 'memoryCore', 'ethMiner', 'dataDecryptionModule']) assert.equal(isBuildingUnlocked(id, state), false);
  assert.equal(isResourceUnlocked('encryptedData', state), false);
  state.tech.push('deepCore', 'cryptocurrency', 'encryptedDataAnalysis');
  for (const id of ['cellCore', 'memoryCore', 'ethMiner', 'dataDecryptionModule']) assert.equal(isBuildingUnlocked(id, state), true);
  assert.equal(isResourceUnlocked('encryptedData', state), true);
});

test('CELL and powered consumers require fully funded units; multithreading grants four CPU', () => {
  const state = fresh(); state.buildings.cellCore = 2;
  assert.equal(calculateDigitalSupport(state, 24.9).cellUnits, 0);
  assert.equal(calculateDigitalSupport(state, 49.9).cellUnits, 1);
  assert.equal(calculateDigitalSupport(state, 50).cpuCapacity, 6);
  state.tech.push('cellMultithreading');
  assert.equal(calculateDigitalSupport(state, 50).cpuCapacity, 8);
  state.buildings.cellCore = 1; state.buildings.memoryCore = 1; state.buildings.ethMiner = 1;
  assert.equal(calculateDigitalSupport(state, 29.9).memoryUnits, 0);
  assert.equal(calculateDigitalSupport(state, 30).memoryUnits, 1);
  assert.equal(calculateDigitalSupport(state, 39.9).minerUnits, 0);
  assert.equal(calculateDigitalSupport(state, 40).minerUnits, 1);
  for (const dt of [.2, 3]) assert.equal(calculateDigitalSupport(state, 40 * dt, dt).minerUnits, 1);
});

test('memory capacity uses only active compression and encrypted analysis unlock', () => {
  const state = fresh(); supplyPower(state, 1000);
  state.buildings.cellCore = 1; state.buildings.memoryCore = 2; state.buildings.dataCompression = 1;
  const snapshot = storage(state);
  near(calculateDigitalByteCapacity(snapshot.digital), 10000 + 2 * 50000 * 1.15);
  near(calculateStorageTotals(state, snapshot).bytes, 125000);
  near(calculateStorageDetails('bytes', state, snapshot).total, 125000);
  near(calculateStorageTotals(state, snapshot).encryptedData, 50000);
  state.tech.push('encryptedDataAnalysis');
  state.prestige.particles = 10000; state.prestige.darkEnergy = 100;
  near(calculateStorageTotals(state, snapshot).encryptedData, 100000);
  near(calculateStorageDetails('encryptedData', state, snapshot).total, 100000);
  state.stoppedBuildings.memoryCore = 1;
  near(calculateStorageTotals(state, storage(state)).encryptedData, 75000);
});

test('miners apply ordinary cash production multipliers once and grant only supported capacity', () => {
  const state = fresh(); supplyPower(state, 1000); state.resources.cash = 0;
  state.buildings.cellCore = 1; state.buildings.ethMiner = 2;
  state.prestige.particles = 10000; state.prestige.darkEnergy = 100;
  state.achievements = ['nuclearCuriosity']; state.achievementLevels = { nuclearCuriosity: 3 };
  state.government = 'industrialism';
  const before = structuredClone(state);
  const output = calculateProduction(state);
  const expected = 1024 * calculateProductionMultiplier('cash', output.morale.happiness, state) * calculateGlobalOutputMultiplier('cash', state);
  assert.ok(expected > 1024);
  near(output.digital.minerProduction, expected);
  near(output.rates.cash, expected);
  near(calculateResourceBreakdown('cash', state, output).net, output.rates.cash);
  // Cash remains ordinary storage: measure the miner's base contribution without dark-energy storage boosts.
  state.prestige.darkEnergy = 0;
  const supportedCap = calculateStorageTotals(state, storage(state)).cash;
  state.stoppedBuildings.ethMiner = 2;
  const idleCap = calculateStorageTotals(state, storage(state)).cash;
  near(supportedCap - idleCap, 1024000);
  near(calculateProduction(state).digital.minerProduction, 0);
  state.stoppedBuildings.ethMiner = 0; state.prestige.darkEnergy = 100;
  assert.deepEqual(state, before);
});

test('two-CPU decryption admits whole modules and applies ordinary factors and per-module boost once', () => {
  const state = fresh(); supplyPower(state, 1000);
  state.buildings.cellCore = 1; state.buildings.dataDecryptionModule = 7;
  state.prestige.particles = 10000; state.achievements = ['nuclearCuriosity']; state.achievementLevels = { nuclearCuriosity: 3 };
  const before = structuredClone(state);
  const support = calculateDigitalSupport(state, 25);
  assert.equal(support.decryptionUnits, 1); assert.equal(support.cpuUsed, 2);
  state.tech.push('cellMultithreading');
  assert.equal(calculateDigitalSupport(state, 25).decryptionUnits, 2);
  state.tech.pop();
  const expected = .01 * 1.25 * calculateProductionMultiplier('encryptedData', state.happiness, state) * calculateGlobalOutputMultiplier('encryptedData', state);
  near(calculateDigitalProduction(state, support, 0).encryptedProduction, expected);
  const result = calculateProduction(state);
  near(result.rates.encryptedData, .01 * 1.25 * calculateProductionMultiplier('encryptedData', result.morale.happiness, state) * calculateGlobalOutputMultiplier('encryptedData', state));
  near(calculateResourceBreakdown('encryptedData', state, result).net, result.rates.encryptedData);
  // Ordinary morale and particle factors are now displayed for digital output too.
  for (const happiness of [50, 150]) {
    const rows = calculateResourceFactorRows('encryptedData', state, { ...result, morale: { ...result.morale, happiness } }).rows;
    assert.deepEqual(rows.map(row => row.name), ['数据解密模块', '数据解密模块产量加成', '粒子', '幸福度', '精通']);
    assert.equal(rows[0]!.value, '+0.01/s');
    assert.equal(rows[1]!.value, '+25%');
  }
  assert.deepEqual(state, before);
});

test('neural quantum bonus boosts both byte sources; layer3 bandwidth grants whole consumers', () => {
  const state = fresh(); supplyPower(state, 1000);
  state.buildings.gatewayRouter = 1; state.buildings.downloadExecutable = 1;
  state.buildings.cellCore = 1; state.buildings.cpuDecoder = 2; state.downloadAllocation = 100;
  const support = calculateDigitalSupport(state, 50);
  const baseline = calculateDigitalProduction(state, support, 1000, 12.5);
  state.tech.push('neuralNetwork');
  const boosted = calculateDigitalProduction(state, support, 1000, 12.5);
  near(boosted.byteProduction, baseline.byteProduction * 1.125);
  near(boosted.decoderProduction, baseline.decoderProduction * 1.125);
  state.buildings.quantumStorage = 10;
  assert.equal(calculateDigitalSupport(state, 50).quantumStorageUnits, 4);
  state.tech.push('layer3Switch');
  const upgraded = calculateDigitalSupport(state, 50);
  near(upgraded.capacity, 7.5); assert.equal(upgraded.quantumStorageUnits, 6);
  // 实验室 holds 1000 knowledge each since the balance pass; 300 keeps the
  // logarithmic quantum level safely above 1 so the neural bonus applies.
  state.buildings.quantumStorage = 0; state.buildings.lab = 300; state.workers.lab = 1;
  state.tech.push('artificialIntelligenceII');
  const before = structuredClone(state);
  for (const dt of [.2, 1, 3]) {
    const result = calculateProduction(state, dt);
    assert.ok(result.digital.neuralMultiplier > 1);
    near(result.rates.bytes, result.digital.byteProduction + result.digital.decoderProduction);
    for (const id of ['bytes', 'knowledge', 'energy'] as const) near(calculateResourceBreakdown(id, state, result).net, result.rates[id]);
  }
  assert.deepEqual(state, before);
});
