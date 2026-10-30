/* ============================================================
   SMART SCHEDULE — works backward from each due date and spreads
   the effort over the days before it, so nothing lands all at once.
   Effort comes from the quest's rank. Days off take no work.
   ============================================================ */
import { todayKey, addDays, dueDay } from './store.js';
import * as E from './engine.js';

const PTS = { E: 1, D: 2, C: 3, B: 5, A: 8, S: 13, 'S+': 21 };
export const DEFAULT_CAP = 8;   // points of work per day

/** Plan the open quests. Returns { days: [{ k, load, items }], today: [...], overflow: [...] }. */
export function plan(state, horizon = 7) {
  const s = state.settings;
  const today = todayKey(s);
  const cap = s.dayCapacity || DEFAULT_CAP;
  const open = Object.values(state.quests || {})
    .filter((q) => !q.done && !q.missed && !q.dismissed && dueDay(q))
    .map((q) => ({ q, due: dueDay(q) < today ? today : dueDay(q), pts: PTS[E.rankOf(q, s)] || 2 }))
    .sort((a, b) => (a.due < b.due ? 1 : a.due > b.due ? -1 : b.pts - a.pts));   // latest due first

  const load = {};
  const items = {};
  const overflow = [];
  const free = (k) => cap - (load[k] || 0);
  const put = (k, x, n) => { load[k] = (load[k] || 0) + n; (items[k] = items[k] || []).push({ id: x.q.id, title: x.q.title, rank: E.rankOf(x.q, s), pts: n, due: dueDay(x.q), final: k === x.due }); };

  for (const x of open) {
    let left = x.pts;
    const perDay = Math.max(2, Math.ceil(x.pts / 3));   // big pieces of work start early instead of the night before
    for (let k = x.due; k >= today && left > 0; k = addDays(k, -1)) {
      if (E.isDayOff(state, k) && k !== x.due) continue;
      const n = Math.min(left, perDay, Math.max(0, free(k)));
      if (n > 0) { put(k, x, n); left -= n; }
    }
    if (left > 0) { put(today, x, left); overflow.push({ id: x.q.id, title: x.q.title, short: left }); }   // does not fit before it is due
  }

  const days = [];
  for (let i = 0; i < horizon; i++) {
    const k = addDays(today, i);
    days.push({ k, load: load[k] || 0, cap, off: E.isDayOff(state, k), items: items[k] || [] });
  }
  return { days, today: items[today] || [], overflow, cap };
}
