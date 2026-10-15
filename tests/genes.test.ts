import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CRISPR_UPGRADES } from '../src/data/crispr';
import { GENE_DEFINITIONS, DNA_KNOWLEDGE_COST } from '../src/data/genes';
import { validateCurrentSave } from '../src/state/validate-save';
import { purchaseCrisprUpgrade } from '../src/simulation/crispr';
import { craftDna, upgradeGene, calculateGeneUpgradeCost, isGeneModificationUnlocked, MAX_GENE_LEVEL, changeGeneSynthesisRate, isGeneSynthesisUnlocked, applyGeneSynthesis } from '../src/simulation/genes';
import { TECHNOLOGIES } from '../src/data/technologies';
import { calculateBuildingOutput } from '../src/simulation/building-production';
import { calculateFactoryRecipe } from '../src/simulation/factory';
import { calculateCombatPower, calculateSoldierPressure, calculatePopulationPressure } from '../src/simulation/government';
import { calculateProduction } from '../src/simulation/production';
import { calculateResourceBreakdown, calculateResourceFactorRows } from '../src/simulation/resource-breakdown';
import { isPrestigeResourceUnlocked } from '../src/simulation/prestige-unlocks';
import { updateProgression } from '../src/simulation/progression';
import { launchNuclearPrestige, resetRunState } from '../src/simulation/prestige';
import { createMilestoneState } from './fixtures/milestones';
import { calculateGrowthMultiplier, advancePopulationGrowth } from '../src/simulation/population';
import { calculateAutomaticCraftingMultipliers, calculateCraftingMultiplier } from '../src/simulation/crafting';
import { craftManually } from '../src/simulation/commands';
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
  s.prestige.casimir = 25; s.statistics.lifetime.casimirEarned = 25;
  assert.equal(purchaseCrisprUpgrade(s, 'geneSplicing'), true);
  assert.deepEqual([s.prestige.particles, s.prestige.casimir], [0, 0]);
  // Current saves must retain their explicit lifetime statistics.
  assert.equal(validateCurrentSave(clone(s), context).statistics.lifetime.casimirEarned, 25);
  assert.throws(() => validateCurrentSave(clone({ ...s, statistics: undefined }), context));
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
  const baseRow = (state: GameState) => calculateResourceFactorRows('metal', state, calculateProduction(state)).rows.find(row => !row.child && row.name === '钢冶炼工位');
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
  assert.throws(() => validateCurrentSave(legacy, context));
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
  // Missing unlock records are rejected, not inferred from permanent history.
  const legacy = clone(soft) as unknown as Record<string, unknown>;
  delete legacy.prestigeUnlocked;
  assert.throws(() => validateCurrentSave(legacy, context));
  const escaped = clone(soft) as unknown as GameState & Record<string, unknown>;
  delete (escaped as Record<string, unknown>).prestigeUnlocked;
  escaped.prestige.escapeResets = 1;
  assert.throws(() => validateCurrentSave(escaped, context));
  assert.throws(() => validateCurrentSave({ ...clone(soft), prestigeUnlocked: ['mithril'] }, context));
});

test('成熟加速 (C) adds 1% population growth per level on top of other growth multipliers', () => {
  const s = geneState(), base = clone(s);
  assert.equal(GENE_DEFINITIONS.maturationAcceleration.dna, 'C');
  s.geneModification.levels.maturationAcceleration = 7;
  near(calculateGrowthMultiplier(s), calculateGrowthMultiplier(base) * 1.07, 'growth');
  s.population = base.population = 30; s.growth = base.growth = 0; s.growthTarget = base.growthTarget = 1e9;
  Object.assign(s.resources, { food: 1e6 }); Object.assign(base.resources, { food: 1e6 });
  const grown = (state: GameState) => { advancePopulationGrowth(state, 1, 0, 1e6, () => .5); return state.growth; };
  near(grown(s), grown(base) * 1.07, 'settled growth');
});

test('超频锻造 (G) adds 2% crafted output and 1% artisan output per level without extra ingredients', () => {
  const s = geneState(), base = clone(s);
  assert.equal(GENE_DEFINITIONS.overclockForging.dna, 'G');
  s.geneModification.levels.overclockForging = 5;
  near(calculateCraftingMultiplier('plank', s), calculateCraftingMultiplier('plank', base) * 1.1, 'craft multiplier');
  const artisan = calculateAutomaticCraftingMultipliers(s), plain = calculateAutomaticCraftingMultipliers(base);
  assert.equal(artisan.input, plain.input, 'ingredient use unchanged');
  near(artisan.output, plain.output * 1.05, 'artisan output');
  // Manual forging gets only the crafted-output bonus (+10%), not the artisan bonus.
  for (const state of [s, base]) { state.resources.wood = 1e6; state.resources.plank = 0; craftManually(state, 'plank', 10); }
  near(s.resources.plank, base.resources.plank * 1.1, 'manual forging');
  near(s.resources.wood, base.resources.wood, 'manual ingredients');
  // Settled artisans: (1 + 2%·5) · (1 + 1%·5) output with the same ingredient use, and tooltip rows.
  for (const state of [s, base]) {
    state.buildings.foundry = Math.max(2, state.buildings.foundry); state.workers.foundry = 2;
    state.craftWorkers = { ...state.craftWorkers, plank: 2 }; state.resources.wood = 1e6;
  }
  const after = calculateProduction(s), before = calculateProduction(base);
  near(after.outputs['craft:plank']!, before.outputs['craft:plank']! * 1.1 * 1.05, 'settled artisans');
  near(after.inputUnits['craft:plank']!, before.inputUnits['craft:plank']!, 'settled ingredients');
  const rows = calculateResourceFactorRows('plank', s, after).rows.map(row => row.name);
  assert.ok(rows.includes('超频锻造') && rows.includes('超频锻造（工匠）'), JSON.stringify(rows));
  assert.ok(!calculateResourceFactorRows('plank', base, before).rows.some(row => row.name.startsWith('超频锻造')));
});

