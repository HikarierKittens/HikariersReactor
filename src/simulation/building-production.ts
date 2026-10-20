import { calculateGravityConversionEnergy } from './black-hole';
import { BUILDINGS } from '../data/buildings';
import { CONFIG } from '../data/config';
import { applySpaceFuelDiscount } from './space-fuel';
import { calculateGeneOutputFactor } from './genes';
import { SPACE_RIPPER_OVERCLOCK_ENERGY } from './building-effects';
import type { BuildingId } from '../types/buildings';
import type { ResourceRecipe } from '../types/economy';
import type { GameState } from '../types/state';

export type ProductionInputs = Partial<Record<BuildingId, number>>;
/** Technology-dependent presentation retains stable building and save identifiers. */
export function calculateBuildingName(id: BuildingId, state: Pick<GameState, 'tech'>): string {
  return id === 'navigationBeacon' && state.tech.includes('spaceBroadcasting') ? '广播信标' : BUILDINGS[id].name;
}
export const TOOL_JOBS: readonly BuildingId[] = ['forage', 'lumber', 'quarry', 'mine'];
export function countUsedWorkers(state: Pick<GameState, 'workers'>): number { return Object.values(state.workers).reduce((a, b) => a + b, 0); }
export function calculateWorkerCapacity(id: BuildingId, state: Pick<GameState, 'buildings'> & Partial<GameState>): number {
  const building = BUILDINGS[id];
  if (id === 'theater') return (state.buildings.theater || 0) * (BUILDINGS.theater.artistSlots || 0) + (state.buildings.catCafe || 0) * (BUILDINGS.catCafe.artistSlots || 0);
  if (id === 'catCafe') return 0;
  if (id === 'foundry' || id === 'planetaryFoundry') {
    const planetary = state.buildings.planetaryFoundry || 0;
    // 恒星熔炉 adds two artisan positions each to the shared 工匠 job.
    return id === 'planetaryFoundry' ? planetary : (state.buildings.foundry || 0) * (BUILDINGS.foundry.slots || 2) + planetary + 2 * (state.buildings.stellarForge || 0);
  }
  return building.unlimited ? Infinity : state.buildings[id] * (building.slots ?? building.artistSlots ?? CONFIG.workersPerBuilding) + calculateGrantedJobSlots(id, state);
}
/** Buildings granting extra slots to another job (高科技工厂→水泥工人, 710研究站→科学家), per owned building. */
const JOB_SLOT_GRANTERS = (Object.keys(BUILDINGS) as BuildingId[]).filter(id => BUILDINGS[id].jobSlots);
export function calculateGrantedJobSlots(id: BuildingId, state: Pick<GameState, 'buildings'>): number {
  return JOB_SLOT_GRANTERS.reduce((sum, granter) => sum + (state.buildings[granter] || 0) * (BUILDINGS[granter].jobSlots?.[id] || 0), 0);
}
export function calculateToolMultiplier(id: BuildingId, state: Pick<GameState, 'tech'>): number {
  if (state.tech.includes('alloyDrill') && (id === 'quarry' || id === 'mine' || id === 'coalMine')) return 2;
  if (id === 'lumber' && state.tech.includes('alloyChainsaw')) return 2;
  if (id === 'coalMine') return state.tech.includes('steelTools') ? 1.5 : 1;
  return TOOL_JOBS.includes(id) ? state.tech.includes('steelTools') ? 1.5 : state.tech.includes('ironTools') ? 1.25 : 1 : 1;
}
/** Matches the legacy UI capability check, including object-identity automation rules. */
export function hasContinuousEnergyInput(id: BuildingId, state: Pick<GameState, 'tech'>): boolean {
  const building = BUILDINGS[id];
  if (id === 'metalRefinery') return state.tech.includes('advancedMetalRefining');
  // 实验室 becomes a power consumer once 电力 is researched.
  if (id === 'lab') return state.tech.includes('electricity');
  if (building.alwaysRunning) return false;
  if (building.moonSupport || building.support || building.toggleable) return true;
  if (id === 'mine' || id === 'coalMine' || id === 'lumber' || id === 'quarry') return state.tech.includes('automatedMining');
  if (id === 'cementWorkshop') return state.tech.includes('cementMixer');
  return !!(building.input && Object.keys(building.input).length);
}
export function calculateBuildingInput(id: BuildingId, state: GameState): ResourceRecipe {
  if (id === 'navigationBeacon') return { energy: state.tech.includes('spaceBroadcasting') ? 3 : 2 };
  if (id === 'metalRefinery') return state.tech.includes('advancedMetalRefining') ? { energy: 4 } : {};
  if (id === 'aiSupercore') return { helium3: 25, energy: 100 };
  if (id === 'agiAscensionCore') return { energy: Math.max(0, 10000 - 100 * Math.max(0, (state.buildings.coreCooler || 0) - (state.stoppedBuildings?.coreCooler || 0))) };
  if (id === 'refinery' && state.tech.includes('crudeOilRefiningOptimization')) return { energy: 2 };
  const input = BUILDINGS[id].input || {};
  return applySpaceFuelDiscount(id, input, state);
}
export function calculateTouristBase(state: GameState, inputs: ProductionInputs | null = null): number {
  const cafes = inputs ? inputs.catCafe || 0 : Math.max(0, (state.buildings.catCafe || 0) - (state.stoppedBuildings?.catCafe || 0));
  return 2 * (state.buildings.theater || 0) + 5 * cafes + 4 * (state.arpaBuildings?.monument || 0);
}
/** Per-unit base output, including run-scoped 基因修饰 base-output genes. */
export function calculateBuildingOutput(id: BuildingId, state: GameState, inputs: ProductionInputs | null = null): ResourceRecipe {
  const output = calculateRawBuildingOutput(id, state, inputs);
  const gene = calculateGeneOutputFactor(id, state);
  if (!gene || gene.factor === 1) return output;
  return Object.fromEntries(Object.entries(output).map(([resource, amount]) => [resource, amount * gene.factor]));
}
function calculateRawBuildingOutput(id: BuildingId, state: GameState, inputs: ProductionInputs | null): ResourceRecipe {
  if (id === 'iceMiningShip') return { water: state.tech.includes('icebreakingPlan') ? 1.25 : 1 };
  if (id === 'ecologicalDome') return { food: .25 };
  if (id === 'catCafe') return { cash: 5 + Math.floor(state.population / 10) * 5 };
  if (id === 'touristCenter') return { cash: calculateTouristBase(state, inputs) };
  const building = BUILDINGS[id], output = building.workerOutput || building.output || {};
  if (id === 'cementWorkshop' && state.tech.includes('silicateCement')) return { ...output, cement: (output.cement || 0) * 1.5 };
  if (id === 'smelter') return { ...output, metal: ((state.tech.includes('electrochemicalSmelting') ? 1 : output.metal || 0) + (state.tech.includes('quantumTunnelingThermalProcessing') ? .1 : 0)) * (state.tech.includes('oxygenConverter') ? 1.2 : 1) * (state.tech.includes('geothermalFurnace') ? 1.5 : 1) };
  if (state.tech.includes('plasmaMining')) {
    if (id === 'iridiumMiningShip') return { iridium: .15 };
    if (id === 'ironMiningShip') return { iron: 4 };
    if (id === 'e710MiningShip') return { e710: .012 };
  }
  if (state.tech.includes('asteroidMiningOptimization')) {
    if (id === 'iridiumMiningShip') return { iridium: .1 };
    if (id === 'ironMiningShip') return { iron: 3 };
  }
  if (id === 'talosMoonMiningStation') return { ...output, neutron: (output.neutron || 0) * (1 + .05 * (state.buildings.miningDrone || 0)) };
  if (id === 'helium3Mine' && state.tech.includes('helium3ExtractionOptimization')) return { ...output, helium3: .25 };
  if (id === 'fissionGenerator' && state.tech.includes('breederReactor')) return { energy: 20 };
  if (id === 'spaceRipper' && state.tech.includes('ripperOverclock')) return { energy: SPACE_RIPPER_OVERCLOCK_ENERGY };
  // 引力转化 is a whole-sphere bonus, spread over the built segments so every settlement path agrees.
  if (id === 'penroseSphere' && state.tech.includes('gravityConversion') && (state.buildings.penroseSphere || 0) > 0 && state.blackHole) {
    return { energy: (output.energy || 0) + calculateGravityConversionEnergy(state) / state.buildings.penroseSphere };
  }
  if (id === 'refinery' && state.tech.includes('crudeOilRefiningOptimization')) return { oil: 1.5 };
  if (id === 'quarry' && state.buildings.metalRefinery > 0) return { ...output, aluminum: 1 };
  if (id === 'coalMine' && state.tech.includes('nuclearEnergy')) return { ...output, uranium: (output.coal || 0) * .05 };
  return output;
}
