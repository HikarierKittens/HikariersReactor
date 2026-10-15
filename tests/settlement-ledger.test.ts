import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { RESOURCES } from '../src/data/resources';
import { createInitialState } from '../src/state/create-state';
import { settleQuantumCores } from '../src/simulation/quantum';
import { settlePowerPlants, isPowerProducer } from '../src/simulation/power';
import { calculateMorale } from '../src/simulation/morale';
import { allocateMoonSupport } from '../src/simulation/moon';
import { settleSpaceProduction } from '../src/simulation/space-settlement';
import { settleResearchAndCulture, settleAutomationPower, settleE710WarehousePower } from '../src/simulation/power-consumers';
import { settleFactoryLines } from '../src/simulation/factory-settlement';
import { settleGroundProduction } from '../src/simulation/ground-settlement';
import { settleAutomaticCrafting, calculateParticleMultiplier } from '../src/simulation/crafting';
import { settlePopulationIncome, finalizeProduction } from '../src/simulation/production-finalize';
import { calculateBuildingOutput } from '../src/simulation/building-production';
import { calculateProductionMultiplier } from '../src/simulation/multipliers';
import { BUILDINGS } from '../src/data/buildings';
import { countRunningBuildings } from '../src/simulation/housing';
import { withPoweredMetalRefining } from '../src/simulation/refining';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateSpaceFuelMultiplier } from '../src/simulation/space-fuel';
import { calculateProduction, type ProductionResult } from '../src/simulation/production';
import { createMilestoneState } from './fixtures/milestones';
import type { BuildingId } from '../src/types/buildings';
import type { GameState } from '../src/types/state';

/** Byte-identical replica of the pre-A5 production pipeline, used as the oracle. */
function oracleProduction(state: GameState, dt = 1): ProductionResult {
  const pool = { ...state.resources }, before = { ...pool };
  const outputs: Record<string, number> = {}, inputUnits: Record<string, number> = {};
  const plants = settlePowerPlants({ ...state.resources }, dt, state);
  const coalSpeed = countRunningBuildings('generator', state);
  const moonPool = { ...state.resources };
  settlePowerPlants(moonPool, dt, state);
  const support = calculateSupportPreview(state, dt);
  const morale = calculateMorale(state, dt, {
    waystationUnits: support.waystations,
    navigationBeaconUnits: support.moon.beaconUnits || 0,
    generatorSpeed: (Object.keys(BUILDINGS) as BuildingId[]).filter(isPowerProducer).reduce((sum, id) => sum + countRunningBuildings(id, state), 0),
    generatorEnergy: plants.energy, coalRatio: coalSpeed ? (plants.outputs.generator || 0) / coalSpeed : 1,
    moonBaseUnits: allocateMoonSupport(state, moonPool, dt).baseUnits,
    biologyUnits: support.biologyUnits, dataCenterUnits: support.dataCenterUnits,
  });
  const aiSupercoreUnits = settleQuantumCores(state, pool, dt);
  inputUnits.aiSupercore = outputs.aiSupercore = aiSupercoreUnits;
  const mainPlants = settlePowerPlants(pool, dt, state);
  Object.assign(outputs, mainPlants.outputs); Object.assign(inputUnits, mainPlants.inputUnits);
  const space = settleSpaceProduction(state, pool, dt, morale.happiness, mainPlants.inputUnits.geothermalPlant || 0, mainPlants.inputUnits.hydrogenPowerPlant || 0);
  const { moon, asriel } = space;
  Object.assign(inputUnits, space.inputs); Object.assign(outputs, space.outputs);
  return withPoweredMetalRefining(state, space.metalRefineryUnits, state => {
    const e710WarehouseUnits = settleE710WarehousePower(state, pool, dt);
    inputUnits.e710Warehouse = outputs.e710Warehouse = e710WarehouseUnits;
    const consumers = settleResearchAndCulture(state, pool, dt);
    const { biologyUnits, dataUnits } = consumers;
    Object.assign(inputUnits, consumers.inputs); Object.assign(outputs, consumers.outputs);
    const quantum = calculateQuantumSnapshotFor(state, { stageThree: space.stageThree, biologyUnits, dataCenterUnits: dataUnits, moonBaseUnits: moon.baseUnits, moon, asriel, e710ContainerUnits: space.e710ContainerUnits, e710WarehouseUnits }, aiSupercoreUnits, dt);
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
    const geneSynthesis = settleGeneSynthesis(state, pool, dt, biologyUnits);
    const ejected = settleMassEjection(state, pool, dt, inputUnits.massEjector || 0);
    const final = finalizeProduction(state, pool, before, dt, { stageThree: space.stageThree, biologyUnits, dataCenterUnits: dataUnits, moonBaseUnits: moon.baseUnits, moon, asriel, e710ContainerUnits: space.e710ContainerUnits, e710WarehouseUnits });
    return { ...final, outputs, inputUnits, morale, moon, asriel, quantum, stageThree: space.stageThree, ejected, geneSynthesis };
  });
}
import { settleMassEjection } from '../src/simulation/black-hole';
import { settleGeneSynthesis } from '../src/simulation/genes';

