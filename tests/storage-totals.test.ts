import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInitialState } from '../src/state/create-state';
import { CONFIG } from '../src/data/config';
import { RESOURCES } from '../src/data/resources';
import { calculateStorageDetails, calculateStorageTotals, type StorageSnapshot } from '../src/simulation/storage';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import type { GameState } from '../src/types/state';
import type { ResourceId } from '../src/types/economy';

const context = { now: 0, eventInterval: 60, housingCapacity: () => 1000, clampResources: () => {} };

function snapshotOf(state: GameState, units: Partial<StorageSnapshot> = {}): StorageSnapshot {
  const support = calculateSupportPreview(state);
  return { stageThree: support.stageThree, e710ContainerUnits: support.e710ContainerUnits, e710WarehouseUnits: support.e710WarehouseUnits,
    biologyUnits: support.biologyUnits, dataCenterUnits: support.dataCenterUnits, moonBaseUnits: support.moon.baseUnits,
    moon: support.moon, asriel: support.asriel, ...units };
}

function lateState(): GameState {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.tech = Object.keys(state.tech).length ? state.tech : state.tech;
  for (const tech of ['survival', 'tools', 'writing', 'mining', 'ironTools', 'metallurgy', 'science', 'electricity', 'automation', 'electronics',
    'dataCenter', 'artificialIntelligence', 'nuclearEnergy', 'rocketry', 'spaceflight', 'moonExploration', 'planetaryExploration',
    'fieldConstraintTheory', 'dualEndCoupling', 'finiteAperture', 'anomalyTopology', 'dimensionBeaconDeployment', 'accessPointBeacon',
    'hydrogenRecovery', 'icebreakingPlan', 'spaceBroadcasting', 'savingsBonds', 'stockTrading', 'internet', 'warehouseUpgrade',
    'dimensionCompression', 'iridiumAlloyWarehouse', 'iridiumSteelVault', 'vaultExpansion', 'steelSafe', 'intelligentStorage',
    'reinforcedContainers', 'neutronConstructionMaterials', 'carbonNanotubes', 'genetics', 'artificialIntelligenceII', 'quantumSwarm',
    'quantumManufacturing', 'swarmFactoryOptimization', 'exoticElementResearch', 'laser', 'helium3Storage', 'uraniumStorage'] as const) state.tech.push(tech);
  for (const [id, count] of Object.entries({
    warehouse: 4, storageHub: 2, hangar: 2, bank: 3, catCafe: 2, granary: 2, library: 2, school: 3, lab: 2, observatory: 2,
    biologyLab: 3, moonBase: 2, moonObservatory: 2, e710Container: 4, e710Warehouse: 2, fuelDepot: 2, orbitalFuelDepot: 1,
    galacticFuelDepot: 1, batteryStation: 5, anchorFreightStation: 2, civilianRouteStation: 1, hyperspaceSpaceport: 1,
    iceMiningShip: 1, asteroidBase: 2, alienMaterialLab: 2, ecologicalDome: 2, swarmControlStation: 1, researchSatellite: 2,
    container: 10, steelContainer: 4, talosMoonMiningStation: 1, spaceWaystation: 1, e710MiningShip: 2,
  })) state.buildings[id as keyof typeof state.buildings] = count;
  Object.assign(state.resources, { cash: 50, food: 10, wood: 5, stone: 5, fur: 3, copper: 4, iron: 4, aluminum: 3, cement: 3,
    coal: 3, oil: 3, metal: 3, titanium: 2, uranium: 2, alloy: 2, polymer: 2, iridium: 2, helium3: 2, neutron: 1, e710: 1,
    nanotubes: 1, water: 1 });
  state.containerAssignments.wood = 3;
  state.containerAssignments.copper = 2;
  state.containerAssignments.mithril = 0;
  state.arpaBuildings.stockExchange = 2;
  state.arpaBuildings.geneSequencing = 1;
  state.population = 25;
  state.prestige.casimir = 5;
  state.crispr.push('casimirEffect');
  return state;
}

test('batched storage totals match per-resource details exactly across milestones', () => {
  for (const build of [() => createInitialState(CONFIG.version, 60, 0), lateState]) {
    const state = build();
    const snapshot = snapshotOf(state);
    const totals = calculateStorageTotals(state, snapshot);
    for (const resource of Object.keys(RESOURCES) as ResourceId[]) {
      const details = calculateStorageDetails(resource, state, snapshot);
      assert.equal(totals[resource], details.total, `${resource} total mismatch`);
    }
  }
});

test('batched totals stay pure and crafted resources stay unlimited', () => {
  const state = lateState();
  const before = JSON.stringify(state);
  const snapshot = snapshotOf(state);
  const first = calculateStorageTotals(state, snapshot);
  const second = calculateStorageTotals(state, snapshot);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(second, first);
  for (const resource of Object.keys(RESOURCES) as ResourceId[]) {
    assert.equal(Number.isFinite(first[resource]), Number.isFinite(calculateStorageDetails(resource, state, snapshot).total), resource);
  }
});
