import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { BUILDINGS } from '../src/data/buildings';
import { RESOURCES, CRAFT_RECIPES } from '../src/data/resources';
import { TECHNOLOGIES } from '../src/data/technologies';
import { createInitialState } from '../src/state/create-state';
import { validateAndMigrateSave } from '../src/state/validate-save';
import { launchEscapePrestige } from '../src/simulation/prestige';
import { SHIP_COMPONENTS } from '../src/simulation/spaceship';
import { calculateProduction } from '../src/simulation/production';
import { advanceGameTick } from '../src/simulation/tick';
import { settlePurchaseQueue } from '../src/simulation/purchases';
import type { TechnologyId } from '../src/types/technologies';
import type { GameState, ShipComponentId } from '../src/types/state';

const retiredTech = ['e710Analysis', 'transcendenceHopeless', 'engineAdjustment', 'ftlWaypointResearch'];
const retiredBuildings = ['tianxingMiningStation', 'ftlSolar', 'ftlTianxing'];
const context = { now: 0, eventInterval: 60, housingCapacity: () => 10000, clampResources: () => {} };
const snapshot = (value: unknown): any => JSON.parse(JSON.stringify(value));
const fresh = () => createInitialState(CONFIG.version, 60, 0);

function completedShip(): GameState {
  const state = fresh();
  state.tech = Object.keys(TECHNOLOGIES).filter(id => !['spaceControlTower', 'globalObservationCalibration', 'anomalyMapping', 'anomalyResponse', 'fieldConstraintTheory', 'dualEndCoupling', 'finiteAperture', 'anomalyTopology', 'dimensionBeaconDeployment','accessPointBeacon','hydrogenRecovery','icebreakingPlan','hyperspaceMiningSurvey','gasCloudAccretion','highTechFarmPlatform','fusionPower','largeMiningShips','dimensionPioneer','highTechFactory','higherDimensionalStorage','e710ResearchStation','ripperOverclock','overclocking13','superMetal','grapheneProcessing','nanoAlloy','virtualReality','virtualTraining','virtualEntertainment','aerogel','plasmaResearch','plasmaMining','energyShield','stellarForge','penroseTheory'].includes(id)) as TechnologyId[];
  state.prestige.nuclearResets = 1;
  state.prestige.particles = 17;
  state.prestige.casimir = 23;
  state.asrielMissionCompleted = state.kerberosMissionCompleted = state.solarMissionCompleted = true;
  state.talosMissionCompleted = state.talosMoonMissionCompleted = state.asteroidBeltMissionCompleted = state.misenMissionCompleted = true;
  state.arpaBuildings.rocketPlatform = state.arpaBuildings.monument = state.arpaBuildings.geneSequencing = 1;
  state.arpaBuildings.arpaResearchInstitute = 2;
  state.buildings.aiSupercore = 100;
  state.stoppedBuildings.aiSupercore = 1;
  state.buildings.interstellarDock = 1;
  state.buildings.e710Container = 2;
  Object.assign(state.resources, { knowledge: 321, cash: 123, metal: 77, alloy: 55, e710: 42, helium3: 81, nanotubes: 29 });
  for (const id of Object.keys(SHIP_COMPONENTS) as ShipComponentId[]) {
    const definition = SHIP_COMPONENTS[id];
    state.shipComponents[id] = true;
    state.shipResourceProgress[id] = Object.fromEntries(Object.keys(definition.cost).map(resource => [resource, 100]));
    if (definition.population) state.shipResourceProgress[id]!.population = 100;
  }
  state.logs = [
    { time: 1, text: 'ESS-喵星号飞船已到达天星9', type: 'event' },
    { time: 2, text: '科学家深入研究了E710元素，认为它不足以让我们超越光速，正在积极研究其他技术方向', type: 'event' },
    { time: 3, text: '历史普通日志保持原样', type: 'progress' },
  ];
  return state;
}

function legacy(phase: 'arrived' | 'flying' | 'idle'): any {
  const raw = snapshot(completedShip());
  raw.tech.push(...retiredTech);
  raw.legacyTechPrerequisites = [...retiredTech];
  raw.tianxing = { phase, remaining: phase === 'flying' ? 123 : 0, hopelessTimer: 20, breakthroughTimer: 5, breakthroughTriggered: false, miningStationGranted: phase === 'arrived' };
  for (const id of retiredBuildings) {
    raw.buildings[id] = 4; raw.workers[id] = 0; raw.stoppedBuildings[id] = 2;
  }
  raw.resources.rawMaterial = 987654;
  raw.containerAssignments.rawMaterial = 9;
  raw.unlockedResources.push('rawMaterial');
  raw.queue = [
    ...retiredTech.map((id, index) => ({ uid: index + 1, kind: 'tech', id })),
    ...retiredBuildings.map((id, index) => ({ uid: index + 5, kind: 'build', id })),
    { uid: 8, kind: 'build', id: 'nest' },
  ];
  return raw;
}

function assertRetired(state: GameState): void {
  assert.equal(Object.hasOwn(state, 'tianxing'), false);
  for (const id of retiredTech) assert.equal((state.tech as string[]).includes(id), false, id);
  for (const id of retiredTech) assert.equal(((state.legacyTechPrerequisites ?? []) as string[]).includes(id), false, id);
  for (const record of [state.buildings, state.workers, state.stoppedBuildings]) {
    for (const id of retiredBuildings) assert.equal(Object.hasOwn(record, id), false, id);
  }
  assert.equal(Object.hasOwn(state.resources, 'rawMaterial'), false);
  assert.equal(Object.hasOwn(state.containerAssignments, 'rawMaterial'), false);
  assert.equal((state.unlockedResources as string[]).includes('rawMaterial'), false);
  assert.equal(state.queue.some(item => [...retiredTech, ...retiredBuildings].includes(item.id)), false);
}

