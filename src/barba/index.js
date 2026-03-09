import { runCleanups, captureCleanups } from "../core/cleanup.js";
import { killAllScrollTriggers } from "../core/scrolltrigger.js";
import { startLenis } from "../core/lenis.js";
import {
  syncWebflowPageIdFromNextHtml,
  destroyAndInitIX2,
  readyWebflow,
  resetWCurrent
} from "../core/webflow.js";
import { closeNav, isFromPanel, clearFromPanel } from "../core/nav.js";
import { destroyPage } from "../pages/index.js";
import { snapshotIX2CSSVars, freezeStickyInContainer } from "./freeze.js";
import {
  lockTransition,
  unlockTransition,
  forceUnlockTransition,
  clearProjectNextTransition,
  clearHandoffOverlays,
  bindTransitionLockSafety,
  isHistoryNavigation,
  clearHistoryNavigation
} from "./transition-lock.js";
import { createProjectNextHandoff } from "../features/project-next-handoff.js";

const VT_DURATION = 1.5;
const VT_EASE = "cubic-bezier(0.25, 0.1, 0.25, 1)";

if (!window.__projectNextTransition) {
  window.__projectNextTransition = {
    href: null,
    sourceThumbEl: null,
    sourceThumbBounds: null,
    sourceTitleWrapEl: null,
    sourceTitleWrapBounds: null,
    sourceTitleEl: null,
    sourceTitleBounds: null,
    initiatedFromPinnedNext: false,
    inProgress: false
  };
}

let _postTransitionCallbacks = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetIX2CSSVars() {
  [document.documentElement, document.body].forEach((el) => {
    try {
      const toRemove = [];
      for (let i = 0; i < el.style.length; i++) {
        if (el.style[i].startsWith("--")) toRemove.push(el.style[i]);
      }
      toRemove.forEach((prop) => el.style.removeProperty(prop));
    } catch (_) {}
  });
}

function getNamespace(data, which = "next") {
  const obj = data?.[which];
  return (
    obj?.namespace ||
    obj?.container?.getAttribute?.("data-barba-namespace") ||
    ""
  );
}

/**
 * P2P only fires when the pinned-footer scroll reaches 100% and explicitly
 * sets initiatedFromPinnedNext. Clicks on .case-link or .image-wrap.next-case,
 * and browser back/forward, use the slide transition instead.
 */
function isProjectToProject(data) {
  return (
    !isHistoryNavigation() &&
    getNamespace(data, "current") === "project" &&
    getNamespace(data, "next") === "project" &&
    window.__projectNextTransition?.initiatedFromPinnedNext === true
  );
}

function flushPostTransition() {
  if (!_postTransitionCallbacks.length) return;
  _postTransitionCallbacks.forEach((fn) => {
    try { fn(); } catch (_) {}
  });
  _postTransitionCallbacks = [];
}

function hardScrollReset() {
  try { window.lenis?.scrollTo(0, { immediate: true }); } catch (_) {}
  try { window.scrollTo(0, 0); } catch (_) {}
}

function clearContainerProps(container) {
  if (!window.gsap || !container) return;
  window.gsap.set(container, {
    clearProps: "position,top,left,right,bottom,width,height,overflow,zIndex,opacity,transform,backgroundColor,pointerEvents,visibility,y"
  });
}

function clearAllContainerProps() {
  document.querySelectorAll('[data-barba="container"]').forEach((el) => {
    clearContainerProps(el);
  });
}

function removeOrphanContainers(nextContainer) {
  document.querySelectorAll('[data-barba="container"]').forEach((el) => {
    if (el !== nextContainer) {
      try { el.remove(); } catch (_) {}
    }
  });
}

function killTransitionTweens() {
  if (!window.gsap) return;
  document.querySelectorAll('[data-barba="container"]').forEach((el) => {
    try { window.gsap.killTweensOf(el); } catch (_) {}
    try {
      const mw = el.querySelector(".main-wrapper");
      if (mw) window.gsap.killTweensOf(mw);
    } catch (_) {}
  });
}

function resolveCSSVar(name) {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || null;
  } catch (_) {
    return null;
  }
}

// ─── initBarba ────────────────────────────────────────────────────────────────

