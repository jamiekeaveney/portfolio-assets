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

  // During Barba transitions the lock manager owns Lenis start/stop.
  // ctx.deferLenisStart = true is set by all navigation paths so that
  // initContainer never starts Lenis while the transition lock is active.
  // On first load (once()) the flag is absent — Lenis starts normally.
  if (!ctx.deferLenisStart) {
    startLenis();
  }

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
  // For navigations: called once in barba enter() before the animation.
  // For first load (once()): called synchronously in the once() hook.
  if (!ctx.deferLenisStart) {
    startLenis();
  }
}

onReady(function () {
  configureGSAPDefaults();
  initNav();
  initBarba({ initContainer });
});