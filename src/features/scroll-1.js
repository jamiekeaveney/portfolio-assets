// src/features/scroll-1.js
import { addCleanup } from "../core/cleanup.js";
import { createST } from "../core/scrolltrigger.js";

export function initScroll1(container, ctx) {
  if (!container) return;
  if (!window.gsap || !window.ScrollTrigger) return;

  window.gsap.registerPlugin(window.ScrollTrigger);

  const components = container.querySelectorAll(".scroll-1_component");
  if (!components.length) return;

  components.forEach((component) => {
    if (component.hasAttribute("data-scroll-1")) return;
    component.setAttribute("data-scroll-1", "");

    const triggers = Array.from(component.querySelectorAll(".scroll-1_trigger_item"));
    const targets  = Array.from(component.querySelectorAll(".scroll-1_target_item"));
    if (!triggers.length || !targets.length) return;

    function makeActive(index) {
      for (let i = 0; i < triggers.length; i++) {
        triggers[i].classList.toggle("is-active", i === index);
      }
      for (let i = 0; i < targets.length; i++) {
        targets[i].classList.toggle("is-active", i === index);
      }
    }

    // Always set item 0 active immediately so the UI looks correct during
    // the enter animation, regardless of whether ST creation is deferred.
    makeActive(0);

    function createTriggers() {
      for (let i = 0; i < triggers.length; i++) {
        createST({
          trigger: triggers[i],
          start: "top center",
          end: "bottom center",
          onToggle: (self) => {
            if (self.isActive) makeActive(i);
          },
        });
      }
    }

    if (ctx && typeof ctx.onPostTransition === "function") {
      // Defer ST creation until after the transition completes and IX2 has
      // settled the layout. Creating STs during the 1.5s enter animation
      // gives wrong trigger positions — onToggle never fires past item 0.
      ctx.onPostTransition(createTriggers);
    } else {
      // First load (once()) path — layout is already settled, create immediately.
      createTriggers();
    }

    // view-level cleanup
    addCleanup(() => {
      try { component.removeAttribute("data-scroll-1"); } catch (_) {}
    });
  });
}
