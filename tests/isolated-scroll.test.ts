import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { effectScope } from 'vue';
import { canScrollIn, ISOLATED_SCROLL_CLASS, useIsolatedScroll } from '../src/vue/isolated-scroll';

/**
 * 独立滚动区: a scroll container must not hand its wheel input to the page.
 *
 * The reusable part is the behaviour, so these tests exercise `canScrollIn` (the
 * boundary rule) and the wiring, not any particular list.
 *
 * 左栏自 beta 0.9.25 起把「资源列表 + 锻造物 + 威望资源」当作一个整体滚动，
 * 资源列表本身不再是滚动容器。断言据此更新，避免测试锁死旧挂载点。
 */

/** Minimal element stub with the three properties the boundary rule reads. */
function box(scrollTop: number, scrollHeight: number, clientHeight: number) {
  return { scrollTop, scrollHeight, clientHeight };
}

test('the boundary rule only claims the wheel while the region can still move', () => {
  const tall = box(0, 1000, 200);
  // Scrolling down from the top is the region's business.
  assert.equal(canScrollIn(tall, 100), true);
  // Scrolling up at the top is not: the page must not move either (preventDefault).
  assert.equal(canScrollIn(tall, -100), false);

  const bottom = box(800, 1000, 200);
  assert.equal(canScrollIn(bottom, 100), false, 'at the bottom the page would take over');
  assert.equal(canScrollIn(bottom, -100), true);

  const middle = box(400, 1000, 200);
  assert.equal(canScrollIn(middle, 100), true);
  assert.equal(canScrollIn(middle, -100), true);

  // A region whose content fits never traps the wheel, so a short list cannot freeze
  // page scrolling.
  const short = box(0, 150, 200);
  assert.equal(canScrollIn(short, 100), false);
  assert.equal(canScrollIn(short, -100), false);
  // Exactly one pixel of overflow is rounding noise, not a scrollable region.
  assert.equal(canScrollIn(box(0, 201, 200), 100), false);
});

test('a horizontal wheel does not lock vertical page scrolling', () => {
  // deltaY 0 means a purely horizontal gesture: never consume it.
  assert.equal(canScrollIn(box(0, 1000, 200), 0), true);
});

test('the composable exposes a container ref and a live overflow flag', () => {
  const scope = effectScope();
  const scroll = scope.run(() => useIsolatedScroll({ attribute: 'data-isolated-scroll' }))!;
  try {
    assert.equal(scroll.container.value, null);
    assert.equal(scroll.overflowing.value, false, 'nothing attached yet');
  } finally { scope.stop(); }
});

test('the stylesheet carries the CSS half of the behaviour', () => {
  const css = readFileSync(new URL('../assets/css/style.css', import.meta.url), 'utf8');
  // CSS owns layout; the composable owns behaviour. Both must be present.
  assert.match(css, new RegExp(`\\.${ISOLATED_SCROLL_CLASS}\\{[^}]*overflow-y:auto`));
  assert.match(css, new RegExp(`\\.${ISOLATED_SCROLL_CLASS}\\{[^}]*overscroll-behavior:contain`));
});

