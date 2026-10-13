import { settleStageThreeSupport } from './stage-three-support';
import { settleMetalRefining, withPoweredMetalRefining } from './refining';
import { calculateE710ContainerUnits } from './e710-storage';
import { BUILDINGS } from '../data/buildings';
import { HYPERSPACE_SOURCE_IDS, HYPERSPACE_CONSUMER_IDS, calculateHyperspaceOutputFactor } from './hyperspace-output';
import { reserveWaystationPower, calculateSpaceFuelMultiplier } from './space-fuel';
import { calculateBuildingInput, calculateBuildingOutput } from './building-production';
import { allocateMoonSupport } from './moon';
import { allocateAsrielSupport, countAsrielResidents, calculateSpaceMultiplier } from './asriel';
import { calculateProductionMultiplier } from './multipliers';
import { calculateParticleMultiplier } from './crafting';
import type { ResourceAmounts, ResourceId } from '../types/economy';
import type { GameState } from '../types/state';

export function settleSpaceProduction(state: GameState, pool: ResourceAmounts, dt: number, happiness: number, geothermalUnits = 0, hydrogenUnits = 0) {
  const inputs: Record<string, number> = {}, outputs: Record<string, number> = {};
  const waystations = reserveWaystationPower(state, pool, dt);
  inputs.spaceWaystation = outputs.spaceWaystation = waystations;
  const fuelMultiplier = calculateSpaceFuelMultiplier(state, waystations);
  const moon = allocateMoonSupport(state, pool, dt, fuelMultiplier);
  pool.oil = Math.max(0, pool.oil - moon.baseUnits * (2 * fuelMultiplier) * dt);
  pool.energy = Math.max(0, pool.energy - (moon.baseUnits * 4 + (moon.beaconUnits || 0) * (calculateBuildingInput('navigationBeacon', state).energy || 2)) * dt);
  const asriel = allocateAsrielSupport(state, pool, dt, waystations, fuelMultiplier);
  for (const [id, value] of Object.entries({ ...BUILDINGS.asrielSpaceport.input, helium3: 2 * fuelMultiplier }) as [ResourceId, number][]) pool[id] = Math.max(0, pool[id] - value * asriel.ports * dt);
  inputs.asrielSpaceport = outputs.asrielSpaceport = asriel.ports;
  pool.energy = Math.max(0, pool.energy - asriel.towers * 2 * dt);
  inputs.asrielControlTower = outputs.asrielControlTower = asriel.towers;
  const stageThree = settleStageThreeSupport(state, pool, dt, hydrogenUnits);
  inputs.signalRepeater = outputs.signalRepeater = stageThree.repeaters;
  inputs.hyperspaceSpaceport = outputs.hyperspaceSpaceport = stageThree.ports;
  inputs.iceMiningShip = stageThree.iceShips;
  inputs.asteroidBase = outputs.asteroidBase = stageThree.asteroidBases;
  outputs.iceMiningShip = stageThree.iceShips * calculateHyperspaceOutputFactor('water', state, happiness, stageThree.ports);
  pool.water += (calculateBuildingOutput('iceMiningShip', state).water || 0) * outputs.iceMiningShip * calculateParticleMultiplier('water', state) * dt;
  inputs.constraintArray = outputs.constraintArray = stageThree.arrays;
  inputs.shortRangeRelay = outputs.shortRangeRelay = stageThree.relays;
  inputs.anchorFreightStation = outputs.anchorFreightStation = stageThree.freight;
  inputs.civilianRouteStation = outputs.civilianRouteStation = stageThree.civilian;
  asriel.capacity += stageThree.relays * 2;
  asriel.available += stageThree.relays * 2;
  for (const id of asriel.priority) {
    const extra = Math.min(Math.max(0, state.buildings[id] - (state.stoppedBuildings[id] || 0) - asriel.allocations[id]), asriel.available);
    asriel.allocations[id] += extra;
    asriel.available -= extra;
  }
  asriel.used = asriel.capacity - asriel.available;
  asriel.support = asriel.capacity;
  const metalRefineryUnits = settleMetalRefining(state, pool, dt);
  inputs.metalRefinery = outputs.metalRefinery = metalRefineryUnits;
  return withPoweredMetalRefining(state, metalRefineryUnits, state => {
  const residents = countAsrielResidents(state, asriel);
  inputs.asrielResidence = asriel.allocations.asrielResidence;
  inputs.planetaryFoundry = outputs.planetaryFoundry = asriel.allocations.planetaryFoundry;
  inputs.alienMaterialLab = outputs.alienMaterialLab = asriel.allocations.alienMaterialLab;
  for (const id of ['asrielMine', 'ecologicalDome'] as const) {
    const units = asriel.allocations[id] * residents;
    inputs[id] = asriel.allocations[id]; outputs[id] = units;
    const out = id === 'ecologicalDome' ? { food: .25 } : BUILDINGS[id].output!;
    for (const [resource, value] of Object.entries(out) as [ResourceId, number][]) pool[resource] = (pool[resource] || 0) + value * units * calculateProductionMultiplier(resource, happiness, state) * calculateParticleMultiplier(resource, state) * calculateSpaceMultiplier(id, state, asriel) * dt;
  }
  inputs.navigationBeacon = outputs.navigationBeacon = moon.beaconUnits || 0;
  inputs.moonBase = outputs.moonBase = moon.baseUnits;
  inputs.moonObservatory = moon.allocations.moonObservatory;
  for (const id of ['iridiumMine', 'helium3Mine'] as const) {
    const out = calculateBuildingOutput(id, state);
    inputs[id] = moon.allocations[id];
    outputs[id] = moon.allocations[id] * calculateProductionMultiplier(Object.keys(out)[0] ?? '', happiness, state)
      * (id === 'iridiumMine' ? 1 + .05 * geothermalUnits : 1);
    for (const [resource, value] of Object.entries(out) as [ResourceId, number][]) pool[resource] += value * outputs[id] * calculateParticleMultiplier(resource, state) * calculateSpaceMultiplier(id, state, asriel) * dt;
  }
  const e710ContainerUnits = calculateE710ContainerUnits(state, pool, dt, fuelMultiplier);
  inputs.e710Container = outputs.e710Container = e710ContainerUnits;
  pool.helium3 = Math.max(0, pool.helium3 - .5 * fuelMultiplier * e710ContainerUnits * dt);
  // Hyperspace facilities (710富集区 & stable zone) run on energy + helium/deuterium
  // inputs without asteroid support; outputs use ordinary multipliers like ice ships.
  // Funded hyperspace ports boost ordinary resources produced inside hyperspace +25%.
  for (const id of HYPERSPACE_SOURCE_IDS) {
    const running = Math.max(0, (state.buildings[id] || 0) - (state.stoppedBuildings[id] || 0));
    if (!running) continue;
    const recipe = Object.entries(BUILDINGS[id].input || {}) as [ResourceId, number][];
    let ratio = 1;
    for (const [resource, amount] of recipe) {
      ratio = Math.min(ratio, Math.max(0, pool[resource] || 0) / (amount * running * dt));
    }
    const actual = running * Math.max(0, ratio);
    inputs[id] = actual;
    for (const [resource, amount] of recipe) pool[resource] = Math.max(0, pool[resource] - amount * actual * dt);
    const out = BUILDINGS[id].output || {};
    // Multi-resource buildings expose funded units, not a sum of resource-local speeds.
    outputs[id] = actual;
    for (const [resource, amount] of Object.entries(out) as [ResourceId, number][]) {
      const speed = actual * calculateHyperspaceOutputFactor(resource, state, happiness, stageThree.ports);
      pool[resource] = (pool[resource] || 0)
        + amount * speed * calculateParticleMultiplier(resource, state) * calculateSpaceMultiplier(id, state, asriel) * dt;
    }
  }
  // Pure hyperspace consumers run after the sources so same-step deuterium is visible.
  for (const id of HYPERSPACE_CONSUMER_IDS) {
    const running = Math.max(0, (state.buildings[id] || 0) - (state.stoppedBuildings[id] || 0));
    if (!running) continue;
    const recipe = Object.entries(BUILDINGS[id].input || {}) as [ResourceId, number][];
    // Whole funded units only: the station's storage bonus must not flicker fractionally.
    let actual = running;
    for (const [resource, amount] of recipe) actual = Math.min(actual, Math.floor((Math.max(0, pool[resource] || 0) + 1e-8) / (amount * dt)));
    inputs[id] = outputs[id] = actual;
    for (const [resource, amount] of recipe) pool[resource] = Math.max(0, pool[resource] - amount * actual * dt);
  }
  // Outer-system sources do not consume lunar or Asriel support. Reserve their
  // maintenance from the same working pool and apply source-local ring bonuses.
  for (const id of ['atmosphericCollector', 'talosMoonMiningStation', 'iridiumMiningShip', 'ironMiningShip', 'e710MiningShip', 'oilExtractor'] as const) {
    const running = Math.max(0, (state.buildings[id] || 0) - (state.stoppedBuildings[id] || 0));
    if (!running) continue;
    const recipe = Object.fromEntries(Object.entries(BUILDINGS[id].input || {}).map(([resource, amount]) => [resource,
      resource === 'oil' || resource === 'helium3' ? amount * fuelMultiplier : amount]));
    let ratio = 1;
    for (const [resource, amount] of Object.entries(recipe) as [ResourceId, number][]) {
      ratio = Math.min(ratio, Math.max(0, pool[resource] || 0) / (amount * running * dt));
    }
    const actual = running * Math.max(0, ratio);
    inputs[id] = actual;
    const out = calculateBuildingOutput(id, state);
    const speed = actual * calculateProductionMultiplier(Object.keys(out)[0] ?? '', happiness, state);
    outputs[id] = speed;
    for (const [resource, amount] of Object.entries(recipe) as [ResourceId, number][]) pool[resource] = Math.max(0, pool[resource] - amount * actual * dt);
    for (const [resource, amount] of Object.entries(out) as [ResourceId, number][]) pool[resource] = (pool[resource] || 0)
      + amount * speed * calculateParticleMultiplier(resource, state) * calculateSpaceMultiplier(id, state, asriel) * dt;
  }
  return { inputs, outputs, moon, asriel, e710ContainerUnits, metalRefineryUnits, stageThree };
  });
}
