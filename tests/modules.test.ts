import assert from 'node:assert/strict';

test('ARPA institute description updates only after the dimension compression technology', () => {
  const before = calculateProjectDescription('arpaResearchInstitute', { tech: [] });
  assert.ok(before.includes('实验室和学校的知识容量+4%'));
  assert.ok(!before.includes('格纳库'));
  const after = calculateProjectDescription('arpaResearchInstitute', { tech: ['dimensionCompression'] });
  assert.ok(after.includes(before));
  assert.ok(after.includes('仓库、高级存储枢纽和格纳库的资源容量+4%'));
  assert.equal(calculateProjectDescription('rocketPlatform', { tech: [] }), calculateProjectDescription('rocketPlatform', { tech: ['dimensionCompression'] }));
});
import { orderedCostEntries } from '../src/vue/format';
import { test } from 'node:test';
import { calculateBuildingOutput, calculateWorkerCapacity, hasContinuousEnergyInput } from '../src/simulation/building-production';
import { calculateArtistEffect, calculateMorale } from '../src/simulation/morale';
import { changeWorkerAssignment, changeContainerAssignment } from '../src/simulation/commands';
import { isContainerAssignable, countAssignedContainers } from '../src/simulation/containers';
import { validateStorageAssignments } from '../src/state/validation';
import { persistGame } from '../src/state/persistence';
import { enqueueProject, advanceProjectQueue } from '../src/simulation/project-queue';
import { calculateProjectDescription, investInProject, calculateProjectCost } from '../src/simulation/projects';
import { calculateStorageDetails } from '../src/simulation/storage';
import {
  buyBuildingNow, buyBuildingsInBatch, describeQueuedPurchases, isPurchaseAllowed,
  removeQueuedPurchase, requestPurchaseModule as requestPurchase, researchTechnologyNow, settlePurchaseQueue,
} from '../src/simulation/purchases';
import { calculateEffectiveParticles, calculateParticleMultiplier, changeCraftAssignment } from '../src/simulation/crafting';
import { calculateNuclearAffordablePercent, fillNuclearProject, launchNuclearPrestige, resetRunState } from '../src/simulation/prestige';

import { estimateResourceWait, estimateQueueTimes } from '../src/vue/queue-estimates';
import { BUILDINGS, BUILDING_GROUPS } from '../src/data/buildings';
import type { BuildingId } from '../src/types/buildings';
import { isBuildingUnderworking } from '../src/vue/building-status';
import { calculateResourceFactorRows, calculateResourceBreakdown } from '../src/simulation/resource-breakdown';
import { completeKerberosMission } from '../src/simulation/commands';
import { calculateContainerUnitCapacity } from '../src/simulation/containers';
import { calculateCraftingMultiplier } from '../src/simulation/crafting';
import { calculateSoldierCapacity } from '../src/simulation/government';
import { isBuildingUnlocked, isTechnologyUnlocked } from '../src/simulation/unlocks';

test('iridium alloy warehouse doubles targeted base storage and adds bank cash percentage', () => {
  const s = createInitialState(29, 60, 0);
  assert.equal(isTechnologyUnlocked('iridiumAlloyWarehouse', s), false);
  s.tech.push('moonExploration');
  assert.equal(isTechnologyUnlocked('iridiumAlloyWarehouse', s), true);
  assert.equal(TECHNOLOGIES.iridiumAlloyWarehouse.tier, 13);
  assert.deepEqual(TECHNOLOGIES.iridiumAlloyWarehouse.cost, { knowledge: 220000, alloy: 2000, iridium: 2000 });
  s.buildings.talosMoonMiningStation = 1;
  const bases = ['warehouse','storageHub','hangar','fuelDepot'] as const;
  const original = bases.map(id => calculateStorageBonuses(id, s, null));
  s.tech.push('iridiumAlloyWarehouse');
  bases.forEach((id, index) => { const baseline = original[index]; assert.ok(baseline); for (const [r, n] of Object.entries(baseline)) assert.equal(calculateStorageBonuses(id, s, null)[r as keyof typeof baseline], n * (id === 'fuelDepot' ? 1 : 2)); });
  // Bank base 1000 + iridium alloy 20%: flat vault additions apply before the percentage.
  assert.equal(calculateStorageBonuses('bank', s, null).cash, 1200);
  assert.equal(calculateStorageBonuses('catCafe', s, null).cash, 4800);
  s.tech.push('vaultExpansion', 'steelSafe', 'iridiumSteelVault', 'dimensionCompression');
  s.arpaBuildings.arpaResearchInstitute = 2;
  // Bank base 1000+1500+750+750=4000, then iridium alloy +20% => 4800.
  assert.equal(calculateStorageBonuses('bank', s, null).cash, 4800);
  // CatCafe base 4000+2500=6500, then iridium alloy +20% => 7800.
  assert.equal(calculateStorageBonuses('catCafe', s, null).cash, 7800);
  assert.equal(calculateStorageBonuses('hangar', s, null).neutron, 8640);
});

test('research satellite adds escalating knowledge price and price lists prioritize cash then knowledge', () => {
  const s = createInitialState(29, 60, 0);
  assert.equal(calculateBuildingCost('researchSatellite', 0, s).knowledge, 25000);
  // Satellite uses its raw 1.2 registry scale (no global +0.01).
  assert.equal(calculateBuildingCost('researchSatellite', 1, s).knowledge, 30000);
  assert.deepEqual(orderedCostEntries({ iron: 5, knowledge: 8, copper: 2, cash: 1 }).map(([id]) => id), ['cash', 'knowledge', 'iron', 'copper']);
  assert.deepEqual(orderedCostEntries({ iron: 5, knowledge: 8 }).map(([id]) => id), ['knowledge', 'iron']);
});

test('tourist stations scale at 1.18 and require both energy and discounted oil maintenance', () => {
  const s = createInitialState(29, 60, 0);
  s.buildings.touristStation = 1; s.resources.energy = 10; s.resources.oil = 1;
  assert.deepEqual(BUILDINGS.touristStation.costScales, { metal: 1.18, alloy: 1.18, oil: 1.18, cash: 1.18 });
  let p = calculateProduction(s);
  assert.equal(p.inputUnits.touristStation, 1);
  assert.equal(p.rates.oil, -.5);
  assert.equal(p.rates.energy, -5);
  s.resources.oil = 0; p = calculateProduction(s);
  assert.equal(p.inputUnits.touristStation, 0);
  assert.equal(p.morale.station, 0);
  s.resources.oil = 1; s.buildings.spaceWaystation = 1;
  p = calculateProduction(s);
  assert.ok(Math.abs(p.rates.oil + .475) < 1e-8);
});

