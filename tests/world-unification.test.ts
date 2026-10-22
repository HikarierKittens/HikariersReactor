import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { CONFIG } from '../src/data/config';
import { NEIGHBOR_IDS } from '../src/data/neighbors';
import { TECHNOLOGIES } from '../src/data/technologies';
import { createInitialState } from '../src/state/create-state';
import { validateCurrentSave } from '../src/state/validate-save';
import { calculateGlobalOutputMultiplier } from '../src/simulation/crafting';
import { calculateResourceBreakdown, calculateResourceFactorRows } from '../src/simulation/resource-breakdown';
import { calculateProduction } from '../src/simulation/production';
import {
  applyWorldUnification, executeRaid, garrisonedSoldiers, isNeighborsUnlocked, isWorldUnified,
  occupationOutputMultiplier, occupationTaxRate, unificationOutputMultiplier,
} from '../src/simulation/neighbors';
import { calculateStorageDetails, calculateStorageTotals } from '../src/simulation/storage';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateTechnologyTier } from '../src/simulation/technology';
import { isTechnologyUnlocked } from '../src/simulation/unlocks';
import { requestPurchaseModule } from '../src/simulation/purchases';
import type { GameState } from '../src/types/state';
import type { TechnologyId } from '../src/types/technologies';

/**
 * beta 0.9.11: T12 外星定居 re-gates the Asriel chain, and the 统一计划 → 世界统一 pair
 * replaces the occupation system with a flat global bonus.
 */
const context = { now: 0, eventInterval: 60, housingCapacity: () => 1e9, clampResources: () => undefined };
function fresh() { return createInitialState(CONFIG.version, 60, 0); }
/** Every prerequisite of `ids`, transitively, so the save validator sees a coherent tech tree. */
function withPrerequisites(state: GameState, ids: readonly TechnologyId[]): GameState {
  const pending = [...ids];
  while (pending.length) {
    const id = pending.pop()!;
    if (state.tech.includes(id)) continue;
    state.tech.push(id);
    pending.push(...TECHNOLOGIES[id].pre);
  }
  return state;
}
function snapshot(state: GameState) {
  const support = calculateSupportPreview(state);
  return { ...support, moonBaseUnits: support.moon.baseUnits } as never;
}

test('外星定居 is a T12 research gated on 行星勘探 and a built Asriel spaceport', () => {
  const tech = TECHNOLOGIES.alienSettlement;
  assert.equal(tech.name, '外星定居');
  assert.equal(tech.tier, 12);
  assert.equal(calculateTechnologyTier('alienSettlement'), 12);
  assert.deepEqual(tech.pre, ['planetaryExploration']);
  assert.deepEqual(tech.cost, { knowledge: 200000 });
  assert.equal(tech.buildingRequired, 'asrielSpaceport');

  const state = fresh();
  assert.equal(isTechnologyUnlocked('alienSettlement', state), false, 'needs 行星勘探 first');
  state.tech.push('planetaryExploration');
  assert.equal(isTechnologyUnlocked('alienSettlement', state), false, 'needs a built spaceport');
  state.buildings.asrielSpaceport = 1;
  assert.equal(isTechnologyUnlocked('alienSettlement', state), true);
});

test('the four Asriel technologies now hang off 外星定居 instead of 行星勘探', () => {
  for (const id of ['spaceControlTower', 'alienCasting', 'spaceIndustrialization', 'starRingStation'] as const) {
    assert.deepEqual(TECHNOLOGIES[id].pre, ['alienSettlement'], id);
  }
  const state = fresh();
  state.tech.push('planetaryExploration');
  state.buildings.asrielSpaceport = 1;
  state.asrielMissionCompleted = true;
  for (const id of ['spaceControlTower', 'alienCasting', 'spaceIndustrialization', 'starRingStation'] as const) {
    assert.equal(isTechnologyUnlocked(id, state), false, `${id} waits for 外星定居`);
  }
  state.tech.push('alienSettlement');
  for (const id of ['spaceControlTower', 'alienCasting', 'spaceIndustrialization', 'starRingStation'] as const) {
    assert.equal(isTechnologyUnlocked(id, state), true, id);
  }
});

