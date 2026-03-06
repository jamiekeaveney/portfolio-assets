import { runCleanups, captureCleanups } from "../core/cleanup.js";
import { killAllScrollTriggers }        from "../core/scrolltrigger.js";
import {
  syncWebflowPageIdFromNextHtml,
  reinitWebflowIX2,
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
    // Do NOT clear __projectNextTransition here — it may contain data that
    // the forthcoming p2p transition needs (inProgress guard is our signal).
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
        // Outgoing page fades out beneath the handoff overlay clones.
        // No y-movement — the clones carry all visual motion.
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

          // Incoming container: hidden and non-interactive until handoff.
          gsap.set(data.next.container, { zIndex: 2, opacity: 0 });
          data.current.container.style.pointerEvents = "none";
          data.next.container.style.pointerEvents    = "none";

          // Reset both Lenis internal position and native scroll to 0.
          hardScrollReset();

          // Fade outgoing page out over the handoff duration.
          await gsap.to(data.current.container, {
            opacity:  0,
            duration: VT_DURATION,
            ease:     "expo.inOut"
          });

          runOutgoingCleanup();
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
          // animation, when the container is untransformed and overlay
          // clones are gone — critical for correct pin-spacer measurement.
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
          reinitWebflowIX2();
          resetWCurrent();

          // postTransition fires HERE — after the handoff, no transforms
          // on the container. initProjectNextPin pin-spacer is measured
          // with the fully settled layout.
          flushPostTransition();

          try { window.ScrollTrigger?.refresh(); } catch (_) {}

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
          // No more transparent-background hack on children.
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

          // Overlay darkens the outgoing page.
          if (overlay) {
            leaveTl.to(overlay, {
              opacity:  0.6,
              duration: VT_DURATION,
              ease:     VT_EASE
            }, 0);
          }

          // Outgoing page slides up.
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
          // deferLenisStart keeps Lenis stopped during the slide animation.
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
          await gsap.from(container, {
            y:        "100vh",
            duration: VT_DURATION,
            ease:     VT_EASE
          });

          // ── E: Post-animation reinit ───────────────────────────────────
          // Animation is complete — container is fully untransformed now.
          // IX2 is reinited first so it can apply its initial states to
          // elements. ST.refresh() runs next so those initial states are
          // included in measurements. Only THEN do postTransition callbacks
          // fire — initProjectNextPin's pin ST is created with the correct
          // IX2-aware layout.
          reinitWebflowIX2();
          resetWCurrent();

          try { window.ScrollTrigger?.refresh(); } catch (_) {}

          flushPostTransition();

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
