import type { GameState } from '../types/state';

/**
 * 芯片工厂（`catCafe`）的基础资金产量倍率——唯一来源。
 *
 * 两个科技各自独立加成，**相乘叠算**而不是相加：
 * - 多重曝光技术（`masterpieceCat`）：+20%
 * - 抗辐射芯片（`radiationHardenedChip`）：+25%
 *
 * 两者独立计算意味着同时启用时是 1.2 × 1.25 = 1.5，不是 1 + .2 + .25 = 1.45。
 *
 * 结算（`ground-settlement.ts`）、资源明细的反推（`resource-breakdown.ts` 的
 * `sourceValue`）与明细行（同一个 `pct(...)`）三处必须共用这一函数，否则会出现
 * 「明细与结算不一致」——本项目历史上多次因此出 bug。
 */
export const CHIP_FACTORY_MASTERPIECE_BONUS = .2;
export const CHIP_FACTORY_RADIATION_BONUS = .25;

/** Researched multiplier applied to 芯片工厂's base cash output; 1 before any of the techs. */
export function chipFactoryOutputMultiplier(state: Pick<GameState, 'tech'>): number {
  const masterpiece = state.tech.includes('masterpieceCat') ? 1 + CHIP_FACTORY_MASTERPIECE_BONUS : 1;
  const radiation = state.tech.includes('radiationHardenedChip') ? 1 + CHIP_FACTORY_RADIATION_BONUS : 1;
  return masterpiece * radiation;
}
