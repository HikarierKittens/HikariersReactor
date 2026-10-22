import { BUILDINGS } from '../data/buildings';
import { FACTORY_OPTIONS } from '../data/resources';
import { geneBonus } from './genes';
import type { BuildingId } from '../types/buildings';
import type { FactoryRecipe, ResourceRecipe } from '../types/economy';
import type { GameState } from '../types/state';

function scaleRecipe(recipe: ResourceRecipe, scale: number): ResourceRecipe {
  return Object.fromEntries(Object.entries(recipe).map(([id, amount]) => [
    id, Number((amount * scale).toPrecision(12)),
  ]));
}

/** Unknown line IDs retain the previous safe empty-recipe behavior. */
export function calculateFactoryRecipe(id: string, state: Pick<GameState, 'tech'> & Partial<Pick<GameState, 'geneModification'>>): FactoryRecipe {
  const option = FACTORY_OPTIONS.find(candidate => candidate.id === id);
  if (!option) return { input: {}, output: {} };
  const speed = 1 + (state.tech.includes('automatedEngineering') ? .3 : 0)
    + (state.tech.includes('intelligentFactory') ? .5 : 0);
  const chemical = state.tech.includes('chemicalDeposition') ? 1.2 : 1;
  // 完美主义 raises base line output only; ingredient demand is unchanged.
  const perfectionism = 1 + geneBonus(state, 'perfectionism');
  return { input: scaleRecipe(option.input, speed), output: scaleRecipe(option.output, speed * chemical * perfectionism * (id === 'alloy' && state.tech.includes('quantumTunnelingThermalProcessing') ? 1.1 : 1)) };
}

export function calculateFactoryCapacity(state: Pick<GameState, 'buildings'> & Partial<Pick<GameState, 'stoppedBuildings'>>): number {
  return (Object.keys(BUILDINGS) as BuildingId[]).reduce((sum, id) =>
    sum + (BUILDINGS[id].lines || 0) * Math.max(0, (state.buildings[id] || 0) - (state.stoppedBuildings?.[id] || 0)), 0);
}

/** Retract excess assignments from the largest line categories first; ties use registry order. */
export function trimFactoryAssignments(state: GameState): number {
  let excess = Math.max(0, countAssignedLines(state) - calculateFactoryCapacity(state));
  const removed = excess;
  const options = [...FACTORY_OPTIONS].sort((a, b) => state.lines[b.id] - state.lines[a.id]);
  for (const option of options) {
    if (!excess) break;
    const amount = Math.min(excess, state.lines[option.id]);
    state.lines[option.id] -= amount;
    excess -= amount;
  }
  return removed;
}

export function countAssignedLines(state: Pick<GameState, 'lines'>): number {
  return Object.values(state.lines || {}).reduce((sum, count) => sum + count, 0);
}

/** Free line capacity: owned capacity minus everything currently assigned. */
export function countFreeFactoryLines(state: GameState): number {
  return Math.max(0, calculateFactoryCapacity(state) - countAssignedLines(state));
}

/**
 * 新建造的工厂，其生产线默认加入合金生产线 (beta 0.9.28).
 *
 * `added` is the number of newly completed units. The assignment is clamped to the
 * capacity those units actually created: a factory that starts stopped (missing
 * support or power) grants no line, so assigning one would make the save invalid.
 */
export function assignNewFactoryLines(state: GameState, id: BuildingId, added: number): number {
  const lines = (BUILDINGS[id].lines || 0) * Math.max(0, added);
  const assign = Math.min(lines, countFreeFactoryLines(state));
  if (assign > 0) state.lines.alloy = (state.lines.alloy || 0) + assign;
  return assign;
}

/** Owned 冶炼厂工位 (冶炼厂 +1, 恒星熔炉 +2), ignoring stopped smelters; bounds the idle setting. */
export function calculateSmelterSlotCapacity(state: Pick<GameState, 'buildings'>): number {
  return (state.buildings.smelter || 0) + 2 * (state.buildings.stellarForge || 0);
}
/** 冶炼厂工位 assigned to 钢冶炼: every non-idle slot, so new slots auto-run steel. */
export function countSteelSmelterSlots(state: Pick<GameState, 'buildings'> & Partial<Pick<GameState, 'smelterIdle'>>): number {
  return Math.max(0, calculateSmelterSlotCapacity(state) - Math.min(state.smelterIdle || 0, calculateSmelterSlotCapacity(state)));
}
/** Steel slots that actually run: stopped smelters remove their own slot first. */
export function calculateRunningSmelterSlots(state: Pick<GameState, 'buildings'> & Partial<Pick<GameState, 'stoppedBuildings' | 'smelterIdle'>>): number {
  const running = Math.max(0, (state.buildings.smelter || 0) - (state.stoppedBuildings?.smelter || 0)) + 2 * (state.buildings.stellarForge || 0);
  return Math.max(0, running - Math.min(state.smelterIdle || 0, calculateSmelterSlotCapacity(state)));
}
