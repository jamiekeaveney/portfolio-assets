// src/pages/project.js
// CMS Project Template page — handles "CMS next" display logic
// and the scroll-to-next-project ScrollTrigger.
//
// SETUP in Webflow Designer:
//   On the Project Template page body/wrapper:
//     data-barba="container"
//     data-barba-namespace="project"
//
// HOW TO ADD YOUR SCRIPTS:
//   Replace the PLACEHOLDER comments below with the body of your existing
//   DOMContentLoaded scripts. Do NOT wrap them in any event listener —
//   just call the logic directly. Use `container` instead of `document`
//   for all querySelectorAll/querySelector calls where possible.
//   The gsap.matchMedia() pattern is kept as-is since it already handles
//   its own cleanup correctly via the returned cleanup function.

import { addCleanup } from "../core/cleanup.js";

export function initProject(container, ctx) {
  if (!container) return;

  // ── CMS Next / Prev item display ────────────────────────────────────────────
  // PLACEHOLDER: paste the body of your first DOMContentLoaded here.
  // Replace:
  //   document.addEventListener("DOMContentLoaded", () => { ... });
  // With the raw content of the callback, e.g.:
  //
  //   const mm = window.gsap?.matchMedia();
  //   if (!mm) return;
  //   mm.add("(min-width: 992px)", () => {
  //     // ... your CMS next logic ...
  //     return () => { /* cleanup */ };
  //   });
  //   addCleanup(() => mm.revert());
  //
  // Important: store the mm instance per-call so revert() only affects this page.

  // ── Scroll-to-next-project ──────────────────────────────────────────────────
  // PLACEHOLDER: paste the body of your second DOMContentLoaded here.
  // Replace:
  //   document.addEventListener("DOMContentLoaded", () => { ... });
  // With:
  //
  //   const mm2 = window.gsap?.matchMedia();
  //   if (!mm2) return;
  //   mm2.add("(min-width: 992px)", () => {
  //     // ... your scroll-to-next logic ...
  //     // IMPORTANT: replace `location.href = href` with:
  //     //   window._bypassBarba = true;
  //     //   location.href = href;
  //     // (see Request 5 notes)
  //     //
  //     // IMPORTANT: remove these two lines — they're already handled globally:
  //     //   window.lenis?.on?.("scroll", ScrollTrigger.update);
  //     //   requestAnimationFrame(ScrollTrigger.refresh);
  //     //
  //     return () => { /* existing cleanup — kills tween.scrollTrigger, tween, etc. */ };
  //   });
  //   addCleanup(() => mm2.revert());
}

export function destroyProject() {
  // All cleanup is registered via addCleanup() inside initProject().
  // This is intentionally empty — Barba calls destroyPage() before runCleanups().
}
