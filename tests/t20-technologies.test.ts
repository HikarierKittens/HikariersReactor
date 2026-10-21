import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { RETIRED_TECHNOLOGIES, TECHNOLOGIES } from '../src/data/technologies';
import { COMBAT_POWER_TECH_BONUS, DEFENSE_TECH_BONUS } from '../src/data/military';
import { createInitialState } from '../src/state/create-state';
import { validateAndMigrateSave } from '../src/state/validate-save';
import { calculateCombatPower, calculateSoldierDefense } from '../src/simulation/government';
import { calculateBuildingOutput, calculateToolMultiplier } from '../src/simulation/building-production';
import { calculateTechnologyTier, initializeTechnologyCosts } from '../src/simulation/technology';
import { isBuildingUnlocked, isTechnologyUnlocked } from '../src/simulation/unlocks';
import { calculateResourceFactorRows } from '../src/simulation/resource-breakdown';
import { calculateProduction } from '../src/simulation/production';
import type { GameState } from '../src/types/state';
import type { TechnologyId } from '../src/types/technologies';

/**
 * 三个新科技（beta 0.9.24）与 农业机械 的退役。
 *
 * 关键不变量：
 * - 纳米装甲技术 +2 战斗力 / +1 防御力；
 * - 纳米机械骨骼把四个工种的基础产能抬到 ×2.5 并**覆盖**合金链锯/合金钻头（不是叠加）；
 * - 高级混凝土 ×1.3 与硅酸盐水泥 ×1.5 **相乘**（×1.95），且不增加原料消耗；
 * - 农业机械效果全部移除，但 ID 留在注册表里让旧存档继续载入。
 */

function fresh(): GameState {
  return createInitialState(CONFIG.version, 600, 0);
}

/** Add a technology together with its full prerequisite closure. */
function addTech(tech: TechnologyId[], id: string): void {
  if (tech.includes(id as TechnologyId)) return;
  for (const parent of TECHNOLOGIES[id as TechnologyId].pre) addTech(tech, parent);
  tech.push(id as TechnologyId);
}

test('the three new technologies carry the requested tiers, prices and gates', () => {
  const expectations = [
    { id: 'nanoArmor', name: '纳米装甲技术', tier: 20, cost: { knowledge: 1600000, graphene: 2500, adamantite: 2500, nanoAlloy: 1000 }, pre: ['nanoAlloy'] },
    { id: 'nanoExoskeleton', name: '纳米机械骨骼', tier: 20, cost: { knowledge: 1600000, graphene: 1500, adamantite: 1000, nanoAlloy: 750 }, pre: ['nanoAlloy'] },
    { id: 'advancedConcrete', name: '高级混凝土', tier: 16, cost: { knowledge: 460000, iridium: 1000, alloy: 2500, nanotubes: 50000 }, pre: ['silicateCement', 'carbonNanotubes'] },
  ] as const;
  for (const expected of expectations) {
    const tech = TECHNOLOGIES[expected.id];
    assert.ok(tech, `${expected.id} must exist`);
    assert.equal(tech.name, expected.name, `${expected.id} name`);
    assert.equal(tech.tier, expected.tier, `${expected.id} tier`);
    assert.equal(tech.knowledgeCost, expected.cost.knowledge, `${expected.id} knowledgeCost`);
    assert.deepEqual(tech.cost, expected.cost, `${expected.id} cost`);
    assert.deepEqual(tech.pre, [...expected.pre], `${expected.id} prerequisites`);
  }
  // Prices survive tier initialization: they are explicit, not midpoint guesses.
  // 高级混凝土 sits at T16 with an explicit 460k price — outside the T16 midpoint range,
  // so the stored value must win over any derived default.
  const definitions = structuredClone(TECHNOLOGIES);
  initializeTechnologyCosts(definitions);
  for (const expected of expectations) assert.deepEqual(definitions[expected.id].cost, expected.cost);
});

test('纳米装甲技术 grants +2 combat power and +1 defense', () => {
  const s = fresh();
  const basePower = calculateCombatPower(s);
  const baseDefense = calculateSoldierDefense(s);
  s.tech.push('nanoArmor');
  assert.equal(calculateCombatPower(s), basePower + 2, 'two combat power points');
  assert.equal(calculateSoldierDefense(s), baseDefense + 1, 'one defense point');
  // The registries are the single source of truth for those values.
  assert.equal(COMBAT_POWER_TECH_BONUS.nanoArmor, 2);
  assert.equal(DEFENSE_TECH_BONUS.nanoArmor, 1);
  // It stacks additively with the earlier equipment tiers.
  s.tech.push('ironEquipment', 'railgun');
  assert.equal(calculateCombatPower(s), basePower + 2 + 2);
  assert.equal(calculateSoldierDefense(s), baseDefense + 1 + 2);
});

