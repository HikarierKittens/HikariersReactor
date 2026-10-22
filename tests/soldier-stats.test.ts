import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import {
  COMBAT_POWER_TECH_BONUS, DEFENSE_CASUALTY_REDUCTION, DEFENSE_TECH_BONUS,
  SOLDIER_BASE_COMBAT_POWER, SOLDIER_BASE_DEFENSE, SOLDIER_FUR_BASE, SOLDIER_FUR_POWER_EXPONENT,
} from '../src/data/military';

import { createInitialState } from '../src/state/create-state';
import { validateAndMigrateSave } from '../src/state/validate-save';
import {
  calculateCombatPower, calculateSoldierDefense, defenseCasualtyMultiplier, soldierFurPerSoldier,
  soldierFurRate, soldierStatBreakdown,
} from '../src/simulation/government';
import { createNeighborsState, executeRaid, previewRaid } from '../src/simulation/neighbors';
import { buildRaidEconomy } from '../src/simulation/neighbor-economy';
import { initializeTechnologyCosts } from '../src/simulation/technology';
import { isTechnologyUnlocked } from '../src/simulation/unlocks';
import { researchTechnologyNow } from '../src/simulation/purchases';
import { calculateProduction } from '../src/simulation/production';
import { calculateResourceFactorRows } from '../src/simulation/resource-breakdown';
import { calculateFactoryRecipe } from '../src/simulation/factory';
import type { GameState } from '../src/types/state';
import type { TechnologyId } from '../src/types/technologies';

/**
 * beta 0.9.12: 单兵战斗力/防御力 become real soldier stats, and 士兵毛皮 now scales
 * with 战斗力 instead of the removed 铁制装备 fur bonus.
 *
 * 铁制装备 no longer doubles 战斗力; it grants flat +1/+1 like the four new equipment
 * technologies. 防御力 is new and only reduces casualties — it must never leak into
 * raid strength, or a defensive tech would silently become an offensive one.
 */

function seeded(seed = 1) {
  let value = seed;
  return () => { value = (value * 16807) % 2147483647; return value / 2147483647; };
}

/** Complete prerequisite closure so fixtures pass the real save validator. */
function addTech(tech: string[], id: string): void {
  if (tech.includes(id)) return;
  for (const parent of TECHNOLOGIES[id as TechnologyId].pre) addTech(tech, parent);
  tech.push(id);
}

function fresh(): GameState {
  return createInitialState(CONFIG.version, 600, 0);
}

/** Colony with a real army and enough production for raid previews. */
function armyState(): GameState {
  const s = fresh();
  for (const id of ['government', 'military', 'recruitTraining']) addTech(s.tech, id);
  s.soldiers = 200;
  s.population = 20;
  s.resources.food = 5000;
  s.buildings.barracks = 100;
  s.buildings.forage = 6; s.workers.forage = 6;
  s.buildings.lumber = 6; s.workers.lumber = 6;
  s.neighbors = createNeighborsState(seeded(7));
  return s;
}

test('the four new equipment technologies carry the requested tiers, prices and gates', () => {
  const expectations = [
    { id: 'newInfantryEquipment', name: '新型单兵装备', tier: 7, cost: { knowledge: 30000 }, pre: ['recruitTraining'] },
    { id: 'advancedThermalWeapons', name: '高级热武器', tier: 9, cost: { knowledge: 70000, oil: 2500 }, pre: ['oilTechnology'] },
    { id: 'kevlarFiber', name: '凯夫拉纤维', tier: 11, cost: { knowledge: 120000, polymer: 1000 }, pre: [], resource: 'polymer' },
    { id: 'railgun', name: '磁轨炮', tier: 12, cost: { knowledge: 180000, iridium: 1000 }, pre: [], resource: 'iridium' },
  ] as const;
  for (const expected of expectations) {
    const tech = TECHNOLOGIES[expected.id];
    assert.ok(tech, `${expected.id} must exist`);
    assert.equal(tech.name, expected.name);
    assert.equal(tech.tier, expected.tier, `${expected.id} tier`);
    assert.equal(tech.knowledgeCost, expected.cost.knowledge, `${expected.id} knowledgeCost`);
    assert.deepEqual(tech.cost, expected.cost, `${expected.id} cost`);
    assert.deepEqual(tech.pre, [...expected.pre], `${expected.id} prerequisites`);
    assert.equal(tech.resourceRequired, 'resource' in expected ? expected.resource : undefined, `${expected.id} resource gate`);
  }
  // 磁轨炮 keeps the flavour line the user asked for; it must stay description-only.
  assert.equal(TECHNOLOGIES.railgun.desc, '电磁发射步枪，这个好喵');
  // Prices survive tier initialization: these are explicit, not midpoint guesses.
  const definitions = structuredClone(TECHNOLOGIES);
  initializeTechnologyCosts(definitions);
  for (const expected of expectations) assert.deepEqual(definitions[expected.id].cost, expected.cost);
});

