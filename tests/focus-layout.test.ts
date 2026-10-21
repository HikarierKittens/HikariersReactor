import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { effectScope, nextTick, ref, type Ref } from 'vue';
import { useFocusLayout, type FocusLayout } from '../src/vue/focus-layout';

/**
 * 专注布局: a panel claims the full content width by hiding the right column.
 *
 * The point of extracting this from `App.vue` is reuse, so the tests exercise the
 * primitive itself rather than the one panel that currently uses it.
 */

/** Run the composable inside a scope so `computed`/`onScopeDispose` behave as in a component. */
function mount(activePanel: Ref<string | null>, predicate: () => boolean) {
  const scope = effectScope();
  const layout = scope.run(() => useFocusLayout({
    activePanel,
    requests: { tech: predicate },
  }))!;
  return { layout: layout as FocusLayout, scope };
}

test('focus is derived from the active panel and its predicate', async () => {
  const activePanel = ref<string | null>('buildings');
  const view = ref('available');
  const { layout, scope } = mount(activePanel, () => view.value === 'completed');
  try {
    assert.equal(layout.isFocused.value, false, 'a non-focus panel never claims the layout');
    assert.deepEqual(layout.layoutAttributes.value, {});

    activePanel.value = 'tech';
    await nextTick();
    assert.equal(layout.isFocused.value, false, 'the tech panel starts in its unfocused sub-view');

    // The predicate reads `view` inside the computed, so Vue tracks it with no extra wiring.
    view.value = 'completed';
    await nextTick();
    assert.equal(layout.isFocused.value, true, 'switching to 已研究 requests focus');
    assert.deepEqual(layout.layoutAttributes.value, { 'data-focus-layout': 'tech', 'data-focus-panel': 'tech' });

    // Leaving the panel restores the columns: focus is derived, never latched.
    activePanel.value = 'buildings';
    await nextTick();
    assert.equal(layout.isFocused.value, false);
    assert.deepEqual(layout.layoutAttributes.value, {});

    // Returning while the sub-view is still 'completed' re-claims focus.
    activePanel.value = 'tech';
    await nextTick();
    assert.equal(layout.isFocused.value, true);
  } finally { scope.stop(); }
});

test('an unregistered panel cannot claim focus, and release() restores immediately', async () => {
  const activePanel = ref<string | null>('tech');
  const { layout, scope } = mount(activePanel, () => true);
  try {
    assert.equal(layout.isFocused.value, true);
    layout.release();
    await nextTick();
    assert.equal(layout.isFocused.value, false, 'release restores the columns at once');
  } finally { scope.stop(); }

  const other = ref<string | null>('statistics');
  const second = mount(other, () => true);
  try {
    assert.equal(second.layout.isFocused.value, false, 'panels without a predicate keep the normal layout');
  } finally { second.scope.stop(); }
});

test('tearing the component down never leaves the layout focused', async () => {
  const activePanel = ref<string | null>('tech');
  const { layout, scope } = mount(activePanel, () => true);
  assert.equal(layout.isFocused.value, true);
  scope.stop();
  // `onUnmounted` equivalent: the scope stop must have released the mode.
  assert.equal(layout.active.value, null, 'scope teardown releases focus so a re-created App starts normal');
});

test('a predicate that reads reactive state re-evaluates without an explicit dependency list', async () => {
  // Regression guard: the first implementation used `watch` plus a hand-written `sources`
  // array, so forgetting to list a ref made the layout silently never update.
  const activePanel = ref<string | null>('tech');
  const view = ref('available');
  const { layout, scope } = mount(activePanel, () => view.value === 'completed');
  try {
    view.value = 'completed';
    await nextTick();
    assert.equal(layout.isFocused.value, true, 'the computed must track the predicate on its own');
    view.value = 'available';
    await nextTick();
    assert.equal(layout.isFocused.value, false);
  } finally { scope.stop(); }
});

test('App wires the tech tree through the shared primitive, not a bespoke boolean', () => {
  const app = readFileSync(new URL('../src/vue/App.vue', import.meta.url), 'utf8');
  assert.match(app, /import \{ useFocusLayout \} from '\.\/focus-layout'/);
  assert.match(app, /const focusLayout = useFocusLayout\(\{/);
  // The only condition: the 科技 tab while its 已研究 sub-view is open.
  assert.match(app, /requests: \{ tech: \(\) => techView\.value === 'completed' \}/);
  // The layout root carries the attributes and the right column is a real sibling.
  assert.match(app, /<div class="layout" v-bind="focusLayout\.layoutAttributes\.value">/);
  assert.match(app, /<aside class="col-right">/);
  // No ad-hoc hiding flag leaked into the template.
  assert.doesNotMatch(app, /v-if="[^"]*hideQueue/);
});

test('a mismatched predicate key is ignored instead of silently never firing', async () => {
  // Regression guard: an early version keyed the predicate by a panel *name* ("techTree")
  // while `activePanel` held a tab id ("tech"), so the layout never updated and nothing
  // errored. Unknown keys must simply never match.
  const activePanel = ref<string | null>('tech');
  const scope = effectScope();
  const layout = scope.run(() => useFocusLayout({
    activePanel,
    requests: { techTree: () => true },
  }))!;
  try {
    await nextTick();
    assert.equal(layout.isFocused.value, false, 'a key that does not match the panel id never claims focus');
  } finally { scope.stop(); }
});

test('the stylesheet hides the right column only when the layout is focused', () => {
  const css = readFileSync(new URL('../assets/css/style.css', import.meta.url), 'utf8');
  assert.match(css, /\.layout\[data-focus-layout\]\{grid-template-columns:minmax\(0,1fr\) minmax\(0,3fr\)\}/);
  assert.match(css, /\.layout\[data-focus-layout\]>\.col-right\{display:none\}/);
  // The default three-column layout stays untouched for every other panel.
  assert.match(css, /\.layout\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,2fr\) minmax\(0,1fr\)/);
  // Focus only widens the centre; the left column keeps its width so resources stay readable.
  assert.match(css, /\.layout\[data-focus-layout\]\{grid-template-columns:minmax\(0,1fr\) minmax\(0,3fr\)\}/);
});
