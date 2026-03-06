// src/features/cms-next.js
// Reduces a Webflow CMS list to show only the next (or previous) project item.
// Extracted from src/pages/project.js — logic is identical, only the module
// boundary has changed.
//
// Supported attributes on [tr-cmsnext-element="component"]:
//   tr-cmsnext-loop="true"       — wrap around at the end/start
//   tr-cmsnext-showprev="true"   — show previous item instead of next
//   tr-cmsnext-showall="true"    — keep all items, just add is-prev/current/next classes
//   tr-cmsnext-hideempty="true"  — hide the component wrapper when no item is found

import { addCleanup } from "../core/cleanup.js";

export function initCmsNext(container) {
  if (!window.gsap || !window.$) return;

  const mm = window.gsap.matchMedia();

  mm.add("(min-width: 992px)", () => {
    const $components = window.$("[tr-cmsnext-element='component']", container);

    $components.each(function () {
      const $component = window.$(this);
      const $cmsList   = $component.find(".w-dyn-items").first();
      const $cmsItems  = $cmsList.children();
      const $noResult  = $component.find("[tr-cmsnext-element='no-result']");

      // Snapshot original HTML once so it can be restored cleanly on mm.revert().
      if ($component.data("cmsnextOriginal") == null) {
        $component.data("cmsnextOriginal", $cmsList.html());
      }

      // Find the current item by looking for Webflow's .w--current link inside.
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

    // Cleanup: restore original CMS HTML so Barba's fresh fetch has correct markup.
    return () => {
      window.$("[tr-cmsnext-element='component']", container).each(function () {
        const $component = window.$(this);
        const $cmsList   = $component.find(".w-dyn-items").first();
        const original   = $component.data("cmsnextOriginal");
        if (original != null) $cmsList.html(original);
        $component.show();
        $component.find("[tr-cmsnext-element='no-result']").hide();
        $cmsList.find(".w-dyn-item").removeClass("is-prev is-current is-next");
      });
    };
  });

  addCleanup(() => mm.revert());
}
