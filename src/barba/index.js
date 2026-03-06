import { runCleanups, captureCleanups } from "../core/cleanup.js";
import { killAllScrollTriggers }        from "../core/scrolltrigger.js";
import { stopLenis, startLenis }        from "../core/lenis.js";
import {
  syncWebflowPageIdFromNextHtml,
  reinitWebflowIX2,
  resetWCurrent
} from "../core/webflow.js";
import { closeNav, isFromPanel, clearFromPanel } from "../core/nav.js";
import { destroyPage }                           from "../pages/index.js";
import { snapshotIX2CSSVars, freezeStickyInContainer } from "./freeze.js";
import { createProjectNextHandoff }              from "../features/project-next-handoff.js";

// ── Constants ────────────────────────────────────────────────────────────────

const VT_DURATION = 1.5;
const VT_EASE     = "cubic-bezier(0.25, 0.1, 0.25, 1)";
const VT_FADE_TO  = 0.5;

const CURSOR_CLASS  = "is-transitioning";
const setCursorBusy = (on) =>
  document.documentElement.classList.toggle(CURSOR_CLASS, !!on);

const resetScrollTop = () => window.scrollTo(0, 0);

// ── Global scroll-lock helpers ───────────────────────────────────────────────
//
// lockScroll() is called in the global before() hook so it fires at the very
// start of every transition. Individual transitions then re-stop Lenis after
// initContainer() (which calls startLenis() internally) to keep the lock
// holding through the animation phase.  unlockScroll() is called at the end
// of each transition's enter / afterEnter handler.  The after() hook repeats
// unlockScroll() as a safety net in case enter() throws before completing.

function lockScroll() {
  stopLenis();
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow            = "hidden";
}

function unlockScroll() {
  document.documentElement.style.overflow = "";
  document.body.style.overflow            = "";
  startLenis();
}

// ── Global transition state ──────────────────────────────────────────────────
// Initialised here as a canonical source of truth.  project-next-pin.js also
// checks for its existence and skips re-initialisation if already present.

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
// Callbacks registered via ctx.onPostTransition are run at the appropriate
// point within each transition (after animation, before final ST.refresh).

