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
 * Re-init Webflow + IX2 after Barba swaps containers.
 * Note: this assumes you're on a published Webflow site (Webflow global exists).
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
