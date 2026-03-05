/**
 * Snapshot all CSS custom properties (--*) that GSAP/IX2 has written as inline
 * styles on :root and body. Returns a restore function.
 *
 * @param {Element} [restoreTarget] - Where to apply the frozen values.
 *   Pass data.current.container so vars are scoped to the outgoing container
 *   via CSS cascade. This lets resetIX2CSSVars() in enter() safely clear
 *   :root/body without affecting the frozen outgoing visual state.
 */
export function snapshotIX2CSSVars(restoreTarget) {
  const captured = {};

  [document.documentElement, document.body].forEach((el) => {
    for (let i = 0; i < el.style.length; i++) {
      const prop = el.style[i];
      if (prop.startsWith("--") && !(prop in captured)) {
        captured[prop] = el.style.getPropertyValue(prop);
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

/**
 * Convert all position:sticky elements inside `container` to position:absolute
 * at their current rendered pixel position.
 *
 * MUST be called BEFORE stopLenis(), resetScrollTop(), or any scroll-context
 * change — getBoundingClientRect() must reflect the element's "stuck" state.
 *
 * Why: setting position:fixed on the container (leave animation setup) breaks
 * sticky children because fixed containers have no scroll context for sticky
 * to anchor to. overflow:hidden also breaks sticky. Converting to absolute
 * with explicit coordinates lets the leave animation carry the elements with
 * the container as a single visual unit.
 */
export function freezeStickyInContainer(container) {
  try {
    const containerRect = container.getBoundingClientRect();
    container.querySelectorAll("*").forEach((el) => {
      try {
        if (window.getComputedStyle(el).position !== "sticky") return;
        const rect = el.getBoundingClientRect();
        // Position relative to the container (which will be position:fixed).
        // When GSAP later adds transform to the container for the leave animation,
        // absolute children move with it as a unit.
        el.style.position = "absolute";
        el.style.top    = (rect.top  - containerRect.top)  + "px";
        el.style.left   = (rect.left - containerRect.left) + "px";
        el.style.right  = "auto";
        el.style.bottom = "auto";
        el.style.width  = rect.width + "px";
      } catch (_) {}
    });
  } catch (_) {}
}
