import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { calculateProduction } from '../src/simulation/production';
import { calculateDigitalProduction, calculateDigitalSupport, createDigitalProductionPool } from '../src/simulation/digital-world';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateStorageDetails, calculateStorageTotals } from '../src/simulation/storage';
import { calculateResourceBreakdown, calculateResourceFactorRows } from '../src/simulation/resource-breakdown';
import { calculateMasteryMultiplier, calculateParticleMultiplier } from '../src/simulation/crafting';
const fresh = () => createInitialState(CONFIG.version, 60, 0);
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function digital() {
  const s = fresh();
  s.buildings.gatewayRouter = 1; s.buildings.downloadExecutable = 1;
  s.resources.energy = 1000; s.downloadAllocation = 100;
  return s;
}

test('bandwidth allocates whole consumers in download/storage/cache order from paid fractional gateways', () => {
  const s = digital(); s.buildings.quantumStorage = 3; s.buildings.downloadCache = 3;
  const full = calculateDigitalSupport(s, 25);
  assert.deepEqual(full, { gatewayUnits: 1, capacity: 5, used: 5, downloadUnits: 1, quantumStorageUnits: 3, cacheUnits: 1 });
  const partial = calculateDigitalSupport(s, 12.5);
  near(partial.gatewayUnits, .5); near(partial.capacity, 2.5);
  assert.equal(partial.used, 2); assert.equal(partial.quantumStorageUnits, 1); assert.equal(partial.cacheUnits, 0);
  assert.equal(calculateDigitalSupport(s, 4.9).downloadUnits, 0);
  s.stoppedBuildings.downloadExecutable = 1;
  assert.equal(calculateDigitalSupport(s, 5).quantumStorageUnits, 1);
});

test('1000 knowledge per second becomes 10 bytes, never converts inventory or negative income', () => {
  const s = digital(); s.resources.knowledge = 5000;
  const support = calculateDigitalSupport(s, 25);
  for (const dt of [.2, 1, 3]) {
    const tracked = createDigitalProductionPool(s, support, dt);
    tracked.pool.knowledge += 1000 * dt;
    tracked.pool.knowledge -= 7 * dt;
    near(tracked.pool.knowledge, 5000 - 7 * dt);
    near(tracked.pool.bytes, 10 * dt);
    near(tracked.result().byteProduction, 10);
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
    near(full.rates.bytes, plain.rates.knowledge * .01);
    near(full.pool.bytes, full.rates.bytes * dt);
    near(full.rates.energy, -25);
    for (const id of ['knowledge', 'bytes', 'energy'] as const) near(calculateResourceBreakdown(id, s, full).net, full.rates[id]);
  }
  assert.deepEqual(s, before);
});

test('byte conversion bonus is mastery once and active cache only; storage ignores globals', () => {
  const s = digital(); s.buildings.quantumStorage = 2; s.buildings.downloadCache = 2;
  s.prestige.particles = 10000; s.prestige.darkEnergy = 100;
  s.achievements = ['nuclearCuriosity']; s.achievementLevels = { nuclearCuriosity: 3 };
  const support = calculateDigitalSupport(s, 25);
  near(calculateDigitalProduction(s, support, 1000).byteProduction, 10 * calculateMasteryMultiplier('bytes', s) * 1.2);
  near(calculateParticleMultiplier('bytes', s), 1);
  const snapshot = calculateSupportPreview(s);
  const storage = { ...snapshot, moonBaseUnits: snapshot.moon.baseUnits };
  near(calculateStorageTotals(s, storage).bytes, 30000);
  near(calculateStorageDetails('bytes', s, storage).total, 30000);
  const names = calculateResourceFactorRows('bytes', s, calculateProduction(s)).rows.map(r => r.name);
  assert.deepEqual(names, ['dl.exe 下载', '精通', '下载缓存器']);
});

test('full allocation leaves ongoing synthesis negative, and starved costs cannot spend redirected production', () => {
  const s = digital(); s.buildings.lab = 1; s.workers.lab = 1; s.buildings.biologyLab = 1;
  s.tech.push('geneSynthesis'); s.crispr.push('geneSplicing'); s.arpaBuildings.geneSequencing = 1;
  s.geneModification.synthesis.C = 1;
  s.resources.knowledge = 100;
  const funded = calculateProduction(s);
  near(funded.rates.knowledge, -100); near(funded.geneSynthesis.knowledge, 100);
  assert.ok(funded.rates.bytes > 0);
  near(calculateResourceBreakdown('knowledge', s, funded).net, -100);
  s.resources.knowledge = 0;
  const starved = calculateProduction(s);
  near(starved.rates.knowledge, 0); near(starved.geneSynthesis.knowledge, 0);
  near(starved.rates.bytes, funded.rates.bytes);
});

test('gateway reservation is paid once and cannot be spent again by upstream support', () => {
  const s = digital(); s.resources.energy = 25; s.buildings.biologyLab = 1;
  const result = calculateProduction(s);
  near(result.digital.gatewayUnits, 1); near(result.inputUnits.biologyLab || 0, 0);
  near(result.rates.energy, -25); near(result.pool.energy, 0);
  s.resources.energy = 0;
  assert.equal(calculateProduction(s).digital.used, 0);
});