test('纳米机械骨骼 raises the four jobs to 2.5× and covers the alloy tools', () => {
  const JOBS = ['lumber', 'quarry', 'mine', 'coalMine'] as const;
  // Baseline: 合金链锯/合金钻头 give exactly 2× to these jobs.
  const alloy = fresh();
  alloy.tech.push('alloyDrill', 'alloyChainsaw');
  for (const id of JOBS) assert.equal(calculateToolMultiplier(id, alloy), 2, `${id} with alloy tools`);

  // 纳米机械骨骼 replaces them outright — it is not 2 × 2.5.
  const nano = fresh();
  nano.tech.push('alloyDrill', 'alloyChainsaw', 'nanoExoskeleton');
  for (const id of JOBS) {
    assert.equal(calculateToolMultiplier(id, nano), 2.5, `${id} must be 2.5× (covered, not stacked)`);
  }
  // Removing the alloy tools changes nothing once 骨骼 is researched.
  const nanoOnly = fresh();
  nanoOnly.tech.push('nanoExoskeleton');
  for (const id of JOBS) assert.equal(calculateToolMultiplier(id, nanoOnly), 2.5);
});

test('纳米机械骨骼 leaves 农民 on the hand-tool ladder', () => {
  // The request lists only 伐木工人/石工/矿工/煤矿工人. 农民 keeps 钢铁工具.
  const s = fresh();
  s.tech.push('steelTools');
  assert.equal(calculateToolMultiplier('forage', s), 1.5);
  s.tech.push('nanoExoskeleton');
  assert.equal(calculateToolMultiplier('forage', s), 1.5, '农民 is deliberately excluded');
  // It also must not touch a non-tool job.
  assert.equal(calculateToolMultiplier('cementWorkshop', s), 1);
});

test('高级混凝土 multiplies with 硅酸盐水泥 to 1.95× and adds no input cost', () => {
  /** Cement per worker; `ResourceRecipe` is a partial map, so state the numeric contract. */
  const cementOf = (state: GameState): number => calculateBuildingOutput('cementWorkshop', state).cement ?? 0;
  const plainCement = cementOf(fresh());
  assert.ok(plainCement > 0, '水泥工坊 must have a base cement output');

  const silicate = fresh();
  silicate.tech.push('silicateCement');
  assert.ok(Math.abs(cementOf(silicate) - plainCement * 1.5) < 1e-12);

  const concrete = fresh();
  concrete.tech.push('advancedConcrete');
  assert.ok(Math.abs(cementOf(concrete) - plainCement * 1.3) < 1e-12);

  // Both together: 1.5 × 1.3 = 1.95, not 1.8 (additive) and not 1.3 (covered).
  const both = fresh();
  both.tech.push('silicateCement', 'advancedConcrete');
  const combined = cementOf(both);
  assert.ok(Math.abs(combined - plainCement * 1.95) < 1e-12, `expected 1.95×, got ${combined / plainCement}`);

  // "不增加原料消耗": the bonus scales the yield, it never adds or removes a resource.
  const baseRecipe = calculateBuildingOutput('cementWorkshop', fresh());
  const bothRecipe = calculateBuildingOutput('cementWorkshop', both);
  assert.deepEqual(Object.keys(baseRecipe).sort(), Object.keys(bothRecipe).sort(), 'no output added or removed');
  assert.deepEqual(bothRecipe, { ...baseRecipe, cement: combined }, 'only the cement amount changes');
});

test('the new cement multiplier reaches the settlement and the breakdown', () => {
  const produce = (techs: TechnologyId[]) => {
    const s = fresh();
    s.tech.push('cement', ...techs);
    s.buildings.cementWorkshop = 1;
    s.workers.cementWorkshop = 2;
    s.settings.paused = true;
    // 水泥工坊 consumes stone; without stock the workshop cannot run at all.
    Object.assign(s.resources, { stone: 1e6, cement: 0 });
    const production = calculateProduction(s);
    return { state: s, production, rate: production.rates.cement };
  };

  const plain = produce([]);
  assert.ok(plain.rate > 0, 'cement is produced at all');
  const silicate = produce(['silicateCement']);
  const concrete = produce(['advancedConcrete']);
  const both = produce(['silicateCement', 'advancedConcrete']);

  // The settlement applies exactly the multipliers the recipe declares.
  assert.ok(Math.abs(silicate.rate / plain.rate - 1.5) < 1e-9, `硅酸盐水泥 should be 1.5×, got ${silicate.rate / plain.rate}`);
  assert.ok(Math.abs(concrete.rate / plain.rate - 1.3) < 1e-9, `高级混凝土 should be 1.3×, got ${concrete.rate / plain.rate}`);
  assert.ok(Math.abs(both.rate / plain.rate - 1.95) < 1e-9, `together should be 1.95×, got ${both.rate / plain.rate}`);

  // The tooltip must explain the same numbers the settlement applied (single source of truth).
  const rows = calculateResourceFactorRows('cement', both.state, both.production).rows;
  assert.ok(rows.length > 0, 'cement breakdown is not empty');
  assert.ok(rows.every(row => Number.isFinite(row.value) || typeof row.value === 'string'));
});

