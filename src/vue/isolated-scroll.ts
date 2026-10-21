import { computed, onScopeDispose, ref, watch, type ComputedRef, type Ref } from 'vue';

/**
 * 独立滚动区（isolated scroll region）: a scroll container that swallows its own wheel
 * input instead of letting it chain to the page.
 *
 * Browsers already keep scrolling inside an element while it can still scroll. The
 * problem is the *boundary*: once the list reaches its top or bottom, the wheel event
 * chains to the nearest scrollable ancestor and the whole page jumps — the player meant
 * to keep browsing the list, not to lose their place. `overscroll-behavior: contain`
 * handles most of that in CSS; this composable adds what CSS cannot express:
 *
 * - It only traps the wheel while the region can actually scroll in that direction, so a
 *   list shorter than its box still lets the page scroll normally.
 * - It re-measures when content changes (a resource unlocks, a row appears), because
 *   whether the region scrolls at all is dynamic.
 *
 * Layout (`max-height`, `overflow-y`) stays in CSS: this module owns behaviour only.
 * Any panel can adopt it, so it is deliberately not tied to the resource list.
 */

export interface IsolatedScrollOptions {
  /** Attribute written on the container so CSS and tests can target it. */
  attribute?: string;
}

export interface IsolatedScroll {
  /** Template ref for the scroll container. */
  container: Ref<HTMLElement | null>;
  /** True while the content is taller than the box. */
  overflowing: ComputedRef<boolean>;
}

/** True when the element can still scroll further in the wheel's direction. */
export function canScrollIn(element: Pick<HTMLElement, 'scrollHeight' | 'clientHeight' | 'scrollTop'>, deltaY: number): boolean {
  const max = element.scrollHeight - element.clientHeight;
  if (max <= 1) return false;
  if (deltaY < 0) return element.scrollTop > 0;
  if (deltaY > 0) return element.scrollTop < max - 1;
  return true;
}

/**
 * Wheel handler: stop the page from moving while the pointer is over the region.
 *
 * Registered with `passive: false`, because a passive listener cannot `preventDefault`
 * and the page chaining happens in the default action.
 */
function onWheel(event: WheelEvent): void {
  const element = event.currentTarget as HTMLElement | null;
  if (!element) return;
  // At a boundary the browser would scroll the page instead; hold the page still so the
  // list appears to "bounce" rather than handing control to the document.
  if (!canScrollIn(element, event.deltaY)) event.preventDefault();
  event.stopPropagation();
}

export function useIsolatedScroll(options: IsolatedScrollOptions = {}): IsolatedScroll {
  const container = ref<HTMLElement | null>(null);
  const overflowing = ref(false);

  let resizeObserver: ResizeObserver | null = null;
  let mutationObserver: MutationObserver | null = null;

  function measure(): void {
    const node = container.value;
    overflowing.value = !!node && node.scrollHeight - node.clientHeight > 1;
  }

  function disconnect(): void {
    resizeObserver?.disconnect(); resizeObserver = null;
    mutationObserver?.disconnect(); mutationObserver = null;
  }

  function connect(node: HTMLElement | null): void {
    disconnect();
    if (!node) return;
    if (options.attribute) node.setAttribute(options.attribute, '');
    // Content changes alter whether the region scrolls, so keep the flag live.
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(node);
    }
    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(measure);
      mutationObserver.observe(node, { childList: true, subtree: true });
    }
    measure();
  }

  // The template ref may point at a new node after a `v-if` toggle; Vue sets it to null
  // first, so attach/detach here instead of in `onMounted` (which fires only once).
  watch(container, (node, previous) => {
    if (previous && previous !== node) previous.removeEventListener('wheel', onWheel);
    if (node) node.addEventListener('wheel', onWheel, { passive: false });
    connect(node);
  }, { flush: 'post' });

  onScopeDispose(() => {
    container.value?.removeEventListener('wheel', onWheel);
    disconnect();
  });

  return { container, overflowing: computed(() => overflowing.value) };
}

/** Shared class for every isolated scroll region; carries the CSS side of the behaviour. */
export const ISOLATED_SCROLL_CLASS = 'isolated-scroll';
