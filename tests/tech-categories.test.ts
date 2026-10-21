import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { TECHNOLOGIES } from '../src/data/technologies';
import { RETIRED_TECHNOLOGIES, TECH_CATEGORIES, TECH_CATEGORY_META, techCategory } from '../src/vue/tech-categories';
import type { TechnologyId } from '../src/types/technologies';

/**
 * 科技分类: the completed-tech tree colours each button border by category.
 *
 * The important invariant is coverage. A new technology that is missing from
 * `TECH_CATEGORIES` would silently render with no colour at all, which is exactly the
 * kind of omission that survives review — so this file fails instead.
 */

const ids = Object.keys(TECHNOLOGIES) as TechnologyId[];

test('every technology has exactly one category and no category names an unknown id', () => {
  for (const id of ids) {
    assert.ok(Object.hasOwn(TECH_CATEGORIES, id), `${id} (${TECHNOLOGIES[id].name}) is missing a category`);
    assert.ok(TECH_CATEGORY_META.some(meta => meta.id === TECH_CATEGORIES[id]), `${id} has an unknown category`);
  }
  for (const id of Object.keys(TECH_CATEGORIES)) {
    assert.ok(Object.hasOwn(TECHNOLOGIES, id), `TECH_CATEGORIES names ${id}, which is not a technology`);
  }
  assert.equal(Object.keys(TECH_CATEGORIES).length, ids.length);
});

test('the seven categories are stable and each one actually contains technologies', () => {
  assert.deepEqual(TECH_CATEGORY_META.map(meta => meta.id),
    ['milestone', 'production', 'infrastructure', 'military', 'space', 'digital', 'special']);
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(TECH_CATEGORIES[id], (counts.get(TECH_CATEGORIES[id]) ?? 0) + 1);
  for (const meta of TECH_CATEGORY_META) {
    assert.ok((counts.get(meta.id) ?? 0) > 0, `${meta.name} must not be empty`);
    assert.ok(meta.name.length > 0 && meta.color.startsWith('#') && meta.color.length === 7, meta.id);
  }
  // A category holding more than half the tree would defeat the purpose of colouring.
  for (const [category, count] of counts) assert.ok(count < ids.length / 2, `${category} holds ${count}/${ids.length}`);
});

test('milestone keeps the historical gold and the original KEY_TECHNOLOGIES', async () => {
  const { KEY_TECHNOLOGIES } = await import('../src/vue/tech-tree');
  for (const id of KEY_TECHNOLOGIES) {
    assert.equal(techCategory(id), 'milestone', `${id} must stay a milestone`);
  }
  const milestone = TECH_CATEGORY_META.find(meta => meta.id === 'milestone')!;
  assert.equal(milestone.color, '#e0b64a');
  // 基础生存 is the first technology; it belongs to the milestone line as well.
  assert.equal(techCategory('survival'), 'milestone');
});

test('ordinary power plants are production, not space, even when built off-world', () => {
  // User decision: a power plant is a production facility regardless of which page it sits on.
  for (const id of ['solarPower', 'hydrogenRecovery', 'fusionPower', 'solarSatellite', 'stellarForge'] as const) {
    assert.equal(techCategory(id), 'production', `${TECHNOLOGIES[id].name} is a power plant`);
  }
  // Mega-structures and exploration/settlement stay in 太空与异星.
  for (const id of ['dysonSphere', 'dysonSphereII', 'penroseTheory', 'planetaryExploration', 'alienSettlement',
    'moonExploration', 'spaceflight', 'hyperspaceMiningSurvey'] as const) {
    assert.equal(techCategory(id), 'space', `${TECHNOLOGIES[id].name} is space content`);
  }
});

