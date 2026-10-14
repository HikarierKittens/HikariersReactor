import { DNA_BASE_IDS, GENE_DEFINITIONS } from '../data/genes';
import { MAX_GENE_LEVEL, createGeneModificationState } from '../simulation/genes';
import { PRESTIGE_RESOURCE_IDS, syncPrestigeUnlocks } from '../simulation/prestige-unlocks';
import type { GameState, GeneId, PrestigeResourceId } from '../types/state';

// Unique name: the VM regression bridge loads every module into one global scope.
function geneSaveObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${label}无效。`);
  return value as Record<string, unknown>;
}

/** Sticky prestige unlocks. Older saves infer them from holdings and permanent history.
 * Call after prestige counters and CRISPR purchases are validated. */
export function validatePrestigeUnlocks(raw: Record<string, unknown>, state: GameState): void {
  const value = raw.prestigeUnlocked;
  if (value === undefined) {
    const unlocked: PrestigeResourceId[] = [];
    if (state.crispr.length || state.prestige.nuclearResets + state.prestige.escapeResets + state.prestige.blackHoleResets > 0) unlocked.push('particles');
    if (state.prestige.escapeResets + state.prestige.blackHoleResets > 0) unlocked.push('casimir');
    if (state.prestige.blackHoleResets > 0) unlocked.push('darkEnergy');
    state.prestigeUnlocked = unlocked;
  } else {
    if (!Array.isArray(value) || new Set(value).size !== value.length
      || value.some(id => typeof id !== 'string' || !(PRESTIGE_RESOURCE_IDS as readonly string[]).includes(id))) throw Error('威望资源解锁记录无效。');
    state.prestigeUnlocked = [...value] as PrestigeResourceId[];
  }
  syncPrestigeUnlocks(state);
}

/** Run-scoped gene records; absent records (older saves) start empty at level 0. */
export function validateGeneModification(raw: Record<string, unknown>, state: GameState): void {
  const fresh = createGeneModificationState();
  if (raw.geneModification === undefined) { state.geneModification = fresh; return; }
  const source = geneSaveObject(raw.geneModification, '基因修饰记录');
  const dna = geneSaveObject(source.dna ?? {}, 'DNA记录'), levels = geneSaveObject(source.levels ?? {}, '基因等级');
  if (Object.keys(source).some(key => key !== 'dna' && key !== 'levels')
    || Object.keys(dna).some(key => !(DNA_BASE_IDS as readonly string[]).includes(key))
    || Object.keys(levels).some(key => !Object.hasOwn(GENE_DEFINITIONS, key))) throw Error('基因修饰记录无效。');
  for (const id of DNA_BASE_IDS) {
    const amount = dna[id] ?? 0;
    if (!Number.isSafeInteger(amount) || (amount as number) < 0) throw Error('DNA数量无效。');
    fresh.dna[id] = amount as number;
  }
  for (const id of Object.keys(GENE_DEFINITIONS) as GeneId[]) {
    const level = levels[id] ?? 0;
    if (!Number.isSafeInteger(level) || (level as number) < 0 || (level as number) > MAX_GENE_LEVEL) throw Error('基因等级无效。');
    fresh.levels[id] = level as number;
  }
  state.geneModification = fresh;
}
