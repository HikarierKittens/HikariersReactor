import { DNA_BASE_IDS, GENE_DEFINITIONS } from '../data/genes';
import { MAX_GENE_LEVEL, MAX_GENE_SYNTHESIS_RATE, createGeneModificationState } from '../simulation/genes';
import { PRESTIGE_RESOURCE_IDS } from '../simulation/prestige-unlocks';
import type { GameState, GeneId, PrestigeResourceId } from '../types/state';

// Unique name: the VM regression bridge loads every module into one global scope.
function geneSaveObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${label}无效。`);
  return value as Record<string, unknown>;
}

/** Sticky prestige unlocks.
 * Call after prestige counters and CRISPR purchases are validated. */
export function validatePrestigeUnlocks(raw: Record<string, unknown>, state: GameState): void {
  const value = raw.prestigeUnlocked;
  {
    if (!Array.isArray(value) || new Set(value).size !== value.length
      || value.some(id => typeof id !== 'string' || !(PRESTIGE_RESOURCE_IDS as readonly string[]).includes(id))) throw Error('威望资源解锁记录无效。');
    state.prestigeUnlocked = [...value] as PrestigeResourceId[];
  }
}

/** Require complete run-scoped gene records. */
export function validateGeneModification(raw: Record<string, unknown>, state: GameState): void {
  const fresh = createGeneModificationState();
  const source = geneSaveObject(raw.geneModification, '基因修饰记录');
  const dna = geneSaveObject(source.dna, 'DNA记录'), levels = geneSaveObject(source.levels, '基因等级');
  const synthesis = geneSaveObject(source.synthesis, '基因合成速率');
  const isBase = (key: string) => (DNA_BASE_IDS as readonly string[]).includes(key);
  if (Object.keys(source).some(key => key !== 'dna' && key !== 'levels' && key !== 'synthesis')
    || Object.keys(dna).some(key => !isBase(key)) || Object.keys(synthesis).some(key => !isBase(key))
    || Object.keys(levels).some(key => !Object.hasOwn(GENE_DEFINITIONS, key))) throw Error('基因修饰记录无效。');
  for (const id of DNA_BASE_IDS) {
    // 基因合成 produces fractional DNA; crafting and upgrades keep whole amounts.
    const amount = dna[id];
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER) throw Error('DNA数量无效。');
    fresh.dna[id] = amount;
    const rate = synthesis[id];
    if (!Number.isSafeInteger(rate) || (rate as number) < 0 || (rate as number) > MAX_GENE_SYNTHESIS_RATE) throw Error('基因合成速率无效。');
    fresh.synthesis[id] = rate as number;
  }
  for (const id of Object.keys(GENE_DEFINITIONS) as GeneId[]) {
    const level = levels[id];
    if (!Number.isSafeInteger(level) || (level as number) < 0 || (level as number) > MAX_GENE_LEVEL) throw Error('基因等级无效。');
    fresh.levels[id] = level as number;
  }
  state.geneModification = fresh;
}
