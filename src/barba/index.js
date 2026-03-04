import { runCleanups } from "../core/cleanup.js";
import { stopLenis, destroyLenis, createLenis, startLenis } from "../core/lenis.js";
import { killAllScrollTriggers, safeRefreshScrollTrigger } from "../core/scrolltrigger.js";
import {
  syncWebflowPageIdFromNextHtml,
  reinitWebflowIX2,
  resetWCurrent
} from "../core/webflow.js";
import { closeNav, isFromPanel, clearFromPanel } from "../core/nav.js";
import { destroyPage } from "../pages/index.js";
import { snapshotIX2CSSVars } from "./freeze.js";

const VT_DURATION = 1.5;
const VT_EASE = "cubic-bezier(0.25, 0.1, 0.25, 1)";
const VT_FADE_TO = 0.5;

const CURSOR_CLASS = "is-transitioning";
const setCursorBusy = (on) =>
  document.documentElement.classList.toggle(CURSOR_CLASS, !!on);

const resetScrollTop = () => window.scrollTo(0, 0);

// Queue for callbacks that must run after the transition + IX2 init + ST refresh.
// Features like scroll-1 register here so their STs are created against a settled layout.
let _postTransitionCallbacks = [];

// Strip any CSS custom properties (--*) set as inline styles on :root and body.
// IX2 "while scrolling in view" interactions tween CSS vars (e.g. --scroll-progress)
// on these elements. They persist across Barba navigations, causing the new container
// to flash the old scroll-driven state at the start of the enter animation.
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

