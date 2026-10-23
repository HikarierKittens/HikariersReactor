import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { CRISPR_UPGRADES } from '../src/data/crispr';
import { SPECIES_TRAITS, SPECIES_TRAIT_CAP } from '../src/data/species-traits';
import { createInitialState } from '../src/state/create-state';
import { validateCurrentSave } from '../src/state/validate-save';
import { calculateBuildingOutput } from '../src/simulation/building-production';
import { calculateProjectCost } from '../src/simulation/projects';
import { calculateArtistEffect } from '../src/simulation/morale';
import { calculateStorageBonuses } from '../src/simulation/storage-bonuses';
import { createGeneSynthesisPool } from '../src/simulation/genes';
import { ownedSpeciesTraits, toggleSpeciesTrait } from '../src/simulation/species-traits';

const context = { now: 0, eventInterval: 60, housingCapacity: () => 1000, clampResources: () => {} };

function fresh() {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.tech.push('crispr16', 'genetics');
  state.crispr.push('thirdGenerationCat');
  state.prestige.particles = 10000;
  return state;
}

test('the two new CRISPR upgrades sit in the T2/T3 chain at the requested prices', () => {
  const synthesis = CRISPR_UPGRADES.advancedGeneSynthesis;
  assert.equal(synthesis.name, '高级基因合成');
  assert.equal(synthesis.tier, 2);
  assert.equal(synthesis.cost, 200);
  assert.equal(synthesis.casimirCost, 25);
  assert.deepEqual(synthesis.pre, ['geneSplicing']);

  const third = CRISPR_UPGRADES.thirdGenerationCat;
  assert.equal(third.name, '第三代喵星人');
  assert.equal(third.tier, 3);
  assert.equal(third.cost, 1000);
  assert.deepEqual(third.pre, ['advancedGeneSynthesis']);
});

test('喵星人 starts with 聪明, 创造 and 可爱 within the cap', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  assert.deepEqual(ownedSpeciesTraits(state), ['smart', 'creative', 'cute']);
  assert.ok(ownedSpeciesTraits(state).length <= SPECIES_TRAIT_CAP);
});

test('traits cost their own particle price and are reversible', () => {
  const state = fresh();
  assert.equal(toggleSpeciesTrait(state, 'curious'), true);
  assert.equal(state.prestige.particles, 10000 - SPECIES_TRAITS.curious.cost);
  assert.ok(ownedSpeciesTraits(state).includes('curious'));
  assert.equal(toggleSpeciesTrait(state, 'curious'), true);
  assert.equal(state.prestige.particles, 10000 - 2 * SPECIES_TRAITS.curious.cost);
  assert.ok(!ownedSpeciesTraits(state).includes('curious'));
});

test('an initial trait can also be removed and bought back', () => {
  const state = fresh();
  assert.equal(toggleSpeciesTrait(state, 'cute'), true);
  assert.deepEqual(ownedSpeciesTraits(state), ['smart', 'creative']);
  assert.equal(toggleSpeciesTrait(state, 'cute'), true);
  assert.deepEqual(ownedSpeciesTraits(state), ['smart', 'creative', 'cute']);
  assert.equal(state.prestige.particles, 10000 - 2 * SPECIES_TRAITS.cute.cost);
});

test('the cap counts the initial traits and blocks the seventh purchase', () => {
  const state = fresh();
  state.speciesTraits = { traits: ['smart', 'creative', 'cute', 'curious'] };
  assert.equal(toggleSpeciesTrait(state, 'smart'), true); // remove one to make room
  assert.equal(state.speciesTraits.traits.length, 3);
  const filled = fresh();
  filled.speciesTraits = { traits: ['smart', 'creative', 'cute'] };
  // Fill up to the cap with the remaining known trait, then confirm it is refused.
  assert.equal(toggleSpeciesTrait(filled, 'curious'), true);
  filled.speciesTraits.traits = ['smart', 'creative', 'cute', 'curious'];
  assert.equal(filled.speciesTraits.traits.length, 4);
  assert.equal(toggleSpeciesTrait(filled, 'curious'), true); // removal still allowed
  assert.equal(toggleSpeciesTrait(filled, 'curious'), true);
  filled.prestige.particles = 0;
  assert.equal(toggleSpeciesTrait(filled, 'curious'), false, 'unaffordable purchase must be refused');
});

test('traits need 第三代喵星人 before they can be edited', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.prestige.particles = 10000;
  assert.equal(toggleSpeciesTrait(state, 'curious'), false);
});

