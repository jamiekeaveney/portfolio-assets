// src/features/project-next-pin.js
// Pins the project footer and scrubs a progress counter as the user scrolls.
// When progress reaches 100 %, navigates to the next project via Barba
// (never via location.href / _bypassBarba).
//
// Source element bounds are captured at trigger time — BEFORE the scroll
// position resets in leave() — so the handoff overlay can read them safely
// even after the outgoing container has been repositioned.
//
// The shared state object is initialised here (and re-used by
// project-next-handoff.js and barba/index.js).

import { addCleanup } from "../core/cleanup.js";

// ── Shared transition state ──────────────────────────────────────────────────

if (!window.__projectNextTransition) {
  window.__projectNextTransition = {
    href:                  null,
    sourceThumbEl:         null,
    sourceThumbBounds:     null,
    sourceTitleWrapEl:     null,
    sourceTitleWrapBounds: null,
    sourceTitleEl:         null,
    sourceTitleBounds:     null,
    initiatedFromPinnedNext: false,
    inProgress:            false
  };
}

// ── initProjectNextPin ───────────────────────────────────────────────────────

export function initProjectNextPin(container, options = {}) {
  if (!window.gsap || !window.ScrollTrigger) return;

  window.gsap.registerPlugin(window.ScrollTrigger);

  const mm = window.gsap.matchMedia();

  mm.add("(min-width: 992px)", () => {
    const root   = document.documentElement;
    const pinned = container.querySelector(".pinned-section");
    if (!pinned) return;

    const counters = container.querySelectorAll(".counter");

    let tween;
    let ended = false, started = false, lastTxt = "";

    // ── createPinTrigger ────────────────────────────────────────────────────
    // Called once waitOne() has confirmed the CMS list contains exactly 1 item.

    const createPinTrigger = (item) => {
      const linkEl      = item.querySelector("a[href]");
      const href        = linkEl?.href;
      if (!href) return;

      const thumbEl     = item.querySelector("[data-next-project-thumb]")     || null;
      const titleWrapEl = item.querySelector("[data-next-project-title-wrap]") || null;
      const titleEl     = item.querySelector("[data-next-project-title]")      || null;

      const H = () => window.innerHeight;

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
            if (!ended) {
              if (self.progress > 0.001 && !started) {
                started = true;
                pinned.classList.add("start-transition");
              } else if (self.progress <= 0.001 && started) {
                started = false;
                pinned.classList.remove("start-transition");
              }
            }
          },

          onUpdate(self) {
            const p     = self.progress;
            const atEnd = p >= 0.999;

            if (!ended) {
              if (!started && p > 0) {
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

              // ── Capture source bounds NOW ──────────────────────────────────
              // The pinned section is currently visible in the viewport.
              // After barba.go() triggers leave(), scroll resets to 0 and the
              // outgoing container is repositioned — bounds would be wrong then.
              const s = window.__projectNextTransition;
              s.href                  = href;
              s.sourceThumbEl         = thumbEl;
              s.sourceThumbBounds     = thumbEl     ? thumbEl.getBoundingClientRect()     : null;
              s.sourceTitleWrapEl     = titleWrapEl;
              s.sourceTitleWrapBounds = titleWrapEl ? titleWrapEl.getBoundingClientRect() : null;
              s.sourceTitleEl         = titleEl;
              s.sourceTitleBounds     = titleEl     ? titleEl.getBoundingClientRect()     : null;
              s.initiatedFromPinnedNext = true;
              s.inProgress            = true;

              // Lock native scroll immediately; Lenis will be stopped by the
              // global before() hook when barba.go() fires ~50 ms later.
              root.style.overflow         = "hidden";
              document.body.style.overflow = "hidden";

              setTimeout(() => {
                if (window.barba) {
                  window.barba.go(href);
                } else {
                  // Safety fallback — should never be needed in production.
                  location.href = href;
                }
              }, 50);
            }
          }
        }
      });

      // Refresh after creating the pin so the pin spacer is included in
      // Lenis's scroll extent immediately.
      try { window.ScrollTrigger?.refresh(); } catch (_) {}
      try { window.lenis?.resize?.();        } catch (_) {}
    };

    // ── waitOne ─────────────────────────────────────────────────────────────
    // Poll (rAF) until initCmsNext has reduced the CMS list to exactly 1 item.
    // Guards against any jQuery/Webflow settling that hasn't completed yet.

    const waitOne = (tries = 200) => {
      const comp = container.querySelector("[tr-cmsnext-element='component']");
      if (!comp) {
        if (tries > 0) requestAnimationFrame(() => waitOne(tries - 1));
        return;
      }
      const items = comp.querySelectorAll(".w-dyn-item");
      if (items.length === 1) { createPinTrigger(items[0]); return; }
      if (tries > 0) requestAnimationFrame(() => waitOne(tries - 1));
    };

    waitOne();

    // ── mm cleanup ──────────────────────────────────────────────────────────
    return () => {
      ended   = false;
      started = false;
      lastTxt = "";

      pinned.classList.remove("start-transition", "end-transition");

      // Only restore overflow / start Lenis here when we are NOT mid-transition.
      // During an active transition the global unlockScroll() in barba/index.js
      // owns the lifecycle; restoring here would unlock scroll prematurely.
      if (!window.__projectNextTransition?.inProgress) {
        root.style.overflow          = "";
        document.body.style.overflow = "";
        window.lenis?.start?.();
      }

      if (tween?.scrollTrigger) tween.scrollTrigger.kill(true);
      tween?.kill();
    };
  });

  addCleanup(() => mm.revert());
}
