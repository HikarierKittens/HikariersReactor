import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { validateCurrentSave } from '../src/state/validate-save';
import { validateStoryArchive } from '../src/state/validate-story';
import { STORY_CHAPTER_IDS, collectStoryMilestones, markStoryRead, updateStoryProgress } from '../src/simulation/story';
import { updateProgression } from '../src/simulation/progression';
import { launchEscapePrestige, launchNuclearPrestige, resetRunState } from '../src/simulation/prestige';
import { SHIP_COMPONENTS } from '../src/simulation/spaceship';
import type { GameState, ShipComponentId, StoryChapterId } from '../src/types/state';

const fresh = () => createInitialState(CONFIG.version, 60, 0);
const gates: [StoryChapterId, (s: GameState) => void][] = [
  ['firstShelter', s => { s.buildings.nest = 1; }],
  ['beyondStone', s => { s.tech.push('metallurgy'); }],
  ['sleeplessCity', s => { s.tech.push('electricity'); }],
  ['aboveRoof', s => { s.tech.push('spaceflight'); }],
  ['secondHome', s => { s.buildings.moonBase = 1; }],
  ['interplanetaryRoutes', s => { s.buildings.asrielSpaceport = 1; }],
  ['strangeElement', s => { s.resources.e710 = .01; }],
  ['anotherMind', s => { s.buildings.aiSupercore = 1; }],
];

test('appendix milestones unlock from independently observed technology buildings and permanent progress', () => {
  const cases: [(s: GameState) => void, StoryChapterId[]][] = [
    [s => { s.tech.push('escapePlan'); }, ['essPlan']],
    [s => { s.buildings.interstellarDock = 1; }, ['essPlan']],
    [s => { s.prestige.escapeResets = 1; }, ['essPlan', 'firstEscape']],
    [s => { s.tech.push('genetics'); }, ['geneRewrite']],
    [s => { s.crispr.push('materialEfficiency'); }, ['geneRewrite']],
    [s => { s.tech.push('nuclearProgram'); }, ['nuclearChoice']],
    [s => { s.prestige.nuclearResets = 1; }, ['nuclearChoice']],
    [s => { s.buildings.swarmControlStation = 1; }, ['dysonSwarm']],
    [s => { s.buildings.swarmSatellite = 1; }, ['dysonSwarm']],
  ];
  for (const [apply, expected] of cases) {
    const s = fresh(); apply(s); const before = structuredClone(s);
    assert.deepEqual(collectStoryMilestones(s), expected);
    assert.deepEqual(s, before);
    assert.deepEqual(updateStoryProgress(s), expected);
    assert.deepEqual(updateStoryProgress(s), []);
    assert.deepEqual(s.logs, before.logs);
  }
  const s = fresh(); s.tech.push('dysonTheory');
  assert.deepEqual(collectStoryMilestones(s), []);
  assert.equal(STORY_CHAPTER_IDS.length, 22);
});

test('first escape records only a successful reset immediately and failed launches leave no archive effects', () => {
  const s = fresh(); s.buildings.interstellarDock = 1;
  const incomplete = structuredClone(s);
  assert.equal(launchEscapePrestige(s, 60, 0), null);
  assert.deepEqual(s, incomplete);
  for (const id of Object.keys(SHIP_COMPONENTS) as ShipComponentId[]) s.shipComponents[id] = true;
  assert.deepEqual(collectStoryMilestones(s), ['essPlan']);
  const before = structuredClone(s);
  const result = launchEscapePrestige(s, 60, 0)!;
  assert.ok(result);
  assert.equal(result.next.prestige.escapeResets, 1);
  assert.deepEqual(result.next.story, { unlocked: ['essPlan', 'firstEscape'], read: [] });
  assert.deepEqual(s, before);
  s.prestige.escapeResets = Number.MAX_SAFE_INTEGER;
  const rejected = structuredClone(s);
  assert.equal(launchEscapePrestige(s, 60, 0), null);
  assert.deepEqual(s, rejected);
});

test('current appendices retain independent read records across reset and missing archives reject', () => {
  const s = fresh(); s.prestige.escapeResets = 1; s.prestige.nuclearResets = 1; s.crispr = ['materialEfficiency'];
  s.story = { unlocked: [...gates.map(([id]) => id), 'essPlan', 'firstEscape', 'geneRewrite', 'nuclearChoice'], read: ['firstShelter', 'anotherMind'] };
  const context = { now: 0, eventInterval: 60, housingCapacity: () => 100, clampResources: () => {} };
  const raw = JSON.parse(JSON.stringify(s)), before = structuredClone(raw);
  const loaded = validateCurrentSave(raw, context);
  assert.deepEqual(raw, before);
  assert.deepEqual(loaded.story.unlocked, [...gates.map(([id]) => id), 'essPlan', 'firstEscape', 'geneRewrite', 'nuclearChoice']);
  assert.deepEqual(loaded.story.read, ['firstShelter', 'anotherMind']);
  markStoryRead(loaded, 'firstEscape');
  const next = resetRunState(loaded, 'soft', 60, 0)!.next;
  assert.deepEqual(next.story, loaded.story);
  markStoryRead(next, 'essPlan');
  assert.equal(loaded.story.read.includes('essPlan'), false);
  const old = JSON.parse(JSON.stringify(s)); delete old.story;
  assert.throws(() => validateCurrentSave(old, context));
  assert.deepEqual(resetRunState(next, 'hard', 60, 0)!.next.story, { unlocked: [], read: [] });
});

