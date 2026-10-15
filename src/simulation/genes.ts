import { DNA_BASE_IDS, DNA_KNOWLEDGE_COST, GENE_DEFINITIONS } from '../data/genes';
import { recordKnowledgeSpent } from './statistics';
import type { BuildingId } from '../types/buildings';
import type { DnaId, GameState, GeneId, GeneModificationState } from '../types/state';

/** Highest level whose next price still fits a safe-integer DNA stock (10·2^49 < 2^53). */
export const MAX_GENE_LEVEL = 50;

export function createGeneModificationState(): GeneModificationState {
  return {
    dna: { C: 0, G: 0, A: 0, T: 0 },
    levels: { goodCat: 0, hardWorking: 0, maturationAcceleration: 0, superWorkshop: 0, perfectionism: 0, overclockForging: 0, titanPower: 0, advancedScience: 0, catCohesion: 0, kinoFire: 0 },
    synthesis: { C: 0, G: 0, A: 0, T: 0 },
  };
}

/** 基因合成 per powered 生物科学实验室 and per 1% rate: 2000 knowledge/s → 0.01 base/s (10% = 20k → 0.1). */
export const GENE_SYNTHESIS_KNOWLEDGE_PER_PERCENT = 2000;
export const GENE_SYNTHESIS_DNA_PER_PERCENT = .01;
export const MAX_GENE_SYNTHESIS_RATE = 100;

/** The lab panel needs the tech plus an active 基因修饰 (基因剪切 + this run's 基因测序). */
export function isGeneSynthesisUnlocked(state: Pick<GameState, 'tech' | 'crispr' | 'arpaBuildings'>): boolean {
  return state.tech.includes('geneSynthesis') && isGeneModificationUnlocked(state);
}

/** Set one base's synthesis rate (integer percent, 0–100 each, independent of the others). */
export function changeGeneSynthesisRate(state: GameState, id: string, value: number): boolean {
  if (!isGeneSynthesisUnlocked(state) || !(DNA_BASE_IDS as readonly string[]).includes(id)
    || !Number.isSafeInteger(value) || value < 0 || value > MAX_GENE_SYNTHESIS_RATE) return false;
  const base = id as DnaId;
  if (state.geneModification.synthesis[base] === value) return false;
  state.geneModification.synthesis[base] = value;
  return true;
}

export interface GeneSynthesisResult {
  /** Knowledge actually consumed, per second. */
  knowledge: number;
  /** DNA actually produced per base, per second. */
  dna: Partial<Record<DnaId, number>>;
}

/** Withdraw synthesis knowledge from the pool for the powered labs; scales down evenly when knowledge is short. */
export function settleGeneSynthesis(state: GameState, pool: { knowledge: number }, dt: number, labs: number): GeneSynthesisResult {
  const result: GeneSynthesisResult = { knowledge: 0, dna: {} };
  if (!isGeneSynthesisUnlocked(state) || labs <= 0 || dt <= 0) return result;
  const rates = state.geneModification.synthesis;
  const percent = DNA_BASE_IDS.reduce((sum, id) => sum + (rates?.[id] || 0), 0);
  const demand = percent * labs * GENE_SYNTHESIS_KNOWLEDGE_PER_PERCENT * dt;
  if (demand <= 0) return result;
  const factor = Math.min(1, Math.max(0, pool.knowledge) / demand);
  if (factor <= 0) return result;
  pool.knowledge = Math.max(0, pool.knowledge - demand * factor);
  result.knowledge = demand * factor / dt;
  for (const id of DNA_BASE_IDS) if (rates[id]) result.dna[id] = rates[id] * labs * GENE_SYNTHESIS_DNA_PER_PERCENT * factor;
  return result;
}

