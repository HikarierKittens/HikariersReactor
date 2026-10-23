/**
 * Shared soft-cap arithmetic for prestige rewards.
 *
 * Everything here is a pure function of numbers and the challenge record, so it can be
 * imported from `government.ts` and `black-hole.ts` without pulling in `prestige.ts`
 * (which imports both of them). The challenge helpers live here — not in
 * `challenges.ts` — precisely to avoid that cycle.
 */

export interface ChallengeRecord { challenge?: { genes: readonly unknown[] } }

/**
 * 挑战等级: the number of active challenge genes, 0–3.
 *
 * Two derived values read from it and they are deliberately NOT the same number:
 *   - `challengeFactor` multiplies every prestige reward (0 genes → ×1, so an ordinary
 *     run still earns; each gene adds one more).
 *   - `challengeLevel` sets the soft cap, `base × (1 + level / 8)`, so an ordinary run
 *     caps at exactly `base`.
 * Keep them in separate helpers: collapsing them into one variable silently shifts
 * every cap by an eighth of its base.
 */
export function challengeLevel(state: ChallengeRecord): number {
  return state.challenge?.genes.length ?? 0;
}

/** Reward multiplier for the current run: 1 with no challenge genes, +1 per gene. */
export function challengeFactor(state: ChallengeRecord): number {
  return 1 + challengeLevel(state);
}

/** Soft cap for a reward family: `base` at challenge level 0, growing 1/8 per level. */
export function prestigeSoftCap(base: number, level: number): number {
  return base * (1 + level / 8);
}

/**
 * Squash `raw` against `cap`. Below the cap the value is returned untouched; above it
 * the overflow contributes `cap × overflow / raw`, so the extra asymptotically
 * approaches `cap` and the function stays monotonic and continuous.
 */
export function softenAgainstCap(raw: number, cap: number): number {
  if (!Number.isFinite(raw) || raw <= cap) return raw;
  return cap + ((raw - cap) / raw) * cap;
}

/**
 * The knowledge term used by every prestige family:
 * `log_rate(1 + (rate - 1) × knowledge / divisor)`.
 *
 * Written out in natural logs so the divisor's meaning stays obvious: at
 * `knowledge = divisor` the term is almost exactly 1 for every rate, which makes the
 * divisor a direct "how much knowledge is worth one unit of reward" knob.
 */
export function knowledgeRewardTerm(knowledge: number, divisor: number, rate: number): number {
  if (!Number.isFinite(knowledge) || knowledge <= 0) return 0;
  return Math.log(1 + (rate - 1) * knowledge / divisor) / Math.log(rate);
}
