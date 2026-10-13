import { withPoweredMetalRefining } from './refining';
import { settlePowerPlants } from './power';
import { calculateQuantumSnapshot } from './quantum';
import { calculateSpaceFuelMultiplier } from './space-fuel';
import { calculateMorale } from './morale';
import { allocateMoonSupport } from './moon';
import { settleAutomationPower } from './power-consumers';
import { settleFactoryLines } from './factory-settlement';
import { settleGroundProduction } from './ground-settlement';
import { settleAutomaticCrafting, calculateParticleMultiplier } from './crafting';
import { settlePopulationIncome, finalizeProduction } from './production-finalize';
import { calculateBuildingOutput } from './building-production';
import { calculateProductionMultiplier } from './multipliers';
import { BUILDINGS } from '../data/buildings';
import { isPowerProducer } from './power';
import { countRunningBuildings } from './housing';
import { buildSettlementLedger } from './support-preview';
import { replaySettledPool } from './pool-replay';
import type { BuildingId } from '../types/buildings';
import type { GameState } from '../types/state';

export function previewMorale(state: GameState, dt = 1) {
  const plants = settlePowerPlants({ ...state.resources }, dt, state);
  const coalSpeed = countRunningBuildings('generator', state);
  const moonPool = { ...state.resources };
  settlePowerPlants(moonPool, dt, state);
  const support = buildSettlementLedger(state, dt);
  return calculateMorale(state, dt, {
    waystationUnits: support.waystations,
    navigationBeaconUnits: support.moon.beaconUnits || 0,
    vrCenterUnits: support.asriel.allocations.vrCenter || 0,
    generatorSpeed: (Object.keys(BUILDINGS) as BuildingId[]).filter(isPowerProducer).reduce((sum, id) => sum + countRunningBuildings(id, state), 0),
    generatorEnergy: plants.energy, coalRatio: coalSpeed ? (plants.outputs.generator || 0) / coalSpeed : 1,
    moonBaseUnits: allocateMoonSupport(state, moonPool, dt).baseUnits,
    biologyUnits: support.biologyUnits, dataCenterUnits: support.dataCenterUnits,
  });
}

/**
 * THE shared paid settlement per (state, dt): quantum cores, power plants,
 * waystations, lunar/Asriel/stage-three maintenance, e710 warehouse and research
 * units are derived once in support-preview's `buildSettlementLedger`.
 *
 * A5 phase 2: production consumes the ledger units through `replaySettledPool`
 * (`src/simulation/pool-replay.ts`), which moves resources in the exact order
 * the historical sequential settlers did while re-deriving nothing. The pool
 * that factory/automation/ground mutate in place afterwards is byte-identical
 * to the pre-A5 chain (proven by the oracle in tests/settlement-ledger.test.ts
 * and the replay tests in tests/pool-replay.test.ts). The morale preview keeps
 * its historical two-pool structure and its own support inputs.
 */
export function calculateProduction(state: GameState, dt = 1) {
  const morale = previewMorale(state, dt);
  const ledger = buildSettlementLedger(state, dt);
  const replay = replaySettledPool(state, ledger, dt, morale.happiness);
  const pool = replay.pool, before = { ...state.resources };
  const outputs = replay.outputs, inputUnits = replay.inputUnits;
  const space = ledger.space;
  const { moon, asriel } = space;
  const aiSupercoreUnits = ledger.aiSupercoreUnits;
  const e710WarehouseUnits = ledger.e710WarehouseUnits;
  const biologyUnits = ledger.biologyUnits, dataUnits = ledger.dataCenterUnits;
  return withPoweredMetalRefining(state, space.metalRefineryUnits, state => {
    const quantum = calculateQuantumSnapshot(state, { stageThree: space.stageThree, biologyUnits, dataCenterUnits: dataUnits, moonBaseUnits: moon.baseUnits, moon, asriel, e710ContainerUnits: space.e710ContainerUnits, e710WarehouseUnits, researchStationUnits: ledger.researchStationUnits, blackHoleStationUnits: ledger.blackHoleStationUnits }, aiSupercoreUnits);
    const factory = settleFactoryLines(state, pool, dt, morale.happiness, asriel, calculateSpaceFuelMultiplier(state, inputUnits.spaceWaystation || 0), quantum.level);
    Object.assign(inputUnits, factory.inputs); Object.assign(outputs, factory.outputs);
    const automation = settleAutomationPower(state, pool, dt);
    Object.assign(inputUnits, automation.inputs);
    settleGroundProduction(state, pool, dt, morale.happiness, inputUnits, outputs, { ...automation, dataUnits });
    if (state.tech.includes('titaniumSmelting')) {
      const titanium = (calculateBuildingOutput('smelter', state).metal || 0) * .1 * (inputUnits.smelter || 0) * calculateProductionMultiplier('titanium', morale.happiness, state) * calculateParticleMultiplier('titanium', state);
      pool.titanium += titanium * dt; outputs.titaniumByproduct = titanium;
    }
    const crafting = settleAutomaticCrafting(state, pool, dt, asriel);
    Object.assign(inputUnits, crafting.inputs); Object.assign(outputs, crafting.outputs);
    Object.assign(outputs, settlePopulationIncome(state, pool, morale.happiness, dt));
    const final = finalizeProduction(state, pool, before, dt, { stageThree: space.stageThree, biologyUnits, dataCenterUnits: dataUnits, moonBaseUnits: moon.baseUnits, moon, asriel, e710ContainerUnits: space.e710ContainerUnits, e710WarehouseUnits, researchStationUnits: ledger.researchStationUnits, blackHoleStationUnits: ledger.blackHoleStationUnits });
    return { ...final, outputs, inputUnits, morale, moon, asriel, quantum, stageThree: space.stageThree };
  });
}
export type ProductionResult = ReturnType<typeof calculateProduction>;
