// src/barba/transition-lock.js
// Central authority for the transition scroll-lock, page-overlay, and stale
// state cleanup. Every Barba transition calls lock/unlock through here so the
// behaviour is consistent across slide, panel-nav, project-to-project, and
// browser back/forward.

import { stopLenis, startLenis } from "../core/lenis.js";

// ── Lock state ───────────────────────────────────────────────────────────────
// Reference-counted so nested lock/unlock calls balance correctly.
// forceUnlock() ignores the count — use it only in the after() safety-net.

let _lockDepth = 0;
const LOCK_CLASS = "is-transitioning";

export function lockTransition() {
  _lockDepth++;
  if (_lockDepth > 1) return; // already locked — no-op

  stopLenis();
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow            = "hidden";
  document.documentElement.classList.add(LOCK_CLASS);
}

export function unlockTransition() {
  _lockDepth = Math.max(0, _lockDepth - 1);
  if (_lockDepth > 0) return; // still locked
  _doUnlock();
}

export function forceUnlockTransition() {
  // Called in the global after() hook as a hard safety net. Always resets.
  _lockDepth = 0;
  _doUnlock();
}

function _doUnlock() {
  document.documentElement.style.overflow = "";
  document.body.style.overflow            = "";
  document.documentElement.classList.remove(LOCK_CLASS);
  // Explicit native scroll reset before Lenis resumes so the two never
  // diverge. Lenis's internal position is then synced on next raf tick.
  try { window.scrollTo(0, 0); } catch (_) {}
  startLenis();
}

// ── Page overlay ─────────────────────────────────────────────────────────────
// A single <div class="page-overlay"> is injected as the first child of the
// outgoing Barba container when it doesn't already exist in the markup.
// It darkens the outgoing page during the leave animation without requiring
// any background-transparency hacks on page content.

export function ensureOverlay(container) {
  if (!container) return null;
  let el = container.querySelector(":scope > .page-overlay");
  if (!el) {
    el = document.createElement("div");
    el.className = "page-overlay";
    el.setAttribute("aria-hidden", "true");
    container.insertBefore(el, container.firstChild);
  }
  return el;
}

export function resetOverlay(container) {
  const el = container?.querySelector(":scope > .page-overlay");
  if (!el) return;
  if (window.gsap) {
    window.gsap.set(el, { opacity: 0 });
  } else {
    el.style.opacity = "0";
  }
}

// ── Project-next transition state ─────────────────────────────────────────────
// Written by project-next-pin.js when progress hits 100 %. Read by
// project-next-handoff.js during the p2p transition's enter().
// Cleared here after every completed transition so history nav never reuses
// stale handoff data.

export function clearProjectNextTransition() {
  const s = window.__projectNextTransition;
  if (!s) return;
  s.href                    = null;
  s.sourceThumbEl           = null;
  s.sourceThumbBounds       = null;
  s.sourceTitleWrapEl       = null;
  s.sourceTitleWrapBounds   = null;
  s.sourceTitleEl           = null;
  s.sourceTitleBounds       = null;
  s.initiatedFromPinnedNext = false;
  s.inProgress              = false;
}

// Remove any orphaned [data-transition-overlay-root] nodes left by an aborted
// or errored handoff. Called at the top of every transition's before().
export function clearHandoffOverlays() {
  document.querySelectorAll("[data-transition-overlay-root]").forEach((el) => {
    try { el.remove(); } catch (_) {}
  });
}
