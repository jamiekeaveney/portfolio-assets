import { initHome, destroyHome } from "./home.js";
import { initAbout, destroyAbout } from "./about.js";
import { initApproach, destroyApproach } from "./approach.js";
import { initWork, destroyWork } from "./work.js";
import { initProject, destroyProject } from "./project.js";

const pages = {
  home: { init: initHome, destroy: destroyHome },
  about: { init: initAbout, destroy: destroyAbout },
  approach: { init: initApproach, destroy: destroyApproach },
  work: { init: initWork, destroy: destroyWork },
  project: { init: initProject, destroy: destroyProject }
};

export function initPage(namespace, container, ctx) {
  const p = pages[namespace];
  if (p && typeof p.init === "function") {
    return p.init(container, ctx); // IMPORTANT: return the promise
  }
  return Promise.resolve();
}

export function destroyPage(namespace) {
  const p = pages[namespace];
  if (p && typeof p.destroy === "function") p.destroy();
}