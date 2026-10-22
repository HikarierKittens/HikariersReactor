/** Moved verbatim out of tests/modules.test.ts during the 2026-10-22 split.
 *  Keep the assertions unchanged: they are the historical regression net. */
import { CONFIG } from '../src/data/config';
import assert from 'node:assert/strict';
import { supplyPower } from './support/power';
import { test } from 'node:test';
import { calculateBuildingOutput, calculateWorkerCapacity, hasContinuousEnergyInput } from '../src/simulation/building-production';
import { changeWorkerAssignment } from '../src/simulation/commands';
import { investInProject, calculateProjectCost } from '../src/simulation/projects';
import { calculateStorageDetails } from '../src/simulation/storage';
import { describeQueuedPurchases } from '../src/simulation/purchases';
import { calculateEffectiveParticles, calculateParticleMultiplier } from '../src/simulation/crafting';
import { estimateResourceWait, estimateQueueTimes } from '../src/vue/queue-estimates';
import { BUILDINGS, BUILDING_GROUPS } from '../src/data/buildings';
import type { BuildingId } from '../src/types/buildings';
import { isBuildingUnderworking } from '../src/vue/building-status';
import { calculateResourceFactorRows } from '../src/simulation/resource-breakdown';
import { completeKerberosMission } from '../src/simulation/commands';
import { calculateContainerUnitCapacity } from '../src/simulation/containers';
import { calculateCraftingMultiplier } from '../src/simulation/crafting';
import { calculateSoldierCapacity } from '../src/simulation/government';
import { isBuildingUnlocked, isTechnologyUnlocked } from '../src/simulation/unlocks';
import { calculateSpaceFuelMultiplier, calculateAsrielMissionCost } from '../src/simulation/space-fuel';
import { calculateBuildingInput } from '../src/simulation/building-production';
import { calculateBuildingCost } from '../src/simulation/costs';
import { calculateStorageBonuses } from '../src/simulation/storage-bonuses';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { TECHNOLOGIES } from '../src/data/technologies';
import { completeAsrielMission } from '../src/simulation/commands';
import { createInitialState } from '../src/state/create-state';
import { allocateAsrielSupport } from '../src/simulation/asriel';
import { calculateProduction } from '../src/simulation/production';
import { validateEconomyRecords } from '../src/state/validate-economy';

test('实验室 holds 1000 knowledge per building and doubles to 2000 only while funded after 电力', () => {
  const labKnowledge = (state: ReturnType<typeof createInitialState>) => {
    const support = calculateSupportPreview(state);
    return calculateStorageDetails('knowledge', state, { ...support, moonBaseUnits: support.moon.baseUnits }).rows
      .filter(row => row.name.startsWith('实验室')).reduce((sum, row) => sum + row.value, 0);
  };
  // Before 电力 the laboratory is a free building: 5 × 1000, no power requested.
  const free = createInitialState(CONFIG.version, 60, 0);
  free.buildings.lab = 5; free.workers.lab = 5;
  assert.equal(labKnowledge(free), 5000);
  assert.deepEqual(calculateProduction(free).power, { generated: 0, used: 0, available: 0 });

  // After 电力 each lab requests 2 power; with none supplied it keeps the base 1000,
  // but 猫猫科学家 keep their jobs and output regardless of power.
  const dark = createInitialState(CONFIG.version, 60, 0);
  dark.tech.push('electricity'); dark.buildings.lab = 5; dark.workers.lab = 5;
  assert.equal(labKnowledge(dark), 5000);
  assert.equal(calculateProduction(dark).power.available, -10, 'five unfunded labs request 10 watts');
  assert.equal(calculateProduction(dark).rates.knowledge, 10, 'unfunded labs still settle their scientists');

  // Three funded labs out of five: 5000 base + 3 × 1000 powered. Every lab still
  // works, so all five scientists keep producing.
  const partial = createInitialState(CONFIG.version, 60, 0);
  partial.tech.push('electricity'); partial.buildings.lab = 5; partial.workers.lab = 5;
  supplyPower(partial, 6);
  const partialProduction = calculateProduction(partial);
  assert.equal(partialProduction.inputUnits.lab, 5, 'unpowered labs keep their 猫猫科学家');
  assert.equal(labKnowledge(partial), 8000);
  assert.equal(partialProduction.power.used, 6);
  assert.equal(partialProduction.rates.knowledge, 10, 'scientist output never depends on funding');

  // Fully funded: every building reaches 2000 and scientist output is unpenalised.
  const lit = createInitialState(CONFIG.version, 60, 0);
  lit.tech.push('electricity'); lit.buildings.lab = 5; lit.workers.lab = 5;
  supplyPower(lit, 100);
  const litProduction = calculateProduction(lit);
  assert.equal(litProduction.inputUnits.lab, 5);
  assert.equal(litProduction.rates.knowledge, 10, '猫猫科学家 produce 2 knowledge each');
  assert.equal(litProduction.power.used, 10);
});