test('铁制装备 grants flat +1/+1 instead of doubling combat power', () => {
  const s = fresh();
  assert.equal(calculateCombatPower(s), SOLDIER_BASE_COMBAT_POWER);
  assert.equal(calculateSoldierDefense(s), SOLDIER_BASE_DEFENSE);
  s.tech.push('ironEquipment');
  // The old rule returned 2 here as a multiplier; the new rule adds one point.
  assert.equal(calculateCombatPower(s), 2);
  assert.equal(calculateSoldierDefense(s), 1);
  // Two equipment tiers are strictly additive, not multiplicative.
  s.tech.push('newInfantryEquipment');
  assert.equal(calculateCombatPower(s), 3);
  assert.equal(calculateSoldierDefense(s), 2);
});

test('every combat technology contributes its flat bonus and defense caps at five', () => {
  const s = fresh();
  s.tech = ['ironEquipment', 'newInfantryEquipment', 'advancedThermalWeapons', 'railgun'];
  assert.equal(calculateCombatPower(s), SOLDIER_BASE_COMBAT_POWER + 4);
  // 高级热武器 is offence-only, so three of the four also grant defense.
  assert.equal(calculateSoldierDefense(s), SOLDIER_BASE_DEFENSE + 3);
  s.tech = ['ironEquipment', 'newInfantryEquipment', 'kevlarFiber', 'railgun'];
  assert.equal(calculateSoldierDefense(s), SOLDIER_BASE_DEFENSE + 4);
  // 纳米装甲技术 is the T20 tier: +2 战斗力 and +1 防御力, so the full defense set is now 5.
  s.tech = ['ironEquipment', 'newInfantryEquipment', 'kevlarFiber', 'railgun', 'nanoArmor'];
  assert.equal(calculateSoldierDefense(s), SOLDIER_BASE_DEFENSE + 5, 'five defense points is the full set');
  // 铁制 + 新型 + 磁轨炮 + 纳米装甲(2) on top of base 1; 凯夫拉 is defense-only.
  assert.equal(calculateCombatPower(s), SOLDIER_BASE_COMBAT_POWER + 5, '装甲 grants two power on top of three tiers');
  // Defense technologies are disjoint from combat ones except the shared pairs.
  s.tech = ['kevlarFiber', 'railgun'];
  assert.equal(calculateCombatPower(s), SOLDIER_BASE_COMBAT_POWER + 1);
  assert.equal(calculateSoldierDefense(s), SOLDIER_BASE_DEFENSE + 2);
  // The registries are the single source of the flat values.
  assert.deepEqual(COMBAT_POWER_TECH_BONUS, {
    ironEquipment: 1, newInfantryEquipment: 1, advancedThermalWeapons: 1, railgun: 1, nanoArmor: 2,
  });
  assert.deepEqual(DEFENSE_TECH_BONUS, {
    ironEquipment: 1, newInfantryEquipment: 1, kevlarFiber: 1, railgun: 1, nanoArmor: 1,
  });
});

test('percentage effects scale the flat total instead of being capped behind one multiplier', () => {
  const s = fresh();
  s.tech = ['ironEquipment', 'newInfantryEquipment'];
  s.government = 'militaryRule';
  assert.ok(Math.abs(calculateCombatPower(s) - 3 * 1.2) < 1e-12, '军政 +20% applies to the flat total');
  s.geneModification.levels.titanPower = 2;
  assert.ok(Math.abs(calculateCombatPower(s) - 3 * 1.2 * 1.1) < 1e-12, '泰坦之力 +5%/级 stacks multiplicatively');
  // Defense is flat-only: no government or gene effect may touch it.
  assert.equal(calculateSoldierDefense(s), 2);
});

