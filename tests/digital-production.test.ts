import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { calculateProduction } from '../src/simulation/production';
import { calculateDigitalProduction, calculateDigitalSupport, createDigitalProductionPool } from '../src/simulation/digital-world';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateStorageDetails, calculateStorageTotals } from '../src/simulation/storage';
import { calculateResourceBreakdown, calculateResourceFactorRows } from '../src/simulation/resource-breakdown';
import { calculateGlobalOutputMultiplier, calculateParticleMultiplier } from '../src/simulation/crafting';
import { calculateProductionMultiplier } from '../src/simulation/multipliers';
import { supplyPower } from './support/power';
const fresh = () => createInitialState(CONFIG.version, 60, 0);
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function digital() {
  const s = fresh();
  s.buildings.gatewayRouter = 1; s.buildings.downloadExecutable = 1;
  supplyPower(s, 1000); s.downloadAllocation = 100;
  return s;
}

test('bandwidth allocates whole consumers in download/storage/cache order from paid fractional gateways', () => {
  const s = digital(); s.buildings.quantumStorage = 3; s.buildings.downloadCache = 3;
  const full = calculateDigitalSupport(s, 25);
  assert.deepEqual(full, { gatewayUnits: 1, capacity: 5, used: 5, downloadUnits: 1, quantumStorageUnits: 3, cacheUnits: 1, subcomputeUnits: 0, compressionUnits: 0, dataCompressionUnits: 0, decoderUnits: 0, cellUnits: 0, memoryUnits: 0, minerUnits: 0, decryptionUnits: 0, cpuCapacity: 0, cpuUsed: 0, softRouterUnits: 0, aesUnits: 0, worldSimulatorUnits: 0, agiComponentUnits: 0, coreCoolerUnits: 0, ascensionCoreUnits: 0, ascensionEnergyUse: 10000, energyUse: 25 });
  const partial = calculateDigitalSupport(s, 12.5);
  near(partial.gatewayUnits, .5); near(partial.capacity, 2.5);
  assert.equal(partial.used, 2); assert.equal(partial.quantumStorageUnits, 1); assert.equal(partial.cacheUnits, 0);
  assert.equal(calculateDigitalSupport(s, 4.9).downloadUnits, 0);
  s.stoppedBuildings.downloadExecutable = 1;
  assert.equal(calculateDigitalSupport(s, 5).quantumStorageUnits, 1);
});

test('1000 knowledge per second becomes one base byte before ordinary multipliers, never converts inventory or negative income', () => {
  const s = digital(); s.resources.knowledge = 5000;
  const support = calculateDigitalSupport(s, 25);
  for (const dt of [.2, 1, 3]) {
    const tracked = createDigitalProductionPool(s, support, dt);
    tracked.pool.knowledge += 1000 * dt;
    tracked.pool.knowledge -= 7 * dt;
    near(tracked.pool.knowledge, 5000 - 7 * dt);
    near(tracked.pool.bytes, calculateProductionMultiplier('bytes', s.happiness, s) * calculateGlobalOutputMultiplier('bytes', s) * dt);
    near(tracked.result().byteProduction, calculateProductionMultiplier('bytes', s.happiness, s) * calculateGlobalOutputMultiplier('bytes', s));
  }
  near(calculateDigitalProduction(s, support, -100).byteProduction, 0);
  near(calculateProduction(s).rates.bytes, 0);
});

test('allocation intercepts funded positive production with pure preview and exact breakdown', () => {
  const s = digital(); s.buildings.lab = 1; s.workers.lab = 1;
  const before = structuredClone(s);
  for (const dt of [.2, 1, 3]) {
    s.downloadAllocation = 0; const plain = calculateProduction(s, dt);
    s.downloadAllocation = 50; const half = calculateProduction(s, dt);
    s.downloadAllocation = 100; const full = calculateProduction(s, dt);
    assert.ok(plain.rates.knowledge > 0);
    near(half.rates.knowledge, plain.rates.knowledge / 2);
    near(full.rates.knowledge, 0);
    near(full.rates.bytes, plain.rates.knowledge * .001 * calculateProductionMultiplier('bytes', full.morale.happiness, s) * calculateGlobalOutputMultiplier('bytes', s));
    near(full.pool.bytes, full.rates.bytes * dt);
    assert.deepEqual(full.power, { generated: 1000, used: 25, available: 975 });
    near(full.rates.energy, 975);
    for (const id of ['knowledge', 'bytes', 'energy'] as const) near(calculateResourceBreakdown(id, s, full).net, full.rates[id]);
  }
  assert.deepEqual(s, before);
});

