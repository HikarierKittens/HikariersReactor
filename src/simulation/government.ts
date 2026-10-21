import { withoutPowerCost } from './one-time-cost';
import { TECHNOLOGIES } from '../data/technologies';
import { BUILDINGS } from '../data/buildings';
import {
  COMBAT_POWER_TECH_BONUS, DEFENSE_CASUALTY_REDUCTION, DEFENSE_TECH_BONUS,
  SOLDIER_BASE_COMBAT_POWER, SOLDIER_BASE_DEFENSE, SOLDIER_FUR_BASE, SOLDIER_FUR_POWER_EXPONENT,
} from '../data/military';
import type { GameState, GovernmentId } from '../types/state';
import type { TechnologyId } from '../types/technologies';
import type { ResourceRecipe } from '../types/economy';
import { geneBonus } from './genes';
import { occupationTaxRate } from './neighbors';

export const GOVERNMENTS: Record<GovernmentId, { name: string; tech: TechnologyId; desc: string }> = {
  none: { name: '无政府体制', tech: 'government', desc: '没有额外效果。' },
  democracy: { name: '民主', tech: 'government', desc: '每位艺术家幸福度效果额外+0.5个百分点。' },
  militaryRule: { name: '军政', tech: 'government', desc: '士兵战斗力+20%，训练速度+30%，士兵工作压力+50%。' },
  oligarchy: { name: '寡头', tech: 'government', desc: '猫猫税收+25%，幸福度−10个百分点。' },
  technocracy: { name: '科技至上', tech: 'advancedGovernment', desc: '科技知识成本−8%，所有知识产量+10%。' },
  industrialism: { name: '工业至上', tech: 'advancedGovernment', desc: '工厂所有产量+25%；仅地面工厂成本递增系数降低0.005。' },
};
export const GOVERNMENT_COOLDOWN = 2000;
export function reformCooldown(state: Pick<GameState, 'lastReformTime' | 'time'>): number {
  return state.lastReformTime === null ? 0 : Math.max(0, GOVERNMENT_COOLDOWN - (state.time - state.lastReformTime));
}
export function calculateTechCost(id: TechnologyId, state: Pick<GameState, 'government'>): ResourceRecipe {
  return Object.fromEntries(Object.entries(withoutPowerCost(TECHNOLOGIES[id].cost)).map(([r, v]) => [r, r === 'knowledge' && state.government === 'technocracy' ? Math.ceil(v * .92) : v]));
}
/** Owned ceiling: every owned barracks and garrison, regardless of running state.
 * Used by save validation and by callers that reason about owned capacity only. */
export function calculateSoldierCapacity(state: Pick<GameState, 'buildings'>): number { return ((state.buildings.barracks || 0) + (state.buildings.spaceGarrison || 0)) * 2 + (state.buildings.worldSimulator || 0) * 4; }
/** Units that currently count: a building only counts while it is not switched off. */
function runningUnits(state: Pick<GameState, 'buildings'> & Partial<Pick<GameState, 'stoppedBuildings'>>, id: 'barracks' | 'spaceGarrison' | 'worldSimulator'): number {
  return Math.max(0, (state.buildings[id] || 0) - (state.stoppedBuildings?.[id] || 0));
}
/**
 * 士兵上限: the hard ceiling for the army.
 *
 * Only switched-on capacity counts — 军营 can be toggled, so closing one immediately lowers
 * the ceiling. Payment is deliberately *not* part of the ceiling: a one-tick oil shortage must
 * not delete soldiers, it only pauses training (see calculateOperationalSoldierCapacity).
 * Soldiers above this number are removed at once by clampSoldiersToArmyLimit.
 */
export function calculateArmyLimit(state: Pick<GameState, 'buildings'> & Partial<Pick<GameState, 'stoppedBuildings'>>): number {
  return runningUnits(state, 'barracks') * 2 + runningUnits(state, 'spaceGarrison') * 2 + runningUnits(state, 'worldSimulator') * 4;
}
/** Capacity that still accepts new soldiers: the ceiling, further limited to units actually
 * paid for this step. Training pauses instead of removing anyone when upkeep cannot be met. */
