import { runCleanups, captureCleanups } from "../core/cleanup.js";
import { killAllScrollTriggers }        from "../core/scrolltrigger.js";
import {
  syncWebflowPageIdFromNextHtml,
  reinitWebflowIX2,
  destroyAndInitIX2,
  readyWebflow,
  resetWCurrent
} from "../core/webflow.js";
import { closeNav, isFromPanel, clearFromPanel } from "../core/nav.js";
import { destroyPage }                           from "../pages/index.js";
import { snapshotIX2CSSVars, freezeStickyInContainer } from "./freeze.js";
import {
  lockTransition,
  unlockTransition,
  forceUnlockTransition,
  ensureOverlay,
  clearProjectNextTransition,
  clearHandoffOverlays
} from "./transition-lock.js";
import { createProjectNextHandoff } from "../features/project-next-handoff.js";

// ── Constants ────────────────────────────────────────────────────────────────

const VT_DURATION = 1.5;
const VT_EASE     = "cubic-bezier(0.25, 0.1, 0.25, 1)";

// ── Init guard for __projectNextTransition ───────────────────────────────────

if (!window.__projectNextTransition) {
  window.__projectNextTransition = {
    href:                    null,
    sourceThumbEl:           null,
    sourceThumbBounds:       null,
    sourceTitleWrapEl:       null,
    sourceTitleWrapBounds:   null,
    sourceTitleEl:           null,
    sourceTitleBounds:       null,
    initiatedFromPinnedNext: false,
    inProgress:              false
  };
}

// ── Post-transition callback queue ───────────────────────────────────────────

let _postTransitionCallbacks = [];

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function flushPostTransition() {
  if (!_postTransitionCallbacks.length) return;
  _postTransitionCallbacks.forEach((fn) => { try { fn(); } catch (_) {} });
  _postTransitionCallbacks = [];
}

// Hard scroll-to-zero that covers both Lenis internal position and native
// scroll. Called in every leave() so the incoming page always starts at top.
function hardScrollReset() {
  try { window.lenis?.scrollTo(0, { immediate: true }); } catch (_) {}
  try { window.scrollTo(0, 0); } catch (_) {}
}

// ── initBarba ────────────────────────────────────────────────────────────────