test('聪明 adds flat knowledge to professors and scientists only', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.speciesTraits = { traits: [] };
  const school = calculateBuildingOutput('school', state).knowledge;
  const lab = calculateBuildingOutput('lab', state).knowledge;
  assert.equal(school, 2, 'baseline professor output is the raw 2/s');
  assert.equal(lab, 2, 'baseline scientist output is the raw 2/s');
  state.speciesTraits = { traits: ['smart'] };
  assert.equal(calculateBuildingOutput('school', state).knowledge, school + .25);
  assert.equal(calculateBuildingOutput('lab', state).knowledge, lab + .5);
  // A non-knowledge building is untouched by 聪明.
  const shorn = createInitialState(CONFIG.version, 60, 0);
  shorn.speciesTraits = { traits: [] };
  assert.deepEqual(calculateBuildingOutput('catCafe', state), calculateBuildingOutput('catCafe', shorn));
});

test('创造 cuts ARPA base price 20% and creep by 0.005', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.speciesTraits = { traits: [] };
  // stockExchange is the concrete case: 2M base with a 1.08 creep.
  assert.deepEqual(calculateProjectCost('stockExchange', state), { cash: 2000000, wood: 50000, brick: 25000, wroughtIron: 10000 });
  state.speciesTraits = { traits: ['creative'] };
  assert.deepEqual(calculateProjectCost('stockExchange', state), { cash: 1600000, wood: 40000, brick: 20000, wroughtIron: 8000 });
  // Repeat price shows both effects: 2M×1.08 = 2.16M becomes 1.6M×1.075 = 1.72M.
  const built = createInitialState(CONFIG.version, 60, 0);
  built.speciesTraits = { traits: [] };
  built.arpaBuildings.stockExchange = 1;
  assert.equal(calculateProjectCost('stockExchange', built).cash, 2160000);
  built.speciesTraits = { traits: ['creative'] };
  assert.equal(calculateProjectCost('stockExchange', built).cash, 1720000);
});

test('可爱 raises the artist happiness effect by 1%', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.speciesTraits = { traits: [] };
  const plain = calculateArtistEffect(state);
  state.speciesTraits = { traits: ['cute'] };
  assert.ok(Math.abs(calculateArtistEffect(state) - (plain + .01)) < 1e-12);
});

test('好奇 scales school knowledge capacity with population', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.speciesTraits = { traits: [] };
  state.population = 100;
  const plain = calculateStorageBonuses('school', state, null).knowledge!;
  state.speciesTraits = { traits: ['curious'] };
  const curious = calculateStorageBonuses('school', state, null).knowledge!;
  assert.ok(Math.abs(curious - plain * 1.1) < 1e-9, `${curious} vs ${plain * 1.1}`);
});

test('高级基因合成 doubles the DNA from the same knowledge', () => {
  function dnaAfterUpgrade(crispr: boolean): number {
    const state = createInitialState(CONFIG.version, 60, 0);
    state.tech.push('geneSynthesis', 'crispr16');
    state.crispr.push('geneSplicing');
    state.arpaBuildings.geneSequencing = 1;
    if (crispr) state.crispr.push('advancedGeneSynthesis');
    state.geneModification.synthesis = { C: 100, G: 0, A: 0, T: 0 };
    const pool = createGeneSynthesisPool(state, 1, 1, { knowledge: 0 } as never);
    pool.pool.knowledge = 200000;
    return pool.result().dna.C || 0;
  }
  const plain = dnaAfterUpgrade(false), boosted = dnaAfterUpgrade(true);
  assert.ok(plain > 0, 'baseline must actually synthesise DNA');
  assert.ok(Math.abs(boosted - plain * 2) < 1e-9, `${boosted} vs ${plain * 2}`);
});

test('saves from before 0.9.44 load with the default traits', () => {
  const raw = JSON.parse(JSON.stringify(createInitialState(CONFIG.version, 60, 0)));
  delete raw.speciesTraits;
  const loaded = validateCurrentSave(raw, context);
  assert.deepEqual(loaded.speciesTraits.traits, ['smart', 'creative', 'cute']);
});

test('malformed trait saves are rejected instead of trimmed', () => {
  for (const bad of [{ traits: ['smart', 'smart'] }, { traits: ['nope'] }, { traits: ['smart', 'creative', 'cute', 'curious', 'smart'] }, { traits: 'smart' }, null]) {
    const raw = JSON.parse(JSON.stringify(createInitialState(CONFIG.version, 60, 0)));
    raw.speciesTraits = bad;
    assert.throws(() => validateCurrentSave(raw, context), JSON.stringify(bad));
  }
});

test('a well-formed trait list round-trips through the save', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.speciesTraits = { traits: ['smart', 'curious'] };
  const loaded = validateCurrentSave(JSON.parse(JSON.stringify(state)), context);
  assert.deepEqual(loaded.speciesTraits.traits, ['smart', 'curious']);
});
