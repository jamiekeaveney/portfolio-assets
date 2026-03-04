// src/pages/project.js
// CMS Project Template page.
//
// SETUP IN WEBFLOW DESIGNER:
//   On the Project Template page body/wrapper element:
//     data-barba="container"
//     data-barba-namespace="project"
//
// Both scripts are wrapped in gsap.matchMedia() so GSAP's matchMedia context
// handles cleanup automatically via mm.revert(), which is called by addCleanup().
// This means cleanup fires correctly on both Barba navigation and breakpoint changes.

import { addCleanup } from "../core/cleanup.js";

// ─── CMS Next/Prev item display ─────────────────────────────────────────────
// Reduces the CMS list to show only the next (or previous) project item.
// Snapshots original HTML so it can be restored cleanly on destroy.

function initCmsNext(container) {
  if (!window.gsap || !window.$) return;

  const mm = window.gsap.matchMedia();

  mm.add("(min-width: 992px)", () => {
    const $components = window.$("[tr-cmsnext-element='component']", container);

    $components.each(function () {
      const $component = window.$(this);
      const $cmsList = $component.find(".w-dyn-items").first();
      const $cmsItems = $cmsList.children();
      const $noResult = $component.find("[tr-cmsnext-element='no-result']");

      if ($component.data("cmsnextOriginal") == null) {
        $component.data("cmsnextOriginal", $cmsList.html());
      }

      let $current;
      $cmsItems.each(function () {
        if (window.$(this).find(".w--current").length) $current = window.$(this);
      });

      let $next = $current?.next();
      let $prev = $current?.prev();

      if ($component.attr("tr-cmsnext-loop") === "true") {
        if (!$next?.length) $next = $cmsItems.first();
        if (!$prev?.length) $prev = $cmsItems.last();
      }

      let $display = $next;
      if ($component.attr("tr-cmsnext-showprev") === "true") $display = $prev;

      if ($component.attr("tr-cmsnext-showall") === "true") {
        $prev?.addClass("is-prev");
        $current?.addClass("is-current");
        $next?.addClass("is-next");
      } else {
        $cmsItems.not($display).remove();
        if (!$display?.length) $noResult.show();
        if (!$display?.length && $component.attr("tr-cmsnext-hideempty") === "true") {
          $component.hide();
        }
      }
    });

    return () => {
      window.$("[tr-cmsnext-element='component']", container).each(function () {
        const $component = window.$(this);
        const $cmsList = $component.find(".w-dyn-items").first();
        const original = $component.data("cmsnextOriginal");
        if (original != null) $cmsList.html(original);
        $component.show();
        $component.find("[tr-cmsnext-element='no-result']").hide();
        $cmsList.find(".w-dyn-item").removeClass("is-prev is-current is-next");
      });
    };
  });

  addCleanup(() => mm.revert());
}

// ─── Scroll-to-next-project ──────────────────────────────────────────────────
// Pins the footer section and scrubs a progress counter as the user scrolls.
// When the user scrolls to 100%, navigates to the next project via location.href
// (bypasses Barba — this navigation is intentionally seamless/native, not a
// Barba page transition).

function initScrollToNext(container) {
  if (!window.gsap || !window.ScrollTrigger) return;

  window.gsap.registerPlugin(window.ScrollTrigger);

  const mm = window.gsap.matchMedia();

  mm.add("(min-width: 992px)", () => {
    const root = document.documentElement;
    const pinned = container.querySelector(".pinned-section");
    if (!pinned) return;

    const counters = container.querySelectorAll(".counter");

    let tween, href;
    let ended = false, started = false, lastTxt = "";

    // Wait for initCmsNext to reduce the CMS list to a single item,
    // then read the href for the next project from that item.
    const waitOne = (cb, tries = 200) => {
      const comp = container.querySelector("[tr-cmsnext-element='component']");
      if (!comp) {
        if (tries > 0) requestAnimationFrame(() => waitOne(cb, tries - 1));
        return;
      }
      const items = comp.querySelectorAll(".w-dyn-item");
      if (items.length === 1) {
        cb(items[0]);
        return;
      }
      if (tries > 0) requestAnimationFrame(() => waitOne(cb, tries - 1));
    };

    waitOne((item) => {
      href = item.querySelector("a[href]")?.href;
      if (!href) return;

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
          onUpdate: (self) => {
            const p = self.progress;
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
              window.lenis?.stop?.();
              root.style.overflow = "hidden";
              // Use location.href directly — this is a hard/native navigation that
              // bypasses Barba entirely. The _bypassBarba flag is set as a safety net
              // in case a visible <a> link ever replaces this programmatic navigation.
              setTimeout(() => {
                window._bypassBarba = true;
                location.href = href;
              }, 250);
            }
          }
        }
      });
    });

    return () => {
      ended = false;
      started = false;
      lastTxt = "";

      pinned.classList.remove("start-transition", "end-transition");
      root.style.overflow = "";
      window.lenis?.start?.();

      if (tween?.scrollTrigger) tween.scrollTrigger.kill(true);
      tween?.kill();
    };
  });

  addCleanup(() => mm.revert());
}

// ─── Public exports ──────────────────────────────────────────────────────────

export function initProject(container) {
  if (!container) return;
  initCmsNext(container);
  initScrollToNext(container);
}

export function destroyProject() {
  // Cleanup is handled by addCleanup() registered inside initCmsNext/initScrollToNext.
  // addCleanup callbacks are drained by runCleanups() in leave() before this is called,
  // so this is intentionally empty.
}