test('particle accelerators require nuclear prestige and add percentage points to both production bonuses', () => {
  const s = createInitialState(29, 60, 0); s.tech.push('science');
  assert.equal(isTechnologyUnlocked('particleAccelerator', s), false);
  s.prestige.softResets = 10;
  assert.equal(isTechnologyUnlocked('particleAccelerator', s), false);
  s.prestige.nuclearResets = 1;
  assert.equal(isTechnologyUnlocked('particleAccelerator', s), true);
  assert.deepEqual(TECHNOLOGIES.particleAccelerator.cost, { knowledge: 5000 });
  assert.equal(TECHNOLOGIES.particleAccelerator.tier, 5);
  assert.deepEqual(calculateBuildingCost('particleAccelerator', 0, s), { cash: 1000, copper: 250, iron: 250, metal: 25 });
  s.prestige.particles = 200;
  const normal = calculateParticleMultiplier('food', s), craft = calculateParticleMultiplier('plank', s);
  s.buildings.particleAccelerator = 1;
  assert.ok(Math.abs(calculateParticleMultiplier('food', s) - 1 - (normal - 1) * 1.1) < 1e-8);
  assert.ok(Math.abs(calculateParticleMultiplier('plank', s) - 1 - (craft - 1) * 1.1) < 1e-8);
  s.buildings.particleAccelerator = 5;
  assert.ok(Math.abs(calculateParticleMultiplier('food', s) - 1 - (normal - 1) * 1.5) < 1e-8);
  assert.ok(Math.abs(calculateParticleMultiplier('plank', s) - 1 - (craft - 1) * 1.5) < 1e-8);
  s.prestige.particles = 100000;
  const original = calculateParticleMultiplier('food', { prestige: s.prestige }) - 1;
  s.buildings.particleAccelerator = 100;
  const hundredBonus = calculateParticleMultiplier('food', s) - 1 - original;
  s.buildings.particleAccelerator = 200;
  assert.ok(Math.abs((calculateParticleMultiplier('food', s) - 1 - original) / hundredBonus - 2) < 1e-8);
  s.prestige.particles = 0;
  assert.equal(calculateParticleMultiplier('food', s), 1);
  assert.equal(calculateParticleMultiplier('energy', s), 1);
});

test('ring bonuses affect only space sources and appear beneath each source without double counting', () => {
  const state = createInitialState(29, 60, 0);
  state.buildings.moonBase = 1;
  state.buildings.iridiumMine = state.buildings.helium3Mine = 1;
  state.buildings.asrielSpaceport = state.buildings.asrielResidence = state.buildings.asrielMine = 1;
  state.population = 2; state.workers.asrielResidence = 2;
  Object.assign(state.resources, { energy: 100, food: 100, oil: 100, helium3: 100 });
  const base = calculateProduction(state);
  state.buildings.starRingStation = 10;
  const boosted = calculateProduction(state);
  for (const [resource, source] of [['iridium', 'iridiumMine'], ['helium3', 'helium3Mine'], ['copper', 'asrielMine'], ['titanium', 'asrielMine']] as const) {
    const before = calculateResourceBreakdown(resource, state, base).entries.find(row => row.id === source && row.kind === 'income')!;
    // Recalculate baseline with its own ring count, since detail helpers read live state.
    state.buildings.starRingStation = 0;
    const baseline = calculateResourceBreakdown(resource, state, base).entries.find(row => row.id === source && row.kind === 'income')!;
    state.buildings.starRingStation = 10;
    const detail = calculateResourceBreakdown(resource, state, boosted);
    const income = detail.entries.find(row => row.id === source && row.kind === 'income')!;
    assert.ok(before && Math.abs(income.value / baseline.value - 1.1) < 1e-8);
    assert.ok(Math.abs(detail.net - boosted.rates[resource]) < 1e-8);
    const rows = calculateResourceFactorRows(resource, state, boosted).rows;
    const index = rows.findIndex(row => row.name === BUILDINGS[source].name);
    assert.deepEqual(rows[index + 1], { name: '星环空间站', value: '+10%', child: true });
  }
  assert.equal(calculateResourceFactorRows('metal', state, boosted).rows.some(row => row.name === '星环空间站'), false);
});

test('ARPA institutes gate technologies and scale only targeted storage and outputs', () => {
  const state = createInitialState(29, 60, 0);
  state.tech.push('arpa', 'arpaResearchInstitute');
  assert.equal(isTechnologyUnlocked('quantumTunnelingThermalProcessing', state), false);
  state.arpaBuildings.arpaResearchInstitute = 1;
  assert.equal(isTechnologyUnlocked('quantumTunnelingThermalProcessing', state), true);
  assert.equal(isTechnologyUnlocked('dimensionCompression', state), false);
  state.arpaBuildings.arpaResearchInstitute = 2;
  assert.equal(isTechnologyUnlocked('dimensionCompression', state), true);
  assert.equal(calculateStorageBonuses('lab', state, null).knowledge, 2160);
  assert.equal(calculateStorageBonuses('school', state, null).knowledge, 540);
  assert.equal(calculateStorageBonuses('warehouse', state, null).wood, 250);
  state.tech.push('dimensionCompression');
  assert.equal(calculateStorageBonuses('warehouse', state, null).wood, 270);
  assert.equal(calculateStorageBonuses('storageHub', state, null).wood, 1620);
  assert.equal(calculateStorageBonuses('hangar', state, null).copper, 8640);
  assert.equal(calculateStorageBonuses('granary', state, null).food, 500);
  const recipe = calculateFactoryRecipe('alloy', state);
  state.tech.push('quantumTunnelingThermalProcessing');
  assert.ok(Math.abs(calculateBuildingOutput('smelter', state).metal! - .6) < 1e-8);
  assert.deepEqual(calculateFactoryRecipe('alloy', state).input, recipe.input);
  assert.ok(Math.abs(calculateFactoryRecipe('alloy', state).output.alloy! / recipe.output.alloy! - 1.1) < 1e-8);
});

test('stock capacity uses live population, bonds replace stocks and exchanges scale subtotal', () => {
  const state = createInitialState(29, 60, 0);
  const snapshot = { ...calculateProduction(state), biologyUnits: 0, dataCenterUnits: 0, moonBaseUnits: 0 };
  const initial = calculateStorageDetails('cash', state, snapshot).total;
  state.population = 10; state.tech.push('stockTrading');
  assert.equal(calculateStorageDetails('cash', state, snapshot).total, initial + 2500);
  state.tech.push('savingsBonds');
  assert.equal(calculateStorageDetails('cash', state, snapshot).total, initial + 5000);
  state.arpaBuildings.stockExchange = 2;
  assert.ok(Math.abs(calculateStorageDetails('cash', state, snapshot).total - (initial + 5000) * 1.2) < 1e-8);
  state.population = 20;
  assert.ok(Math.abs(calculateStorageDetails('cash', state, snapshot).total - (initial + 10000) * 1.2) < 1e-8);
});

test('new ARPA projects support partial investment, completion and escalating repeat prices', () => {
  const state = createInitialState(29, 60, 0);
  state.tech.push('stockExchange', 'arpaResearchInstitute');
  const exchange = calculateProjectCost('stockExchange', state);
  assert.deepEqual(exchange, { cash: 2000000, wood: 50000, brick: 25000, wroughtIron: 10000 });
  for (const [resource, total] of Object.entries(exchange)) state.resources[resource as keyof typeof state.resources] = total;
  assert.equal(investInProject('stockExchange', state, 25, () => 0), 25);
  assert.equal(state.arpaProgress.stockExchange, 25);
  assert.equal(investInProject('stockExchange', state, 100, () => 0), 75);
  assert.equal(state.arpaBuildings.stockExchange, 1);
  assert.equal(calculateProjectCost('stockExchange', state).cash, 2160000);
  assert.deepEqual(calculateProjectCost('arpaResearchInstitute', state), { cash: 2000000, knowledge: 400000, copper: 100000, cement: 100000, aluminum: 200000, titanium: 50000, polymer: 10000 });
  state.arpaBuildings.arpaResearchInstitute = 1;
  assert.equal(calculateProjectCost('arpaResearchInstitute', state).cash, 2100000);
});