test('earned Asriel research survives a save that predates the 外星定居 gate', () => {
  // A historical save may hold these four without 外星定居: the retarget must not revoke them.
  const state = fresh();
  withPrerequisites(state, ['spaceControlTower', 'alienCasting', 'spaceIndustrialization', 'starRingStation']);
  state.buildings.asrielSpaceport = 1;
  state.asrielMissionCompleted = true;
  const loaded = validateCurrentSave(JSON.parse(JSON.stringify(state)), context);
  for (const id of ['spaceControlTower', 'alienCasting', 'spaceIndustrialization', 'starRingStation'] as const) {
    assert.ok(loaded.tech.includes(id), `${id} keeps its earned research`);
  }
  // Future research still obeys the new parent.
  assert.equal(isTechnologyUnlocked('spaceGarrison', loaded), true, 'unrelated Asriel techs are unaffected');
  const blocked = fresh();
  blocked.tech.push('moonExploration', 'planetaryExploration');
  blocked.buildings.asrielSpaceport = 1;
  assert.equal(isTechnologyUnlocked('starRingStation', blocked), false);
});

test('统一计划 is a T13 research unlocked by 外星定居', () => {
  const tech = TECHNOLOGIES.unifiedPlan;
  assert.equal(tech.name, '统一计划');
  assert.equal(tech.tier, 13);
  assert.equal(calculateTechnologyTier('unifiedPlan'), 13);
  assert.deepEqual(tech.pre, ['alienSettlement']);
  assert.deepEqual(tech.cost, { knowledge: 325 });

  const state = fresh();
  state.tech.push('planetaryExploration');
  state.buildings.asrielSpaceport = 1;
  assert.equal(isTechnologyUnlocked('unifiedPlan', state), false);
  state.tech.push('alienSettlement');
  assert.equal(isTechnologyUnlocked('unifiedPlan', state), true);
});

test('世界统一 is a special research that waits for all three occupations', () => {
  const tech = TECHNOLOGIES.worldUnification;
  assert.equal(tech.name, '世界统一');
  assert.equal(tech.tier, -1, 'special-tier research');
  assert.equal(tech.occupiedNeighborsRequired, 3);
  assert.deepEqual(tech.pre, ['unifiedPlan']);
  assert.deepEqual(tech.cost, { knowledge: 1474 });

  const state = fresh();
  state.tech.push('planetaryExploration', 'alienSettlement', 'unifiedPlan');
  assert.equal(isTechnologyUnlocked('worldUnification', state), false, 'no occupation yet');
  const [first, second] = NEIGHBOR_IDS;
  state.neighbors.occupied = [first!];
  assert.equal(isTechnologyUnlocked('worldUnification', state), false, 'one occupation is not enough');
  state.neighbors.occupied = [first!, second!];
  assert.equal(isTechnologyUnlocked('worldUnification', state), false, 'two occupations are not enough');
  state.neighbors.occupied = [...NEIGHBOR_IDS];
  assert.equal(isTechnologyUnlocked('worldUnification', state), true);
});

test('researching 世界统一 dissolves the occupations and their effects', () => {
  const state = fresh();
  state.tech.push('moonExploration', 'planetaryExploration', 'alienSettlement', 'unifiedPlan');
  state.neighbors.occupied = [...NEIGHBOR_IDS];
  state.resources.knowledge = 1474;
  const before = structuredClone(state);
  assert.equal(requestPurchaseModule(state, 'tech', 'worldUnification', 0).status, 'buy-now');
  assert.ok(state.tech.includes('worldUnification'));
  assert.deepEqual(state.neighbors.occupied, [], 'the rival states are gone');
  assert.deepEqual(before.neighbors.occupied, [...NEIGHBOR_IDS], 'the source snapshot is untouched');
  // Occupation effects are replaced by the flat unification bonuses.
  assert.equal(isWorldUnified(state), true);
  assert.equal(occupationOutputMultiplier(state), 1, 'occupation output bonus ends');
  assert.equal(garrisonedSoldiers(state), 0, 'garrisons return');
  assert.equal(occupationTaxRate(state), state.taxRate, 'the occupation tax penalty ends');
  assert.equal(unificationOutputMultiplier(state), 1.25);
  assert.equal(isNeighborsUnlocked(state), false, 'no neighbours left to interact with');
});

