import { resetRunState, type SoftReset } from './prestige';
import type { ChallengeGeneId, GameState } from '../types/state';

export const CHALLENGE_GENE_IDS: readonly ChallengeGeneId[] = ['particleImbalance', 'geneCollapse', 'industrialFracture'];

/** Legacy callers without challenge records behave like an ordinary run. */
export function isChallengeGeneActive(state: Partial<Pick<GameState, 'challenge'>>, id: ChallengeGeneId): boolean {
  return state.challenge?.genes.includes(id) ?? false;
}

// challengeLevel / challengeFactor live in `prestige-scaling.ts`: `government.ts` needs
// them and `challenges.ts` already imports `prestige.ts`, which imports `government.ts`.
export { challengeFactor, challengeLevel } from './prestige-scaling';

/** Starting particles are inert in particle imbalance, but newly earned particles work normally. */
export function calculateEffectiveParticleCount(state: Pick<GameState, 'prestige'> & Partial<Pick<GameState, 'challenge'>>): number {
  return Math.max(0, state.prestige.particles - (isChallengeGeneActive(state, 'particleImbalance') ? state.challenge?.particleBaseline ?? 0 : 0));
}

export function canLaunchChallenges(state: Pick<GameState, 'crispr'>): boolean {
  return state.crispr.includes('challengeGene');
}

/** Selection is a UI draft until this explicit, atomic soft-reset command succeeds. */
export function launchChallenges(state: GameState, selectedGenes: readonly ChallengeGeneId[], eventIn: number, now: number): SoftReset | null {
  if (!canLaunchChallenges(state) || !Array.isArray(selectedGenes) || !selectedGenes.length
    || selectedGenes.some(id => !CHALLENGE_GENE_IDS.includes(id)) || new Set(selectedGenes).size !== selectedGenes.length
    || !Number.isSafeInteger(state.prestige.particles) || state.prestige.particles < 0) return null;
  const reset = resetRunState(state, 'soft', eventIn, now);
  if (!reset) return null;
  reset.next.challenge = { genes: [...selectedGenes], modes: [], story: null, particleBaseline: state.prestige.particles };
  return reset;
}
