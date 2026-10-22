/** Moved verbatim out of tests/modules.test.ts during the 2026-10-22 split.
 *  Keep the assertions unchanged: they are the historical regression net. */
import { CONFIG } from '../src/data/config';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS } from '../src/data/progression';
import { updateProgression } from '../src/simulation/progression';
import { launchEscapePrestige } from '../src/simulation/prestige';
import { AUTO_WORKER_JOBS, applyAutoWorkerAssignment, setAutoWorkersEnabled, setAutoWorkerEnabled, setAutoWorkerLimit, moveAutoWorkerPriority } from '../src/simulation/auto-workers';
import { advanceGameTick } from '../src/simulation/tick';
import { test } from 'node:test';
import { calculateWorkerCapacity, countUsedWorkers } from '../src/simulation/building-production';
import { createMilestoneState } from './fixtures/milestones';
import { launchNuclearPrestige, resetRunState } from '../src/simulation/prestige';
import { validateAndMigrateSave } from '../src/state/validate-save';
import { createInitialState } from '../src/state/create-state';

test('seven replacement achievements expose exact names and em-dash conditions', () => {
  assert.deepEqual(Object.values(ACHIEVEMENTS).map(a => a.name), ['好奇害死猫', '跑路了跑路了', '人造天体', '遮天蔽日', 'world.exection(cat);', '超频小王子', '空间毁灭者']);
  for (const a of Object.values(ACHIEVEMENTS)) assert.ok(a.desc.includes('——'));
});

test('new snapshot achievements trigger only on fresh completion and never duplicate', () => {
  const s = createInitialState(CONFIG.version, 60, 0);
  s.buildings.swarmSatellite = 4095;
  assert.deepEqual(updateProgression(s), []);
  s.buildings.swarmSatellite = 4096;
  assert.deepEqual(updateProgression(s), ['swarmEclipse']);
  s.stageThree.coreActivated = true;
  assert.ok(updateProgression(s).includes('worldExecution'));
  s.tech.push('overclocking13');
  assert.ok(updateProgression(s).includes('overclockPrince'));
  assert.deepEqual(updateProgression(s), []);
});

test('retired achievements and absent tracking reject without backfilling progress', () => {
 const state = createMilestoneState('space'); state.buildings.swarmSatellite = 4096;
 const context = { now: 0, eventInterval: 60, housingCapacity: () => 1000, clampResources: () => {} };
 for (const id of ['first','hundred','food','pioneer','builder','space','unknownAchievement']) {
  const raw = { ...structuredClone(state), achievements: [id] }, before = structuredClone(raw);
  assert.throws(() => validateAndMigrateSave(raw, context)); assert.deepEqual(raw, before);
 }
 const raw = JSON.parse(JSON.stringify(state)); delete raw.achievementTracking;
 assert.throws(() => validateAndMigrateSave(raw, context));
});

test('nuclear and escape achievements are awarded once on successful reset with logs', () => {
  const s = createInitialState(CONFIG.version, 60, 0);
  s.tech.push('nuclearProgram'); s.nuclearProgress = 100;
  const nuclear = launchNuclearPrestige(s, 60, 0)!;
  assert.ok(nuclear.next.achievements.includes('nuclearCuriosity'));
  assert.equal(nuclear.next.logs.filter(l => l.type === 'achievement' && l.text.includes('好奇害死猫')).length, 1);
  assert.deepEqual(s.achievements, []);
  const ship = createInitialState(CONFIG.version, 60, 0);
  ship.buildings.interstellarDock = 1;
  for (const id of Object.keys(ship.shipComponents) as (keyof typeof ship.shipComponents)[]) ship.shipComponents[id] = true;
  const escape = launchEscapePrestige(ship, 60, 0)!;
  assert.ok(escape.next.achievements.includes('escapeRun'));
  assert.ok(escape.next.achievements.includes('artificialCelestial'), 'immediate launch retains completion achievement');
  assert.equal(escape.next.logs.filter(l => l.type === 'achievement').length, 2);
});