test('Kerberos technologies require mission and upgrade smelter and lunar helium bases', () => {
  const state = createInitialState(29, 60, 0);
  state.tech.push('planetaryExploration');
  for (const id of ['geothermalFurnace', 'helium3ExtractionOptimization'] as const) {
    assert.equal(TECHNOLOGIES[id].tier, 13);
    assert.deepEqual(TECHNOLOGIES[id].cost, { knowledge: 200000 });
    assert.equal(isTechnologyUnlocked(id, state), false);
  }
  state.kerberosMissionCompleted = true;
  assert.equal(isTechnologyUnlocked('geothermalFurnace', state), true);
  assert.equal(isTechnologyUnlocked('helium3ExtractionOptimization', state), true);
  assert.equal(calculateBuildingOutput('smelter', state).metal, .5);
  assert.equal(calculateBuildingOutput('helium3Mine', state).helium3, .2);
  state.tech.push('geothermalFurnace', 'helium3ExtractionOptimization');
  assert.equal(calculateBuildingOutput('smelter', state).metal, .75);
  assert.equal(calculateBuildingOutput('helium3Mine', state).helium3, .25);
  state.tech.push('electrochemicalSmelting', 'oxygenConverter');
  assert.ok(Math.abs(calculateBuildingOutput('smelter', state).metal! - 1.8) < 1e-8);
  state.buildings.moonBase = state.buildings.helium3Mine = 1;
  state.resources.oil = 100; state.resources.energy = 100;
  const upgraded = calculateProduction(state);
  state.tech = state.tech.filter(id => id !== 'helium3ExtractionOptimization');
  const baseline = calculateProduction(state);
  assert.ok(Math.abs(upgraded.rates.helium3 / baseline.rates.helium3 - 1.25) < 1e-8);
});

test('planetary foundries share artisans and boost both crafting paths only while supported', () => {
  const state = createInitialState(29, 60, 0);
  state.tech.push('castingWorkshop', 'planetaryExploration', 'alienCasting');
  state.buildings.asrielSpaceport = 1;
  state.buildings.asrielResidence = 1;
  state.buildings.planetaryFoundry = 2;
  state.population = 4;
  state.workers.asrielResidence = 2;
  state.resources.energy = 100; state.resources.helium3 = 100; state.resources.food = 100;
  assert.equal(calculateWorkerCapacity('foundry', state), 2);
  assert.equal(changeWorkerAssignment(state, 'foundry', 2), 2);
  assert.equal(calculateCraftingMultiplier('plank', state), 1.12);
  state.craftWorkers.plank = 2;
  state.resources.wood = 100;
  const production = calculateProduction(state);
  assert.equal(production.asriel.allocations.planetaryFoundry, 2);
  assert.ok(production.outputs['craft:plank']! > 0);
  state.stoppedBuildings.planetaryFoundry = 2;
  assert.equal(calculateCraftingMultiplier('plank', state), 1);
  assert.equal(calculateProduction(state).outputs['craft:plank'], undefined);
});

test('Kerberos mission is independent and geothermal generation boosts only lunar iridium', () => {
  const state = createInitialState(29, 60, 0);
  state.tech.push('planetaryExploration');
  assert.equal(isBuildingUnlocked('geothermalPlant', state), false);
  state.resources.helium3 = 5000;
  assert.equal(completeKerberosMission(state), true);
  assert.equal(state.resources.helium3, 0);
  assert.equal(state.asrielMissionCompleted, false);
  assert.equal(isBuildingUnlocked('geothermalPlant', state), true);
  assert.equal(completeKerberosMission(state), false);
  state.buildings.geothermalPlant = 1;
  state.buildings.moonBase = 1; state.buildings.iridiumMine = 1;
  state.resources.helium3 = 10; state.resources.oil = 10;
  const base = calculateProduction(state);
  assert.equal(base.inputUnits.geothermalPlant, 1);
  assert.ok(Math.abs(base.rates.helium3 + .5) < 1e-8);
  assert.equal(base.outputs.geothermalPlant, 1);
  assert.ok(Math.abs(base.rates.energy - 6) < 1e-8, '10 geothermal energy minus 4 lunar base maintenance');
  const rows = calculateResourceFactorRows('iridium', state, base).rows;
  const mineIndex = rows.findIndex(row => row.name === BUILDINGS.iridiumMine.name);
  assert.ok(mineIndex >= 0);
  assert.deepEqual(rows[mineIndex + 1], { name: '地热发电站', value: '+5%', child: true });
  const iridium = base.rates.iridium;
  state.stoppedBuildings.geothermalPlant = 1; state.resources.energy = 10;
  const off = calculateProduction(state);
  assert.equal(calculateResourceFactorRows('iridium', state, off).rows.some(row => row.name === '地热发电站'), false);
  assert.ok(Math.abs(iridium / off.rates.iridium - 1.05) < 1e-8);
});

test('space garrison increases soldiers without support and reinforced containers double current base', () => {
  const state = createInitialState(29, 60, 0);
  state.buildings.spaceGarrison = 2;
  assert.equal(calculateSoldierCapacity(state), 4);
  state.resources.oil = 10; state.resources.food = 100;
  const production = calculateProduction(state);
  assert.equal(production.inputUnits.spaceGarrison, 2);
  assert.equal(production.rates.oil, -1);
  assert.equal(production.rates.food, -20);
  assert.equal(production.asriel.used, 0);
  assert.equal(calculateContainerUnitCapacity(state), 250);
  state.tech.push('reinforcedContainers');
  assert.equal(calculateContainerUnitCapacity(state), 500);
  state.tech.push('steelContainers');
  assert.equal(calculateContainerUnitCapacity(state), 1000);
  state.tech.push('iridiumAlloyContainers');
  assert.equal(calculateContainerUnitCapacity(state), 2500);
});

test('power switch warning follows actual support and power allocation', () => {
  const state = createInitialState(29, 60, 0);
  state.buildings.asrielMine = 2;
  state.buildings.spaceWaystation = 1;
  state.resources.energy = 5;
  assert.equal(isBuildingUnderworking('asrielMine', state, calculateProduction(state)), true);
  assert.equal(isBuildingUnderworking('spaceWaystation', state, calculateProduction(state)), false);
  state.stoppedBuildings.asrielMine = 2;
  assert.equal(isBuildingUnderworking('asrielMine', state, calculateProduction(state)), false);
  state.resources.energy = 0;
  assert.equal(isBuildingUnderworking('spaceWaystation', state, calculateProduction(state)), true);
  state.stoppedBuildings.spaceWaystation = 1;
  assert.equal(isBuildingUnderworking('spaceWaystation', state, calculateProduction(state)), false);
  state.buildings.moonBase = 1;
  state.buildings.iridiumMine = 3;
  state.resources.energy = 4;
  state.resources.oil = 2;
  assert.equal(isBuildingUnderworking('iridiumMine', state, calculateProduction(state)), true);
  state.tech.push('automatedMining');
  state.buildings.mine = 1;
  state.resources.energy = 0;
  assert.equal(isBuildingUnderworking('mine', state, calculateProduction(state)), true);
});