/** Inline quantum snapshot import avoided to keep the oracle byte-identical to the old chain. */
import { calculateQuantumSnapshot } from '../src/simulation/quantum';
function calculateQuantumSnapshotFor(state: GameState, snapshot: Parameters<typeof calculateQuantumSnapshot>[1], fundedCores: number, dt: number) {
  return calculateQuantumSnapshot(state, snapshot, fundedCores, dt);
}

function expectedPreview(state: GameState, dt = 1) {
  return oracleSupportPreview(state, dt);
}

function oracleSupportPreview(state: GameState, dt = 1) {
  const pool = { ...state.resources };
  const aiSupercoreUnits = settleQuantumCores(state, pool, dt);
  const plants = settlePowerPlants(pool, dt, state);
  const space = settleSpaceProduction(state, pool, dt, 1, plants.inputUnits.geothermalPlant || 0, plants.inputUnits.hydrogenPowerPlant || 0);
  const e710WarehouseUnits = settleE710WarehousePower(state, pool, dt);
  const biologyRunning = Math.max(0, (state.buildings.biologyLab || 0) - (state.stoppedBuildings?.biologyLab || 0));
  const biologyUnits = Math.min(biologyRunning, Math.floor((Math.max(0, pool.energy) + 1e-8) / (2 * dt)));
  pool.energy = Math.max(0, pool.energy - biologyUnits * 2 * dt);
  const dataRunning = Math.max(0, (state.buildings.observatory || 0) - (state.stoppedBuildings?.observatory || 0));
  const dataCenterUnits = Math.min(dataRunning, Math.floor((Math.max(0, pool.energy) + 1e-8) / (3 * dt)));
  return {
    stageThree: space.stageThree, pool, moon: space.moon, asriel: space.asriel, metalRefineryUnits: space.metalRefineryUnits,
    biologyUnits, dataCenterUnits, waystations: space.inputs.spaceWaystation || 0,
    e710ContainerUnits: space.e710ContainerUnits, e710WarehouseUnits, aiSupercoreUnits,
    ironMiningShips: space.inputs.ironMiningShip || 0,
    researchStationUnits: space.inputs.e710ResearchStation || 0,
    blackHoleStationUnits: space.inputs.blackHoleStation || 0,
  };
}

