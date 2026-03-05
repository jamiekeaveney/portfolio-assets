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

  // initVideoAuto runs AFTER initPage so that slider.js clones are in the DOM.
  // The _initialized guard makes this safe — already-init'd originals are skipped,
  // only the newly cloned slides (which have no _initialized flag) are bound.
  initVideoAuto(container);

  startLoadReveals();

  initTextScroll(container);
  initRevealScroll(container);

  // ST.refresh() and lenis.resize() are NOT called here.
  // For navigations: called once in barba enter() before the animation,
  // while scroll=0 and the container is untransformed — the only safe moment.
  // For first load (once()): called synchronously in the once() hook.
  startLenis();
}

onReady(function () {
  configureGSAPDefaults();
  initNav();
  initBarba({ initContainer });
});