import { CONFIG } from '../src/data/config';
import assert from 'node:assert/strict';
import { supplyPower } from './support/power';
import { advanceSoldierTraining } from '../src/simulation/military';
import { calculateSoldierCapacity, calculateOperationalSoldierCapacity, calculateArmyLimit } from '../src/simulation/government';

test('garrison training uses whole paid upkeep while soldiers above the limit are removed', () => {
  for (const dt of [.2, 1]) {
    const s = createInitialState(CONFIG.version, 60, 0); s.tech.push('military');
    s.buildings.spaceGarrison = 2; s.stoppedBuildings.spaceGarrison = 1;
    s.resources.food = 10 * dt; s.resources.oil = .5 * dt;
    const paid = calculateProduction(s, dt).inputUnits.spaceGarrison || 0;
    assert.equal(paid, 1); assert.equal(calculateOperationalSoldierCapacity(s, paid), 2);
    s.trainingProgress = 30 - dt; advanceSoldierTraining(s, dt);
    assert.equal(s.soldiers, 1);
    // Unpaid upkeep pauses training but never deletes a soldier that is inside the limit.
    s.resources.oil = 0; s.trainingProgress = 30 - dt;
    const limitWhileUnpaid = calculateArmyLimit(s);
    assert.equal(limitWhileUnpaid, 2, 'the limit follows switched-on capacity, not payment');
    advanceSoldierTraining(s, dt); assert.equal(s.soldiers, 1); assert.equal(s.trainingProgress, 0);
    // Switching the garrison off lowers the limit and removes the surplus at once.
    s.stoppedBuildings.spaceGarrison = 2;
    assert.equal(calculateArmyLimit(s), 0);
    advanceSoldierTraining(s, dt); assert.equal(s.soldiers, 0); assert.equal(calculateSoldierCapacity(s), 4);
    assert.equal(calculateOperationalSoldierCapacity(s, .5), 0);
  }
});

test('AI core pays both upkeep resources only when a whole core can run', () => {
  for (const dt of [.2, 1]) {
    const s = createInitialState(CONFIG.version, 60, 0); s.tech.push('artificialIntelligenceII'); s.buildings.aiSupercore = 1;
    s.resources.helium3 = 25 * dt; supplyPower(s, 100);
    let p = calculateProduction(s, dt);
    assert.equal(p.inputUnits.aiSupercore, 1);
    assert.deepEqual(p.power, { generated: 100, used: 100, available: 0 });
    assert.equal(p.rates.energy, 0);
    assert.equal(p.pool.energy, 0, 'electricity is a fixed budget, not stored');
    assert.ok(Math.abs(p.rates.helium3 + 25) < 1e-8);
    supplyPower(s, 99);
    p = calculateProduction(s, dt);
    assert.equal(p.inputUnits.aiSupercore, 0); assert.equal(p.rates.helium3, 0);
    // The core stays enabled, so its 100 W is still requested even though unfunded.
    assert.deepEqual(p.power, { generated: 99, used: 0, available: -1 });
    assert.equal(p.rates.energy, -1, 'requested demand exceeds generation by one watt');
    supplyPower(s, 100); s.resources.helium3 = 24 * dt;
    p = calculateProduction(s, dt);
    assert.equal(p.inputUnits.aiSupercore, 0);
    assert.deepEqual(p.power, { generated: 100, used: 0, available: 0 });
    assert.equal(p.rates.energy, 0);
    s.resources.helium3 = 25 * dt; s.buildings.aiSupercore = 0; s.buildings.aiSupercoreSegments = 99;
    p = calculateProduction(s, dt);
    assert.equal(p.inputUnits.aiSupercore, 0);
    assert.deepEqual(p.power, { generated: 100, used: 0, available: 100 });
    assert.equal(p.rates.energy, 100);
  }
});

test('AI power warning compares whole cores rather than construction segments', () => {
  const s = createInitialState(CONFIG.version, 60, 0);
  s.tech.push('artificialIntelligenceII');
  s.buildings.aiSupercore = 1;
  s.resources.helium3 = 25; supplyPower(s, 100);
  assert.equal(isBuildingUnderworking('aiSupercore', s, calculateProduction(s)), false);
  s.resources.helium3 = 24;
  assert.equal(isBuildingUnderworking('aiSupercore', s, calculateProduction(s)), true);
  s.stoppedBuildings.aiSupercore = 1;
  assert.equal(isBuildingUnderworking('aiSupercore', s, calculateProduction(s)), false);
  s.stoppedBuildings.aiSupercore = 0;
  s.buildings.aiSupercore = 0; s.buildings.aiSupercoreSegments = 99;
  assert.equal(isBuildingUnderworking('aiSupercore', s, calculateProduction(s)), false);
});
import { calculateQuantumLevel, calculateQuantumSnapshot, calculateSwarmSupportCapacity } from '../src/simulation/quantum';
import { calculateSpaceMultiplier } from '../src/simulation/asriel';