/** Credit settled synthesis to the DNA stock and record the knowledge spent. */
export function applyGeneSynthesis(state: GameState, synthesis: GeneSynthesisResult | undefined, dt: number): void {
  if (!synthesis || synthesis.knowledge <= 0) return;
  for (const [id, rate] of Object.entries(synthesis.dna) as [DnaId, number][]) {
    state.geneModification.dna[id] = Math.min(Number.MAX_SAFE_INTEGER, state.geneModification.dna[id] + rate * dt);
  }
  recordKnowledgeSpent(state, synthesis.knowledge * dt);
}

/** 基因修饰 needs the permanent 基因剪切 upgrade and this run's completed 基因测序. */
export function isGeneModificationUnlocked(state: Pick<GameState, 'crispr' | 'arpaBuildings'>): boolean {
  return state.crispr.includes('geneSplicing') && (state.arpaBuildings.geneSequencing || 0) >= 1;
}

/** Partial legacy/test states without gene records behave as level 0. */
export function geneLevel(state: Partial<Pick<GameState, 'geneModification'>>, id: GeneId): number {
  return state.geneModification?.levels?.[id] || 0;
}

export function geneBonus(state: Partial<Pick<GameState, 'geneModification'>>, id: GeneId): number {
  return geneLevel(state, id) * GENE_DEFINITIONS[id].perLevel;
}

/** Secondary per-level bonus (e.g. 超频锻造's artisan bonus); 0 when the gene has none. */
export function geneExtraBonus(state: Partial<Pick<GameState, 'geneModification'>>, id: GeneId): number {
  return geneLevel(state, id) * (GENE_DEFINITIONS[id].extra?.perLevel || 0);
}

/** Upgrade price in the gene's own DNA base: 10·2^level. */
export function calculateGeneUpgradeCost(state: Partial<Pick<GameState, 'geneModification'>>, id: GeneId): number {
  return 10 * 2 ** geneLevel(state, id);
}

/** Base-output gene multiplier for one building; applies to all of its outputs. */
export function calculateGeneOutputFactor(id: BuildingId, state: Partial<Pick<GameState, 'geneModification'>>): { gene: GeneId; factor: number } | null {
  const gene: GeneId | null = id === 'catCafe' ? 'goodCat'
    : id === 'mine' || id === 'coalMine' ? 'hardWorking'
    : id === 'cementWorkshop' ? 'superWorkshop'
    : id === 'school' || id === 'lab' ? 'advancedScience'
    : id === 'smelter' ? 'kinoFire' : null;
  return gene ? { gene, factor: 1 + geneBonus(state, gene) } : null;
}

/** Craft up to `count` DNA bases at 200k knowledge each; returns the number crafted. */
export function craftDna(state: GameState, id: string, count: number): number {
  if (!isGeneModificationUnlocked(state) || !(DNA_BASE_IDS as readonly string[]).includes(id)
    || !Number.isSafeInteger(count) || count <= 0) return 0;
  const base = id as DnaId;
  const amount = Math.min(count, Math.floor((state.resources.knowledge + 1e-8) / DNA_KNOWLEDGE_COST),
    Number.MAX_SAFE_INTEGER - state.geneModification.dna[base]);
  if (amount <= 0) return 0;
  const spent = amount * DNA_KNOWLEDGE_COST;
  state.resources.knowledge = Math.max(0, state.resources.knowledge - spent);
  state.geneModification.dna[base] += amount;
  recordKnowledgeSpent(state, spent);
  return amount;
}

/** Spend the gene's DNA base to raise it one level for the current run. */
export function upgradeGene(state: GameState, id: string): boolean {
  if (!isGeneModificationUnlocked(state) || !Object.hasOwn(GENE_DEFINITIONS, id)) return false;
  const gene = id as GeneId;
  if (geneLevel(state, gene) >= MAX_GENE_LEVEL) return false;
  const base = GENE_DEFINITIONS[gene].dna, cost = calculateGeneUpgradeCost(state, gene);
  if (state.geneModification.dna[base] < cost) return false;
  state.geneModification.dna[base] -= cost;
  state.geneModification.levels[gene] += 1;
  return true;
}
