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
import { snapshotIX2CSSVars, freezeStickyInContainer } from "./freeze.js";

const VT_DURATION = 1.5;
const VT_EASE = "cubic-bezier(0.25, 0.1, 0.25, 1)";
const VT_FADE_TO = 0.5;

const CURSOR_CLASS = "is-transitioning";
const setCursorBusy = (on) =>
  document.documentElement.classList.toggle(CURSOR_CLASS, !!on);

const resetScrollTop = () => window.scrollTo(0, 0);

// Queue for callbacks deferred to after the transition + ST.refresh cycle.
// Used by scroll-1 (ST positions), project pinned footer (transform ancestor
// must be gone before pin spacer can be measured), etc.
let _postTransitionCallbacks = [];

// Strip --* CSS custom properties from :root and body.
// Called at the start of enter() — safe because frozen outgoing vars are
// written onto the outgoing CONTAINER (not :root/body) by leave().
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

    // Scroll-to-next-project sets this flag before location.href navigation.
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
    // Stop Lenis FIRST — prevents lerp from fighting layout changes below.
    stopLenis();

    // 1. Remove all transition inline styles so layout is settled.
    window.gsap?.set(data?.next?.container, {
      clearProps:
        "position,top,left,right,bottom,width,height,overflow,zIndex,opacity,transform,backgroundColor"
    });

    // 2. Do NOT reinitWebflowIX2() here.
    //    IX2 was already initialised in enter() for immediate scroll responsiveness
    //    during the transition. Calling it a second time here causes a visible jump:
    //    IX2 destroys + recreates STs, re-measures progress at the current scroll
    //    position, and re-fires "on page load" animations — all causing flashes.
    //    ST.refresh() below is sufficient to correct trigger positions after clearProps.

    // 3. Refresh ScrollTrigger against the now-clean layout.
    safeRefreshScrollTrigger();

    // 4. Resize Lenis for the new page height, then snap its internal scroll
    //    position to the actual window.scrollY — this flushes any lerp that
    //    accumulated during the transition and prevents the post-transition jolt.
    try { window.lenis?.resize?.(); } catch (_) {}
    try {
      if (window.lenis) window.lenis.scrollTo(window.scrollY, { immediate: true });
    } catch (_) {}

    // 5. Restart Lenis with clean state.
    startLenis();

    // 6. Run deferred post-transition callbacks.
    //    These run AFTER clearProps so the container has no transform — critical
    //    for pin-based ScrollTriggers (transform ancestors break pin spacer calc).
    if (_postTransitionCallbacks.length) {
      _postTransitionCallbacks.forEach((fn) => { try { fn(); } catch (_) {} });
      _postTransitionCallbacks = [];

      // Re-sync layout after callbacks (pin spacers change scroll height).
      safeRefreshScrollTrigger();
      try { window.lenis?.resize?.(); } catch (_) {}
      try {
        if (window.lenis) window.lenis.scrollTo(window.scrollY, { immediate: true });
      } catch (_) {}
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
          try { data.current.container.remove(); } catch (_) {}
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

          const gsap = window.gsap;
          const scrollY = window.scrollY || window.pageYOffset || 0;

          // ── Step 1: Freeze sticky elements ────────────────────────────────
          // Must happen FIRST — before Lenis stops or scroll resets.
          // Converts position:sticky → position:absolute at current pixel coords.
          // Without this, setting overflow:hidden (or position:fixed) on the
          // container breaks the sticky scroll context and causes a visual pop.
          freezeStickyInContainer(data.current.container);

          // ── Step 2: Snapshot CSS vars onto the outgoing container ─────────
          // Restoring onto the container (not :root/body) means enter()'s
          // resetIX2CSSVars() can clear :root/body without conflict.
          const restoreOutgoingVars = snapshotIX2CSSVars(data.current.container);

          // ── Step 3: Tear down scroll-driven systems ───────────────────────
          stopLenis();
          runCleanups();   // slider: cancels RAF + removes listeners, does NOT restore DOM
          destroyLenis();
          killAllScrollTriggers(); // GSAP reverts scrub tweens to 0 here

          // ── Step 4: Re-apply frozen CSS vars ──────────────────────────────
          // GSAP's kill reverted :root/body vars to 0 in step 3.
          // Re-applying to the container locks the visual state for the leave animation.
          restoreOutgoingVars();

          destroyPage(getNamespace(data, "current"));

          if (!gsap) return;

          // ── Step 5: Position outgoing container for leave animation ───────
          // No overflow:hidden — it breaks the absolute-positioned sticky children
          // we just froze in step 1.
          gsap.set(data.current.container, {
            position: "fixed",
            top: -scrollY,
            left: 0,
            width: "100%",
            height: "auto",
            zIndex: 1,
            backgroundColor: "transparent"
          });

          // Clear backgrounds on direct children (page-wrapper etc.)
          const kids = data.current.container.children;
          for (let i = 0; i < kids.length; i++) {
            kids[i].style.backgroundColor = "transparent";
          }

          gsap.set(data.next.container, { zIndex: 2 });

          // Reset scroll AFTER fixing container — the container is already fixed
          // so this won't shift its absolute-positioned children.
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

          // Clear stale :root/body IX2 vars — safe because leave() wrote frozen
          // outgoing vars onto the outgoing container element, not :root/body.
          resetIX2CSSVars();

          // Sync page ID before IX2 so it targets the correct page's elements.
          syncWebflowPageIdFromNextHtml(data?.next?.html || "");

          // Create Lenis before IX2 so the scroll → ST.update() path exists
          // the moment the first IX2 ScrollTriggers are created.
          createLenis();

          // Init IX2 NOW — "while scrolling in view" STs are live immediately,
          // so scroll responds during the transition animation.
          // Positions are approximate (container is mid-animation); corrected
          // by ST.refresh() in after(). No second IX2 reinit in after().
          reinitWebflowIX2();

          // Single synchronous refresh — no delayed calls.
          // safeRefreshScrollTrigger fires at 0/16/200ms; the 200ms call would
          // hit during the animation and corrupt mid-flight ST positions.
          try { window.ScrollTrigger?.refresh(); } catch (_) {}

          // Start Lenis — scroll now drives IX2 vars in real time.
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
