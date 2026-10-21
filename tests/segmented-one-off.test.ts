import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { upgradeSchema32To33 } from '../src/state/save-compatibility';
import { validateCurrentSave } from '../src/state/validate-save';
import { buyBuildingNow, isPurchaseAllowed, requestPurchaseModule, settlePurchaseQueue } from '../src/simulation/purchases';
import type { BuildingId } from '../src/types/buildings';
import type { ResourceId } from '../src/types/economy';

/**
 * beta 0.9.10 makes every segmented project one-off.
 *
 * A finished project used to keep its construction row alive, so a save could own one completed
 * building plus a fresh partial project (the reported bug: 空间撕裂者 ×1 next to 3/100 segments).
 * Now the completed form caps the project at one unit, the construction row is retired, and any
 * leftover counter is dropped by the schema-33 upgrade instead of silently accumulating.
 */
const SEGMENTED = (Object.keys(BUILDINGS) as BuildingId[])
  .filter(id => BUILDINGS[id].completesInto)
  .map(id => ({ segments: id, completed: BUILDINGS[id].completesInto! }));
const context = { now: 0, eventInterval: 60, housingCapacity: () => 1e9, clampResources: () => undefined };

function fresh() { return createInitialState(CONFIG.version, 60, 0); }
/** A schema-32 save: the shape real players still hold when this rule ships. */
function schema32() { return { ...fresh(), version: 32 }; }
function fund(state: ReturnType<typeof fresh>, id: BuildingId, units = 1) {
  const cost = BUILDINGS[id].cost;
  for (const [resource, amount] of Object.entries(cost)) state.resources[resource as ResourceId] = amount * units;
}
/** Tier-two sphere needs the finished first tier; 彭罗斯球体 needs its black-hole mission. */
function unlockFor(state: ReturnType<typeof fresh>, segments: BuildingId) {
  state.tech.push(BUILDINGS[segments].tech);
  const required = BUILDINGS[segments].buildingRequired;
  if (required) state.buildings[required] = 1;
  if (BUILDINGS[segments].spaceMissionRequired === 'blackHole') state.blackHoleMissionCompleted = true;
}

test('every completed form is capped at a single unit', () => {
  for (const { completed } of SEGMENTED) {
    assert.equal(BUILDINGS[completed].max, 1, `${completed} must cap the project at one unit`);
  }
});

test('a finished project refuses further construction on every purchase path', () => {
  for (const { segments, completed } of SEGMENTED) {
    const state = fresh();
    unlockFor(state, segments);
    state.buildings[completed] = 1;
    fund(state, segments, 200);
    assert.equal(isPurchaseAllowed(state, 'build', segments), false, `${segments} is retired`);
    assert.equal(buyBuildingNow(state, segments, 0).bought, false, `${segments} cannot be bought directly`);
    assert.equal(requestPurchaseModule(state, 'build', segments, 0).status, 'rejected', `${segments} cannot be queued`);
    assert.equal(requestPurchaseModule(state, 'build', segments, 0, true).status, 'rejected', `${segments} cannot be force-queued`);
    assert.equal(state.buildings[segments], 0, 'no segment is charged');
    assert.equal(state.buildings[completed], 1, 'the finished building is untouched');
  }
});

test('an unfinished project keeps buying segments until the 100th completes it', () => {
  for (const { segments, completed } of SEGMENTED) {
    const state = fresh();
    unlockFor(state, segments);
    state.buildings[segments] = 99;
    fund(state, segments, 1);
    assert.equal(isPurchaseAllowed(state, 'build', segments), true, `${segments} is still purchasable`);
    assert.equal(buyBuildingNow(state, segments, 0).bought, true);
    assert.equal(state.buildings[segments], 0, 'the final segment is consumed');
    assert.equal(state.buildings[completed], 1, 'exactly one completed unit appears');
    assert.equal(isPurchaseAllowed(state, 'build', segments), false, 'the construction row is retired at once');
  }
});

