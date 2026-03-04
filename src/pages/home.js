// src/pages/home.js
import { initScroll1 } from "../features/scroll-1.js";
import { initLenisCentre } from "../features/lenis-centre.js";
import { runLoader, loaderHide } from "../features/loader.js";

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

    initScroll1(container, ctx);
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