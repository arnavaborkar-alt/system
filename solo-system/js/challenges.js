/* ============================================================
   CHALLENGES — daily, weekly, monthly.
   Targets scale with level, set once when a period starts so the
   goalposts never move mid-week. Progress is DERIVED from your logs,
   so undoing something takes it back automatically.
   ============================================================ */
import { RANKS } from './config.js';
import { todayKey, dateKey, addDays } from './store.js';
import * as E from './engine.js';

export const PERIODS = ['daily', 'weekly', 'monthly'];
export const queue = [];   // feedback events for the UI to flush

/* ---------- period boundaries ---------- */
export function periodKey(p, settings) {
  const t = todayKey(settings);
  if (p === 'daily') return t;
  if (p === 'weekly') return addDays(t, -((new Date(t + 'T12:00:00').getDay() + 6) % 7));   // Monday
  return t.slice(0, 7);
}
export function periodRange(p, key) {
  if (p === 'daily') return [key, key];
  if (p === 'weekly') return [key, addDays(key, 6)];
  const [y, m] = key.split('-').map(Number);
  return [`${key}-01`, `${key}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`];
}
/** ms timestamp when the period ends (respects the day-rollover hour). */
export function periodEndsAt(p, state) {
  const [, end] = periodRange(p, periodKey(p, state.settings));
  const d = new Date(`${addDays(end, 1)}T00:00:00`);
  d.setHours(d.getHours() + (state.settings.dayResetHour ?? 4));
  return d.getTime();
}

const eachDay = (a, b) => { const out = []; for (let k = a, n = 0; k <= b && n < 40; k = addDays(k, 1), n++) out.push(k); return out; };

/* ---------- templates ---------- */
// base = target at level 1 before scaling, cap = hard ceiling, gold/xp = reward before scaling
const TPL = {
  daily: [
    { metric: 'quests', base: 1.6, cap: 8, gold: 25, xp: 15 },
    { metric: 'questsRank', base: 0.9, cap: 4, gold: 35, xp: 22, needLevel: 8 },
    { metric: 'early', base: 0.8, cap: 3, gold: 30, xp: 18, needLevel: 5 },
    { metric: 'habits', base: 3.5, cap: 12, gold: 22, xp: 14 },
    { metric: 'sessions', base: 1, cap: 1, fixed: true, gold: 35, xp: 22, needTraining: true },
    { metric: 'xp', base: 55, cap: 4000, gold: 28, xp: 12 },
  ],
  weekly: [
    { metric: 'quests', base: 7, cap: 40, gold: 120, xp: 70 },
    { metric: 'questsRank', base: 2, cap: 10, gold: 150, xp: 90, needLevel: 8 },
    { metric: 'early', base: 3, cap: 9, gold: 130, xp: 75, needLevel: 5 },
    { metric: 'habits', base: 22, cap: 90, gold: 110, xp: 65 },
    { metric: 'sessions', base: 3, cap: 5, gold: 140, xp: 85, needTraining: true },
    { metric: 'perfect', base: 1.6, cap: 5, gold: 160, xp: 95, needLevel: 6 },
    { metric: 'xp', base: 420, cap: 30000, gold: 120, xp: 60 },
  ],
  monthly: [
    { metric: 'quests', base: 26, cap: 120, gold: 450, xp: 280 },
    { metric: 'questsRank', base: 5, cap: 50, gold: 600, xp: 380, needLevel: 8 },
    { metric: 'early', base: 8, cap: 36, gold: 480, xp: 290, needLevel: 5 },
    { metric: 'habits', base: 90, cap: 400, gold: 420, xp: 260 },
    { metric: 'sessions', base: 11, cap: 24, gold: 520, xp: 320, needTraining: true },
    { metric: 'perfect', base: 5, cap: 20, gold: 600, xp: 380, needLevel: 6 },
    { metric: 'xp', base: 1800, cap: 120000, gold: 450, xp: 240 },
  ],
};

export const rankMinFor = (level) => RANKS[Math.max(0, Math.min(5, Math.floor(level / 20)))];

