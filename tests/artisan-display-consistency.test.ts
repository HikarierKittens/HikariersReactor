import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { TECHNOLOGIES } from '../src/data/technologies';
import { CRAFT_RECIPES } from '../src/data/resources';
import {
  artisanCraftRate, calculateAutomaticCraftingMultipliers, changeCraftAssignment,
  countCraftWorkers, trimAssignedCraftWorkers,
} from '../src/simulation/crafting';
import { calculateProduction } from '../src/simulation/production';
import { isResourceUnlocked } from '../src/simulation/unlocks';

function base() {
  const s = createInitialState(CONFIG.version, 60, 0);
  s.tech = Object.keys(TECHNOLOGIES) as never;
  Object.assign(s.resources, { wood: 1e6, food: 1e6, iron: 1e6, coal: 1e6, metal: 1e6, aluminum: 1e6 });
  s.population = 20;
  s.buildings.foundry = 4;
  s.workers.foundry = 4;
  return s;
}

test('工匠大师 rate doubling reaches settlement and the per-artisan display', () => {
  const s = base();
  s.craftWorkers.plank = 1;
  const single = (state: typeof s) => calculateProduction(state).outputs['craft:plank']!;
  const withoutMaster = single(s);
  s.crispr.push('masterArtisan');
  const withMaster = single(s);
  const shownRate = artisanCraftRate(CRAFT_RECIPES.plank.rate, s);
  assert.equal(shownRate, CRAFT_RECIPES.plank.rate * 2, 'the panels show the doubled rate');
  // Settlement must use exactly the doubled rate the panels display.
  assert.ok(Math.abs(withMaster - withoutMaster * 2) < 1e-9,
    `工匠大师 must double plank output: ${withoutMaster} -> ${withMaster}`);
  // The rate is the only per-artisan difference; the crafted-output multiplier, particle
  // and mastery factors are unchanged and must explain the remainder on both sides.
  const craftedFactor = withoutMaster / CRAFT_RECIPES.plank.rate;
  assert.ok(Math.abs(withMaster - shownRate * craftedFactor) < 1e-9,
    `${withMaster} must equal the displayed ${shownRate} x ${craftedFactor}`);
});

test('a recipe that becomes locked keeps its artisans so the player can reclaim them', () => {
  const s = base();
  s.craftWorkers.mithril = 2;
  s.craftWorkers.plank = 1;
  s.buildings.factory = 0;
  assert.equal(isResourceUnlocked('mithril', s), false, 'mithril requires alloy, which needs a factory');
  trimAssignedCraftWorkers(s);
  // Slots are still clamped, but the assignment itself survives: the artisan panel renders
  // locked-but-staffed rows so those soldiers of industry are not stranded invisibly.
  assert.equal(s.craftWorkers.mithril, 2, 'locked recipe keeps its artisans for manual withdrawal');
  assert.equal(s.craftWorkers.plank, 1, 'unlocked recipes keep their artisans');
  // And the withdrawal the panel offers actually works.
  assert.equal(changeCraftAssignment(s, 'mithril', -1), -1);
  assert.equal(s.craftWorkers.mithril, 1);
});

test('trimming clamps by slots and never yields NaN', () => {
  const partial: { workers: { foundry: number }; craftWorkers: Record<string, number> } = {
    workers: { foundry: 1 }, craftWorkers: { plank: 3 },
  };
  trimAssignedCraftWorkers(partial as never);
  assert.equal(partial.craftWorkers.plank, 1);
  for (const [id, value] of Object.entries(partial.craftWorkers)) {
    assert.ok(Number.isFinite(value), `${id} must be a finite number, got ${value}`);
  }
});

test('artisans stranded on a locked recipe can still be withdrawn', () => {
  const s = base();
  s.craftWorkers.mithril = 2;
  s.buildings.factory = 0;
  assert.equal(isResourceUnlocked('mithril', s), false);
  // Assigning more is refused while locked...
  assert.equal(changeCraftAssignment(s, 'mithril', 1), 0);
  // ...but withdrawing must work, otherwise the stranded slots are unreachable.
  assert.equal(changeCraftAssignment(s, 'mithril', -1), -1);
  assert.equal(s.craftWorkers.mithril, 1);
  assert.equal(changeCraftAssignment(s, 'mithril', -5), -1);
  assert.equal(s.craftWorkers.mithril, 0);
  assert.equal(countCraftWorkers(s), 0);
});

test('the artisan output multiplier is output-only and stays a single factor', () => {
  const s = base();
  assert.equal(calculateAutomaticCraftingMultipliers(s), 1);
  s.crispr.push('technician');
  assert.equal(calculateAutomaticCraftingMultipliers(s), 2);
  s.geneModification.levels.overclockForging = 5;
  // 技工 x2 and 超频锻造 +5% compose into one multiplier; there is no input factor.
  assert.ok(Math.abs(calculateAutomaticCraftingMultipliers(s) - 2 * 1.05) < 1e-9);
});

test('the forge tool pool is labelled 锻造工具加成 in building hints', () => {
  const rows = readFileSync('src/vue/building-tooltip-rows.ts', 'utf8');
  assert.match(rows, /id === 'foundry'[^\n]*add\('锻造工具加成', '\+3%'\)/);
  assert.match(rows, /id === 'stellarForge'[^\n]*add\('锻造工具加成', '\+10%'\)/);
  assert.match(rows, /id === 'particleAccelerator'[\s\S]{0,260}add\('锻造物产量'/);
});
