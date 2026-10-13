import { CRISPR_UPGRADES } from '../data/crispr';
import type { CrisprUpgradeId, GameState } from '../types/state';
import { calculateEffectiveParticleCount, isChallengeGeneActive } from './challenges';

export function calculateCrisprUpgradeCost(state: GameState, id: CrisprUpgradeId): number {
  return CRISPR_UPGRADES[id].cost;
}

/** Particle storage tiers replace each other; Casimir adds an independent bonus. */
export function calculateCrisprStorageBonus(state: GameState) {
  const particleUpgrade: CrisprUpgradeId | null = state.crispr.includes('dimensionDistortion') ? 'dimensionDistortion'
    : state.crispr.includes('dimensionCompression') ? 'dimensionCompression'
    : state.crispr.includes('spatialReasoning') ? 'spatialReasoning' : null;
  const particleRate = particleUpgrade === 'dimensionDistortion' ? .0008
    : particleUpgrade === 'dimensionCompression' ? .0006 : particleUpgrade ? .0004 : 0;
  const particles = calculateEffectiveParticleCount(state);
  const casimir = Math.max(0, state.prestige.casimir || 0);
  const casimirRate = state.crispr.includes('casimirEffect') ? .0008 : 0;
  const particleBonus = particles * particleRate;
  const casimirBonus = casimir * casimirRate;
  return { particleUpgrade, particles, particleRate, particleBonus, casimir, casimirRate, casimirBonus, multiplier: 1 + particleBonus + casimirBonus };
}

/** Current holdings cover both the particle and the optional Casimir price. */
export function canAffordCrisprUpgrade(state: Pick<GameState, 'prestige'>, id: CrisprUpgradeId): boolean {
  const upgrade = CRISPR_UPGRADES[id], casimir = state.prestige.casimir || 0;
  return Number.isSafeInteger(state.prestige.particles) && state.prestige.particles >= upgrade.cost
    && Number.isSafeInteger(casimir) && casimir >= (upgrade.casimirCost || 0);
}

/** Atomic permanent upgrade purchase; current particles are spent, not lifetime particles. */
export function purchaseCrisprUpgrade(state: GameState, id: CrisprUpgradeId): boolean {
  if (!Object.hasOwn(CRISPR_UPGRADES, id) || !state.tech.includes('crispr16') || state.crispr.includes(id)) return false;
  const upgrade = CRISPR_UPGRADES[id];
  if (!upgrade.pre.every(pre => state.crispr.includes(pre)) || !canAffordCrisprUpgrade(state, id)) return false;
  state.prestige.particles -= upgrade.cost;
  state.prestige.casimir -= upgrade.casimirCost || 0;
  state.crispr.push(id);
  return true;
}

/** Material tiers replace one another rather than stacking. */
export function calculateCrisprCostReduction(state: Partial<GameState>): number {
  const tiers: CrisprUpgradeId[] = ['materialEfficiency', 'innovativeMaterials', 'structuralReinforcement', 'physicsLaws', 'halfLife3'];
  for (let index = tiers.length - 1; index >= 0; index--) {
    const tier = tiers[index];
    if (tier !== undefined && state.crispr?.includes(tier)) return (index + 1) / 100 / (isChallengeGeneActive(state, 'geneCollapse') ? 5 : 1);
  }
  return 0;
}
