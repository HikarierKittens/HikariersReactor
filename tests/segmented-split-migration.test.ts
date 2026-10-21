import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { BUILDINGS } from '../src/data/buildings';
import { normalizeSchemaSave } from '../src/state/save-compatibility';
import { validateAndMigrateSave } from '../src/state/validate-save';
import { createInitialState } from '../src/state/create-state';
import { isPurchaseAllowed } from '../src/simulation/purchases';
import type { BuildingId } from '../src/types/buildings';

/**
 * Schema 31 鈫?32: segmented projects split into a construction phase and a completed building.
 *
 * A schema 31 save stored one counter per project (`buildings.dysonSphere = 73` meant 73 of 100
 * segments). Schema 32 stores completed units on the old ID and the remainder on the new
 * `*Segments` ID, so the upgrader must transform the value instead of reinterpreting it.
 *
 * The transformations are asserted on `normalizeSchemaSave` directly: driving a synthetic
 * late-game record through the full validator would require the fixture's entire tech tree and
 * mission history, which is unrelated to the split.
 */
const FIXTURE = new URL('./fixtures/pre-beta0.9.5-schema31.json', import.meta.url);
const context = { now: 0, eventInterval: 60, housingCapacity: () => 1e9, clampResources: () => undefined };

const SPLITS: { id: BuildingId; segments: BuildingId }[] = [
  { id: 'agiCoreComponent', segments: 'agiCoreComponentSegments' },
  { id: 'agiAscensionCore', segments: 'agiAscensionCoreSegments' },
  { id: 'spaceRipper', segments: 'spaceRipperSegments' },
  { id: 'dysonSphere', segments: 'dysonSphereSegments' },
  { id: 'penroseSphere', segments: 'penroseSphereSegments' },
  { id: 'aiSupercore', segments: 'aiSupercoreSegments' },
];

/** A schema 31-shaped record: the split IDs do not exist yet, projects live on the old IDs. */
function schema31(segments: Partial<Record<BuildingId, number>> = {}, extra: (raw: Record<string, any>) => void = () => {}): Record<string, any> {
  const raw = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, any>;
  raw.version = 31;
  for (const id of ['dysonSphereL2', 'dysonSphereL2Segments', ...SPLITS.map(split => split.segments)] as BuildingId[]) {
    for (const field of ['buildings', 'workers', 'stoppedBuildings']) delete raw[field]?.[id];
  }
  for (const [id, value] of Object.entries(segments)) raw.buildings[id] = value;
  extra(raw);
  return raw;
}

/** The upgrader returns a generic record; tests read the split records through this view. */
interface UpgradedSave {
  version: number;
  buildings: Record<string, number>;
  stoppedBuildings: Record<string, number>;
  queue: { id: string; segments?: number }[];
  powerActivationOrder: { id: string; count: number }[];
}

/** The upgrader returns a generic record; tests read the split records through this view. */
function upgrade(raw: Record<string, any>): UpgradedSave {
  return normalizeSchemaSave(raw) as unknown as UpgradedSave;
}

test('a schema 31 segment count is split into completed units plus a remainder', () => {
  const upgraded = upgrade(schema31({ dysonSphere: 73 }));
  assert.equal(upgraded.version, CONFIG.version);
  assert.equal(upgraded.buildings.dysonSphere, 0, '73 segments are not a completed sphere');
  assert.equal(upgraded.buildings.dysonSphereSegments, 73, 'the remainder keeps its progress');
});

test('a completed project keeps one finished building and retires its construction phase', () => {
  // Schema 33 makes every segmented project one-off: extra copies from older saves clamp to the
  // single completed unit they represent, and the leftover half-built project is retired.
  const upgraded = upgrade(schema31({ aiSupercore: 100, spaceRipper: 250 }));
  assert.equal(upgraded.buildings.aiSupercore, 1, '100 segments became one completed core');
  assert.equal(upgraded.buildings.aiSupercoreSegments, 0);
  assert.equal(upgraded.buildings.spaceRipper, 1, 'only one completed ripper can exist');
  assert.equal(upgraded.buildings.spaceRipperSegments, 0, 'a finished project has no construction phase');
});

