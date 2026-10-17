import { TECHNOLOGIES } from '../data/technologies';
import { BUILDINGS } from '../data/buildings';
import type { GameState, GovernmentId } from '../types/state';
import type { TechnologyId } from '../types/technologies';
import type { ResourceRecipe } from '../types/economy';
import { geneBonus } from './genes';

export const GOVERNMENTS: Record<GovernmentId, { name: string; tech: TechnologyId; desc: string }> = {
  none: { name: '无政府体制', tech: 'government', desc: '没有额外效果。' },
  democracy: { name: '民主', tech: 'government', desc: '每位艺术家幸福度效果额外+0.5个百分点。' },
  militaryRule: { name: '军政', tech: 'government', desc: '士兵战斗力+20%，训练速度+30%，士兵工作压力+50%。' },
  oligarchy: { name: '寡头', tech: 'government', desc: '猫猫税收+25%，幸福度−10个百分点。' },
  technocracy: { name: '科技至上', tech: 'advancedGovernment', desc: '科技知识成本−8%，所有知识产量+10%。' },
  industrialism: { name: '工业至上', tech: 'advancedGovernment', desc: '工厂所有产量+25%；仅地面工厂成本递增系数降低0.005。' },
};
export const GOVERNMENT_COOLDOWN = 2000;
export function availableGovernments(state: Pick<GameState, 'tech'>) {
  return (Object.keys(GOVERNMENTS) as GovernmentId[]).filter(id => state.tech.includes(GOVERNMENTS[id].tech)).map(id => ({ id, ...GOVERNMENTS[id] }));
}
export function reformCooldown(state: Pick<GameState, 'lastReformTime' | 'time'>): number {
  return state.lastReformTime === null ? 0 : Math.max(0, GOVERNMENT_COOLDOWN - (state.time - state.lastReformTime));
}
export function calculateTechCost(id: TechnologyId, state: Pick<GameState, 'government'>): ResourceRecipe {
  return Object.fromEntries(Object.entries(TECHNOLOGIES[id].cost).map(([r, v]) => [r, r === 'knowledge' && state.government === 'technocracy' ? Math.ceil(v * .92) : v]));
}
/** Owned ceiling for save validation and existing capacity-based army pressure.
 * Stopping or starving a garrison never deletes already trained soldiers. */
export function calculateSoldierCapacity(state: Pick<GameState, 'buildings'>): number { return ((state.buildings.barracks || 0) + (state.buildings.spaceGarrison || 0)) * 2 + (state.buildings.worldSimulator || 0) * 4; }
/** Only whole paid garrisons can open new training places. */
export function calculateOperationalSoldierCapacity(state: Pick<GameState, 'buildings' | 'stoppedBuildings'>, paidGarrisonUnits: number, digital?: { worldSimulatorUnits: number }): number {
  const running = Math.max(0, (state.buildings.spaceGarrison || 0) - (state.stoppedBuildings?.spaceGarrison || 0));
  const simulators = Math.max(0, (state.buildings.worldSimulator || 0) - (state.stoppedBuildings?.worldSimulator || 0));
  return (state.buildings.barracks || 0) * 2 + Math.floor(Math.min(running, Math.max(0, paidGarrisonUnits)) + 1e-9) * 2
    + Math.floor(Math.min(simulators, Math.max(0, digital?.worldSimulatorUnits ?? 0)) + 1e-9) * 4;
}
export function calculateCombatPower(state: Pick<GameState, 'tech' | 'government'> & Partial<Pick<GameState, 'geneModification'>>): number { return (state.tech.includes('ironEquipment') ? 2 : 1) * (state.government === 'militaryRule' ? 1.2 : 1) * (1 + geneBonus(state, 'titanPower')); }
/** 猫猫凝聚 scales soldier-capacity pressure by half its population rate. */
export function calculateSoldierPressure(state: Pick<GameState, 'buildings' | 'government'> & Partial<Pick<GameState, 'geneModification'>>, digital?: { worldSimulatorUnits: number }): number {
  const capacity = ((state.buildings.barracks || 0) + (state.buildings.spaceGarrison || 0)) * 2 + (digital?.worldSimulatorUnits ?? 0) * 4;
  return capacity * (state.government === 'militaryRule' ? 1.5 : 1) * Math.max(0, 1 - geneBonus(state, 'catCohesion') / 2);
}
/** 猫猫凝聚 scales the 0.5-per-cat population pressure. */
export function calculatePopulationPressure(state: Pick<GameState, 'population'> & Partial<Pick<GameState, 'geneModification'>>): number { return state.population * .5 * Math.max(0, 1 - geneBonus(state, 'catCohesion')); }
export function calculateGovernmentMultiplier(resource: string, state: Pick<GameState, 'government'>): number { return resource === 'cash' && state.government === 'oligarchy' ? 1.25 : resource === 'knowledge' && state.government === 'technocracy' ? 1.1 : 1; }
export function calculateFurMultiplier(state: Pick<GameState, 'tech'>): number { return state.tech.includes('ironEquipment') ? 1.2 : 1; }
/** Per-banker tax bonus: 5% base, +2 percentage points per 证券交易所 (additive). */
export const BANKER_TAX_BONUS = .05;
export const STOCK_EXCHANGE_BANKER_BONUS = .02;
export function calculateBankerTaxRate(state: Pick<GameState, 'arpaBuildings'>): number {
  return BANKER_TAX_BONUS + STOCK_EXCHANGE_BANKER_BONUS * (state.arpaBuildings?.stockExchange || 0);
}
export function calculateBankerMultiplier(state: Pick<GameState, 'workers' | 'arpaBuildings'>): number { return 1 + (state.workers.bank || 0) * calculateBankerTaxRate(state); }
export function calculateTaxBase(state: Pick<GameState, 'population' | 'taxRate'>): number { return state.population * state.taxRate / 20; }
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