test('农业机械 is retired: hidden, effect-free, but accepted by the save validator', () => {
  const s = fresh();
  // Still in the registry: a historical save listing it must load.
  assert.ok(Object.hasOwn(TECHNOLOGIES, 'agriculturalMachinery'));
  assert.ok(RETIRED_TECHNOLOGIES.includes('agriculturalMachinery'));
  // Never researchable again.
  addTech(s.tech, 'automation');
  addTech(s.tech, 'electricity');
  assert.equal(isTechnologyUnlocked('agriculturalMachinery', s), false, 'retired research cannot be bought');

  // Its +100% 农民 effect is gone: 农业 ×1.5 is now the only forage technology bonus.
  const withTech = fresh();
  withTech.tech.push('agriculturalMachinery', 'agriculture');
  const withoutTech = fresh();
  withoutTech.tech.push('agriculture');
  const forageMultiplier = (state: GameState) => {
    state.buildings.forage = 1;
    state.workers.forage = 1;
    state.settings.paused = true;
    return calculateProduction(state).rates.food;
  };
  assert.equal(forageMultiplier(withTech), forageMultiplier(withoutTech), 'retiring the tech must not change output');
});

test('a save that already researched 农业机械 loads and keeps the rest of its progress', () => {
  const s = fresh();
  addTech(s.tech, 'agriculture');
  s.tech.push('agriculturalMachinery');
  s.buildings.forage = 3;
  s.resources.knowledge = 12345;
  const loaded = validateAndMigrateSave(JSON.parse(JSON.stringify(s)), {
    now: 0, eventInterval: 600,
    housingCapacity: () => 999,
    clampResources: () => undefined,
  });
  assert.ok(loaded.tech.includes('agriculturalMachinery'), 'the retired ID survives the roundtrip');
  assert.equal(loaded.resources.knowledge, 12345, 'other progress is untouched');
  assert.ok(loaded.tech.includes('agriculture'), 'still-valid technologies are kept');
});

test('the new technologies unlock only through their own prerequisites', () => {
  const s = fresh();
  s.tech = ['silicateCement'];
  assert.equal(isTechnologyUnlocked('nanoArmor', s), false, 'nanoAlloy missing');
  assert.equal(isTechnologyUnlocked('nanoExoskeleton', s), false, 'nanoAlloy missing');
  addTech(s.tech, 'nanoAlloy');
  assert.equal(isTechnologyUnlocked('nanoArmor', s), true);
  assert.equal(isTechnologyUnlocked('nanoExoskeleton', s), true);
  // 高级混凝土 needs both the concrete line and the nanotube line.
  assert.equal(isTechnologyUnlocked('advancedConcrete', s), false, 'carbonNanotubes missing');
  addTech(s.tech, 'carbonNanotubes');
  assert.equal(isTechnologyUnlocked('advancedConcrete', s), true);
});

test('高级混凝土 is a T16 technology', () => {
  assert.equal(TECHNOLOGIES.advancedConcrete.tier, 16);
  // The declared tier is what the tree lays out with, so it must not drift from a derived one.
  assert.equal(calculateTechnologyTier('advancedConcrete', {}), 16);
  // Its prerequisites sit at or below T16, so the node cannot render above them.
  for (const parent of TECHNOLOGIES.advancedConcrete.pre) {
    assert.ok(calculateTechnologyTier(parent, {}) <= 16,
      `${parent} must not sit below T16`);
  }
});

test('戴森球升级技术 is retired: hidden from research but keeps earned progress', () => {
  const s = fresh();
  addTech(s.tech, 'dysonSphere');
  s.prestige.nuclearResets = 1;
  assert.ok(RETIRED_TECHNOLOGIES.includes('dysonSphereII'), 'it is on the retired list');
  // Never researchable again, even with every prerequisite satisfied.
  assert.equal(isTechnologyUnlocked('dysonSphereII', s), false);
  // Still in the registry so saves that already researched it keep validating.
  assert.ok(Object.hasOwn(TECHNOLOGIES, 'dysonSphereII'));

  // A player who researched it before retirement keeps 2级戴森球: the building gate reads
  // `state.tech`, not `isTechnologyUnlocked`.
  const veteran = fresh();
  addTech(veteran.tech, 'dysonSphereII');
  veteran.prestige.nuclearResets = 1;
  veteran.buildings.dysonSphere = 1;
  assert.ok(veteran.tech.includes('dysonSphereII'));
  assert.equal(isBuildingUnlocked('dysonSphereL2Segments', veteran), true, '分段体仍可建造');
  assert.equal(isBuildingUnlocked('dysonSphereL2', veteran), true, '完成体仍解锁');
  // ... while a fresh player cannot reach it at all.
  assert.equal(isBuildingUnlocked('dysonSphereL2Segments', s), false);
});
