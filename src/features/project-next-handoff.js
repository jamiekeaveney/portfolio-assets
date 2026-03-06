const HANDOFF_DURATION = 1.5;
const HANDOFF_EASE = "expo.inOut";
const TARGET_FADE_AT = HANDOFF_DURATION * 0.92;

function getRect(el) {
  if (!el) return null;
  try {
    return el.getBoundingClientRect();
  } catch (_) {
    return null;
  }
}

function getOverlayRoot() {
  let el = document.querySelector("[data-transition-overlay-root]");
  if (!el) {
    el = document.createElement("div");
    el.setAttribute("data-transition-overlay-root", "");
    document.body.appendChild(el);
  }
  el.innerHTML = "";
  return el;
}

function applyFixedBounds(el, bounds) {
  el.style.position = "fixed";
  el.style.left = `${bounds.left}px`;
  el.style.top = `${bounds.top}px`;
  el.style.width = `${bounds.width}px`;
  el.style.height = `${bounds.height}px`;
  el.style.margin = "0";
  el.style.boxSizing = "border-box";
}

function buildMediaProxy(sourceEl, bounds) {
  const proxy = document.createElement("div");
  proxy.setAttribute("data-transition-proxy", "media");

  try {
    const cs = window.getComputedStyle(sourceEl.parentElement || sourceEl);
    proxy.style.borderRadius = cs.borderRadius;
  } catch (_) {}

  proxy.style.overflow = "hidden";

  const clone = sourceEl.cloneNode(true);
  clone.style.width = "100%";
  clone.style.height = "100%";
  clone.style.objectFit = "cover";
  clone.style.display = "block";

  proxy.appendChild(clone);
  applyFixedBounds(proxy, bounds);
  return proxy;
}

function buildWrapProxy(sourceEl, bounds) {
  const proxy = document.createElement("div");
  proxy.setAttribute("data-transition-proxy", "title-wrap");

  applyFixedBounds(proxy, bounds);

  try {
    const cs = window.getComputedStyle(sourceEl);
    proxy.style.display = cs.display;
    proxy.style.alignItems = cs.alignItems;
    proxy.style.justifyContent = cs.justifyContent;
    proxy.style.paddingTop = cs.paddingTop;
    proxy.style.paddingRight = cs.paddingRight;
    proxy.style.paddingBottom = cs.paddingBottom;
    proxy.style.paddingLeft = cs.paddingLeft;
  } catch (_) {}

  return proxy;
}

function buildTitleProxy(sourceEl, bounds) {
  const proxy = document.createElement("div");
  proxy.setAttribute("data-transition-proxy", "title");

  const clone = sourceEl.cloneNode(true);

  try {
    const cs = window.getComputedStyle(sourceEl);
    [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "fontStyle",
      "lineHeight",
      "letterSpacing",
      "color",
      "textTransform",
      "whiteSpace",
      "textAlign",
      "display",
      "alignItems",
      "justifyContent",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "marginTop",
      "marginRight",
      "marginBottom",
      "marginLeft"
    ].forEach((prop) => {
      clone.style[prop] = cs[prop];
    });
  } catch (_) {}

  clone.style.width = "100%";
  clone.style.height = "100%";
  clone.style.overflow = "visible";
  clone.style.transform = "none";
  clone.style.opacity = "1";
  clone.style.visibility = "visible";

  applyFixedBounds(proxy, bounds);
  proxy.appendChild(clone);
  return proxy;
}