test('stock capacity uses live population, bonds replace stocks and exchanges scale subtotal', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
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
  const state = createInitialState(CONFIG.version, 60, 0);
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
  const state = createInitialState(CONFIG.version, 60, 0);
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
  state.resources.oil = 100; supplyPower(state, 100);
  const upgraded = calculateProduction(state);
  state.tech = state.tech.filter(id => id !== 'helium3ExtractionOptimization');
  const baseline = calculateProduction(state);
  assert.ok(Math.abs(upgraded.rates.helium3 / baseline.rates.helium3 - 1.25) < 1e-8);
});

test('planetary foundries share artisans and boost both crafting paths only while supported', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.tech.push('castingWorkshop', 'planetaryExploration', 'alienCasting');
  state.buildings.asrielSpaceport = 1;
  state.buildings.asrielResidence = 1;
  state.buildings.planetaryFoundry = 2;
  state.population = 4;
  state.workers.asrielResidence = 2;
  state.resources.helium3 = 100; state.resources.food = 100;
  supplyPower(state, 100);
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

test('Kerberos mission is independent and geothermal generation no longer boosts lunar iridium', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
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
  assert.deepEqual(base.power, { generated: 10, used: 4, available: 6 });
  assert.ok(Math.abs(base.rates.energy - 6) < 1e-8, '10 geothermal energy minus 4 lunar base maintenance');
  // 0.9.38 移除了「每座地热发电站 +5% 月球铱矿」：明细里不应再有这一行。
  const rows = calculateResourceFactorRows('iridium', state, base).rows;
  const mineIndex = rows.findIndex(row => row.name === BUILDINGS.iridiumMine.name);
  assert.ok(mineIndex >= 0);
  assert.equal(rows.some(row => row.name === '地热发电站'), false, `no geothermal row [${rows.map(row => row.name).join(' / ')}]`);
  // 关掉地热后铱矿产量不变——加成确实没有了，而不是换个地方生效。
  const iridium = base.rates.iridium;
  state.stoppedBuildings.geothermalPlant = 1; supplyPower(state, 10);
  const off = calculateProduction(state);
  assert.ok(Math.abs(iridium - off.rates.iridium) < 1e-8, `iridium unchanged [${iridium} vs ${off.rates.iridium}]`);
});

test('space garrison increases soldiers without support and reinforced containers double current base', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
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
  const state = createInitialState(CONFIG.version, 60, 0);
  state.buildings.asrielMine = 2;
  state.buildings.spaceWaystation = 1;
  supplyPower(state, 5);
  assert.equal(isBuildingUnderworking('asrielMine', state, calculateProduction(state)), true);
  assert.equal(isBuildingUnderworking('spaceWaystation', state, calculateProduction(state)), false);
  state.stoppedBuildings.asrielMine = 2;
  assert.equal(isBuildingUnderworking('asrielMine', state, calculateProduction(state)), false);
  supplyPower(state, 0);
  assert.equal(isBuildingUnderworking('spaceWaystation', state, calculateProduction(state)), true);
  state.stoppedBuildings.spaceWaystation = 1;
  assert.equal(isBuildingUnderworking('spaceWaystation', state, calculateProduction(state)), false);
  state.buildings.moonBase = 1;
  state.buildings.iridiumMine = 3;
  supplyPower(state, 4);
  state.resources.oil = 2;
  assert.equal(isBuildingUnderworking('iridiumMine', state, calculateProduction(state)), true);
  state.tech.push('automatedMining');
  state.buildings.mine = 1;
  supplyPower(state, 0);
  assert.equal(isBuildingUnderworking('mine', state, calculateProduction(state)), true);
});

test('all support-consuming buildings expose power switches and stopped Asriel units release support', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    if (BUILDINGS[id].moonSupport || BUILDINGS[id].support) assert.equal(hasContinuousEnergyInput(id, state), true, id);
  }
  assert.equal(hasContinuousEnergyInput('spaceWaystation', state), true);
  assert.equal(hasContinuousEnergyInput('starRingStation', state), false);
  state.buildings.asrielSpaceport = 1;
  // Direct allocator input: this is a remaining pool for the unit-level API, not saved supply.
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

