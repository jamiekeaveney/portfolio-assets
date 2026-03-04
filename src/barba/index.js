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

// Queue for callbacks deferred to after the transition + IX2 + ST.refresh cycle.
let _postTransitionCallbacks = [];

// Strip --* CSS custom properties set by GSAP/IX2 as inline styles on :root and body.
// Called at the START of enter() to give the incoming page a clean slate, safe to do
// because frozen outgoing vars are now on the outgoing CONTAINER (not :root/body).
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
    // location.href already bypasses Barba, but this handles any <a>-based trigger.
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

    // 2. Reinit IX2 with correct layout (clearProps has run, animation is done).
    //    First IX2 init was in enter() for immediate scroll responsiveness during
    //    transition. This second init fixes positions against the settled layout.
    reinitWebflowIX2();

    // 3. Refresh ScrollTrigger — all positions are now final.
    safeRefreshScrollTrigger();

    // 4. Resize Lenis to pick up the new page height after IX2 init.
    try { window.lenis?.resize?.(); } catch (_) {}

    // 5. Flush any Lenis lerp that accumulated during the transition.
    //    clearProps + IX2 reinit changes layout. If Lenis was mid-lerp, its
    //    virtual target no longer matches reality. Snapping to window.scrollY
    //    clears the pending lerp and prevents the post-transition recalibration jolt.
    try {
      if (window.lenis) {
        window.lenis.scrollTo(window.scrollY, { immediate: true });
      }
    } catch (_) {}

    // 6. Run deferred post-transition callbacks (e.g. scroll-1 ST creation).
    if (_postTransitionCallbacks.length) {
      _postTransitionCallbacks.forEach((fn) => { try { fn(); } catch (_) {} });
      _postTransitionCallbacks = [];
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

          // Snapshot outgoing CSS vars and freeze them onto the outgoing CONTAINER
          // (not :root/body). CSS cascade means children inherit from the container,
          // so this preserves the visual state while leaving :root/body free to be
          // cleared by resetIX2CSSVars() in enter() without conflict.
          const restoreOutgoingVars = snapshotIX2CSSVars(data.current.container);

          stopLenis();
          runCleanups();
          destroyLenis();
          killAllScrollTriggers();

          // Re-apply frozen values onto the container after GSAP has reverted :root/body.
          restoreOutgoingVars();

          destroyPage(getNamespace(data, "current"));

          const gsap = window.gsap;
          if (!gsap) return;

          const scrollY = window.scrollY || window.pageYOffset || 0;

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

          // Clear stale :root/body IX2 vars from the outgoing page. Safe to do here
          // because the frozen outgoing vars are now on the outgoing container element.
          resetIX2CSSVars();

          // Sync page ID before IX2 so it targets the correct page's elements.
          syncWebflowPageIdFromNextHtml(data?.next?.html || "");

          // Create Lenis before IX2 so the scroll → ST.update() connection exists
          // the moment the first IX2 ScrollTriggers are created.
          createLenis();

          // Init IX2 early — "while scrolling in view" STs are live immediately,
          // so scroll responds DURING the transition animation, not only after.
          // Positions may be slightly off (animation in progress); corrected in after().
          reinitWebflowIX2();

          // Single synchronous refresh only — no delayed calls.
          // safeRefreshScrollTrigger() fires at 0/16/200ms; the 200ms call would hit
          // during the animation and corrupt mid-flight positions. Use one sync call here.
          try { window.ScrollTrigger?.refresh(); } catch (_) {}

          // Start Lenis — scroll now drives IX2 vars in real time during the transition.
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
          safeRefreshScrollTrigger();
          try { window.lenis?.resize?.(); } catch (_) {}
        },

        after() {}
      }
    ]
  });
}