export function initBarba({ initContainer }) {
  if (!window.barba) return console.warn("Barba not loaded.");

  const preventBarba = ({ el } = {}) => {
    if (!el) return false;
    if (el.hasAttribute?.("data-barba-prevent")) return true;

    // Scroll-to-next-project sets this flag before doing location.href navigation.
    // Barba doesn't intercept location.href, but if a visible <a> link triggers
    // this path, the flag ensures Barba stays out of the way.
    if (window._bypassBarba) {
      window._bypassBarba = false;
      return true;
    }

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

  try {
    history.scrollRestoration = "manual";
  } catch (_) {}

  // Update nav state immediately at click — don't wait for transition to finish.
  window.barba.hooks.before((data) => {
    setCursorBusy(true);
    resetWCurrent(data?.next?.url?.path);
  });

  window.barba.hooks.after(() => setCursorBusy(false));

  window.barba.hooks.after((data) => {
    // 1. Remove all transition inline styles so layout is clean.
    window.gsap?.set(data?.next?.container, {
      clearProps:
        "position,top,left,right,bottom,width,height,overflow,zIndex,opacity,transform,backgroundColor"
    });

    // 2. Reinit IX2 a second time now that layout is clean (clearProps has run).
    //    The first IX2 init happens in enter() for immediate scroll responsiveness.
    //    This second init ensures "on page load" interactions and ScrollTrigger
    //    positions are correct against the final settled layout.
    reinitWebflowIX2();

    // 3. Refresh ScrollTrigger AFTER IX2 has set its initial states.
    safeRefreshScrollTrigger();

    // 4. Tell Lenis the page height may have changed after IX2 init.
    //    IX2 "Footer Reveal" and similar interactions change the effective
    //    scroll extent. Without this, Lenis's cached max-scroll is stale.
    try { window.lenis?.resize?.(); } catch (_) {}

    // 5. Run deferred post-transition callbacks (e.g. scroll-1 ST creation).
    //    These need to fire AFTER IX2 has settled the layout AND after the
    //    animation inline styles are gone — exactly here.
    if (_postTransitionCallbacks.length) {
      _postTransitionCallbacks.forEach((fn) => { try { fn(); } catch (_) {} });
      _postTransitionCallbacks = [];
      // One final refresh to pick up any STs created by the callbacks.
      safeRefreshScrollTrigger();
    }

    resetWCurrent();
    clearFromPanel();
  });

  window.barba.init({
    preventRunning: true,
    prevent: preventBarba,

    transitions: [
      {
        name: "panel-nav",
        sync: false,
        custom: () => isFromPanel(),

        leave(data) {
          closeNav();
          stopLenis();
          runCleanups();
          destroyLenis();
          killAllScrollTriggers();
          destroyPage(getNamespace(data, "current"));
          try {
            data.current.container.remove();
          } catch (_) {}
        },

        async afterEnter(data) {
          _postTransitionCallbacks = [];
          await initContainer(data?.next?.container || document, {
            isFirstLoad: false,
            isNavigation: true,
            namespace: getNamespace(data, "next"),
            onPostTransition: (fn) => _postTransitionCallbacks.push(fn)
          });
        }
      },

      {
        name: "slide",
        sync: true,

        leave(data) {
          closeNav();

          // Snapshot outgoing CSS vars BEFORE killAllScrollTriggers() reverts GSAP
          // scrub tweens to their initial state (0). After killing, re-apply the
          // snapshot so the outgoing container holds its visual state while animating out.
          const restoreOutgoingVars = snapshotIX2CSSVars();

          stopLenis();
          runCleanups();
          destroyLenis();
          killAllScrollTriggers();

          // Re-apply frozen values now that GSAP has reverted them to 0.
          restoreOutgoingVars();

          destroyPage(getNamespace(data, "current"));

          const gsap = window.gsap;
          if (!gsap) return;

          const scrollY = window.scrollY || window.pageYOffset || 0;

          // Make container AND all direct children transparent
          // so background from body/html shows through.
          gsap.set(data.current.container, {
            position: "fixed",
            top: -scrollY,
            left: 0,
            width: "100%",
            height: "auto",
            overflow: "hidden",
            zIndex: 1,
            backgroundColor: "transparent"
          });

          // Kill background on direct children (page-wrapper etc.)
          const kids = data.current.container.children;
          for (let i = 0; i < kids.length; i++) {
            kids[i].style.backgroundColor = "transparent";
          }

          gsap.set(data.next.container, { zIndex: 2 });

          resetScrollTop();

          return gsap.timeline().to(data.current.container, {
            y: "-25vh",
            scale: 0.95,
            opacity: VT_FADE_TO,
            duration: VT_DURATION,
            ease: VT_EASE,
            transformOrigin: "50% " + scrollY + "px"
          });
        },

        async enter(data) {
          const gsap = window.gsap;
          if (!gsap) return;

          // Clear stale IX2 vars from the outgoing page before the new page
          // becomes visible. Prevents flashing the old scroll-driven state.
          resetIX2CSSVars();

          // Sync page ID here (not only in after()) so IX2 targets the correct
          // page's elements when we init it early below.
          syncWebflowPageIdFromNextHtml(data?.next?.html || "");

          // Create Lenis before IX2 so scroll events flow through ST.update()
          // from the moment the first IX2 ScrollTriggers are created.
          // createLenis() is idempotent — skips if already alive.
          createLenis();

          // Init IX2 NOW so "while scrolling in view" interactions respond
          // to scroll DURING the transition, not only after it completes.
          // Positions may be slightly off (container is mid-animation) — they
          // are corrected by the second reinitWebflowIX2() call in after().
          reinitWebflowIX2();
          safeRefreshScrollTrigger();

          // Start Lenis so the GSAP ticker begins driving scroll → ST.update().
          startLenis();

          _postTransitionCallbacks = [];

          const initPromise = initContainer(data?.next?.container || document, {
            isFirstLoad: false,
            isNavigation: true,
            namespace: getNamespace(data, "next"),
            onPostTransition: (fn) => _postTransitionCallbacks.push(fn)
          });

          const tl = gsap.timeline().from(data.next.container, {
            y: "100vh",
            duration: VT_DURATION,
            ease: VT_EASE
          });

          await Promise.all([tl, initPromise]);
        },

        async once(data) {
          resetWCurrent();
          await initContainer(data?.next?.container || document, {
            isFirstLoad: true,
            isNavigation: false,
            namespace: getNamespace(data, "next")
          });
          // The global after() hook does not fire for once(), so mirror
          // the same sequence: ST refresh then lenis resize.
          safeRefreshScrollTrigger();
          try { window.lenis?.resize?.(); } catch (_) {}
        },

        after() {}
      }
    ]
  });
}