import { SHIP_COMPONENTS, investInShipComponent } from '../src/simulation/spaceship';
import { launchEscapePrestige, resetRunState } from '../src/simulation/prestige';
import { calculateEscapePrestigeReward, calculateCasimirReward } from '../src/simulation/government';
import { calculateParticleMultiplier } from '../src/simulation/crafting';
import { investInProject } from '../src/simulation/projects';
import { calculateFactoryRecipe } from '../src/simulation/factory';
import { test } from 'node:test';
import { createInitialState } from '../src/state/create-state';
import { completeSpaceMission } from '../src/simulation/commands';
import { calculateSpaceMissionCost, calculateRegionalMissionCost } from '../src/simulation/space-missions';
import { isTechnologyUnlocked, isBuildingUnlocked, isResourceUnlocked } from '../src/simulation/unlocks';
import { calculateProduction } from '../src/simulation/production';
import { calculateProductionMultiplier } from '../src/simulation/multipliers';
import { calculateResourceBreakdown, calculateResourceFactorRows } from '../src/simulation/resource-breakdown';
import { calculateStorageBonuses } from '../src/simulation/storage-bonuses';
import { calculateBuildingOutput } from '../src/simulation/building-production';
import { calculateBuildingCost, calculateBuildingScale } from '../src/simulation/costs';
import { isContainerAssignable } from '../src/simulation/containers';
import { isBuildingUnderworking } from '../src/vue/building-status';
import { validateAndMigrateSave } from '../src/state/validate-save';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateStorageDetails } from '../src/simulation/storage';
import { BUILDINGS } from '../src/data/buildings';
import { TECHNOLOGIES } from '../src/data/technologies';
import { calculateContainerUnitCapacity } from '../src/simulation/containers';
import { calculateStorageTotals } from '../src/simulation/storage';
import { storageSnapshot as storageSnapshotFor } from '../src/vue/format';
import type { TechnologyId } from '../src/types/technologies';
import { requestPurchaseModule, settlePurchaseQueue, removeQueuedPurchase, queueLength } from '../src/simulation/purchases';
import { estimateQueueTimes } from '../src/vue/queue-estimates';
import { validateSaveQueue } from '../src/state/validate-queue';
import { enqueueProject, advanceProjectQueue } from '../src/simulation/project-queue';

test('regional tasks share building queue, reject duplicates and complete at live discounted price', () => {
  const s = fresh(); s.tech.push('planetaryExploration');
  assert.equal(requestPurchaseModule(s, 'mission', 'asriel', 0).status, 'queued');
  assert.equal(requestPurchaseModule(s, 'mission', 'asriel', 0).status, 'rejected');
  assert.equal(requestPurchaseModule(s, 'mission', 'kerberos', 0).status, 'queued');
  assert.equal(queueLength(s, 'build'), 2);
  s.tech.push('arpa', 'monument');
  assert.equal(enqueueProject(s, 'monument'), 0);
  assert.deepEqual(validateSaveQueue(s.queue, s), s.queue);
  assert.throws(() => validateSaveQueue([{ uid: 1, kind: 'mission', id: 'asriel' }, { uid: 2, kind: 'mission', id: 'asriel' }], s));
  assert.throws(() => validateSaveQueue([{ uid: 1, kind: 'mission', id: 'solar' }], s));
  const savedQueue = JSON.stringify(s.queue);
  const rates = { ...s.resources, helium3: 100 }, caps = { ...s.resources, helium3: 20000 };
  const first = s.queue[0]; assert.ok(first);
  assert.ok(estimateQueueTimes(s, rates, caps).get(first.uid)?.includes('预计'));
  assert.equal(JSON.stringify(s.queue), savedQueue);
  s.resources.helium3 = 5000;
  settlePurchaseQueue(s, 0);
  assert.equal(s.asrielMissionCompleted, true);
  assert.equal(s.kerberosMissionCompleted, false);
  s.buildings.spaceWaystation = 1; supplyPower(s, 100); s.resources.helium3 = 4750;
  settlePurchaseQueue(s, 0);
  assert.equal(s.kerberosMissionCompleted, true);
  assert.equal(s.resources.helium3, 0);
  assert.equal(s.queue.length, 0);
});
test('mission force-queue cancellation and ARPA ordering preserve resource balances', () => {
  const s = fresh(); s.tech.push('planetaryExploration', 'arpa', 'monument'); s.resources.helium3 = 5000;
  s.settings.unorderedBuildingQueue = false;
  assert.equal(requestPurchaseModule(s, 'mission', 'kerberos', 0, true).status, 'queued');
  assert.equal(s.kerberosMissionCompleted, false);
  assert.equal(s.resources.helium3, 5000);
  assert.equal(enqueueProject(s, 'monument'), 1);
  s.resources.stone = 100000;
  assert.equal(advanceProjectQueue(s, 1, () => 0).completed, 0);
  const first = s.queue[0]; assert.ok(first);
  removeQueuedPurchase(s, first.uid);
  assert.equal(s.resources.helium3, 5000);
  assert.equal(advanceProjectQueue(s, 1, () => 0).completed, 1);
  assert.equal(requestPurchaseModule(s, 'mission', 'kerberos', 0).status, 'buy-now');
  assert.equal(s.kerberosMissionCompleted, true);
});

