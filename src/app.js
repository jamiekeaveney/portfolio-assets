import { onReady } from "./core/ready.js";
import { runCleanups } from "./core/cleanup.js";
import { createLenis, startLenis } from "./core/lenis.js";
import { initNav } from "./core/nav.js";

import { initSplit } from "./features/split.js";
import { initVideoAuto } from "./features/video-auto.js";
import { initRevealLoad, primeRevealLoad } from "./features/reveal-load.js";
import { initVarsGrouped, initVarsLoad, primeVarsLoad } from "./features/vars.js";
import { initTextScroll, initRevealScroll } from "./features/reveal-scroll.js";

import { initPage } from "./pages/index.js";
import { initBarba } from "./barba/index.js";

var durationDefault = 0.8;

function configureGSAPDefaults() {
  if (!window.gsap) return;
  window.gsap.defaults({ ease: "expo.out", duration: durationDefault });
  window.gsap.config({ nullTargetWarn: false });
}

export async function initContainer(container, ctx = {}) {
  container = container || document;

  runCleanups();
  createLenis();
  // Start Lenis as early as possible so scroll is live from the first frame.
  // For navigation paths, enter() also calls startLenis() before initContainer()
  // runs — this call is a no-op in that case (Lenis already started).
  startLenis();
  initSplit(container);
  initVideoAuto(container);
  initVarsGrouped(container, ctx);
  primeRevealLoad(container, ctx);
  primeVarsLoad(container, ctx, "load");

  var loadRevealsStarted = false;
  var startLoadReveals = function () {
    if (loadRevealsStarted) return;
    loadRevealsStarted = true;

    initRevealLoad(container, ctx, { skipPrime: true });
    initVarsLoad(container, ctx, "load", { skipPrime: true });
  };

  ctx.startLoadReveals = startLoadReveals;

  await initPage(ctx.namespace || "", container, ctx);

  startLoadReveals();

  initTextScroll(container);
  initRevealScroll(container);

  // NOTE: ScrollTrigger.refresh() is intentionally NOT called here.
  // For navigations it fires in the global barba after() hook, after
  // clearProps removes all transition inline styles (so positions are
  // calculated against clean layout). For first load (once()) it fires
  // directly in the once() hook. Calling it here during the enter
  // animation would measure positions against a mid-animation transform.
  startLenis();
}

onReady(function () {
  configureGSAPDefaults();
  initNav();
  initBarba({ initContainer });
});