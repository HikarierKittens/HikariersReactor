import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { validateAndMigrateSave } from '../src/state/validate-save';
import { calculateSoldierCapacity, calculateArmyLimit } from '../src/simulation/government';
import { advanceSoldierTraining, clampSoldiersToArmyLimit } from '../src/simulation/military';
import type { GameState } from '../src/types/state';

/**
 * Regression for the reported "update broke my save" case.
 *
 * `fixtures/reported-soldiers-over-capacity-schema31.json` is the save a player exported from
 * the browser after a beta 0.9.5 update. It is schema 31 with every field the current build
 * expects; the only reason it was rejected with 士兵数据无效 was an army of 73 with an owned
 * capacity of 72 (35 军营 ×2 + 1 太空驻军 ×2). Loading must never block on the army count.
 */
const FIXTURE = new URL('./fixtures/reported-soldiers-over-capacity-schema31.json', import.meta.url);
const context = { now: 0, eventInterval: 60, housingCapacity: () => 1e9, clampResources: () => undefined };

function reportedSave(): Record<string, unknown> {
  return JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, unknown>;
}

function load(raw: Record<string, unknown>): GameState {
  return validateAndMigrateSave(raw, context);
}

/** Mirrors the runtime: validation accepts the army count, then the army limit trims it. */
function enforce(state: GameState): GameState {
  clampSoldiersToArmyLimit(state);
  return state;
}

test('the reported save loads again with all progress intact', () => {
  const raw = reportedSave();
  assert.equal(raw.version, 31, 'the report came from a schema 31 build');
  const state = load(raw);
  assert.equal(state.version, CONFIG.version, 'loading upgrades the save to the current schema');
  // The validator accepts the stored count; the army limit, not the validator, trims it.
  assert.equal(state.soldiers, 73, 'the validator keeps the stored army count');
  assert.equal(state.population, raw.population);
  assert.equal(state.buildings.barracks, 35);
  assert.equal(state.buildings.spaceGarrison, 1);
  assert.equal(state.tech.length, (raw.tech as string[]).length);
  assert.equal(state.wounded, 0);
});

test('the army really was above the owned capacity, which is why it used to be rejected', () => {
  const raw = reportedSave();
  const owned = calculateSoldierCapacity(raw as unknown as Pick<GameState, 'buildings'>);
  assert.equal(owned, 72, '35 barracks and one garrison give 72 places');
  assert.ok((raw.soldiers as number) > owned, 'the player had more soldiers than places');
});

test('loading removes the surplus down to the army limit', () => {
  const state = enforce(load(reportedSave()));
  // The limit counts switched-on capacity only, so the reported save loads with at most the
  // soldiers its running barracks and garrison can hold.
  const limit = calculateArmyLimit(state);
  assert.equal(state.soldiers, Math.min(73, limit), 'soldiers are capped at the limit on load');
  assert.ok(state.soldiers <= limit, 'the army never exceeds its limit after loading');
});

test('soldiers above the limit are removed rather than kept', () => {
  const state = load(reportedSave());
  const limit = calculateArmyLimit(state);
  const removed = clampSoldiersToArmyLimit(state);
  assert.equal(state.soldiers, limit, 'only the soldiers that fit are kept');
  assert.equal(removed, Math.max(0, 73 - limit), 'the exact surplus is reported as removed');
  assert.equal(clampSoldiersToArmyLimit(state), 0, 'a second clamp removes nothing');
});

test('training resumes normally once the army is inside the limit', () => {
  const state = enforce(load(reportedSave()));
  state.trainingProgress = 0;
  const limit = calculateArmyLimit(state);
  assert.ok(state.soldiers <= limit);
  advanceSoldierTraining(state, 10);
  assert.ok(state.soldiers <= limit, 'training never exceeds the limit');

  const beforeBarracks = state.buildings.barracks;
  state.buildings.barracks = beforeBarracks + 1;
  advanceSoldierTraining(state, 10);
  assert.ok(state.soldiers <= calculateArmyLimit(state), 'new barracks raise the limit, not the army');
});

test('only negative or fractional armies are rejected by the validator', () => {
  const cases: [string, (raw: Record<string, unknown>) => void, RegExp][] = [
    ['negative army', raw => { raw.soldiers = -1; }, /士兵数据无效/],
    ['fractional army', raw => { raw.soldiers = 1.5; }, /士兵数量无效/],
    ['army as text', raw => { raw.soldiers = '73'; }, /士兵数据无效/],
    ['negative training carry', raw => { raw.trainingProgress = -1; }, /训练进度数据无效/],
    ['malformed wounded', raw => { raw.wounded = -1; }, /伤兵数据无效/],
    ['retired schema', raw => { raw.version = 30; }, /存档版本不受支持/],
  ];
  for (const [label, mutate, expected] of cases) {
    const raw = reportedSave();
    mutate(raw);
    assert.throws(() => load(raw), expected, label);
  }
});

test('roundtrip of the repaired save stays loadable', () => {
  const first = enforce(load(reportedSave()));
  const exported = JSON.parse(JSON.stringify({ ...first, lastSaved: Date.now() })) as Record<string, unknown>;
  const second = enforce(load(exported));
  assert.equal(second.soldiers, first.soldiers, 'a second load changes nothing: the army already fits');
  assert.equal(clampSoldiersToArmyLimit(second), 0, 'roundtrip removal is idempotent');
  assert.deepEqual(second.tech, first.tech);
  assert.deepEqual(second.buildings, first.buildings);
});