export function calculateOperationalSoldierCapacity(state: Pick<GameState, 'buildings' | 'stoppedBuildings'>, paidGarrisonUnits?: number, digital?: { worldSimulatorUnits: number }): number {
  const garrison = Math.floor(Math.min(runningUnits(state, 'spaceGarrison'), Math.max(0, paidGarrisonUnits ?? runningUnits(state, 'spaceGarrison'))) + 1e-9);
  const simulators = Math.floor(Math.min(runningUnits(state, 'worldSimulator'), Math.max(0, digital?.worldSimulatorUnits ?? runningUnits(state, 'worldSimulator'))) + 1e-9);
  return Math.min(calculateArmyLimit(state), runningUnits(state, 'barracks') * 2 + garrison * 2 + simulators * 4);
}
/**
 * 单兵战斗力: flat technology bonuses plus the percentage effects (军政, 泰坦之力).
 *
 * 铁制装备 used to double this value; since beta 0.9.12 it grants a flat +1 like every
 * other equipment tier, so the percentage effects scale on top of a growing base
 * instead of being frozen behind one multiplier.
 */
export function calculateCombatPower(state: Pick<GameState, 'tech' | 'government'> & Partial<Pick<GameState, 'geneModification'>>): number {
  const flat = Object.entries(COMBAT_POWER_TECH_BONUS).reduce((sum, [id, bonus]) =>
    sum + (state.tech.includes(id as TechnologyId) ? bonus : 0), SOLDIER_BASE_COMBAT_POWER);
  return flat * (state.government === 'militaryRule' ? 1.2 : 1) * (1 + geneBonus(state, 'titanPower'));
}

/** 防御力: flat only; it feeds the casualty reduction, never the raid strength. */
export function calculateSoldierDefense(state: Pick<GameState, 'tech'>): number {
  return Object.entries(DEFENSE_TECH_BONUS).reduce((sum, [id, bonus]) =>
    sum + (state.tech.includes(id as TechnologyId) ? bonus : 0), SOLDIER_BASE_DEFENSE);
}

/**
 * Casualty multiplier from 防御力: 1 / (1 + defense × 0.1).
 *
 * Applied to the expected losses of every raid and retaliation, so a defended army
 * keeps more of its soldiers at the same strength. Diminishing by design — each
 * additional point is worth less than the one before it.
 */
export function defenseCasualtyMultiplier(state: Pick<GameState, 'tech'>): number {
  return 1 / (1 + calculateSoldierDefense(state) * DEFENSE_CASUALTY_REDUCTION);
}

/** One contributing source behind 单兵战斗力 / 防御力, for the hover breakdown. */
export interface SoldierStatSource { id: string; name: string; value: number }
export interface SoldierStatBreakdown {
  combatPower: { base: number; flat: SoldierStatSource[]; percent: SoldierStatSource[]; total: number };
  defense: { base: number; flat: SoldierStatSource[]; total: number; casualtyMultiplier: number };
}

/**
 * Full 战斗力/防御力 breakdown for the military panel tooltip.
 *
 * Derived from the same registries the calculators read, so the hover panel can never
 * disagree with the number it explains. `percent` entries are additive percentage
 * points applied to the flat total (军政 +20%, 泰坦之力 +5%/级).
 */
