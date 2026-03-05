import { runCleanups, captureCleanups } from "../core/cleanup.js";
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
    // 1. Remove all transition inline styles so layout is settled.
    //    Do NOT stop/restart Lenis here — it's already running from enter(),
    //    stopping it mid-lerp causes a velocity jolt when it restarts.
    window.gsap?.set(data?.next?.container, {
      clearProps:
        "position,top,left,right,bottom,width,height,overflow,zIndex,opacity,transform,backgroundColor,pointerEvents"
    });

    // 2. Do NOT reinitWebflowIX2() here — already called in enter().
    //    A second reinit would destroy + recreate STs, re-fire "on page load"
    //    animations, and cause a visible flash.

    // 3. Sync Lenis position then start it.
    //    Lenis was kept stopped during the animation (see enter()).
    //    resize() recalculates scroll extent for the new page height.
    //    scrollTo(immediate) snaps its internal position to actual window.scrollY
    //    so it starts from the right place with no velocity.
    //    startLenis() then begins smooth scroll from that clean state.
    try { window.lenis?.resize?.(); } catch (_) {}
    try {
      if (window.lenis) window.lenis.scrollTo(window.scrollY, { immediate: true });
    } catch (_) {}
    startLenis();

    // 4. Single synchronous ST.refresh() after clearProps + Lenis running.
    //    Do NOT use safeRefreshScrollTrigger() — its 200ms delayed call would
    //    recalculate positions while Lenis may be mid-lerp.
    try { window.ScrollTrigger?.refresh(); } catch (_) {}

    // 5. Run deferred post-transition callbacks (e.g. pin ST creation).
    //    These run AFTER clearProps so the container has no transform — critical
    //    for pin-based ScrollTriggers (transform ancestors break pin spacer calc).
    if (_postTransitionCallbacks.length) {
      _postTransitionCallbacks.forEach((fn) => { try { fn(); } catch (_) {} });
      _postTransitionCallbacks = [];

      // Re-sync layout after callbacks (pin spacers change scroll height).
      try { window.ScrollTrigger?.refresh(); } catch (_) {}
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

        async leave(data) {
          closeNav();

          const gsap = window.gsap;
          const scrollY = window.scrollY || window.pageYOffset || 0;

          // ── Step 1: Freeze sticky elements ────────────────────────────────
          // Must happen FIRST — before Lenis stops or scroll resets.
          // Converts position:sticky → position:absolute at current pixel coords.
          freezeStickyInContainer(data.current.container);

          // ── Step 2: Snapshot CSS vars onto the outgoing container ─────────
          // Restoring onto the container (not :root/body) means enter()'s
          // resetIX2CSSVars() can clear :root/body without conflict.
          const restoreOutgoingVars = snapshotIX2CSSVars(data.current.container);

          // ── Step 3: Capture (don't run) outgoing page cleanups ────────────
          // captureCleanups() drains the queue WITHOUT calling anything.
          // This keeps slider RAF, CMS filter (mm.revert), etc. alive through
          // the leave animation. New addCleanup() calls from enter() go into
          // the now-empty queue and belong to the incoming page.
          const runOutgoingCleanup = captureCleanups();

          // ── Step 4: Tear down only the scroll systems ─────────────────────
          // Lenis and ScrollTriggers must be destroyed NOW so enter() can
          // create fresh ones (createLenis is idempotent, but STs need a clean slate).
          stopLenis();
          destroyLenis();
          killAllScrollTriggers(); // GSAP reverts scrub tweens to 0 here

          // ── Step 5: Re-apply frozen CSS vars ──────────────────────────────
          // GSAP's kill reverted :root/body vars to 0 in step 4.
          // Re-applying to the container locks the visual state for the leave animation.
          restoreOutgoingVars();

          destroyPage(getNamespace(data, "current"));

          if (!gsap) {
            runOutgoingCleanup();
            return;
          }

          // ── Step 6: Position outgoing container for leave animation ───────
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

          // Block events on the outgoing container only.
          // This is scoped to the outgoing element so the incoming container
          // (Work slider, etc.) can receive events immediately.
          // Any global html.is-transitioning CSS rule that sets pointer-events:none
          // must NOT apply to the incoming container — this inline override wins.
          data.current.container.style.pointerEvents = "none";
          data.next.container.style.pointerEvents   = "auto";

          // Reset scroll AFTER fixing container — container is fixed so its
          // absolute-positioned sticky children won't shift.
          resetScrollTop();

          // ── Step 7: Run leave animation, THEN destroy outgoing scripts ────
          // Awaiting the timeline ensures the slider, CMS filter, etc. remain
          // alive and visually intact for the full duration of the leave anim.
          await gsap.timeline().to(data.current.container, {
            y: "-25vh",
            scale: 0.95,
            opacity: VT_FADE_TO,
            duration: VT_DURATION,
            ease: VT_EASE,
            transformOrigin: "50% " + scrollY + "px"
          });

          // Only now tear down outgoing page scripts (slider RAF, CMS mm, etc.)
          runOutgoingCleanup();
        },

        async enter(data) {
          const gsap = window.gsap;
          if (!gsap) return;

          // Clear stale :root/body IX2 vars — safe because leave() wrote frozen
          // outgoing vars onto the outgoing container element, not :root/body.
          resetIX2CSSVars();

          // Sync page ID before IX2 so it targets the correct page's elements.
          syncWebflowPageIdFromNextHtml(data?.next?.html || "");

          // Create Lenis (stopped). Do NOT startLenis() here.
          // Keeping Lenis stopped during the animation prevents:
          //   (a) user scroll input from affecting the slide-in animation, and
          //   (b) Lenis mid-lerp velocity being killed by lenis.scrollTo() in after().
          // startLenis() is called in the global after() hook once layout is clean.
          createLenis();

          // Init IX2. Positions are approximate mid-animation; corrected by
          // ST.refresh() in after(). No second IX2 reinit in after().
          reinitWebflowIX2();

          // resetWCurrent() scans document.querySelectorAll("a[href]") and marks
          // links matching window.location (already updated by Barba) as .w--current.
          // Must run AFTER the incoming container is in the DOM (it is by now) and
          // BEFORE initContainer() → initCmsNext() reads .w--current to find the
          // current project. Webflow.ready() may set .w--current asynchronously,
          // so we force it synchronously here.
          resetWCurrent();

          // Single synchronous refresh only — no delayed calls.
          try { window.ScrollTrigger?.refresh(); } catch (_) {}

          _postTransitionCallbacks = [];

          const initPromise = initContainer(data?.next?.container || document, {
            isFirstLoad: false,
            isNavigation: true,
            namespace: getNamespace(data, "next"),
            onPostTransition: (fn) => _postTransitionCallbacks.push(fn)
          });

          // initContainer() calls startLenis() internally at its end.
          // Immediately stop it again so Lenis doesn't process scroll input
          // for the remainder of the animation (~1400ms).
          const initThenStop = initPromise.then(() => stopLenis());

          const tl = gsap.timeline().from(data.next.container, {
            y: "100vh",
            duration: VT_DURATION,
            ease: VT_EASE
          });

          await Promise.all([tl, initThenStop]);
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
