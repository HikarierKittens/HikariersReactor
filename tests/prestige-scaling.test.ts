/** Locks the beta 0.9.45 prestige reward rework: one shared shape, explicit challenge
 *  factors, a squashing soft cap, and rewards that read this run's knowledge spending. */
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state/create-state';
import { CONFIG } from '../src/data/config';
import { test } from 'node:test';
import {
  calculatePrestigeReward, calculateEscapePrestigeReward, calculateCasimirReward,
  calculateBlackHoleParticleReward, calculateBlackHoleCasimirReward,
  calculateDigitalAscensionParticleReward, calculateDigitalAscensionCasimirReward,
  calculateDigitalAscensionHarmonyReward,
} from '../src/simulation/government';
import { calculateDarkEnergyReward } from '../src/simulation/black-hole';
import { challengeFactor, challengeLevel, knowledgeRewardTerm, prestigeSoftCap, softenAgainstCap } from '../src/simulation/prestige-scaling';
import type { ChallengeGeneId, GameState } from '../src/types/state';

/** A run with a crew and a knowledge bill; every reward family reads both. */
function run(crew: number, knowledge: number, genes: ChallengeGeneId[] = []) {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.population = crew;
  state.soldiers = 0;
  state.statistics.run.knowledgeSpent = knowledge;
  state.challenge.genes = [...genes];
  return state;
}

const ALL_GENES: ChallengeGeneId[] = ['particleImbalance', 'geneCollapse', 'industrialFracture'];

test('challengeLevel counts genes while challengeFactor starts at one', () => {
  // They are deliberately different numbers: an ordinary run multiplies by 1 and caps at base.
  assert.equal(challengeLevel({}), 0);
  assert.equal(challengeFactor({}), 1);
  const one = { challenge: { genes: ['geneCollapse'] } };
  assert.equal(challengeLevel(one), 1);
  assert.equal(challengeFactor(one), 2);
  const three = { challenge: { genes: ALL_GENES } };
  assert.equal(challengeLevel(three), 3);
  assert.equal(challengeFactor(three), 4);
});

test('soft cap grows an eighth of the base per level, and an ordinary run caps at exactly the base', () => {
  assert.equal(prestigeSoftCap(150, 0), 150);
  assert.equal(prestigeSoftCap(150, 3), 150 * (1 + 3 / 8));
  assert.equal(prestigeSoftCap(2000, 0), 2000);
});

test('the overflow is squashed, not clipped: continuous at the cap and bounded above', () => {
  const cap = 400;
  assert.equal(softenAgainstCap(cap, cap), cap);
  // Continuity: an epsilon past the cap moves the result by an epsilon, not by a jump.
  assert.ok(Math.abs(softenAgainstCap(cap + 1e-6, cap) - cap) < 1e-6, 'just past the cap stays continuous');
  const justOver = softenAgainstCap(cap + 1, cap);
  assert.ok(justOver > cap && justOver < cap + 1, 'the first unit of overflow pays back only a fraction');
  // Monotonic and always below 2× the cap, however large the raw value gets.
  let previous = 0;
  for (const raw of [400, 800, 1600, 3200, 6400, 1e6]) {
    const value = softenAgainstCap(raw, cap);
    assert.ok(value > previous, `monotonic at raw ${raw}`);
    assert.ok(value < cap * 2, `bounded at raw ${raw}`);
    previous = value;
  }
});

test('the knowledge term reaches about one unit at the divisor, for every rate', () => {
  const families: [number, number][] = [[1_000_000, 1.1], [500_000, 1.015], [400_000, 1.012], [300_000, 1.008]];
  for (const [divisor, rate] of families) {
    const atDivisor = knowledgeRewardTerm(divisor, divisor, rate);
    assert.ok(atDivisor > .9999 && atDivisor < 1.0001, `${rate}: ${atDivisor}`);
    assert.equal(knowledgeRewardTerm(0, divisor, rate), 0, 'no spending adds nothing');
    assert.equal(knowledgeRewardTerm(-5, divisor, rate), 0, 'negative spending is clamped');
  }
});

