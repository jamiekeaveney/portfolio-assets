import { runCleanups } from "../core/cleanup.js";
import { stopLenis, destroyLenis } from "../core/lenis.js";
import { killAllScrollTriggers, safeRefreshScrollTrigger } from "../core/scrolltrigger.js";
import {
  syncWebflowPageIdFromNextHtml,
  reinitWebflowIX2,
  resetWCurrent
} from "../core/webflow.js";
import { closeNav, isFromPanel, clearFromPanel } from "../core/nav.js";
import { destroyPage } from "../pages/index.js";

const VT_DURATION = 1.5;
const VT_EASE = "cubic-bezier(0.25, 0.1, 0.25, 1)";
const VT_FADE_TO = 0.5;

const CURSOR_CLASS = "is-transitioning";
const setCursorBusy = (on) =>
  document.documentElement.classList.toggle(CURSOR_CLASS, !!on);

const resetScrollTop = () => window.scrollTo(0, 0);

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

  window.barba.hooks.before(() => setCursorBusy(true));
  window.barba.hooks.after(() => setCursorBusy(false));

  window.barba.hooks.after((data) => {
    syncWebflowPageIdFromNextHtml(data?.next?.html || "");

    // 1. Remove all transition inline styles first so layout is clean.
    window.gsap?.set(data?.next?.container, {
      clearProps:
        "position,top,left,right,bottom,width,height,overflow,zIndex,opacity,transform,backgroundColor"
    });

    // 2. Refresh ScrollTrigger NOW — after clearProps, so every trigger
    //    measures positions against the final, untransformed layout.
    //    This is the only correct moment: the enter animation has finished
    //    and all inline styles from the transition are gone.
    safeRefreshScrollTrigger();

    // 3. Reinit IX2 last — it reads scroll=0 and element positions to set
    //    initial animation states, so it must run after the layout is clean
    //    and ST has already recalculated.
    reinitWebflowIX2();

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
          await initContainer(data?.next?.container || document, {
            isFirstLoad: false,
            isNavigation: true,
            namespace: getNamespace(data, "next")
          });
        }
      },

      {
        name: "slide",
        sync: true,

        leave(data) {
          closeNav();
          stopLenis();
          runCleanups();
          destroyLenis();
          killAllScrollTriggers();
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

          // Transform origin at viewport top = scrollY px from
          // the container's top edge. This keeps the scale anchored
          // to what the user was actually seeing, not the document top.
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

          const initPromise = initContainer(data?.next?.container || document, {
            isFirstLoad: false,
            isNavigation: true,
            namespace: getNamespace(data, "next")
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
          // The global after() hook does not fire for once(), so we
          // refresh here — no animation is running, layout is final.
          safeRefreshScrollTrigger();
        },

        after() {}
      }
    ]
  });
}