const fresh = () => createInitialState(CONFIG.version, 60, 0);
test('alien labs require support for capacities and ring optimization uses supported labs only', () => {
  const s = fresh(); s.buildings.asrielSpaceport = 2; s.buildings.asrielResidence = 1;
  s.buildings.alienMaterialLab = 8; s.buildings.starRingStation = 1;
  s.population = 2; s.workers.asrielResidence = 2;
  Object.assign(s.resources, { food: 100, helium3: 100 });
  supplyPower(s, 100);
  const preview = calculateSupportPreview(s);
  assert.equal(preview.asriel.allocations.alienMaterialLab, 7);
  assert.deepEqual(calculateStorageBonuses('alienMaterialLab', s, preview.moon, preview.asriel), { knowledge: 500, e710: 25 });
  // 0.25% base per resident: 2 residents × 1 station = +0.5%.
  assert.ok(Math.abs(calculateSpaceMultiplier('oilExtractor', s, preview.asriel) - 1.005) < 1e-8);
  s.tech.push('starRingOptimization');
  // 星环优化 adds 0.01% per supported lab (7 here) on top of the unchanged 0.25% base.
  assert.ok(Math.abs(calculateSpaceMultiplier('oilExtractor', s, preview.asriel) - (1 + (0.0025 + 7 * 0.0001) * 2)) < 1e-8);
  assert.equal(calculateSpaceMultiplier('refinery', s, preview.asriel), 1);
});
test('AI core segments have immutable cost and grant quantum only when complete and fueled', () => {
  const s = fresh(); s.tech.push('artificialIntelligenceII'); s.buildings.lab = 50;
  s.buildings.aiSupercore = 0; s.buildings.aiSupercoreSegments = 99; s.resources.helium3 = 1000; supplyPower(s, 1000);
  const base = calculateQuantumLevel(s);
  s.crispr.push('materialEfficiency');
  assert.deepEqual(calculateBuildingCost('aiSupercoreSegments', 0, s), calculateBuildingCost('aiSupercoreSegments', 999, s));
  assert.deepEqual(calculateBuildingCost('aiSupercoreSegments', 999, s), { cash: 100000, metal: 10000, alloy: 5000, e710: 10, nanotubes: 50000 });
  s.buildings.aiSupercore = 1; s.buildings.aiSupercoreSegments = 0;
  assert.equal(calculateQuantumLevel(s), Math.floor(calculateQuantumSnapshot(s).base * 1.25 * 100) / 100);
  assert.ok(Math.abs(calculateProduction(s).rates.helium3 + 25) < 1e-8);
  s.buildings.spaceWaystation = 1; supplyPower(s, 100);
  assert.ok(Math.abs(calculateProduction(s).rates.helium3 + 25) < 1e-8);
  s.resources.helium3 = 0; assert.equal(calculateQuantumLevel(s), base);
});
test('each segmented queue project reserves one slot and requests ten percent of total construction', () => {
  const s = fresh(); s.tech.push('artificialIntelligenceII'); s.talosMoonMissionCompleted = true;
  for (let i = 0; i < 2; i++) assert.equal(requestPurchaseModule(s, 'build', 'aiSupercoreSegments', 0, true).status, 'queued');
  assert.equal(s.queue.length, 2); assert.equal(queueLength(s, 'build'), 2);
  assert.ok(s.queue.every(item => item.kind === 'build' && item.segments === 10));
  assert.equal(requestPurchaseModule(s, 'build', 'aiSupercoreSegments', 0, true).status, 'queue-full');
  assert.equal(validateSaveQueue(s.queue, s).length, 2);
  const first = s.queue[0]; assert.ok(first);
  removeQueuedPurchase(s, first.uid); assert.equal(queueLength(s, 'build'), 1);
});
test('queued ship funding checks once per second and leaves sub-one-percent stocks untouched', () => {
  const s = fresh(); s.buildings.interstellarDock = 1; s.shipComponents.hull = true;
  requestPurchaseModule(s, 'ship', 'computer', 0, true);
  s.resources.knowledge = 9999; supplyPower(s, 999);
  settlePurchaseQueue(s, 0); advanceProjectQueue(s, .5, () => 0);
  assert.equal(s.resources.knowledge, 9999);
  advanceProjectQueue(s, .5, () => 0);
  assert.equal(s.resources.knowledge, 9999);
  assert.equal(s.shipResourceProgress.computer?.knowledge, undefined, 'no sub-one-percent knowledge is paid');
  supplyPower(s, 1000); s.resources.knowledge = 10000;
  advanceProjectQueue(s, .5, () => 0); assert.equal(s.resources.knowledge, 10000);
  advanceProjectQueue(s, .5, () => 0); assert.equal(s.shipResourceProgress.computer?.knowledge, 1);
  // Power is a fixed supply budget now: the one-time energy fee is never a deposited stock.
  assert.equal(s.shipResourceProgress.computer?.energy, undefined);
  assert.equal(s.resources.energy, 0);
  s.resources.knowledge = 50; investInShipComponent('computer', 'max', s);
  assert.equal(s.resources.knowledge, 0);
});
test('quantum manufacturing multiplies factory source output only', () => {
  const s = fresh(); s.tech.push('artificialIntelligenceII'); s.buildings.lab = 100;
  s.buildings.factory = 1; s.lines.alloy = 1;
  Object.assign(s.resources, { metal: 10000, aluminum: 10000, iron: 10000, copper: 10000 });
  supplyPower(s, 100);
  const before = calculateProduction(s);
  s.tech.push('quantumManufacturing'); const after = calculateProduction(s);
  assert.ok(Math.abs(after.rates.alloy - before.rates.alloy * (1 + .5 * (after.quantum.level - 1))) < 1e-8);
  assert.equal(after.rates.metal, before.rates.metal); assert.equal(after.rates.aluminum, before.rates.aluminum);
  assert.deepEqual(calculateFactoryRecipe('alloy', s), calculateFactoryRecipe('alloy', { ...s, tech: s.tech.filter(id => id !== 'quantumManufacturing') }));
  assert.ok(calculateResourceFactorRows('alloy', s, after).rows.some(row => row.name === '量子制造' && row.child));
});
test('swarm factory discounts compound and quantum swarm changes total support', () => {
  const s = fresh(); const base = calculateBuildingCost('swarmSatellite', 0, s);
  s.buildings.swarmFactory = 2;
  const discounted = calculateBuildingCost('swarmSatellite', 0, s);
  for (const [id, value] of Object.entries(base)) assert.ok(Math.abs(discounted[id as keyof typeof base]! - value * .81) < 1e-8);
  s.tech.push('artificialIntelligenceII', 'quantumSwarm'); s.buildings.lab = 250;
  s.buildings.swarmControlStation = 2;
  assert.equal(calculateSwarmSupportCapacity(s), 2 * (20 + calculateQuantumLevel(s)));
  const ship = fresh(); ship.tech.push('swarmFactoryOptimization'); ship.buildings.ironMiningShip = 2;
  ship.population = 2; // 采矿船操作员 for both enabled iron ships
  Object.assign(ship.resources, { helium3: 100 });
  supplyPower(ship, 100);
  const liveDiscount = calculateBuildingCost('swarmFactory', 0, ship);
  assert.ok(Math.abs(liveDiscount.cash! - 75000 * .95 ** 2) < 1e-8);
  ship.stoppedBuildings.ironMiningShip = 2;
  assert.equal(calculateBuildingCost('swarmFactory', 0, ship).cash, 75000);
  s.buildings.swarmFactory = 100000;
  for (const [id, value] of Object.entries(calculateBuildingCost('swarmSatellite', 0, s))) assert.ok(Math.abs(value - base[id as keyof typeof base]! * .05) < 1e-8);
});
test('ARPA and ship accept independent resource deposits without overfill and hull gates later components', () => {
  const s = fresh(); s.tech.push('genetics'); s.resources.knowledge = 100;
  assert.ok(investInProject('geneSequencing', s, 100, () => 0) > 0);
  assert.equal(s.resources.knowledge, 0);
  s.buildings.interstellarDock = 1;
  assert.equal(investInShipComponent('computer', 'max', s).investedPercent, 0);
  s.resources.cash = 2000000;
  investInShipComponent('hull', 'max', s);
  assert.equal(s.resources.cash, 1000000); assert.equal(s.shipComponents.hull, false);
  investInShipComponent('hull', 'max', s); assert.equal(s.resources.cash, 1000000);
  for (const [id, value] of Object.entries(SHIP_COMPONENTS.hull.cost)) s.resources[id as keyof typeof s.resources] = value;
  investInShipComponent('hull', 'max', s); assert.equal(s.shipComponents.hull, true);
  s.resources.knowledge = 500000;
  requestPurchaseModule(s, 'ship', 'computer', 0, true); advanceProjectQueue(s, 1, () => 0);
  assert.equal(s.shipResourceProgress.computer?.knowledge, 50);
  assert.equal(s.shipComponents.computer, false);
  s.resources.knowledge = 500000; supplyPower(s, 100000); advanceProjectQueue(s, 1, () => 0);
  assert.equal(s.shipComponents.computer, true);
  s.population = 20; s.workers.forage = 20;
  investInShipComponent('ecosystem', 10, s);
  assert.equal(s.population, 19); assert.equal(s.shipResourceProgress.ecosystem?.population, 10);
  assert.ok(s.workers.forage <= 19);
});
test('escape rewards apply both softcaps and preserve permanent casimir while clearing ship', () => {
  const s = fresh(); s.population = 300; s.soldiers = 600;
  // crew/3 = 300 sits under the 400 cap, so the reward is the raw value.
  assert.equal(calculateEscapePrestigeReward(s), 300);
  s.population = 1500;
  // crew/3 = 700 is past the cap; the overflow is squashed, not clipped, so it lands at 571.
  assert.equal(calculateEscapePrestigeReward(s), 571);
  assert.equal(calculateCasimirReward(1600, s), Math.floor(Math.log2(1600) * Math.E));
  assert.equal(launchEscapePrestige(s, 60, 0), null);
  s.buildings.interstellarDock = 1;
  for (const id of Object.keys(SHIP_COMPONENTS) as (keyof typeof SHIP_COMPONENTS)[]) s.shipComponents[id] = true;
  s.prestige.casimir = 10; s.statistics.lifetime.casimirEarned = 10; s.prestige.particles = 1000;
  const before = calculateParticleMultiplier('food', s);
  const result = launchEscapePrestige(s, 60, 0)!;
  assert.equal(result.reward, 571); assert.equal(result.casimirReward, Math.floor(Math.log2(571) * Math.E));
  assert.equal(result.next.prestige.casimir, 10 + Math.floor(Math.log2(571) * Math.E)); assert.equal(result.next.prestige.escapeResets, 1);
  assert.equal(result.next.statistics.lifetime.particlesEarned, 571);
  assert.equal(result.next.statistics.lifetime.casimirEarned, 10 + Math.floor(Math.log2(571) * Math.E));
  assert.equal(resetRunState(result.next, 'soft', 60, 0)!.next.statistics.lifetime.casimirEarned, 10 + Math.floor(Math.log2(571) * Math.E));
  assert.equal(resetRunState(result.next, 'hard', 60, 0)!.next.statistics.lifetime.casimirEarned, 0);
  assert.equal(result.next.buildings.interstellarDock, 0); assert.equal(result.next.shipComponents.hull, false);
  assert.ok(calculateParticleMultiplier('food', { ...s, prestige: { ...s.prestige, casimir: 10000 } }) > before);
  assert.equal(resetRunState(result.next, 'soft', 60, 0)!.next.prestige.casimir, 10 + Math.floor(Math.log2(571) * Math.E));
  assert.equal(resetRunState(result.next, 'hard', 60, 0)!.next.prestige.casimir, 0);
});
test('nanotube factory recipe capacity and maintained warehouse use requested base values', () => {
  const s = fresh(); s.tech.push('carbonNanotubes');
  assert.equal(isResourceUnlocked('nanotubes', s), true); assert.equal(isContainerAssignable('nanotubes', s), false);
  const recipe = calculateFactoryRecipe('nanotubes', s);
  assert.equal(recipe.input.neutron, .05); assert.equal(recipe.input.coal, 1); assert.equal(recipe.output.nanotubes, 10);
  assert.equal(calculateStorageBonuses('hangar', s, null).nanotubes, 25000);
  assert.equal(calculateStorageBonuses('hangar', s, null).copper, 8000);
  assert.equal(calculateStorageBonuses('hangar', s, null).polymer, 8000);
  const upgradedHangar = { ...s, tech: [...s.tech, 'iridiumAlloyWarehouse' as TechnologyId] };
  assert.equal(calculateStorageBonuses('hangar', upgradedHangar, null).polymer, 16000);
  s.buildings.e710Warehouse = 2; supplyPower(s, 7);
  const p = calculateProduction(s); assert.equal(p.inputUnits.e710Warehouse, 1);
  // Both warehouses stay enabled, so 14 W is requested against 7 W generated.
  assert.deepEqual(p.power, { generated: 7, used: 7, available: -7 });
  assert.equal(p.rates.energy, -7, 'warehouse upkeep spends the whole fixed budget and requests one more');
  assert.equal(p.pool.energy, 0);
});
test('misen multi-resource mission queues atomically and discounts only helium fuel', () => {
  const s = fresh(); s.tech.push('exoticElementResearch', 'misenDiscovery');
  assert.equal(isResourceUnlocked('e710', s), true);
  assert.equal(isBuildingUnlocked('e710Warehouse', s), false);
  s.resources.e710 = 49; s.resources.helium3 = 30000;
  assert.equal(requestPurchaseModule(s, 'mission', 'misen', 0).status, 'queued');
  assert.equal(s.resources.helium3, 30000);
  s.buildings.spaceWaystation = 1; supplyPower(s, 100);
  assert.deepEqual(calculateRegionalMissionCost(s, 'misen'), { helium3: 28500, e710: 50 });
  s.resources.e710 = 50; settlePurchaseQueue(s, 0);
  assert.equal(s.misenMissionCompleted, true);
  assert.equal(s.resources.e710, 0); assert.equal(s.resources.helium3, 1500);
  assert.equal(isBuildingUnlocked('e710Warehouse', s), true);
  assert.equal(isBuildingUnlocked('e710Reactor', s), true);
  assert.equal(TECHNOLOGIES.misenDiscovery.tier, 15);
});
test('E-710 dedicated storage maintenance, space production and reactor settle once', () => {
  const s = fresh(); s.tech.push('exoticElementResearch');
  s.buildings.e710Container = 2; s.buildings.e710MiningShip = 1; s.buildings.aiSupercore = 0;
  s.population = 2; // two 采矿船操作员 for the enabled E-710 ship
  s.resources.helium3 = 100; s.resources.e710 = 1;
  let p = calculateProduction(s);
  // E-710 mining ship helium upkeep is now 3/s, container 2 × .5 = 1 (total 4).
  assert.equal(p.rates.helium3, -4);
  // Two working cats add population pressure, so the ship output carries the morale multiplier.
  assert.ok(Math.abs(p.rates.e710 - .01 * calculateProductionMultiplier('e710', p.morale.happiness, s)) < 1e-8);
  assert.equal(calculateStorageDetails('e710', s, { ...calculateSupportPreview(s), moonBaseUnits: 0 }).total, 100);
  s.resources.helium3 = 0;
  assert.equal(calculateStorageDetails('e710', s, { ...calculateSupportPreview(s), moonBaseUnits: 0 }).total, 0);
  s.buildings.e710Warehouse = 1; supplyPower(s, 7);
  assert.equal(calculateStorageDetails('e710', s, { ...calculateSupportPreview(s), moonBaseUnits: 0 }).total, 200);
  s.buildings.e710Reactor = 1; p = calculateProduction(s);
  assert.deepEqual(p.power, { generated: 32, used: 7, available: 25 });
  assert.equal(p.rates.energy, 25); assert.ok(Math.abs(p.rates.e710 + .05) < 1e-8);
  s.resources.e710 = 0;
  const dry = calculateProduction(s);
  assert.deepEqual(dry.power, { generated: 7, used: 7, available: 0 });
  assert.equal(dry.rates.energy, 0, 'an unfueled reactor adds no generation');
  assert.equal(isContainerAssignable('e710', s), false);
});
test('drone bonus is attached to neutron source and oil extractor receives space ring bonus', () => {
  const s = fresh(); s.tech.push('outerPlanetExploration');
  assert.equal(isTechnologyUnlocked('talosMoonScanning', s), false);
  s.talosMoonMissionCompleted = true;
  assert.equal(isTechnologyUnlocked('talosMoonScanning', s), true);
  s.buildings.miningDrone = 3;
  assert.ok(Math.abs(calculateBuildingOutput('talosMoonMiningStation', s).neutron! - .05 * 1.15) < 1e-8);
  assert.equal(BUILDINGS.refinery.output?.oil, 1);
  s.buildings.oilExtractor = 1;
  s.buildings.asrielSpaceport = s.buildings.asrielResidence = 1; s.buildings.starRingStation = 10;
  s.population = 2; s.workers.asrielResidence = 2;
  Object.assign(s.resources, { food: 100, helium3: 100 });
  supplyPower(s, 100);
  s.buildings.talosMoonMiningStation = 1; s.resources.oil = 100;
  const p = calculateProduction(s);
  const neutronRows = calculateResourceFactorRows('neutron', s, p).rows;
  const sourceIndex = neutronRows.findIndex(row => row.name === '塔卫二采矿站');
  assert.ok(sourceIndex >= 0);
  const droneRow = neutronRows[sourceIndex + 1]; assert.ok(droneRow);
  assert.equal(droneRow.name, '采矿无人机');
  assert.equal(droneRow.value, '+15%');
  assert.equal(droneRow.child, true);
  const detail = calculateResourceBreakdown('oil', s, p);
  assert.ok(detail.entries.some(row => row.id === 'oilExtractor' && row.kind === 'income' && row.value > 1));
  assert.ok(Math.abs(detail.net - p.rates.oil) < 1e-8);
});
test('outer missions use discounted atomic payment and independent ordered unlock gates', () => {
  const s = fresh();
  s.tech.push('planetaryExploration');
  assert.equal(isTechnologyUnlocked('solarExploration', s), false);
  s.kerberosMissionCompleted = true;
  assert.equal(isTechnologyUnlocked('solarExploration', s), true);
  s.tech.push('solarExploration', 'outerPlanetExploration');
  assert.equal(isTechnologyUnlocked('dysonTheory', s), false);
  assert.equal(completeSpaceMission(s, 'solar'), false);
  assert.equal(completeSpaceMission(s, 'invalid'), false);
  s.buildings.spaceWaystation = 1; supplyPower(s, 100);
  assert.equal(calculateSpaceMissionCost(s, 'solar'), 9500);
  s.resources.helium3 = 9500;
  assert.equal(completeSpaceMission(s, 'solar'), true);
  assert.equal(s.resources.helium3, 0);
  assert.equal(completeSpaceMission(s, 'solar'), false);
  assert.equal(isTechnologyUnlocked('dysonTheory', s), true);
  s.resources.helium3 = 50000;
  assert.equal(completeSpaceMission(s, 'asteroidBelt'), false);
  assert.equal(completeSpaceMission(s, 'talosMoon'), true);
  assert.equal(isBuildingUnlocked('talosMoonMiningStation', s), true);
  assert.equal(completeSpaceMission(s, 'asteroidBelt'), true);
  assert.equal(isTechnologyUnlocked('asteroidBeltMining', s), true);
  assert.equal(s.talosMissionCompleted, false);
  assert.equal(completeSpaceMission(s, 'talos'), true);
  assert.equal(isTechnologyUnlocked('atmosphericMining', s), true);
});
test('swarm generation uses complete support slots and powers maintenance immediately', () => {
  const s = fresh(); s.buildings.swarmSatellite = 25;
  assert.equal(calculateProduction(s).rates.energy, 0);
  s.buildings.swarmControlStation = 1;
  const p = calculateProduction(s);
  assert.equal(p.inputUnits.swarmSatellite, 20);
  assert.equal(p.rates.energy, 10);
  assert.equal(isBuildingUnderworking('swarmSatellite', s, p), true);
  s.stoppedBuildings.swarmSatellite = 5;
  assert.equal(isBuildingUnderworking('swarmSatellite', s, calculateProduction(s)), false);
  s.buildings.atmosphericCollector = 1;
  assert.equal(calculateProduction(s).inputUnits.atmosphericCollector, 1);
  s.stoppedBuildings.swarmSatellite = 25;
  // Unfunded sources are absent from inputUnits rather than reported as zero.
  assert.equal(calculateProduction(s).inputUnits.atmosphericCollector ?? 0, 0);
});
test('outer sources settle maintenance once and attach independent ring bonuses', () => {
  const s = fresh(); Object.assign(s.resources, { oil: 100, food: 100, helium3: 100 });
  supplyPower(s, 100);
  Object.assign(s.buildings, { asrielSpaceport: 1, asrielResidence: 1, starRingStation: 10, moonBase: 1, iridiumMine: 1, atmosphericCollector: 1, talosMoonMiningStation: 1, iridiumMiningShip: 1, ironMiningShip: 1 });
  s.population = 4; s.workers.asrielResidence = 2; // 2 residents + 2 采矿船操作员 (铱/铁各 1)
  const p = calculateProduction(s);
  assert.deepEqual(p.power, { generated: 100, used: 14, available: 86 });
  assert.equal(p.rates.energy, 86, 'energy reports the unused fixed budget');
  assert.equal(p.pool.energy, 0);
  assert.equal(p.rates.oil, -3);
  for (const resource of ['iridium', 'helium3', 'neutron', 'iron'] as const) {
    const detail = calculateResourceBreakdown(resource, s, p);
    assert.ok(Math.abs(detail.net - p.rates[resource]) < 1e-8, resource);
    // 10 stations × 2 residents × 0.25% base = +5%.
    assert.ok(calculateResourceFactorRows(resource, s, p).rows.some(row => row.name === '星环空间站' && row.child && row.value === '+5%'));
  }
  const rows = calculateResourceFactorRows('iridium', s, p).rows;
  assert.equal(rows.filter(row => row.name === '星环空间站').length, 2);
  assert.equal(rows.filter(row => row.name === '地热发电站').length, 0);
  s.stoppedBuildings.iridiumMiningShip = 1;
  assert.equal(calculateProduction(s).inputUnits.iridiumMiningShip, undefined);
  s.tech.push('asteroidMiningOptimization');
  assert.equal(calculateBuildingOutput('iridiumMiningShip', s).iridium, .1);
  assert.equal(calculateBuildingOutput('ironMiningShip', s).iron, 3);
});
test('neutron unlock controls hangar capacity and excludes containers; material upgrades change costs', () => {
  const s = fresh();
  assert.equal(isResourceUnlocked('neutron', s), false);
  assert.equal(calculateStorageBonuses('hangar', s, null).neutron, undefined);
  s.buildings.talosMoonMiningStation = 1;
  assert.equal(isResourceUnlocked('neutron', s), true);
  assert.equal(calculateStorageBonuses('hangar', s, null).neutron, 4000);
  assert.equal(calculateStorageBonuses('talosMoonMiningStation', s, null).neutron, 100);
  assert.equal(isContainerAssignable('neutron', s), false);
  assert.deepEqual(calculateStorageBonuses('galacticFuelDepot', s, null), { oil: 4000, helium3: 2500, uranium: 1500 });
  const original = calculateBuildingCost('asrielResidence', 0, s);
  const scale = calculateBuildingScale('nestMKII', 'cash', s);
  s.tech.push('neutronConstructionMaterials');
  for (const [r, v] of Object.entries(original)) assert.equal(calculateBuildingCost('asrielResidence', 0, s)[r as keyof typeof original], Math.ceil(v * .85));
  assert.equal(calculateBuildingScale('nestMKII', 'cash', s), scale - .01);
  s.arpaBuildings.arpaResearchInstitute = 1;
  assert.equal(isTechnologyUnlocked('laser', s), true);
});
test('missing additive fields reject and explicit malformed outer fields reject', () => {
  const context = { now: 0, eventInterval: 60, housingCapacity: () => 10000, clampResources: () => {} };
  const raw = JSON.parse(JSON.stringify(fresh()));
  for (const id of ['swarmControlStation','swarmSatellite','atmosphericCollector','galacticFuelDepot','talosMoonMiningStation','iridiumMiningShip','ironMiningShip']) for (const field of ['buildings','workers','stoppedBuildings']) delete raw[field][id];
  delete raw.resources.neutron; delete raw.containerAssignments.neutron;
  delete raw.resources.e710; delete raw.containerAssignments.e710; delete raw.misenMissionCompleted;
  for (const id of ['e710Container','e710MiningShip','e710Warehouse','e710Reactor','miningDrone','oilExtractor']) for (const field of ['buildings','workers','stoppedBuildings']) delete raw[field][id];
  for (const key of ['solarMissionCompleted','talosMissionCompleted','talosMoonMissionCompleted','asteroidBeltMissionCompleted']) delete raw[key];
  assert.throws(() => validateAndMigrateSave(raw, context));
  assert.throws(() => validateAndMigrateSave({ ...raw, misenMissionCompleted: null }, context));
  for (const mutate of [(s:any)=>s.solarMissionCompleted=null, (s:any)=>s.resources.neutron=-1, (s:any)=>s.containerAssignments.neutron=1, (s:any)=>s.stoppedBuildings.swarmSatellite=null]) {
    const bad = JSON.parse(JSON.stringify(fresh())); mutate(bad); assert.throws(() => validateAndMigrateSave(bad, context));
  }
  // 这里同时需要「跳过带门槛的科技」和「保留任务标志位所需的科技」（solarExploration 等
  // 两者兼具），因此无法用 technologiesWithoutStateGates() 统一，保留完整的显式清单。
  const full = fresh(); full.tech = Object.keys(TECHNOLOGIES).filter(id => !['spaceControlTower', 'globalObservationCalibration', 'anomalyMapping', 'fieldConstraintTheory', 'dimensionBeaconDeployment','accessPointBeacon','hydrogenRecovery','icebreakingPlan','hyperspaceMiningSurvey','gasCloudAccretion','highTechFarmPlatform','fusionPower','largeMiningShips','dimensionPioneer','highTechFactory','higherDimensionalStorage','e710ResearchStation','ripperOverclock','overclocking13','superMetal','grapheneProcessing','nanoArmor','nanoExoskeleton','advancedConcrete','nanoAlloy','dysonSphere','dysonSphereII','virtualReality','virtualTraining','virtualEntertainment','aerogel','plasmaResearch','plasmaMining','energyShield','stellarForge','hazardousMaterialStorage','aiDataCenter','aiCementWorkshop','advancedAdamantiteProcessing','advancedGrapheneProcessing','penroseTheory','massEjector','gravityConversion','stabilizeBlackHole','exoticRunaway','titaniumIridiumPanels','grapheneConductivePlate'].includes(id)) as TechnologyId[]; full.prestige.nuclearResets = 1;
  full.asrielMissionCompleted = full.kerberosMissionCompleted = full.solarMissionCompleted = full.talosMissionCompleted = full.talosMoonMissionCompleted = full.asteroidBeltMissionCompleted = full.misenMissionCompleted = true;
  full.arpaBuildings.rocketPlatform = full.arpaBuildings.monument = full.arpaBuildings.geneSequencing = 1; full.arpaBuildings.arpaResearchInstitute = 2;
  full.buildings.aiSupercore = 1; full.stoppedBuildings.aiSupercore = 1;
  const restored = validateAndMigrateSave(JSON.parse(JSON.stringify(full)), context);
  assert.equal(restored.asteroidBeltMissionCompleted, true);
  assert.equal(restored.buildings.aiSupercore, 1); assert.equal(restored.stoppedBuildings.aiSupercore, 1);
  full.stoppedBuildings.aiSupercore = 2;
  assert.throws(() => validateAndMigrateSave(JSON.parse(JSON.stringify(full)), context));
  for (const id of ['alienMaterialLab', 'spaceRipper', 'swarmFactory']) {
    const legacy = JSON.parse(JSON.stringify(fresh()));
    for (const field of ['buildings', 'workers', 'stoppedBuildings']) delete legacy[field][id];
    assert.throws(() => validateAndMigrateSave(legacy, context));
    legacy.buildings[id] = null; assert.throws(() => validateAndMigrateSave(legacy, context));
  }
});

