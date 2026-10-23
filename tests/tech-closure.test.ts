/** Guards the hand-written technology exclusion lists against a new state-gated technology.
 *  Before this file, adding a gated technology silently broke five unrelated suites. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { TECHNOLOGIES } from '../src/data/technologies';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { validateCurrentSave } from '../src/state/validate-save';
import { stateGatedTechnologies } from './support/tech-closure';
import type { TechnologyId } from '../src/types/technologies';

const context = { now: 0, eventInterval: 60, housingCapacity: () => 10000, clampResources: () => {} };
const all = Object.keys(TECHNOLOGIES) as TechnologyId[];

/** Pulls the inline `Object.keys(TECHNOLOGIES).filter(...)` arrays out of a test file. */
function exclusionLists(file: string): string[][] {
  const text = fs.readFileSync(file, 'utf8');
  const lists: string[][] = [];
  const pattern = /Object\.keys\(TECHNOLOGIES\)\.filter\(([\s\S]{0,3000}?)\)(?:\s*as TechnologyId\[\]|;)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const body = match[1] ?? '';
    const ids = [...body.matchAll(/'([A-Za-z0-9]+)'/g)].map(hit => hit[1] ?? '');
    if (ids.length) lists.push(ids);
  }
  return lists;
}

const filesWithHandWrittenLists = [
  'tests/outer-space.test.ts',
  'tests/hyperspace-energy.test.ts',
  'tests/hyperspace-services.test.ts',
  'tests/retired-interstellar.test.ts',
  'tests/retired-tianxing.test.ts',
];

test('each state-gated technology is actually rejected when granted alone', () => {
  const gated = [...stateGatedTechnologies()].sort();
  assert.ok(gated.length > 0, 'the gate set must not be empty, or every guard here is vacuous');
  for (const id of gated) {
    const state = createInitialState(CONFIG.version, 60, 0);
    state.tech = [id];
    assert.throws(() => validateCurrentSave(JSON.parse(JSON.stringify(state)), context),
      `${id} is classified as gated but validates alone on a bare state`);
  }
});

test('an ungated technology validates alone, so the classifier is not just "everything fails"', () => {
  const gated = stateGatedTechnologies();
  // Root technologies with no gate of any kind are the clean control group.
  const ungatedRoots = all.filter(id => {
    const definition = TECHNOLOGIES[id] as unknown as Record<string, unknown>;
    return TECHNOLOGIES[id].pre.length === 0 && !definition.spaceMissionRequired
      && !definition.kerberosMissionRequired && !definition.arpaRequiredCount && !gated.has(id);
  });
  assert.ok(ungatedRoots.length > 0, 'need at least one ungated root to prove the classifier discriminates');
  for (const id of ungatedRoots) {
    const state = createInitialState(CONFIG.version, 60, 0);
    state.tech = [id];
    assert.doesNotThrow(() => validateCurrentSave(JSON.parse(JSON.stringify(state)), context),
      `${id} has no gate but was rejected`);
  }
});

test('each hand-written exclusion list still parses and only names real technologies', () => {
  const known = new Set<string>(all);
  for (const file of filesWithHandWrittenLists) {
    const lists = exclusionLists(file);
    assert.ok(lists.length > 0, `${file} should still contain an inline technology list`);
    for (const list of lists) {
      for (const id of list) assert.ok(known.has(id), `${file} excludes unknown technology ${id}`);
    }
  }
});

/**
 * The regression guard. A brand-new gated technology shows up as a failure here, with the
 * instruction to exclude it in the hand-written lists and then extend this snapshot — so the
 * cost lands in one obvious place instead of five unrelated suites going red at random.
 */
test('the gate set stays reconciled with the hand-written exclusion lists', () => {
  const RECONCILED_GATED = [
    'aiDataCenter', 'asteroidBeltMining', 'atmosphericMining', 'crispr16', 'dimensionCompression',
    'dysonTheory', 'escapePlan', 'geothermalFurnace', 'helium3ExtractionOptimization',
    'higherDimensionalStorage', 'laser', 'outerPlanetExploration', 'overclocking13', 'penroseTheory',
    'quantumTunnelingThermalProcessing', 'solarExploration', 'stellarForge', 'talosMoonScanning',
    'tourismIndustry',
  ];
  assert.deepEqual([...stateGatedTechnologies()].sort(), [...RECONCILED_GATED].sort(),
    'a gated technology was added or removed: exclude it in the hand-written lists first, then update RECONCILED_GATED');
});