test('基因合成 is a T11 200k tech after 遗传学 gated by 基因测序', () => {
  const tech = TECHNOLOGIES.geneSynthesis;
  assert.deepEqual([tech.tier, tech.cost.knowledge, tech.pre, tech.arpaPre], [11, 200000, ['genetics'], 'geneSequencing']);
});

test('基因合成 converts 20k knowledge into 0.1 DNA per lab at 10%, rates independent and settled for real', () => {
  const s = geneState();
  s.tech = [...new Set([...s.tech, 'genetics', 'geneSynthesis'] as const)];
  s.buildings.biologyLab = 3; s.stoppedBuildings.biologyLab = 0;
  s.resources.energy = 1e6; s.resources.knowledge = 1e7;
  assert.deepEqual(s.geneModification.synthesis, { C: 0, G: 0, A: 0, T: 0 }, 'default 0%');
  assert.equal(calculateProduction(s).geneSynthesis.knowledge, 0);
  for (const bad of [-1, 101, 2.5, NaN]) assert.equal(changeGeneSynthesisRate(s, 'C', bad), false, String(bad));
  assert.equal(changeGeneSynthesisRate(s, 'X', 10), false);
  assert.equal(changeGeneSynthesisRate(s, 'C', 10), true);
  assert.equal(changeGeneSynthesisRate(s, 'T', 100), true, 'each base may use the full 100%');
  const result = calculateProduction(s);
  const labs = result.inputUnits.biologyLab;
  assert.equal(labs, 3);
  near(result.geneSynthesis.knowledge, (10 + 100) * 2000 * labs, 'knowledge use');
  near(result.geneSynthesis.dna.C!, .1 * labs, 'C at 10%');
  near(result.geneSynthesis.dna.T!, 1 * labs, 'T at 100%');
  const entry = calculateResourceBreakdown('knowledge', s, result).entries.find(row => row.id === 'geneSynthesis');
  near(entry!.value, -result.geneSynthesis.knowledge, 'breakdown row');
  // Through the real tick: DNA credited, knowledge withdrawn, statistics recorded.
  const spent = s.statistics.run.knowledgeSpent, knowledge = s.resources.knowledge;
  const step = calculateProduction(s, 1);
  s.resources = step.pool; applyGeneSynthesis(s, step.geneSynthesis, 1);
  near(s.geneModification.dna.C, .3); near(s.geneModification.dna.T, 3);
  assert.ok(s.resources.knowledge < knowledge);
  near(s.statistics.run.knowledgeSpent - spent, 660000, 'knowledge spent');
  // Knowledge short: every base scales down by the same factor.
  const poor = clone(s); poor.resources.knowledge = 0;
  const scarce = calculateProduction(poor);
  assert.ok(scarce.geneSynthesis.knowledge < step.geneSynthesis.knowledge, 'short knowledge throttles synthesis');
  const ratio = (scarce.geneSynthesis.dna.C || 0) / .3;
  near(scarce.geneSynthesis.dna.T || 0, 3 * ratio, 'proportional scaling');
  // Stopped labs do not synthesise.
  const stopped = clone(s); stopped.stoppedBuildings.biologyLab = 3;
  assert.equal(calculateProduction(stopped).geneSynthesis.knowledge, 0);
});

test('基因合成 needs the tech and 基因剪切; rates and fractional DNA survive saves and reset with the run', () => {
  const s = geneState(false);
  s.tech = [...new Set([...s.tech, 'genetics', 'geneSynthesis'] as const)];
  assert.equal(isGeneSynthesisUnlocked(s), false, 'needs 基因剪切');
  assert.equal(changeGeneSynthesisRate(s, 'C', 10), false);
  s.crispr.push('geneOptimization', 'geneSplicing');
  assert.equal(isGeneSynthesisUnlocked(s), true);
  const noTech = clone(s); noTech.tech = noTech.tech.filter(id => id !== 'geneSynthesis');
  assert.equal(isGeneSynthesisUnlocked(noTech), false);
  changeGeneSynthesisRate(s, 'A', 35); s.geneModification.dna.A = 1.25;
  const restored = validateCurrentSave(clone(s), context);
  assert.deepEqual(restored.geneModification.synthesis, { C: 0, G: 0, A: 35, T: 0 });
  assert.equal(restored.geneModification.dna.A, 1.25);
  const legacy = clone(s) as unknown as { geneModification: Record<string, unknown> };
  delete legacy.geneModification.synthesis;
  assert.throws(() => validateCurrentSave(legacy, context));
  for (const synthesis of [{ C: 101 }, { C: 1.5 }, { C: -1 }, { X: 1 }]) {
    assert.throws(() => validateCurrentSave({ ...clone(s), geneModification: { ...clone(s.geneModification), synthesis } }, context), JSON.stringify(synthesis));
  }
  assert.deepEqual(resetRunState(s, 'soft', 60, 0)!.next.geneModification.synthesis, { C: 0, G: 0, A: 0, T: 0 });
});