test('stopped counts follow the completed units and segments carry no switch', () => {
  const upgraded = upgrade(schema31({ aiSupercore: 100 }, raw => { raw.stoppedBuildings.aiSupercore = 1; }));
  assert.equal(upgraded.stoppedBuildings.aiSupercore, 1, 'the stopped completed core stays stopped');
  assert.equal(upgraded.stoppedBuildings.aiSupercoreSegments, 0, 'construction segments are never stopped');
});

test('stopped counts clamp to the completed units instead of exceeding them', () => {
  const upgraded = upgrade(schema31({ aiSupercore: 5 }, raw => { raw.stoppedBuildings.aiSupercore = 1; }));
  assert.equal(upgraded.buildings.aiSupercore, 0, 'five segments did not finish a core');
  assert.equal(upgraded.stoppedBuildings.aiSupercore, 0, 'a stopped count cannot exceed owned completed units');
});

test('queued segments are retargeted at the construction phase', () => {
  const upgraded = upgrade(schema31({}, raw => {
    raw.queue = [{ uid: 1, kind: 'build', id: 'dysonSphere', segments: 7 }];
  }));
  assert.equal(upgraded.queue.length, 1);
  assert.equal(upgraded.queue[0]!.id, 'dysonSphereSegments', 'the queue buys segments, not completed spheres');
  assert.equal(upgraded.queue[0]!.segments, 7);
});

test('activation order is clamped to the completed units', () => {
  const upgraded = upgrade(schema31({}, raw => {
    raw.powerActivationOrder = [{ id: 'aiSupercore', count: 1 }];
  }));
  assert.deepEqual(upgraded.powerActivationOrder, [], 'no completed core exists, so no activation entry survives');
});

test('normalization never mutates the input save', () => {
  const raw = schema31({ dysonSphere: 150, aiSupercore: 42 });
  const snapshot = JSON.stringify(raw);
  normalizeSchemaSave(raw);
  assert.equal(JSON.stringify(raw), snapshot, 'the supplied record is read-only');
});

test('normalizing twice changes nothing (idempotent upgrade)', () => {
  const once = normalizeSchemaSave(schema31({ dysonSphere: 150, aiSupercore: 42 }));
  const twice = normalizeSchemaSave(once);
  assert.equal(twice.version, CONFIG.version);
  assert.deepEqual(twice.buildings, once.buildings);
  assert.deepEqual(twice.stoppedBuildings, once.stoppedBuildings);
});

test('a real schema 31 save still loads and gains every split record', () => {
  const raw = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const frozen = JSON.stringify(raw);
  const state = validateAndMigrateSave(raw, context);
  assert.equal(state.version, CONFIG.version);
  for (const split of SPLITS) {
    assert.equal(state.buildings[split.segments], 0, `${split.segments} must exist after the upgrade`);
  }
  assert.equal(state.buildings.dysonSphereL2Segments, 0, 'the tier-two records are backfilled');
  assert.equal(JSON.stringify(raw), frozen, 'loading a save must not mutate the supplied JSON');
});

test('completed buildings are never purchasable and retire their construction phase', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.tech.push('dysonSphere');
  state.buildings.dysonSphere = 1;
  assert.equal(BUILDINGS.dysonSphere.buildable, false, 'a finished sphere has no price');
  assert.equal(isPurchaseAllowed(state, 'build', 'dysonSphere'), false);
  assert.equal(isPurchaseAllowed(state, 'build', 'dysonSphereSegments'), false, 'the construction row is retired');
  // An unfinished project keeps its construction row purchasable.
  const building = createInitialState(CONFIG.version, 60, 0);
  building.tech.push('dysonSphere');
  assert.equal(isPurchaseAllowed(building, 'build', 'dysonSphereSegments'), true);
});

test('tier two only adds its increment on top of the finished first tier', () => {
  assert.equal(BUILDINGS.dysonSphere.output?.energy, 500);
  assert.equal(BUILDINGS.dysonSphereL2.output?.energy, 750, 'tier two is an increment, not a replacement');
  assert.equal(BUILDINGS.dysonSphereL2.addsOnTopOf, 'dysonSphere');
  assert.equal(BUILDINGS.dysonSphereL2Segments.completesInto, 'dysonSphereL2');
  assert.equal(BUILDINGS.dysonSphereL2Segments.buildingRequired, 'dysonSphere');
});
