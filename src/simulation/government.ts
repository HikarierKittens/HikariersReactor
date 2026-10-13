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
export function calculateSoldierCapacity(state: Pick<GameState, 'buildings'>): number { return ((state.buildings.barracks || 0) + (state.buildings.spaceGarrison || 0)) * 2; }
export function calculateCombatPower(state: Pick<GameState, 'tech' | 'government'> & Partial<Pick<GameState, 'geneModification'>>): number { return (state.tech.includes('ironEquipment') ? 2 : 1) * (state.government === 'militaryRule' ? 1.2 : 1) * (1 + geneBonus(state, 'titanPower')); }
/** 猫猫凝聚 scales soldier-capacity pressure by half its population rate. */
export function calculateSoldierPressure(state: Pick<GameState, 'buildings' | 'government'> & Partial<Pick<GameState, 'geneModification'>>): number { return calculateSoldierCapacity(state) * (state.government === 'militaryRule' ? 1.5 : 1) * Math.max(0, 1 - geneBonus(state, 'catCohesion') / 2); }
/** 猫猫凝聚 scales the 0.5-per-cat population pressure. */
export function calculatePopulationPressure(state: Pick<GameState, 'population'> & Partial<Pick<GameState, 'geneModification'>>): number { return state.population * .5 * Math.max(0, 1 - geneBonus(state, 'catCohesion')); }
export function calculateGovernmentMultiplier(resource: string, state: Pick<GameState, 'government'>): number { return resource === 'cash' && state.government === 'oligarchy' ? 1.25 : resource === 'knowledge' && state.government === 'technocracy' ? 1.1 : 1; }
export function calculateFurMultiplier(state: Pick<GameState, 'tech'>): number { return state.tech.includes('ironEquipment') ? 1.2 : 1; }
export function calculateBankerMultiplier(state: Pick<GameState, 'workers'>): number { return 1 + (state.workers.bank || 0) * .05; }
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