test('real ticks allocate workers before production and after new slots, but paused ticks do not', () => {
  const s = automationFixture();
  setAutoWorkersEnabled(s, true); setAutoWorkerEnabled(s, 'forage', true);
  s.resources.food = 100;
  const hooks = { happiness: () => 100, capacity: () => 100, event: () => {}, projects: () => {}, purchases: () => { s.buildings.school = 20; }, unlocks: () => {} };
  s.settings.paused = true;
  advanceGameTick(s, .2, hooks);
  assert.equal(s.workers.forage, 0);
  s.settings.paused = false;
  setAutoWorkerEnabled(s, 'school', true); setAutoWorkerLimit(s, 'forage', 2);
  s.buildings.school = 0;
  advanceGameTick(s, .2, hooks);
  assert.equal(s.workers.forage, 2);
  assert.equal(s.workers.school, 6, 'newly purchased capacity fills at tick end');
});

function automationFixture() {
  const s = createInitialState(CONFIG.version, 60, 0);
  s.tech.push('survival', 'tools', 'writing');
  s.buildings.forage = 10; s.buildings.school = 10;
  s.population = 8;
  return s;
}

test('automatic workers fill only idle population by priority and respect independent limits', () => {
  const s = automationFixture();
  setAutoWorkerEnabled(s, 'forage', true); setAutoWorkerEnabled(s, 'school', true);
  setAutoWorkerLimit(s, 'forage', 3);
  applyAutoWorkerAssignment(s);
  assert.equal(s.workers.forage, 0, 'master defaults off');
  setAutoWorkersEnabled(s, true);
  applyAutoWorkerAssignment(s);
  assert.equal(s.workers.forage, 3);
  assert.equal(s.workers.school, 5);
  s.population = 10;
  moveAutoWorkerPriority(s, 'school', 'forage');
  applyAutoWorkerAssignment(s);
  assert.equal(s.workers.forage, 3, 'never takes from existing jobs');
  assert.equal(s.workers.school, 7);
  setAutoWorkerLimit(s, 'school', 0);
  applyAutoWorkerAssignment(s);
  assert.equal(s.workers.school, 7, 'lower limit never removes workers');
  s.population = 12; setAutoWorkersEnabled(s, false);
  applyAutoWorkerAssignment(s);
  assert.equal(countUsedWorkers(s), 10);
});

test('automatic workers reject invalid settings and exclude unlimited or locked jobs', () => {
  const s = automationFixture();
  setAutoWorkersEnabled(s, true);
  const before = JSON.stringify(s.autoWorkers);
  for (const limit of [-2, .5, Infinity, NaN]) setAutoWorkerLimit(s, 'forage', limit);
  setAutoWorkerEnabled(s, 'lumber', true);
  assert.equal(JSON.stringify(s.autoWorkers), before);
  assert.ok(!AUTO_WORKER_JOBS.includes('lumber'));
  setAutoWorkerEnabled(s, 'lab', true); s.buildings.lab = 10;
  applyAutoWorkerAssignment(s);
  assert.equal(s.workers.lab, 0, 'locked job not assigned');
  setAutoWorkerEnabled(s, 'forage', true); setAutoWorkerLimit(s, 'forage', -1);
  s.buildings.forage = 2;
  applyAutoWorkerAssignment(s);
  assert.equal(s.workers.forage, calculateWorkerCapacity('forage', s));
});

test('automatic worker settings survive saves, reject missing records and clear on reset', () => {
  const s = createMilestoneState('ground');
  setAutoWorkersEnabled(s, true); setAutoWorkerEnabled(s, 'school', true); setAutoWorkerLimit(s, 'school', 7);
  moveAutoWorkerPriority(s, 'school', 'forage');
  const context = { now: 0, eventInterval: 60, housingCapacity: () => 1000, clampResources: () => {} };
  const raw = JSON.parse(JSON.stringify(s));
  assert.deepEqual(validateAndMigrateSave(raw, context).autoWorkers, s.autoWorkers);
  for (const malformed of [null, { ...raw.autoWorkers, enabled: 1 }, { ...raw.autoWorkers, priority: ['school', 'school'] }, { ...raw.autoWorkers, jobs: { school: { enabled: true, limit: -2 } } }]) {
    assert.throws(() => validateAndMigrateSave({ ...raw, autoWorkers: malformed }, context));
  }
  delete raw.autoWorkers;
  assert.throws(() => validateAndMigrateSave(raw, context));
  assert.equal(resetRunState(s, 'soft', 60, 0)!.next.autoWorkers.enabled, false);
});