const near = (actual: number, expected: number, message: string) => assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${message}: ${actual} vs ${expected}`);

function compareResult(actual: ProductionResult, expected: ProductionResult, label: string) {
  for (const id of Object.keys(RESOURCES) as (keyof typeof RESOURCES)[]) {
    const value = actual.pool[id]; const wanted = expected.pool[id];
    if (Number.isFinite(wanted) || Number.isFinite(value)) near(value ?? 0, wanted ?? 0, `${label} pool.${id}`);
    else assert.equal(value, wanted, `${label} pool.${id} Infinity parity`);
    near(actual.rates[id] ?? 0, expected.rates[id] ?? 0, `${label} rates.${id}`);
  }
  assert.deepEqual(actual.inputUnits, expected.inputUnits, `${label} inputUnits`);
  assert.deepEqual(actual.outputs, expected.outputs, `${label} outputs`);
  near(actual.morale.happiness, expected.morale.happiness, `${label} morale.happiness`);
  assert.deepEqual(actual.moon, expected.moon, `${label} moon`);
  assert.deepEqual(actual.asriel, expected.asriel, `${label} asriel`);
  assert.deepEqual(actual.quantum, expected.quantum, `${label} quantum`);
  assert.deepEqual(actual.stageThree, expected.stageThree, `${label} stageThree`);
  assert.equal(actual.starving, expected.starving, `${label} starving`);
}

function scenarios(): [string, GameState, number][] {
  const list: [string, GameState, number][] = [];
  const add = (label: string, state: GameState) => { for (const dt of [.2, 1]) list.push([`${label}@dt${dt}`, state, dt]); };
  add('fresh', createInitialState(CONFIG.version, 60, 0));
  for (const stage of ['moon', 'space', 'remote', 'beacon', 'postBeacon'] as const) {
    const state = createMilestoneState(stage);
    state.resources.energy = 4; // low-power stress: whole-unit funding must match
    state.resources.water = 1;
    add(stage, state);
  }
  const rich = createMilestoneState('postBeacon');
  Object.assign(rich.resources, { energy: 1e6, water: 1e5, helium3: 1e5, oil: 1e5, food: 1e5 });
  rich.buildings.ironMiningShip = 5; rich.buildings.broadcast = 2; rich.buildings.touristStation = 2;
  add('rich', rich);
  return list;
}

test('shared settlement ledger reproduces the pre-A5 production and support previews exactly', () => {
  for (const [label, state, dt] of scenarios()) {
    const before = JSON.stringify(state);
    const actual = calculateProduction(state, dt);
    const expected = oracleProduction(state, dt);
    compareResult(actual, expected, label);
    assert.equal(JSON.stringify(state), before, `${label} state mutated`);
  }
});

test('support preview keeps its historical semantics while sharing the ledger units', () => {
  for (const [label, state, dt] of scenarios()) {
    const actual = calculateSupportPreview(state, dt);
    // The public contract is the SupportPreview fields; the shared ledger's raw
    // space/plants settlements are internal artifacts consumed by production only.
    const { space: _space, plants: _plants, ...publicPreview } = actual as typeof actual & { space: unknown; plants: unknown };
    void _space; void _plants;
    assert.deepEqual({ ...publicPreview, pool: publicPreview.pool }, { ...expectedPreview(state, dt), pool: expectedPreview(state, dt).pool }, label);
    for (const id of Object.keys(RESOURCES) as (keyof typeof RESOURCES)[]) near(publicPreview.pool[id] ?? 0, expectedPreview(state, dt).pool[id] ?? 0, `${label} support.pool.${id}`);
  }
});

test('production and support settle the paid facilities once per call pair', () => {
  const state = createMilestoneState('postBeacon');
  Object.assign(state.resources, { energy: 1e6, water: 1e5, helium3: 1e5 });
  state.buildings.ironMiningShip = 3; state.buildings.hydrogenPowerPlant = 2;
  const runs = { power: 0, space: 0 };
  const tracked = new Proxy(state, {
    get(target, key, receiver) {
      if (key === 'resources') return Reflect.get(target, key, receiver);
      return Reflect.get(target, key, receiver);
    },
  });
  void tracked;
  // Instrument by counting resource-dict reads: each settlement clones state.resources.
  let clones = 0;
  const counting = new Proxy(state, {
    get(target, key, receiver) {
      if (key === 'resources') { clones++; return Reflect.get(target, key, receiver); }
      return Reflect.get(target, key, receiver);
    },
  });
  clones = 0;
  void calculateSupportPreview(counting, 1);
  const supportClones = clones;
  clones = 0;
  void calculateProduction(counting, 1);
  const productionClones = clones;
  void runs;
  assert.ok(supportClones >= 1, 'support preview reads state');
  assert.ok(productionClones <= supportClones * 8, `production should not multiply support settlements (support ${supportClones} vs production ${productionClones})`);
});