test('世界统一 grants +25% global output and replaces the occupation factor', () => {
  const state = fresh();
  state.tech.push('planetaryExploration', 'alienSettlement', 'unifiedPlan');
  state.neighbors.occupied = [...NEIGHBOR_IDS];
  const occupiedFactor = calculateGlobalOutputMultiplier('iron', state);
  state.tech.push('worldUnification');
  const unifiedFactor = calculateGlobalOutputMultiplier('iron', state);
  // 1 + 3*0.05 = 1.15 occupied vs 1 + 0.25 unified, on top of the same particle/mastery factors.
  assert.ok(occupiedFactor > 1);
  assert.ok(Math.abs(unifiedFactor / occupiedFactor - 1.25 / 1.15) < 1e-12, 'occupation is replaced, not stacked');
  state.tech = state.tech.filter(id => id !== 'worldUnification');
  state.neighbors.occupied = [];
  assert.equal(calculateGlobalOutputMultiplier('iron', state), 1, 'neither bonus without either unlock');
});

test('the resource detail lists the occupation output bonus and the tax penalty', () => {
  // Player report: with every neighbour occupied, neither the −10% tax penalty nor the
  // +5% output bonus appeared in the cash/wood breakdown left column, even though both
  // were actually being applied.
  const state = fresh();
  state.tech.push('government', 'military');
  state.population = 100;
  state.buildings.forage = 6; state.workers.forage = 6;
  state.buildings.lumber = 6; state.workers.lumber = 6;
  state.buildings.barracks = 5;
  state.soldiers = 10;
  state.taxRate = 20;
  const rows = (resource: 'cash' | 'wood') => calculateResourceFactorRows(resource, state, calculateProduction(state)).rows;
  const find = (resource: 'cash' | 'wood', name: string) => rows(resource).find(row => row.name === name);

  // No occupation: neither row may exist.
  assert.equal(find('cash', '占领 ×1 税收惩罚'), undefined);
  assert.equal(find('wood', '占领 ×1'), undefined);

  state.neighbors.occupied = ['commonwealth'];
  // The tax penalty is listed next to the tax base, with the effective rate beside it.
  assert.equal(find('cash', '占领 ×1 税收惩罚')?.value, '−10%');
  assert.equal(find('cash', '实际税率')?.value, '10%');
  // The output bonus is listed for every affected resource.
  assert.equal(find('wood', '占领 ×1')?.value, '+5%');
  assert.equal(find('cash', '占领 ×1')?.value, '+5%');

  state.neighbors.occupied = [...NEIGHBOR_IDS];
  assert.equal(find('wood', '占领 ×3')?.value, '+15%');
  // Three occupations drive the collected rate to 0: the tax row and its penalty must
  // still be visible, because that is exactly when the player needs the explanation.
  assert.equal(find('cash', '占领 ×3 税收惩罚')?.value, '−20%');
  assert.equal(find('cash', '实际税率')?.value, '0%');
  assert.ok(find('cash', '猫猫税收'), 'the tax row itself stays visible at 0/s');

  // 世界统一 replaces the occupation rows instead of adding to them.
  state.tech.push('worldUnification');
  assert.equal(find('wood', '占领 ×3'), undefined, 'occupation rows disappear after unification');
  assert.equal(find('cash', '占领 ×3 税收惩罚'), undefined);
  assert.equal(find('wood', '世界统一')?.value, '+25%');
  assert.equal(find('cash', '世界统一')?.value, '+25%');

  // 电力 is a fixed supply budget: the settlement never scales it, so no row may claim it does.
  const energyRows = calculateResourceFactorRows('energy', state, calculateProduction(state)).rows;
  assert.ok(!energyRows.some(row => row.name === '世界统一' || row.name.startsWith('占领')));
});

