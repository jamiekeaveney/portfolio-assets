import { initCmsNext } from "../features/cms-next.js";
import { initProjectNextPin } from "../features/project-next-pin.js";

export function initProject(container, ctx = {}) {
  if (!container) return;

  initCmsNext(container, ctx.path || window.location.pathname);

  const bootPin = () => initProjectNextPin(container, ctx);

  if (typeof ctx.onPostTransition === "function") {
    ctx.onPostTransition(bootPin);
  } else {
    bootPin();
  }
}

export function destroyProject() {}