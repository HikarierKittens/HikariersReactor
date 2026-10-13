import { BUILDINGS } from '../data/buildings';
import { HYPERSPACE_SOURCE_IDS, HYPERSPACE_CONSUMER_IDS, calculateHyperspaceOutputFactor } from './hyperspace-output';
import { settleSpaceProduction } from './space-settlement';
import { settleE710WarehousePower, settleResearchAndCulture } from './power-consumers';
import { calculatePoweredWaystations, calculateSpaceFuelMultiplier } from './space-fuel';
import { calculateBuildingInput, calculateBuildingOutput } from './building-production';
import { isPowerProducer } from './power';
import { calculateProductionMultiplier } from './multipliers';
import { calculateParticleMultiplier } from './crafting';
import { calculateSpaceMultiplier, countAsrielResidents } from './asriel';
import type { ResourceAmounts, ResourceId } from '../types/economy';
import type { BuildingId } from '../types/buildings';
import type { GameState } from '../types/state';
import type { SettlementLedger } from './support-preview';

export interface SettledPoolReplay {
  /** The production working pool after the ordered settlement replay. */
  pool: ResourceAmounts;
  inputUnits: Record<string, number>;
  outputs: Record<string, number>;
}

const charge = (pool: ResourceAmounts, resource: ResourceId, amount: number) => {
  pool[resource] = Math.max(0, pool[resource] - amount);
};
const credit = (pool: ResourceAmounts, resource: ResourceId, amount: number) => {
  pool[resource] = (pool[resource] || 0) + amount;
};

/**
 * Deterministic replay of the paid settlement using the ledger's unit counts.
 * Units are never re-derived here: the replay only moves resources in the same
 * order the historical sequential settlers did, so the pool trajectory matches
 * the old chain byte-for-byte while the units were derived exactly once.
 */
