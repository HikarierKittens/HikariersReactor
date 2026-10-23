/** Moved verbatim out of tests/modules.test.ts during the 2026-10-22 split.
 *  Keep the assertions unchanged: they are the historical regression net. */
import { CONFIG } from '../src/data/config';
import assert from 'node:assert/strict';
import { supplyPower } from './support/power';
import { test } from 'node:test';
import { buyBuildingNow, buyBuildingsInBatch, describeQueuedPurchases, isPurchaseAllowed, removeQueuedPurchase, requestPurchaseModule as requestPurchase, researchTechnologyNow, settlePurchaseQueue } from '../src/simulation/purchases';
import { changeCraftAssignment } from '../src/simulation/crafting';
import { calculateNuclearAffordablePercent, fillNuclearProject, launchNuclearPrestige, resetRunState } from '../src/simulation/prestige';
import { createInitialState } from '../src/state/create-state';
import { calculateFactoryRecipe } from '../src/simulation/factory';
import { allocateMoonSupport } from '../src/simulation/moon';
import { allocateAsrielSupport } from '../src/simulation/asriel';
import { calculateTechnologyTier } from '../src/simulation/technology';
import { formatNumber, formatEffectNumber, formatResourceNumber, formatCostNumber, formatRateNumber, formatByteNumber } from '../src/shared/format';
import { advanceSoldierTraining } from '../src/simulation/military';
import { advancePopulationGrowth, sampleGrowthTarget } from '../src/simulation/population';
import { finalizeProduction, settlePopulationIncome } from '../src/simulation/production-finalize';
import { calculateResearchPowerPool } from '../src/simulation/research-power';
import { calculateProduction } from '../src/simulation/production';
import { changeGovernment, changeTaxRate, craftManually } from '../src/simulation/commands';
import { signedRate } from '../src/simulation/resource-breakdown';

test('complete production ES module runs without DOM or global state', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.buildings.forage = 1; state.workers.forage = 1;
  state.resources.food = 10;
  const before = JSON.stringify(state);
  const result = calculateProduction(state, .25);
  assert.ok(result.rates.food > 0);
  assert.ok(Object.values(result.pool).every(Number.isFinite));
  assert.equal(JSON.stringify(state), before);
});

test('typed commands reject invalid inputs and preserve gameplay gates', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
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
  const state = createInitialState(CONFIG.version, 60, 0);
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
  const state = createInitialState(CONFIG.version, 60, 0);
  state.buildings.moonBase = 1; state.buildings.asrielSpaceport = 1;
  Object.assign(state.resources, { oil: 2, helium3: 2, food: 25 });
  supplyPower(state, 10);
  const snapshot = JSON.stringify(state);
  const pool = calculateResearchPowerPool(state, 1);
  assert.equal(pool.energy, 1); assert.equal(pool.oil, 0);
  assert.equal(pool.helium3, 0); assert.equal(pool.food, 0);
  assert.equal(JSON.stringify(state), snapshot);
});

test('base population growth advances 1.5 progress per second on both sides of the population threshold', () => {
  for (const population of [1, 20]) {
    const state = createInitialState(CONFIG.version, 60, 0);
    state.population = population; state.resources.food = 10; state.growthTarget = 10;
    advancePopulationGrowth(state, 2, 0, 100);
    assert.equal(state.growth, 3); assert.equal(state.population, population);
    state.tech.push('scientificBreeding'); state.crispr.push('coreReplication'); state.buildings.communityCenter = 1;
    const before = state.growth;
    advancePopulationGrowth(state, 1, 0, 100);
    assert.ok(Math.abs(state.growth - before - 1.5 * 1.25 * 1.15 * 1.1) < 1e-10);
  }
});

test('growth preserves food gates, population threshold and one-arrival steps', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.resources.food = 10;
  advancePopulationGrowth(state, 100, 0, 10, () => 0);
  assert.equal(state.population, 1); assert.equal(state.growth, 145);
  advancePopulationGrowth(state, 1, -1, 10);
  assert.equal(state.growth, 0); assert.equal(state.growthTarget, 0);
  state.population = 20;
  assert.equal(sampleGrowthTarget(state, () => 0), 10);
  advancePopulationGrowth(state, 100, 0, 20);
  assert.equal(state.population, 20);
});

