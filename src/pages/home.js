import { initScroll1 } from "../features/scroll-1.js";
import { initLenisCentre } from "../features/lenis-centre.js";
import { runLoader, loaderHide } from "../features/loader.js";
import { stopLenis, startLenis } from "../core/lenis.js";

const REVEAL_DELAY = 0.25;

export async function initHome(container, ctx) {
  if (!container) return Promise.resolve();

  let homeStarted = false;

  const initScrollFeatures = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        initScroll1(container);
        try { window.ScrollTrigger?.refresh(); } catch (_) {}
        try { window.lenis?.resize?.(); } catch (_) {}
      });
    });
  };

  const startHomeNow = () => {
    if (homeStarted) return;
    homeStarted = true;

    if (!ctx?.deferLenisStart) {
      startLenis();
    }

    initLenisCentre(container);

    if (typeof ctx?.onPostTransition === "function") {
      ctx.onPostTransition(initScrollFeatures);
    } else {
      initScrollFeatures();
    }

    if (ctx && typeof ctx.startLoadReveals === "function") {
      if (REVEAL_DELAY <= 0) {
        ctx.startLoadReveals();
      } else {
        setTimeout(() => ctx.startLoadReveals(), REVEAL_DELAY * 1000);
      }
    }
  };

  if (ctx && ctx.isFirstLoad) {
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