export function initBarba({ initContainer }) {
  if (!window.barba) return console.warn("Barba not loaded.");

  bindTransitionLockSafety();

  const preventBarba = ({ el } = {}) => {
    if (!el) return false;
    if (el.hasAttribute?.("data-barba-prevent")) return true;

    const href = el.getAttribute?.("href");
    if (!href) return false;

    if (el.target === "_blank") return true;
    if (href.startsWith("#")) return true;
    if (href.startsWith("mailto:") || href.startsWith("tel:")) return true;

    if (/^https?:\/\//i.test(href)) {
      try {
        const url = new URL(href, window.location.href);
        return url.origin !== window.location.origin;
      } catch (_) {}
    }
    return false;
  };

  try { history.scrollRestoration = "manual"; } catch (_) {}

  window.barba.hooks.before((data) => {
    // Kill any leftover tweens from an interrupted transition
    killTransitionTweens();

    document.documentElement.classList.add("is-transitioning");
    resetWCurrent(data?.next?.url?.path);

    _postTransitionCallbacks = [];
    clearHandoffOverlays();

    if (!isProjectToProject(data) && !window.__projectNextTransition?.inProgress) {
      clearProjectNextTransition();
    }

    lockTransition();
  });

  window.barba.hooks.after((data) => {
    document.documentElement.classList.remove("is-transitioning");

    clearAllContainerProps();
    removeOrphanContainers(data?.next?.container);

    forceUnlockTransition();
    hardScrollReset();

    clearProjectNextTransition();
    clearHandoffOverlays();
    clearHistoryNavigation();

    resetWCurrent();
    clearFromPanel();

    try { window.ScrollTrigger?.refresh(); } catch (_) {}
    try { window.lenis?.resize?.(); } catch (_) {}
  });

  window.barba.init({
    // preventRunning: false lets browser back/forward interrupt an in-progress
    // transition instead of being silently blocked, which causes URL/page mismatch.
    // killTransitionTweens() in before() and try/finally in every enter() ensure
    // clean state regardless of how a transition ends.
    preventRunning: false,
    prevent: preventBarba,

    transitions: [

      // ── Project → Project (pinned footer scroll only) ──────────────────────
      {
        name: "project-to-project",
        sync: true,
        custom: (data) => isProjectToProject(data),

        async leave(data) {
          closeNav();

          const gsap = window.gsap;
          const scrollY = window.scrollY || window.pageYOffset || 0;

          freezeStickyInContainer(data.current.container);
          const restoreOutgoingVars = snapshotIX2CSSVars(data.current.container);
          const runOutgoingCleanup = captureCleanups();
          killAllScrollTriggers();
          restoreOutgoingVars();
          destroyPage(getNamespace(data, "current"));

          if (!gsap) {
            runOutgoingCleanup();
            return;
          }

          gsap.set(data.current.container, {
            position: "fixed",
            top: -scrollY,
            left: 0,
            width: "100%",
            height: "auto",
            zIndex: 1,
            opacity: 1,
            y: 0
          });

          data.current.container.style.pointerEvents = "none";
          data.next.container.style.pointerEvents = "none";

          // Fade out all content — proxies handle the hero handoff visually
          const mainWrapper = data.current.container.querySelector(".main-wrapper");
          if (mainWrapper) {
            gsap.to(mainWrapper, { opacity: 0, duration: 0.25, ease: "power1.out" });
          }

          runOutgoingCleanup();
        },

        async enter(data) {
          const gsap = window.gsap;
          if (!gsap) return;

          const container = data?.next?.container;
          if (!container) return;

          try {
            hardScrollReset();
            resetIX2CSSVars();
            syncWebflowPageIdFromNextHtml(data?.next?.html || "");
            resetWCurrent();

            _postTransitionCallbacks = [];

            await initContainer(container, {
              isFirstLoad: false,
              isNavigation: true,
              namespace: getNamespace(data, "next"),
              path: data?.next?.url?.path || window.location.pathname,
              deferLenisStart: true,
              skipAutoLoadReveals: true,
              onPostTransition: (fn) => _postTransitionCallbacks.push(fn)
            });

            prepareIncomingContainerForProject(container);

            try { window.ScrollTrigger?.refresh(); } catch (_) {}
            try { window.lenis?.resize?.(); } catch (_) {}

            const handoffTl = createProjectNextHandoff(data);

            try {
              await handoffTl.play();
            } catch (_) {
              gsap.set(container, { clearProps: "opacity" });
            }

            destroyAndInitIX2();
            resetWCurrent();

            try { window.ScrollTrigger?.refresh(); } catch (_) {}

            flushPostTransition();
            readyWebflow();
            resetWCurrent();

            clearContainerProps(container);
            container.style.pointerEvents = "";
            hardScrollReset();
          } finally {
            unlockTransition();
            try { window.lenis?.resize?.(); } catch (_) {}
          }
        },

        async once(data) {
          resetWCurrent();
          await initContainer(data?.next?.container || document, {
            isFirstLoad: true,
            isNavigation: false,
            namespace: getNamespace(data, "next"),
            path: data?.next?.url?.path || window.location.pathname,
            deferLenisStart: true
          });
          startLenis();
          try { window.ScrollTrigger?.refresh(); } catch (_) {}
          try { window.lenis?.resize?.(); } catch (_) {}
        },

        after() {}
      },

      // ── Panel Nav ──────────────────────────────────────────────────────────
      {
        name: "panel-nav",
        sync: false,
        custom: () => isFromPanel(),

        leave(data) {
          closeNav();
          runCleanups();
          killAllScrollTriggers();
          destroyPage(getNamespace(data, "current"));
          try { data.current.container.remove(); } catch (_) {}
        },

        async afterEnter(data) {
          destroyAndInitIX2();
          resetWCurrent();

          _postTransitionCallbacks = [];

          try {
            await initContainer(data?.next?.container || document, {
              isFirstLoad: false,
              isNavigation: true,
              namespace: getNamespace(data, "next"),
              path: data?.next?.url?.path || window.location.pathname,
              deferLenisStart: true,
              onPostTransition: (fn) => _postTransitionCallbacks.push(fn)
            });

            flushPostTransition();
            readyWebflow();
            resetWCurrent();

            try { window.ScrollTrigger?.refresh(); } catch (_) {}
            hardScrollReset();
          } finally {
            unlockTransition();
            try { window.lenis?.resize?.(); } catch (_) {}
          }
        }
      },

      // ── Slide (default for all other navigations) ──────────────────────────
      {
        name: "slide",
        sync: true,

        async leave(data) {
          closeNav();

          const gsap = window.gsap;
          const scrollY = window.scrollY || window.pageYOffset || 0;

          freezeStickyInContainer(data.current.container);
          const restoreOutgoingVars = snapshotIX2CSSVars(data.current.container);
          const runOutgoingCleanup = captureCleanups();

          killAllScrollTriggers();
          restoreOutgoingVars();
          destroyPage(getNamespace(data, "current"));

          if (!gsap) {
            runOutgoingCleanup();
            return;
          }

          gsap.set(data.current.container, {
            position: "fixed",
            top: -scrollY,
            left: 0,
            width: "100%",
            height: "auto",
            zIndex: 1,
            opacity: 1,
            y: 0
          });

          data.current.container.style.pointerEvents = "none";
          data.next.container.style.pointerEvents = "none";

          const leaveTl = gsap.timeline();

          // Background shifts to accent colour; content fades to 50% opacity
          const accentBg = resolveCSSVar("--_theme---swatches--cta-card");
          if (accentBg) {
            leaveTl.to(data.current.container, {
              backgroundColor: accentBg,
              duration: 0.2,
              ease: "none"
            }, 0);
          }

          const mainWrapper = data.current.container.querySelector(".main-wrapper");
          if (mainWrapper) {
            leaveTl.to(mainWrapper, {
              opacity: 0.5,
              duration: 0.25,
              ease: "power1.out"
            }, 0);
          }

          leaveTl.to(data.current.container, {
            y: "-25vh",
            duration: VT_DURATION,
            ease: VT_EASE,
            transformOrigin: "50% " + scrollY + "px"
          }, 0);

          await leaveTl;
          runOutgoingCleanup();
        },

        async enter(data) {
          const gsap = window.gsap;
          if (!gsap) return;

          const container = data?.next?.container;
          if (!container) return;

          // Hide incoming while it initialises so the leave animation is fully visible
          gsap.set(container, { autoAlpha: 0 });

          try {
            hardScrollReset();
            resetIX2CSSVars();
            syncWebflowPageIdFromNextHtml(data?.next?.html || "");
            resetWCurrent();

            _postTransitionCallbacks = [];

            await initContainer(container, {
              isFirstLoad: false,
              isNavigation: true,
              namespace: getNamespace(data, "next"),
              path: data?.next?.url?.path || window.location.pathname,
              deferLenisStart: true,
              onPostTransition: (fn) => _postTransitionCallbacks.push(fn)
            });

            // Slide the incoming page up from below the viewport
            gsap.set(container, {
              position: "fixed",
              top: 0,
              left: 0,
              width: "100%",
              height: "100vh",
              y: "100vh",
              zIndex: 2,
              autoAlpha: 1,
              pointerEvents: "none"
            });

            try { window.ScrollTrigger?.refresh(); } catch (_) {}
            try { window.lenis?.resize?.(); } catch (_) {}

            await gsap.to(container, {
              y: 0,
              duration: VT_DURATION,
              ease: VT_EASE
            });

            destroyAndInitIX2();
            resetWCurrent();

            try { window.ScrollTrigger?.refresh(); } catch (_) {}

            flushPostTransition();
            clearContainerProps(container);
            hardScrollReset();
          } finally {
            container.style.pointerEvents = "";
            unlockTransition();
            try { window.lenis?.resize?.(); } catch (_) {}
          }

          readyWebflow();
          resetWCurrent();
        },

        async once(data) {
          resetWCurrent();
          await initContainer(data?.next?.container || document, {
            isFirstLoad: true,
            isNavigation: false,
            namespace: getNamespace(data, "next"),
            path: data?.next?.url?.path || window.location.pathname,
            deferLenisStart: true
          });
          startLenis();
          try { window.ScrollTrigger?.refresh(); } catch (_) {}
          try { window.lenis?.resize?.(); } catch (_) {}
        },

        after() {}
      }
    ]
  });
}

function prepareIncomingContainerForProject(container) {
  if (!window.gsap || !container) return;
  window.gsap.set(container, {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100vh",
    zIndex: 2,
    pointerEvents: "none",
    opacity: 1
  });
}