test('training keeps partial progress, caps soldiers and unlocks fur', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
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
  const first = createInitialState(CONFIG.version, 60, 123), second = createInitialState(CONFIG.version, 60, 123);
  first.resources.food = 10; first.buildings.moonBase = 1; first.tech.push('moonExploration');
  assert.equal(second.resources.food, 0); assert.equal(second.buildings.moonBase, 0);
  assert.deepEqual(second.tech, []); assert.equal(second.lastSaved, 123);
});
test('factory module imports real typed registries and returns fresh recipes', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.tech.push('automatedEngineering', 'intelligentFactory', 'chemicalDeposition');
  assert.deepEqual(calculateFactoryRecipe('alloy', state), { input: { iron: .45, copper: .9 }, output: { alloy: 2.16 } });
  const recipe = calculateFactoryRecipe('alloy', state); recipe.input.iron = 99;
  assert.equal(calculateFactoryRecipe('alloy', state).input.iron, .45);
});
test('support modules are read-only and preserve prioritized whole units', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  Object.assign(state.buildings, { moonBase: 1, iridiumMine: 2, helium3Mine: 1, asrielSpaceport: 1, asrielResidence: 3, asrielMine: 3 });
  // Direct allocator input: a remaining pool for the read-only unit-level API, not saved supply.
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
  const state = createInitialState(CONFIG.version, 60, 0);
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
  const state = createInitialState(CONFIG.version, 60, 0);
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
  const state = createInitialState(CONFIG.version, 60, 0);
  state.tech.push('survival');
  state.resources.wood = 10000; state.resources.stone = 10000; state.resources.cash = 10000;
  state.queue.push({ uid: 7, kind: 'build', id: 'nest' });
  const batch = buyBuildingsInBatch(state, 'nest', 5, 1);
  assert.ok(batch.bought >= 1);
  assert.ok(state.buildings.nest >= 1);
});

test('craft assignment respects unlocks, foundry capacity and integer steps', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
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
  const funded = createInitialState(CONFIG.version, 60, 0);
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
  // crew / 3 with no knowledge spent: 40 / 3 = 13.33, floored to 13.
  assert.equal(launched!.reward, 13);
  assert.equal(launched!.next.version, CONFIG.version);
  assert.equal(JSON.stringify(funded).includes('"nuclearProgress":100'), true);
  const soft = createInitialState(CONFIG.version, 60, 0);
  const reset = resetRunState(soft, 'soft', 60, 7);
  assert.ok(reset);
  assert.equal(reset!.next.lastSaved, 7);
  assert.equal(resetRunState(soft, 'unknown', 60, 7), null);
  assert.equal(launchNuclearPrestige(createInitialState(CONFIG.version, 60, 0), 60, 0), null);
});

test('direct building purchase reports first factory unlock', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.tech.push('industrialization');
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
  assert.equal(formatNumber(12000 * 1.17), '14.04k');
});

test('bytes use decimal byte symbols for balances rates and prices', () => {
  for (const [value, text] of [[1, '1B'], [999, '999B'], [1000, '1KB'], [10000, '10KB'], [2.5e6, '2.5MB'], [1e9, '1GB'], [1e12, '1TB'], [1e15, '1PB']] as const) assert.equal(formatByteNumber(value), text);
  assert.equal(formatByteNumber(1.239), '1.23B');
  assert.equal(formatByteNumber(1.239, true), '1.24B');
  for (const rate of [false, true]) {
    for (const [value, expected] of [[999, '999B'], [1000, '1000B'], [9999, '9999B'], [10000, '10KB'], [11999, '11.99KB'], [999999, '999.99KB'], [1e6, '1MB']] as const) {
      assert.equal(formatByteNumber(value, rate, 10000), expected);
      assert.equal(formatByteNumber(-value, rate, 10000), `−${expected}`);
    }
    assert.equal(formatByteNumber(2.05 - 2, rate, 10000), '0.05B');
  }
  assert.equal(formatByteNumber(1000, true), '1000B');
});

test('inventory starts at thousands while costs effects and rates start at ten thousand', () => {
  for (const [value, expected] of [[999, '999'], [1000, '1k'], [9999, '9.99k'], [10000, '10k'], [11999, '11.99k'], [999999, '999.99k'], [1e6, '1M']] as const) {
    assert.equal(formatResourceNumber(value), expected);
    assert.equal(formatResourceNumber(-value), `−${expected}`);
  }
  for (const format of [formatCostNumber, formatNumber, formatEffectNumber, formatRateNumber]) {
    for (const [value, expected] of [[999, '999'], [1000, '1000'], [9999, '9999'], [10000, '10k'], [11999, '11.99k'], [999999, '999.99k'], [1e6, '1M'], [2100000, '2.1M'], [1e9, '1G']] as const) {
      assert.equal(format(value), expected);
      assert.equal(format(-value), `−${expected}`);
    }
    assert.equal(format(2.05 - 2), '0.05');
    assert.equal(format(-(2.05 - 2)), '−0.05');
  }
});

test('building effect numbers retain up to four decimals without trailing zeros and compact large values', () => {
  assert.equal(formatEffectNumber(2.05), '2.05');
  assert.equal(formatEffectNumber(.123456), '0.1235');
  assert.equal(formatEffectNumber(12345.6789), '12.34k');
  assert.equal(formatEffectNumber(10), '10');
  assert.equal(formatEffectNumber(.0001), '0.0001');
  assert.equal(formatEffectNumber(.00000001), '0');
  assert.equal(formatEffectNumber(2.05 - 2), '0.05');
});


test('resource rate display retains two decimals without negative zero or binary tails', () => {
  assert.equal(signedRate(500.1234567), '+500.12/s');
  assert.equal(signedRate(-.01), '−0.01/s');
  assert.equal(signedRate(-.00001), '+0/s');
  assert.equal(signedRate(-1e-12), '+0/s');
  assert.equal(signedRate(.3 - .2), '+0.1/s');
  assert.equal(signedRate(.000123456), '+0/s');
});
