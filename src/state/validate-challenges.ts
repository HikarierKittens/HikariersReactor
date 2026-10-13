import { CHALLENGE_GENE_IDS, canLaunchChallenges } from '../simulation/challenges';
import type { ChallengeGeneId, GameState } from '../types/state';

/** Only an absent legacy record receives defaults; explicit malformed records reject. */
export function validateChallenges(raw: Record<string, unknown>, state: GameState): void {
  if (!Object.hasOwn(raw, 'challenge')) return;
  const value = raw.challenge;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('挑战记录无效。');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !['genes', 'modes', 'story', 'particleBaseline'].includes(key))
    || !Array.isArray(record.genes) || record.genes.some(id => typeof id !== 'string' || !CHALLENGE_GENE_IDS.includes(id as ChallengeGeneId))
    || new Set(record.genes).size !== record.genes.length
    || !Array.isArray(record.modes) || record.modes.length !== 0 || record.story !== null
    || typeof record.particleBaseline !== 'number' || !Number.isSafeInteger(record.particleBaseline) || record.particleBaseline < 0) throw Error('挑战记录无效。');
  if (record.genes.length && !canLaunchChallenges(state)) throw Error('挑战基因尚未解锁。');
  state.challenge = { genes: [...record.genes] as ChallengeGeneId[], modes: [], story: null, particleBaseline: record.particleBaseline };
}
