/* ============================================================
   INSIGHTS — weekly review and stats, all derived from the logs.
   Pure functions: nothing here changes the save.
   ============================================================ */
import { todayKey, dateKey, addDays } from './store.js';
import * as E from './engine.js';

const eachDay = (a, b) => { const out = []; for (let k = a, n = 0; k <= b && n < 400; k = addDays(k, 1), n++) out.push(k); return out; };
export const mondayOf = (key) => addDays(key, -((new Date(key + 'T12:00:00').getDay() + 6) % 7));
const dayOf = (iso, settings) => dateKey(new Date(Date.parse(iso) - (settings.dayResetHour ?? 4) * 3600000));
const RV = { E: 1, D: 2, C: 3, B: 4, A: 5, S: 6, 'S+': 7 };

/** Everything that happened between two dates (inclusive). */
export function summarize(state, a, b) {
  const s = state.settings;
  const today = todayKey(s);
  const days = eachDay(a, b);
  let quests = 0; let best = null; let early = 0;
  for (const q of Object.values(state.quests || {})) {
    if (!q.done || !q.doneAt) continue;
    const d = dayOf(q.doneAt, s);
    if (d < a || d > b) continue;
    quests++;
    const r = q.paidRank || E.rankOf(q, s);
    if (!best || (RV[r] || 0) > (RV[best.rank] || 0)) best = { title: q.title, rank: r };
    const due = q.dueKey || (q.due ? q.due.slice(0, 10) : null);
    if (due && due > d) early++;
  }
  let habits = 0; let sessions = 0; let perfect = 0; let xp = 0; let bestDay = null;
  days.forEach((k) => {
    Object.values(state.habitLog?.[k] || {}).forEach((v) => { if (v !== false && v !== 'skipped') habits++; });
    if (state.gymLog?.[k]?.done) sessions++;
    if (k < today && E.dayStatus(state, k).perfect) perfect++;
    const x = Math.round(state.xpLog?.[k] || 0);
    xp += x;
    if (x > 0 && (!bestDay || x > bestDay.xp)) bestDay = { key: k, xp: x };
  });
  let gold = 0; let spent = 0;
  for (const l of state.ledger || []) {
    const d = dayOf(l.at, s);
    if (d < a || d > b) continue;
    if (l.delta > 0) gold += l.delta; else spent -= l.delta;
  }
  return { a, b, quests, early, best, habits, sessions, perfect, xp, bestDay, gold: Math.round(gold), spent: Math.round(spent) };
}

/** The week starting at `offset` weeks from this one (0 = this week, -1 = last), plus the one before it. */
export function weekReview(state, offset = 0) {
  const start = addDays(mondayOf(todayKey(state.settings)), offset * 7);
  const cur = summarize(state, start, addDays(start, 6));
  const prev = summarize(state, addDays(start, -7), addDays(start, -1));
  return { cur, prev, start };
}

/** One-line verdict for the week. */
export function verdict(cur, prev) {
  const score = (w) => w.quests * 3 + w.habits * 0.5 + w.sessions * 4 + w.perfect * 5;
  const a = score(cur); const b = score(prev);
  if (a === 0) return 'A quiet week.';
  if (b === 0) return 'A strong start.';
  const pct = Math.round(((a - b) / b) * 100);
  if (pct >= 15) return `Up ${pct}% on the week before.`;
  if (pct <= -15) return `Down ${Math.abs(pct)}% from the week before.`;
  return 'About level with the week before.';
}

/** Daily series for charts: oldest first. */
export function series(state, n) {
  const s = state.settings;
  const end = todayKey(s);
  const days = eachDay(addDays(end, -(n - 1)), end);
  const out = days.map((k) => ({ k, xp: Math.round(state.xpLog?.[k] || 0), quests: 0, gold: 0, spent: 0 }));
  const at = Object.fromEntries(out.map((d, i) => [d.k, i]));
  for (const q of Object.values(state.quests || {})) {
    if (!q.done || !q.doneAt) continue;
    const i = at[dayOf(q.doneAt, s)];
    if (i !== undefined) out[i].quests++;
  }
  // the ledger keeps the latest 400 entries, so older days have no gold data
  const led = state.ledger || [];
  const oldest = led.length >= 400 ? dayOf(led[led.length - 1].at, s) : null;
  for (const l of led) {
    const i = at[dayOf(l.at, s)];
    if (i === undefined) continue;
    if (l.delta > 0) out[i].gold += l.delta; else out[i].spent -= l.delta;
  }
  out.forEach((d) => { d.goldKnown = !oldest || d.k > oldest; d.gold = Math.round(d.gold); d.spent = Math.round(d.spent); });
  return out;
}

/** Quests cleared by weekday over the last `n` days (Mon..Sun). */
export function byWeekday(state, n = 90) {
  const s = state.settings;
  const from = addDays(todayKey(s), -(n - 1));
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const q of Object.values(state.quests || {})) {
    if (!q.done || !q.doneAt) continue;
    const d = dayOf(q.doneAt, s);
    if (d < from) continue;
    out[(new Date(d + 'T12:00:00').getDay() + 6) % 7]++;
  }
  return out;
}