test('世界统一 boosts the named storage buildings instead of every ordinary resource', () => {
  const state = fresh();
  state.buildings.warehouse = 4;
  state.buildings.hangar = 2;
  state.tech.push('worldUnification');
  const plain = fresh();
  plain.buildings.warehouse = 4;
  plain.buildings.hangar = 2;
  const caps = calculateStorageTotals(state, snapshot(state));
  const base = calculateStorageTotals(plain, snapshot(plain));
  // The named buildings double; the flat 基础储量 does not, so the total grows by a bit less.
  assert.ok(caps.iron > base.iron * 1.9, `iron capacity grew sharply [${base.iron} -> ${caps.iron}]`);
  assert.ok(caps.iron < base.iron * 2, 'the flat base does not double');
  assert.equal(caps.energy, 0, 'electricity has no storage');
  // The detail rows and the batched totals agree.
  const details = calculateStorageDetails('iron', state, snapshot(state));
  assert.ok(Math.abs(details.total - caps.iron) < 1e-9);
});

test('世界统一 no longer multiplies every ordinary cap', () => {
  // A resource produced without any of the named storage buildings must not move at all.
  const state = fresh();
  state.tech.push('worldUnification');
  const caps = calculateStorageTotals(state, snapshot(state));
  const plain = fresh();
  const base = calculateStorageTotals(plain, snapshot(plain));
  for (const resource of ['food', 'knowledge', 'bytes'] as const) {
    assert.equal(caps[resource], base[resource], `${resource} untouched by the blanket bonus`);
  }
});

test('production actually credits the unification multiplier', () => {
  const state = fresh();
  state.buildings.mine = 4;
  state.workers.mine = 20;
  state.buildings.nest = 20;
  state.population = 20;
  state.tech.push('worldUnification');
  const plain = structuredClone(state);
  plain.tech = plain.tech.filter(id => id !== 'worldUnification');
  const boosted = calculateProduction(state, 1);
  const base = calculateProduction(plain, 1);
  assert.ok(base.rates.iron > 0, 'the mine actually produces iron');
  assert.ok(Math.abs(boosted.rates.iron / base.rates.iron - 1.25) < 1e-9);
  const rows = calculateResourceBreakdown('iron', state, boosted).entries;
  assert.ok(rows.length > 0);
});

test('after 世界统一 no raid can start and the panel shows the new summary', () => {
  const state = fresh();
  state.tech.push('government', 'military', 'planetaryExploration', 'alienSettlement', 'unifiedPlan', 'worldUnification');
  state.soldiers = 500;
  state.neighbors.occupied = [];
  const raid = executeRaid(state, NEIGHBOR_IDS[0]!, 3, 100, () => 0.5);
  assert.equal(raid.ok, false);
  assert.match(raid.reason ?? '', /统一/);
  // Idempotent: researching it twice (or loading it) never re-runs the dissolve.
  assert.equal(applyWorldUnification(state), false);

  const panel = readFileSync(new URL('../src/vue/components/InternalPanel.vue', import.meta.url), 'utf8');
  assert.match(panel, /data-world-unified/);
  assert.match(panel, /data-unification-bonus/);
  assert.match(panel, /UNIFICATION_OUTPUT_BONUS/);
  assert.match(panel, /资源储量大幅提升/);
  assert.doesNotMatch(panel, /UNIFICATION_STORAGE_BONUS/, 'the blanket storage bonus is gone');
});

test('a unified save round-trips through strict validation', () => {
  const state = fresh();
  withPrerequisites(state, ['worldUnification']);
  state.neighbors.occupied = [];
  const loaded = validateCurrentSave(JSON.parse(JSON.stringify(state)), context);
  assert.ok(loaded.tech.includes('worldUnification'));
  assert.deepEqual(loaded.neighbors.occupied, []);
  assert.deepEqual(validateCurrentSave(JSON.parse(JSON.stringify(loaded)), context), loaded);
});

test('a stale occupied list on a unified save cannot resurrect the old bonuses', () => {
  // Even if a hand-edited save keeps occupations next to the researched tech, the tech wins.
  const state = fresh();
  state.tech.push('worldUnification');
  state.neighbors.occupied = [...NEIGHBOR_IDS];
  assert.equal(occupationOutputMultiplier(state), 1);
  assert.equal(garrisonedSoldiers(state), 0);
  assert.equal(occupationTaxRate(state), state.taxRate);
});
