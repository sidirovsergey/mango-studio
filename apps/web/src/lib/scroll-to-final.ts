/**
 * Scroll the workspace to the Stage 05 "Финал" section. Shared by
 * Stage04Inline (master finalize click) and TelemetryHeader (Phase 3b
 * "показать" link). Honors prefers-reduced-motion.
 */
export function scrollToFinal(): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('finalStage');
  if (!el) return;
  const prefersReduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({
    behavior: prefersReduced ? 'auto' : 'smooth',
    block: 'start',
  });
}
