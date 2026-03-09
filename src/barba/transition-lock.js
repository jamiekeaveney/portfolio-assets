import { stopLenis, startLenis } from "../core/lenis.js";

let _lockDepth = 0;
let _safetyBound = false;
let _historyNavigation = false;

const LOCK_CLASS = "is-transitioning";

export function lockTransition() {
  _lockDepth++;
  if (_lockDepth > 1) return;

  stopLenis();

  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
  document.documentElement.classList.add(LOCK_CLASS);
}

export function unlockTransition() {
  _lockDepth = Math.max(0, _lockDepth - 1);
  if (_lockDepth > 0) return;
  _doUnlock();
}

export function forceUnlockTransition() {
  _lockDepth = 0;
  _doUnlock();
}

function _doUnlock() {
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
  document.documentElement.classList.remove(LOCK_CLASS);

  try { window.scrollTo(0, 0); } catch (_) {}
  startLenis();
}

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

export function markHistoryNavigation() {
  _historyNavigation = true;
}

export function isHistoryNavigation() {
  return _historyNavigation === true;
}

export function clearHistoryNavigation() {
  _historyNavigation = false;
}

export function bindTransitionLockSafety() {
  if (_safetyBound) return;
  _safetyBound = true;

  window.addEventListener("pageshow", () => {
    forceUnlockTransition();
    clearProjectNextTransition();
    clearHandoffOverlays();
    clearHistoryNavigation();
  });

  window.addEventListener("popstate", () => {
    markHistoryNavigation();
    forceUnlockTransition();
    clearProjectNextTransition();
    clearHandoffOverlays();

    try { window.scrollTo(0, 0); } catch (_) {}
  });
}

export function clearProjectNextTransition() {
  const s = window.__projectNextTransition;
  if (!s) return;

  s.href = null;
  s.sourceThumbEl = null;
  s.sourceThumbBounds = null;
  s.sourceTitleWrapEl = null;
  s.sourceTitleWrapBounds = null;
  s.sourceTitleEl = null;
  s.sourceTitleBounds = null;
  s.initiatedFromPinnedNext = false;
  s.inProgress = false;
}

export function clearHandoffOverlays() {
  document.querySelectorAll("[data-transition-overlay-root]").forEach((el) => {
    try { el.remove(); } catch (_) {}
  });
}