function deepFreeze(value: any): any {
  if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}

test('retired catalog entries and fresh state disappear while ESS, E-710 and AI remain', () => {
  for (const id of retiredTech) assert.equal(Object.hasOwn(TECHNOLOGIES, id), false);
  for (const id of retiredBuildings) assert.equal(Object.hasOwn(BUILDINGS, id), false);
  assert.equal(Object.hasOwn(RESOURCES, 'rawMaterial'), false);
  assert.equal(Object.hasOwn(CRAFT_RECIPES, 'rawMaterial'), false);
  assertRetired(fresh());
  for (const id of ['escapePlan', 'exoticElementResearch', 'artificialIntelligenceII']) assert.ok(Object.hasOwn(TECHNOLOGIES, id));
  for (const id of ['interstellarDock', 'aiSupercore', 'e710MiningShip', 'e710Container', 'e710Warehouse', 'e710Reactor']) assert.ok(Object.hasOwn(BUILDINGS, id));
  assert.ok(Object.hasOwn(RESOURCES, 'e710'));
  assert.equal(Object.keys(SHIP_COMPONENTS).length, 6);
});

for (const phase of ['arrived', 'flying', 'idle'] as const) {
  test(`legacy ${phase} save immutably retires tech, queues, raw capacity and story without refunds or replay`, () => {
    const raw = legacy(phase), before = snapshot(raw);
    deepFreeze(raw);
    const restored = validateAndMigrateSave(raw, context);
    assert.deepEqual(raw, before, 'migration must not mutate even nested frozen source records');
    assertRetired(restored);
    assert.deepEqual(restored.resources, completedShip().resources, 'no retired purchase/resource refunds');
    assert.deepEqual(restored.logs, before.logs, 'preserve historic logs verbatim, do not replay arrival/grant');
    assert.deepEqual(restored.prestige, before.prestige);
    assert.equal(restored.buildings.aiSupercore, 100);
    assert.equal(restored.stoppedBuildings.aiSupercore, 1);
    assert.equal(restored.buildings.e710Container, 2);
    assert.equal(restored.buildings.interstellarDock, 1);
    assert.deepEqual(restored.shipComponents, before.shipComponents);
    assert.deepEqual(restored.shipResourceProgress, before.shipResourceProgress);
    assert.deepEqual(restored.queue, [{ uid: 8, kind: 'build', id: 'nest' }]);
    const production = calculateProduction(restored);
    for (const record of [production.pool, production.rates]) assert.equal(Object.hasOwn(record, 'rawMaterial'), false);
    for (const id of retiredBuildings) assert.equal(Object.hasOwn(production.inputUnits, id), false);
    const roundTrip = validateAndMigrateSave(snapshot(restored), context);
    assert.deepEqual(roundTrip, restored, 'retired save must be valid and idempotent after JSON roundtrip');
    const escape = launchEscapePrestige(restored, 60, 0);
    assert.ok(escape, 'completed ESS can escape even after old arrival or flight');
    assert.equal(escape.next.prestige.escapeResets, restored.prestige.escapeResets + 1);
    assert.equal(escape.next.prestige.casimir, restored.prestige.casimir + escape.casimirReward);
    assertRetired(escape.next);
    assert.deepEqual(restored, roundTrip, 'escape does not mutate pre-reset save');
  });
  test(`legacy ${phase} timers never generate future Tianxing story events or grant a station`, () => {
    const raw = legacy(phase); raw.queue = [];
    const restored = validateAndMigrateSave(raw, context), logs = snapshot(restored.logs);
    for (const dt of [.5, 20, 100, 10000]) {
      advanceGameTick(restored, dt, { happiness: () => 100, capacity: () => 10000, event: () => { restored.eventIn = 60; }, projects: () => {}, purchases: () => settlePurchaseQueue(restored, 0), unlocks: () => {} });
      assertRetired(restored);
      assert.deepEqual(restored.logs, logs);
    }
    assert.doesNotThrow(() => validateAndMigrateSave(snapshot(restored), context));
  });
}

test('retired payload is discarded before old prerequisite and malformed legacy-only field validation', () => {
  const raw = snapshot(fresh());
  raw.tech.push(...retiredTech);
  raw.legacyTechPrerequisites = [...retiredTech];
  raw.tianxing = { phase: 'obsolete', remaining: -1, hopelessTimer: 'old' };
  raw.resources.rawMaterial = -1;
  raw.containerAssignments.rawMaterial = 'obsolete';
  raw.unlockedResources.push('rawMaterial');
  for (const id of retiredBuildings) for (const field of ['buildings', 'workers', 'stoppedBuildings']) raw[field][id] = 'obsolete';
  raw.queue = retiredTech.map(id => ({ kind: 'tech', id }));
  const before = snapshot(raw), restored = validateAndMigrateSave(deepFreeze(raw), context);
  assertRetired(restored);
  assert.deepEqual(restored.resources, fresh().resources);
  assert.deepEqual(restored.logs, before.logs);
  assert.deepEqual(raw, before);
});

test('retirement does not relax validation of surviving content or unknown ids', () => {
  for (const mutate of [
    (raw: any) => raw.tech.push('notATechnology'),
    (raw: any) => raw.resources.e710 = -1,
    (raw: any) => raw.buildings.aiSupercore = -1,
    (raw: any) => raw.queue.push({ uid: 99, kind: 'build', id: 'notABuilding' }),
    (raw: any) => raw.shipComponents.hull = true,
  ]) {
    const raw = snapshot(fresh()); mutate(raw);
    assert.throws(() => validateAndMigrateSave(raw, context));
  }
});
