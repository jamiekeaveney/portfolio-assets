// src/features/slider.js
import { addCleanup } from "../core/cleanup.js";

const BP = 991;
const cfg = {
  SPEED: 1.75,
  LERP: 0.05,
  MAX_V: 150,
  COPIES: 6,
  DRAG_T: 3,
  CLICK_MS: 400
};

const clamp = (n, a, b) => (n < a ? a : n > b ? b : n);
const now = () => performance.now();

export function initSlider(container) {
  if (!container) return;

  const mq = matchMedia(`(max-width:${BP}px)`);
  if (mq.matches) return; // mobile: do not init

  const slider = container.querySelector(".slider");
  const track = container.querySelector(".slide-track");
  if (!slider || !track) return;

  // Guard: prevent double-init on re-entry
  if (slider.hasAttribute("data-slider-ran")) return;
  slider.setAttribute("data-slider-ran", "");

  // Snapshot original slides BEFORE cloning so we can restore on destroy
  const origSlides = [...track.querySelectorAll(".slide")];
  if (!origSlides.length) return;

  const s = {
    slider,
    track,
    slides: null,
    imgs: null,
    prog: null,
    parallax: 0.2,
    pitch: 0,
    total: origSlides.length,
    x: 0,
    tx: 0,
    drag: false,
    dragged: false,
    start: 0,
    last: 0,
    clickUntil: 0,
    ui: 0,
    rAF: null,
    listeners: [] // { el, event, handler, opts?, isMQ? }
  };

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const cssVarPercent = (root, name) => {
    const raw = getComputedStyle(root).getPropertyValue(name).trim();
    if (!raw) return NaN;
    if (raw.endsWith("%")) {
      const v = parseFloat(raw);
      return Number.isNaN(v) ? NaN : clamp(v / 100, 0, 1);
    }
    const v = parseFloat(raw);
    return Number.isNaN(v) ? NaN : clamp(v, 0, 1);
  };

  const getPitch = () => {
    const el = s.track.querySelectorAll(".slide");
    if (el.length > 1) {
      const a = el[0].getBoundingClientRect(), b = el[1].getBoundingClientRect();
      const p = b.left - a.left;
      if (p > 0) return p;
    }
    const e = el[0]; if (!e) return 0;
    const c = getComputedStyle(e);
    return e.getBoundingClientRect().width + parseFloat(c.marginLeft) + parseFloat(c.marginRight);
  };

  const seq = () => s.pitch * s.total;

  const clearImgStyle = (img) => {
    if (img) img.style.objectPosition = img.style.opacity = img.style.transition = img.style.filter = "";
  };

  const addListener = (el, event, handler, opts) => {
    el.addEventListener(event, handler, opts);
    s.listeners.push({ el, event, handler });
  };

  // ─── Build ───────────────────────────────────────────────────────────────────

  track.style.willChange = "transform";

  const p = cssVarPercent(slider, "--work-page--slider-parallax");
  if (!Number.isNaN(p)) s.parallax = p;

  // Clone slides
  const frag = document.createDocumentFragment();
  for (let i = 0; i < cfg.COPIES - 1; i++) {
    origSlides.forEach((x) => frag.appendChild(x.cloneNode(true)));
  }
  track.appendChild(frag);

  s.slides = [...track.querySelectorAll(".slide")];
  s.imgs = s.slides.map((x) => x.querySelector(".slider-image") || x.querySelector(".slide-image img"));

  track.onclick = (e) => {
    if (s.dragged || now() < s.clickUntil) { e.preventDefault(); return; }
    const link = e.target.closest(".slide")?.querySelector("a[href]");
    if (link) { e.preventDefault(); location.href = link.href; }
  };

  s.pitch = getPitch();
  const startX = -(seq() * 2);
  s.x = s.tx = startX;
  track.style.transform = `translate3d(${startX}px,0,0)`;

  s.prog = container.querySelector("[data-slider-progress]");
  s.ui = 0;

  // ─── RAF Loop ────────────────────────────────────────────────────────────────

  const tick = () => {
    s.x += (s.tx - s.x) * cfg.LERP;

    const len = seq();
    if (s.x > -len) { s.x -= len; s.tx -= len; s.imgs.forEach(clearImgStyle); }
    else if (s.x < -len * 4) { s.x += len; s.tx += len; s.imgs.forEach(clearImgStyle); }
    s.track.style.transform = `translate3d(${s.x}px,0,0)`;

    if (s.parallax) {
      const vp = innerWidth / 2, half = s.parallax * 100 / 2;
      for (let i = 0; i < s.slides.length; i++) {
        const img = s.imgs[i]; if (!img) continue;
        const r = s.slides[i].getBoundingClientRect();
        if (r.right < -500 || r.left > innerWidth + 500) continue;
        const n = clamp(((r.left + r.width / 2) - vp) / Math.max(1, vp), -1, 1);
        img.style.objectPosition = (50 - n * half) + "% 50%";
      }
    }

    if (s.prog && !mq.matches && s.total && s.pitch) {
      let t = (-s.x) % len; if (t < 0) t += len;
      const pct = (t / len) * 100;
      s.ui += (pct - s.ui) * 0.2;
      const n = Math.round(clamp(s.ui, 0, 100)).toString().padStart(2, "0");
      if (s.prog.textContent !== n) s.prog.textContent = n;
    }

    s.rAF = requestAnimationFrame(tick);
  };

  s.rAF = requestAnimationFrame(tick);

  // ─── Event Bindings ──────────────────────────────────────────────────────────

  addListener(slider, "wheel", (e) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    s.tx -= clamp(e.deltaY * cfg.SPEED, -cfg.MAX_V, cfg.MAX_V);
  }, { passive: false });

  addListener(slider, "pointerdown", (e) => {
    if (e.pointerType === "mouse") e.preventDefault();
    s.drag = true; s.start = s.last = e.clientX; s.dragged = false;
    s.track.classList.add("dragging");
  });

  addListener(slider, "pointermove", (e) => {
    if (!s.drag) return;
    s.tx += (e.clientX - s.last) * 2; s.last = e.clientX;
    s.dragged = Math.abs(e.clientX - s.start) > cfg.DRAG_T;
  });

  const up = () => {
    if (!s.drag) return;
    s.drag = false; s.track.classList.remove("dragging");
    if (s.dragged) s.clickUntil = now() + cfg.CLICK_MS;
    s.dragged = false;
  };
  addListener(slider, "pointerup", up);
  addListener(slider, "pointercancel", up);
  addListener(slider, "pointerleave", up);
  addListener(slider, "dragstart", (e) => e.preventDefault());

  // Resize: recalculate pitch/position — no location.reload()
  let resizeRAF = null;
  addListener(window, "resize", () => {
    if (mq.matches) return;
    cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(() => {
      const oldSeq = seq();
      const t = (s.x + oldSeq * 2) / oldSeq;
      s.pitch = getPitch();
      const newSeq = seq();
      s.x = s.tx = -(newSeq * 2) + t * newSeq;
      s.track.style.transform = `translate3d(${s.x}px,0,0)`;
    });
  });

  // Breakpoint change: pause/resume instead of location.reload()
  const mqHandler = () => {
    if (mq.matches) {
      cancelAnimationFrame(s.rAF);
      s.rAF = null;
    } else if (!s.rAF) {
      s.rAF = requestAnimationFrame(tick);
    }
  };
  mq.addEventListener("change", mqHandler);
  s.listeners.push({ el: mq, event: "change", handler: mqHandler, isMQ: true });

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  addCleanup(() => {
    cancelAnimationFrame(s.rAF);
    cancelAnimationFrame(resizeRAF);
    s.rAF = null;

    s.listeners.forEach(({ el, event, handler, isMQ }) => {
      if (isMQ) el.removeEventListener("change", handler);
      else el.removeEventListener(event, handler);
    });
    s.listeners.length = 0;

    track.onclick = null;

    // Intentionally do NOT restore the original DOM here.
    // Barba replaces the entire container on navigation, so removing clones
    // and re-inserting origSlides is unnecessary — and is exactly what causes
    // the slider to visually "die" (snap to N slides) during the leave animation.
    // The track.style.transform remains set, keeping the slider frozen in place
    // through the leave animation. Barba removes the container when done.

    slider.removeAttribute("data-slider-ran");
  });
}