test('all support-consuming buildings expose power switches and stopped Asriel units release support', () => {
  const state = createInitialState(29, 60, 0);
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    if (BUILDINGS[id].moonSupport || BUILDINGS[id].support) assert.equal(hasContinuousEnergyInput(id, state), true, id);
  }
  assert.equal(hasContinuousEnergyInput('spaceWaystation', state), true);
  assert.equal(hasContinuousEnergyInput('starRingStation', state), false);
  state.buildings.asrielSpaceport = 1;
  Object.assign(state.resources, { energy: 5, helium3: 2, food: 25 });
  state.buildings.asrielResidence = state.buildings.asrielMine = state.buildings.ecologicalDome = 1;
  assert.equal(allocateAsrielSupport(state, state.resources, 1).used, 3);
  for (const id of ['asrielResidence', 'asrielMine', 'ecologicalDome'] as const) {
    state.stoppedBuildings[id] = 1;
    const support = allocateAsrielSupport(state, state.resources, 1);
    assert.equal(support.allocations[id], 0);
  }
  assert.equal(allocateAsrielSupport(state, state.resources, 1).available, 4);
});
import { calculateSpaceFuelMultiplier, calculateAsrielMissionCost } from '../src/simulation/space-fuel';
import { calculateBuildingInput } from '../src/simulation/building-production';
import { calculateBuildingCost } from '../src/simulation/costs';
import { calculateStorageBonuses } from '../src/simulation/storage-bonuses';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { TECHNOLOGIES } from '../src/data/technologies';
import { completeAsrielMission } from '../src/simulation/commands';

test('waystations compound space fuel discounts and add passive capacity/support', () => {
  const state = createInitialState(29, 60, 0);
  state.buildings.spaceWaystation = 20;
  state.resources.energy = 109;
  const factor = .95 ** 20;
  assert.equal(calculateSpaceFuelMultiplier(state), factor);
  assert.ok(factor > .35 && factor < .36);
  assert.equal(calculateBuildingInput('moonBase', state).oil, 2 * factor);
  assert.equal(calculateBuildingInput('asrielSpaceport', state).helium3, 2 * factor);
  assert.equal(calculateBuildingInput('spaceFactory', state).helium3, 2 * factor);
  assert.equal(calculateBuildingInput('refinery', state).oil, calculateBuildingInput('refinery', createInitialState(29, 60, 0)).oil);
  const baseline = createInitialState(29, 60, 0);
  for (const id of ['moonBase', 'asrielSpaceport', 'spaceFactory'] as const) {
    const original = calculateBuildingCost(id, 0, baseline);
    const discounted = calculateBuildingCost(id, 0, state);
    for (const [r, n] of Object.entries(original)) assert.equal(discounted[r as keyof typeof discounted], r === 'oil' || r === 'helium3' ? n * factor : n);
  }
  state.buildings.moonBase = 1;
  state.buildings.asrielSpaceport = 1;
  state.resources.oil = 2 * factor;
  state.resources.helium3 = 2 * factor;
  state.resources.energy = 109;
  state.resources.food = 25;
  const preview = calculateSupportPreview(state);
  assert.equal(preview.moon.baseUnits, 1);
  assert.equal(preview.asriel.ports, 1);
  assert.equal(preview.asriel.capacity, 4);
  assert.ok(preview.pool.oil < 1e-8 && preview.pool.helium3 < 1e-8);
  const production = calculateProduction(state);
  assert.ok(Math.abs(production.rates.oil + 2 * factor) < 1e-8);
  assert.ok(Math.abs(production.rates.helium3 + 2 * factor) < 1e-8);
  assert.deepEqual(calculateStorageBonuses('spaceWaystation', state, null), { oil: 250, helium3: 250 });
  state.tech.push('planetaryExploration');
  state.resources.helium3 = calculateAsrielMissionCost(state);
  assert.equal(completeAsrielMission(state), true);
  assert.equal(state.resources.helium3, 0);
});

test('waystation maintenance is paid once and off/unpowered units lose active effects', () => {
  const state = createInitialState(29, 60, 0);
  state.buildings.spaceWaystation = 2;
  state.resources.energy = 10;
  let production = calculateProduction(state);
  assert.equal(production.inputUnits.spaceWaystation, 2);
  assert.equal(production.rates.energy, -10);
  assert.equal(production.asriel.capacity, 0);
  assert.equal(calculateSpaceFuelMultiplier(state), .95 ** 2);
  state.stoppedBuildings.spaceWaystation = 1;
  production = calculateProduction(state);
  assert.equal(production.inputUnits.spaceWaystation, 1);
  assert.equal(production.rates.energy, -5);
  assert.equal(production.asriel.capacity, 0);
  assert.equal(calculateSpaceFuelMultiplier(state), .95);
  state.resources.energy = 0;
  production = calculateProduction(state);
  assert.equal(production.inputUnits.spaceWaystation, 0);
  assert.equal(production.asriel.capacity, 0);
  assert.equal(calculateSpaceFuelMultiplier(state), 1);
  state.resources.energy = 1;
  production = calculateProduction(state, .2);
  assert.equal(production.inputUnits.spaceWaystation, 1);
  assert.equal(production.rates.energy, -5);
  assert.equal(production.asriel.capacity, 0);
});

test('late space technologies use exact prices and vault base capacity additions', () => {
  assert.deepEqual(TECHNOLOGIES.iridiumSteelVault.cost, { knowledge: 155000, cash: 75000, metal: 2500, iridium: 1000 });
  assert.equal(TECHNOLOGIES.iridiumSteelVault.tier, 12);
  assert.equal(TECHNOLOGIES.iridiumSteelVault.resourceRequired, 'iridium');
  assert.deepEqual(TECHNOLOGIES.spaceTransitStation.cost, { knowledge: 210000, metal: 1000, alloy: 1000 });
  assert.equal(TECHNOLOGIES.spaceTransitStation.tier, 13);
  assert.equal(TECHNOLOGIES.spaceTransitStation.name, '电磁弹射系统');
  assert.equal(TECHNOLOGIES.spaceTransitStation.desc, '研究电磁发射系统来节约燃料');
  assert.equal(BUILDINGS.spaceWaystation.name, '电磁发射器');
  assert.equal(BUILDINGS.spaceWaystation.asrielSupport, undefined);
  assert.equal(BUILDING_GROUPS.at(-1)?.name, '公共事业部门');
  assert.deepEqual(BUILDING_GROUPS.at(-1)?.buildings, ['particleAccelerator', 'spaceWaystation']);
  const state = createInitialState(29, 60, 0);
  assert.deepEqual(calculateBuildingCost('spaceWaystation', 0, state), { cash: 50000, metal: 20000, alloy: 10000, iridium: 1000 });
  // SpaceWaystation uses its raw 1.25 registry scale (no global +0.01).
  assert.deepEqual(calculateBuildingCost('spaceWaystation', 1, state), { cash: 62500, metal: 25000, alloy: 12500, iridium: 1250 });
  state.tech.push('iridiumSteelVault');
  assert.equal(calculateStorageBonuses('bank', state, null).cash, 2500);
  assert.equal(calculateStorageBonuses('catCafe', state, null).cash, 6500);
  state.tech.push('vaultExpansion', 'steelSafe');
  // Bank base 1000+1500+750+750=4000; catCafe stays 4000+2500=6500 (no vault/steelSafe effects).
  assert.equal(calculateStorageBonuses('bank', state, null).cash, 4000);
  assert.equal(calculateStorageBonuses('catCafe', state, null).cash, 6500);
  const raw = JSON.parse(JSON.stringify(state));
  delete raw.buildings.spaceWaystation; delete raw.workers.spaceWaystation;
  validateEconomyRecords(raw, state);
  assert.equal(state.buildings.spaceWaystation, 0);
  assert.equal(state.workers.spaceWaystation, 0);
});

