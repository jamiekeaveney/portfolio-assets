const HANDOFF_DURATION = 1.5;
const HANDOFF_EASE = "expo.inOut";
const TARGET_FADE_AT = HANDOFF_DURATION * 0.94;

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

function stripInlineTransforms(node) {
  if (!node) return;
  try {
    if (node.nodeType === 1 && node.hasAttribute("style")) {
      node.style.transform = "";
      node.style.opacity = "1";
      node.style.visibility = "visible";
      node.style.willChange = "";
      node.style.clipPath = "";
      node.style.filter = "";
    }
    node.querySelectorAll?.("[style]").forEach((el) => {
      el.style.transform = "";
      el.style.opacity = "1";
      el.style.visibility = "visible";
      el.style.willChange = "";
      el.style.clipPath = "";
      el.style.filter = "";
    });
  } catch (_) {}
}

function findRadiusSource(el) {
  let node = el;
  for (let i = 0; node && i < 5; i++, node = node.parentElement) {
    try {
      const cs = window.getComputedStyle(node);
      const hasRadius =
        cs.borderTopLeftRadius !== "0px" ||
        cs.borderTopRightRadius !== "0px" ||
        cs.borderBottomRightRadius !== "0px" ||
        cs.borderBottomLeftRadius !== "0px";
      if (hasRadius) return node;
    } catch (_) {}
  }
  return el;
}

function buildMediaProxy(sourceEl, bounds) {
  const proxy = document.createElement("div");
  proxy.setAttribute("data-transition-proxy", "media");

  const radiusSource = findRadiusSource(sourceEl);

  try {
    const cs = window.getComputedStyle(radiusSource);
    proxy.style.borderTopLeftRadius = cs.borderTopLeftRadius;
    proxy.style.borderTopRightRadius = cs.borderTopRightRadius;
    proxy.style.borderBottomRightRadius = cs.borderBottomRightRadius;
    proxy.style.borderBottomLeftRadius = cs.borderBottomLeftRadius;
    proxy.style.overflow = "hidden";
    proxy.style.backgroundColor = cs.backgroundColor;
  } catch (_) {
    proxy.style.overflow = "hidden";
  }

  const clone = sourceEl.cloneNode(true);
  stripInlineTransforms(clone);

  clone.style.width = "100%";
  clone.style.height = "100%";
  clone.style.objectFit = "cover";
  clone.style.display = "block";
  clone.style.position = "absolute";
  clone.style.inset = "0";

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
    proxy.style.overflow = "visible";
    proxy.style.whiteSpace = cs.whiteSpace;
    proxy.style.textAlign = cs.textAlign;
  } catch (_) {}

  return proxy;
}

function buildTitleProxy(sourceEl, bounds) {
  const proxy = document.createElement("div");
  proxy.setAttribute("data-transition-proxy", "title");

  const clone = sourceEl.cloneNode(true);
  stripInlineTransforms(clone);

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
  clone.style.margin = "0";
  clone.style.display = "block";

  applyFixedBounds(proxy, bounds);
  proxy.style.overflow = "visible";

  proxy.appendChild(clone);
  return proxy;
}

function hideTargetsForHandoff(nextContainer) {
  if (!nextContainer) return [];
  const hidden = [];

  const selectors = [
    "[data-project-hero-media]",
    "[data-project-hero-title-wrap]",
    "[data-project-hero-title]"
  ];

  selectors.forEach((selector) => {
    nextContainer.querySelectorAll(selector).forEach((el) => {
      el.setAttribute("data-transition-hidden-target", "");
      hidden.push(el);
    });
  });

  return hidden;
}

function revealTargets(hidden, gsap) {
  hidden.forEach((el) => {
    gsap.set(el, { autoAlpha: 1, clearProps: "opacity,visibility" });
    el.removeAttribute("data-transition-hidden-target");
  });
}

export function createProjectNextHandoff(data) {
  const gsap = window.gsap;
  if (!gsap) {
    return {
      play: () => Promise.resolve(),
      kill() {}
    };
  }

  const tl = gsap.timeline({ paused: true });
  const state = window.__projectNextTransition || {};
  const nextContainer = data?.next?.container;

  if (!state.initiatedFromPinnedNext || !nextContainer) {
    tl.set(nextContainer || document.body, { opacity: 1 });
    return tl;
  }

  const srcThumbEl = state.sourceThumbEl;
  const srcTitleWrapEl = state.sourceTitleWrapEl;
  const srcTitleEl = state.sourceTitleEl;

  const srcThumbBounds = state.sourceThumbBounds;
  const srcTitleWrapBounds = state.sourceTitleWrapBounds;
  const srcTitleBounds = state.sourceTitleBounds;

  const tgtMediaEl = nextContainer.querySelector("[data-project-hero-media]");
  const tgtTitleWrapEl = nextContainer.querySelector("[data-project-hero-title-wrap]");
  const tgtTitleEl = nextContainer.querySelector("[data-project-hero-title]");

  const tgtMediaBounds = getRect(tgtMediaEl);
  const tgtTitleWrapBounds = getRect(tgtTitleWrapEl);
  const tgtTitleBounds = getRect(tgtTitleEl);

  const hiddenTargets = hideTargetsForHandoff(nextContainer);

  // Do NOT hide the next container. Keep it present for geometry, but let the
  // proxy own the hero handoff visually.
  gsap.set(nextContainer, { opacity: 1 });

  const overlayRoot = getOverlayRoot();

  if (srcThumbEl && srcThumbBounds && tgtMediaBounds && tgtMediaEl) {
    const mediaProxy = buildMediaProxy(srcThumbEl, srcThumbBounds);
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
  }

  if (srcTitleWrapEl && srcTitleWrapBounds && tgtTitleWrapBounds && tgtTitleWrapEl) {
    const wrapProxy = buildWrapProxy(srcTitleWrapEl, srcTitleWrapBounds);
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
  }

  if (srcTitleEl && srcTitleBounds && tgtTitleBounds && tgtTitleEl) {
    const titleProxy = buildTitleProxy(srcTitleEl, srcTitleBounds);
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
  }

  tl.call(() => {
    revealTargets(hiddenTargets, gsap);
  }, null, TARGET_FADE_AT);

  tl.call(() => {
    try { overlayRoot.innerHTML = ""; } catch (_) {}

    if (window.__projectNextTransition) {
      window.__projectNextTransition.inProgress = false;
      window.__projectNextTransition.initiatedFromPinnedNext = false;
      window.__projectNextTransition.href = null;
      window.__projectNextTransition.sourceThumbEl = null;
      window.__projectNextTransition.sourceThumbBounds = null;
      window.__projectNextTransition.sourceTitleWrapEl = null;
      window.__projectNextTransition.sourceTitleWrapBounds = null;
      window.__projectNextTransition.sourceTitleEl = null;
      window.__projectNextTransition.sourceTitleBounds = null;
    }
  });

  return tl;
}