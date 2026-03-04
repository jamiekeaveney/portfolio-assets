/**
 * Snapshot all CSS custom properties (--*) that GSAP/IX2 has written as inline
 * styles on :root and body. Returns a restore function.
 *
 * @param {Element} [restoreTarget] - Where to apply the frozen values.
 *   Pass data.current.container so the vars are scoped to the outgoing container
 *   via CSS cascade, rather than written back to :root/body. This means
 *   resetIX2CSSVars() in enter() can safely clear :root/body for the incoming
 *   page without affecting the frozen outgoing visual state.
 *
 * Usage pattern in leave():
 *   const restore = snapshotIX2CSSVars(data.current.container);
 *   killAllScrollTriggers();   // GSAP reverts :root/body vars to 0
 *   restore();                 // re-applies frozen values onto the outgoing container
 */
export function snapshotIX2CSSVars(restoreTarget) {
  const captured = {};

  [document.documentElement, document.body].forEach((el) => {
    for (let i = 0; i < el.style.length; i++) {
      const prop = el.style[i];
      if (prop.startsWith("--")) {
        // Earlier element wins if both :root and body define the same var
        if (!(prop in captured)) {
          captured[prop] = el.style.getPropertyValue(prop);
        }
      }
    }
  });

  const target = restoreTarget || document.documentElement;

  return function restore() {
    Object.entries(captured).forEach(([prop, val]) => {
      try { target.style.setProperty(prop, val); } catch (_) {}
    });
  };
}
