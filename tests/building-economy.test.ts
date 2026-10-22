/** Moved verbatim out of tests/modules.test.ts during the 2026-10-22 split.
 *  Keep the assertions unchanged: they are the historical regression net. */
import { CONFIG } from '../src/data/config';
import assert from 'node:assert/strict';
import { supplyPower } from './support/power';
import { orderedCostEntries } from '../src/vue/format';
import { test } from 'node:test';
import { calculateBuildingOutput } from '../src/simulation/building-production';
import { calculateMorale } from '../src/simulation/morale';
import { calculateProjectDescription } from '../src/simulation/projects';
import { calculateParticleMultiplier } from '../src/simulation/crafting';
import { BUILDINGS } from '../src/data/buildings';
import { calculateResourceFactorRows, calculateResourceBreakdown } from '../src/simulation/resource-breakdown';
import { isTechnologyUnlocked } from '../src/simulation/unlocks';
import { calculateBuildingCost } from '../src/simulation/costs';
import { calculateStorageBonuses } from '../src/simulation/storage-bonuses';
import { TECHNOLOGIES } from '../src/data/technologies';
import { createInitialState } from '../src/state/create-state';
import { calculateFactoryRecipe } from '../src/simulation/factory';
import { calculateProduction } from '../src/simulation/production';

test('ARPA institute description updates only after the dimension compression technology', () => {
  const before = calculateProjectDescription('arpaResearchInstitute', { tech: [] });
  assert.ok(before.includes('实验室和学校的知识容量+4%'));
  assert.ok(!before.includes('格纳库'));
  const after = calculateProjectDescription('arpaResearchInstitute', { tech: ['dimensionCompression'] });
  assert.ok(after.includes(before));
  assert.ok(after.includes('仓库、高级存储枢纽和格纳库的资源容量+4%'));
  assert.equal(calculateProjectDescription('rocketPlatform', { tech: [] }), calculateProjectDescription('rocketPlatform', { tech: ['dimensionCompression'] }));
});

test('morale actual value has a zero floor and no ceiling while effective value respects both bounds', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  const power = { generatorSpeed: 0, generatorEnergy: 0, coalRatio: 0, moonBaseUnits: 0, biologyUnits: 0, dataCenterUnits: 0 };
  state.workers.theater = 300;
  let morale = calculateMorale(state, 1, power);
  assert.ok(morale.raw > morale.cap); assert.equal(morale.happiness, morale.cap);
  state.workers.theater = 0; state.taxRate = 90;
  morale = calculateMorale(state, 1, power);
  assert.equal(morale.raw, 30); assert.equal(morale.happiness, 40);
  state.population = 10000;
  morale = calculateMorale(state, 1, power);
  assert.equal(morale.raw, 0); assert.equal(morale.happiness, 40);
});


test('iridium alloy warehouse doubles targeted base storage and adds bank cash percentage', () => {
  const s = createInitialState(CONFIG.version, 60, 0);
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
  const s = createInitialState(CONFIG.version, 60, 0);
  assert.equal(calculateBuildingCost('researchSatellite', 0, s).knowledge, 25000);
  // Satellite uses its raw 1.2 registry scale (no global +0.01).
  assert.equal(calculateBuildingCost('researchSatellite', 1, s).knowledge, 30000);
  assert.deepEqual(orderedCostEntries({ iron: 5, knowledge: 8, copper: 2, cash: 1 }).map(([id]) => id), ['cash', 'knowledge', 'iron', 'copper']);
  assert.deepEqual(orderedCostEntries({ iron: 5, knowledge: 8 }).map(([id]) => id), ['knowledge', 'iron']);
});

test('tourist stations scale at 1.18 and require both energy and discounted oil maintenance', () => {
  const s = createInitialState(CONFIG.version, 60, 0);
  s.buildings.touristStation = 1; supplyPower(s, 10); s.resources.oil = 1;
  assert.deepEqual(BUILDINGS.touristStation.costScales, { metal: 1.18, alloy: 1.18, oil: 1.18, cash: 1.18 });
  let p = calculateProduction(s);
  assert.equal(p.inputUnits.touristStation, 1);
  assert.equal(p.rates.oil, -.5);
  assert.deepEqual(p.power, { generated: 10, used: 5, available: 5 });
  assert.equal(p.rates.energy, 5);
  s.resources.oil = 0; p = calculateProduction(s);
  assert.equal(p.inputUnits.touristStation, 0);
  assert.equal(p.morale.station, 0);
  s.resources.oil = 1; s.buildings.spaceWaystation = 1;
  p = calculateProduction(s);
  assert.ok(Math.abs(p.rates.oil + .475) < 1e-8);
});

test('particle accelerators require nuclear prestige and add percentage points to both production bonuses', () => {
  const s = createInitialState(CONFIG.version, 60, 0); s.tech.push('science');
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
  const state = createInitialState(CONFIG.version, 60, 0);
  state.buildings.moonBase = 1;
  state.buildings.iridiumMine = state.buildings.helium3Mine = 1;
  state.buildings.asrielSpaceport = state.buildings.asrielResidence = state.buildings.asrielMine = 1;
  state.population = 2; state.workers.asrielResidence = 2;
  Object.assign(state.resources, { food: 100, oil: 100, helium3: 100 });
  supplyPower(state, 100);
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
    // 10 stations × 2 Asriel residents × 0.25% base (星环优化 not researched here).
    assert.ok(before && Math.abs(income.value / baseline.value - (1 + 0.0025 * 10 * 2)) < 1e-8);
    assert.ok(Math.abs(detail.net - boosted.rates[resource]) < 1e-8);
    const rows = calculateResourceFactorRows(resource, state, boosted).rows;
    const index = rows.findIndex(row => row.name === BUILDINGS[source].name);
    // 10 stations × 2 residents × 0.25% = +5%.
    assert.deepEqual(rows[index + 1], { name: '星环空间站', value: '+5%', child: true });
  }
  assert.equal(calculateResourceFactorRows('metal', state, boosted).rows.some(row => row.name === '星环空间站'), false);
});

test('ARPA institutes gate technologies and scale only targeted storage and outputs', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.tech.push('arpa', 'arpaResearchInstitute');
  assert.equal(isTechnologyUnlocked('quantumTunnelingThermalProcessing', state), false);
  state.arpaBuildings.arpaResearchInstitute = 1;
  assert.equal(isTechnologyUnlocked('quantumTunnelingThermalProcessing', state), true);
  assert.equal(isTechnologyUnlocked('dimensionCompression', state), false);
  state.arpaBuildings.arpaResearchInstitute = 2;
  assert.equal(isTechnologyUnlocked('dimensionCompression', state), true);
  // 实验室 base 1000 × (1 + 2 institutes × 4%) = 1080; unpowered here (no 电力).
  assert.equal(calculateStorageBonuses('lab', state, null).knowledge, 1080);
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
