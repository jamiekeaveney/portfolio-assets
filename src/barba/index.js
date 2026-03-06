import { runCleanups, captureCleanups } from "../core/cleanup.js";
import { killAllScrollTriggers } from "../core/scrolltrigger.js";
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
    // Strip any residual inline styles from the wrapper phase of enter().
    // All measurement (ST.refresh, lenis.resize, post-transition callbacks)
    // already happened in enter() before the animation — no fixup needed here.
    window.gsap?.set(data?.next?.container, {
      clearProps:
        "position,top,left,right,bottom,width,height,overflow,zIndex,opacity,transform,backgroundColor,pointerEvents,visibility"
    });

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
          try { window.lenis?.scrollTo(0, { immediate: true }); } catch (_) {}
          runCleanups();
          killAllScrollTriggers();
          destroyPage(getNamespace(data, "current"));
          try { data.current.container.remove(); } catch (_) {}
        },

        async afterEnter(data) {
          // Outgoing container was removed synchronously in leave().
          // Safe to reinit IX2 now — it won't affect outgoing visuals.
          reinitWebflowIX2();
          resetWCurrent();

          _postTransitionCallbacks = [];
          await initContainer(data?.next?.container || document, {
            isFirstLoad: false,
            isNavigation: true,
            namespace: getNamespace(data, "next"),
            onPostTransition: (fn) => _postTransitionCallbacks.push(fn)
          });
          if (_postTransitionCallbacks.length) {
            _postTransitionCallbacks.forEach((fn) => { try { fn(); } catch (_) {} });
            _postTransitionCallbacks = [];
          }
          try { window.ScrollTrigger?.refresh(); } catch (_) {}
          try { window.lenis?.resize?.(); } catch (_) {}
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

          // ── Step 4: Kill ScrollTriggers for the outgoing page ─────────────
          // Lenis stays alive (single global instance). Only STs need a clean
          // slate — GSAP reverts scrub tweens to 0 here.
          killAllScrollTriggers();

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
          // Use Lenis to reset so its internal position tracks scroll = 0.
          try { window.lenis?.scrollTo(0, { immediate: true }); } catch (_) { resetScrollTop(); }

          // ── Step 7: Run leave animation, THEN destroy outgoing scripts ────
          // Awaiting the timeline ensures the slider, CMS filter, etc. remain
          // alive and visually intact for the full duration of the leave anim.
          await gsap.timeline().to(data.current.container, {
            y: "-25vh",
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

          const container = data?.next?.container;
          if (!container) return;

          // ── Step A: Clear stale IX2 CSS vars and sync page identity ──────────
          // reinitWebflowIX2 is intentionally NOT called here — calling it
          // while the leave animation is still running (sync:true, concurrent)
          // causes ix2.init() to reset GSAP inline transforms on elements in
          // the outgoing container (e.g. the home hero video), creating a
          // visible jump. It is called AFTER the animation completes (below),
          // once the outgoing container has been removed from the DOM.
          resetIX2CSSVars();
          syncWebflowPageIdFromNextHtml(data?.next?.html || "");
          // No Webflow.ready() here so there are no async Webflow callbacks
          // that could interfere with initCmsNext's .w--current filtering.
          resetWCurrent();

          _postTransitionCallbacks = [];

          // ── Step B: Init all page scripts ─────────────────────────────────
          // Container is at scroll=0, untransformed, in its final DOM position.
          // ST positions, pin spacers, CMS mutations — all measured correctly.
          await initContainer(container, {
            isFirstLoad: false,
            isNavigation: true,
            namespace: getNamespace(data, "next"),
            onPostTransition: (fn) => _postTransitionCallbacks.push(fn)
          });

          if (_postTransitionCallbacks.length) {
            _postTransitionCallbacks.forEach((fn) => { try { fn(); } catch (_) {} });
            _postTransitionCallbacks = [];
          }

          // ── Step C: Preliminary refresh ────────────────────────────────────
          // IX2 initial states are not yet applied (reinitWebflowIX2 deferred),
          // but this gives scroll-1 and other STs reasonable positions for the
          // duration of the animation. The authoritative refresh fires below.
          try { window.ScrollTrigger?.refresh(); } catch (_) {}
          try { window.lenis?.resize?.(); } catch (_) {}

          // ── Step D: Slide-in animation ─────────────────────────────────────
          // No fixed wrapper needed — scroll was reset to 0 in leave() before
          // the leave animation, so there is no residual Lenis momentum to
          // cause the non-deterministic "tug" that previously affected Work.
          await gsap.from(container, {
            y: "100vh",
            duration: VT_DURATION,
            ease: VT_EASE
          });

          // ── Step E: Post-animation reinit ──────────────────────────────────
          // By the time the enter animation completes (~VT_DURATION), the leave
          // animation has also finished and runOutgoingCleanup() has removed the
          // outgoing container. IX2 reinit is now safe — it only affects the
          // incoming container and the rest of the document.
          reinitWebflowIX2();
          // IX2.ready() can clear .w--current; restore it immediately.
          resetWCurrent();
          // Authoritative refresh — IX2 initial states now applied, positions
          // and pin spacers correct. invalidateOnRefresh STs (project footer)
          // will recalculate here regardless of when they were first created.
          try { window.ScrollTrigger?.refresh(); } catch (_) {}
          try { window.lenis?.resize?.(); } catch (_) {}
        },

        async once(data) {
          resetWCurrent();
          await initContainer(data?.next?.container || document, {
            isFirstLoad: true,
            isNavigation: false,
            namespace: getNamespace(data, "next")
          });
          // Single synchronous refresh — scroll is 0, no animation, no transforms.
          // safeRefreshScrollTrigger's delayed calls (rAF + 200ms) can fire while
          // Lenis is mid-lerp and cause the same jerk as the transition version.
          try { window.ScrollTrigger?.refresh(); } catch (_) {}
          try { window.lenis?.resize?.(); } catch (_) {}
        },

        after() {}
      }
    ]
  });
}
