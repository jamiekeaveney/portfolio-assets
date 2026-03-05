// src/core/nav.js
import { stopLenis, startLenis } from "./lenis.js";

let _initialized = false;
let _fromPanel = false;

export function isFromPanel() {
  return _fromPanel;
}

export function clearFromPanel() {
  _fromPanel = false;
}

function _unlockScroll() {
  document.documentElement.style.overflow = "";
  startLenis();
}

// closeNav() is also called programmatically (e.g. from Barba leave()).
// Setting checkbox.checked programmatically does NOT fire the change event,
// so we release the scroll lock here explicitly.
export function closeNav() {
  var checkbox = document.getElementById("nav-toggle");
  if (checkbox && checkbox.checked) {
    checkbox.checked = false;
    _unlockScroll();
  }
}

export function initNav() {
  if (_initialized) return;
  _initialized = true;

  // Mobile menu scroll lock — driven by the #nav-toggle checkbox.
  // overflow:hidden prevents native touch-scroll on iOS bypassing Lenis.stop().
  var toggle = document.getElementById("nav-toggle");
  if (toggle) {
    toggle.addEventListener("change", function () {
      if (this.checked) {
        stopLenis();
        document.documentElement.style.overflow = "hidden";
      } else {
        _unlockScroll();
      }
    });
  }

  var links = document.querySelectorAll(".nav__panel-link");
  for (var i = 0; i < links.length; i++) {
    links[i].addEventListener("click", function () {
      _fromPanel = true;
      closeNav();
    });
  }
}