export function replaySettledPool(
  state: GameState,
  ledger: SettlementLedger,
  dt: number,
  happiness: number,
): SettledPoolReplay {
  const pool: ResourceAmounts = { ...state.resources };
  const inputUnits: Record<string, number> = {};
  const outputs: Record<string, number> = {};

  // 1. Quantum cores: helium reserved first (historical order).
  const aiSupercoreUnits = ledger.aiSupercoreUnits;
  pool.helium3 = Math.max(0, pool.helium3 - aiSupercoreUnits * 25 * dt);
  inputUnits.aiSupercore = outputs.aiSupercore = aiSupercoreUnits;

  // 2. Power plants: fuel debits and energy credits from the ledger units.
  //    The ledger ran the plants on its own scratch pool; unit decisions that
  //    read the pool (geothermal waystation discount, hydrogen water ratio) were
  //    derived there and are replayed as fixed counts. Fuel formulas are pure.
  //    plants.inputUnits and plants.outputs are the same counts, so only one
  //    merge happens here (double-adding would inflate ratio-driven units).
  for (const [id, actual] of Object.entries(ledger.plants.inputUnits)) {
    inputUnits[id] = actual || 0;
  }
  for (const [id, actual] of Object.entries(ledger.plants.outputs)) {
    outputs[id] = (outputs[id] || 0) + (actual || 0);
  }
  replayPlantDebits(state, ledger, dt, pool);

  // 3. Space chain debits (waystations, moon, asriel, stage three, containers,
  //    mining ships) replayed from the ledger units; outputs recomputed at the
  //    actual happiness exactly like the historical chain.
  // New sources can produce fuel for later facilities in the same timestep.
  // Their actual-happiness outputs change later allocation, so replaying a
  // happiness=1 ledger would grant unpaid units. Re-evaluate this narrow suffix.
  if (HYPERSPACE_SOURCE_IDS.some(id => state.buildings[id] > 0)) {
    const space = settleSpaceProduction(state, pool, dt, happiness, ledger.plants.inputUnits.geothermalPlant || 0, ledger.plants.inputUnits.hydrogenPowerPlant || 0);
    Object.assign(inputUnits, space.inputs); Object.assign(outputs, space.outputs);
    // Publish the actual allocation for production/storage consumers of this ledger.
    ledger.space = space;
    ledger.researchStationUnits = space.inputs.e710ResearchStation || 0;
    const warehouses = settleE710WarehousePower(state, pool, dt);
    ledger.e710WarehouseUnits = warehouses;
    inputUnits.e710Warehouse = outputs.e710Warehouse = warehouses;
    const consumers = settleResearchAndCulture(state, pool, dt);
    ledger.biologyUnits = consumers.biologyUnits; ledger.dataCenterUnits = consumers.dataUnits;
    Object.assign(inputUnits, consumers.inputs); Object.assign(outputs, consumers.outputs);
    return { pool, inputUnits, outputs };
  }
  const spaceInputs = ledger.space.inputs;
  for (const [id, count] of Object.entries(spaceInputs)) inputUnits[id] = (inputUnits[id] || 0) + (count || 0);
  const spaceOutputs = replaySpaceDebits(state, ledger, dt, pool, happiness, inputUnits);
  Object.assign(outputs, spaceOutputs);

  // 4. E-710 warehouse power: fixed 7 energy per funded unit.
  const e710WarehouseUnits = ledger.e710WarehouseUnits;
  pool.energy = Math.max(0, pool.energy - e710WarehouseUnits * 7 * dt);
  inputUnits.e710Warehouse = outputs.e710Warehouse = e710WarehouseUnits;

  // 5. Research and culture: biology/data floors plus continuous broadcast and
  //    touristStation ratios (the pool state here matches the historical chain).
  const biologyUnits = ledger.biologyUnits;
  pool.energy = Math.max(0, pool.energy - biologyUnits * 2 * dt);
  inputUnits.biologyLab = outputs.biologyLab = biologyUnits;
  const dataUnits = ledger.dataCenterUnits;
  pool.energy = Math.max(0, pool.energy - dataUnits * 3 * dt);
  inputUnits.observatory = outputs.observatory = dataUnits;
  for (const id of ['broadcast', 'touristStation'] as const) {
    const recipe = Object.entries(calculateBuildingInput(id, state)) as [ResourceId, number][];
    let actual = 0;
    const running = id === 'broadcast' ? state.buildings.broadcast || 0 : state.buildings.touristStation || 0;
    const stopped = id === 'broadcast'
      ? state.stoppedBuildings?.broadcast || 0
      : state.stoppedBuildings?.touristStation || 0;
    actual = Math.max(0, running - stopped);
    for (const [resource, amount] of recipe) actual = Math.min(actual, Math.max(0, pool[resource]) / (amount * dt));
    inputUnits[id] = outputs[id] = actual;
    for (const [resource, amount] of recipe) pool[resource] = Math.max(0, pool[resource] - amount * actual * dt);
  }

  return { pool, inputUnits, outputs };
}

/** Power-plant fuel debits/credits replayed from the ledger's captured units. */
function replayPlantDebits(state: GameState, ledger: SettlementLedger, dt: number, pool: ResourceAmounts) {
  const inputUnits: Record<string, number> = {};
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    if (!isPowerProducer(id)) continue;
    const actual = ledger.plants.inputUnits[id] || 0;
    if (!actual) continue;
    const recipe = id === 'geothermalPlant'
      ? { helium3: .5 * calculateSpaceFuelMultiplier(state, calculatePoweredWaystations(state, pool, dt)) }
      : calculateBuildingInput(id, state);
    for (const [resource, amount] of Object.entries(recipe) as [ResourceId, number][]) {
      if (amount > 0) charge(pool, resource, amount * actual * dt);
    }
    for (const [resource, amount] of Object.entries(calculateBuildingOutput(id, state)) as [ResourceId, number][]) {
      credit(pool, resource, amount * actual * dt);
    }
    inputUnits[id] = actual;
  }
  return inputUnits;
}