test('waystations compound space fuel discounts and add passive capacity/support', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.buildings.spaceWaystation = 20;
  supplyPower(state, 109);
  const factor = .95 ** 20;
  assert.equal(calculateSpaceFuelMultiplier(state), factor);
  assert.ok(factor > .35 && factor < .36);
  assert.equal(calculateBuildingInput('moonBase', state).oil, 2 * factor);
  assert.equal(calculateBuildingInput('asrielSpaceport', state).helium3, 2 * factor);
  assert.equal(calculateBuildingInput('spaceFactory', state).helium3, 2 * factor);
  assert.equal(calculateBuildingInput('refinery', state).oil, calculateBuildingInput('refinery', createInitialState(CONFIG.version, 60, 0)).oil);
  const baseline = createInitialState(CONFIG.version, 60, 0);
  for (const id of ['moonBase', 'asrielSpaceport', 'spaceFactory'] as const) {
    const original = calculateBuildingCost(id, 0, baseline);
    const discounted = calculateBuildingCost(id, 0, state);
    for (const [r, n] of Object.entries(original)) assert.equal(discounted[r as keyof typeof discounted], r === 'oil' || r === 'helium3' ? n * factor : n);
  }
  state.buildings.moonBase = 1;
  state.buildings.asrielSpaceport = 1;
  state.resources.oil = 2 * factor;
  state.resources.helium3 = 2 * factor;
  supplyPower(state, 109);
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
  const state = createInitialState(CONFIG.version, 60, 0);
  state.buildings.spaceWaystation = 2;
  supplyPower(state, 10);
  let production = calculateProduction(state);
  assert.equal(production.inputUnits.spaceWaystation, 2);
  assert.deepEqual(production.power, { generated: 10, used: 10, available: 0 });
  assert.equal(production.rates.energy, 0);
  assert.equal(production.asriel.capacity, 0);
  assert.equal(calculateSpaceFuelMultiplier(state), .95 ** 2);
  state.stoppedBuildings.spaceWaystation = 1;
  production = calculateProduction(state);
  assert.equal(production.inputUnits.spaceWaystation, 1);
  assert.deepEqual(production.power, { generated: 10, used: 5, available: 5 });
  assert.equal(production.rates.energy, 5);
  assert.equal(production.asriel.capacity, 0);
  assert.equal(calculateSpaceFuelMultiplier(state), .95);
  supplyPower(state, 0);
  production = calculateProduction(state);
  assert.equal(production.inputUnits.spaceWaystation, 0);
  assert.equal(production.asriel.capacity, 0);
  assert.equal(calculateSpaceFuelMultiplier(state), 1);
  supplyPower(state, 5);
  production = calculateProduction(state, .2);
  assert.equal(production.inputUnits.spaceWaystation, 1);
  assert.deepEqual(production.power, { generated: 5, used: 5, available: 0 });
  assert.equal(production.rates.energy, 0);
  assert.equal(production.asriel.capacity, 0);
});

test('late space technologies use exact prices and vault base capacity additions', () => {
  assert.deepEqual(TECHNOLOGIES.iridiumSteelVault.cost, { knowledge: 155000, cash: 75000, metal: 2500, iridium: 1000 });
  assert.equal(TECHNOLOGIES.iridiumSteelVault.tier, 12);
  assert.equal(TECHNOLOGIES.iridiumSteelVault.resourceRequired, 'iridium');
  assert.deepEqual(TECHNOLOGIES.spaceTransitStation.cost, { knowledge: 210000, metal: 1000, alloy: 1000 });
  assert.equal(TECHNOLOGIES.spaceTransitStation.tier, 13);
  assert.equal(TECHNOLOGIES.spaceTransitStation.name, '电磁弹射系统');
  assert.equal(BUILDINGS.spaceWaystation.name, '电磁发射器');
  assert.equal(BUILDINGS.spaceWaystation.asrielSupport, undefined);
  assert.equal(BUILDING_GROUPS.at(-1)?.name, '公共事业部门');
  assert.deepEqual(BUILDING_GROUPS.at(-1)?.buildings, ['particleAccelerator', 'spaceWaystation']);
  const state = createInitialState(CONFIG.version, 60, 0);
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
  assert.throws(() => validateEconomyRecords(raw, state), /建筑/);
});

test('queue estimates handle deficits, capacity, FIFO reservations and ARPA partial funding', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
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
  const state = createInitialState(CONFIG.version, 60, 0);
  state.prestige.particles = 1000;
  assert.equal(calculateParticleMultiplier('food', state), 1 + effective(1000) * .005);
  assert.equal(calculateParticleMultiplier('plank', state), 1 + effective(1000) * .000625);
  assert.equal(calculateParticleMultiplier('energy', state), 1);
  assert.equal(state.prestige.particles, 1000);
  assert.ok(Number.isFinite(effective(Number.MAX_SAFE_INTEGER)));
});