/** Human label for a challenge. Generated at render time so it can never go stale. */
export function labelOf(c) {
  const n = c.target;
  const s = (w, p) => `${n} ${n === 1 ? w : p}`;
  switch (c.metric) {
    case 'quests': return `Clear ${s('quest', 'quests')}`;
    case 'questsRank': return `Clear ${s(`${c.rankMin}-rank quest`, `${c.rankMin}-rank quests`)}${c.rankMin === 'E' ? '' : ' or higher'}`;
    case 'early': return `Finish ${s('quest', 'quests')} a day early`;
    case 'habits': return `Tick off ${s('habit', 'habits')}`;
    case 'sessions': return n === 1 ? 'Finish your training session' : `Finish ${n} training sessions`;
    case 'perfect': return `Have ${s('perfect day', 'perfect days')}`;
    case 'xp': return `Earn ${n.toLocaleString()} XP`;
    default: return c.metric;
  }
}
export const iconOf = (m) => ({ quests: 'quests', questsRank: 'sword', early: 'clock', habits: 'habits', sessions: 'gym', perfect: 'star', xp: 'bolt' }[m] || 'target');

/* ---------- deterministic randomness ---------- */
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** How much of a thing the period can physically hold, so a target is never impossible. */
function capacity(state, tpl, p, key) {
  const [a, b] = periodRange(p, key);
  const days = eachDay(a, b);
  if (tpl.metric === 'habits') return days.reduce((n, k) => n + E.habitsFor(state, k).length, 0);
  if (tpl.metric === 'sessions') return days.filter((k) => { const pre = E.planForDate(state, k); return !!pre?.exercises?.length && !E.isGymRest(state, k) && !E.isDayOff(state, k); }).length;
  return Infinity;
}

function build(state, p, tpl, level, idx, key) {
  const diff = state.settings.challengeScale ?? 1;
  let target = tpl.fixed ? tpl.base : Math.round(tpl.base * (1 + level * 0.04) * diff);
  const cap = Math.min(tpl.cap, tpl.metric === 'habits' ? Math.floor(capacity(state, tpl, p, key) * 0.85) : capacity(state, tpl, p, key));
  target = Math.max(1, Math.min(cap, target));
  // bigger asks pay more, but never linearly, so easy mode is not a free lunch
  const size = tpl.fixed ? 1 : Math.max(0.8, Math.min(1.6, 0.9 + 0.1 * diff + level * 0.002));
  const gold = Math.round(tpl.gold * (1 + level * 0.015) * size);
  const xp = E.scaleXp(state.settings, tpl.xp * (1 + level * 0.02) * size);
  const c = { id: `${p}${idx}${Date.now().toString(36)}${Math.floor(Math.random() * 99)}`, metric: tpl.metric, target, rewardGold: gold, rewardXp: xp, claimed: false };
  if (tpl.metric === 'questsRank') c.rankMin = rankMinFor(level);
  return c;
}

function eligible(state, p, level, key) {
  return TPL[p].filter((t) => (!t.needLevel || level >= t.needLevel)
    && (!t.needTraining || capacity(state, t, p, key) > 0)
    && (t.metric !== 'habits' || capacity(state, t, p, key) >= 2));
}

function generate(state, p, key, salt = 0) {
  const level = state.level || 1;
  const pool = eligible(state, p, level, key);
  const rand = rng(hash(`${p}:${key}:${salt}:${Math.floor(level / 10)}`));
  const order = pool.map((t) => ({ t, r: rand() })).sort((a, b) => a.r - b.r).map((x) => x.t);
  const items = order.slice(0, 3).map((t, i) => build(state, p, t, level, i, key));
  if (!items.length) return items;
  // keep days off clear of daily asks
  if (p === 'daily' && E.isDayOff(state, key)) return [];
  return items;
}

/* ---------- progress, derived from the logs ---------- */
const RANK_IDX = Object.fromEntries(RANKS.map((r, i) => [r, i]));
const doneDay = (q, settings) => dateKey(new Date(Date.parse(q.doneAt) - (settings.dayResetHour ?? 4) * 3600000));