test('铱合金集装箱 (T13) costs 230k knowledge + 1000 iridium, needs 月球勘探 and multiplies container capacity ×2.5', () => {
  const s = fresh();
  assert.equal(TECHNOLOGIES.iridiumAlloyContainers.tier, 13);
  assert.deepEqual(TECHNOLOGIES.iridiumAlloyContainers.cost, { knowledge: 230000, iridium: 1000 });
  assert.deepEqual(TECHNOLOGIES.iridiumAlloyContainers.pre, ['moonExploration']);
  assert.equal(isTechnologyUnlocked('iridiumAlloyContainers', s), false);
  s.tech.push('moonExploration');
  assert.equal(isTechnologyUnlocked('iridiumAlloyContainers', s), true);
  assert.equal(calculateContainerUnitCapacity(s), 250);
  s.tech.push('iridiumAlloyContainers');
  assert.equal(calculateContainerUnitCapacity(s), 625);
  s.tech.push('steelContainers');
  assert.equal(calculateContainerUnitCapacity(s), 1250);
  s.tech.push('reinforcedContainers');
  assert.equal(calculateContainerUnitCapacity(s), 2500);
  // Assigned containers already in place follow the new unit capacity in storage totals.
  s.containerAssignments = { ...s.containerAssignments, wood: 2 };
  const before = { ...s, tech: s.tech.filter(id => id !== 'iridiumAlloyContainers') };
  assert.equal((calculateStorageTotals(s, storageSnapshotFor(s)).wood ?? 0) - (calculateStorageTotals(before, storageSnapshotFor(before)).wood ?? 0), 2 * 1500);
});
