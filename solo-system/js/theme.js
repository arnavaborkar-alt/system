/* ============================================================
   THEME — colour presets and the Customize options.
   Sets CSS variables on <html>, so it works before anything renders.
   ============================================================ */
export const THEMES = {
  system:  { name: 'System',  mana: '#38BDF8', glow: '#9BDCFF', deep: '#1B6FA8', line: '#1B2C55', hot: '#2C4E8F', void: '#04070F', hi: '#0F1B38', lo: '#070C1A', sub: '#A78BFA' },
  monarch: { name: 'Monarch', mana: '#A78BFA', glow: '#DDD0FF', deep: '#6D3FB5', line: '#2A1F52', hot: '#4B3A93', void: '#06040F', hi: '#1A1236', lo: '#0B0818', sub: '#38BDF8' },
  crimson: { name: 'Crimson', mana: '#FB5E7E', glow: '#FFB3C2', deep: '#A8284A', line: '#3A1424', hot: '#7A2A47', void: '#0D0508', hi: '#2A0F1B', lo: '#14080D', sub: '#F5C542' },
  emerald: { name: 'Emerald', mana: '#34D399', glow: '#A7F3D0', deep: '#0F7A57', line: '#12352B', hot: '#1F6B53', void: '#03100C', hi: '#0B2A21', lo: '#06150F', sub: '#38BDF8' },
  ember:   { name: 'Ember',   mana: '#FB923C', glow: '#FFD2A8', deep: '#B45309', line: '#3A2210', hot: '#7A4A1F', void: '#0E0804', hi: '#2A190B', lo: '#140C06', sub: '#FB5E7E' },
  frost:   { name: 'Frost',   mana: '#94A3B8', glow: '#E2E8F0', deep: '#475569', line: '#243040', hot: '#475569', void: '#05070A', hi: '#151C28', lo: '#0A0E14', sub: '#38BDF8' },
};

export const DEFAULT_LOOK = {
  theme: 'system',   // a THEMES key, or 'custom'
  accent: '#38BDF8', // used when theme is 'custom'
  corners: 'cut',    // cut | round | square
  density: 'comfy',  // comfy | compact
  scale: 1,          // text/UI size
  haze: true,        // glow in the background
  grid: true,        // faint grid in the background
  font: 'hunter',    // hunter | clean | mono
};

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `${n >> 16}, ${(n >> 8) & 255}, ${n & 255}`; };
const mix = (a, b, t) => {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const c = (s) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
};
const validHex = (v) => /^#[0-9a-fA-F]{6}$/.test(v || '');

/** Builds a full palette from one accent colour. */
function fromAccent(accent) {
  const void_ = mix('#04070F', accent, 0.05);
  return {
    mana: accent, glow: mix(accent, '#FFFFFF', 0.58), deep: mix(accent, '#000000', 0.45),
    line: mix(void_, accent, 0.24), hot: mix(void_, accent, 0.42), void: void_,
    hi: mix(void_, accent, 0.18), lo: mix(void_, accent, 0.07), sub: mix(accent, '#FFFFFF', 0.2),
  };
}

export function paletteFor(look) {
  if (look.theme === 'custom') return fromAccent(validHex(look.accent) ? look.accent : DEFAULT_LOOK.accent);
  return THEMES[look.theme] || THEMES.system;
}

export function applyLook(raw) {
  const look = { ...DEFAULT_LOOK, ...(raw || {}) };
  const p = paletteFor(look);
  const root = document.documentElement;
  const set = (k, v) => root.style.setProperty(k, v);
  set('--mana', p.mana); set('--glow', p.glow); set('--mana-deep', p.deep);
  set('--line', p.line); set('--line-hot', p.hot);
  set('--void', p.void); set('--deep', p.lo); set('--panel', p.lo); set('--panel-hi', p.hi);
  set('--rune', p.sub);
  set('--mana-rgb', rgb(p.mana)); set('--glow-rgb', rgb(p.glow)); set('--line-rgb', rgb(p.hot));
  set('--trk-rgb', rgb(mix(p.line, p.void, 0.25))); set('--void-rgb', rgb(p.void));
  set('--hi-rgb', rgb(p.hi)); set('--lo-rgb', rgb(p.lo));
  set('--haze-rgb', rgb(p.mana));
  set('--ui-scale', String(Math.max(0.85, Math.min(1.3, Number(look.scale) || 1))));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', p.void);

  const cl = document.body.classList;
  ['cut', 'round', 'square'].forEach((c) => cl.toggle(`corners-${c}`, look.corners === c));
  cl.toggle('dens-compact', look.density === 'compact');
  cl.toggle('no-haze', !look.haze);
  cl.toggle('no-grid', !look.grid);
  ['hunter', 'clean', 'mono'].forEach((f) => cl.toggle(`font-${f}`, look.font === f));
  return look;
}

/** Applies the look stored on this device before the app has even loaded. */
export function applyStoredLook() {
  try { applyLook(JSON.parse(localStorage.getItem('solo-system-v1'))?.settings?.look); } catch { applyLook(null); }
}
