import { stopLenis, startLenis } from "../core/lenis.js";

const FADE_DURATION = 0.25;

function seq() {
  const j = (b, r) => b + Math.floor(Math.random() * r * 2) - r;
  return [0, j(24, 8), j(72, 8), 100];
}

function dom() {
  const w = document.querySelector('[data-loader="wrap"]');
  if (!w) return null;
  const $ = (s) => w.querySelector(s);
  return {
    wrap: w, panel: $(".loader-panel"), bar: $("[data-loader-bar]"),
    spinner: $("[data-loader-spinner]"),
    progress: $("[data-loader-progress]"), block: $("[data-loader-block]"),
    top: $("[data-loader-top]"), bot: $("[data-loader-bot]"),
  };
}

function mkDigs(n) {
  const s = n < 10 ? "0" + n : String(n);
  return s.split("").concat("%").map((c, i) =>
    `<span class="loader-digit" style="--d:${i}">${c}</span>`
  ).join("");
}

function onLast(el, sel) {
  return new Promise((res) => {
    const items = el.querySelectorAll(sel);
    if (!items.length) return res();
    const l = items[items.length - 1];
    l.addEventListener("animationend", function h() {
      l.removeEventListener("animationend", h);
      res();
    });
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function posY(e, pct) {
  const pad = parseFloat(getComputedStyle(e.panel).paddingTop) || 40;
  const bh = e.block.getBoundingClientRect().height;
  const total = Math.max(0, innerHeight - pad * 2 - bh);
  e.block.style.transform = `translate3d(0,${-(total * pct / 100)}px,0)`;
}

async function flipNum(e, val) {
  e.bot.innerHTML = mkDigs(val);
  e.block.classList.add("is-flipping");
  posY(e, val);
  e.bar.style.width = val + "%";
  await onLast(e.bot, ".loader-digit");
  e.top.innerHTML = mkDigs(val);
  e.bot.innerHTML = "";
  e.block.classList.remove("is-flipping");
}

async function exitNum(e) {
  e.block.classList.add("is-exiting");
  await onLast(e.top, ".loader-digit");
  e.top.innerHTML = "";
  e.block.classList.remove("is-exiting");
}

export function loaderShow() {
  const e = dom();
  if (!e) return Promise.resolve();

  stopLenis();
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";

  const g = window.gsap;
  e.top.innerHTML = mkDigs(0);
  e.bot.innerHTML = "";
  e.bar.style.width = "0%";

  if (!g) {
    Object.assign(e.wrap.style, {
      display: "block",
      pointerEvents: "auto",
      opacity: "1"
    });
    posY(e, 0);
    return Promise.resolve();
  }

  g.killTweensOf(e.wrap);
  g.set(e.wrap, { display: "block", pointerEvents: "auto", autoAlpha: 1 });

  e.block.style.transition = "none";
  e.bar.style.transition = "none";
  posY(e, 0);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      e.block.style.transition = "";
      e.bar.style.transition = "";
    });
  });

  return Promise.resolve();
}

export function loaderHide() {
  const e = dom();

  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
  startLenis();

  if (!e) return Promise.resolve();

  const g = window.gsap;
  if (!g) {
    e.wrap.style.cssText = "display:none;pointer-events:none;opacity:0";
    return Promise.resolve();
  }

  g.set(e.wrap, { display: "none", pointerEvents: "none", autoAlpha: 0 });
  e.block.style.transition = "";
  e.block.style.transform = "";
  e.bar.style.width = "0%";
  e.block.classList.remove("is-flipping", "is-exiting");
  e.top.innerHTML = "";
  e.bot.innerHTML = "";
  return Promise.resolve();
}

export async function loaderProgressTo({ onRevealStart } = {}) {
  const e = dom();
  if (!e) return;

  const g = window.gsap;
  const steps = seq();
  if (!g) {
    e.top.innerHTML = mkDigs(100);
    posY(e, 100);
    return;
  }

  await wait(300);
  await flipNum(e, steps[1]);
  await wait(20);
  await flipNum(e, steps[2]);
  await wait(20);
  await flipNum(e, 100);

  if (typeof onRevealStart === "function") onRevealStart();

  g.to(e.wrap, { autoAlpha: 0, duration: FADE_DURATION, ease: "power2.out" });
  await exitNum(e);
}

export function loaderOutro() {
  const e = dom();
  if (!e) return Promise.resolve();

  const g = window.gsap;
  if (!g) return new Promise((r) => setTimeout(r, FADE_DURATION * 1000));

  const current = parseFloat(getComputedStyle(e.wrap).opacity);
  if (current <= 0.01) return Promise.resolve();

  return g.to(e.wrap, {
    autoAlpha: 0,
    duration: 0.15,
    ease: "power1.out"
  }).then(() => {});
}

export async function runLoader(duration = 5.0, _container = document, opts = {}) {
  await loaderShow();
  await loaderProgressTo(opts);
  await loaderOutro();
  await loaderHide();
}

let _raf = null;
addEventListener("resize", () => {
  const e = dom();
  if (!e?.wrap || e.wrap.style.display === "none") return;
  if (_raf) cancelAnimationFrame(_raf);
  _raf = requestAnimationFrame(() => {
    const n = parseInt(e.top.textContent) || 0;
    e.block.style.transition = "none";
    posY(e, n);
    requestAnimationFrame(() => {
      e.block.style.transition = "";
    });
  });
});