test('the left column is pinned so page scrolling never moves it', () => {
  const css = readFileSync(new URL('../assets/css/style.css', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/vue/App.vue', import.meta.url), 'utf8');
  // The column opts into the shared pinned-column class.
  assert.match(app, /<aside class="col-left pinned-column">/);
  const pinned = css.slice(css.indexOf('.col-left.pinned-column'));
  assert.ok(pinned.includes('position:sticky'), 'the column must be sticky');
  assert.ok(pinned.includes('height:100vh'), 'the column is locked to the viewport height');
  // `align-self:stretch` gives sticky its travel range; without it the grid row collapses
  // to the column's own height and sticky silently does nothing.
  assert.ok(pinned.includes('align-self:stretch'), 'sticky needs a taller grid row to travel in');
  assert.ok(css.includes('@media(min-width:861px){'), 'the pinning rules live behind the wide-screen breakpoint');
});

test('资源列表、锻造物与威望资源共用一个滚动容器', () => {
  const app = readFileSync(new URL('../src/vue/App.vue', import.meta.url), 'utf8');
  const resource = readFileSync(new URL('../src/vue/components/ResourcePanel.vue', import.meta.url), 'utf8');
  const crafting = readFileSync(new URL('../src/vue/components/CraftingPanel.vue', import.meta.url), 'utf8');

  // The shared scroller wraps all three blocks, in reading order.
  const scrollerStart = app.indexOf('class="col-left-scroll"');
  assert.ok(scrollerStart > 0, 'App.vue must declare the shared .col-left-scroll container');
  const scrollerEnd = app.indexOf('</aside>', scrollerStart);
  const inside = app.slice(scrollerStart, scrollerEnd);
  for (const component of ['<ResourcePanel', '<CraftingPanel', 'id="prestigeResources"']) {
    assert.ok(inside.includes(component), `${component} must live inside the shared scroller`);
  }
  // Order matters: resources first, then crafting, then prestige — one continuous list.
  assert.ok(inside.indexOf('<ResourcePanel') < inside.indexOf('<CraftingPanel'));
  assert.ok(inside.indexOf('<CraftingPanel') < inside.indexOf('id="prestigeResources"'));

  // The scroller is the isolated-scroll mount point now, not the resource panel.
  assert.match(app, /useIsolatedScroll\(\{ attribute: 'data-isolated-scroll' \}\)/);
  assert.match(app, /ref="leftScrollContainer"/);
  assert.match(app, /:class="ISOLATED_SCROLL_CLASS"/);

  // 资源列表不再自己滚动：它是普通面板，永远完整展开。
  assert.doesNotMatch(resource, /useIsolatedScroll/, 'the resource panel must not own the scroller');
  assert.doesNotMatch(resource, /ISOLATED_SCROLL_CLASS/, 'the resource panel must not carry the scroll class');
  assert.doesNotMatch(resource, /data-isolated-scroll/, 'the resource panel must not be the scroll target');
  assert.match(resource, /<section class="panel resource-panel">/, 'the resource panel is a plain panel');

  // 锻造物 likewise stays a plain panel — no height bound, no clipping.
  assert.doesNotMatch(crafting, /isolated-scroll|max-height|overflow-y/, 'crafting must not clip itself');
});

test('左栏滚动区吸收剩余高度，文明面板留在区外', () => {
  const css = readFileSync(new URL('../assets/css/style.css', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/vue/App.vue', import.meta.url), 'utf8');

  // The scroller fills the leftover column height so the three blocks share one scrollbar.
  const rule = css.slice(css.indexOf('.col-left .col-left-scroll{'));
  assert.match(rule.slice(0, 200), /flex:1 1 auto/, 'the scroller must absorb the remaining column height');
  // `min-height:0` is what lets a flex child actually shrink and scroll.
  assert.match(rule.slice(0, 200), /min-height:0/, 'without min-height:0 the flex child refuses to shrink');
  // The stacks keep their gaps without relying on the column's own gap.
  assert.match(rule.slice(0, 200), /flex-direction:column/, 'the blocks stack vertically inside the scroller');

  // 文明面板/资源列表上方的那块面板必须留在滚动区外，否则会跟着滚走。
  const scrollerStart = app.indexOf('class="col-left-scroll"');
  const civBefore = app.indexOf('<CivilizationPanel', scrollerStart);
  assert.equal(civBefore, -1, 'CivilizationPanel must stay outside the scroller');
  assert.ok(app.indexOf('<CivilizationPanel') < scrollerStart, 'CivilizationPanel sits above the scroller');

  // Regression guard: the old resource-panel-specific height rules are gone.
  assert.doesNotMatch(css, /\.col-left \.resource-panel\.isolated-scroll/, 'the panel-specific flex rule must be removed');
  assert.doesNotMatch(css, /resource-panel\.isolated-scroll/, 'the resource panel is no longer a scroll region');
});
