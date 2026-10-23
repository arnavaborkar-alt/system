/* ============================================================
   FX — small bits of visual feedback.
   Everything here is cosmetic, skips itself with reduced-motion
   or when switched off in Settings, and never blocks a tap.
   ============================================================ */
let on = () => true;
let buzz = () => true;
export function configure({ enabled, haptics }) { on = enabled; buzz = haptics; }

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const ok = () => on() && !reduced();

let layer;
function host() {
  if (!layer || !layer.isConnected) {
    layer = document.createElement('div');
    layer.className = 'fx-layer';
    document.body.appendChild(layer);
  }
  return layer;
}
const kill = (el, ms) => setTimeout(() => el.remove(), ms);

/** Where an element sits on screen, for anchoring effects to the thing you tapped. */
export function anchor(el) {
  if (!el?.getBoundingClientRect) return { x: innerWidth / 2, y: innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function haptic(kind = 'tap') {
  if (!buzz() || reduced() || !navigator.vibrate) return;
  try { navigator.vibrate(kind === 'big' ? [18, 40, 28, 40, 60] : kind === 'good' ? [14, 30, 22] : 10); } catch { /* ignore */ }
}

/** "+45g" floating up from a point. */
export function floatText(x, y, text, kind = 'gold') {
  if (!ok()) return;
  const el = document.createElement('div');
  el.className = `fx-float ${kind}`;
  el.textContent = text;
  el.style.left = `${x}px`; el.style.top = `${y}px`;
  host().appendChild(el);
  kill(el, 1300);
}

/** A ring plus a spray of dots. */
export function burst(x, y, { color = 'var(--mana)', count = 14, big = false } = {}) {
  if (!ok()) return;
  const h = host();
  const ring = document.createElement('div');
  ring.className = 'fx-ring';
  ring.style.cssText = `left:${x}px;top:${y}px;--c:${color}`;
  h.appendChild(ring); kill(ring, 700);
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.className = 'fx-dot';
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const d = (big ? 90 : 52) + Math.random() * (big ? 90 : 46);
    p.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 14}px;--c:${color};--s:${3 + Math.random() * 4}px`;
    h.appendChild(p); kill(p, 900);
  }
}

/** Gold coins falling from the top, for claims and big unlocks. */
export function coinShower(n = 22) {
  if (!ok()) return;
  const h = host();
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.className = 'fx-coin';
    c.style.cssText = `left:${6 + Math.random() * 88}%;--delay:${Math.random() * 0.35}s;--dur:${1 + Math.random() * 0.8}s;--rot:${(Math.random() - 0.5) * 540}deg`;
    h.appendChild(c); kill(c, 2400);
  }
}

/** Counts a number up inside `el` (formats with thousands separators). */
export function countUp(el, from, to, ms = 650, suffix = '') {
  if (!el) return;
  const fmt = (v) => Math.round(v).toLocaleString() + suffix;
  if (!ok() || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1 && el.isConnected) requestAnimationFrame(step); else el.textContent = fmt(to);
  };
  requestAnimationFrame(step);
}

/** Quick flash on an element, e.g. a card that just paid out. */
export function pulse(el) {
  if (!el || !ok()) return;
  el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
}
