import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { TECHNOLOGIES } from '../src/data/technologies';
import { calculateForgingToolBonus, calculateForgingToolMultiplier, calculateAutomaticCraftingMultipliers, artisanCraftRate } from '../src/simulation/crafting';
import { calculateProduction } from '../src/simulation/production';
import { calculateResourceFactorRows } from '../src/simulation/resource-breakdown';

function state() {
  const s = createInitialState(CONFIG.version, 60, 0);
  s.tech = Object.keys(TECHNOLOGIES) as never;
  Object.assign(s.resources, { wood: 1e7, cash: 1e7, iron: 1e7, coal: 1e7, food: 1e7, energy: 1e7, metal: 1e7, aluminum: 1e7 });
  s.population = 20;
  return s;
}
const near = (a: number, b: number, m: string) => assert.ok(Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)), `${m}: ${a} != ${b}`);

test('锻造工具加成 is one additive pool of building sources', () => {
  const s = state();
  s.buildings.foundry = 4; s.buildings.stellarForge = 2;
  // CRISPR upgrades are NOT tool bonuses any more.
  s.crispr = ['technician', 'masterArtisan'];
  const tool = calculateForgingToolBonus(s, 0, 0);
  // 4 foundries × 3% + 2 stellar × 10%
  near(tool.total, .12 + .2, 'additive total of building sources only');
  assert.deepEqual(tool.entries.map(entry => entry.name), ['铸造厂', '恒星熔炉']);
  assert.ok(!tool.entries.some(entry => entry.id === 'technician' || entry.id === 'masterArtisan'), 'CRISPR upgrades are not tool entries');
  near(calculateForgingToolMultiplier(s), 1 + tool.total, 'the pool is applied as (1 + Σ), not Π(1 + x)');
  // Multiplicative stacking of the two building sources would have given 1.12 × 1.2.
  assert.ok(calculateForgingToolMultiplier(s) < 1.12 * 1.2);
});

test('技工 is an independent +100% and 工匠大师 raises artisan throughput', () => {
  const s = state();
  s.crispr = ['technician'];
  assert.equal(calculateAutomaticCraftingMultipliers(s), 2, '技工 doubles output only');
  assert.equal(artisanCraftRate(.05, s), .05);
  s.crispr.push('masterArtisan');
  // Throughput doubles instead of adding a modifier, so output and ingredients rise together.
  assert.equal(artisanCraftRate(.05, s), .1);
  assert.equal(calculateAutomaticCraftingMultipliers(s), 2);
  // Neither belongs to the tool pool.
  assert.equal(calculateForgingToolBonus(s, 0, 0).total, 0);
});

test('artisan rows list no 技工/工匠大师 modifier and the tool pool appears once', () => {
  const s = state();
  s.buildings.foundry = 2; s.crispr = ['technician', 'masterArtisan'];
  s.workers.foundry = 2; s.craftWorkers.plank = 2;
  const result = calculateProduction(s);
  const rows = calculateResourceFactorRows('plank', s, result).rows;
  assert.ok(rows.some(row => row.name === '锻造工具加成'), 'pooled total row present');
  assert.equal(rows.filter(row => row.name === '锻造工具加成').length, 1, 'pool row appears once');
  // The left column shows only the total: no per-source child rows there.
  assert.ok(!rows.some(row => row.name === '铸造厂' && row.child), 'sources are not repeated in the left column');
  assert.ok(rows.some(row => row.name === '技工'), '技工 is an independent +100% row');
  assert.ok(!rows.some(row => row.name === '工匠大师'), '工匠大师 lives in the throughput, not a row');
});

test('铸造工具升级 was renamed to 锻造工具加成 and the right column lists sources', () => {
  assert.equal(TECHNOLOGIES.castingToolUpgrade.name, '锻造工具加成');
  const panel = readFileSync(new URL('../src/vue/components/TooltipPanel.vue', import.meta.url), 'utf8');
  assert.match(panel, /data-tool-bonus-title/);
  assert.match(panel, /锻造工具加成/);
  assert.match(panel, /data-tool-bonus-total/);
});
