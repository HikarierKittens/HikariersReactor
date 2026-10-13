import { BUILDINGS } from '../data/buildings';
import { FACTORY_OPTIONS } from '../data/resources';
import type { BuildingId } from '../types/buildings';
import type { FactoryRecipe, ResourceRecipe } from '../types/economy';
import type { GameState } from '../types/state';

function scaleRecipe(recipe: ResourceRecipe, scale: number): ResourceRecipe {
  return Object.fromEntries(Object.entries(recipe).map(([id, amount]) => [
    id, Number((amount * scale).toPrecision(12)),
  ]));
}

/** Unknown line IDs retain the previous safe empty-recipe behavior. */
export function calculateFactoryRecipe(id: string, state: Pick<GameState, 'tech'>): FactoryRecipe {
  const option = FACTORY_OPTIONS.find(candidate => candidate.id === id);
  if (!option) return { input: {}, output: {} };
  const speed = 1 + (state.tech.includes('automatedEngineering') ? .3 : 0)
    + (state.tech.includes('intelligentFactory') ? .5 : 0);
  const chemical = state.tech.includes('chemicalDeposition') ? 1.2 : 1;
  return { input: scaleRecipe(option.input, speed), output: scaleRecipe(option.output, speed * chemical * (id === 'alloy' && state.tech.includes('quantumTunnelingThermalProcessing') ? 1.1 : 1)) };
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
