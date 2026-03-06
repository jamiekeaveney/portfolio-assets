// src/pages/project.js
// Project Template page orchestrator.
//
// SETUP IN WEBFLOW DESIGNER:
//   On the Project Template page body/wrapper element:
//     data-barba="container"
//     data-barba-namespace="project"
//
// CMS reduction and pin logic live in their own feature files.
// This file only wires them together and handles the ctx.onPostTransition
// deferral required for pin-spacer measurement.

import { initCmsNext }        from "../features/cms-next.js";
import { initProjectNextPin } from "../features/project-next-pin.js";

// ─── Public exports ──────────────────────────────────────────────────────────

export function initProject(container, ctx = {}) {
  if (!container) return;

  // CMS reduction runs immediately — it only mutates the DOM and does not
  // depend on layout being fully settled.
  initCmsNext(container);

  // The pin trigger creates a ScrollTrigger that measures pin-spacer height.
  // That measurement is only correct when there are no ancestor transforms
  // on the container (the slide transition's y:"100vh" from() has cleared by
  // the time enter() calls initContainer, so it is safe for slide).
  //
  // For the project → project transition, initContainer is called BEFORE the
  // handoff animation; postTransition callbacks fire AFTER it. Deferring to
  // onPostTransition guarantees transforms and overlay clones are gone before
  // the pin spacer is measured.
  //
  // On first load (ctx.isFirstLoad) and for any path that lacks
  // onPostTransition, initialise immediately.
  if (typeof ctx.onPostTransition === "function") {
    ctx.onPostTransition(() => initProjectNextPin(container));
  } else {
    initProjectNextPin(container);
  }
}

export function destroyProject() {
  // Cleanups registered via addCleanup() inside initCmsNext / initProjectNextPin
  // are drained by runCleanups() in barba leave() before this is called.
  // Nothing extra needed here.
}
