import type { BuildingId } from '../types/buildings';
import type { GameState } from '../types/state';

/** Structured effect row for the stability/support/freight family of buildings. */
export interface BuildingEffectRow { label: string; value: string; note?: string }

/** Coefficients shared with the settlement so tooltip text cannot drift from gameplay. */
export const ARRAY_STABILITY = 2;
export const REPEATER_BONUS_PER_ARRAY = .5;
export const SPACEPORT_STABILITY = 4;
export const SPACEPORT_ASTEROID_SUPPORT = 2;
export const ASTEROID_UNIT_SUPPORT_COST = 1;
export const ASTEROID_BASE_FREIGHT_BONUS = .05;

export interface EffectSnapshot { repeaters?: number | undefined; asteroidBases?: number | undefined }

function percent(value: number): string { return `${Number((value * 100).toFixed(4))}%`; }

/** Build the shared effect rows for hyperspace stability and asteroid support buildings. */
export function getBuildingEffectRows(id: BuildingId, state: Pick<GameState, 'tech'>, snapshot: EffectSnapshot): BuildingEffectRow[] {
  const repeaters = snapshot.repeaters || 0;
  const asteroidBases = snapshot.asteroidBases || 0;
  switch (id) {
    case 'constraintArray':
      return [{ label: '运行时：稳定度', value: `+${2 + REPEATER_BONUS_PER_ARRAY * repeaters}` }];
    case 'signalRepeater':
      return [{ label: '每座运行阵列稳定度', value: `+${REPEATER_BONUS_PER_ARRAY}`, note: '按运行中继数量累加。' }];
    case 'hydrogenPowerPlant':
      return [{ label: '运行时：喷发小行星群支持', value: '+1' }];
    case 'hyperspaceSpaceport':
      return [
        { label: '运行时：接入点稳定度', value: `+${SPACEPORT_STABILITY}` },
        { label: '运行时：喷发小行星群支持', value: `+${SPACEPORT_ASTEROID_SUPPORT}` },
      ];
    case 'iceMiningShip':
    case 'asteroidBase':
      return [{ label: '占用喷发小行星群支持', value: '1' }];
    default:
      return [];
  }
}

/** Long-form stacking explanation that follows the numeric value on its own row. */
export function getBuildingEffectNotes(id: BuildingId): string[] {
  if (id === 'asteroidBase') return ['仅运行时生效，按运行基地数量累加。'];
  return [];
}

/** Freight capacity multiplier contributed by running asteroid bases (additive per base). */
export function calculateAsteroidFreightMultiplier(asteroidBases: number): number {
  return 1 + ASTEROID_BASE_FREIGHT_BONUS * asteroidBases;
}

/** Knowledge cap bonus per complete 空间撕裂者 core (scales the final knowledge subtotal). */
export const SPACE_RIPPER_KNOWLEDGE_BONUS = .2;
/** 高维存储 doubles hyperspace storage: +100% on the building's base contribution. */
export const HIGHER_DIMENSIONAL_STORAGE_BONUS = 1;
/** 高维存储 adds this flat water storage to every funded hyperspace spaceport. */
export const SPACEPORT_HIGHER_DIMENSIONAL_WATER = 16000;

/** Additive freight capacity percentages: asteroid bases +5% each, 高维存储 +100%. */
export function calculateFreightCapacityMultiplier(state: Pick<GameState, 'tech'>, asteroidBases: number): number {
  return calculateAsteroidFreightMultiplier(asteroidBases)
    + (state.tech.includes('higherDimensionalStorage') ? HIGHER_DIMENSIONAL_STORAGE_BONUS : 0);
}
