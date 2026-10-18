import { FACTORY_OPTIONS, RESOURCES } from '../data/resources';
import { calculateQuantumManufacturingMultiplier } from './quantum';
import { calculateFactoryRecipe, countAssignedLines } from './factory';
import { isResourceUnlocked } from './unlocks';
import { countRunningBuildings } from './housing';
import { calculateFactoryOutputMultiplier } from './multipliers';
import { calculateSpaceMultiplier } from './asriel';
import { calculateBuildingInput } from './building-production';
import { BUILDINGS } from '../data/buildings';
import type { GameState } from '../types/state';
import type { ResourceAmounts, ResourceId, AsrielSupport } from '../types/economy';

export function isFactoryLineUnlocked(id: string, state: GameState): boolean {
  const option = FACTORY_OPTIONS.find(item => item.id === id);
  if (!option || (option.tech && !state.tech.includes(option.tech))) return false;
  if (id === 'fur') return state.buildings.factory > 0;
  const tech = RESOURCES[option.id].tech;
  return (!tech || state.tech.includes(tech)) && isResourceUnlocked(id, state);
}
export function settleFactoryLines(state: GameState, pool: ResourceAmounts, dt: number, happiness: number, support: AsrielSupport, fuelMultiplier?: number, quantumLevel = 0) {
  const inputs: Record<string, number> = {}, outputs: Record<string, number> = {};
  const ground = Math.min(countRunningBuildings('factory', state), Math.max(0, pool.energy) / (3 * dt));
  inputs.factory = outputs.factory = ground;
  pool.energy = Math.max(0, pool.energy - ground * 3 * dt);
  const fuel = fuelMultiplier === undefined ? calculateBuildingInput('spaceFactory', state).helium3 || 0 : 2 * fuelMultiplier;
  const space = Math.min(countRunningBuildings('spaceFactory', state), Math.max(0, pool.energy) / (3 * dt), Math.max(0, pool.helium3) / (fuel * dt));
  inputs.spaceFactory = outputs.spaceFactory = space;
  pool.energy = Math.max(0, pool.energy - space * 3 * dt);
  pool.helium3 = Math.max(0, pool.helium3 - space * fuel * dt);
  // 高科技工厂: 2 lines per funded factory, paid with energy + deuterium after space factories.
  const highTechRecipe = Object.entries(calculateBuildingInput('highTechFactory', state)) as [ResourceId, number][];
  let highTech = countRunningBuildings('highTechFactory', state);
  for (const [id, value] of highTechRecipe) highTech = Math.min(highTech, Math.max(0, pool[id] || 0) / (value * dt));
  inputs.highTechFactory = outputs.highTechFactory = highTech;
  for (const [id, value] of highTechRecipe) pool[id] = Math.max(0, pool[id] - value * highTech * dt);
  // Powered line capacity weighs each factory by its own line count.
  const poweredLines = ground + space + highTech * (BUILDINGS.highTechFactory.lines || 0);
  const powerRatio = Math.min(1, poweredLines / (countAssignedLines(state) || 1));
  for (const option of FACTORY_OPTIONS) {
    const units = state.lines[option.id] || 0;
    if (!units || !isFactoryLineUnlocked(option.id, state)) continue;
    const recipe = calculateFactoryRecipe(option.id, state);
    const ingredients = Object.entries(recipe.input) as [ResourceId, number][];
    const products = Object.entries(recipe.output) as [ResourceId, number][];
    let ratio = powerRatio;
    for (const [id, value] of ingredients) ratio = Math.min(ratio, pool[id] / (value * units * dt || 1));
    const actual = units * Math.max(0, ratio);
    inputs[option.id] = outputs[option.id] = actual;
    for (const [id, value] of ingredients) pool[id] = Math.max(0, pool[id] - value * actual * dt);
    // Current factory recipes never produce knowledge; keep that contract explicit.
    for (const [id, value] of products) pool[id] += value * actual * calculateFactoryOutputMultiplier(id, happiness, state, 1) * calculateQuantumManufacturingMultiplier(state, id, quantumLevel) * dt;
    for (const [id, value] of products) if (space > 0 && id !== 'energy' && id !== 'knowledge') {
      const share = space / (poweredLines || 1);
      pool[id] += value * actual * calculateFactoryOutputMultiplier(id, happiness, state, 1) * calculateQuantumManufacturingMultiplier(state, id, quantumLevel) * dt * share * (calculateSpaceMultiplier('spaceFactory', state, support) - 1);
    }
  }
  return { inputs, outputs };
}
