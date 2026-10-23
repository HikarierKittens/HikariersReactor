import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { BUILDINGS } from '../src/data/buildings';
import { CRISPR_UPGRADES } from '../src/data/crispr';
import { RESOURCES } from '../src/data/resources';
import { createInitialState } from '../src/state/create-state';
import { validateAndMigrateSave } from '../src/state/validate-save';

import { calculateAutomaticCraftingMultipliers, calculateForgingToolBonus, artisanCraftRate } from '../src/simulation/crafting';
import { purchaseQueueCapacity } from '../src/simulation/purchases';
import { buildingQueueCapacity, researchQueueCapacity } from '../src/simulation/queue-settings';
import { calculateCrisprStorageBonus, purchaseCrisprUpgrade } from '../src/simulation/crispr';
import { listActivePerks } from '../src/simulation/perks';
import { ACHIEVEMENTS } from '../src/data/progression';
import { calculateBuildingCost, calculateBuildingScale } from '../src/simulation/costs';
import { calculateProjectCost, investInProject } from '../src/simulation/projects';
import { launchNuclearPrestige, resetRunState } from '../src/simulation/prestige';
import { calculateStorageDetails, clampResourcesToCaps } from '../src/simulation/storage';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import type { CrisprUpgradeId, GameState } from '../src/types/state';
import type { ResourceId } from '../src/types/economy';

const fresh = () => createInitialState(CONFIG.version, 60, 0);
test('new CRISPR storage tiers replace and casimir adds independently', () => {
  const s = fresh(); s.prestige.particles = 1000; s.prestige.casimir = 100;
  s.crispr = ['spatialReasoning']; assert.equal(calculateCrisprStorageBonus(s).multiplier, 1.4);
  s.crispr.push('dimensionCompression'); assert.equal(calculateCrisprStorageBonus(s).multiplier, 1.6);
  s.crispr.push('dimensionDistortion', 'casimirEffect'); assert.ok(Math.abs(calculateCrisprStorageBonus(s).multiplier - 1.88) < 1e-8);
});
test('技工 is an independent +100% and 工匠大师 doubles artisan throughput', () => {
  const s = fresh(); const b = buildingQueueCapacity(s), r = researchQueueCapacity(s);
  // 技工: an independent crafted-output multiplier, shown as its own row.
  s.crispr = ['technician'];
  assert.equal(calculateAutomaticCraftingMultipliers(s), 2);
  // 工匠大师: the artisan makes 0.1/s instead of 0.05/s, so output AND ingredients double.
  assert.equal(artisanCraftRate(.05, s), .05);
  s.crispr.push('masterArtisan');
  assert.equal(artisanCraftRate(.05, s), .1);
  assert.equal(calculateAutomaticCraftingMultipliers(s), 2, 'throughput, not a modifier');
  // Neither is a 锻造工具加成 entry.
  assert.equal(calculateForgingToolBonus(s, 0).total, 0);
  s.crispr.push('architect');
  assert.equal(buildingQueueCapacity(s), b * 2); assert.equal(researchQueueCapacity(s), r * 2);
  assert.equal(purchaseQueueCapacity(s, 'build'), b * 2); assert.equal(purchaseQueueCapacity(s, 'tech'), r * 2);
});
const snapshot = (state: GameState) => {
  const support = calculateSupportPreview(state);
  return { ...support, moonBaseUnits: support.moon.baseUnits };
};
const context = { now: 0, eventInterval: 60, housingCapacity: () => 1, clampResources: (state: GameState) => clampResourcesToCaps(state, snapshot(state)) };
const materials: CrisprUpgradeId[] = ['materialEfficiency', 'innovativeMaterials', 'structuralReinforcement', 'physicsLaws', 'halfLife3'];

test('CRISPR registry has exact tiers, prices and prerequisite chain', () => {
  assert.deepEqual(materials.map(id => CRISPR_UPGRADES[id].cost), [10, 25, 100, 500, 1000]);
  assert.deepEqual(materials.map(id => CRISPR_UPGRADES[id].tier), [0, 1, 2, 3, 4]);
  assert.deepEqual(materials.map(id => CRISPR_UPGRADES[id].pre), [[], ['materialEfficiency'], ['innovativeMaterials'], ['structuralReinforcement'], ['physicsLaws']]);
  assert.equal(CRISPR_UPGRADES.geneOptimization.cost, 200);
  assert.equal(CRISPR_UPGRADES.spatialReasoning.cost, 100);
});

