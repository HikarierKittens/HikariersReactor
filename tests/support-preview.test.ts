import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInitialState } from '../src/state/create-state';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateProduction, previewMorale } from '../src/simulation/production';
import { calculateBiologyUnits, calculateDataCenterUnits } from '../src/simulation/research-power';
import { capacity, moonSnapshot, moraleSnapshot, storageCap, storageSnapshot } from '../src/vue/format';
import { createRuntime } from '../src/app/runtime';

import { constructBuildingState, buyBuildingsInBatch, requestPurchaseModule, settlePurchaseQueue } from '../src/simulation/purchases';
import { CONFIG } from '../src/data/config';
import { createMilestoneState } from './fixtures/milestones';
import { addPower, supplyPower } from './support/power';
import type { GameState } from '../src/types/state';

test('Asriel port purchases need no support but default stopped without spare electrical power', () => {
  const s = createInitialState(CONFIG.version, 60, 0);
  assert.equal(calculateSupportPreview(s).asriel.available, 0);
  constructBuildingState(s, 'asrielSpaceport', 0);
  assert.equal(s.buildings.asrielSpaceport, 1);
  assert.equal(s.stoppedBuildings.asrielSpaceport, 1);
  s.stoppedBuildings.asrielSpaceport = 1;
  unlockAll(s);
  for (const id of Object.keys(s.resources) as (keyof typeof s.resources)[]) s.resources[id] = 1e9;
  assert.equal(buyBuildingsInBatch(s, 'asrielSpaceport', 2, 0).bought, 2);
  assert.equal(s.stoppedBuildings.asrielSpaceport, 3);
  s.stoppedBuildings.asrielSpaceport = 3;
  assert.equal(requestPurchaseModule(s, 'build', 'asrielSpaceport', 0, true).status, 'queued');
  settlePurchaseQueue(s, 0);
  assert.equal(s.buildings.asrielSpaceport, 4);
  assert.equal(s.stoppedBuildings.asrielSpaceport, 4);
});

test('new support consumers default off at shortage unless always-enable overrides', () => {
  const s = createInitialState(CONFIG.version, 60, 0);
  constructBuildingState(s, 'asrielMine', 0);
  constructBuildingState(s, 'planetaryFoundry', 0);
  constructBuildingState(s, 'swarmSatellite', 0);
  assert.equal(s.stoppedBuildings.asrielMine, 1);
  assert.equal(s.stoppedBuildings.planetaryFoundry, 1);
  assert.equal(s.stoppedBuildings.swarmSatellite, 1);
  s.buildings.asrielSpaceport = 1; supplyPower(s, 100); s.resources.food = 100; s.resources.helium3 = 100;
  for (let i = 0; i < 5; i++) constructBuildingState(s, 'asrielResidence', 0);
  assert.equal(s.stoppedBuildings.asrielResidence, 1);
  s.buildings.swarmControlStation = 1;
  for (let i = 0; i < 21; i++) constructBuildingState(s, 'swarmSatellite', 0);
  assert.equal(s.stoppedBuildings.swarmSatellite, 2);
  s.settings.alwaysEnableNewBuildings = true;
  constructBuildingState(s, 'asrielResidence', 0);
  constructBuildingState(s, 'swarmSatellite', 0);
  constructBuildingState(s, 'iridiumMine', 0);
  assert.equal(s.stoppedBuildings.asrielResidence, 1);
  assert.equal(s.stoppedBuildings.swarmSatellite, 2);
  assert.equal(s.stoppedBuildings.iridiumMine, 0);
});

test('batch and queue construction apply the same automatic support shutdown', () => {
  const s = createInitialState(CONFIG.version, 60, 0);
  unlockAll(s); s.buildings.swarmControlStation = 1;
  for (const id of Object.keys(s.resources) as (keyof typeof s.resources)[]) s.resources[id] = 1e9;
  assert.equal(buyBuildingsInBatch(s, 'swarmSatellite', 21, 0).bought, 21);
  assert.equal(s.stoppedBuildings.swarmSatellite, 1);
  assert.equal(requestPurchaseModule(s, 'build', 'swarmSatellite', 0, true).status, 'queued');
  settlePurchaseQueue(s, 0);
  assert.equal(s.stoppedBuildings.swarmSatellite, 2);
});

function lunarState(): GameState {
  const state = createInitialState(CONFIG.version, 60, Date.now());
  state.buildings.solarSatellite = 1;
  state.buildings.moonBase = 1;
  state.buildings.iridiumMine = 1;
  state.buildings.aiSupercore = 1; // one completed core: segmented projects are one-off
  state.buildings.constraintArray = 1;
  state.powerActivationOrder = [{ id: 'moonBase', count: 1 }];
  state.resources.oil = 100;
  return state;
}

test('freshly generated power supports the Moon immediately without mutating source state', () => {
  for (const dt of [.2, 1, 3]) {
    const state = lunarState();
    const before = structuredClone(state);
    const preview = calculateSupportPreview(state, dt);
    const production = calculateProduction(state, dt);
    assert.equal(preview.moon.baseUnits, 1);
    assert.equal(preview.moon.allocations.iridiumMine, 1);
    assert.deepEqual(preview.moon, production.moon);
    assert.deepEqual(moonSnapshot(state, dt), production.moon);
    assert.equal(storageSnapshot(state, dt).moonBaseUnits, 1);
    assert.equal(storageCap('iridium', state), 200);
    assert.deepEqual(state, before);
  }
});

