import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { validateCurrentSave } from '../src/state/validate-save';
import { awardAchievement, getAchievementLevel, getAchievementMasteryBonus, getCurrentAchievementLevel, updateAchievementTracking } from '../src/simulation/achievement-tracking';
import { launchBlackHolePrestige, launchEscapePrestige, launchNuclearPrestige, resetRunState } from '../src/simulation/prestige';
import { launchChallenges } from '../src/simulation/challenges';
import type { AchievementId, ChallengeGeneId, GameState, ShipComponentId, SnapshotAchievementId } from '../src/types/state';

const fresh = () => createInitialState(CONFIG.version, 60, 0);
const genes: ChallengeGeneId[] = ['particleImbalance', 'geneCollapse', 'industrialFracture'];
const context = { now: 0, eventInterval: 60, housingCapacity: () => 1000, clampResources: () => {} };

test('grades use active run count capped at three, not permanent challenge unlocks', () => {
  const state = fresh(); state.crispr = ['challengeGene'];
  for (let count = 0; count <= 3; count++) {
    state.challenge.genes = genes.slice(0, count);
    assert.equal(getCurrentAchievementLevel(state), count);
  }
  state.challenge.genes.push('particleImbalance');
  assert.equal(getCurrentAchievementLevel(state), 3);
  state.challenge.genes = [];
  assert.equal(getCurrentAchievementLevel(state), 0);
});

test('mastery is additive across achievements but each highest grade replaces lower grades', () => {
  const state = fresh();
  assert.equal(getAchievementLevel(state, 'swarmEclipse'), undefined);
  assert.equal(getAchievementMasteryBonus({}), 0);
  for (let grade = 0; grade <= 3; grade++) {
    state.challenge.genes = genes.slice(0, grade);
    assert.equal(awardAchievement(state, 'swarmEclipse'), true);
    assert.equal(getAchievementLevel(state, 'swarmEclipse'), grade);
    assert.equal(getAchievementMasteryBonus(state), (grade + 1) * .0025);
    assert.equal(awardAchievement(state, 'swarmEclipse'), false);
  }
  state.challenge.genes = [];
  assert.equal(awardAchievement(state, 'swarmEclipse'), false);
  assert.equal(awardAchievement(state, 'nuclearCuriosity'), true);
  assert.equal(getAchievementMasteryBonus(state), .0125);
  assert.deepEqual(state.achievements, ['swarmEclipse', 'nuclearCuriosity']);
  state.achievementLevels = {};
  assert.equal(getAchievementLevel(state, 'swarmEclipse'), 0);
  assert.equal(getAchievementMasteryBonus(state), .005);
  assert.deepEqual(state.achievementLevels, {}, 'selectors never backfill grades');
});

test('snapshot upgrades require a new false-to-true completion, never inherited counters or true baselines', () => {
  const state = fresh(); state.buildings.swarmSatellite = 4096;
  assert.deepEqual(updateAchievementTracking(state), ['swarmEclipse']);
  state.challenge.genes = genes;
  state.prestige.nuclearResets = state.prestige.escapeResets = state.prestige.blackHoleResets = 10;
  assert.deepEqual(updateAchievementTracking(state), []);
  assert.equal(getAchievementLevel(state, 'swarmEclipse'), 0);
  assert.equal(getAchievementLevel(state, 'nuclearCuriosity'), undefined);
  state.buildings.swarmSatellite = 4095;
  assert.deepEqual(updateAchievementTracking(state), []);
  state.buildings.swarmSatellite = 4096;
  assert.deepEqual(updateAchievementTracking(state), ['swarmEclipse']);
  assert.equal(getAchievementLevel(state, 'swarmEclipse'), 3);
  assert.deepEqual(updateAchievementTracking(state), []);
});

test('challenge launch preserves best grades without upgrading already earned achievements', () => {
  const state = fresh(); state.crispr = ['challengeGene'];
  awardAchievement(state, 'swarmEclipse');
  const before = structuredClone(state);
  const next = launchChallenges(state, genes, 60, 0)!.next;
  assert.deepEqual(state, before);
  assert.equal(getAchievementLevel(next, 'swarmEclipse'), 0);
  assert.deepEqual(updateAchievementTracking(next), []);
  next.buildings.swarmSatellite = 4096;
  assert.deepEqual(updateAchievementTracking(next), ['swarmEclipse']);
  assert.equal(getAchievementLevel(next, 'swarmEclipse'), 3);
});