test('purchases require research, prerequisites, sufficient particles and uniqueness without partial mutation', () => {
  const state = fresh(); state.prestige.particles = 1000;
  const rejects = (id: CrisprUpgradeId) => { const before = JSON.stringify(state); assert.equal(purchaseCrisprUpgrade(state, id), false); assert.equal(JSON.stringify(state), before); };
  rejects('materialEfficiency');
  state.tech.push('crispr16'); rejects('innovativeMaterials'); rejects('unknown' as CrisprUpgradeId);
  state.prestige.particles = 9; rejects('materialEfficiency');
  state.prestige.particles = 10;
  assert.equal(purchaseCrisprUpgrade(state, 'materialEfficiency'), true);
  assert.equal(state.prestige.particles, 0); assert.deepEqual(state.crispr, ['materialEfficiency']);
  state.prestige.particles = 1000; rejects('materialEfficiency');
});

test('material tiers immediately replace lower reductions and combine with industrialism, not ARPA', () => {
  const state = fresh(); state.tech.push('crispr16'); state.prestige.particles = 10000;
  // 创造 rewrites ARPA prices; this test asserts material tiers leave them alone.
  state.speciesTraits = { traits: [] };
  const original = calculateBuildingScale('factory', 'cash', state);
  const monument = calculateProjectCost('monument', state);
  for (const [index, id] of materials.entries()) {
    assert.equal(purchaseCrisprUpgrade(state, id), true);
    assert.ok(Math.abs(calculateBuildingScale('factory', 'cash', state) - (original - (index + 1) / 100)) < 1e-12);
    assert.deepEqual(calculateProjectCost('monument', state), monument);
    assert.deepEqual(calculateProjectCost('geneSequencing', state), { knowledge: 1000000 });
    assert.equal(calculateBuildingCost('factory', 5, state).cash, Math.ceil(BUILDINGS.factory.cost.cash! * (original - (index + 1) / 100) ** 5));
  }
  state.government = 'industrialism';
  assert.ok(Math.abs(calculateBuildingScale('factory', 'cash', state) - (original - .055)) < 1e-12);
});

test('gene optimization changes remaining project investment immediately and survives resets', () => {
  const state = fresh(); state.tech.push('crispr16', 'genetics'); state.prestige.particles = 200;
  state.resources.knowledge = 250000;
  assert.equal(investInProject('geneSequencing', state, 25, () => 0), 25);
  assert.equal(purchaseCrisprUpgrade(state, 'geneOptimization'), true);
  assert.deepEqual(calculateProjectCost('geneSequencing', state), { knowledge: 500000 });
  state.resources.knowledge = 375000;
  assert.equal(investInProject('geneSequencing', state, 100, () => 0), 75);
  assert.equal(state.arpaBuildings.geneSequencing, 1); assert.equal(state.resources.knowledge, 0);
  const reset = resetRunState(state, 'soft', 60, 0)!.next;
  assert.deepEqual(calculateProjectCost('geneSequencing', reset), { knowledge: 500000 });
});

test('spatial reasoning uses remaining particles on all ordinary caps with matching detail totals', () => {
  const state = fresh(); state.tech.push('crispr16'); state.prestige.particles = 1100;
  state.buildings.warehouse = 2;
  const base = Object.fromEntries((Object.keys(RESOURCES) as ResourceId[]).map(id => [id, calculateStorageDetails(id, state, snapshot(state)).total]));
  assert.equal(purchaseCrisprUpgrade(state, 'spatialReasoning'), true);
  for (const id of Object.keys(RESOURCES) as ResourceId[]) {
    const details = calculateStorageDetails(id, state, snapshot(state));
    const baseline = base[id]; assert.ok(baseline !== undefined);
    // 字节 is a special resource that opts into the prestige bonuses (0.9.43); the other
    // special resources (加密数据, electricity) and crafted goods stay out.
    if (RESOURCES[id].crafted || RESOURCES[id].special) {
      if (id === 'bytes') {
        assert.ok(Math.abs(details.total - baseline * 1.4) < 1e-8, `bytes ${details.total} vs ${baseline * 1.4}`);
        const sum = details.rows.reduce((total, row) => total + row.value, 0);
        assert.ok(Math.abs(sum - details.total) < 1e-8, `bytes rows ${sum} vs total ${details.total}`);
      } else assert.equal(details.total, base[id]);
    }
    else {
      assert.ok(Math.abs(details.total - baseline * 1.4) < 1e-8);
      assert.equal(details.rows.reduce((sum, row) => sum + row.value, 0), details.total);
    }
  }
  assert.equal(purchaseCrisprUpgrade(state, 'geneOptimization'), true);
  assert.ok(base.wood !== undefined);
  assert.ok(Math.abs(calculateStorageDetails('wood', state, snapshot(state)).total - base.wood * 1.32) < 1e-8);
});