test('a queued project stops reserving slots once the completed building exists', () => {
  const state = fresh();
  state.tech.push(BUILDINGS.aiSupercoreSegments.tech);
  state.buildings.aiSupercore = 1;
  fund(state, 'aiSupercoreSegments', 1);
  assert.equal(requestPurchaseModule(state, 'build', 'aiSupercoreSegments', 0, true).status, 'rejected');
  assert.deepEqual(state.queue, []);
  // Settlement prunes an entry that became stale while the project finished elsewhere.
  state.buildings.aiSupercore = 0;
  state.tech.push('artificialIntelligenceII');
  const queued = requestPurchaseModule(state, 'build', 'aiSupercoreSegments', 0, true);
  assert.equal(queued.status, 'queued');
  state.buildings.aiSupercore = 1;
  settlePurchaseQueue(state, 0);
  assert.deepEqual(state.queue, [], 'the stale entry is dropped instead of buying orphan segments');
  assert.equal(state.buildings.aiSupercoreSegments, 0);
});

test('the schema-33 upgrade retires leftover construction of a finished project', () => {
  const state = schema32();
  state.tech.push('dimensionPioneer');
  state.buildings.spaceRipper = 1;
  state.buildings.spaceRipperSegments = 3;
  state.stoppedBuildings.spaceRipperSegments = 0;
  state.queue.push({ uid: 1, kind: 'build', id: 'spaceRipperSegments', segments: 5 });
  state.powerActivationOrder = [{ id: 'spaceRipper', count: 1 }];
  const before = structuredClone(state);
  const upgraded = upgradeSchema32To33(state as unknown as Record<string, unknown>) as unknown as typeof state;
  assert.equal(upgraded.version, CONFIG.version);
  assert.equal(upgraded.buildings.spaceRipper, 1, 'the earned building survives');
  assert.equal(upgraded.buildings.spaceRipperSegments, 0, 'the orphan segment counter is dropped');
  assert.deepEqual(upgraded.queue, [], 'construction that can never continue is not queued');
  assert.deepEqual(state, before, 'the upgrade never mutates its input');
});

test('an unfinished project keeps its segment progress through the upgrade', () => {
  const state = schema32();
  state.tech.push('dimensionPioneer');
  state.buildings.spaceRipper = 0;
  state.buildings.spaceRipperSegments = 73;
  const upgraded = upgradeSchema32To33(state as unknown as Record<string, unknown>) as unknown as typeof state;
  assert.equal(upgraded.buildings.spaceRipperSegments, 73, 'progress is preserved when nothing was finished');
  assert.equal(upgraded.buildings.spaceRipper, 0);
});

test('an older save holding extra copies is clamped instead of rejected', () => {
  // Schema 31/32 could legitimately hold several completed units; the one-off rule keeps the
  // first and drops the rest, so an existing player is never locked out of their save.
  const state = schema32();
  state.tech.push('dimensionPioneer');
  state.buildings.spaceRipper = 3;
  state.buildings.spaceRipperSegments = 42;
  const upgraded = upgradeSchema32To33(state as unknown as Record<string, unknown>) as unknown as typeof state;
  assert.equal(upgraded.buildings.spaceRipper, 1, 'exactly one completed building remains');
  assert.equal(upgraded.buildings.spaceRipperSegments, 0);
});

test('a real previous-release save upgrades, loads and roundtrips', () => {
  // The frozen schema-31 fixture holds spaceRipper = 99 segments and one AI supercore, which is
  // exactly the shape the schema-33 rule has to clean up.
  const raw = JSON.parse(readFileSync(new URL('./fixtures/pre-beta0.6.5-schema31.json', import.meta.url), 'utf8')) as Record<string, any>;
  const frozen = JSON.stringify(raw);
  const loaded = validateCurrentSave(raw, context);
  assert.equal(JSON.stringify(raw), frozen, 'loading never mutates the supplied JSON');
  assert.equal(loaded.version, CONFIG.version);
  assert.equal(loaded.buildings.aiSupercore, 1, 'the earned core survives');
  assert.equal(loaded.buildings.aiSupercoreSegments, 0, 'a finished project has no construction phase');
  assert.deepEqual(validateCurrentSave(JSON.parse(JSON.stringify(loaded)), context), loaded);
});