test('every particle family reads the same crew, knowledge and challenge factor', () => {
  const families = [
    ['核爆', calculatePrestigeReward, 3, 1_000_000, 1.1, 150],
    ['逃离', calculateEscapePrestigeReward, 3, 500_000, 1.015, 400],
    ['黑洞', calculateBlackHoleParticleReward, 2.2, 400_000, 1.012, 800],
    ['飞升', calculateDigitalAscensionParticleReward, 1.15, 300_000, 1.008, 2000],
  ] as const;
  for (const [name, fn, divisor, knowledgeDivisor, rate, base] of families) {
    // Pick a crew small enough to stay under the cap so the raw shape is observable.
    const crew = divisor * prestigeSoftCap(base, 0) / 4;
    const state = run(crew, 0);
    const expectedRaw = crew / divisor + knowledgeRewardTerm(0, knowledgeDivisor, rate);
    assert.equal(fn(state), Math.floor(expectedRaw), `${name} below the cap`);

    // Knowledge alone moves the reward: crew stays put. The term grows logarithmically,
    // so a tenth of the divisor is under one whole point and the floor would swallow it.
    const plain = run(crew, 0);
    const richer = run(crew, knowledgeDivisor * 10);
    assert.ok(fn(richer) > fn(plain), `${name} rewards spending knowledge`);

    // A challenge gene multiplies the raw value (factor 1 → 2) while the cap only grows 1/8.
    const challenged = run(crew, 0, ['geneCollapse']);
    assert.ok(fn(challenged) > fn(plain), `${name} improves with a challenge gene`);

    // The hard ceiling is 2× the soft cap regardless of how extreme the run gets.
    const extreme = run(1e9, 1e15, ALL_GENES);
    assert.ok(fn(extreme) < prestigeSoftCap(base, 3) * 2, `${name} stays bounded`);
  }
});

test('an empty run earns nothing from particles but still earns Casimir only above 1', () => {
  const empty = run(0, 0);
  assert.equal(calculatePrestigeReward(empty), 0);
  assert.equal(calculateEscapePrestigeReward(empty), 0);
  assert.equal(calculateBlackHoleParticleReward(empty), 0);
  assert.equal(calculateDigitalAscensionParticleReward(empty), 0);
  assert.equal(calculateCasimirReward(0, empty), 0);
  assert.equal(calculateCasimirReward(1, empty), 0, 'one particle is not worth a crystal');
});

test('Casimir is log2 of the final particle reward times the family multiplier and the factor', () => {
  const plain = run(0, 0);
  for (const [multiplier, fn] of [[1, calculateCasimirReward], [2.5, calculateBlackHoleCasimirReward], [4, calculateDigitalAscensionCasimirReward]] as const) {
    assert.equal(fn(1000, plain), Math.floor(Math.log2(1000) * multiplier * Math.E), `plain ×${multiplier}`);
    const challenged = run(0, 0, ALL_GENES);
    assert.equal(fn(1000, challenged), Math.floor(Math.log2(1000) * multiplier * Math.E * 4), `×${multiplier} with 3 genes`);
  }
});

test('harmony crystals stay at 2 plus the challenge level', () => {
  assert.equal(calculateDigitalAscensionHarmonyReward(run(0, 0)), 2);
  assert.equal(calculateDigitalAscensionHarmonyReward(run(0, 0, ['geneCollapse'])), 3);
  assert.equal(calculateDigitalAscensionHarmonyReward(run(0, 0, ALL_GENES)), 5);
});

test('暗能量 combines a logarithmic mass term with exotic mass and pays a floor of 1', () => {
  const blackHole = (mass: number, exoticMass = 0, genes: ChallengeGeneId[] = []): Pick<GameState, 'blackHole' | 'challenge'> => ({
    blackHole: { mass, exoticMass, unstable: false, ejection: {} },
    challenge: { genes: [...genes], modes: [], story: null, particleBaseline: 0 },
  });
  // mass - 9 is clamped to 1 so the logarithm never goes imaginary when the hole drains.
  assert.equal(calculateDarkEnergyReward(blackHole(10)), 1, 'the initial mass pays the floor');
  assert.equal(calculateDarkEnergyReward(blackHole(5)), 1, 'a drained hole still pays the floor');
  assert.equal(calculateDarkEnergyReward(blackHole(100)), 2);
  assert.ok(calculateDarkEnergyReward(blackHole(1000)) > calculateDarkEnergyReward(blackHole(100)), 'mass keeps paying');
  assert.ok(calculateDarkEnergyReward(blackHole(100, 5)) > calculateDarkEnergyReward(blackHole(100)), 'exotic mass adds on top');
  // Past the soft cap only a tenth of the excess is paid.
  const capped = calculateDarkEnergyReward(blackHole(1000, 1000));
  assert.ok(capped >= 10 && capped < 20, `soft cap holds: ${capped}`);
  // A challenge gene multiplies before the cap.
  assert.ok(calculateDarkEnergyReward(blackHole(100, 0, ALL_GENES)) > calculateDarkEnergyReward(blackHole(100)));
});

test('rewards are whole numbers so prestige counters stay safe integers', () => {
  for (const state of [run(37, 12345), run(999, 987654321, ALL_GENES)]) {
    for (const value of [
      calculatePrestigeReward(state), calculateEscapePrestigeReward(state),
      calculateBlackHoleParticleReward(state), calculateDigitalAscensionParticleReward(state),
    ]) assert.ok(Number.isSafeInteger(value), `particle reward ${value}`);
  }
  const hole = { blackHole: { mass: 137.5, exoticMass: 3.25, unstable: false, ejection: {} } } as Pick<GameState, 'blackHole'>;
  assert.ok(Number.isSafeInteger(calculateDarkEnergyReward(hole)), '暗能量 is floored to an integer');
});