test('defense reduces casualties with diminishing returns and never changes strength', () => {
  assert.equal(defenseCasualtyMultiplier(fresh()), 1);
  for (let defense = 1; defense <= 4; defense++) {
    const s = fresh();
    s.tech = Object.entries(DEFENSE_TECH_BONUS)
      .filter(([, bonus]) => bonus > 0)
      .slice(0, defense)
      .map(([id]) => id as TechnologyId);
    assert.equal(calculateSoldierDefense(s), defense);
    assert.ok(Math.abs(defenseCasualtyMultiplier(s) - 1 / (1 + defense * DEFENSE_CASUALTY_REDUCTION)) < 1e-12);
  }
  // Each additional point is worth less than the previous one.
  const gains = [1, 2, 3, 4].map(defense => 1 - 1 / (1 + defense * DEFENSE_CASUALTY_REDUCTION));
  for (let i = 1; i < gains.length; i++) assert.ok(gains[i]! > gains[i - 1]! && gains[i]! - gains[i - 1]! < gains[i - 1]! - (gains[i - 2] ?? 0) + 1e-12);

  // 凯夫拉纤维 is the only pure-defense technology, so it isolates the effect.
  const armored = armyState();
  armored.tech.push('kevlarFiber');
  const bare = armyState();
  const tier = 2 as const;
  const barePreview = previewRaid(bare, 'commonwealth', tier, 100, buildRaidEconomy(bare));
  const armoredPreview = previewRaid(armored, 'commonwealth', tier, 100, buildRaidEconomy(armored));
  // 防御力 is not an offensive stat: strength and the requirement are identical.
  assert.equal(armoredPreview.strength, barePreview.strength);
  assert.equal(armoredPreview.required, barePreview.required);
  assert.equal(armoredPreview.available, barePreview.available);
  // ... but the same assault costs fewer soldiers.
  assert.ok(armoredPreview.expectedLosses < barePreview.expectedLosses);
  const ratio = armoredPreview.expectedLosses / barePreview.expectedLosses;
  assert.ok(Math.abs(ratio - defenseCasualtyMultiplier(armored)) < 1e-12, `expected ${ratio}`);
  // Sanity: one point already saves about 9% of casualties.
  assert.ok(ratio > .9 && ratio < .92, `1 defense should save about 9% of casualties, got ${ratio}`);
  // The full four-point set saves about 29%.
  const full = fresh();
  full.tech = ['ironEquipment', 'newInfantryEquipment', 'kevlarFiber', 'railgun'];
  assert.ok(Math.abs(defenseCasualtyMultiplier(full) - 1 / 1.4) < 1e-12);
});

test('the projected casualty reduction matches what an actual raid removes', () => {
  const s = armyState();
  s.tech.push('ironEquipment', 'newInfantryEquipment', 'kevlarFiber', 'railgun');
  s.neighbors.values.commonwealth.opinion = 100;
  s.neighbors.values.commonwealth.military = 10;
  const preview = previewRaid(s, 'commonwealth', 2, 100, buildRaidEconomy(s));
  const before = s.soldiers;
  const outcome = executeRaid(s, 'commonwealth', 2, 100, seeded(5), buildRaidEconomy(s));
  assert.equal(outcome.ok, true);
  // The roll spreads casualties by 0.6–1.4, so the settled loss stays inside that band.
  const total = outcome.soldiersLost + outcome.wounded;
  assert.ok(total >= Math.round(preview.expectedLosses * .6) - 1 && total <= Math.round(preview.expectedLosses * 1.4) + 1,
    `settled ${total} vs projected ${preview.expectedLosses}`);
  assert.equal(s.soldiers, before - outcome.soldiersLost);
});

