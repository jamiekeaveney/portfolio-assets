import { addCleanup } from "./cleanup.js";

let _lenisTickerFn = null;
let _lenisScrollUpdateFn = null;

export function createLenis() {
  if (!window.Lenis) return null;
  if (window.lenis) return window.lenis; // already alive — skip re-create

  destroyLenis();

  const lenis = new window.Lenis({
    lerp: 0.1,
    wheelMultiplier: 1,
    gestureOrientation: "vertical",
    normalizeWheel: false,
    smoothTouch: false
  });

  window.lenis = lenis;

  // If GSAP + ScrollTrigger exist, integrate properly.
  if (window.gsap && window.ScrollTrigger) {
    _lenisScrollUpdateFn = () => window.ScrollTrigger.update();
    lenis.on("scroll", _lenisScrollUpdateFn);

    _lenisTickerFn = (time) => lenis.raf(time * 1000);
    window.gsap.ticker.add(_lenisTickerFn);
    window.gsap.ticker.lagSmoothing(0);
  } else {
    // Fallback RAF loop
    (function raf(time) {
      if (!window.lenis) return;
      window.lenis.raf(time);
      requestAnimationFrame(raf);
    })(0);
  }

  // Auto cleanup if the view is torn down
  addCleanup(() => destroyLenis());

  return lenis;
}

export function destroyLenis() {
  if (!window.lenis) return;

  try { window.lenis.stop(); } catch (_) {}

  if (_lenisScrollUpdateFn) {
    try { window.lenis.off("scroll", _lenisScrollUpdateFn); } catch (_) {}
    _lenisScrollUpdateFn = null;
  }

  if (window.gsap && _lenisTickerFn) {
    try { window.gsap.ticker.remove(_lenisTickerFn); } catch (_) {}
    _lenisTickerFn = null;
  }

  try { window.lenis.destroy(); } catch (_) {}
  window.lenis = null;
}

export function stopLenis() {
  if (!window.lenis) return;
  try { window.lenis.stop(); } catch (_) {}
}

export function startLenis() {
  if (!window.lenis) return;
  try { window.lenis.start(); } catch (_) {}
}
