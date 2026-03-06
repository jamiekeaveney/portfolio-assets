// src/features/project-next-handoff.js
// Owns the visual handoff between the current project footer and the incoming
// project hero during a project → project Barba transition.
//
// createProjectNextHandoff(data) returns a GSAP timeline (paused).
// The caller is responsible for calling .play() and awaiting it.
//
// If source/target elements are missing the function degrades gracefully,
// returning a simple fade-in fallback timeline.
//
// DATA ATTRIBUTES
//   Source (current page footer):
//     [data-next-project-thumb]      — thumbnail img
//     [data-next-project-title-wrap] — title wrapper element
//     [data-next-project-title]      — title text element
//
//   Target (next page hero):
//     [data-project-hero-media]      — video or img hero element
//     [data-project-hero-title-wrap] — hero title wrapper
//     [data-project-hero-title]      — hero title text

const HANDOFF_DURATION = 1.5;
const HANDOFF_EASE     = "expo.inOut";
const FADE_IN_OFFSET   = HANDOFF_DURATION * 0.75; // real elements fade in at 75 %

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRect(el) {
  if (!el) return null;
  try { return el.getBoundingClientRect(); } catch (_) { return null; }
}

/** Append an absolutely-positioned overlay root above everything. */
function createOverlayRoot() {
  const el = document.createElement("div");
  el.setAttribute("data-transition-overlay-root", "");
  el.style.cssText =
    "position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:visible;";
  document.body.appendChild(el);
  return el;
}

/**
 * Apply fixed-position bounds to `el` so it sits exactly over `bounds`
 * in the viewport.
 */
function applyFixedBounds(el, bounds) {
  el.style.cssText +=
    `;position:fixed` +
    `;left:${bounds.left}px` +
    `;top:${bounds.top}px` +
    `;width:${bounds.width}px` +
    `;height:${bounds.height}px` +
    `;margin:0;box-sizing:border-box;`;
}

/**
 * Build a fixed-position proxy that visually mirrors the source thumbnail.
 * Copies border-radius so the pill/rounded shape is preserved throughout
 * the animation. The source may be an <img> or a wrapper containing one.
 */
function buildMediaProxy(sourceEl, bounds) {
  const proxy = document.createElement("div");

  // Copy border radius from the source element (it lives on the wrapper, not
  // the img itself, which is why overflow:hidden alone was losing it).
  try {
    const cs = window.getComputedStyle(sourceEl);
    const br = cs.borderRadius;
    if (br && br !== "0px") proxy.style.borderRadius = br;
  } catch (_) {}

  proxy.style.overflow = "hidden";

  const img = sourceEl.tagName === "IMG" ? sourceEl : sourceEl.querySelector("img");
  if (img?.src) {
    proxy.style.backgroundImage    = `url('${img.src}')`;
    proxy.style.backgroundSize     = "cover";
    proxy.style.backgroundPosition = "center";
  } else {
    // Fallback: clone the element so at least something is visible.
    const clone = sourceEl.cloneNode(true);
    clone.style.cssText += ";width:100%;height:100%;object-fit:cover;";
    proxy.appendChild(clone);
  }

  applyFixedBounds(proxy, bounds);
  return proxy;
}

/**
 * Build a fixed-position proxy that mirrors the source title text.
 * Copies computed typography — including padding — so the text renders
 * identically to the source without glyph clipping (ascenders / descenders).
 *
 * The outer proxy has NO overflow:hidden; we rely on the bounds being
 * accurate. Clipping would cut letters like "G" whose ink descends past
 * the baseline.
 */
function buildTitleProxy(sourceEl, bounds) {
  const proxy = document.createElement("div");
  // Deliberately NO overflow:hidden on the outer proxy — it clips descenders.

  const inner = sourceEl.cloneNode(true);

  // Strip any GSAP / SplitType inline transforms so the text renders cleanly.
  try {
    inner.querySelectorAll("[style]").forEach((el) => {
      el.style.transform  = "";
      el.style.opacity    = "1";
      el.style.visibility = "visible";
    });
    inner.style.transform  = "";
    inner.style.opacity    = "1";
    inner.style.visibility = "visible";
  } catch (_) {}

  // Mirror typography from source computed styles, INCLUDING padding.
  // Zeroing padding shifts glyphs within the bounds and causes the
  // perceived "jerk" — copying it keeps the text exactly in place.
  try {
    const cs = window.getComputedStyle(sourceEl);
    const props = [
      "fontFamily", "fontSize", "fontWeight", "lineHeight",
      "letterSpacing", "color", "textTransform", "whiteSpace",
      "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"
    ];
    props.forEach((p) => {
      try { inner.style[p] = cs[p]; } catch (_) {}
    });
  } catch (_) {}

  inner.style.margin = "0";
  inner.style.width  = "100%";
  inner.style.height = "100%";

  applyFixedBounds(proxy, bounds);
  proxy.appendChild(inner);
  return proxy;
}