test('the military tooltip breakdown explains exactly the displayed numbers', () => {
  const s = fresh();
  s.tech = ['ironEquipment', 'newInfantryEquipment', 'advancedThermalWeapons', 'kevlarFiber', 'railgun'];
  s.government = 'militaryRule';
  s.geneModification.levels.titanPower = 3;
  const stats = soldierStatBreakdown(s);
  assert.equal(stats.combatPower.total, calculateCombatPower(s));
  assert.equal(stats.defense.total, calculateSoldierDefense(s));
  assert.equal(stats.defense.casualtyMultiplier, defenseCasualtyMultiplier(s));
  assert.equal(stats.combatPower.base, SOLDIER_BASE_COMBAT_POWER);
  // Four combat technologies + base 1 = 5 flat points.
  assert.equal(stats.combatPower.flat.length, 4);
  assert.equal(stats.combatPower.flat.reduce((sum, source) => sum + source.value, stats.combatPower.base), 5);
  assert.deepEqual(stats.combatPower.percent.map(source => source.id), ['militaryRule', 'titanPower']);
  assert.ok(Math.abs(stats.combatPower.percent[1]!.value - .15) < 1e-12);
  assert.deepEqual(stats.defense.flat.map(source => source.name), ['铁制装备', '新型单兵装备', '凯夫拉纤维', '磁轨炮']);
  // An army with no equipment still gets a coherent breakdown.
  const bare = soldierStatBreakdown(fresh());
  assert.deepEqual(bare.combatPower.flat, []);
  assert.deepEqual(bare.combatPower.percent, []);
  assert.equal(bare.combatPower.total, 1);
  assert.equal(bare.defense.casualtyMultiplier, 1);
});

test('each new technology unlocks only after its own gate is met', () => {
  const s = armyState();
  s.tech = s.tech.filter(id => !['newInfantryEquipment', 'advancedThermalWeapons', 'kevlarFiber', 'railgun'].includes(id));
  assert.equal(isTechnologyUnlocked('newInfantryEquipment', s), true, '新兵训练 is already researched');
  assert.equal(isTechnologyUnlocked('advancedThermalWeapons', s), false, 'oilTechnology missing');
  addTech(s.tech, 'oilTechnology');
  assert.equal(isTechnologyUnlocked('advancedThermalWeapons', s), true);
  // Polymer and iridium are resource gates: the technology needs a real producer.
  assert.equal(isTechnologyUnlocked('kevlarFiber', s), false, 'no polymer production yet');
  addTech(s.tech, 'polymer');
  s.buildings.factory = 1;
  assert.equal(isTechnologyUnlocked('kevlarFiber', s), true);
  assert.equal(isTechnologyUnlocked('railgun', s), false, 'iridium not unlocked');
  s.buildings.iridiumMine = 1;
  assert.equal(isTechnologyUnlocked('railgun', s), true);
  // The railgun's own research must not need the previous equipment tiers.
  assert.deepEqual(TECHNOLOGIES.railgun.pre, []);
});

test('researching the new technologies persists through a real save roundtrip', () => {
  const s = armyState();
  addTech(s.tech, 'oilTechnology');
  addTech(s.tech, 'polymer');
  // Sticky unlock flags are how a real save records a resource the colony has produced;
  // the save validator accepts them without demanding the producing building again.
  for (const resource of ['polymer', 'iridium'] as const) if (!s.unlockedResources.includes(resource)) s.unlockedResources.push(resource);
  Object.assign(s.resources, { knowledge: 1e9, oil: 1e6, polymer: 1e6, iridium: 1e6 });
  for (const id of ['newInfantryEquipment', 'advancedThermalWeapons', 'kevlarFiber', 'railgun'] as const) {
    assert.equal(researchTechnologyNow(s, id).bought, true, id);
  }
  // 铁制装备 is not researched in this fixture: base 1 + 新型单兵装备 + 高级热武器 + 磁轨炮.
  assert.equal(calculateCombatPower(s), 4);
  // Defense: 新型单兵装备 + 凯夫拉纤维 + 磁轨炮 (base is 0).
  assert.equal(calculateSoldierDefense(s), 3);
  const loaded = validateAndMigrateSave(JSON.parse(JSON.stringify(s)), {
    now: 0, eventInterval: 600,
    housingCapacity: () => 999,
    clampResources: () => undefined,
  });
  for (const id of ['newInfantryEquipment', 'advancedThermalWeapons', 'kevlarFiber', 'railgun'] as const) {
    assert.ok(loaded.tech.includes(id), `${id} survives the roundtrip`);
  }
  assert.equal(calculateCombatPower(loaded), 4);
  assert.equal(calculateSoldierDefense(loaded), 3);
});

