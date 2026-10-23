/* ============================================================
   ICONS — one consistent stroke set, drawn on a 24px grid.
   Replaces the unicode glyphs, which look different on every device.
   ============================================================ */
const P = {
  // navigation
  quests: '<path d="M6 3.5h9l3.5 3.5v13.5H6z"/><path d="M9.5 11h5M9.5 15h5"/>',
  month: '<rect x="4" y="5.5" width="16" height="14.5" rx="1.5"/><path d="M4 10h16M9 3.5v4M15 3.5v4"/>',
  gym: '<path d="M3 9.5v5M6.5 7v10M17.5 7v10M21 9.5v5M6.5 12h11"/>',
  habits: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  shop: '<path d="M5.5 8.5h13l-1 11.5h-11z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
  hunter: '<path d="M12 3l7.5 3v5.5c0 4.4-3.1 7.8-7.5 9.5-4.4-1.7-7.5-5.1-7.5-9.5V6z"/><path d="M12 8.5l1.3 2.6 2.8.4-2 2 .5 2.8-2.6-1.4-2.6 1.4.5-2.8-2-2 2.8-.4z"/>',
  system: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',

  // currency + status
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v10M9.5 9.8c.3-.9 1.3-1.5 2.5-1.5 1.5 0 2.6.7 2.6 1.8s-1 1.5-2.6 1.9-2.6.8-2.6 1.9 1.1 1.8 2.6 1.8c1.2 0 2.200-.6 2.500-1.500"/>',
  bolt: '<path d="M13.5 3L5.5 13.5H11L10 21l8.500-10.500H13z"/>',
  check: '<path d="M5 12.5l4.500 4.500L19 7.500"/>',
  lock: '<rect x="6" y="11" width="12" height="9" rx="1.500"/><path d="M9 11V8a3 3 0 0 1 6 0v3"/>',
  star: '<path d="M12 3.500l2.600 5.400 5.900.8-4.300 4.100 1 5.900-5.200-2.800-5.200 2.800 1-5.900-4.300-4.100 5.900-.8z"/>',
  flame: '<path d="M12 3c.8 3.200 5.500 5 5.500 10a5.500 5.500 0 0 1-11 0c0-2.200 1-3.500 2.200-4.500.2 1.800 1 2.700 2 2.800C10.200 8.500 10.500 5.500 12 3z"/>',
  trophy: '<path d="M8 4h8v5.500a4 4 0 0 1-8 0z"/><path d="M8 6H4.500v1A3.500 3.500 0 0 0 8 10.500M16 6h3.500v1a3.500 3.500 0 0 1-3.500 3.500M12 13.500V17M8.500 20.500h7M10 17h4"/>',
  clock: '<circle cx="12" cy="12" r="8.500"/><path d="M12 7.500v5l3 1.600"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M12 9v11M4 13.500h16M12 9C9.500 9 8 7.800 8 6.500S10.500 5 12 9c1.500-4 4-3.500 4-2.500S14.500 9 12 9z"/>',
  moon: '<path d="M19.500 14.500A8 8 0 0 1 9.500 4.500a8 8 0 1 0 10 10z"/>',
  pad: '<rect x="3" y="8" width="18" height="9.500" rx="4"/><path d="M8 10.500v4M6 12.500h4M15.500 11.500h.01M17.500 13.500h.01"/>',
  fork: '<path d="M7 3.500v7a2 2 0 0 0 2 2v8M7 3.500v5M11 3.500v5M16.500 20.500V3.500c-2 1.500-3 4-3 7h3"/>',
  film: '<rect x="3.500" y="5" width="17" height="14" rx="1.500"/><path d="M8 5v14M16 5v14M3.500 9.500H8M3.500 14.500H8M16 9.500h4.500M16 14.500h4.500"/>',
  bed: '<path d="M3.500 18.500v-11M3.500 14.500h17v4M20.500 14.500v-2.500a2.500 2.500 0 0 0-2.500-2.500h-7v5"/><circle cx="7" cy="11.500" r="1.500"/>',
  sparkle: '<path d="M12 3.500l1.800 5.200 5.200 1.800-5.200 1.800-1.800 5.200-1.800-5.200L5 10.500l5.200-1.800z"/><path d="M18.500 3.500v3M17 5h3"/>',
  reroll: '<path d="M19.500 8.500A8 8 0 0 0 5 9M4.500 5v4h4M4.500 15.500A8 8 0 0 0 19 15M19.500 19v-4h-4"/>',
  skip: '<path d="M5 6l8 6-8 6zM15.500 6v12M19 6v12"/>',
  shield: '<path d="M12 3l7 2.800v5.700c0 4.200-2.900 7.400-7 9-4.100-1.600-7-4.800-7-9V5.800z"/><path d="M9 12l2.200 2.200L15.500 10"/>',
  flag: '<path d="M5.500 20.500v-17M5.500 4.500h11l-2 4 2 4h-11"/>',
  gem: '<path d="M7 4.500h10l4 5-9 10.500L3 9.500z"/><path d="M3 9.500h18M9.500 4.500L8 9.500l4 10.500 4-10.500-1.500-5"/>',
  sword: '<path d="M14.500 4.500h5v5L10 19l-5-5zM8.500 15.500L5 19M4 17.500l2.500 2.500"/>',
  crown: '<path d="M4 17.500l-1-9 5 3.500L12 6l4 6 5-3.500-1 9z"/><path d="M4.500 20.500h15"/>',
  target: '<circle cx="12" cy="12" r="8.500"/><circle cx="12" cy="12" r="4.500"/><circle cx="12" cy="12" r=".8"/>',
  heart: '<path d="M12 20s-7.500-4.500-7.500-10A4.200 4.200 0 0 1 12 7.500 4.200 4.200 0 0 1 19.500 10c0 5.500-7.500 10-7.500 10z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="M9 5.500l6.500 6.500L9 18.500"/>',
  dumbbell: '<path d="M3 9.500v5M6.500 7v10M17.500 7v10M21 9.500v5M6.500 12h11"/>',
  calendar: '<rect x="4" y="5.500" width="16" height="14.500" rx="1.500"/><path d="M4 10h16M9 3.500v4M15 3.500v4"/>',
  scroll: '<path d="M6 3.500h9l3.500 3.500v13.500H6z"/><path d="M9.500 11h5M9.500 15h5"/>',
  bag: '<path d="M5.500 8.500h13l-1 11.500h-11z"/><path d="M9 8.500V7a3 3 0 0 1 6 0v1.500"/>',
  eye: '<path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12z"/><circle cx="12" cy="12" r="2.800"/>',
  fist: '<path d="M7 11.500V8a1.500 1.500 0 0 1 3 0v-1a1.500 1.500 0 0 1 3 0v1a1.500 1.500 0 0 1 3 0v6.500c0 3-2 5-5 5s-5-2-5-5z"/>',
  cart: '<path d="M3.500 4.500h2.500l2 11h9.500l2-8H7"/><circle cx="9.500" cy="19" r="1.200"/><circle cx="16.500" cy="19" r="1.200"/>',
};

/** Inline SVG. `name` falls back to plain text, so shop items you made yourself
 *  with a typed-in symbol keep showing it. */
export function icon(name, size = 20, cls = '') {
  const body = P[name];
  if (!body) return `<span class="ic-txt ${cls}" style="font-size:${Math.round(size * 0.9)}px">${name ? String(name).replace(/[<>&]/g, '') : ''}</span>`;
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const hasIcon = (name) => Object.prototype.hasOwnProperty.call(P, name);
