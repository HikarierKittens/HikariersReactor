import { computed, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue';

/**
 * 专注布局（focus layout）: a panel may claim the whole content width by hiding the
 * right-hand column (queue + logs).
 *
 * This is deliberately a small shared primitive rather than a one-off boolean inside
 * `App.vue`. Any future panel that needs more room — a wide dependency tree, a large
 * table, a full-width builder — only has to register a predicate here; the layout, the
 * accessibility attributes and the restore behaviour come for free.
 *
 * Design rules this encodes:
 * - A panel declares *when* it wants focus; it never touches the DOM or the layout.
 * - Focus is derived, not toggled: leaving the panel restores the columns automatically,
 *   so a panel can never strand the player in a hidden-column state.
 * - The predicate runs inside a `computed`, so Vue tracks whatever reactive state it
 *   reads. Callers do not have to enumerate their dependencies — forgetting to do so
 *   would otherwise fail silently, with the layout simply never updating.
 */

export interface FocusLayoutOptions {
  /** The panel currently visible in the content area (a tab id). */
  activePanel: Ref<string | null>;
  /**
   * Panel id → predicate. The key must be the same id `activePanel` holds, otherwise the
   * predicate is never consulted; `tests/focus-layout.test.ts` covers that mismatch.
   * Read reactive state directly inside the predicate; the `computed` tracks it.
   */
  requests: Record<string, () => boolean>;
}

export interface FocusLayout {
  /** The panel currently holding focus, or null. */
  active: ComputedRef<string | null>;
  /** True when the right column is hidden. */
  isFocused: ComputedRef<boolean>;
  /** Attributes for the layout root, so CSS and tests share one source of truth. */
  layoutAttributes: ComputedRef<Record<string, string>>;
  /** Escape hatch for callers that must restore the columns immediately. */
  release: () => void;
}

export function useFocusLayout(options: FocusLayoutOptions): FocusLayout {
  // `release()` needs to override a predicate that would otherwise still be true, so it
  // is a small piece of real state rather than another derived value.
  const released = ref(false);

  const active = computed<string | null>(() => {
    if (released.value) return null;
    const panel = options.activePanel.value;
    if (!panel) return null;
    const predicate = Object.hasOwn(options.requests, panel) ? options.requests[panel] : undefined;
    // Reading `predicate()` here is what subscribes the computed to the panel's state.
    return predicate && predicate() ? panel : null;
  });

  // A focused panel is a layout mode, not a modal: tearing the component down must not
  // leave the queue permanently hidden if it is re-created later. `onScopeDispose` fires
  // for a component's unmount *and* for a bare `effectScope`, so the primitive is testable
  // outside a component (plain `onUnmounted` would silently never run there).
  onScopeDispose(() => { released.value = true; });

  return {
    active,
    isFocused: computed(() => active.value !== null),
    layoutAttributes: computed(() => active.value
      ? { 'data-focus-layout': active.value, 'data-focus-panel': active.value }
      : {}),
    release: () => { released.value = true; },
  };
}