function readyNuclear(state: GameState): void {
  state.tech.push('nuclearProgram'); state.nuclearProgress = 100;
}
function readyEscape(state: GameState): void {
  state.buildings.interstellarDock = 1;
  for (const id of Object.keys(state.shipComponents) as ShipComponentId[]) state.shipComponents[id] = true;
}
function readyBlackHole(state: GameState): void {
  state.tech.push('energyShield', 'penroseTheory', 'massEjector');
  state.blackHoleMissionCompleted = true; state.buildings.penroseSphere = 100;
  state.blackHole.unstable = true; state.blackHole.exoticMass = .03;
  Object.assign(state.resources, { knowledge: 5e6, nanoAlloy: 2e5, e710: 5000 });
}
const resets: { name: string; prepare: (s: GameState) => void; run: (s: GameState) => { next: GameState } | null; event?: AchievementId }[] = [
  { name: 'soft', prepare: () => {}, run: s => resetRunState(s, 'soft', 60, 0) },
  { name: 'nuclear', prepare: readyNuclear, run: s => launchNuclearPrestige(s, 60, 0), event: 'nuclearCuriosity' },
  { name: 'escape', prepare: readyEscape, run: s => launchEscapePrestige(s, 60, 0), event: 'escapeRun' },
  { name: 'black hole', prepare: readyBlackHole, run: s => launchBlackHolePrestige(s, 60, 0), event: 'spaceDestroyer' },
];
for (const reset of resets) {
  test(`${reset.name} reset preserves final snapshot upgrade and uses source challenges without mutating source`, () => {
    const state = fresh();
    awardAchievement(state, 'swarmEclipse');
    if (reset.event) awardAchievement(state, reset.event);
    state.challenge.genes = [...genes];
    state.buildings.swarmSatellite = 4096;
    reset.prepare(state);
    const before = structuredClone(state);
    const result = reset.run(state);
    assert.ok(result, 'fixture must actually be ready to reset');
    const next = result.next;
    assert.deepEqual(state, before);
    assert.deepEqual(next.challenge.genes, []);
    assert.equal(getAchievementLevel(next, 'swarmEclipse'), 3);
    assert.notEqual(next.achievementLevels, state.achievementLevels);
    assert.equal(next.logs.filter(log => log.type === 'achievement' && log.text.includes('遮天蔽日')).length, 1);
    if (reset.event) assert.equal(getAchievementLevel(next, reset.event), 3);
    next.achievementLevels!.swarmEclipse = 1;
    assert.deepEqual(state, before);
  });
  test(`${reset.name} reset preserves a higher grade without duplicate awards`, () => {
    const state = fresh(); state.challenge.genes = [...genes];
    awardAchievement(state, 'swarmEclipse');
    if (reset.event) awardAchievement(state, reset.event);
    state.challenge.genes = []; reset.prepare(state);
    const next = reset.run(state)!.next;
    assert.equal(getAchievementLevel(next, 'swarmEclipse'), 3);
    if (reset.event) assert.equal(getAchievementLevel(next, reset.event), 3);
    assert.equal(next.logs.filter(log => log.text.includes('遮天蔽日')).length, 0);
  });
}

test('all snapshot achievement conditions use the same new-and-upgraded award path', () => {
  const completions: [SnapshotAchievementId, (state: GameState) => void][] = [
    ['artificialCelestial', readyEscape],
    ['swarmEclipse', state => { state.buildings.swarmSatellite = 4096; }],
    ['worldExecution', state => { state.stageThree.coreActivated = true; }],
    ['overclockPrince', state => { state.tech.push('overclocking13'); }],
  ];
  for (const [id, complete] of completions) {
    const state = fresh(); complete(state);
    assert.ok(updateAchievementTracking(state).includes(id));
    const next = resetRunState(state, 'soft', 60, 0)!.next;
    next.challenge.genes = [...genes];
    assert.deepEqual(updateAchievementTracking(next), []);
    complete(next);
    assert.ok(updateAchievementTracking(next).includes(id));
    assert.equal(getAchievementLevel(next, id), 3);
    assert.deepEqual(updateAchievementTracking(next), []);
  }
});

test('hard reset clears grades and failed reset attempts cannot award or mutate', () => {
  const state = fresh(); state.challenge.genes = [...genes]; awardAchievement(state, 'swarmEclipse');
  const before = structuredClone(state);
  for (const launch of [launchNuclearPrestige, launchEscapePrestige, launchBlackHolePrestige]) {
    assert.equal(launch(state, 60, 0), null); assert.deepEqual(state, before);
  }
  const next = resetRunState(state, 'hard', 60, 0)!.next;
  assert.deepEqual(next.achievements, []); assert.deepEqual(next.achievementLevels, {});
  assert.deepEqual(state, before);
});

test('current saves validate sparse grades strictly, allow the ungraded feature baseline, and preserve input', () => {
  const state = fresh(); state.achievements = ['swarmEclipse']; state.achievementLevels = { swarmEclipse: 3 };
  const before = structuredClone(state);
  const loaded = validateCurrentSave(state, context);
  assert.deepEqual(loaded.achievementLevels, { swarmEclipse: 3 }); assert.deepEqual(state, before);
  assert.notEqual(loaded.achievementLevels, state.achievementLevels);
  delete state.achievementLevels;
  const missingBefore = structuredClone(state);
  const ungraded = validateCurrentSave(state, context);
  assert.equal(getAchievementLevel(ungraded, 'swarmEclipse'), 0);
  assert.deepEqual(ungraded.achievementLevels, {}); assert.deepEqual(state, missingBefore);
  for (const achievementLevels of [undefined, null, [], 1, { unknown: 0 }, { nuclearCuriosity: 1 }, { swarmEclipse: -1 }, { swarmEclipse: 4 }, { swarmEclipse: .5 }, { swarmEclipse: NaN }, { swarmEclipse: Infinity }, { swarmEclipse: '1' }]) {
    const raw = { ...state, achievementLevels }; const copy = structuredClone(raw);
    assert.throws(() => validateCurrentSave(raw, context)); assert.deepEqual(raw, copy);
  }
});