test('queue estimates handle deficits, capacity, FIFO reservations and ARPA partial funding', () => {
  const state = createInitialState(29, 60, 0);
  const rates = { ...state.resources, wood: 2, knowledge: 10 };
  const caps = Object.fromEntries(Object.keys(state.resources).map(id => [id, Infinity])) as typeof state.resources;
  assert.equal(estimateResourceWait({ wood: 10 }, state.resources, rates, caps), '预计 5 s后完成');
  assert.equal(estimateResourceWait({ stone: 10 }, state.resources, rates, caps), '暂无完成时间');
  assert.equal(estimateResourceWait({ wood: 10 }, state.resources, rates, { ...caps, wood: 5 }), '储量上限不足');
  state.queue = [{ uid: 1, kind: 'build', id: 'forage' }, { uid: 2, kind: 'build', id: 'forage' }];
  state.settings.unorderedBuildingQueue = false;
  const prices = describeQueuedPurchases(state);
  const firstPrice = prices[0], secondPrice = prices[1]; assert.ok(firstPrice && secondPrice);
  for (const id of Object.keys(firstPrice.cost) as (keyof typeof rates)[]) rates[id] = 2;
  const combined = Object.fromEntries(Object.keys(firstPrice.cost).map(id => [id, (firstPrice.cost[id as keyof typeof rates] || 0) + (secondPrice.cost[id as keyof typeof rates] || 0)]));
  const estimates = estimateQueueTimes(state, rates, caps);
  assert.equal(estimates.get(2), estimateResourceWait(combined, state.resources, rates, caps));
  state.queue = [{ uid: 3, kind: 'arpa', id: 'geneSequencing' }];
  state.arpaProgress.geneSequencing = 90;
  assert.equal(estimateQueueTimes(state, rates, { ...caps, knowledge: 20000 }).get(3), '预计 2 h 46 min后完成');
  assert.equal(estimateQueueTimes(state, rates, { ...caps, knowledge: 100 }).get(3), '预计 2 h 46 min后完成');
  assert.equal(state.arpaProgress.geneSequencing, 90);
});

test('particle production follows a continuous decreasing-marginal-return curve', () => {
  const effective = calculateEffectiveParticles;
  assert.equal(effective(0), 0);
  assert.ok(Math.abs(effective(400) - 2000 * Math.log1p(.2)) < 1e-10);
  assert.ok(Math.abs(effective(1000) - (2000 * Math.log1p(.2) + 200 / 1.2 * Math.log1p(3))) < 1e-10);
  let previousGain = Infinity;
  for (let p = 0; p < 2000; p++) {
    const gain = effective(p + 1) - effective(p);
    assert.ok(gain > 0 && gain < previousGain);
    previousGain = gain;
  }
  const h = .001;
  const leftSlope = (effective(400) - effective(400 - h)) / h;
  const rightSlope = (effective(400 + h) - effective(400)) / h;
  assert.ok(Math.abs(leftSlope - rightSlope) < 1e-5);
  const state = createInitialState(29, 60, 0);
  state.prestige.particles = 1000;
  assert.equal(calculateParticleMultiplier('food', state), 1 + effective(1000) * .005);
  assert.equal(calculateParticleMultiplier('plank', state), 1 + effective(1000) * .00125);
  assert.equal(calculateParticleMultiplier('energy', state), 1);
  assert.equal(state.prestige.particles, 1000);
  assert.ok(Number.isFinite(effective(Number.MAX_SAFE_INTEGER)));
});

test('mithril rejects containers and legacy allocations return to the idle pool', () => {
  const state = createInitialState(29, 60, 0);
  state.buildings.spaceFactory = 1;
  state.buildings.containerWarehouse = 1;
  state.containers = 5;
  state.resources.mithril = 123;
  assert.equal(isContainerAssignable('mithril', state), false);
  assert.equal(changeContainerAssignment(state, 'mithril', 2), 0);
  assert.equal(state.containerAssignments.mithril, 0);
  const raw = JSON.parse(JSON.stringify(state));
  raw.containerAssignments.mithril = 3;
  validateStorageAssignments(raw, state);
  assert.equal(state.containers, 5);
  assert.equal(state.containerAssignments.mithril, 0);
  assert.equal(countAssignedContainers(state), 0);
  assert.equal(state.resources.mithril, 123);
  raw.containerAssignments.mithril = -1;
  assert.throws(() => validateStorageAssignments(raw, state), /集装箱分配/);
});

test('cat cafes provide one artist job each without changing automatic cash output', () => {
  const state = createInitialState(29, 60, 0);
  state.tech.push('catCafe');
  state.population = 10;
  state.buildings.catCafe = 2;
  assert.equal(calculateWorkerCapacity('catCafe', state), 0);
  assert.equal(calculateWorkerCapacity('theater', state), 2);
  changeWorkerAssignment(state, 'theater', 3);
  assert.equal(state.workers.theater, 2);
  assert.equal(state.workers.catCafe, 0);
  state.buildings.theater = 1;
  changeWorkerAssignment(state, 'theater', 1);
  assert.equal(state.workers.theater, 3);
  const power = { generatorSpeed: 0, generatorEnergy: 0, coalRatio: 0, moonBaseUnits: 0, biologyUnits: 0, dataCenterUnits: 0 };
  const morale = calculateMorale(state, 1, power);
  assert.equal(morale.artistCount, 3);
  assert.equal(morale.artists, 3 * calculateArtistEffect(state));
  assert.equal(calculateBuildingOutput('catCafe', state).cash, 10);
  state.tech.push('theaterUpgrade');
  assert.equal(calculateMorale(state, 1, power).artists, 6);
  changeWorkerAssignment(state, 'theater', -1);
  assert.equal(state.workers.theater, 2);
  assert.equal(state.workers.catCafe, 0);
});

test('legacy cafe artist assignments migrate once into the shared artist pool', () => {
  const state = createInitialState(29, 60, 0);
  state.buildings.catCafe = 2;
  state.buildings.theater = 1;
  state.workers.theater = 1;
  state.workers.catCafe = 2;
  validateEconomyRecords(JSON.parse(JSON.stringify(state)), state);
  assert.equal(state.workers.theater, 3);
  assert.equal(state.workers.catCafe, 0);
  validateEconomyRecords(JSON.parse(JSON.stringify(state)), state);
  assert.equal(state.workers.theater, 3);
  assert.equal(calculateWorkerCapacity('theater', state), 3);
});