export function soldierStatBreakdown(state: Pick<GameState, 'tech' | 'government'> & Partial<Pick<GameState, 'geneModification'>>): SoldierStatBreakdown {
  const flat = (bonuses: Partial<Record<TechnologyId, number>>): SoldierStatSource[] =>
    Object.entries(bonuses)
      .filter(([id]) => state.tech.includes(id as TechnologyId))
      .map(([id, value]) => ({ id, name: TECHNOLOGIES[id as TechnologyId].name, value }));
  const percent: SoldierStatSource[] = [];
  if (state.government === 'militaryRule') percent.push({ id: 'militaryRule', name: GOVERNMENTS.militaryRule.name, value: .2 });
  const titan = geneBonus(state, 'titanPower');
  if (titan > 0) percent.push({ id: 'titanPower', name: '泰坦之力', value: titan });
  return {
    combatPower: { base: SOLDIER_BASE_COMBAT_POWER, flat: flat(COMBAT_POWER_TECH_BONUS), percent, total: calculateCombatPower(state) },
    defense: {
      base: SOLDIER_BASE_DEFENSE, flat: flat(DEFENSE_TECH_BONUS),
      total: calculateSoldierDefense(state), casualtyMultiplier: defenseCasualtyMultiplier(state),
    },
  };
}
/** 猫猫凝聚 scales soldier-capacity pressure by half its population rate.
 * Only switched-on barracks/garrisons and funded simulators create pressure, so closing a
 * 军营 immediately relieves the happiness penalty it caused. */
export function calculateSoldierPressure(state: Pick<GameState, 'buildings' | 'government'> & Partial<Pick<GameState, 'geneModification' | 'stoppedBuildings'>>, digital?: { worldSimulatorUnits: number }): number {
  const capacity = runningUnits(state, 'barracks') * 2 + runningUnits(state, 'spaceGarrison') * 2
    + Math.floor(Math.min(runningUnits(state, 'worldSimulator'), Math.max(0, digital?.worldSimulatorUnits ?? runningUnits(state, 'worldSimulator'))) + 1e-9) * 4;
  return capacity * (state.government === 'militaryRule' ? 1.5 : 1) * Math.max(0, 1 - geneBonus(state, 'catCohesion') / 2);
}
/** 猫猫凝聚 scales the 0.5-per-cat population pressure. */
export function calculatePopulationPressure(state: Pick<GameState, 'population'> & Partial<Pick<GameState, 'geneModification'>>): number { return state.population * .5 * Math.max(0, 1 - geneBonus(state, 'catCohesion')); }
export function calculateGovernmentMultiplier(resource: string, state: Pick<GameState, 'government'>): number { return resource === 'cash' && state.government === 'oligarchy' ? 1.25 : resource === 'knowledge' && state.government === 'technocracy' ? 1.1 : 1; }
/**
 * 士兵毛皮采集: fur per soldier per second, driven by 单兵战斗力.
 *
 * `SOLDIER_FUR_BASE × 战斗力^0.5`. With no equipment (战斗力 1) this is exactly the old
 * 0.2/s, so early saves see no change; full equipment (战斗力 7 since 纳米装甲技术) gives
 * about 0.529/s. The square
 * root deliberately halves the value of percentage bonuses (军政, 泰坦之力) and keeps the
 * whole source sublinear, so 工厂毛皮 — which grows multiplicatively — takes over as the
 * main supplier without any hard cut-off.
 */