test('Asriel support reserves lunar maintenance before allocating ports and housing', () => {
  const state = lunarState();
  state.buildings.asrielSpaceport = 1;
  state.buildings.asrielResidence = 1;
  state.buildings.ecologicalDome = 1;
  state.powerActivationOrder!.push({ id: 'asrielSpaceport', count: 1 });
  state.resources.helium3 = 100;
  state.resources.food = 100;
  addPower(state, 3);
  // 3 added + 5 solar - 4 Moon = 4: insufficient for a 5-energy port.
  let preview = calculateSupportPreview(state);
  assert.equal(preview.moon.baseUnits, 1);
  assert.equal(preview.asriel.ports, 0);
  assert.equal(capacity(state), 0);
  assert.deepEqual(preview.asriel, calculateProduction(state).asriel);
  assert.equal(storageCap('food', state), 100);
  addPower(state, 1);
  // 3 + 1 added + 5 solar - 4 Moon = 5: the port and its first residence/dome now have support.
  preview = calculateSupportPreview(state);
  assert.equal(preview.asriel.ports, 1);
  assert.equal(capacity(state), 2);
  assert.equal(storageCap('food', state), 2600);
  assert.deepEqual(preview.asriel, calculateProduction(state).asriel);
});

test('research capacity and morale previews use all power plants and the production reservation order', () => {
  const state = lunarState();
  state.buildings.solarSatellite = 4;
  state.buildings.oilGenerator = 1;
  state.buildings.generator = 2;
  state.stoppedBuildings.generator = 1;
  state.resources.coal = 10;
  state.buildings.asrielSpaceport = 1;
  state.resources.helium3 = 100;
  state.resources.food = 100;
  state.buildings.biologyLab = 4;
  state.buildings.observatory = 8;
  state.buildings.broadcast = 2;
  state.powerActivationOrder!.push({ id: 'broadcast', count: 2 }, { id: 'asrielSpaceport', count: 1 }, { id: 'biologyLab', count: 4 }, { id: 'observatory', count: 8 });
  const before = structuredClone(state);
  for (const dt of [.2, 1, 3]) {
    const preview = calculateSupportPreview(state, dt);
    assert.equal(preview.biologyUnits, calculateBiologyUnits(state, dt));
    assert.equal(preview.dataCenterUnits, calculateDataCenterUnits(state, dt));
    assert.deepEqual(moraleSnapshot(state, dt), previewMorale(state, dt));
    assert.equal(moraleSnapshot(state, dt).generatorSpeed, 6);
  }
  assert.deepEqual(state, before);
});

function unlockAll(state: GameState): void {
  const milestone = createMilestoneState('moon', { extraTech: ['solarExploration', 'dysonTheory', 'outerPlanetExploration', 'atmosphericMining', 'talosMoonScanning', 'asteroidBeltMining', 'asteroidMiningOptimization', 'misenDiscovery', 'exoticElementResearch', 'spaceControlTower', 'polymer', 'spaceflight', 'solarSatellite'] });
  state.tech = milestone.tech;
  state.stageThree = { ...milestone.stageThree };
  state.prestige.nuclearResets = 1;
  state.asrielMissionCompleted = milestone.asrielMissionCompleted;
  state.kerberosMissionCompleted = milestone.kerberosMissionCompleted;
  state.solarMissionCompleted = milestone.solarMissionCompleted;
  state.talosMissionCompleted = milestone.talosMissionCompleted;
  state.talosMoonMissionCompleted = milestone.talosMoonMissionCompleted;
  state.asteroidBeltMissionCompleted = milestone.asteroidBeltMissionCompleted;
  state.misenMissionCompleted = milestone.misenMissionCompleted;
  state.arpaBuildings.rocketPlatform = 1;
  state.arpaBuildings.monument = 1;
  state.arpaBuildings.geneSequencing = 1;
  state.arpaBuildings.arpaResearchInstitute = 2;
}

test('runtime imports and loads clamp the candidate using powered lunar support and log achievement names', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const writes = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => writes.get(key) ?? null, setItem: (key: string, value: string) => { writes.set(key, value); } },
  });
  try {
    const candidate = lunarState();
    unlockAll(candidate);
    candidate.resources.iridium = 150;
    candidate.buildings.swarmSatellite = 4096;
    const runtime = createRuntime();
    assert.equal(runtime.replaceState(candidate), true);
    assert.equal(runtime.state.resources.iridium, 150, 'import must retain storage unlocked by immediate generation');
    assert(runtime.state.logs.some(log => log.type === 'achievement' && log.text.includes('遮天蔽日')));
    const next = createRuntime();
    next.load();
    assert(next.state.resources.iridium >= 150, 'load must validate against candidate support, not a fresh runtime');
    assert.equal(next.saveBlocked, false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