export function initBarba({ initContainer }) {
  if (!window.barba) return console.warn("Barba not loaded.");

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

  // Disable browser scroll restoration so back/forward never reintroduces
  // a stale scroll position. We call window.scrollTo(0,0) explicitly in
  // every transition's unlock path.
  try { history.scrollRestoration = "manual"; } catch (_) {}

  // ── Global before ────────────────────────────────────────────────────────
  // Fires at the very start of every transition, including back/forward.
  window.barba.hooks.before((data) => {
    document.documentElement.classList.add("is-transitioning");
    resetWCurrent(data?.next?.url?.path);

    // Remove any orphaned handoff overlays from a previous errored transition.
    clearHandoffOverlays();

    // Lock scroll for all transitions.
    lockTransition();
  });

  // ── Global after ─────────────────────────────────────────────────────────
  // Fires after every transition regardless of errors — hard safety net.
  window.barba.hooks.after((data) => {
    document.documentElement.classList.remove("is-transitioning");

    // forceUnlock is idempotent — if enter() already unlocked, this just
    // ensures html/body overflow is clear and Lenis is running.
    forceUnlockTransition();

    // Clear handoff state so history navigation never reuses stale data.
    clearProjectNextTransition();

    // Strip any residual GSAP inline props from the incoming container.
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

      // ══════════════════════════════════════════════════════════════════════
      // PROJECT → PROJECT
      // Listed BEFORE slide so Barba matches it first for project namespaces.
      // sync: true — leave and enter run concurrently.
      // ══════════════════════════════════════════════════════════════════════
      {
        name: "project-to-project",
        sync: true,

        custom: (data) =>
          getNamespace(data, "current") === "project" &&
          getNamespace(data, "next")    === "project",

        // ── Leave ──────────────────────────────────────────────────────────
        // Outgoing page is fixed at its current scroll position and held
        // behind the incoming container (z-index 1 vs 2). No fade — the
        // incoming container covers it entirely at z-index 2. Removing the
        // fade eliminates the race between source fading and proxy appearing.
        async leave(data) {
          closeNav();

          const gsap    = window.gsap;
          const scrollY = window.scrollY || window.pageYOffset || 0;

          freezeStickyInContainer(data.current.container);
          const restoreOutgoingVars = snapshotIX2CSSVars(data.current.container);
          const runOutgoingCleanup  = captureCleanups();
          killAllScrollTriggers();
          restoreOutgoingVars();
          destroyPage(getNamespace(data, "current"));

          if (!gsap) {
            runOutgoingCleanup();
            return;
          }

          // Fix outgoing container at its current visual position.
          gsap.set(data.current.container, {
            position: "fixed",
            top:      -scrollY,
            left:     0,
            width:    "100%",
            height:   "auto",
            zIndex:   1
          });

          // Incoming container: hidden, on top, non-interactive until handoff.
          gsap.set(data.next.container, { zIndex: 2, opacity: 0 });
          data.current.container.style.pointerEvents = "none";
          data.next.container.style.pointerEvents    = "none";

          // Reset both Lenis internal position and native scroll to 0.
          hardScrollReset();

          // Tear down outgoing scripts now — the DOM stays in place until
          // Barba removes it after enter() also resolves (handoff ~1.5s).
          // The proxy uses a background-image (not a DOM reference), so
          // script teardown doesn't break the visual handoff.
          runOutgoingCleanup();

          // Leave resolves immediately. Barba keeps the outgoing container
          // in the DOM until enter() resolves, so the fixed backdrop stays.
        },

        // ── Enter ──────────────────────────────────────────────────────────
        async enter(data) {
          const gsap = window.gsap;
          if (!gsap) return;

          const container = data?.next?.container;
          if (!container) return;

          // ── A: Clear stale vars, sync page identity ────────────────────
          resetIX2CSSVars();
          syncWebflowPageIdFromNextHtml(data?.next?.html || "");
          resetWCurrent();

          _postTransitionCallbacks = [];

          // ── B: Init incoming page scripts ─────────────────────────────
          // deferLenisStart keeps Lenis stopped during the handoff.
          // onPostTransition defers initProjectNextPin until after the
          // handoff animation — correct layout, no overlay clones.
          await initContainer(container, {
            isFirstLoad:      false,
            isNavigation:     true,
            namespace:        getNamespace(data, "next"),
            deferLenisStart:  true,
            onPostTransition: (fn) => _postTransitionCallbacks.push(fn)
          });

          // ── C: Preliminary ST refresh (pre-animation) ─────────────────
          try { window.ScrollTrigger?.refresh(); } catch (_) {}
          try { window.lenis?.resize?.();        } catch (_) {}

          // ── D: Visual handoff ─────────────────────────────────────────
          // createProjectNextHandoff() reveals the container internally
          // (after hiding hero elements) so there is no premature flash
          // of page content and no double-animation from reveal-load.
          const handoffTl = createProjectNextHandoff(data);
          try {
            await handoffTl.play();
          } catch (_) {
            gsap.set(container, { clearProps: "opacity" });
          }

          // ── E: Post-animation reinit ───────────────────────────────────
          // destroyAndInitIX2: Webflow.destroy() kills its own STs + applies
          // IX2 initial states. Does NOT call Webflow.ready() yet — that
          // would synchronously restore CMS items and break waitOne().
          destroyAndInitIX2();
          resetWCurrent();

          try { window.ScrollTrigger?.refresh(); } catch (_) {}

          // flushPostTransition: creates the pin trigger (and any other
          // onPostTransition work) while the CMS list is still filtered.
          // Webflow.destroy() has already run, so these STs are safe from
          // the next Webflow.ready() call.
          flushPostTransition();

          // readyWebflow: fires Webflow.ready() callbacks (CMS restore, tabs,
          // sliders, etc.). Safe to call now — pin trigger already created.
          readyWebflow();
          resetWCurrent(); // Webflow.ready() may clear .w--current

          container.style.pointerEvents = "";
          unlockTransition();
          try { window.lenis?.resize?.(); } catch (_) {}
        },

        async once(data) {
          resetWCurrent();
          await initContainer(data?.next?.container || document, {
            isFirstLoad:  true,
            isNavigation: false,
            namespace:    getNamespace(data, "next")
          });
          try { window.ScrollTrigger?.refresh(); } catch (_) {}
          try { window.lenis?.resize?.();        } catch (_) {}
        },

        after() {}
      },

      // ══════════════════════════════════════════════════════════════════════
      // PANEL-NAV
      // sync: false — leave finishes before afterEnter starts.
      // reinitWebflowIX2 (full, incl. Webflow.ready) is safe here because
      // initContainer runs AFTER it — initCmsNext re-filters AFTER Webflow
      // has had its chance to restore the list.
      // ══════════════════════════════════════════════════════════════════════
      {
        name: "panel-nav",
        sync: false,
        custom: () => isFromPanel(),

        leave(data) {
          closeNav();
          hardScrollReset();
          runCleanups();
          killAllScrollTriggers();
          destroyPage(getNamespace(data, "current"));
          try { data.current.container.remove(); } catch (_) {}
        },

        async afterEnter(data) {
          reinitWebflowIX2();
          resetWCurrent();

          _postTransitionCallbacks = [];
          await initContainer(data?.next?.container || document, {
            isFirstLoad:      false,
            isNavigation:     true,
            namespace:        getNamespace(data, "next"),
            deferLenisStart:  true,
            onPostTransition: (fn) => _postTransitionCallbacks.push(fn)
          });

          // postTransition fires before unlock — no animation, container is
          // already in final position so pin-spacer measurement is safe.
          flushPostTransition();

          try { window.ScrollTrigger?.refresh(); } catch (_) {}

          unlockTransition();
          try { window.lenis?.resize?.(); } catch (_) {}
        }
      },

      // ══════════════════════════════════════════════════════════════════════
      // SLIDE (general — all navigations not matched above)
      // sync: true — leave and enter run concurrently.
      // ══════════════════════════════════════════════════════════════════════
      {
        name: "slide",
        sync: true,

        async leave(data) {
          closeNav();

          const gsap    = window.gsap;
          const scrollY = window.scrollY || window.pageYOffset || 0;

          // ── 1: Freeze sticky descendants ──────────────────────────────
          freezeStickyInContainer(data.current.container);

          // ── 2: Snapshot IX2 CSS vars onto outgoing container ──────────
          const restoreOutgoingVars = snapshotIX2CSSVars(data.current.container);

          // ── 3: Capture outgoing cleanups (without running them yet) ───
          const runOutgoingCleanup = captureCleanups();

          // ── 4: Kill ScrollTriggers ────────────────────────────────────
          killAllScrollTriggers();

          // ── 5: Re-apply frozen vars (GSAP kill reverted them to 0) ────
          restoreOutgoingVars();

          destroyPage(getNamespace(data, "current"));

          if (!gsap) {
            runOutgoingCleanup();
            return;
          }

          // ── 6: Fix outgoing container, inject overlay ─────────────────
          gsap.set(data.current.container, {
            position: "fixed",
            top:      -scrollY,
            left:     0,
            width:    "100%",
            height:   "auto",
            zIndex:   1
          });

          // Real .page-overlay darkens the outgoing page.
          const overlay = ensureOverlay(data.current.container);
          if (overlay) gsap.set(overlay, { opacity: 0 });

          // Incoming container sits behind the outgoing page; fully locked.
          gsap.set(data.next.container, { zIndex: 2 });
          data.current.container.style.pointerEvents = "none";
          data.next.container.style.pointerEvents    = "none";

          // ── 7: Scroll reset ───────────────────────────────────────────
          hardScrollReset();

          // ── 8: Leave animation ────────────────────────────────────────
          const leaveTl = gsap.timeline();

          if (overlay) {
            leaveTl.to(overlay, {
              opacity:  0.6,
              duration: VT_DURATION,
              ease:     VT_EASE
            }, 0);
          }

          leaveTl.to(data.current.container, {
            y:               "-25vh",
            duration:        VT_DURATION,
            ease:            VT_EASE,
            transformOrigin: "50% " + scrollY + "px"
          }, 0);

          await leaveTl;

          // ── 9: Tear down outgoing scripts ─────────────────────────────
          runOutgoingCleanup();
        },

        async enter(data) {
          const gsap = window.gsap;
          if (!gsap) return;

          const container = data?.next?.container;
          if (!container) return;

          // ── A ─────────────────────────────────────────────────────────
          resetIX2CSSVars();
          syncWebflowPageIdFromNextHtml(data?.next?.html || "");
          resetWCurrent();

          _postTransitionCallbacks = [];

          // ── B: Init incoming page scripts ─────────────────────────────
          await initContainer(container, {
            isFirstLoad:      false,
            isNavigation:     true,
            namespace:        getNamespace(data, "next"),
            deferLenisStart:  true,
            onPostTransition: (fn) => _postTransitionCallbacks.push(fn)
          });

          // ── C: Preliminary refresh ────────────────────────────────────
          try { window.ScrollTrigger?.refresh(); } catch (_) {}
          try { window.lenis?.resize?.();        } catch (_) {}

          // ── D: Slide-in animation ─────────────────────────────────────
          // Use gsap.set + gsap.to instead of gsap.from to eliminate the
          // single-frame gap where the container appears at y:0 before
          // GSAP applies the from-value on the next RAF tick.
          gsap.set(container, { y: "100vh" });
          await gsap.to(container, {
            y:        0,
            duration: VT_DURATION,
            ease:     VT_EASE
          });

          // ── E: Post-animation reinit ───────────────────────────────────
          // destroyAndInitIX2: applies IX2 initial states without calling
          // Webflow.ready() — prevents CMS list from being restored before
          // flushPostTransition creates the pin trigger.
          // Any STs killed by Webflow.destroy() here were created in Step B.
          // onPostTransition callbacks (pin trigger, scroll-1) are deferred
          // to flushPostTransition() below, so they are created AFTER the
          // kill and survive.
          destroyAndInitIX2();
          resetWCurrent();

          try { window.ScrollTrigger?.refresh(); } catch (_) {}

          // flushPostTransition: runs initProjectNextPin, scroll-1, and any
          // other deferred callbacks. These STs are created AFTER
          // Webflow.destroy() and are therefore NOT killed by it.
          flushPostTransition();

          // readyWebflow: Webflow.ready() now fires (CMS list may restore,
          // tabs/sliders reinit). The pin trigger already exists — safe.
          readyWebflow();
          resetWCurrent(); // Webflow.ready() may clear .w--current

          unlockTransition();
          try { window.lenis?.resize?.(); } catch (_) {}
        },

        async once(data) {
          resetWCurrent();
          await initContainer(data?.next?.container || document, {
            isFirstLoad:  true,
            isNavigation: false,
            namespace:    getNamespace(data, "next")
          });
          try { window.ScrollTrigger?.refresh(); } catch (_) {}
          try { window.lenis?.resize?.();        } catch (_) {}
        },

        after() {}
      }
    ]
  });
}