test('soft and nuclear retain independent permanent arrays; hard resets clear them', () => {
  const state = fresh(); state.crispr = [...materials, 'geneOptimization', 'spatialReasoning']; state.prestige.particles = 99;
  state.tech.push('nuclearProgram'); state.nuclearProgress = 100;
  for (const next of [resetRunState(state, 'soft', 60, 0)!.next, launchNuclearPrestige(state, 60, 0)!.next]) {
    assert.deepEqual(next.crispr, state.crispr); assert.notEqual(next.crispr, state.crispr); assert.deepEqual(next.tech, []);
    assert.deepEqual(validateAndMigrateSave(JSON.parse(JSON.stringify(next)), context).crispr, state.crispr);
  }
  assert.deepEqual(resetRunState(state, 'hard', 60, 0)!.next.crispr, []);
});

test('save round trips permanent upgrades and applies caps before clamping; missing records reject', () => {
  const state = fresh(); state.crispr = [...materials, 'spatialReasoning', 'geneOptimization']; state.prestige.particles = 1000;
  state.resources.wood = 280;
  const loaded = validateAndMigrateSave(JSON.parse(JSON.stringify(state)), context);
  assert.deepEqual(loaded.crispr, state.crispr); assert.equal(loaded.resources.wood, 280);
  const raw = JSON.parse(JSON.stringify(fresh())); delete raw.crispr;
  assert.throws(() => validateAndMigrateSave(raw, context));
  for (const crispr of [null, {}, 'materialEfficiency', ['unknown'], ['materialEfficiency', 'materialEfficiency'], ['halfLife3'], ['materialEfficiency', 1]]) {
    assert.throws(() => validateAndMigrateSave({ ...fresh(), crispr }, context), /CRISPR/);
  }
  assert.throws(() => validateAndMigrateSave({ ...fresh(), tech: ['crispr16'] }, context), /CRISPR/);
});

test('perks list shows only the highest owned tier of each chain with live values', () => {
  const state = fresh();
  assert.equal(listActivePerks(state).length, 1); assert.equal(listActivePerks(state)[0]!.id, 'mastery');
  state.crispr = ['materialEfficiency', 'innovativeMaterials', 'spatialReasoning', 'dimensionCompression', 'architect'];
  state.prestige.particles = 100;
  const perks = listActivePerks(state).filter(perk => perk.id !== 'mastery');
  assert.deepEqual(perks.map(perk => perk.id), ['innovativeMaterials', 'dimensionCompression', 'architect']);
  assert.ok(perks.every(perk => perk.source === 'crispr'));
  assert.ok(perks[0]!.lines.at(-1)!.includes('0.02'));
  assert.ok(perks[1]!.lines.at(-1)!.includes('+6%'));
  assert.deepEqual(perks[2]!.lines, [CRISPR_UPGRADES.architect.desc]);
  state.crispr.push('dimensionDistortion', 'casimirEffect'); state.prestige.casimir = 50;
  const storage = listActivePerks(state).filter(perk => ['spatialReasoning', 'dimensionCompression', 'dimensionDistortion', 'casimirEffect'].includes(perk.id));
  assert.deepEqual(storage.map(perk => perk.id), ['dimensionDistortion', 'casimirEffect']);
  assert.ok(storage[1]!.lines.at(-1)!.includes('+4%'));
});

test('earned achievements contribute perks only when they define a special effect', () => {
  const state = fresh();
  state.achievements = ['nuclearCuriosity'];
  assert.equal(listActivePerks(state).length, 1); assert.equal(listActivePerks(state)[0]!.id, 'mastery');
  const definition = ACHIEVEMENTS.nuclearCuriosity;
  state.achievementLevels = { nuclearCuriosity: 3 };
  definition.perk = level => `测试特权 +${level + 1}%`;
  try {
    assert.deepEqual(listActivePerks(state).filter(perk => perk.id !== 'mastery'), [{ id: 'nuclearCuriosity', source: 'achievement', name: `${ACHIEVEMENTS.nuclearCuriosity.name} · 等级 3`, lines: ['测试特权 +4%'] }]);
    assert.ok(listActivePerks(state).find(perk => perk.id === 'mastery')!.lines[0]!.includes('+1%'));
    state.achievements = [];
    assert.equal(listActivePerks(state).length, 1); assert.equal(listActivePerks(state)[0]!.id, 'mastery');
  } finally { delete definition.perk; }
});
