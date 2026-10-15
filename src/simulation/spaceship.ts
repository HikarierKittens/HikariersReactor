import type { ResourceRecipe } from '../types/economy';
import type { GameState, ShipComponentId, ShipResourceProgress } from '../types/state';
import { calculateResourceRemainingCost, investResourceProgress, resourceCompletionPercent } from './project-funding';
import { reconcilePopulationAssignments } from './population';
import { recordKnowledgeSpent } from './statistics';
import { addLog } from './progression';

export type { ShipComponentId } from '../types/state';
export interface ShipComponentDefinition { name: string; icon: string; desc: string; cost: ResourceRecipe; population?: number }
/** Hull unlocks the remaining independently buildable, one-time components. Prices never receive emitter discounts. */
export const SHIP_COMPONENTS: Record<ShipComponentId, ShipComponentDefinition> = {
  hull: { name: '飞船船体', icon: '', desc: '如此规模的飞船，船体是首要的组件', cost: { cash: 1000000, metal: 400000, titanium: 400000, alloy: 400000, polymer: 400000, nanotubes: 200000 } },
  energyCore: { name: '能源核心', icon: '', desc: '少数工程师反对能源核心的建造，他们认为潜在的爆炸随时会摧毁米神星', cost: { cash: 1000000, titanium: 200000, copper: 400000, iron: 400000, uranium: 25000 } },
  computer: { name: '飞船计算机', icon: '', desc: '计算机与舰载AI将以协议4运作', cost: { knowledge: 1000000, energy: 100000 } },
  ecosystem: { name: '生态系统', icon: '', desc: '喵星2号试验表明，如果规模不够大，任何生态系统都会毁灭，只有行星规模的生态才能接近无限', cost: { food: 400000, wood: 400000, stone: 400000, fur: 50000 }, population: 10 },
  electromagneticEngine: { name: 'ESS-喵星号 电磁引擎', icon: '', desc: '实验性的无工质引擎，它需要极端恐怖的能量输入才能工作，但是可以把大型飞船加速至光速的99.9999%', cost: { knowledge: 1000000, alloy: 100000, neutron: 10000 } },
  fuel: { name: '飞船燃料', icon: '', desc: 'E-710被认为是唯一有机会驱动电磁引擎的能量源，但是还不够，我们还需要许多氦-3', cost: { e710: 1000, helium3: 25000, energy: 100000 } },
};
/** Escape requires an owned dock and completion of every registered component. */
export function hasCompleteShip(state: GameState): boolean {
  return state.buildings.interstellarDock > 0
    && (Object.keys(SHIP_COMPONENTS) as ShipComponentId[]).every(id => state.shipComponents?.[id] === true);
}
export function isShipComponentId(id: string): id is ShipComponentId { return Object.hasOwn(SHIP_COMPONENTS, id); }
export function isShipComponentUnlocked(id: string, state: GameState): boolean {
  return isShipComponentId(id) && (state.buildings.interstellarDock || 0) > 0
    && (id === 'hull' || state.shipComponents?.hull === true);
}
export function calculateShipComponentProgress(id: ShipComponentId, state: GameState): number {
  const definition = SHIP_COMPONENTS[id], progress = state.shipResourceProgress?.[id] || {};
  const resources = resourceCompletionPercent(definition.cost, progress);
  return definition.population ? Math.min(resources, progress.population || 0) : resources;
}
export function calculateShipComponentRemainingCost(id: ShipComponentId, state: GameState): ShipResourceProgress {
  const definition = SHIP_COMPONENTS[id], progress = state.shipResourceProgress?.[id] || {};
  const remaining: ShipResourceProgress = calculateResourceRemainingCost(definition.cost, progress);
  if (definition.population) remaining.population = definition.population * (100 - (progress.population || 0)) / 100;
  return remaining;
}
export interface ShipInvestment { investedPercent: number; spent: ShipResourceProgress; complete: boolean; completed: boolean }
/** Requested percentages are an additional independent contribution cap, not an overall target. */
export function investInShipComponent(id: string, requested: number | 'max', state: GameState, minimumPercent = 0): ShipInvestment {
  const empty: ShipInvestment = { investedPercent: 0, spent: {}, complete: false, completed: false };
  if (!isShipComponentUnlocked(id, state) || !isShipComponentId(id) || state.shipComponents?.[id]) return empty;
  const percent = requested === 'max' ? 100 : requested;
  if (!Number.isFinite(percent) || percent <= 0) return empty;
  state.shipResourceProgress ||= {};
  state.shipComponents ||= { hull: false, energyCore: false, computer: false, ecosystem: false, electromagneticEngine: false, fuel: false };
  const progress = state.shipResourceProgress[id] ||= {};
  const definition = SHIP_COMPONENTS[id];
  const result = investResourceProgress(definition.cost, state.resources, progress, percent, minimumPercent);
  recordKnowledgeSpent(state, result.spent.knowledge || 0);
  const spent: ShipResourceProgress = result.spent;
  let investedPercent = result.investedPercent;
  if (definition.population) {
    const paidCats = Math.round((progress.population || 0) * definition.population / 100);
    const cats = Math.min(Math.floor(state.population), definition.population - paidCats, Math.floor(Math.min(percent, 100) * definition.population / 100 + 1e-9));
    if (cats > 0) {
      state.population -= cats;
      progress.population = (paidCats + cats) * 100 / definition.population;
      spent.population = cats;
      investedPercent = Math.max(investedPercent, cats * 100 / definition.population);
      reconcilePopulationAssignments(state);
    }
  }
  const complete = calculateShipComponentProgress(id, state) === 100;
  if (complete) {
    state.shipComponents[id] = true;
    addLog(state, `${definition.name} 已完成`, 'progress');
  }
  return { investedPercent, spent, complete, completed: complete };
}