test('byte conversion applies ordinary production factors and active cache once; storage follows the prestige bonuses', () => {
  const s = digital(); s.buildings.quantumStorage = 2; s.buildings.downloadCache = 2;
  s.prestige.particles = 10000; s.prestige.darkEnergy = 100;
  s.achievements = ['nuclearCuriosity']; s.achievementLevels = { nuclearCuriosity: 3 };
  const support = calculateDigitalSupport(s, 25);
  near(calculateDigitalProduction(s, support, 1000).byteProduction, calculateProductionMultiplier('bytes', s.happiness, s) * calculateGlobalOutputMultiplier('bytes', s) * 1.2);
  assert.ok(calculateParticleMultiplier('bytes', s) > 1);
  const snapshot = calculateSupportPreview(s);
  const storage = { ...snapshot, moonBaseUnits: snapshot.moon.baseUnits };
  // 字节 opts into the prestige storage bonuses (0.9.43): 30000 of capacity plus the
  // 100 暗能量 (each +1%) doubling it. The building-sourced subtotal is still what the
  // 暗能量 row scales, so the detail rows and the batched total agree.
  const bytesDetail = calculateStorageDetails('bytes', s, storage);
  assert.equal(bytesDetail.rows.find(row => row.name === '基础储量')!.value + bytesDetail.rows.find(row => row.name === '量子存储器 ×2')!.value, 30000);
  near(calculateStorageTotals(s, storage).bytes, 60000);
  near(calculateStorageDetails('bytes', s, storage).total, 60000);
  const names = calculateResourceFactorRows('bytes', s, calculateProduction(s)).rows.map(r => r.name);
  assert.deepEqual(names, ['精通', '下载缓存器', '粒子']);
  assert.ok(!calculateResourceBreakdown('bytes', s, calculateProduction(s)).entries.some(row => row.id === 'digitalDownload'));
  s.buildings.lab = 1; s.workers.lab = 1;
  assert.ok(calculateResourceFactorRows('bytes', s, calculateProduction(s)).rows.some(row => row.name === 'dl.exe 下载'));
  assert.ok(calculateResourceBreakdown('bytes', s, calculateProduction(s)).entries.some(row => row.id === 'digitalDownload'));
});

test('full allocation diverts only live production, and synthesis never draws on stored knowledge', () => {
  const s = digital(); s.buildings.lab = 1; s.workers.lab = 1; s.buildings.biologyLab = 1;
  s.tech.push('geneSynthesis'); s.crispr.push('geneSplicing'); s.arpaBuildings.geneSequencing = 1;
  s.geneModification.synthesis.C = 100; // dl.exe takes everything, so synthesis sees nothing
  s.resources.knowledge = 100;
  const funded = calculateProduction(s);
  // dl.exe diverts 100% of the knowledge that arrives, leaving nothing for synthesis.
  near(funded.geneSynthesis.knowledge, 0);
  assert.ok(funded.rates.bytes > 0);
  // Stored knowledge is never spent by synthesis: the pool still holds the reserve.
  near(funded.pool.knowledge, s.resources.knowledge);
  near(calculateResourceBreakdown('knowledge', s, funded).net, funded.rates.knowledge);
  const before = s.resources.knowledge;
  s.resources.knowledge = 0;
  const starved = calculateProduction(s);
  near(starved.geneSynthesis.knowledge, 0);
  near(starved.rates.bytes, funded.rates.bytes);
  assert.equal(before, 100, 'fixture untouched');
});

test('CPU uses whole bandwidth-funded nodes and powers knowledge capacity only while supported', () => {
  const s = digital(); s.buildings.subcomputeNode = 3; s.buildings.quantizedCompressionModule = 5;
  const before = structuredClone(s);
  const full = calculateProduction(s);
  assert.equal(full.digital.subcomputeUnits, 1);
  assert.equal(full.digital.used, 4);
  assert.equal(full.digital.cpuCapacity, 2);
  assert.equal(full.digital.cpuUsed, 2);
  assert.equal(full.inputUnits.subcomputeNode, 1);
  assert.equal(full.inputUnits.quantizedCompressionModule, 2);
  const snapshot = calculateSupportPreview(s);
  const storage = { ...snapshot, moonBaseUnits: snapshot.moon.baseUnits };
  const base = fresh(); const baseSnapshot = calculateSupportPreview(base);
  const baseline = calculateStorageTotals(base, { ...baseSnapshot, moonBaseUnits: baseSnapshot.moon.baseUnits }).knowledge;
  near(calculateStorageTotals(s, storage).knowledge, baseline + 200000);
  near(calculateStorageDetails('knowledge', s, storage).total, baseline + 200000);
  assert.deepEqual(s, before);
  s.stoppedBuildings.subcomputeNode = 3;
  const stopped = calculateSupportPreview(s);
  assert.equal(stopped.digital.cpuCapacity, 0);
  near(calculateStorageTotals(s, { ...stopped, moonBaseUnits: stopped.moon.baseUnits }).knowledge, baseline);
  s.stoppedBuildings.subcomputeNode = 0; s.stoppedBuildings.quantizedCompressionModule = 4;
  assert.equal(calculateDigitalSupport(s, 25).compressionUnits, 1);
  supplyPower(s, 0);
  assert.equal(calculateProduction(s).digital.cpuUsed, 0);
  // 2.5 bandwidth cannot fund a 3-bandwidth node, even with downloads stopped.
  s.stoppedBuildings.downloadExecutable = 1;
  assert.equal(calculateDigitalSupport(s, 12.5).subcomputeUnits, 0);
  s.buildings.gatewayRouter = 2;
  const expanded = calculateDigitalSupport(s, 50);
  assert.equal(expanded.subcomputeUnits, 3); assert.equal(expanded.cpuCapacity, 6);
});