test('smelter base steel is 0.5 and electrochemical steel is 1 before oxygen bonus', () => {
  const state = createInitialState(29, 60, 0);
  assert.equal(calculateBuildingOutput('smelter', state).metal, .5);
  state.tech.push('electrochemicalSmelting');
  assert.equal(calculateBuildingOutput('smelter', state).metal, 1);
  state.tech.push('oxygenConverter');
  assert.equal(calculateBuildingOutput('smelter', state).metal, 1.2);
});

test('gene sequencing requires genetics, costs one million, and resets each run', () => {
  const state = createInitialState(29, 60, 0);
  state.resources.knowledge = 1000000;
  assert.equal(investInProject('geneSequencing', state, 100, () => 0), 0);
  state.tech.push('genetics');
  assert.equal(investInProject('geneSequencing', state, 75, () => 0), 75);
  assert.equal(state.resources.knowledge, 250000);
  assert.equal(enqueueProject(state, 'geneSequencing', 10), 1);
  assert.equal(enqueueProject(state, 'geneSequencing'), 0);
  advanceProjectQueue(state, 1, () => 0);
  assert.equal(state.arpaBuildings.geneSequencing, 1);
  assert.equal(state.resources.knowledge, 0);
  state.resources.knowledge = 1000000;
  assert.equal(investInProject('geneSequencing', state, 100, () => 0), 0);
  assert.equal(createInitialState(29, 60, 0).arpaBuildings.geneSequencing, 0);
});

test('project queue preserves partial funding, timing and unique projects', () => {
  const state = createInitialState(29, 60, 0);
  state.tech.push('arpa', 'rocketry');
  assert.equal(enqueueProject(state, 'rocketPlatform', 10), 1);
  assert.equal(enqueueProject(state, 'rocketPlatform'), 0);
  state.resources.metal = 100; state.resources.alloy = 50;
  assert.deepEqual(advanceProjectQueue(state, .5, () => 0), { completed: 0, dirty: false });
  assert.deepEqual(advanceProjectQueue(state, .5, () => 0), { completed: 0, dirty: true });
  assert.equal(state.arpaProgress.rocketPlatform, 1);
  assert.equal(state.queue.length, 1);
  assert.equal(state.resources.metal, 0);
  state.resources.metal = 9900; state.resources.alloy = 4950;
  assert.deepEqual(advanceProjectQueue(state, 1, () => 0), { completed: 1, dirty: true });
  assert.equal(state.arpaBuildings.rocketPlatform, 1);
  assert.equal(state.queue.length, 0);
  assert.equal(enqueueProject(state, 'rocketPlatform'), 0);
});

test('monument investment changes material only on completion', () => {
  const state = createInitialState(29, 60, 0);
  state.tech.push('monument'); state.resources.stone = 100000;
  let randomCalls = 0;
  const random = () => { randomCalls++; return 0; };
  assert.equal(investInProject('monument', state, 50, random), 50);
  assert.equal(randomCalls, 0); assert.equal(state.monumentMaterial, 'stone');
  assert.equal(investInProject('monument', state, 100, random), 50);
  assert.equal(randomCalls, 1); assert.equal(state.monumentMaterial, 'aluminum');
  assert.equal(state.arpaBuildings.monument, 1); assert.equal(state.resources.stone, 0);
});

test('persistence writes timestamped JSON and reports storage failure', () => {
  const state = createInitialState(29, 60, 0);
  const writes = new Map<string, string>();
  assert.equal(persistGame(state, { setItem: (key, value) => { writes.set(key, value); } }, 'save', 123), true);
  assert.equal(JSON.parse(writes.get('save')!).lastSaved, 123);
  assert.equal(persistGame(state, { setItem: () => { throw Error('quota'); } }, 'save', 456), false);
  assert.equal(state.lastSaved, 456);
  assert.equal(JSON.parse(writes.get('save')!).lastSaved, 123);
});
import { migrateV27, migrateV28 } from '../src/state/migrations';
import { validateAndMigrateSave } from '../src/state/validate-save';

test('unified save entry validates current and upgrades legacy JSON independently', () => {
  const state = createInitialState(29, 60, 0);
  const context = { now: 0, eventInterval: 60, housingCapacity: () => 1, clampResources: () => {} };
  assert.deepEqual(validateAndMigrateSave(JSON.parse(JSON.stringify(state)), context), { ...state, legacyTechPrerequisites: [] });
  const legacy = { ...state, version: 27, lines: { alloy: 0, polymer: 0 } };
  const snapshot = JSON.stringify(legacy);
  assert.equal(validateAndMigrateSave(legacy, context).version, 29);
  assert.equal(JSON.stringify(legacy), snapshot);
  assert.throws(() => validateAndMigrateSave({ ...state, version: 11 }, context), /版本不受支持/);
});

test('recent migrations preserve legacy lines and never mutate input', () => {
  const raw = { version: 27, lines: { alloy: 2, polymer: 1 }, resources: { wood: 12 } };
  const original = JSON.stringify(raw);
  const result = migrateV28(migrateV27(raw));
  assert.equal(result.version, 29);
  assert.deepEqual(result.lines, { alloy: 2, polymer: 1, fur: 0 });
  assert.deepEqual(result.resources, { wood: 12, mithril: 0 });
  assert.equal(result.asrielMissionCompleted, false);
  assert.equal(JSON.stringify(raw), original);
});
import { createInitialState } from '../src/state/create-state';
import { calculateFactoryRecipe } from '../src/simulation/factory';
import { allocateMoonSupport } from '../src/simulation/moon';
import { allocateAsrielSupport } from '../src/simulation/asriel';
import { calculateTechnologyTier } from '../src/simulation/technology';
import { formatNumber, formatEffectNumber, formatResourceNumber } from '../src/shared/format';
import { advanceSoldierTraining } from '../src/simulation/military';
import { advancePopulationGrowth, sampleGrowthTarget } from '../src/simulation/population';
import { finalizeProduction, settlePopulationIncome } from '../src/simulation/production-finalize';
import { calculateResearchPowerPool } from '../src/simulation/research-power';
import { calculateProduction } from '../src/simulation/production';
import { changeGovernment, changeTaxRate, craftManually } from '../src/simulation/commands';
import { validateCivilization } from '../src/state/validate-civilization';
import { validateFactoryAssignments, validateEconomyRecords } from '../src/state/validate-economy';

test('economy save validation preserves defaults and rejects invalid assignments', () => {
  const state = createInitialState(29, 60, 0);
  validateEconomyRecords({ ...state }, state);
  validateFactoryAssignments(undefined, state);
  assert.deepEqual(state.lines, { alloy: 0, polymer: 0, fur: 0, nanotubes: 0, nanoAlloy: 0 });
  assert.throws(() => validateFactoryAssignments({ alloy: .5 }, state), /生产线分配无效/);
  assert.throws(() => validateFactoryAssignments({ fur: 1 }, state), /生产线分配无效/);
  assert.throws(() => validateEconomyRecords({ ...state, resources: { ...state.resources, food: '10' } }, state), /资源数据无效/);
  assert.throws(() => validateEconomyRecords({ ...state, buildings: { ...state.buildings, nest: .5 } }, state), /建筑或工作分配无效/);
});