test('a save from before the new technologies loads unchanged and keeps its old power', () => {
  const s = armyState();
  // Historical army: 铁制装备 only. The old build treated this as ×2; the new rule
  // must still produce exactly 2 for the same tech list, so no player loses strength.
  addTech(s.tech, 'ironEquipment');
  assert.equal(calculateCombatPower(s), 2);
  assert.equal(calculateSoldierDefense(s), 1);
  const loaded = validateAndMigrateSave(JSON.parse(JSON.stringify(s)), {
    now: 0, eventInterval: 600,
    housingCapacity: () => 999,
    clampResources: () => undefined,
  });
  assert.equal(calculateCombatPower(loaded), 2);
  assert.ok(!loaded.tech.includes('railgun'));
  // The raid math still resolves against the same strength as before the update.
  const preview = previewRaid(loaded, 'commonwealth', 0, 100, buildRaidEconomy(loaded));
  assert.ok(preview.strength > 0);
  assert.equal(preview.required, previewRaid(armyState(), 'commonwealth', 0, 100, buildRaidEconomy(armyState())).required);
});

/**
 * 士兵毛皮: `0.2 × 战斗力^0.5`.
 *
 * The design goal is "soldiers gather a little, the factory supplies the rest". A square
 * root keeps the early game identical (√1 = 1 → the old 0.2/s), makes equipment worth
 * noticeably more fur, but lets 工厂毛皮 — which grows multiplicatively — overtake it.
 */
test('soldier fur is 0.2 × combat power^0.5, so a bare army keeps the old 0.2/s', () => {
  assert.equal(SOLDIER_FUR_BASE, .2);
  assert.equal(SOLDIER_FUR_POWER_EXPONENT, .5);
  const bare = fresh();
  assert.equal(soldierFurPerSoldier(bare), .2, 'no equipment reproduces the historical rate exactly');
  assert.equal(soldierFurRate(bare), 0, 'no soldiers means no fur');

  bare.soldiers = 100;
  assert.ok(Math.abs(soldierFurRate(bare) - 20) < 1e-12);

  // Each equipment tier is worth less fur than the previous one (√ growth, not linear).
  const steps: number[] = [];
  for (const tech of ['ironEquipment', 'newInfantryEquipment', 'advancedThermalWeapons', 'railgun'] as const) {
    bare.tech.push(tech);
    steps.push(soldierFurPerSoldier(bare));
  }
  assert.ok(Math.abs(steps[0]! - .2 * Math.SQRT2) < 1e-12, '战斗力 2 → 0.283/s');
  assert.ok(Math.abs(steps[3]! - .2 * Math.sqrt(5)) < 1e-12, '战斗力 5 → 0.447/s');
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i]! > steps[i - 1]!, 'every tier still adds fur');
    assert.ok(steps[i]! - steps[i - 1]! < steps[i - 1]! - (steps[i - 2] ?? SOLDIER_FUR_BASE), 'gains shrink every tier');
  }
  // Percentage power bonuses are halved by the root: +100% power is only +41% fur.
  const percent = fresh();
  percent.soldiers = 1;
  percent.government = 'militaryRule';
  assert.ok(Math.abs(calculateCombatPower(percent) - 1.2) < 1e-12);
  assert.ok(Math.abs(soldierFurPerSoldier(percent) / SOLDIER_FUR_BASE - Math.sqrt(1.2)) < 1e-12);
});

