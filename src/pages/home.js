// src/pages/home.js
import { initScroll1 } from "../features/scroll-1.js";
import { initLenisCentre } from "../features/lenis-centre.js";
import { runLoader, loaderHide } from "../features/loader.js";
import { stopLenis, startLenis } from "../core/lenis.js";

// ── Fine-tune this to control how soon home content reveals ──
// 0 = reveals start the instant 100% begins its stagger-out
// 0.2 = 200ms after that, etc. Negative values start even earlier.
const REVEAL_DELAY = 0.25;

export async function initHome(container, ctx) {
  if (!container) return Promise.resolve();

  let homeStarted = false;

  const startHomeNow = () => {
    if (homeStarted) return;
    homeStarted = true;

    // Only start Lenis if the transition lock isn't holding it stopped.
    // On first load deferLenisStart is absent (falsy) so Lenis starts normally.
    // On navigations deferLenisStart:true is set and the lock manager owns Lenis.
    if (!ctx?.deferLenisStart) {
      startLenis();
    }

    // Defer scroll-1 via onPostTransition when navigating so that its
    // ScrollTriggers are created AFTER Webflow.destroy() (in destroyAndInitIX2)
    // kills all STs in Step E. STs created inside flushPostTransition are safe.
    // On first load (no onPostTransition) initialise immediately as before.
    if (typeof ctx?.onPostTransition === "function") {
      ctx.onPostTransition(() => initScroll1(container));
    } else {
      initScroll1(container);
    }

    initLenisCentre(container);

    if (ctx && typeof ctx.startLoadReveals === "function") {
      if (REVEAL_DELAY <= 0) {
        ctx.startLoadReveals();
      } else {
        setTimeout(() => ctx.startLoadReveals(), REVEAL_DELAY * 1000);
      }
    }
  };

  if (ctx && ctx.isFirstLoad) {
    // Lock scroll during the loader — Lenis was started early in initContainer()
    // but the page must not be scrollable while the loader is visible.
    stopLenis();
    await runLoader(1.5, container, {
      onRevealStart: startHomeNow
    });
    startHomeNow();
  } else {
    await loaderHide();
    startHomeNow();
  }

  return Promise.resolve();
}

export function destroyHome() {}
