import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateHousingDetails } from '../src/simulation/housing';
import { calculateMorale } from '../src/simulation/morale';
import { calculateProduction, previewMorale } from '../src/simulation/production';
import { advanceSoldierTraining } from '../src/simulation/military';
import { calculateOperationalSoldierCapacity, calculateSoldierCapacity } from '../src/simulation/government';
import { calculateKnowledgeMultiplier, calculateProductionMultiplier, calculateChallengeAcceleratorMultiplier, calculateFactoryOutputMultiplier } from '../src/simulation/multipliers';
import { calculateQuantumSnapshot } from '../src/simulation/quantum';
import { calculateResourceBreakdown } from '../src/simulation/resource-breakdown';
import { supplyPower } from './support/power';

const fresh = () => createInitialState(CONFIG.version, 60, 0);
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const moralePower = { generatorSpeed: 0, generatorEnergy: 0, coalRatio: 1, moonBaseUnits: 0, biologyUnits: 0, dataCenterUnits: 0 };

test('world simulator housing and training use paid units, never owned or stopped capacity', () => {
  const s = fresh(); s.buildings.worldSimulator = 2; s.tech.push('military');
  const support = calculateSupportPreview(s);
  const housing = (units: number) => calculateHousingDetails(s, support.asriel, support.stageThree, { worldSimulatorUnits: units }).find(row => row.name === '世界模拟器')!;
  assert.equal(housing(0).value, 0); assert.equal(housing(1).value, 8);
  assert.equal(calculateSoldierCapacity(s), 8);
  assert.equal(calculateOperationalSoldierCapacity(s, 0, { worldSimulatorUnits: 1 }), 4);
  advanceSoldierTraining(s, 30, 0, { worldSimulatorUnits: 1 }); assert.equal(s.soldiers, 1);
  advanceSoldierTraining(s, 30, 0, { worldSimulatorUnits: 0 }); assert.equal(s.soldiers, 1);
  s.stoppedBuildings.worldSimulator = 2;
  assert.equal(calculateOperationalSoldierCapacity(s, 0, { worldSimulatorUnits: 2 }), 0);
});

test('funded simulator grants five morale and cap; funded AGI grants twenty-five raw only', () => {
  const s = fresh(); s.buildings.worldSimulator = 10; s.buildings.agiCoreComponent = 100;
  const off = calculateMorale(s, 1, { ...moralePower, digital: { worldSimulatorUnits: 0, agiComponentUnits: 0 } });
  const on = calculateMorale(s, 1, { ...moralePower, digital: { worldSimulatorUnits: 1, agiComponentUnits: 1 } });
  assert.equal(on.worldSimulator, 5); assert.equal(on.agi, 25); assert.equal(on.cap - off.cap, 5);
  // Existing capacity-based soldier pressure also applies to the four new funded places.
  near(on.raw - off.raw, 26);
});

test('AES knowledge bonus requires explicit funded context and preserves ordinary library bonuses', () => {
  const s = fresh(); s.buildings.aesComputeModule = 5; s.buildings.library = 2;
  const ordinary = calculateKnowledgeMultiplier(s, 0);
  near(calculateKnowledgeMultiplier(s, 0, { aesUnits: 0 }), ordinary);
  near(calculateKnowledgeMultiplier(s, 0, { aesUnits: 2 }), ordinary + .2);
  near(calculateKnowledgeMultiplier(s, 1, { aesUnits: 2 }), ordinary + .3);
});

test('AES funded knowledge bonus reaches actual production and resource breakdown exactly once', () => {
  const s = fresh(); s.buildings.cellCore = 1; s.buildings.aesComputeModule = 1;
  supplyPower(s, 1000); s.buildings.lab = 1; s.workers.lab = 1;
  for (const dt of [.2, 1]) {
    const on = calculateProduction(s, dt);
    assert.equal(on.digital.aesUnits, 1);
    s.stoppedBuildings.aesComputeModule = 1;
    const off = calculateProduction(s, dt);
    s.stoppedBuildings.aesComputeModule = 0;
    near(on.rates.knowledge, off.rates.knowledge * 1.1);
    near(calculateResourceBreakdown('knowledge', s, on).net, on.rates.knowledge);
  }
});

test('funded AGI adds fifty percentage points to the base quantum multiplier alongside supercores', () => {
  const s = fresh(); s.buildings.agiCoreComponent = 100;
  const support = calculateSupportPreview(s);
  const snapshot = { ...support, moonBaseUnits: support.moon.baseUnits };
  const funded = { ...snapshot, digital: { ...support.digital, agiComponentUnits: 1 } };
  assert.equal(calculateQuantumSnapshot(s, funded, 4).level, 0, 'AGI never bypasses AI II');
  s.tech.push('artificialIntelligenceII'); s.buildings.library = 100;
  for (const cores of [0, 4]) {
    const off = calculateQuantumSnapshot(s, { ...snapshot, digital: { ...support.digital, agiComponentUnits: 0 } }, cores);
    const on = calculateQuantumSnapshot(s, funded, cores);
    assert.ok(on.base > 0); near(on.agi, .5);
    near(off.level, Math.floor(off.base * (1 + .25 * cores) * 100) / 100);
    near(on.level, Math.floor(on.base * (1 + .25 * cores + .5) * 100) / 100);
  }
});

test('funded production previews agree at fractional and whole ticks without recursion or mutation', () => {
  for (const dt of [.2, 1]) {
    const s = fresh(); s.buildings.cellCore = 1; s.buildings.worldSimulator = 1;
    s.buildings.agiCoreComponent = 100;
    s.buildings.lab = 1; s.workers.lab = 1;
    supplyPower(s, 1000); s.resources.water = 10000;
    const before = structuredClone(s), result = calculateProduction(s, dt);
    assert.equal(result.digital.worldSimulatorUnits, 1); assert.equal(result.digital.agiComponentUnits, 1);
    assert.equal(result.digital.aesUnits, 0);
    near(result.morale.worldSimulator, 5); near(result.morale.agi, 25);
    near(result.quantum.agi, .5); near(previewMorale(s, dt).happiness, result.morale.happiness);
    near(calculateQuantumSnapshot(s, undefined, undefined, dt).agi, .5);
    assert.deepEqual(s, before);
    supplyPower(s, 0);
    const off = calculateProduction(s, dt);
    assert.equal(off.digital.worldSimulatorUnits, 0); assert.equal(off.digital.agiComponentUnits, 0);
    near(off.morale.worldSimulator, 0); near(off.morale.agi, 0); near(off.quantum.agi, 0);
  }
});

test('bytes and encrypted data participate in ordinary happiness, accelerator and factory mechanics', () => {
  const s = fresh();
  s.challenge.genes = ['particleImbalance']; s.buildings.particleAccelerator = 3;
  for (const resource of ['bytes', 'encryptedData'] as const) {
    near(calculateProductionMultiplier(resource, 140, s), calculateProductionMultiplier('wood', 140, s));
    near(calculateChallengeAcceleratorMultiplier(resource, s), 1.15);
    const before = calculateFactoryOutputMultiplier(resource, 140, s, 1);
    s.government = 'industrialism';
    near(calculateFactoryOutputMultiplier(resource, 140, s, 1), before * 1.25);
    s.government = 'none';
  }
});
