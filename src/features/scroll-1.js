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
    const targets = Array.from(component.querySelectorAll(".scroll-1_target_item"));
    if (!triggers.length || !targets.length) return;

    const stRefs = [];
    let raf1 = 0;
    let raf2 = 0;

    function makeActive(index) {
      for (let i = 0; i < triggers.length; i++) {
        triggers[i].classList.toggle("is-active", i === index);
      }
      for (let i = 0; i < targets.length; i++) {
        targets[i].classList.toggle("is-active", i === index);
      }
    }

    makeActive(0);

    const build = () => {
      for (let i = 0; i < triggers.length; i++) {
        const st = createST({
          trigger: triggers[i],
          start: "top center",
          end: "bottom center",
          onToggle: (self) => {
            if (self.isActive) makeActive(i);
          }
        });
        if (st) stRefs.push(st);
      }

      try { window.ScrollTrigger.refresh(); } catch (_) {}
    };

    // Delay creation until layout has fully settled after Barba/nav/history.
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(build);
    });

    addCleanup(() => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      stRefs.forEach((st) => {
        try { st.kill(); } catch (_) {}
      });
      try { component.removeAttribute("data-scroll-1"); } catch (_) {}
    });
  });
}