export function soldierFurPerSoldier(state: Pick<GameState, 'tech' | 'government'> & Partial<Pick<GameState, 'geneModification'>>): number {
  return SOLDIER_FUR_BASE * Math.max(0, calculateCombatPower(state)) ** SOLDIER_FUR_POWER_EXPONENT;
}
/** Total 士兵毛皮 per second for the current army. */
export function soldierFurRate(state: Pick<GameState, 'soldiers' | 'tech' | 'government'> & Partial<Pick<GameState, 'geneModification'>>): number {
  return state.soldiers * soldierFurPerSoldier(state);
}
/** Per-banker tax bonus: 5% base, +2 percentage points per 证券交易所 (additive). */
export const BANKER_TAX_BONUS = .05;
export const STOCK_EXCHANGE_BANKER_BONUS = .02;
export function calculateBankerTaxRate(state: Pick<GameState, 'arpaBuildings'>): number {
  return BANKER_TAX_BONUS + STOCK_EXCHANGE_BANKER_BONUS * (state.arpaBuildings?.stockExchange || 0);
}
export function calculateBankerMultiplier(state: Pick<GameState, 'workers' | 'arpaBuildings'>): number { return 1 + (state.workers.bank || 0) * calculateBankerTaxRate(state); }
export function calculateTaxBase(state: Pick<GameState, 'population' | 'taxRate'> & Partial<Pick<GameState, 'neighbors'>>): number {
  // 占领 costs order: each occupied city lowers the collected rate (see `occupationTaxRate`).
  const rate = state.neighbors ? occupationTaxRate(state as Pick<GameState, 'taxRate' | 'neighbors'>) : state.taxRate;
  return state.population * rate / 20;
}
/** Per-camp training effect in percent: 5%, or 8% after 虚拟训练. */
export function calculateTrainingBoost(state: Partial<Pick<GameState, 'tech'>>): number { return state.tech?.includes('virtualTraining') ? 8 : BUILDINGS.trainingCamp.trainingBoost ?? 0; }
export function calculateTrainingDuration(state: Pick<GameState, 'buildings' | 'government'> & Partial<Pick<GameState, 'tech'>>): number { return 30 / 2 ** ((state.buildings.trainingCamp || 0) * calculateTrainingBoost(state) / 100) / (state.government === 'militaryRule' ? 1.3 : 1); }
export function calculatePrestigeReward(state: Pick<GameState, 'population' | 'soldiers'>): number { const raw = state.population / 4 + state.soldiers / 2 + 10; return Math.floor(raw <= 150 ? raw : 150 + (raw - 150) / 4); }
/** Escape rewards use the population remaining aboard at launch, including soldiers. */
export function calculateEscapePrestigeReward(state: Pick<GameState, 'population' | 'soldiers'>): number {
  const raw = (state.population + state.soldiers) / 3 + 100;
  return Math.floor(raw <= 400 ? raw : 400 + (raw - 400) * .25);
}
/** Casimir is awarded from the final integer particle reward, not its uncapped base. */
export function calculateCasimirReward(particleReward: number): number {
  const raw = particleReward / 8;
  return Math.floor(raw <= 100 ? raw : 100 + (raw - 100) * .05);
}
/** 飞升 uses this run's actual knowledge expenditure, never lifetime spending. */
export function calculateDigitalAscensionParticleReward(state: Pick<GameState, 'population' | 'soldiers' | 'statistics'>): number {
  const raw = (state.population + state.soldiers) / 1.15
    + Math.log1p(.008 * state.statistics.run.knowledgeSpent / 30000) / Math.log1p(.008);
  return Math.floor(raw <= 2000 ? raw : 2000 + (raw - 2000) * .25);
}
/** Derived only from the final capped, integer particle reward. Zero awards no Casimir. */
export function calculateDigitalAscensionCasimirReward(particleReward: number): number {
  return particleReward <= 1 ? 0 : Math.max(0, Math.floor(Math.log2(particleReward) * 4 * Math.E));
}
export function calculateDigitalAscensionHarmonyReward(state: Pick<GameState, 'challenge'>): number {
  return 2 + state.challenge.genes.length;
}

/** 黑洞重置 particles: larger base and a later, gentler soft cap than escape. */
export function calculateBlackHoleParticleReward(state: Pick<GameState, 'population' | 'soldiers'>): number {
  const raw = (state.population + state.soldiers) / 2 + 250;
  return Math.floor(raw <= 800 ? raw : 800 + (raw - 800) * .3);
}
/** 黑洞重置 Casimir from the final particle reward, with a higher soft cap than escape. */
export function calculateBlackHoleCasimirReward(particleReward: number): number {
  const raw = particleReward / 6;
  return Math.floor(raw <= 150 ? raw : 150 + (raw - 150) * .1);
}
