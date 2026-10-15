import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInitialState } from '../src/state/create-state';
import { CONFIG } from '../src/data/config';
import { createMilestoneState } from './fixtures/milestones';
import { TECHNOLOGIES } from '../src/data/technologies';
import { calculateStorageBonuses } from '../src/simulation/storage-bonuses';
import { calculateBuildingContainerCap, calculateBuildingAlloyContainerCap, calculateContainerCapacity, calculateAlloyContainerCapacity } from '../src/simulation/containers';
import { isTechnologyUnlocked } from '../src/simulation/unlocks';
import { validateAndMigrateSave } from '../src/state/validate-save';
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

test('battery concentration ring increases base energy and replaces station capacity', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  assert.equal(TECHNOLOGIES.batteryConcentrationRing.tier, 8);
  assert.deepEqual(TECHNOLOGIES.batteryConcentrationRing.cost, { knowledge: 42114.514 });
  assert.deepEqual(TECHNOLOGIES.batteryConcentrationRing.pre, ['electronics']);
  assert.equal(isTechnologyUnlocked('batteryConcentrationRing', state), false);
  state.tech.push('electronics');
  assert.equal(isTechnologyUnlocked('batteryConcentrationRing', state), true);
  const snapshot = snapshotOf(state);
  assert.equal(calculateStorageTotals(state, snapshot).energy, 10000);
  state.buildings.solarSatellite = 3;
  state.buildings.batteryStation = 2;
  assert.equal(calculateStorageTotals(state, snapshot).energy, 13500);
  state.tech.push('batteryConcentrationRing');
  const details = calculateStorageDetails('energy', state, snapshot);
  assert.equal(details.rows[0]?.value, 100000);
  assert.equal(details.total, 111500);
  assert.equal(calculateStorageTotals(state, snapshot).energy, details.total);
  assert.equal(calculateStorageBonuses('batteryStation', state, null).energy, 5000);
  assert.equal(calculateStorageBonuses('solarSatellite', state, null).energy, 500);
  const saved = createMilestoneState('space', { extraTech: ['batteryConcentrationRing'] });
  assert.ok(validateAndMigrateSave(JSON.parse(JSON.stringify(saved)), context).tech.includes('batteryConcentrationRing'));
});

function lateState(): GameState {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.tech = Object.keys(state.tech).length ? state.tech : state.tech;
  for (const tech of ['survival', 'tools', 'writing', 'mining', 'ironTools', 'metallurgy', 'science', 'electricity', 'automation', 'electronics',
    'dataCenter', 'artificialIntelligence', 'nuclearEnergy', 'rocketry', 'spaceflight', 'moonExploration', 'planetaryExploration',
    'fieldConstraintTheory', 'dimensionBeaconDeployment', 'accessPointBeacon',
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
  state.tech.push('superContainers');
  state.alloyContainers = 5;
  state.alloyContainerAssignments.wood = 2;
  state.alloyContainerAssignments.copper = 3;
  state.containerAssignments.mithril = 0;
  state.arpaBuildings.stockExchange = 2;
  state.arpaBuildings.geneSequencing = 1;
  state.population = 25;
  state.prestige.casimir = 5;
  state.crispr.push('casimirEffect');
  return state;
}

test('banking and neutron vault technologies use exact tiers, costs and sole prerequisites', () => {
  assert.equal(TECHNOLOGIES.intelligentBankingSystem.tier, 16);
  assert.deepEqual(TECHNOLOGIES.intelligentBankingSystem.cost, { knowledge: 410000, cash: 750000 });
  assert.deepEqual(TECHNOLOGIES.intelligentBankingSystem.pre, ['artificialIntelligenceII']);
  assert.equal(TECHNOLOGIES.neutronVault.tier, 14);
  assert.deepEqual(TECHNOLOGIES.neutronVault.cost, { knowledge: 245000, neutron: 2000 });
  assert.deepEqual(TECHNOLOGIES.neutronVault.pre, ['neutronConstructionMaterials']);
  const state = createInitialState(CONFIG.version, 60, 0);
  assert.equal(isTechnologyUnlocked('intelligentBankingSystem', state), false);
  assert.equal(isTechnologyUnlocked('neutronVault', state), false);
  state.tech.push('artificialIntelligenceII', 'neutronConstructionMaterials');
  assert.equal(isTechnologyUnlocked('intelligentBankingSystem', state), true);
  assert.equal(isTechnologyUnlocked('neutronVault', state), true);
});

test('neutron flat vault capacity precedes warehouse percentages and intelligent banking doubling', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.tech.push('neutronVault');
  assert.equal(calculateStorageBonuses('bank', state, null).cash, 3000);
  assert.equal(calculateStorageBonuses('catCafe', state, null).cash, 7000);
  state.tech.push('vaultExpansion', 'steelSafe', 'iridiumSteelVault', 'iridiumAlloyWarehouse');
  assert.equal(calculateStorageBonuses('bank', state, null).cash, 6000 * 1.2);
  assert.equal(calculateStorageBonuses('catCafe', state, null).cash, 9500 * 1.2);
  state.tech.push('intelligentBankingSystem');
  assert.equal(calculateStorageBonuses('bank', state, null).cash, 6000 * 1.2 * 2);
  assert.equal(calculateStorageBonuses('catCafe', state, null).cash, 9500 * 1.2 * 2);
});

test('intelligent banking replaces rather than stacks prior population cash bonuses', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.population = 10;
  state.tech.push('intelligentBankingSystem');
  const snapshot = snapshotOf(state);
  const first = calculateStorageDetails('cash', state, snapshot);
  assert.equal(first.rows.find(row => row.name === '智能化银行系统')?.value, 10000);
  state.tech.push('savingsBonds', 'stockTrading');
  assert.equal(calculateStorageDetails('cash', state, snapshot).total, first.total);
  state.arpaBuildings.stockExchange = 2;
  state.buildings.bank = 3; state.buildings.catCafe = 2;
  state.tech.push('neutronVault');
  const details = calculateStorageDetails('cash', state, snapshot);
  assert.equal(details.total, calculateStorageTotals(state, snapshot).cash);
});

test('neutron hangar capacity replaces ordinary and alloy caps without bypassing super containers', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.buildings.hangar = 2;
  assert.equal(calculateBuildingContainerCap('hangar', state), 30);
  state.tech.push('neutronVault');
  assert.equal(calculateBuildingContainerCap('hangar', state), 40);
  assert.equal(calculateContainerCapacity(state), 80);
  assert.equal(calculateBuildingAlloyContainerCap('hangar', state), 0);
  state.tech.push('superContainers');
  assert.equal(calculateBuildingAlloyContainerCap('hangar', state), 25);
  assert.equal(calculateAlloyContainerCapacity(state), 50);
  assert.equal(calculateBuildingContainerCap('containerWarehouse', state), 25);
  assert.equal(calculateBuildingAlloyContainerCap('containerWarehouse', state), 10);
});

test('new banking technology ids roundtrip current saves without a schema migration', () => {
  const raw = createMilestoneState('space', { extraTech: ['intelligentBankingSystem', 'neutronConstructionMaterials', 'neutronVault'] });
  const restored = validateAndMigrateSave(JSON.parse(JSON.stringify(raw)), context);
  assert.equal(restored.tech.includes('intelligentBankingSystem'), true);
  assert.equal(restored.tech.includes('neutronVault'), true);
  const invalid = JSON.parse(JSON.stringify(raw));
  invalid.tech = invalid.tech.filter((id: string) => id !== 'neutronConstructionMaterials');
  assert.throws(() => validateAndMigrateSave(invalid, context));
});

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
