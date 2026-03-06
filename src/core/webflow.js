/** Sync <html data-wf-page="..."> to the incoming page so Webflow IX2 doesn't get confused */
export function syncWebflowPageIdFromNextHtml(nextHtml) {
  if (!nextHtml) return;
  try {
    const parsed = new DOMParser().parseFromString(nextHtml, "text/html");
    const nextPageId = parsed.documentElement.getAttribute("data-wf-page");
    if (nextPageId) document.documentElement.setAttribute("data-wf-page", nextPageId);
  } catch (_) {}
}

/** Restore Webflow's .w--current on nav links (Barba breaks the native behaviour).
 *  @param {string} [overridePath] - Use this path instead of window.location.pathname
 *    (pass data.next.url.path from a before() hook for immediate update). */
export function resetWCurrent(overridePath) {
  document.querySelectorAll(".w--current").forEach((el) => el.classList.remove("w--current"));

  const path = (overridePath || window.location.pathname).replace(/\/$/, "");
  document.querySelectorAll("a[href]").forEach((a) => {
    try {
      const url = new URL(a.getAttribute("href"), window.location.origin);
      const hrefPath = url.pathname.replace(/\/$/, "");
      if (hrefPath === path) a.classList.add("w--current");
    } catch (_) {}
  });
}

/**
 * Phase 1 of Webflow reinit: destroy all Webflow modules and re-apply IX2
 * initial states WITHOUT calling Webflow.ready().
 *
 * Why split? Webflow.ready() synchronously fires CMS callbacks that restore
 * filtered CMS lists (undoing initCmsNext's work). Calling it before
 * flushPostTransition() means waitOne() sees multiple items and never creates
 * the pin trigger. Calling it AFTER flushPostTransition() is safe because the
 * pin trigger is already created and pointing to the correct item.
 */
export function destroyAndInitIX2() {
  if (!window.Webflow) return;
  try { window.Webflow.destroy(); } catch (_) {}
  try { window.Webflow.require("ix2")?.init?.(); } catch (_) {}
  try { document.dispatchEvent(new Event("readystatechange")); } catch (_) {}
}

/**
 * Phase 2 of Webflow reinit: fire Webflow.ready() callbacks.
 * Reinitialises Webflow UI components (tabs, sliders, dropdowns, CMS sort/filter).
 * Call this AFTER flushPostTransition() so CMS restoration doesn't race with
 * waitOne() in initProjectNextPin.
 */
export function readyWebflow() {
  if (!window.Webflow) return;
  try { window.Webflow.ready(); } catch (_) {}
}

/**
 * Full Webflow reinit in one call (destroy → ready → ix2.init).
 * Safe for panel-nav afterEnter() where initContainer runs AFTER this call,
 * so initCmsNext always sees the current URL and re-filters cleanly.
 * Do NOT use in slide/p2p enter() — use destroyAndInitIX2 + readyWebflow
 * with flushPostTransition sandwiched between them.
 */
export function reinitWebflowIX2() {
  if (!window.Webflow) return;

  try { window.Webflow.destroy(); } catch (_) {}
  try { window.Webflow.ready(); } catch (_) {}

  try {
    const ix2 = window.Webflow.require("ix2");
    if (ix2 && ix2.init) ix2.init();
  } catch (_) {}

  // Some scripts listen to this in the wild; harmless.
  try { document.dispatchEvent(new Event("readystatechange")); } catch (_) {}
}
