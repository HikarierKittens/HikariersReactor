import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { validateAndMigrateSave } from '../src/state/validate-save';
import type { GameState } from '../src/types/state';

/**
 * Regression guard for the "previous release must load" requirement.
 *
 * `fixtures/pre-beta0.9.5-schema31.json` is a real save written by the beta 0.9.4 build
 * (the shipping release before beta 0.9.5), generated with that release's own
 * `createInitialState` + export shape — not hand-edited here. It predates the
 * `wounded` / `hospitalProgress` / `neighbors` fields that the 临近势力 and 医院
 * updates added, so it exercises the narrow upgrade defaults in `save-compatibility`.
 */
const FIXTURE = new URL('./fixtures/pre-beta0.9.5-schema31.json', import.meta.url);
const MALFORMED_FIXTURE = new URL('./fixtures/pre-beta0.9.5-schema31-malformed.json', import.meta.url);
const context = { now: 0, eventInterval: 60, housingCapacity: () => 1e6, clampResources: () => undefined };

function previousReleaseSave(file: URL = FIXTURE): Record<string, unknown> {
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}

function load(raw: Record<string, unknown>): GameState {
  return validateAndMigrateSave(raw, context);
}

test('a save written by the previous release still loads', () => {
  const raw = previousReleaseSave();
  assert.equal(raw.version, 31, 'fixture is the previous release schema, upgraded in memory');
  const state = load(raw);
  assert.equal(state.version, CONFIG.version, 'the upgrade lands on the current schema');
  assert.equal(state.population, 12, 'progression is preserved');
  assert.equal(state.buildings.nest, 12, 'building counts are preserved');
  assert.equal(state.workers.forage, 4, 'work assignments are preserved');
  assert.deepEqual([...state.tech].sort(), ['survival', 'tools', 'writing'], 'research is preserved');
  assert.equal(state.prestige.particles, 30, 'prestige resources are preserved');
});

test('fields added after the previous release are backfilled with upgrade defaults', () => {
  const raw = previousReleaseSave();
  // These three arrived with 临近势力 / 医院, after the release that wrote the fixture.
  for (const field of ['wounded', 'hospitalProgress', 'neighbors']) {
    assert.equal(Object.hasOwn(raw, field), false, `${field} post-dates the fixture, so it must not carry the field`);
  }
  const state = load(raw);
  assert.equal(state.wounded, 0, 'no raid casualties invented');
  assert.equal(state.hospitalProgress, 0, 'no hospital carry invented');
  assert.equal(state.stoppedBuildings.hospital, 0, 'hospital stop record is backfilled by the additive building upgrade');
  assert.equal(state.buildings.hospital, 0, 'no hospital is invented for a save that never built one');
  assert.ok(state.neighbors && typeof state.neighbors === 'object', 'neighbours roll deterministically from save fields');
});

test('the backfill is deterministic and never mutates the input', () => {
  const raw = previousReleaseSave();
  const snapshot = JSON.stringify(raw);
  const first = load(raw);
  const second = load(raw);
  assert.equal(JSON.stringify(raw), snapshot, 'validation must not mutate the loaded record');
  assert.deepEqual(first.neighbors, second.neighbors, 'reloading the same save always yields the same neighbours');
});

test('save/reload roundtrip keeps every upgraded field', () => {
  const loaded = load(previousReleaseSave());
  const exported = JSON.parse(JSON.stringify({ ...loaded, lastSaved: Date.now() })) as Record<string, unknown>;
  const reloaded = load(exported);
  assert.deepEqual(reloaded.neighbors, loaded.neighbors);
  assert.equal(reloaded.wounded, loaded.wounded);
  assert.equal(reloaded.hospitalProgress, loaded.hospitalProgress);
  assert.equal(reloaded.population, loaded.population);
});

test('the upgrade stays narrow: malformed or foreign records are still rejected', () => {
  const cases: [string, (raw: Record<string, unknown>) => void, RegExp][] = [
    ['retired schema', raw => { raw.version = 30; }, /存档版本不受支持/],
    ['building id from another registry', raw => { (raw.buildings as Record<string, number>).catNest = 1; }, /经济记录无效/],
    ['unknown top-level field', raw => { raw.somethingNew = 1; }, /存档字段无效/],
  ];
  for (const [label, mutate, expected] of cases) {
    const raw = previousReleaseSave();
    mutate(raw);
    assert.throws(() => load(raw), expected, label);
  }
  // The same previous-release shape with an impossible carry value must fail instead of
  // being repaired: defaults only fill absent fields, they never overwrite supplied data.
  const malformed = previousReleaseSave(MALFORMED_FIXTURE);
  assert.equal(malformed.hospitalProgress, 5, 'fixture carries an out-of-range carry');
  assert.throws(() => load(malformed), /医院治疗进度数据无效/);
  assert.equal(load(previousReleaseSave()).hospitalProgress, 0, 'a well-formed previous save still upgrades to the default');
});
