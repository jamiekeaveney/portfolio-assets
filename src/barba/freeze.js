/**
 * Snapshot all CSS custom properties (--*) that GSAP/IX2 has written as inline
 * styles on :root and body. Returns a restore function.
 *
 * Usage pattern in leave():
 *   const restore = snapshotIX2CSSVars();
 *   killAllScrollTriggers();   // GSAP reverts to 0 here
 *   restore();                 // re-apply frozen values over GSAP's revert
 *
 * This prevents the outgoing hero from snapping to 0 at the moment of click.
 */
export function snapshotIX2CSSVars() {
  const snapshots = [];

  [document.documentElement, document.body].forEach((el) => {
    const captured = {};
    for (let i = 0; i < el.style.length; i++) {
      const prop = el.style[i];
      if (prop.startsWith("--")) {
        captured[prop] = el.style.getPropertyValue(prop);
      }
    }
    snapshots.push({ el, captured });
  });

  return function restore() {
    snapshots.forEach(({ el, captured }) => {
      Object.entries(captured).forEach(([prop, val]) => {
        el.style.setProperty(prop, val);
      });
    });
  };
}
