import { addCleanup } from "../core/cleanup.js";

function normalisePath(path) {
  return String(path || "/").replace(/\/$/, "") || "/";
}

function hrefMatchesPath(href, currentPath) {
  if (!href) return false;
  try {
    const url = new URL(href, window.location.origin);
    return normalisePath(url.pathname) === normalisePath(currentPath);
  } catch (_) {
    return false;
  }
}

export function initCmsNext(container, currentPath = window.location.pathname) {
  if (!window.gsap || !window.$) return;

  const mm = window.gsap.matchMedia();

  mm.add("(min-width: 992px)", () => {
    const $components = window.$("[tr-cmsnext-element='component']", container);
    const path = normalisePath(currentPath || window.location.pathname);

    $components.each(function () {
      const $component = window.$(this);
      const $cmsList   = $component.find(".w-dyn-items").first();
      const $cmsItems  = $cmsList.children();
      const $noResult  = $component.find("[tr-cmsnext-element='no-result']");

      if ($component.data("cmsnextOriginal") == null) {
        $component.data("cmsnextOriginal", $cmsList.html());
      }

      let $current;
      $cmsItems.each(function () {
        const $item = window.$(this);
        const $link = $item.find("a[href]").first();
        if (!$link.length) return;
        if (hrefMatchesPath($link.attr("href"), path)) $current = $item;
      });

      if (!$current?.length) {
        $cmsItems.each(function () {
          const $item = window.$(this);
          if ($item.find(".w--current").length) $current = $item;
        });
      }

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
        if (
          !$display?.length &&
          $component.attr("tr-cmsnext-hideempty") === "true"
        ) {
          $component.hide();
        }
      }
    });

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