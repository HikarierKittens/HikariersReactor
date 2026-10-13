import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CRISPR_UPGRADES } from '../src/data/crispr';
import { GENE_DEFINITIONS, DNA_KNOWLEDGE_COST } from '../src/data/genes';
import { validateCurrentSave } from '../src/state/validate-save';
import { purchaseCrisprUpgrade } from '../src/simulation/crispr';
import { craftDna, upgradeGene, calculateGeneUpgradeCost, isGeneModificationUnlocked, MAX_GENE_LEVEL } from '../src/simulation/genes';
import { calculateBuildingOutput } from '../src/simulation/building-production';
import { calculateFactoryRecipe } from '../src/simulation/factory';
import { calculateCombatPower, calculateSoldierPressure, calculatePopulationPressure } from '../src/simulation/government';
import { calculateProduction } from '../src/simulation/production';
import { calculateResourceBreakdown, calculateResourceFactorRows } from '../src/simulation/resource-breakdown';
import { isPrestigeResourceUnlocked } from '../src/simulation/prestige-unlocks';
import { updateProgression } from '../src/simulation/progression';
import { launchNuclearPrestige, resetRunState } from '../src/simulation/prestige';
import { createMilestoneState } from './fixtures/milestones';
import type { GameState, GeneId } from '../src/types/state';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const context = { now: 0, eventInterval: 60, housingCapacity: () => 1e6, clampResources: () => {} };
const near = (a: number, b: number, label = '') => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${label}: ${a} != ${b}`);

/** Space-era run with 基因测序 complete; caller decides whether 基因剪切 is owned. */
function geneState(spliced = true): GameState {
  const s = createMilestoneState('space');
  s.tech.push('crispr16');
  s.arpaBuildings.geneSequencing = 1;
  if (spliced) s.crispr.push('geneOptimization', 'geneSplicing');
  return s;
}

test('基因剪切 is a T1 CRISPR upgrade costing 100 particles plus 25 casimir', () => {
  assert.deepEqual({ ...CRISPR_UPGRADES.geneSplicing, desc: undefined }, { name: '基因剪切', tier: 1, cost: 100, casimirCost: 25, pre: ['geneOptimization'], desc: undefined });
  const s = geneState(false);
  s.crispr.push('geneOptimization');
  s.prestige.particles = 100; s.prestige.casimir = 24;
  assert.equal(purchaseCrisprUpgrade(s, 'geneSplicing'), false, 'casimir short');
  assert.equal(s.prestige.particles, 100);
  s.prestige.casimir = 25;
  assert.equal(purchaseCrisprUpgrade(s, 'geneSplicing'), true);
  assert.deepEqual([s.prestige.particles, s.prestige.casimir], [0, 0]);
  // Lifetime casimir lower bound includes the spent crystals on load.
  assert.equal(validateCurrentSave(clone({ ...s, statistics: undefined }), context).statistics.lifetime.casimirEarned, 25);
});

test('gene modification unlocks only with 基因剪切 and this run\'s 基因测序', () => {
  const s = geneState(false);
  assert.equal(isGeneModificationUnlocked(s), false);
  s.crispr.push('geneOptimization', 'geneSplicing');
  assert.equal(isGeneModificationUnlocked(s), true);
  s.arpaBuildings.geneSequencing = 0;
  assert.equal(isGeneModificationUnlocked(s), false);
  s.resources.knowledge = 1e7;
  assert.equal(craftDna(s, 'C', 1), 0, 'locked crafting is rejected');
  assert.equal(s.resources.knowledge, 1e7);
});

test('DNA costs 200k knowledge each, honours multipliers and stops at affordability', () => {
  const s = geneState();
  s.resources.knowledge = DNA_KNOWLEDGE_COST * 12.5;
  const spentBefore = s.statistics.run.knowledgeSpent;
  assert.equal(craftDna(s, 'G', 10), 10);
  assert.equal(s.geneModification.dna.G, 10);
  near(s.resources.knowledge, DNA_KNOWLEDGE_COST * 2.5);
  assert.equal(craftDna(s, 'A', 25), 2, 'partial batch limited by knowledge');
  assert.equal(craftDna(s, 'T', 1), 0);
  assert.equal(craftDna(s, 'X', 1), 0);
  assert.equal(craftDna(s, 'C', 1.5), 0);
  near(s.statistics.run.knowledgeSpent - spentBefore, DNA_KNOWLEDGE_COST * 12);
});

test('gene upgrades cost 10·2^level of their own base', () => {
  const s = geneState();
  for (const id of Object.keys(GENE_DEFINITIONS) as GeneId[]) assert.equal(calculateGeneUpgradeCost(s, id), 10);
  s.geneModification.dna.C = 30; s.geneModification.dna.G = 1000;
  assert.equal(upgradeGene(s, 'goodCat'), true);
  assert.equal(calculateGeneUpgradeCost(s, 'goodCat'), 20);
  assert.equal(upgradeGene(s, 'goodCat'), true);
  assert.deepEqual([s.geneModification.levels.goodCat, s.geneModification.dna.C], [2, 0]);
  assert.equal(upgradeGene(s, 'hardWorking'), false, 'C exhausted; G is not spent for C genes');
  assert.equal(s.geneModification.dna.G, 1000);
  s.geneModification.levels.perfectionism = MAX_GENE_LEVEL;
  assert.equal(upgradeGene(s, 'perfectionism'), false);
  assert.equal(upgradeGene(s, 'unknown'), false);
});

test('each gene applies its exact per-level bonus', () => {
  const s = geneState();
  s.population = 100;
  const base = clone(s);
  const levels: Partial<Record<GeneId, number>> = { goodCat: 3, hardWorking: 2, superWorkshop: 5, perfectionism: 4, titanPower: 2, advancedScience: 7, catCohesion: 10, kinoFire: 6 };
  Object.assign(s.geneModification.levels, levels);
  near(calculateBuildingOutput('catCafe', s).cash!, calculateBuildingOutput('catCafe', base).cash! * 1.12, 'goodCat');
  near(calculateBuildingOutput('mine', s).iron!, calculateBuildingOutput('mine', base).iron! * 1.08, 'hardWorking mine');
  near(calculateBuildingOutput('coalMine', s).coal!, calculateBuildingOutput('coalMine', base).coal! * 1.08, 'hardWorking coal');
  near(calculateBuildingOutput('cementWorkshop', s).cement!, calculateBuildingOutput('cementWorkshop', base).cement! * 1.1, 'superWorkshop');
  near(calculateBuildingOutput('school', s).knowledge!, calculateBuildingOutput('school', base).knowledge! * 1.07, 'advancedScience school');
  near(calculateBuildingOutput('lab', s).knowledge!, calculateBuildingOutput('lab', base).knowledge! * 1.07, 'advancedScience lab');
  near(calculateBuildingOutput('smelter', s).metal!, calculateBuildingOutput('smelter', base).metal! * 1.06, 'kinoFire');
  assert.deepEqual(calculateBuildingOutput('lumber', s), calculateBuildingOutput('lumber', base), 'unrelated buildings unchanged');
  const recipe = calculateFactoryRecipe('alloy', s), plain = calculateFactoryRecipe('alloy', base);
  assert.deepEqual(recipe.input, plain.input, 'perfectionism does not raise ingredients');
  for (const [id, value] of Object.entries(plain.output)) near(recipe.output[id as keyof typeof recipe.output]!, value * 1.08, 'perfectionism');
  near(calculateCombatPower(s), calculateCombatPower(base) * 1.1, 'titanPower');
  near(calculatePopulationPressure(s), 100 * .5 * .9, 'catCohesion population');
  near(calculateSoldierPressure(s), calculateSoldierPressure(base) * .95, 'catCohesion soldiers');
});

test('gene bonuses reach real settlement and the resource tooltip rows', () => {
  const s = geneState();
  s.buildings.smelter = Math.max(4, s.buildings.smelter);
  Object.assign(s.resources, { iron: 1e5, coal: 1e5, energy: 1e5 });
  const before = calculateResourceBreakdown('metal', s, calculateProduction(s)).entries.find(entry => entry.id === 'smelter')!.value;
  s.geneModification.levels.kinoFire = 10;
  const result = calculateProduction(s);
  const after = calculateResourceBreakdown('metal', s, result).entries.find(entry => entry.id === 'smelter')!.value;
  near(after, before * 1.1, 'settled smelter metal');
  // Genes are part of the base output: the source row grows, no separate gene row is listed.
  const plain = geneState(); plain.buildings.smelter = s.buildings.smelter;
  Object.assign(plain.resources, { iron: 1e5, coal: 1e5, energy: 1e5 });
  const baseRow = (state: GameState) => calculateResourceFactorRows('metal', state, calculateProduction(state)).rows.find(row => !row.child && row.name === '冶炼厂');
  const rows = calculateResourceFactorRows('metal', s, result).rows;
  assert.ok(!rows.some(row => Object.values(GENE_DEFINITIONS).some(gene => row.name === gene.name)), JSON.stringify(rows));
  assert.ok(baseRow(s) && baseRow(plain) && baseRow(s)!.value !== baseRow(plain)!.value, 'base row reflects the gene');
  // Factory lines: 完美主义 is folded into the line row too.
  const factory = geneState(); factory.buildings.factory = 1; factory.lines.alloy = 1;
  Object.assign(factory.resources, { copper: 1e5, titanium: 1e5, energy: 1e5 });
  factory.geneModification.levels.perfectionism = 5;
  assert.ok(!calculateResourceFactorRows('alloy', factory, calculateProduction(factory)).rows.some(row => row.name === '完美主义'));
});

test('gene state is run scoped and round-trips through save validation', () => {
  const s = geneState();
  s.geneModification.dna = { C: 1, G: 2, A: 3, T: 4 };
  s.geneModification.levels.titanPower = 3;
  const restored = validateCurrentSave(clone(s), context);
  assert.deepEqual(restored.geneModification, s.geneModification);
  const legacy = clone(s) as unknown as Record<string, unknown>;
  delete legacy.geneModification;
  assert.equal(validateCurrentSave(legacy, context).geneModification.levels.titanPower, 0, 'older saves start at level 0');
  for (const bad of [{ dna: { C: -1 } }, { dna: { X: 1 } }, { levels: { goodCat: 1.5 } }, { levels: { goodCat: MAX_GENE_LEVEL + 1 } }, { extra: 1 }]) {
    assert.throws(() => validateCurrentSave({ ...clone(s), geneModification: bad }, context), JSON.stringify(bad));
  }
  const soft = resetRunState(s, 'soft', 60, 0)!.next;
  assert.deepEqual(soft.geneModification.dna, { C: 0, G: 0, A: 0, T: 0 });
  assert.equal(soft.geneModification.levels.titanPower, 0);
  assert.ok(soft.crispr.includes('geneSplicing'), '基因剪切 itself is permanent');
});

test('prestige resources stay hidden until first held, then stay unlocked at 0', () => {
  const s = createMilestoneState('ground');
  assert.equal(isPrestigeResourceUnlocked(s, 'particles'), false);
  assert.equal(isPrestigeResourceUnlocked(s, 'casimir'), false);
  s.prestige.particles = 5;
  assert.equal(isPrestigeResourceUnlocked(s, 'particles'), true);
  updateProgression(s);
  assert.deepEqual(s.prestigeUnlocked, ['particles']);
  s.prestige.particles = 0;
  updateProgression(s);
  assert.equal(isPrestigeResourceUnlocked(s, 'particles'), true, 'spent to zero stays unlocked');
  assert.equal(isPrestigeResourceUnlocked(s, 'casimir'), false);
  // Survives soft reset and save round-trip.
  const soft = resetRunState(s, 'soft', 60, 0)!.next;
  assert.deepEqual(soft.prestigeUnlocked, ['particles']);
  assert.deepEqual(validateCurrentSave(clone(soft), context).prestigeUnlocked, ['particles']);
  // Nuclear rewards unlock particles in the next run immediately.
  const nuclear = createMilestoneState('space');
  nuclear.tech.push('nuclearProgram'); nuclear.nuclearProgress = 100;
  assert.deepEqual(launchNuclearPrestige(nuclear, 60, 0)!.next.prestigeUnlocked, ['particles']);
  assert.deepEqual(nuclear.prestigeUnlocked, [], 'source state is not mutated');
  // Older saves infer unlocks from holdings and permanent history.
  const legacy = clone(soft) as unknown as Record<string, unknown>;
  delete legacy.prestigeUnlocked;
  assert.deepEqual(validateCurrentSave(legacy, context).prestigeUnlocked, [], 'soft reset alone does not imply particles');
  const escaped = clone(soft) as unknown as GameState & Record<string, unknown>;
  delete (escaped as Record<string, unknown>).prestigeUnlocked;
  escaped.prestige.escapeResets = 1;
  assert.deepEqual(validateCurrentSave(escaped, context).prestigeUnlocked, ['particles', 'casimir']);
  assert.throws(() => validateCurrentSave({ ...clone(soft), prestigeUnlocked: ['mithril'] }, context));
});