export function progressOf(state, c, p, key) {
  const [a, b] = periodRange(p, key);
  const s = state.settings;
  const today = todayKey(s);
  if (c.metric === 'quests' || c.metric === 'questsRank' || c.metric === 'early') {
    let n = 0;
    for (const q of Object.values(state.quests)) {
      if (!q.done || !q.doneAt) continue;
      const d = doneDay(q, s);
      if (d < a || d > b) continue;
      if (c.metric === 'quests') n++;
      else if (c.metric === 'questsRank') { if ((RANK_IDX[q.paidRank || E.rankOf(q, s)] ?? 0) >= RANK_IDX[c.rankMin || 'E']) n++; }
      else { const due = q.dueKey || (q.due ? q.due.slice(0, 10) : null); if (due && due > d) n++; }
    }
    return n;
  }
  if (c.metric === 'sessions') return eachDay(a, b).filter((k) => state.gymLog?.[k]?.done).length;
  if (c.metric === 'habits') {
    let n = 0;
    eachDay(a, b).forEach((k) => Object.values(state.habitLog?.[k] || {}).forEach((v) => { if (v !== false && v !== 'skipped') n++; }));
    return n;
  }
  if (c.metric === 'xp') return Math.round(eachDay(a, b).reduce((t, k) => t + (state.xpLog?.[k] || 0), 0));
  if (c.metric === 'perfect') {
    let n = 0;
    eachDay(a, b).forEach((k) => { if (k < today && E.dayStatus(state, k).perfect) n++; });
    return n;
  }
  return 0;
}

export const isDone = (state, c, p, key) => progressOf(state, c, p, key) >= c.target;

/** How many unclaimed finished challenges are waiting. Drives the tab dot. */
export function claimable(state) {
  if (!state.settings.challengesEnabled) return 0;
  let n = 0;
  PERIODS.forEach((p) => {
    const ch = state.challenges?.[p];
    if (!ch || ch.key !== periodKey(p, state.settings)) return;
    ch.items.forEach((c) => { if (!c.claimed && isDone(state, c, p, ch.key)) n++; });
  });
  return n;
}

/* ---------- rolling periods ---------- */
function payOut(state, c, p, why) {
  E.pay(state, c.rewardGold, `Challenge: ${why}`);
  const lv = E.grantBonusXp(state, c.rewardXp);
  state.counters = state.counters || {};
  state.counters.challenges = (state.counters.challenges || 0) + 1;
  c.claimed = true;
  if (lv) queue.push({ type: 'levelup', level: lv });
}

/** Called after every change. Starts new periods and pays out anything finished in an old one. */
export function sync(state) {
  state.challenges = state.challenges || {};
  if (!state.settings.challengesEnabled) return;
  PERIODS.forEach((p) => {
    const key = periodKey(p, state.settings);
    const cur = state.challenges[p];
    if (cur && cur.key === key) return;
    if (cur) {
      let got = 0; let xp = 0;
      cur.items.forEach((c) => {
        if (!c.claimed && isDone(state, c, p, cur.key)) { payOut(state, c, p, labelOf(c)); got += c.rewardGold; xp += c.rewardXp; }
      });
      if (got) queue.push({ type: 'auto', text: `${p} challenges paid out: +${got}g, +${xp} XP` });
    }
    state.challenges[p] = { key, items: generate(state, p, key), rerolled: 0 };
  });
}

/** Claim one. Returns { gold, xp } or null. */
export function claim(state, p, id) {
  const ch = state.challenges?.[p];
  const c = ch?.items.find((x) => x.id === id);
  if (!c || c.claimed || !isDone(state, c, p, ch.key)) return null;
  payOut(state, c, p, labelOf(c));
  return { gold: c.rewardGold, xp: c.rewardXp };
}

/** Swap one unfinished challenge for a different template. Costs a reroll token. */
export function reroll(state, p, id) {
  const ch = state.challenges?.[p];
  const i = ch?.items.findIndex((x) => x.id === id) ?? -1;
  if (i < 0 || (state.rerolls || 0) < 1) return false;
  const c = ch.items[i];
  if (c.claimed || isDone(state, c, p, ch.key)) return false;
  const used = new Set(ch.items.map((x) => x.metric));
  let pool = eligible(state, p, state.level || 1, ch.key).filter((t) => !used.has(t.metric));
  if (!pool.length) pool = eligible(state, p, state.level || 1, ch.key).filter((t) => t.metric !== c.metric);
  if (!pool.length) return false;
  const rand = rng(hash(`${p}:${ch.key}:re${ch.rerolled || 0}:${id}`));
  const tpl = pool[Math.floor(rand() * pool.length)];
  ch.items[i] = build(state, p, tpl, state.level || 1, i, ch.key);
  ch.rerolled = (ch.rerolled || 0) + 1;
  state.rerolls -= 1;
  return true;
}

/** What a template would ask for at a given level. Used by tests and the settings preview. */
export function previewTarget(state, p, metric, level) {
  const tpl = TPL[p].find((t) => t.metric === metric);
  return tpl ? build(state, p, tpl, level, 0, periodKey(p, state.settings)).target : 0;
}
