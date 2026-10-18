import { withPoweredMetalRefining } from './refining';
import { createDigitalProductionPool } from './digital-world';
import { calculatePowerBudget } from './power';
import { calculateQuantumSnapshot } from './quantum';
import { calculateSpaceFuelMultiplier } from './space-fuel';
import { calculateMorale } from './morale';
import { HYPERSPACE_SOURCE_IDS } from './hyperspace-output';
import { settleAutomationPower } from './power-consumers';
import { settleFactoryLines } from './factory-settlement';
import { settleGroundProduction } from './ground-settlement';
import { settleAutomaticCrafting, calculateGlobalOutputMultiplier } from './crafting';
import { settlePopulationIncome, finalizeProduction } from './production-finalize';
import { calculateBuildingOutput } from './building-production';
import { calculateProductionMultiplier } from './multipliers';
import { BUILDINGS } from '../data/buildings';
import { isPowerProducer } from './power';
import { countRunningBuildings } from './housing';
import { buildSettlementLedger } from './support-preview';
import { replaySettledPool } from './pool-replay';
import { settleMassEjection } from './black-hole';
import { settleGeneSynthesis } from './genes';
import type { BuildingId } from '../types/buildings';
import type { GameState } from '../types/state';

export function previewMorale(state: GameState, dt = 1) {
  const support = buildSettlementLedger(state, dt);
  const plants = support.plants;
  const coalSpeed = countRunningBuildings('generator', state);
  const derive = (happiness: number) => {
    const paid = replaySettledPool(state, support, dt, happiness, createDigitalProductionPool(state, support.digital, dt).pool).inputUnits;
    return calculateMorale(state, dt, {
      broadcastUnits: paid.broadcast || 0,
      touristStationUnits: paid.touristStation || 0,
      waystationUnits: support.waystations,
      navigationBeaconUnits: support.moon.beaconUnits || 0,
      vrCenterUnits: support.asriel.allocations.vrCenter || 0,
      digital: support.digital,
      generatorSpeed: (Object.keys(BUILDINGS) as BuildingId[]).filter(isPowerProducer).reduce((sum, id) => sum + countRunningBuildings(id, state), 0),
      generatorEnergy: plants.energy, coalRatio: coalSpeed ? (plants.outputs.generator || 0) / coalSpeed : 1,
      moonBaseUnits: support.space.moon.baseUnits,
      biologyUnits: support.biologyUnits, dataCenterUnits: support.dataCenterUnits,
    });
  };
  let morale = derive(state.happiness);
  // Only hyperspace sources can make later culture fuel happiness-sensitive.
  // Iterate this narrow, bounded preview to the same paid allocation production uses.
  if ((countRunningBuildings('broadcast', state) > 0 || countRunningBuildings('touristStation', state) > 0)
    && HYPERSPACE_SOURCE_IDS.some(id => state.buildings[id] > 0)) {
    for (let i = 0; i < 32; i++) {
      const next = derive(morale.happiness);
      const converged = Math.abs(next.happiness - morale.happiness) < 1e-10;
      morale = next;
      if (converged) break;
    }
  }
  return morale;
}

/**
 * Shared fixed-power settlement: generate fresh supply, reserve AI cores first,
 * then digital, space, storage and research maintenance in established order.
 * Replay consumes the paid ledger units before factory/automation/ground work.
 * Only non-energy resources survive finalization; result.power exposes fixed
 * generated/used/available rates and rates.energy mirrors available power.
 */
export function calculateProduction(state: GameState, dt = 1) {
  const morale = previewMorale(state, dt);
  const ledger = buildSettlementLedger(state, dt);
  const digitalProduction = createDigitalProductionPool(state, ledger.digital, dt, morale.happiness);
  const replay = replaySettledPool(state, ledger, dt, morale.happiness, digitalProduction.pool);
  const pool = replay.pool, before = { ...state.resources };
  const outputs = replay.outputs, inputUnits = replay.inputUnits;
  const space = ledger.space;
  const { moon, asriel } = space;
  const aiSupercoreUnits = ledger.aiSupercoreUnits;
  const e710WarehouseUnits = ledger.e710WarehouseUnits;
  const biologyUnits = ledger.biologyUnits, dataUnits = ledger.dataCenterUnits;
  return withPoweredMetalRefining(state, space.metalRefineryUnits, state => {
    const quantum = calculateQuantumSnapshot(state, { digital: ledger.digital, stageThree: space.stageThree, biologyUnits, dataCenterUnits: dataUnits, moonBaseUnits: moon.baseUnits, moon, asriel, e710ContainerUnits: space.e710ContainerUnits, e710WarehouseUnits, researchStationUnits: ledger.researchStationUnits, blackHoleStationUnits: ledger.blackHoleStationUnits }, aiSupercoreUnits);
    const factory = settleFactoryLines(state, pool, dt, morale.happiness, asriel, calculateSpaceFuelMultiplier(state, inputUnits.spaceWaystation || 0), quantum.level);
    Object.assign(inputUnits, factory.inputs); Object.assign(outputs, factory.outputs);
    const automation = settleAutomationPower(state, pool, dt);
    Object.assign(inputUnits, automation.inputs);
    settleGroundProduction(state, pool, dt, morale.happiness, inputUnits, outputs, { ...automation, dataUnits, digital: ledger.digital });
    if (state.tech.includes('titaniumSmelting')) {
      const titanium = (calculateBuildingOutput('smelter', state).metal || 0) * .1 * (inputUnits.smelter || 0) * calculateProductionMultiplier('titanium', morale.happiness, state) * calculateGlobalOutputMultiplier('titanium', state);
      pool.titanium += titanium * dt; outputs.titaniumByproduct = titanium;
    }
    const crafting = settleAutomaticCrafting(state, pool, dt, asriel);
    Object.assign(inputUnits, crafting.inputs); Object.assign(outputs, crafting.outputs);
    Object.assign(outputs, settlePopulationIncome(state, pool, morale.happiness, dt));
    // 基因合成: powered labs convert same-step knowledge into DNA after every knowledge producer.
    const geneSynthesis = settleGeneSynthesis(state, pool, dt, biologyUnits);
    // 质量喷射: withdraw after every producer so same-step output can be ejected.
    const ejected = settleMassEjection(state, pool, dt, inputUnits.massEjector || 0);
    const power = calculatePowerBudget(ledger.plants.energy, pool.energy, dt);
    const final = finalizeProduction(state, pool, before, dt, { digital: ledger.digital, stageThree: space.stageThree, biologyUnits, dataCenterUnits: dataUnits, moonBaseUnits: moon.baseUnits, moon, asriel, e710ContainerUnits: space.e710ContainerUnits, e710WarehouseUnits, researchStationUnits: ledger.researchStationUnits, blackHoleStationUnits: ledger.blackHoleStationUnits });
    return { ...final, power, digital: digitalProduction.result(), outputs, inputUnits, morale, moon, asriel, quantum, stageThree: space.stageThree, ejected, geneSynthesis };
  });
}
export type ProductionResult = ReturnType<typeof calculateProduction>;
