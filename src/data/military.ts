import type { TechnologyId } from '../types/technologies';

/**
 * 士兵战斗属性: base values plus the flat technology bonuses that raise them.
 *
 * 单兵战斗力 decides raid strength; 防御力 reduces the casualties a raid or a
 * retaliation inflicts. Both are derived from `state.tech`, so no save field is
 * involved and old saves need no migration — the values simply appear once the
 * technology is researched.
 */
export const SOLDIER_BASE_COMBAT_POWER = 1;
export const SOLDIER_BASE_DEFENSE = 0;

/**
 * Flat 单兵战斗力 per technology, in unlock order.
 *
 * These are additive on purpose: 铁制装备 used to double the power, which capped
 * the whole military line at one multiplier. Flat +1 per equipment tier keeps every
 * new technology worth roughly the same share and lets percentage effects
 * (军政, 泰坦之力) scale on top of the total.
 */
export const COMBAT_POWER_TECH_BONUS: Partial<Record<TechnologyId, number>> = {
  ironEquipment: 1,
  newInfantryEquipment: 1,
  advancedThermalWeapons: 1,
  railgun: 1,
  nanoArmor: 2,
};

/** Flat 防御力 per technology, in unlock order. */
export const DEFENSE_TECH_BONUS: Partial<Record<TechnologyId, number>> = {
  ironEquipment: 1,
  newInfantryEquipment: 1,
  kevlarFiber: 1,
  railgun: 1,
  nanoArmor: 1,
};

/**
 * Casualties are multiplied by 1 / (1 + defense × this).
 *
 * Each point therefore helps less than the previous one: 1 → ×0.909, 2 → ×0.833,
 * 3 → ×0.769, 4 → ×0.714, 5 → ×0.667. 纳米装甲技术 lifted the ceiling to 5 points
 * (every defense technology researched), so a fully equipped army loses a third
 * fewer soldiers than a bare one.
 */
export const DEFENSE_CASUALTY_REDUCTION = .1;

/**
 * 士兵毛皮采集 per second, before the 战斗力 factor: `SOLDIER_FUR_BASE × 战斗力^0.5`.
 *
 * The square root is the whole point of the formula. A soldier with no equipment still
 * produces exactly 0.2/s (√1 = 1), so the early game is unchanged; full equipment
 * (战斗力 7 since 纳米装甲技术) raises it to about 0.529/s. Because 军政 and 泰坦之力 are
 * *percentages* on top of 战斗力, the root halves their effect: +100% power becomes only
 * +41% fur.
 *
 * That sublinear growth is what keeps soldier fur in the background. 工厂毛皮 grows
 * multiplicatively (生产线 × 量子制造 × 幸福度 × 全局倍率), so it outpaces this by an
 * order of magnitude once the factory chain comes online — exactly the intended
 * "soldiers gather a little, the factory supplies the rest" balance.
 */
export const SOLDIER_FUR_BASE = .2;
export const SOLDIER_FUR_POWER_EXPONENT = .5;
