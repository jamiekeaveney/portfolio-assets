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

function getThumbProxySource(el) {
  if (!el) return null;
  return el.closest(".image-wrap") || el.parentElement || el;
}

export function initProjectNextPin(container) {
  if (!window.gsap || !window.ScrollTrigger) return;

  window.gsap.registerPlugin(window.ScrollTrigger);

  const mm = window.gsap.matchMedia();

  mm.add("(min-width: 992px)", () => {
    const root = document.documentElement;
    const pinned = container.querySelector(".pinned-section");
    if (!pinned) return;

    const counters = container.querySelectorAll(".counter");
    const components = pinned.querySelectorAll("[tr-cmsnext-element='component']");

    let tween = null;
    let observer = null;
    let ended = false;
    let started = false;
    let lastTxt = "";
    let disposed = false;
    let rafId = 0;

    const resetUi = () => {
      pinned.classList.remove("start-transition", "end-transition");
      root.style.setProperty("--_feedback---footer-progress", "0");
      counters.forEach((c) => (c.textContent = "00"));
    };

    const destroyTween = () => {
      if (tween?.scrollTrigger) {
        try { tween.scrollTrigger.kill(true); } catch (_) {}
      }
      try { tween?.kill(); } catch (_) {}
      tween = null;
    };

    const createPinTrigger = (item) => {
      if (!item || tween || disposed) return;

      const linkEl = item.querySelector("a[href]");
      const href = linkEl?.href;
      if (!href) return;

      const thumbEl = item.querySelector("[data-next-project-thumb]") || null;
      const thumbProxySource = getThumbProxySource(thumbEl);
      const titleWrapEl = item.querySelector("[data-next-project-title-wrap]") || null;
      const titleEl = item.querySelector("[data-next-project-title]") || null;

      resetUi();

      tween = window.gsap.to(root, {
        "--_feedback---footer-progress": 1,
        ease: "none",
        scrollTrigger: {
          trigger: pinned,
          start: "top top",
          end: () => "+=" + window.innerHeight,
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
              s.href = href;
              s.sourceThumbEl = thumbProxySource;
              s.sourceThumbBounds = thumbProxySource ? thumbProxySource.getBoundingClientRect() : null;
              s.sourceTitleWrapEl = titleWrapEl;
              s.sourceTitleWrapBounds = titleWrapEl ? titleWrapEl.getBoundingClientRect() : null;
              s.sourceTitleEl = titleEl;
              s.sourceTitleBounds = titleEl ? titleEl.getBoundingClientRect() : null;
              s.initiatedFromPinnedNext = true;
              s.inProgress = true;

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

    const resolveSingleItem = () => {
      if (disposed) return null;
      for (let i = 0; i < components.length; i++) {
        const items = components[i].querySelectorAll(".w-dyn-item");
        if (items.length === 1) return items[0];
      }
      return null;
    };

    const attemptInit = () => {
      if (disposed || tween) return;
      const item = resolveSingleItem();
      if (item) {
        createPinTrigger(item);
      }
    };

    const scheduleAttempt = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        requestAnimationFrame(attemptInit);
      });
    };

    resetUi();
    scheduleAttempt();

    observer = new MutationObserver(() => {
      if (!tween) scheduleAttempt();
    });

    components.forEach((comp) => {
      try {
        observer.observe(comp, { childList: true, subtree: true, attributes: true });
      } catch (_) {}
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      destroyTween();
      try { observer?.disconnect(); } catch (_) {}
      observer = null;
      ended = false;
      started = false;
      lastTxt = "";
      resetUi();

      if (!window.__projectNextTransition?.inProgress) {
        root.style.overflow = "";
        document.body.style.overflow = "";
        try { window.lenis?.start?.(); } catch (_) {}
      }
    };
  });

  addCleanup(() => mm.revert());
}