test('soldier fur reaches the real settlement and the fur tooltip', () => {
  const s = armyState();
  s.buildings.barracks = 100;
  s.tech = ['government', 'military', 'ironEquipment'];
  s.government = 'none';
  s.buildings.forage = 0; s.workers.forage = 0;
  s.buildings.lumber = 0; s.workers.lumber = 0;
  s.settings.paused = true;
  const bare = calculateProduction(s);
  // The settlement applies 幸福度 and the global multiplier on top of the per-soldier rate,
  // so compare the *factor* between the two rather than the raw rate.
  const bareFur = bare.outputs.soldierFur ?? 0;
  const bareFactor = bareFur / soldierFurRate(s);
  assert.ok(bareFactor > 0 && Number.isFinite(bareFactor), 'soldier fur must reach the pool');
  assert.ok(Math.abs(bareFur - soldierFurRate(s) * bareFactor) < 1e-9);
  assert.ok(Math.abs(bare.rates.fur - bareFur) < 1e-9, 'nothing else produces fur here');

  s.tech.push('newInfantryEquipment');
  const equipped = calculateProduction(s);
  const equippedFur = equipped.outputs.soldierFur ?? 0;
  // 战斗力 2 → 3 is a ×√1.5 fur step; the shared multipliers cancel in the ratio.
  assert.ok(Math.abs(equippedFur / bareFur - Math.sqrt(1.5)) < 1e-9,
    `settlement must use the square root, got ${equippedFur / bareFur}`);

  // The tooltip explains the base rate and the 战斗力 factor separately, and never
  // mentions 铁质装备 any more (its fur bonus was removed).
  const rows = calculateResourceFactorRows('fur', s, equipped).rows;
  assert.ok(rows.some(row => row.name === '服役士兵采集'));
  const powerRow = rows.find(row => row.name === '单兵战斗力');
  assert.ok(powerRow, `expected a 单兵战斗力 factor row, got ${rows.map(row => row.name).join('|')}`);
  assert.ok(!rows.some(row => row.name === '铁质装备'), '铁质装备 no longer boosts fur');
});

test('factory fur overtakes soldier fur as the colony industrialises', () => {
  // The formula's whole purpose: soldier fur must not become the main supplier. Both paths
  // scale linearly with buildings, so the fair comparison is "same building investment".
  // One 军营 (2 soldiers) yields 2 × 0.447 = 0.89 fur/s at full equipment; one 工厂 line
  // yields 5 fur/s and still gets 量子制造 / 太空工厂 multipliers on top.
  const s = armyState();
  s.tech = ['government', 'military', 'ironEquipment', 'newInfantryEquipment', 'advancedThermalWeapons', 'railgun', 'syntheticFur', 'automation'];
  s.settings.paused = true;

  // 100 军营 → 200 soldiers at full equipment.
  s.soldiers = 200;
  s.buildings.barracks = 100;
  s.buildings.forage = 0; s.workers.forage = 0;
  s.buildings.lumber = 0; s.workers.lumber = 0;
  const soldierOnly = calculateProduction(s);
  const soldierFur = soldierOnly.outputs.soldierFur ?? 0;
  assert.ok(soldierFur > 0, 'soldiers still gather something');

  // 100 工厂 → 100 fur lines, the same building count.
  s.buildings.factory = 100;
  s.lines.fur = 100;
  s.workers.factory = 500;
  Object.assign(s.resources, { cash: 1e9, polymer: 1e9 });
  s.buildings.solarSatellite = 100;
  const both = calculateProduction(s);
  const recipe = calculateFactoryRecipe('fur', s);
  assert.equal(both.inputUnits.fur, 100, 'every fur line is funded');
  const factoryFur = (recipe.output.fur || 0) * (both.inputUnits.fur ?? 0);
  const settledSoldierFur = both.outputs.soldierFur ?? 0;
  assert.ok(factoryFur > settledSoldierFur * 5,
    `factory fur (${factoryFur}) must dwarf soldier fur (${settledSoldierFur}) for equal buildings`);

  // And soldier fur cannot grow further: its ceiling is the 4-point equipment cap.
  const maxed = fresh();
  maxed.tech = ['ironEquipment', 'newInfantryEquipment', 'advancedThermalWeapons', 'railgun'];
  assert.ok(Math.abs(soldierFurPerSoldier(maxed) - .2 * Math.sqrt(5)) < 1e-12);
  // 量子制造 multiplies factory fur but never touches soldier fur, so the gap only widens.
  const beforeQuantum = soldierFurPerSoldier(s);
  s.tech.push('quantumManufacturing');
  assert.equal(soldierFurPerSoldier(s), beforeQuantum, 'quantum manufacturing leaves soldier fur alone');
});

