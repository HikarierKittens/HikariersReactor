import { onBeforeUnmount, onMounted, type Ref } from 'vue';

/**
 * Keep a pinned column's height equal to the space it actually has.
 *
 * The right column is `position:sticky; top:0`, but it does not start at the viewport top:
 * the topbar and the tab strip sit above `.layout`. Setting `height:100vh` therefore pushes
 * the column's bottom past the viewport by exactly that offset, which is what made the log
 * area overflow instead of ending at the page bottom.
 *
 * Rather than hard-coding the offset (it changes with viewport width, wrapping topbars and
 * browser zoom), measure the column's own top in the document and publish it as
 * `--pinned-top-offset` for the stylesheet to subtract.
 *
 * Only the height is managed here; scrolling still happens inside the column's own scroll
 * containers, so the existing scroll behaviour is untouched.
 */
export function usePinnedColumnOffset(target: Ref<HTMLElement | null>): void {
  let frame = 0;

  const measure = (): void => {
    const node = target.value;
    if (!node) return;
    // Document-space top of the column: rect.top is viewport-relative, so add back the
    // scroll offset. This is the vertical space the topbar and tabs occupy above it.
    const offset = Math.max(0, Math.round(node.getBoundingClientRect().top + window.scrollY));
    node.style.setProperty('--pinned-top-offset', `${offset}px`);
  };
  const schedule = (): void => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(measure);
  };

  onMounted(() => {
    measure();
    window.addEventListener('resize', schedule);
  });

  onBeforeUnmount(() => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedule);
  });
}
