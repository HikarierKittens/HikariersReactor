import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInitialState } from '../src/state/create-state';
import { CONFIG } from '../src/data/config';
import { calculateDigitalSupport, settleDigitalSupport, calculateDigitalProduction } from '../src/simulation/digital-world';
import { isTechnologyUnlocked, isBuildingUnlocked } from '../src/simulation/unlocks';

test('new digital support pays exact whole-unit upkeep, respects stopped cores and cooler floor', () => {
  for (const dt of [.2, 1]) {
    const s = createInitialState(CONFIG.version, 600, 0);
    s.buildings.softRouterNode = 2; s.buildings.worldSimulator = 1;
    s.buildings.agiCoreComponent = 100; s.buildings.agiAscensionCore = 100;
    s.resources.energy = 20000; s.resources.water = 2000;
    const pool = { ...s.resources };
    const d = settleDigitalSupport(s, pool, dt);
    assert.equal(d.cpuCapacity, 6); assert.equal(d.capacity, 8);
    assert.equal(d.worldSimulatorUnits, 1); assert.equal(d.agiComponentUnits, 1); assert.equal(d.ascensionCoreUnits, 1);
    assert.equal(pool.energy, s.resources.energy - (20 + 10 + 100 + 10000) * dt);
    assert.equal(pool.water, s.resources.water - 1000 * dt);
    const dryPool = { ...s.resources, water: 0 };
    assert.equal(settleDigitalSupport(s, dryPool, dt).agiComponentUnits, 0, 'funding reads the actual post-plant water pool');
    s.resources.water = 0;
    assert.equal(calculateDigitalSupport(s, 10000 * dt, dt).agiComponentUnits, 0);
    s.stoppedBuildings.agiAscensionCore = 1;
    assert.equal(calculateDigitalSupport(s, 20000, dt).ascensionCoreUnits, 0);
    s.stoppedBuildings.agiAscensionCore = 0; s.buildings.coreCooler = 101;
    assert.equal(calculateDigitalSupport(s, 0, dt).ascensionEnergyUse, 0);
    assert.equal(calculateDigitalSupport(s, 0, dt).ascensionCoreUnits, 1);
    s.buildings.agiCoreComponent = 99;
    assert.equal(calculateDigitalSupport(s, 20000, dt).agiComponentUnits, 0);
  }
});

test('soft routers consume power and only paid whole nodes provide CPU and bandwidth', () => {
  for (const dt of [.2, 1]) {
    const s = createInitialState(CONFIG.version, 600, 0);
    s.buildings.softRouterNode = 2;
    for (const [energyRate, units] of [[0, 0], [9, 0], [10, 1], [19, 1], [20, 2]]) {
      const pool = { ...s.resources, energy: energyRate! * dt };
      const support = settleDigitalSupport(s, pool, dt);
      assert.equal(support.softRouterUnits, units);
      assert.equal(support.cpuCapacity, units! * 3);
      assert.equal(support.capacity, units! * 4);
      assert.equal(support.energyUse, units! * 10);
      assert.ok(Math.abs(pool.energy - (energyRate! - units! * 10) * dt) < 1e-7);
    }
    s.stoppedBuildings.softRouterNode = 1;
    assert.equal(calculateDigitalSupport(s, 100, dt).softRouterUnits, 1);
  }
});

test('AGI multiplies both byte sources and decryption boosts AES without duplicate credits', () => {
  const s = createInitialState(CONFIG.version, 600, 0);
  s.buildings.softRouterNode = 3; s.buildings.downloadExecutable = 1;
  s.buildings.cpuDecoder = 1; s.buildings.aesComputeModule = 1; s.buildings.dataDecryptionModule = 1;
  s.buildings.agiCoreComponent = 100; s.resources.water = 2000; s.resources.energy = 1000; s.downloadAllocation = 100;
  const d = calculateDigitalSupport(s, 1000);
  const p = calculateDigitalProduction(s, d, 1000, 0, 100);
  assert.equal(p.byteProduction, 1.5); assert.equal(p.decoderProduction, 150);
  assert.equal(p.encryptedProduction, (.01 + .005) * 1.25);
});

test('digital ascension needs completed component; simulator needs high precision technology', () => {
  const s = createInitialState(CONFIG.version, 600, 0);
  s.tech.push('agi'); s.buildings.agiCoreComponent = 99;
  assert.equal(isTechnologyUnlocked('digitalAscension', s), false);
  s.buildings.agiCoreComponent = 100;
  assert.equal(isTechnologyUnlocked('digitalAscension', s), true);
  s.tech.push('digitalSimulation');
  assert.equal(isBuildingUnlocked('worldSimulator', s), false);
  s.tech.push('highPrecisionWorldSimulation');
  assert.equal(isBuildingUnlocked('worldSimulator', s), true);
});
