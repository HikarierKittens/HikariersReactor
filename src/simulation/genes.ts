import { DNA_BASE_IDS, DNA_KNOWLEDGE_COST, GENE_DEFINITIONS } from '../data/genes';
import { recordKnowledgeSpent } from './statistics';
import type { BuildingId } from '../types/buildings';
import type { ResourceAmounts } from '../types/economy';
import type { DnaId, GameState, GeneId, GeneModificationState } from '../types/state';

/** Highest level whose next price still fits a safe-integer DNA stock (10·2^49 < 2^53). */
export const MAX_GENE_LEVEL = 50;
/** 高级基因合成 doubles the DNA produced per unit of diverted knowledge. */
export const ADVANCED_GENE_SYNTHESIS_MULTIPLIER = 2;

/**
 * DNA yielded per second from `knowledgePerSecond` diverted into one base at `rate`%.
 * The UI preview and the settlement both go through here so a doubling upgrade cannot
 * show one number and pay another.
 */
export function calculateSynthesisedDna(state: Pick<GameState, 'crispr'>, knowledgePerSecond: number, rate: number): number {
  if (!(knowledgePerSecond > 0) || !(rate > 0)) return 0;
  const multiplier = state.crispr?.includes('advancedGeneSynthesis') ? ADVANCED_GENE_SYNTHESIS_MULTIPLIER : 1;
  return knowledgePerSecond * rate / 100 / DNA_KNOWLEDGE_COST * multiplier;
}

export function createGeneModificationState(): GeneModificationState {
  return {
    dna: { C: 0, G: 0, A: 0, T: 0 },
    levels: { goodCat: 0, hardWorking: 0, maturationAcceleration: 0, superWorkshop: 0, perfectionism: 0, overclockForging: 0, titanPower: 0, advancedScience: 0, catCohesion: 0, kinoFire: 0 },
    synthesis: { C: 0, G: 0, A: 0, T: 0 },
  };
}

/**
 * 基因合成 diverts a share of the knowledge that actually reaches the pool, the
 * same way dl.exe funds bytes: the four sliders split one 100% budget between the
 * bases and never touch stored knowledge. The conversion ratio is unchanged — one
 * DNA base still costs `DNA_KNOWLEDGE_COST` knowledge.
 */
export const MAX_GENE_SYNTHESIS_TOTAL = 100;
/** Kept for save validation of a single slider; the real cap is the shared total. */
export const MAX_GENE_SYNTHESIS_RATE = MAX_GENE_SYNTHESIS_TOTAL;

/** The panel shows this many bases; kept as the public ordering. */
export { DNA_BASE_IDS };

/** The lab panel needs the tech plus an active 基因修饰 (基因剪切 + this run's 基因测序). */
export function isGeneSynthesisUnlocked(state: Pick<GameState, 'tech' | 'crispr' | 'arpaBuildings'>): boolean {
  return state.tech.includes('geneSynthesis') && isGeneModificationUnlocked(state);
}

export function totalGeneSynthesisRate(state: Pick<GameState, 'geneModification'>): number {
  const rates = state.geneModification?.synthesis;
  return rates ? DNA_BASE_IDS.reduce((sum, id) => sum + Math.max(0, rates[id] || 0), 0) : 0;
}

/** Rate still available to the other bases; sliders share one 100% budget. */
export function remainingGeneSynthesisBudget(state: Pick<GameState, 'geneModification'>, id: DnaId): number {
  return Math.max(0, MAX_GENE_SYNTHESIS_TOTAL - (totalGeneSynthesisRate(state) - (state.geneModification.synthesis?.[id] || 0)));
}

/**
 * Set one base's share (integer percent). The four rates share 100%, so raising one
 * takes the budget from the others: the requested value is capped by what is left
 * after the other three, which is what "互相牵制" means for the sliders.
 */
export function changeGeneSynthesisRate(state: GameState, id: string, value: number): boolean {
  if (!isGeneSynthesisUnlocked(state) || !(DNA_BASE_IDS as readonly string[]).includes(id)
    || !Number.isSafeInteger(value) || value < 0 || value > MAX_GENE_SYNTHESIS_RATE) return false;
  const base = id as DnaId;
  const capped = Math.min(value, remainingGeneSynthesisBudget(state, base));
  if (state.geneModification.synthesis[base] === capped) return false;
  state.geneModification.synthesis[base] = capped;
  return true;
}

export interface GeneSynthesisResult {
  /** Knowledge actually diverted, per second. */
  knowledge: number;
  /** DNA actually produced per base, per second. */
  dna: Partial<Record<DnaId, number>>;
  /** Knowledge per second that flowed into this settlement (after dl.exe diversion). */
  knowledgeProduction: number;
  /** Share of that production diverted, 0–1. */
  share: number;
}

/**
 * Observe the knowledge credits that survive dl.exe and divert the configured share
 * of them into DNA. Wrapping the settlement pool (instead of draining its stock)
 * keeps synthesis proportional to production and unable to eat saved knowledge.
 * Later upkeep can only spend knowledge that was actually retained.
 */
export function createGeneSynthesisPool(
  state: GameState,
  biologyUnits: number,
  dt: number,
  inner: ResourceAmounts,
): { pool: ResourceAmounts; result: () => GeneSynthesisResult } {
  const active = isGeneSynthesisUnlocked(state) && biologyUnits > 0 && dt > 0;
  const rates = state.geneModification?.synthesis;
  const share = active && rates ? Math.min(MAX_GENE_SYNTHESIS_TOTAL, totalGeneSynthesisRate(state)) / 100 : 0;
  let production = 0;
  // Knowledge actually taken out of the pool. Tracked directly rather than derived from
  // the DNA gained: 高级基因合成 scales the DNA while the knowledge cost per base stays
  // put, so deriving it back would double-count the spending.
  let diverted = 0;
  const dna: Partial<Record<DnaId, number>> = {};
  if (share <= 0) {
    return { pool: inner, result: () => ({ knowledge: 0, dna: {}, knowledgeProduction: 0, share: 0 }) };
  }
  const pool = new Proxy(inner, {
    set(target, property, value) {
      if (property !== 'knowledge' || typeof value !== 'number') return Reflect.set(target, property, value);
      const before = target.knowledge;
      // Let the inner proxy apply its own diversion first, then take this share of
      // whatever still reached knowledge. Writing a smaller value never re-triggers
      // that diversion, because the inner trap only reacts to increases.
      Reflect.set(target, property, value);
      const gained = target.knowledge - before;
      if (gained > 0) {
        production += gained / dt;
        const taken = gained * share;
        diverted += taken;
        target.knowledge = target.knowledge - taken;
        for (const id of DNA_BASE_IDS) {
          const rate = rates?.[id] || 0;
          if (rate > 0) dna[id] = (dna[id] || 0) + calculateSynthesisedDna(state, gained / dt, rate) * dt;
        }
      }
      return true;
    },
  });
  return {
    pool,
    result: () => ({
      knowledge: diverted / dt,
      dna: Object.fromEntries(Object.entries(dna).map(([id, amount]) => [id, amount / dt])) as Partial<Record<DnaId, number>>,
      knowledgeProduction: production,
      share,
    }),
  };
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
