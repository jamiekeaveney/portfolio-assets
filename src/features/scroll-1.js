// src/features/scroll-1.js
import { addCleanup } from "../core/cleanup.js";
import { createST } from "../core/scrolltrigger.js";

export function initScroll1(container) {
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

    // Set item 0 active immediately so the UI looks correct from the first frame.
    makeActive(0);

    // Create scroll triggers immediately — the container is untransformed at
    // scroll=0 when initScroll1 runs, so all positions are correct.
    // The previous onPostTransition deferral was required when the container had
    // a CSS transform applied during the enter animation (giving wrong trigger
    // positions). The fixed-wrapper animation strategy keeps the container
    // untransformed, so immediate creation is safe on both first load and navigation.
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

    addCleanup(() => {
      try { component.removeAttribute("data-scroll-1"); } catch (_) {}
    });
  });
}
