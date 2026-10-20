import { BUILDINGS } from '../data/buildings';
import { CONFIG } from '../data/config';
import { calculateBuildingInput, calculateBuildingOutput, calculateToolMultiplier, calculateGrantedJobSlots } from './building-production';
import { calculateProductionMultiplier, calculateKnowledgeMultiplier, calculateAluminumMultiplier } from './multipliers';
import { calculateGlobalOutputMultiplier } from './crafting';
import { isPowerProducer } from './power';
import { calculateSmelterSlotCapacity, calculateRunningSmelterSlots } from './factory';
import { RESEARCH_SATELLITE_LAB_OUTPUT } from './building-effects';
import type { GameState } from '../types/state';
import type { BuildingId } from '../types/buildings';
import type { ResourceId, ResourceAmounts, ResourceRecipe } from '../types/economy';

export function settleGroundProduction(state: GameState, pool: ResourceAmounts, dt: number, happiness: number, inputUnits: Record<string, number>, outputs: Record<string, number>, boosts: { mixerUnits: number; miningUnits: number; coalMiningUnits: number; lumberUnits: number; quarryUnits: number; dataUnits: number; digital?: { aesUnits?: number } }): void {
  const entries = (recipe: ResourceRecipe) => Object.entries(recipe) as [ResourceId, number][];
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    // 冶炼厂 settles per steel-assigned 冶炼厂工位 (including 恒星熔炉 slots); each slot is one legacy smelter.
    const b = BUILDINGS[id], n = id === 'smelter' ? calculateSmelterSlotCapacity(state) : state.buildings[id];
    const running = id === 'smelter' ? calculateRunningSmelterSlots(state) : Math.max(0, n - (state.stoppedBuildings?.[id] || 0));
    const units = b.workerOutput ? Math.min(state.workers[id] || 0, b.unlimited ? Infinity : (['cementWorkshop', 'mine', 'coalMine'].includes(id) ? n : running) * (b.slots ?? b.artistSlots ?? CONFIG.workersPerBuilding) + calculateGrantedJobSlots(id, state)) : running;
    const out = calculateBuildingOutput(id, state, inputUnits);
    if (b.settledByOtherSystem || b.spaceSource || (!n && !b.unlimited) || (!Object.keys(out).length && !b.input) || isPowerProducer(id)) continue;
    const inputs = entries(calculateBuildingInput(id, state));
    if (!Object.keys(out).length) {
      let ratio = 1;
      for (const [r, v] of inputs) ratio = Math.min(ratio, Math.max(0, pool[r]) / (v * units * dt || 1));
      inputUnits[id] = units * ratio;
      for (const [r, v] of inputs) pool[r] = Math.max(0, pool[r] - v * inputUnits[id] * dt);
      continue;
    }
    let speed = units * calculateProductionMultiplier(Object.keys(out)[0] ?? '', happiness, state);
    if (id === 'catCafe') speed *= state.tech.includes('masterpieceCat') ? 1.2 : 1;
    if (id === 'cementWorkshop') speed *= 1 + boosts.mixerUnits * .05;
    if (b.boostResource) speed *= 1 + n * (id === 'lumber' || id === 'quarry' ? .02 : .05);
    if (b.minerBoost) speed *= 1 + (id === 'coalMine' ? boosts.coalMiningUnits : boosts.miningUnits) * .05;
    if (id === 'lumber' || id === 'quarry') speed *= 1 + (id === 'lumber' ? boosts.lumberUnits : boosts.quarryUnits) * .05;
    if (id === 'forage') { if (state.tech.includes('agriculturalMachinery')) speed *= 2; if (state.tech.includes('agriculture')) speed *= 1.5; }
    if (out.knowledge) speed *= calculateKnowledgeMultiplier(state, boosts.dataUnits, boosts.digital);
    if (id === 'lab') speed *= 1 + RESEARCH_SATELLITE_LAB_OUTPUT * (state.buildings.researchSatellite || 0);
    let ratio = 1;
    for (const [r, v] of inputs) ratio = Math.min(ratio, pool[r] / (v * units * dt || 1));
    ratio = Math.max(0, ratio); speed *= ratio; inputUnits[id] = units * ratio;
    for (const [r, v] of inputs) pool[r] = Math.max(0, pool[r] - v * inputUnits[id] * dt);
    for (const [r, v] of entries(out)) pool[r] += (b.workerOutput ? (calculateBuildingOutput(id, state)[r] || 0) * calculateToolMultiplier(id, state) : v) * speed * (r === 'aluminum' ? calculateAluminumMultiplier(state) : 1) * calculateGlobalOutputMultiplier(r, state) * dt;
    outputs[id] = speed;
  }
}
