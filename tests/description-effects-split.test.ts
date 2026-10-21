import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { TECHNOLOGIES } from '../src/data/technologies';

/**
 * 描述 = flavor prose under the name only. Every effect is derived from registry
 * mechanics by `building-tooltip-rows.ts` / TooltipPanel, so `desc` must never
 * carry numbers and there is no hand-written effect text to drift from the data.
 */
const MECHANIC_MARKERS = /\d|解锁|每座|每点|每秒|容量|产量|产出|消耗|占用|上限|倍率|价格|概率|\/s/;
// A tier label ("1级戴森球") is a proper name, not an effect quantity. Strip only
// that numeral form so a stray bonus number still fails the check.
const LEVEL_LABEL = /\d+\s*级/g;

test('building descriptions are flavor only', () => {
  for (const [id, building] of Object.entries(BUILDINGS) as [string, (typeof BUILDINGS)[keyof typeof BUILDINGS]][]) {
    const desc = building.desc ?? '';
    assert.doesNotMatch(desc.replace(LEVEL_LABEL, ''), MECHANIC_MARKERS, `${id} description must not carry mechanics: ${desc}`);
  }
});

test('technology descriptions are flavor only', () => {
  for (const [id, tech] of Object.entries(TECHNOLOGIES) as [string, (typeof TECHNOLOGIES)[keyof typeof TECHNOLOGIES]][]) {
    const desc = tech.desc ?? '';
    assert.doesNotMatch(desc, MECHANIC_MARKERS, `${id} description must not carry mechanics: ${desc}`);
  }
});

test('buildings derive every effect; technologies keep authored effect lines', () => {
  const buildings = readFileSync(new URL('../src/data/buildings.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(buildings, /effects\s*:/, 'building effects are derived from registry mechanics, never stored');
  const techs = TECHNOLOGIES as Record<string, { effects?: string[] }>;
  assert.ok(Object.values(techs).filter(t => (t.effects ?? []).length).length > 100,
    'technologies keep hand-written effect lines so players can read what they unlock');
});

test('most entries carry no description, matching the default-empty rule', () => {
  const buildings = Object.values(BUILDINGS);
  const techs = Object.values(TECHNOLOGIES);
  const withDescB = buildings.filter(b => b.desc).length;
  const withDescT = techs.filter(t => t.desc).length;
  assert.ok(withDescB < buildings.length / 2, `most buildings keep desc empty (${withDescB}/${buildings.length})`);
  assert.ok(withDescT < techs.length / 2, `most technologies keep desc empty (${withDescT}/${techs.length})`);
});

test('tooltip derives effects below the price divider, description above it', () => {
  const panel = readFileSync(new URL('../src/vue/components/TooltipPanel.vue', import.meta.url), 'utf8');
  const descAt = panel.indexOf('class="tip-desc"');
  const costsAt = panel.indexOf('class="tip-cost"');
  const rowsAt = panel.indexOf('class="resource-factor"');
  assert.ok(descAt > 0 && costsAt > descAt, 'description precedes the price block');
  assert.ok(rowsAt > costsAt, 'effect rows render after the price block');
  assert.match(panel, /'建筑效果'/);
  // Technologies render their authored lines in the 科技效果 block.
  assert.match(panel, /data-tip-effect/);
  assert.match(panel, /content\.effects/);
});