let _postTransitionCallbacks = [];

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function flushPostTransition() {
  if (!_postTransitionCallbacks.length) return;
  _postTransitionCallbacks.forEach((fn) => { try { fn(); } catch (_) {} });
  _postTransitionCallbacks = [];
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

  try { history.scrollRestoration = "manual"; } catch (_) {}

  // ── Global before: runs at the start of every transition ────────────────
  window.barba.hooks.before((data) => {
    setCursorBusy(true);
    resetWCurrent(data?.next?.url?.path);
    // Lock native scroll immediately; Lenis stays stopped for the full
    // duration of the transition (each enter() re-stops it after initContainer
    // and only unlocks at the very end).
    lockScroll();
  });

  // ── Global after: safety-net restore for every transition ────────────────
  window.barba.hooks.after((data) => {
    setCursorBusy(false);
    // unlockScroll is idempotent — if enter() already unlocked this is a no-op.
    unlockScroll();
    // Clear any residual inline styles the transition may have left on the
    // incoming container wrapper.
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
      // Must be listed BEFORE the general slide transition so Barba matches
      // it first when navigating between project namespaces.
      // sync: true — leave and enter run concurrently.
      // ══════════════════════════════════════════════════════════════════════
      {
        name: "project-to-project",
        sync: true,

        custom: (data) =>
          getNamespace(data, "current") === "project" &&
          getNamespace(data, "next")    === "project",

        // ── Leave ──────────────────────────────────────────────────────────
        // The outgoing page fades out beneath the overlay clones.
        // Unlike the slide transition, we do NOT move the container to y:-25vh
        // — the handoff clones carry all visual motion, so the outgoing page
        // simply needs to disappear without shifting.
        async leave(data) {
          closeNav();

          const gsap    = window.gsap;
          const scrollY = window.scrollY || window.pageYOffset || 0;

          // Steps 1-5: identical to slide — freeze, snapshot, capture, kill, restore.
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

          // Fix the outgoing container at its visual location.
          gsap.set(data.current.container, {
            position: "fixed",
            top:      -scrollY,
            left:     0,
            width:    "100%",
            height:   "auto",
            zIndex:   1
          });

          // The incoming container is hidden and non-interactive until the
          // handoff timeline shows it in enter().
          gsap.set(data.next.container, { zIndex: 2, opacity: 0 });
          data.current.container.style.pointerEvents = "none";
          data.next.container.style.pointerEvents    = "none";

          // Reset scroll (lenis.scrollTo works even when Lenis is stopped).
          try { window.lenis?.scrollTo(0, { immediate: true }); } catch (_) { resetScrollTop(); }

          // Fade the outgoing page out over the same duration as the handoff.
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

          // ── Step A: Clear stale IX2 vars, sync page identity ──────────────
          resetIX2CSSVars();
          syncWebflowPageIdFromNextHtml(data?.next?.html || "");
          resetWCurrent();

          _postTransitionCallbacks = [];

          // ── Step B: Init incoming page scripts ────────────────────────────
          // Container is untransformed and at scroll=0. CMS mutations and
          // ScrollTrigger positions are measured correctly here.
          // initContainer calls startLenis() internally; we re-stop it below.
          await initContainer(container, {
            isFirstLoad:      false,
            isNavigation:     true,
            namespace:        getNamespace(data, "next"),
            // postTransition callbacks run AFTER the handoff animation so that
            // the pin-spacer measurement finds no ancestor transforms.
            onPostTransition: (fn) => _postTransitionCallbacks.push(fn)
          });

          // Re-stop Lenis — initContainer started it, but the animation hasn't
          // played yet. Scroll must stay locked during the handoff.
          stopLenis();

          // ── Step C: Preliminary ST refresh ───────────────────────────────
          try { window.ScrollTrigger?.refresh(); } catch (_) {}
          try { window.lenis?.resize?.();        } catch (_) {}

          // ── Step D: Visual handoff ────────────────────────────────────────
          // Make the incoming container visible before playing the overlay
          // clones so the real hero media fades in underneath them correctly.
          gsap.set(container, { opacity: 1 });

          const handoffTl = createProjectNextHandoff(data);
          try {
            await handoffTl.play();
          } catch (_) {
            // If the handoff timeline fails, ensure the container is visible.
            gsap.set(container, { opacity: 1 });
          }

          // ── Step E: Post-animation reinit ─────────────────────────────────
          // Outgoing container has been faded to opacity:0 by this point
          // (leave animation duration ≈ enter animation duration).
          // IX2 reinit is now safe.
          reinitWebflowIX2();
          resetWCurrent();

          // Fire postTransition callbacks now that the handoff animation is
          // fully complete and wrapper transforms are gone.
          // initProjectNextPin (deferred via onPostTransition in project.js)
          // creates its pin ST here with a correctly settled layout.
          flushPostTransition();

          try { window.ScrollTrigger?.refresh(); } catch (_) {}

          // ── Restore scroll ────────────────────────────────────────────────
          container.style.pointerEvents = "";
          unlockScroll();
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
      // Triggered when the navigation is opened from a panel / overlay.
      // sync: false — leave fully completes before enter starts.
      // ══════════════════════════════════════════════════════════════════════
      {
        name: "panel-nav",
        sync: false,
        custom: () => isFromPanel(),

        leave(data) {
          closeNav();
          // Lenis is already stopped (lockScroll in before hook).
          // Still call scrollTo so its internal position tracks 0.
          try { window.lenis?.scrollTo(0, { immediate: true }); } catch (_) {}
          runCleanups();
          killAllScrollTriggers();
          destroyPage(getNamespace(data, "current"));
          try { data.current.container.remove(); } catch (_) {}
        },

        async afterEnter(data) {
          // Outgoing container was removed synchronously in leave().
          // IX2 reinit is safe immediately.
          reinitWebflowIX2();
          resetWCurrent();

          _postTransitionCallbacks = [];
          await initContainer(data?.next?.container || document, {
            isFirstLoad:      false,
            isNavigation:     true,
            namespace:        getNamespace(data, "next"),
            onPostTransition: (fn) => _postTransitionCallbacks.push(fn)
          });

          // Re-stop Lenis that initContainer started. Keep locked until all
          // postTransition work (ST measurements etc.) is complete.
          stopLenis();

          flushPostTransition();

          try { window.ScrollTrigger?.refresh(); } catch (_) {}

          // Restore scroll — transition is fully settled.
          unlockScroll();
          try { window.lenis?.resize?.(); } catch (_) {}
        }
      },

      // ══════════════════════════════════════════════════════════════════════
      // SLIDE  (general — handles all other navigations)
      // sync: true — leave and enter run concurrently.
      // ══════════════════════════════════════════════════════════════════════
      {
        name: "slide",
        sync: true,

        async leave(data) {
          closeNav();

          const gsap    = window.gsap;
          const scrollY = window.scrollY || window.pageYOffset || 0;

          // ── Step 1: Freeze sticky elements ────────────────────────────────
          freezeStickyInContainer(data.current.container);

          // ── Step 2: Snapshot CSS vars onto the outgoing container ─────────
          const restoreOutgoingVars = snapshotIX2CSSVars(data.current.container);

          // ── Step 3: Capture (don't run) outgoing page cleanups ────────────
          const runOutgoingCleanup = captureCleanups();

          // ── Step 4: Kill ScrollTriggers ───────────────────────────────────
          killAllScrollTriggers();

          // ── Step 5: Re-apply frozen CSS vars ─────────────────────────────
          restoreOutgoingVars();

          destroyPage(getNamespace(data, "current"));

          if (!gsap) {
            runOutgoingCleanup();
            return;
          }

          // ── Step 6: Position outgoing container for leave animation ───────
          gsap.set(data.current.container, {
            position:        "fixed",
            top:             -scrollY,
            left:            0,
            width:           "100%",
            height:          "auto",
            zIndex:          1,
            backgroundColor: "transparent"
          });

          const kids = data.current.container.children;
          for (let i = 0; i < kids.length; i++) {
            kids[i].style.backgroundColor = "transparent";
          }

          gsap.set(data.next.container, { zIndex: 2 });

          data.current.container.style.pointerEvents = "none";
          // Incoming container allows events immediately (e.g. Work slider).
          data.next.container.style.pointerEvents    = "auto";

          // Reset scroll AFTER fixing container.
          // Use Lenis scrollTo so its internal position tracks scroll = 0.
          // Lenis is stopped (from lockScroll in before hook) but scrollTo
          // with immediate:true still updates the native scroll position.
          try { window.lenis?.scrollTo(0, { immediate: true }); } catch (_) { resetScrollTop(); }

          // ── Step 7: Leave animation, THEN destroy outgoing scripts ────────
          await gsap.timeline().to(data.current.container, {
            y:               "-25vh",
            opacity:         VT_FADE_TO,
            duration:        VT_DURATION,
            ease:            VT_EASE,
            transformOrigin: "50% " + scrollY + "px"
          });

          runOutgoingCleanup();
        },

        async enter(data) {
          const gsap = window.gsap;
          if (!gsap) return;

          const container = data?.next?.container;
          if (!container) return;

          // ── Step A ────────────────────────────────────────────────────────
          resetIX2CSSVars();
          syncWebflowPageIdFromNextHtml(data?.next?.html || "");
          resetWCurrent();

          _postTransitionCallbacks = [];

          // ── Step B: Init page scripts ─────────────────────────────────────
          await initContainer(container, {
            isFirstLoad:      false,
            isNavigation:     true,
            namespace:        getNamespace(data, "next"),
            onPostTransition: (fn) => _postTransitionCallbacks.push(fn)
          });

          // Re-stop Lenis — initContainer started it; lock must hold through
          // the slide animation.
          stopLenis();

          // postTransition callbacks run BEFORE the slide animation on this
          // transition (the container is already untransformed at this point).
          flushPostTransition();

          // ── Step C: Preliminary refresh ───────────────────────────────────
          try { window.ScrollTrigger?.refresh(); } catch (_) {}
          try { window.lenis?.resize?.();        } catch (_) {}

          // ── Step D: Slide-in animation ────────────────────────────────────
          await gsap.from(container, {
            y:        "100vh",
            duration: VT_DURATION,
            ease:     VT_EASE
          });

          // ── Step E: Post-animation reinit ─────────────────────────────────
          reinitWebflowIX2();
          resetWCurrent();
          try { window.ScrollTrigger?.refresh(); } catch (_) {}

          // Restore scroll — animation fully complete.
          unlockScroll();
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