test('eight story milestones unlock independently, immediately and without logs or timers', () => {
  for (const [id, apply] of gates) {
    const s = fresh(), before = structuredClone(s);
    assert.deepEqual(collectStoryMilestones(s), []);
    assert.deepEqual(s, before);
    apply(s);
    assert.deepEqual(updateStoryProgress(s), [id]);
    assert.deepEqual(s.story, { unlocked: [id], read: [] });
    assert.deepEqual(updateStoryProgress(s), []);
    assert.deepEqual(s.logs, before.logs);
    assert.equal(s.time, before.time);
  }
  const s = fresh(); s.buildings.aiSupercore = 0;
  assert.deepEqual(collectStoryMilestones(s), []);
  s.unlockedResources.push('e710');
  assert.deepEqual(collectStoryMilestones(s), ['strangeElement']);
});

test('normal progression collects archives in chapter order and read flags are idempotent', () => {
  const s = fresh();
  for (const [, apply] of [...gates].reverse()) apply(s);
  updateProgression(s);
  assert.deepEqual(s.story.unlocked, gates.map(([id]) => id));
  assert.equal(markStoryRead(s, 'anotherMind'), true);
  assert.equal(markStoryRead(s, 'anotherMind'), false);
  assert.equal(markStoryRead(fresh(), 'firstShelter'), false);
  s.buildings.aiSupercore = 0; s.resources.e710 = 0; s.tech = [];
  updateStoryProgress(s);
  assert.deepEqual(s.story.unlocked, gates.map(([id]) => id));
  assert.deepEqual(s.story.read, ['anotherMind']);
});

test('missing archives reject immutably while current milestones preserve read flags on roundtrip', () => {
  const s = fresh(); s.tech = ['survival']; s.buildings.nest = 1;
  const raw = JSON.parse(JSON.stringify(s)); delete raw.story;
  const before = structuredClone(raw);
  const context = { now: 0, eventInterval: 60, housingCapacity: () => 100, clampResources: () => {} };
  assert.throws(() => validateCurrentSave(raw, context));
  assert.deepEqual(raw, before);
  updateStoryProgress(s);
  const restored = validateCurrentSave(JSON.parse(JSON.stringify(s)), context);
  assert.deepEqual(restored.story, { unlocked: ['firstShelter'], read: [] });
  markStoryRead(restored, 'firstShelter');
  const again = validateCurrentSave(JSON.parse(JSON.stringify(restored)), context);
  assert.deepEqual(again.story, restored.story);
  assert.notEqual(again.story.unlocked, restored.story.unlocked);
  assert.notEqual(again.story.read, restored.story.read);
  assert.equal(Object.hasOwn(again.story, 'time'), false);
});

test('story validation rejects present malformed fields and read records not already unlocked', () => {
  for (const story of [null, [], {}, { unlocked: [], read: null }, { unlocked: ['unknown'], read: [] },
    { unlocked: ['firstShelter', 'firstShelter'], read: [] },
    { unlocked: [], read: ['firstShelter'] },
    { unlocked: ['firstShelter'], read: ['firstShelter', 'firstShelter'] }]) {
    assert.throws(() => validateStoryArchive({ story }, fresh()));
  }
  const s = fresh(); s.buildings.nest = 1;
  assert.throws(() => validateStoryArchive({ story: { unlocked: [], read: ['firstShelter'] } }, s));
});

test('soft nuclear and escape resets preserve independent archives and synchronize pending milestones; hard reset clears', () => {
  const s = fresh(); s.buildings.nest = 1;
  updateStoryProgress(s); markStoryRead(s, 'firstShelter');
  s.buildings.aiSupercore = 1;
  s.tech.push('nuclearProgram'); s.nuclearProgress = 100;
  s.buildings.interstellarDock = 1;
  for (const id of Object.keys(SHIP_COMPONENTS) as ShipComponentId[]) s.shipComponents[id] = true;
  const before = structuredClone(s);
  const resets = [resetRunState(s, 'soft', 60, 0), launchNuclearPrestige(s, 60, 0), launchEscapePrestige(s, 60, 0)];
  for (const result of resets) {
    assert.ok(result);
    assert.deepEqual(result.next.story, { unlocked: ['firstShelter', 'anotherMind', 'essPlan', ...(result.next.prestige.escapeResets > 0 ? ['firstEscape'] : []), 'nuclearChoice'], read: ['firstShelter'] });
    assert.notEqual(result.next.story.unlocked, s.story.unlocked);
    assert.notEqual(result.next.story.read, s.story.read);
    assert.equal(result.next.buildings.aiSupercore, 0);
  }
  assert.deepEqual(s, before);
  assert.deepEqual(resetRunState(s, 'hard', 60, 0)!.next.story, { unlocked: [], read: [] });
});