/** Build a plain overlay div (no content) to animate bounds of a wrapper. */
function buildWrapProxy(bounds) {
  const proxy = document.createElement("div");
  proxy.style.overflow = "hidden";
  applyFixedBounds(proxy, bounds);
  return proxy;
}

// ── createProjectNextHandoff ─────────────────────────────────────────────────

/**
 * @param {object} data  Barba transition data ({ current, next })
 * @returns {gsap.core.Timeline}  A paused GSAP timeline. Call .play() to start.
 */
export function createProjectNextHandoff(data) {
  const gsap = window.gsap;

  // Guard: GSAP must be present.
  if (!gsap) {
    return {
      play() { return Promise.resolve(); },
      kill() {}
    };
  }

  const tl = gsap.timeline({ paused: true });

  const state         = window.__projectNextTransition || {};
  const nextContainer = data?.next?.container;

  // If this navigation was not initiated from the pinned footer there are no
  // pre-captured bounds — fall back to a simple fade.
  if (!state.initiatedFromPinnedNext || !nextContainer) {
    tl.fromTo(
      nextContainer || document.body,
      { opacity: 0 },
      { opacity: 1, duration: HANDOFF_DURATION, ease: HANDOFF_EASE }
    );
    return tl;
  }

  // ── Resolve pre-captured source bounds ──────────────────────────────────
  const srcThumbBounds     = state.sourceThumbBounds;
  const srcTitleWrapBounds = state.sourceTitleWrapBounds;
  const srcTitleBounds     = state.sourceTitleBounds;

  // ── Resolve live target elements (incoming page) ─────────────────────────
  const tgtMediaEl     = nextContainer.querySelector("[data-project-hero-media]");
  const tgtTitleWrapEl = nextContainer.querySelector("[data-project-hero-title-wrap]");
  const tgtTitleEl     = nextContainer.querySelector("[data-project-hero-title]");

  const tgtMediaBounds     = getRect(tgtMediaEl);
  const tgtTitleWrapBounds = getRect(tgtTitleWrapEl);
  const tgtTitleBounds     = getRect(tgtTitleEl);

  const hasMedia     = !!(srcThumbBounds && tgtMediaBounds && tgtMediaEl && state.sourceThumbEl);
  const hasTitleWrap = !!(srcTitleWrapBounds && tgtTitleWrapBounds && tgtTitleWrapEl && state.sourceTitleWrapEl);
  const hasTitle     = !!(srcTitleBounds && tgtTitleBounds && tgtTitleEl && state.sourceTitleEl);

  // If nothing is available for a real handoff, fall back to a fade.
  if (!hasMedia && !hasTitle) {
    tl.fromTo(
      nextContainer,
      { opacity: 0 },
      { opacity: 1, duration: HANDOFF_DURATION, ease: HANDOFF_EASE }
    );
    return tl;
  }

  // ── Hide real target elements before revealing the container ────────────
  // Hide hero elements first so they don't flash when the container appears.
  // The overlay clones handle all visual motion; real elements fade in at
  // FADE_IN_OFFSET when the clone has nearly reached the target position.
  if (tgtMediaEl)     gsap.set(tgtMediaEl,     { opacity: 0 });
  if (tgtTitleWrapEl) gsap.set(tgtTitleWrapEl, { opacity: 0 });
  if (tgtTitleEl)     gsap.set(tgtTitleEl,     { opacity: 0 });

  // Reveal the container immediately — non-hero content should be visible
  // during the handoff animation. Hero elements are already hidden above so
  // there is no flash. reveal-load animations have already played (while the
  // container was opacity:0 before this call), so content is in its final
  // revealed state — no double-animation.
  gsap.set(nextContainer, { opacity: 1 });

  // ── Overlay root ─────────────────────────────────────────────────────────
  const overlayRoot = createOverlayRoot();

  // ── A: Media proxy ───────────────────────────────────────────────────────
  if (hasMedia) {
    const mediaProxy = buildMediaProxy(state.sourceThumbEl, srcThumbBounds);
    overlayRoot.appendChild(mediaProxy);

    // Animate from source bounds → target bounds.
    tl.fromTo(
      mediaProxy,
      {
        left:   srcThumbBounds.left,
        top:    srcThumbBounds.top,
        width:  srcThumbBounds.width,
        height: srcThumbBounds.height
      },
      {
        left:     tgtMediaBounds.left,
        top:      tgtMediaBounds.top,
        width:    tgtMediaBounds.width,
        height:   tgtMediaBounds.height,
        duration: HANDOFF_DURATION,
        ease:     HANDOFF_EASE,
        onComplete() {
          gsap.set(tgtMediaEl, { opacity: 1 });
          try { mediaProxy.remove(); } catch (_) {}
        }
      },
      0
    );

    // Fade the real hero media in near the end of the animation.
    tl.to(tgtMediaEl, { opacity: 1, duration: 0.3, ease: "none" }, FADE_IN_OFFSET);
  }

  // ── B: Title wrapper proxy ───────────────────────────────────────────────
  if (hasTitleWrap) {
    const wrapProxy = buildWrapProxy(srcTitleWrapBounds);
    overlayRoot.appendChild(wrapProxy);

    tl.fromTo(
      wrapProxy,
      {
        left:    srcTitleWrapBounds.left,
        top:     srcTitleWrapBounds.top,
        width:   srcTitleWrapBounds.width,
        height:  srcTitleWrapBounds.height,
        opacity: 1
      },
      {
        left:     tgtTitleWrapBounds.left,
        top:      tgtTitleWrapBounds.top,
        width:    tgtTitleWrapBounds.width,
        height:   tgtTitleWrapBounds.height,
        opacity:  0,   // fade wrapper proxy out as the title proxy lands
        duration: HANDOFF_DURATION,
        ease:     HANDOFF_EASE,
        onComplete() { try { wrapProxy.remove(); } catch (_) {} }
      },
      0
    );

    tl.to(tgtTitleWrapEl, { opacity: 1, duration: 0.3, ease: "none" }, FADE_IN_OFFSET);
  }

  // ── C: Title text proxy ───────────────────────────────────────────────────
  if (hasTitle) {
    const titleProxy = buildTitleProxy(state.sourceTitleEl, srcTitleBounds);
    overlayRoot.appendChild(titleProxy);

    tl.fromTo(
      titleProxy,
      {
        left:    srcTitleBounds.left,
        top:     srcTitleBounds.top,
        width:   srcTitleBounds.width,
        height:  srcTitleBounds.height,
        opacity: 1
      },
      {
        left:     tgtTitleBounds.left,
        top:      tgtTitleBounds.top,
        width:    tgtTitleBounds.width,
        height:   tgtTitleBounds.height,
        duration: HANDOFF_DURATION,
        ease:     HANDOFF_EASE,
        onComplete() {
          gsap.set(tgtTitleEl, { opacity: 1 });
          try { titleProxy.remove(); } catch (_) {}
        }
      },
      0
    );

    tl.to(tgtTitleEl, { opacity: 1, duration: 0.3, ease: "none" }, FADE_IN_OFFSET);
  }

  // ── Final cleanup ────────────────────────────────────────────────────────
  tl.call(() => {
    // Ensure real elements are visible even if onComplete callbacks didn't fire.
    if (tgtMediaEl)     gsap.set(tgtMediaEl,     { clearProps: "opacity" });
    if (tgtTitleWrapEl) gsap.set(tgtTitleWrapEl, { clearProps: "opacity" });
    if (tgtTitleEl)     gsap.set(tgtTitleEl,     { clearProps: "opacity" });

    try { overlayRoot.remove(); } catch (_) {}

    if (window.__projectNextTransition) {
      window.__projectNextTransition.inProgress            = false;
      window.__projectNextTransition.initiatedFromPinnedNext = false;
    }
  });

  return tl;
}
