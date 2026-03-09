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

  initVideoAuto(container);

  if (!ctx.skipAutoLoadReveals) {
    startLoadReveals();
  }

  initTextScroll(container);
  initRevealScroll(container);
}

onReady(function () {
  configureGSAPDefaults();
  initNav();
  initBarba({ initContainer });
});