test('civilization save validation rejects invalid prestige and military progress', () => {
  const source = createInitialState(29, 60, 0);
  const raw: Record<string, unknown> = { ...source };
  const target = createInitialState(29, 60, 0);
  validateCivilization(raw, target);
  assert.deepEqual(target.prestige, source.prestige);
  assert.throws(() => validateCivilization({ ...raw, prestige: { ...source.prestige, particles: .5 } }, target), /整数/);
  assert.throws(() => validateCivilization({ ...raw, government: 'democracy' }, target), /尚未解锁/);
  assert.throws(() => validateCivilization({ ...raw, trainingProgress: 1 }, target), /训练进度/);
  assert.throws(() => validateCivilization({ ...raw, nuclearProgress: 1 }, target), /核弹工程/);
});

test('complete production ES module runs without DOM or global state', () => {
  const state = createInitialState(29, 60, 0);
  state.buildings.forage = 1; state.workers.forage = 1;
  state.resources.food = 10;
  const before = JSON.stringify(state);
  const result = calculateProduction(state, .25);
  assert.ok(result.rates.food > 0);
  assert.ok(Object.values(result.pool).every(Number.isFinite));
  assert.equal(JSON.stringify(state), before);
});

test('typed commands reject invalid inputs and preserve gameplay gates', () => {
  const state = createInitialState(29, 60, 0);
  assert.equal(changeTaxRate(state, NaN), false);
  assert.equal(changeTaxRate(state, 31), false);
  assert.equal(changeGovernment(state, 'democracy'), false);
  state.tech.push('government');
  assert.equal(changeGovernment(state, 'democracy'), true);
  assert.equal(changeGovernment(state, 'oligarchy'), false);
  state.buildings.foundry = 1; state.resources.wood = 25;
  assert.equal(craftManually(state, 'plank', 'max'), 2);
  assert.equal(state.resources.wood, 5); assert.equal(state.resources.plank, 2);
});

test('production finalization reports full food demand and does not modify source state', () => {
  const state = createInitialState(29, 60, 0);
  state.population = 10; state.resources.food = 2;
  const before = { ...state.resources }, pool = { ...before };
  const result = finalizeProduction(state, pool, before, 1, {
    biologyUnits: 0, dataCenterUnits: 0, moonBaseUnits: 0,
    moon: allocateMoonSupport(state, pool, 1), asriel: allocateAsrielSupport(state, pool, 1),
  });
  assert.equal(result.pool.food, 0); assert.equal(result.rates.food, -10);
  assert.equal(result.starving, true); assert.equal(state.resources.food, 2);
  const income = settlePopulationIncome(state, pool, 100, 1);
  assert.equal(income.catTax, 10); assert.equal(state.resources.cash, 0);
});

test('research pool reserves lunar then planetary maintenance without touching state', () => {
  const state = createInitialState(29, 60, 0);
  state.buildings.moonBase = 1; state.buildings.asrielSpaceport = 1;
  Object.assign(state.resources, { energy: 10, oil: 2, helium3: 2, food: 25 });
  const snapshot = JSON.stringify(state);
  const pool = calculateResearchPowerPool(state, 1);
  assert.equal(pool.energy, 1); assert.equal(pool.oil, 0);
  assert.equal(pool.helium3, 0); assert.equal(pool.food, 0);
  assert.equal(JSON.stringify(state), snapshot);
});

test('growth preserves food gates, population threshold and one-arrival steps', () => {
  const state = createInitialState(29, 60, 0);
  state.resources.food = 10;
  advancePopulationGrowth(state, 100, 0, 10, () => 0);
  assert.equal(state.population, 1); assert.equal(state.growth, 95);
  advancePopulationGrowth(state, 1, -1, 10);
  assert.equal(state.growth, 0); assert.equal(state.growthTarget, 0);
  state.population = 20;
  assert.equal(sampleGrowthTarget(state, () => 0), 10);
  advancePopulationGrowth(state, 100, 0, 20);
  assert.equal(state.population, 20);
});

test('training keeps partial progress, caps soldiers and unlocks fur', () => {
  const state = createInitialState(29, 60, 0);
  state.buildings.barracks = 1;
  advanceSoldierTraining(state, 30);
  assert.equal(state.soldiers, 0);
  state.tech.push('military');
  advanceSoldierTraining(state, 45);
  assert.equal(state.soldiers, 1); assert.equal(state.trainingProgress, 15);
  assert.equal(state.furUnlocked, true);
  advanceSoldierTraining(state, 100);
  assert.equal(state.soldiers, 2); assert.equal(state.trainingProgress, 0);
});

test('state factory owns all nested mutable records', () => {
  const first = createInitialState(29, 60, 123), second = createInitialState(29, 60, 123);
  first.resources.food = 10; first.buildings.moonBase = 1; first.tech.push('moonExploration');
  assert.equal(second.resources.food, 0); assert.equal(second.buildings.moonBase, 0);
  assert.deepEqual(second.tech, []); assert.equal(second.lastSaved, 123);
});
test('factory module imports real typed registries and returns fresh recipes', () => {
  const state = createInitialState(29, 60, 0);
  state.tech.push('automatedEngineering', 'intelligentFactory', 'chemicalDeposition');
  assert.deepEqual(calculateFactoryRecipe('alloy', state), { input: { iron: .45, copper: .9 }, output: { alloy: 2.16 } });
  const recipe = calculateFactoryRecipe('alloy', state); recipe.input.iron = 99;
  assert.equal(calculateFactoryRecipe('alloy', state).input.iron, .45);
});
test('support modules are read-only and preserve prioritized whole units', () => {
  const state = createInitialState(29, 60, 0);
  Object.assign(state.buildings, { moonBase: 1, iridiumMine: 2, helium3Mine: 1, asrielSpaceport: 1, asrielResidence: 3, asrielMine: 3 });
  Object.assign(state.resources, { oil: 2, energy: 5, food: 25, helium3: 2 });
  const before = JSON.stringify(state);
  assert.equal(allocateMoonSupport(state, state.resources, 1).allocations.helium3Mine, 0);
  assert.equal(allocateAsrielSupport(state, state.resources, 1).allocations.asrielMine, 1);
  assert.equal(JSON.stringify(state), before);
});
test('technology module follows explicit tier and unknown fallback', () => {
  assert.equal(calculateTechnologyTier('moonExploration'), 12);
  assert.equal(calculateTechnologyTier('unknown'), 0);
});
test('purchases keep immediate, queued and FIFO settlement behavior', () => {
  const state = createInitialState(29, 60, 0);
  state.tech.push('survival');
  assert.equal(isPurchaseAllowed(state, 'build', 'nest'), true);
  assert.equal(isPurchaseAllowed(state, 'build', 'mine'), false);
  const unaffordable = requestPurchase(state, 'build', 'nest', 1);
  assert.equal(unaffordable.status, 'queued');
  assert.equal(state.queue.length, 1);
  assert.equal(removeQueuedPurchase(state, 999), null);
  assert.deepEqual(removeQueuedPurchase(state, unaffordable.queued!.uid), unaffordable.queued);
  state.resources.wood = 18; state.resources.stone = 9; state.resources.cash = 10;
  const direct = requestPurchase(state, 'build', 'nest', 1);
  assert.equal(direct.status, 'buy-now');
  assert.equal(state.buildings.nest, 1);
  const queued = requestPurchase(state, 'build', 'nest', 1);
  assert.equal(queued.status, 'queued');
  const listed = describeQueuedPurchases(state);
  assert.equal(listed.length, 1);
  const listedItem = listed[0]; assert.ok(listedItem);
  assert.ok(listedItem.cost.wood !== undefined && listedItem.cost.wood > 0);
  state.resources.wood = 100; state.resources.stone = 100; state.resources.cash = 100;
  const settled = settlePurchaseQueue(state, 1);
  assert.equal(settled.entries.length, 1);
  const settledItem = settled.entries[0]; assert.ok(settledItem);
  assert.equal(settledItem.completed, true);
  assert.equal(state.buildings.nest, 2);
  assert.equal(state.queue.length, 0);
});

