/**
 * Simple per-view cleanup registry.
 * Anything that binds listeners/observers/timelines should register a cleanup.
 */
let cleanups = [];

export function addCleanup(fn) {
  if (typeof fn === "function") cleanups.push(fn);
  return fn;
}

export function runCleanups() {
  const list = cleanups;
  cleanups = [];
  for (let i = 0; i < list.length; i++) {
    try { list[i](); } catch (_) {}
  }
}

/**
 * Captures the current cleanup queue and clears it without running.
 * Returns a function that, when called, runs the captured cleanups.
 *
 * Use in Barba leave() to keep outgoing scripts alive during the leave
 * animation. Call the returned function only after the animation resolves.
 *
 * Any new addCleanup() calls made AFTER captureCleanups() (e.g. in enter())
 * go into the now-empty queue and belong to the incoming page.
 */
export function captureCleanups() {
  const captured = cleanups.splice(0); // take all, clear array in-place
  return function runCaptured() {
    for (let i = 0; i < captured.length; i++) {
      try { captured[i](); } catch (_) {}
    }
  };
}

/** Utility: bind event listener + auto cleanup */
export function on(el, event, handler, options) {
  if (!el || !el.addEventListener) return () => {};
  el.addEventListener(event, handler, options);
  const off = () => {
    try { el.removeEventListener(event, handler, options); } catch (_) {}
  };
  addCleanup(off);
  return off;
}

/** Utility: IntersectionObserver + auto cleanup */
export function observe(el, options, cb) {
  if (!el || typeof cb !== "function") return () => {};
  const io = new IntersectionObserver((entries) => {
    for (let i = 0; i < entries.length; i++) cb(entries[i]);
  }, options);
  io.observe(el);
  const stop = () => { try { io.disconnect(); } catch (_) {} };
  addCleanup(stop);
  return stop;
}