export function createProjectNextHandoff(data) {
  const gsap = window.gsap;
  if (!gsap) return { play: () => Promise.resolve(), kill() {} };

  const tl = gsap.timeline({ paused: true });
  const state = window.__projectNextTransition || {};
  const nextContainer = data?.next?.container;

  if (!state.initiatedFromPinnedNext || !nextContainer) {
    tl.fromTo(
      nextContainer || document.body,
      { opacity: 0 },
      { opacity: 1, duration: HANDOFF_DURATION, ease: HANDOFF_EASE }
    );
    return tl;
  }

  const tgtMediaEl     = nextContainer.querySelector("[data-project-hero-media]");
  const tgtTitleWrapEl = nextContainer.querySelector("[data-project-hero-title-wrap]");
  const tgtTitleEl     = nextContainer.querySelector("[data-project-hero-title]");

  const srcThumbBounds     = state.sourceThumbBounds;
  const srcTitleWrapBounds = state.sourceTitleWrapBounds;
  const srcTitleBounds     = state.sourceTitleBounds;
  const tgtMediaBounds     = getRect(tgtMediaEl);
  const tgtTitleWrapBounds = getRect(tgtTitleWrapEl);
  const tgtTitleBounds     = getRect(tgtTitleEl);

  if (tgtMediaEl) gsap.set(tgtMediaEl, { autoAlpha: 0 });
  if (tgtTitleWrapEl) gsap.set(tgtTitleWrapEl, { autoAlpha: 0 });
  if (tgtTitleEl) gsap.set(tgtTitleEl, { autoAlpha: 0 });

  gsap.set(nextContainer, { opacity: 1 });

  const overlayRoot = getOverlayRoot();

  if (state.sourceThumbEl && srcThumbBounds && tgtMediaBounds && tgtMediaEl) {
    const mediaProxy = buildMediaProxy(state.sourceThumbEl, srcThumbBounds);
    overlayRoot.appendChild(mediaProxy);

    tl.to(
      mediaProxy,
      {
        left: tgtMediaBounds.left,
        top: tgtMediaBounds.top,
        width: tgtMediaBounds.width,
        height: tgtMediaBounds.height,
        duration: HANDOFF_DURATION,
        ease: HANDOFF_EASE,
        immediateRender: false,
        onComplete() {
          try { mediaProxy.remove(); } catch (_) {}
        }
      },
      0
    );

    tl.to(
      tgtMediaEl,
      { autoAlpha: 1, duration: 0.18, ease: "none" },
      TARGET_FADE_AT
    );
  }

  if (state.sourceTitleWrapEl && srcTitleWrapBounds && tgtTitleWrapBounds && tgtTitleWrapEl) {
    const wrapProxy = buildWrapProxy(state.sourceTitleWrapEl, srcTitleWrapBounds);
    overlayRoot.appendChild(wrapProxy);

    tl.to(
      wrapProxy,
      {
        left: tgtTitleWrapBounds.left,
        top: tgtTitleWrapBounds.top,
        width: tgtTitleWrapBounds.width,
        height: tgtTitleWrapBounds.height,
        duration: HANDOFF_DURATION,
        ease: HANDOFF_EASE,
        immediateRender: false,
        onComplete() {
          try { wrapProxy.remove(); } catch (_) {}
        }
      },
      0
    );

    tl.to(
      tgtTitleWrapEl,
      { autoAlpha: 1, duration: 0.18, ease: "none" },
      TARGET_FADE_AT
    );
  }

  if (state.sourceTitleEl && srcTitleBounds && tgtTitleBounds && tgtTitleEl) {
    const titleProxy = buildTitleProxy(state.sourceTitleEl, srcTitleBounds);
    overlayRoot.appendChild(titleProxy);

    tl.to(
      titleProxy,
      {
        left: tgtTitleBounds.left,
        top: tgtTitleBounds.top,
        width: tgtTitleBounds.width,
        height: tgtTitleBounds.height,
        duration: HANDOFF_DURATION,
        ease: HANDOFF_EASE,
        immediateRender: false,
        onComplete() {
          try { titleProxy.remove(); } catch (_) {}
        }
      },
      0
    );

    tl.to(
      tgtTitleEl,
      { autoAlpha: 1, duration: 0.18, ease: "none" },
      TARGET_FADE_AT
    );
  }

  tl.call(() => {
    try { overlayRoot.innerHTML = ""; } catch (_) {}

    if (tgtMediaEl) gsap.set(tgtMediaEl, { clearProps: "opacity,visibility" });
    if (tgtTitleWrapEl) gsap.set(tgtTitleWrapEl, { clearProps: "opacity,visibility" });
    if (tgtTitleEl) gsap.set(tgtTitleEl, { clearProps: "opacity,visibility" });

    if (window.__projectNextTransition) {
      window.__projectNextTransition.inProgress = false;
      window.__projectNextTransition.initiatedFromPinnedNext = false;
    }
  });

  return tl;
}