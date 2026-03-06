import { addCleanup } from "../core/cleanup.js";

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

export function initProjectNextPin(container) {
  if (!window.gsap || !window.ScrollTrigger) return;

  window.gsap.registerPlugin(window.ScrollTrigger);

  const mm = window.gsap.matchMedia();

  mm.add("(min-width: 992px)", () => {
    const root   = document.documentElement;
    const pinned = container.querySelector(".pinned-section");
    if (!pinned) return;

    const counters = container.querySelectorAll(".counter");

    let tween;
    let ended = false;
    let started = false;
    let lastTxt = "";
    let waitAborted = false;

    const resetUi = () => {
      pinned.classList.remove("start-transition", "end-transition");
      root.style.setProperty("--_feedback---footer-progress", "0");
      counters.forEach((c) => (c.textContent = "00"));
    };

    const createPinTrigger = (item) => {
      if (!item || tween) return;

      const linkEl      = item.querySelector("a[href]");
      const href        = linkEl?.href;
      if (!href) return;

      const thumbEl     = item.querySelector("[data-next-project-thumb]") || null;
      const titleWrapEl = item.querySelector("[data-next-project-title-wrap]") || null;
      const titleEl     = item.querySelector("[data-next-project-title]") || null;
      const H = () => window.innerHeight;

      resetUi();

      tween = window.gsap.to(root, {
        "--_feedback---footer-progress": 1,
        ease: "none",
        scrollTrigger: {
          trigger: pinned,
          start: "top top",
          end: () => "+=" + H(),
          pin: true,
          scrub: true,
          invalidateOnRefresh: true,

          onRefresh(self) {
            if (ended) return;
            if (self.progress > 0.001) {
              started = true;
              pinned.classList.add("start-transition");
            } else {
              started = false;
              pinned.classList.remove("start-transition");
            }
          },

          onUpdate(self) {
            const p = self.progress;
            const atEnd = p >= 0.999;

            if (!ended) {
              if (!started && p > 0.001) {
                started = true;
                pinned.classList.add("start-transition");
              } else if (started && p <= 0.001) {
                started = false;
                pinned.classList.remove("start-transition");
              }
            }

            const txt = String(atEnd ? 100 : Math.floor(p * 100)).padStart(2, "0");
            if (txt !== lastTxt) {
              lastTxt = txt;
              counters.forEach((c) => (c.textContent = txt));
            }

            if (!ended && atEnd) {
              ended = true;
              pinned.classList.add("end-transition");

              const s = window.__projectNextTransition;
              s.href                  = href;
              s.sourceThumbEl         = thumbEl;
              s.sourceThumbBounds     = thumbEl ? thumbEl.getBoundingClientRect() : null;
              s.sourceTitleWrapEl     = titleWrapEl;
              s.sourceTitleWrapBounds = titleWrapEl ? titleWrapEl.getBoundingClientRect() : null;
              s.sourceTitleEl         = titleEl;
              s.sourceTitleBounds     = titleEl ? titleEl.getBoundingClientRect() : null;
              s.initiatedFromPinnedNext = true;
              s.inProgress            = true;

              root.style.overflow = "hidden";
              document.body.style.overflow = "hidden";

              requestAnimationFrame(() => {
                if (window.barba) {
                  window.barba.go(href);
                } else {
                  location.href = href;
                }
              });
            }
          }
        }
      });

      try { window.ScrollTrigger.refresh(); } catch (_) {}
      try { window.lenis?.resize?.(); } catch (_) {}
    };

    const waitOne = (tries = 240) => {
      if (waitAborted) return;

      const comp =
        pinned.querySelector("[tr-cmsnext-element='component']") ||
        container.querySelector(".pinned-section [tr-cmsnext-element='component']");

      if (!comp) {
        if (tries > 0) requestAnimationFrame(() => waitOne(tries - 1));
        return;
      }

      const items = comp.querySelectorAll(".w-dyn-item");

      if (items.length === 1) {
        createPinTrigger(items[0]);
        return;
      }

      if (tries > 0) requestAnimationFrame(() => waitOne(tries - 1));
    };

    resetUi();
    waitOne();

    return () => {
      waitAborted = true;
      ended = false;
      started = false;
      lastTxt = "";
      resetUi();

      if (!window.__projectNextTransition?.inProgress) {
        root.style.overflow = "";
        document.body.style.overflow = "";
        window.lenis?.start?.();
      }

      if (tween?.scrollTrigger) tween.scrollTrigger.kill(true);
      tween?.kill();
      tween = null;
    };
  });

  addCleanup(() => mm.revert());
}