test('research applies powered shutdown and container unlock side effects', () => {
  const state = createInitialState(29, 60, 0);
  state.tech.push('survival', 'writing', 'tools', 'mining', 'metallurgy', 'coalMining', 'science', 'electricity', 'automation');
  state.buildings.mine = 2;
  state.resources.knowledge = 1000;
  const result = researchTechnologyNow(state, 'automatedMining');
  assert.equal(result.bought, true);
  assert.deepEqual(result.poweredShutdown, ['mine']);
  assert.equal(state.stoppedBuildings.mine, 2);
  assert.equal(state.tech.includes('automation'), true);
});

test('batch building respects queue reservations and escalating prices', () => {
  const state = createInitialState(29, 60, 0);
  state.tech.push('survival');
  state.resources.wood = 10000; state.resources.stone = 10000; state.resources.cash = 10000;
  state.queue.push({ uid: 7, kind: 'build', id: 'nest' });
  const batch = buyBuildingsInBatch(state, 'nest', 5, 1);
  assert.ok(batch.bought >= 1);
  assert.ok(state.buildings.nest >= 1);
});

test('craft assignment respects unlocks, foundry capacity and integer steps', () => {
  const state = createInitialState(29, 60, 0);
  state.buildings.foundry = 1;
  state.workers.foundry = 1;
  state.resources.wood = 100;
  assert.equal(changeCraftAssignment(state, 'plank', 1.5), 0);
  assert.equal(changeCraftAssignment(state, 'plank', 1), 1);
  assert.equal(changeCraftAssignment(state, 'plank', 1), 0);
  assert.equal(changeCraftAssignment(state, 'plank', -1), -1);
  assert.equal(changeCraftAssignment(state, 'mithril', 1), 0);
});

test('nuclear fill and prestige resets preserveInvalid guards', () => {
  const funded = createInitialState(29, 60, 0);
  funded.tech.push('nuclearProgram');
  Object.assign(funded.resources, { oil: 4000, alloy: 2000, uranium: 1000 });
  assert.equal(calculateNuclearAffordablePercent(funded, 25), 25);
  assert.equal(fillNuclearProject(funded, 25), 25);
  assert.equal(funded.nuclearProgress, 25);
  assert.equal(fillNuclearProject(funded, 7), 0);
  funded.nuclearProgress = 100;
  funded.population = 40;
  const launched = launchNuclearPrestige(funded, 60, 123);
  assert.ok(launched);
  assert.equal(launched!.reward, 20);
  assert.equal(launched!.next.version, 29);
  assert.equal(JSON.stringify(funded).includes('"nuclearProgress":100'), true);
  const soft = createInitialState(29, 60, 0);
  const reset = resetRunState(soft, 'soft', 60, 7);
  assert.ok(reset);
  assert.equal(reset!.next.lastSaved, 7);
  assert.equal(resetRunState(soft, 'unknown', 60, 7), null);
  assert.equal(launchNuclearPrestige(createInitialState(29, 60, 0), 60, 0), null);
});

test('direct building purchase reports first factory unlock', () => {
  const state = createInitialState(29, 60, 0);
  state.tech.push('automation');
  state.resources.cement = 1000; state.resources.titanium = 1000; state.resources.metal = 1000; state.resources.cash = 1000;
  const result = buyBuildingNow(state, 'factory', 1);
  assert.equal(result.bought, true);
  assert.equal(result.firstFactory, true);
  assert.equal(state.buildings.factory, 1);
});
test('decimal effects survive binary roundoff without rounding genuine stock fractions', () => {
  assert.equal(formatNumber(2 + .05), '2.05');
  assert.equal(formatNumber(2.05 - 2), '0.05');
  assert.equal(formatNumber(.3 - .2), '0.1');
  assert.equal(formatNumber(.29), '0.29');
  assert.equal(formatNumber(1.9999), '1.99');
  assert.equal(formatNumber(.04999), '0.04');
  assert.equal(formatNumber(12000 * 1.17), '14.04K');
});

test('building effect numbers retain up to four decimals without trailing zeros or compact units', () => {
  assert.equal(formatEffectNumber(2.05), '2.05');
  assert.equal(formatEffectNumber(.123456), '0.1235');
  assert.equal(formatEffectNumber(12345.6789), '12345.6789');
  assert.equal(formatEffectNumber(10), '10');
  assert.equal(formatEffectNumber(.0001), '0.0001');
  assert.equal(formatEffectNumber(.00000001), '0');
  assert.equal(formatEffectNumber(2.05 - 2), '0.05');
});

import { signedRate } from '../src/simulation/resource-breakdown';

test('resource rate display retains two decimals without negative zero or binary tails', () => {
  assert.equal(signedRate(500.1234567), '+500.12/s');
  assert.equal(signedRate(-.01), '−0.01/s');
  assert.equal(signedRate(-.00001), '+0/s');
  assert.equal(signedRate(-1e-12), '+0/s');
  assert.equal(signedRate(.3 - .2), '+0.1/s');
  assert.equal(signedRate(.000123456), '+0/s');
});

test('resource display retains two decimals and suppresses binary roundoff without rounding up stock', () => {
  assert.equal(formatResourceNumber(123.456789), '123.45');
  assert.equal(formatResourceNumber(0.01), '0.01');
  assert.equal(formatResourceNumber(0.009999), '0');
  assert.equal(formatResourceNumber(.3 - .2), '0.1');
  assert.equal(formatResourceNumber(2.05 - 2), '0.05');
  assert.equal(formatResourceNumber(1.23 - Number.EPSILON), '1.23');
  assert.equal(formatResourceNumber(-1.234567), '−1.23');
  assert.equal(formatResourceNumber(-1e-12), '0');
  assert.equal(formatResourceNumber(12345.6789), '12.34K');
  assert.equal(formatResourceNumber(Infinity), '∞');
});

test('formatting truncates stock and handles invalid and negative values', () => {
  assert.equal(formatNumber(NaN), '0'); assert.equal(formatNumber(Infinity), '0');
  assert.equal(formatNumber(12345), '12.34K'); assert.equal(formatNumber(-12.39), '−12.3');
  assert.equal(formatNumber(9999.99), '9999'); assert.equal(formatNumber(1e6), '1M');
});
