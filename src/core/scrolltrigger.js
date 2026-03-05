import { addCleanup } from "./cleanup.js";

/**
 * Canonical single-call ST refresh.
 * Call this after DOM mutations that affect scroll geometry (pin spacers inserted,
 * layout changes, etc.) but only when scroll=0 and no animation is running.
 * Do NOT call this mid-lerp — ST.refresh() recalibrates all scrub tweens to
 * native window.scrollY, which diverges from Lenis's animated position.
 */
export function refreshST() {
  if (!window.ScrollTrigger) return;
  try { window.ScrollTrigger.refresh(); } catch (_) {}
}

/** Kill every active ScrollTrigger. Last-resort fallback on leave(). */
export function killAllScrollTriggers() {
  if (!window.ScrollTrigger) return;
  try {
    window.ScrollTrigger.getAll().forEach((t) => {
      try { t.kill(); } catch (_) {}
    });
  } catch (_) {}
}

/**
 * Create a ScrollTrigger and auto-register its cleanup.
 * Prefer this over ScrollTrigger.create() directly so cleanups are always paired.
 */
export function createST(vars) {
  if (!window.ScrollTrigger) return null;
  const st = window.ScrollTrigger.create(vars);
  addCleanup(() => { try { st && st.kill(); } catch (_) {} });
  return st;
}

/**
 * @deprecated Use refreshST() instead.
 * Kept for backwards compatibility with any external callers.
 * The previous multi-call (rAF + 200ms) pattern was removed — those delayed
 * refreshes fired while Lenis was mid-lerp and caused the end-of-transition jerk.
 */
export function safeRefreshScrollTrigger() {
  refreshST();
}