test('digital compression and CPU decoding use funded units, additive capacity and fixed byte output', () => {
  const s = digital(); s.buildings.gatewayRouter = 4; s.buildings.subcomputeNode = 3;
  s.buildings.quantumStorage = 2; s.buildings.quantizedCompressionModule = 2;
  s.buildings.dataCompression = 2; s.buildings.cpuDecoder = 2;
  const before = structuredClone(s);
  for (const dt of [.2, 1, 3]) {
    const p = calculateProduction(s, dt);
    assert.equal(p.digital.dataCompressionUnits, 2); assert.equal(p.digital.decoderUnits, 2);
    assert.equal(p.digital.cpuUsed, 6); assert.equal(p.digital.used, 16);
    near(p.rates.bytes, 200); near(p.pool.bytes, 200 * dt);
    near(calculateResourceBreakdown('bytes', s, p).net, 200);
    const snap = calculateSupportPreview(s, dt); const storage = { ...snap, moonBaseUnits: snap.moon.baseUnits };
    near(calculateStorageTotals(s, storage).bytes, 40000);
    near(calculateStorageDetails('bytes', s, storage).total, 40000);
    near(calculateStorageTotals(s, storage).knowledge, 241000);
    near(calculateStorageDetails('knowledge', s, storage).total, 241000);
  }
  assert.deepEqual(s, before);
  s.stoppedBuildings.cpuDecoder = 2;
  near(calculateProduction(s).rates.bytes, 0);
  let snap = calculateSupportPreview(s);
  near(calculateStorageTotals(s, { ...snap, moonBaseUnits: snap.moon.baseUnits }).knowledge, 201000);
  s.stoppedBuildings.dataCompression = 2;
  snap = calculateSupportPreview(s);
  near(calculateStorageTotals(s, { ...snap, moonBaseUnits: snap.moon.baseUnits }).bytes, 30000);
  s.stoppedBuildings.cpuDecoder = 0; s.buildings.gatewayRouter = 2;
  // Earlier consumers leave only 1 bandwidth: decoder must receive no partial unit.
  assert.equal(calculateProduction(s).digital.decoderUnits, 0);
});

test('data compression boosts only supported freight capacity with additive percentages', () => {
  const s = digital(); s.buildings.gatewayRouter = 2; s.buildings.subcomputeNode = 1;
  s.tech.push('fieldConstraintTheory', 'dimensionBeaconDeployment');
  s.buildings.dataCompression = 2; s.buildings.anchorFreightStation = 1;
  s.buildings.hyperspaceSpaceport = 1; s.buildings.constraintArray = 3;
  supplyPower(s, 100000); s.resources.helium3 = 100000; s.resources.e710 = 1000;
  const snap = calculateSupportPreview(s); assert.equal(snap.stageThree.freight, 1);
  const total = calculateStorageTotals(s, { ...snap, moonBaseUnits: snap.moon.baseUnits }).wood;
  const details = calculateStorageDetails('wood', s, { ...snap, moonBaseUnits: snap.moon.baseUnits });
  near(details.rows.find(row => row.name.startsWith('锚点货运站'))!.value, 44800);
  near(details.total, total);
  s.stoppedBuildings.dataCompression = 2;
  const stopped = calculateSupportPreview(s);
  near(total - calculateStorageTotals(s, { ...stopped, moonBaseUnits: stopped.moon.baseUnits }).wood, 12800);
});

test('gateway reservation is paid once and cannot be spent again by upstream support', () => {
  const s = digital(); supplyPower(s, 25); s.buildings.biologyLab = 1;
  const result = calculateProduction(s);
  near(result.digital.gatewayUnits, 1); near(result.inputUnits.biologyLab || 0, 0);
  assert.deepEqual(result.power, { generated: 25, used: 25, available: -2 });
  near(result.rates.energy, -2); near(result.pool.energy, 0);
  supplyPower(s, 0);
  assert.equal(calculateProduction(s).digital.used, 0);
});