/** Space chain debits and happiness-scaled outputs replayed from ledger units. */
function replaySpaceDebits(
  state: GameState, ledger: SettlementLedger, dt: number,
  pool: ResourceAmounts, happiness: number, inputUnits: Record<string, number>,
): Record<string, number> {
  const outputs: Record<string, number> = {};
  const space = ledger.space;
  const spaceUnits = space.inputs;
  const waystations = spaceUnits.spaceWaystation || 0;
  const fuelMultiplier = Math.max(Number.MIN_VALUE, .95 ** waystations);
  const moon = space.moon, asriel = space.asriel, stageThree = space.stageThree;

  // Waystation power reservation.
  charge(pool, 'energy', waystations * 5 * dt);
  // Lunar base oil + power, beacon power.
  charge(pool, 'oil', moon.baseUnits * (2 * fuelMultiplier) * dt);
  charge(pool, 'energy', (moon.baseUnits * 4 + (moon.beaconUnits || 0) * (calculateBuildingInput('navigationBeacon', state).energy || 2)) * dt);
  // Asriel port helium/energy/food and tower energy.
  const asrielPortInput = { ...BUILDINGS.asrielSpaceport.input, helium3: 2 * fuelMultiplier } as Record<string, number>;
  for (const [id, value] of Object.entries(asrielPortInput) as [ResourceId, number][]) charge(pool, id, value * asriel.ports * dt);
  charge(pool, 'energy', asriel.towers * 2 * dt);
  // Stage three maintenance energy/e710: arrays, relays, freight, civilian,
  // repeaters, ports, ice ships, asteroid bases — each funded in the ledger.
  // Read maintenance from the registry so future balance updates cannot leave
  // the replay charging an obsolete literal while the allocator uses new data.
  const stageFacilities: [BuildingId, number][] = [
    ['constraintArray', stageThree.arrays], ['signalRepeater', stageThree.repeaters],
    ['hyperspaceSpaceport', stageThree.ports], ['shortRangeRelay', stageThree.relays],
    ['anchorFreightStation', stageThree.freight], ['civilianRouteStation', stageThree.civilian],
    ['iceMiningShip', stageThree.iceShips], ['asteroidBase', stageThree.asteroidBases],
  ];
  for (const [id, units] of stageFacilities) {
    for (const [resource, amount] of Object.entries(BUILDINGS[id].input || {}) as [ResourceId, number][]) charge(pool, resource, units * amount * dt);
  }
  // Metal refinery power.
  charge(pool, 'energy', space.metalRefineryUnits * 4 * dt);

  // E-710 containers: helium upkeep at the discounted rate.
  const e710ContainerUnits = spaceUnits.e710Container || 0;
  charge(pool, 'helium3', .5 * fuelMultiplier * e710ContainerUnits * dt);

  // Hyperspace facilities (710富集区 & stable zone): fixed funded units with
  // per-building input charge then output credit, exactly like the historical
  // loop so later consumers see earlier producers (e.g. gas-ship deuterium).
  for (const id of HYPERSPACE_SOURCE_IDS) {
    const actual = spaceUnits[id] || 0;
    if (!actual) continue;
    for (const [resource, amount] of Object.entries(BUILDINGS[id].input || {}) as [ResourceId, number][]) {
      charge(pool, resource, amount * actual * dt);
    }
    for (const [resource, amount] of Object.entries(BUILDINGS[id].output || {}) as [ResourceId, number][]) {
      const speed = actual * calculateHyperspaceOutputFactor(resource, state, happiness, stageThree.ports);
      outputs[id] = actual;
      credit(pool, resource, amount * speed * calculateParticleMultiplier(resource, state) * calculateSpaceMultiplier(id, state, asriel) * dt);
    }
  }

  // Pure hyperspace consumers (710研究站): maintenance only.
  for (const id of HYPERSPACE_CONSUMER_IDS) {
    const actual = spaceUnits[id] || 0;
    if (!actual) continue;
    outputs[id] = actual;
    for (const [resource, amount] of Object.entries(BUILDINGS[id].input || {}) as [ResourceId, number][]) charge(pool, resource, amount * actual * dt);
  }

  // Outer-system mining ships: ratio-derived units replayed as fixed counts.
  for (const id of ['atmosphericCollector', 'talosMoonMiningStation', 'iridiumMiningShip', 'ironMiningShip', 'e710MiningShip', 'oilExtractor'] as const) {
    const actual = spaceUnits[id] || 0;
    if (!actual) continue;
    const recipe = Object.fromEntries(Object.entries(BUILDINGS[id].input || {}).map(([resource, amount]) => [resource,
      resource === 'oil' || resource === 'helium3' ? amount * fuelMultiplier : amount]));
    for (const [resource, amount] of Object.entries(recipe) as [ResourceId, number][]) {
      charge(pool, resource, amount * actual * dt);
    }
  }

  // Outputs at the actual happiness, credited exactly like the historical chain.
  outputs.iceMiningShip = stageThree.iceShips * calculateHyperspaceOutputFactor('water', state, happiness, stageThree.ports);
  credit(pool, 'water', (calculateBuildingOutput('iceMiningShip', state).water || 0) * outputs.iceMiningShip * calculateParticleMultiplier('water', state) * dt);
  outputs.asrielSpaceport = asriel.ports;
  outputs.asrielControlTower = asriel.towers;
  outputs.signalRepeater = stageThree.repeaters;
  outputs.hyperspaceSpaceport = stageThree.ports;
  outputs.constraintArray = stageThree.arrays;
  outputs.shortRangeRelay = stageThree.relays;
  outputs.anchorFreightStation = stageThree.freight;
  outputs.civilianRouteStation = stageThree.civilian;
  outputs.asteroidBase = stageThree.asteroidBases;
  outputs.metalRefinery = space.metalRefineryUnits;
  outputs.e710Container = e710ContainerUnits;
  outputs.navigationBeacon = moon.beaconUnits || 0;
  outputs.moonBase = moon.baseUnits;
  outputs.spaceWaystation = waystations;
  inputUnits.asrielResidence = asriel.allocations.asrielResidence;
  outputs.planetaryFoundry = asriel.allocations.planetaryFoundry;
  outputs.alienMaterialLab = asriel.allocations.alienMaterialLab;
  for (const id of ['asrielMine', 'ecologicalDome'] as const) {
    const units = asriel.allocations[id] * countAsrielResidents(state, asriel);
    inputUnits[id] = asriel.allocations[id];
    outputs[id] = units;
    const out = id === 'ecologicalDome' ? { food: .25 } : BUILDINGS[id].output!;
    for (const [resource, value] of Object.entries(out) as [ResourceId, number][]) {
      credit(pool, resource, value * units * calculateProductionMultiplier(resource, happiness, state) * calculateParticleMultiplier(resource, state) * calculateSpaceMultiplier(id, state, asriel) * dt);
    }
  }
  for (const id of ['iridiumMine', 'helium3Mine'] as const) {
    const out = calculateBuildingOutput(id, state);
    const units = moon.allocations[id];
    inputUnits[id] = units;
    outputs[id] = units * calculateProductionMultiplier(Object.keys(out)[0] ?? '', happiness, state)
      * (id === 'iridiumMine' ? 1 + .05 * (ledger.plants.inputUnits.geothermalPlant || 0) : 1);
    for (const [resource, value] of Object.entries(out) as [ResourceId, number][]) {
      credit(pool, resource, value * outputs[id] * calculateParticleMultiplier(resource, state) * calculateSpaceMultiplier(id, state, asriel) * dt);
    }
  }
  for (const id of ['atmosphericCollector', 'talosMoonMiningStation', 'iridiumMiningShip', 'ironMiningShip', 'e710MiningShip', 'oilExtractor'] as const) {
    const actual = spaceUnits[id] || 0;
    if (!actual) continue;
    const out = calculateBuildingOutput(id, state);
    const speed = actual * calculateProductionMultiplier(Object.keys(out)[0] ?? '', happiness, state);
    outputs[id] = speed;
    for (const [resource, amount] of Object.entries(out) as [ResourceId, number][]) {
      credit(pool, resource, amount * speed * calculateParticleMultiplier(resource, state) * calculateSpaceMultiplier(id, state, asriel) * dt);
    }
  }
  return outputs;
}