test('retired research is hidden but still valid historical progress', () => {
  // 农业机械 was retired in the T20 update: its 农民 ×2 effect is gone, but the ID stays
  // in the registry so a save that already researched it still loads.
  // 戴森球升级技术 is retired too (beta 0.9.27): 2级戴森球 is on hold, so it is hidden from
  // both tech views while historical saves keep their progress and the built 2级戴森球.
  assert.deepEqual([...RETIRED_TECHNOLOGIES], [
    'energyStorage', 'batteryConcentrationRing', 'agriculturalMachinery', 'dysonSphereII',
  ]);
  for (const id of RETIRED_TECHNOLOGIES) {
    assert.ok(Object.hasOwn(TECHNOLOGIES, id), `${id} stays in the registry so saves validate`);
    assert.ok(Object.hasOwn(TECH_CATEGORIES, id), `${id} still needs a category to keep coverage total`);
  }
  // The panel filters them out of both views.
  const panel = readFileSync(new URL('../src/vue/components/TechPanel.vue', import.meta.url), 'utf8');
  assert.match(panel, /RETIRED_TECHNOLOGIES\.includes\(id\)/, 'TechPanel must filter retired research');
  const visibleLine = panel.split('const visible')[1]?.split(';')[0] ?? '';
  assert.match(visibleLine, /!RETIRED_TECHNOLOGIES\.includes\(id\)/);
  // Both the available list and the completed tree derive from the filtered set.
  assert.match(panel, /visible\.filter\(id => !props\.state\.tech\.includes\(id\)/);
  assert.match(panel, /visible\.filter\(id => props\.state\.tech\.includes\(id\)\)/);
});

test('every tech button carries its category and the stylesheet defines all seven colours', () => {
  const panel = readFileSync(new URL('../src/vue/components/TechPanel.vue', import.meta.url), 'utf8');
  // Both views render the attribute: the research list and the completed tree.
  assert.equal((panel.match(/:data-tech-category="techCategory\(/g) ?? []).length, 2);
  const css = readFileSync(new URL('../assets/css/style.css', import.meta.url), 'utf8');
  for (const meta of TECH_CATEGORY_META) {
    assert.ok(css.includes(`[data-tech-category="${meta.id}"]{--tech-color:${meta.color}`),
      `${meta.id} must be styled with its declared colour ${meta.color}`);
  }
  // Colour is not the only cue: a same-colour dot keeps the categories apart for
  // colour-blind players, and the milestone glow stays unique to that one category.
  assert.match(css, /\.tech-button\[data-tech-category\]::before/);
  assert.match(css, /\.tech-button\[data-tech-category="milestone"\][^{]*\{box-shadow/);
});

test('the tech tooltip shows the category name under the title', () => {
  const panel = readFileSync(new URL('../src/vue/components/TooltipPanel.vue', import.meta.url), 'utf8');
  // The subtitle is derived from the same registry that colours the button, never from a
  // second hand-written table, so the hover line and the border cannot disagree.
  assert.match(panel, /const category = techCategory\(id\)/);
  assert.match(panel, /TECH_CATEGORY_META\.find\(entry => entry\.id === category\)/);
  assert.match(panel, /tip\.subtitle = meta\.name/);
  assert.match(panel, /tip\.subtitleCategory = meta\.id/);
  // It renders directly under the h3, before the flavour description and the price block.
  const titleAt = panel.indexOf('<h3>{{ content.title }}</h3>');
  const subtitleAt = panel.indexOf('class="tip-subtitle"');
  const descAt = panel.indexOf('class="tip-desc"');
  assert.ok(titleAt > 0 && subtitleAt > titleAt, 'the category line follows the title');
  assert.ok(descAt > subtitleAt, 'the category line precedes the flavour description');
  assert.match(panel, /data-tip-subtitle/);
  // The line is a category name only — no prices, numbers or effects belong in it.
  for (const meta of TECH_CATEGORY_META) {
    assert.doesNotMatch(meta.name, /\d/, `${meta.id} subtitle must stay a plain name`);
  }
  // The stylesheet tints it with the same seven colours as the tree borders.
  const css = readFileSync(new URL('../assets/css/style.css', import.meta.url), 'utf8');
  for (const meta of TECH_CATEGORY_META) {
    assert.ok(css.includes(`.tip-subtitle[data-tech-category="${meta.id}"]{--tech-color:${meta.color}`),
      `${meta.id} subtitle must reuse its border colour ${meta.color}`);
  }
});

test('the palette stays legible on the tech button background', () => {
  // WCAG relative luminance, compared against the completed-node button background.
  const background = '#292824';
  const luminance = (hex: string): number => {
    const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map(value => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return .2126 * channels[0]! + .7152 * channels[1]! + .0722 * channels[2]!;
  };
  const contrast = (a: string, b: string): number => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (high + .05) / (low + .05);
  };
  for (const meta of TECH_CATEGORY_META) {
    // 3:1 is the WCAG threshold for non-text UI boundaries; the darkest border sits at 3.68.
    assert.ok(contrast(meta.color, background) >= 3, `${meta.id} ${meta.color} is too dim on the button`);
  }
  // The default border it replaces is nearly invisible, which is why colouring helps at all.
  assert.ok(contrast('#393631', background) < 1.5);
});
