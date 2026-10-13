import { DNA_BASE_IDS, DNA_KNOWLEDGE_COST, GENE_DEFINITIONS } from '../data/genes';
import { recordKnowledgeSpent } from './statistics';
import type { BuildingId } from '../types/buildings';
import type { DnaId, GameState, GeneId, GeneModificationState } from '../types/state';

/** Highest level whose next price still fits a safe-integer DNA stock (10·2^49 < 2^53). */
export const MAX_GENE_LEVEL = 50;

export function createGeneModificationState(): GeneModificationState {
  return {
    dna: { C: 0, G: 0, A: 0, T: 0 },
    levels: { goodCat: 0, hardWorking: 0, superWorkshop: 0, perfectionism: 0, titanPower: 0, advancedScience: 0, catCohesion: 0, kinoFire: 0 },
  };
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
