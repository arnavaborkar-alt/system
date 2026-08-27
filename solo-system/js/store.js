import {
  DEFAULT_SETTINGS, DEFAULT_PLANS, DEFAULT_SHOP, DEFAULT_HABITS, LADDERS, STATS,
} from './config.js';

const LOCAL_KEY = 'solo-system-v1';
const KEY_KEY = 'solo-system-key';

/* ---------- fresh state ---------- */
export function freshState() {
  const stats = {};
  STATS.forEach((s) => (stats[s] = 0));
  return {
    version: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    ladders: structuredClone(LADDERS),
    plans: structuredClone(DEFAULT_PLANS),
    shop: structuredClone(DEFAULT_SHOP),
    habits: structuredClone(DEFAULT_HABITS),

    gold: 0,
    lifetimeEarned: 0,   // monotonic; the server verifies its growth
    lifetimeSpent: 0,    // monotonic; bounds the gold you may display
    xp: 0,
    level: 1,
    stats,

    quests: {},          // id -> quest
    overrides: {},       // questId -> rank (manual)
    habitLog: {},        // 'YYYY-MM-DD' -> { habitId: true }
    habitStreaks: {},    // habitId -> n
    gymLog: {},          // 'YYYY-MM-DD' -> { done: bool, exercises: {key: {sets:[reps..], done:bool}} }
    cycle: { index: 1, startDate: todayKey(), plan: 'school' },
    purchases: [],       // { id, itemId, name, price, at, usedAt }
    ledger: [],          // { at, delta, reason }
    penaltiesApplied: {},// 'YYYY-MM-DD' -> true (so a day is only penalised once)
    lastRollover: todayKey(),
    questStreak: 0,
    lastQuestDay: null,
    daysOff: [],
    boosts: [],
    gymRestDays: [],
    habitSkips: 0,
    cycleHistory: [],
    lastSync: null,
    board: { optIn: false, name: '' },
    createdAt: new Date().toISOString(),
  };
}

/* ---------- date helpers (respect dayResetHour) ---------- */
export function todayKey(settings) {
  const h = settings?.dayResetHour ?? 4;
  const d = new Date();
  d.setHours(d.getHours() - h);
  return d.toISOString().slice(0, 10);
}
export function dateKey(d) {
  const x = new Date(d);
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function addDays(key, n) {
  const d = new Date(key + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
/** The local calendar day a quest lands on. Schoology sends UTC, so slicing the
 *  ISO string would put an 11:59pm assignment on the wrong day for anyone west of GMT. */
export function dueDay(q) {
  if (!q || !q.due) return null;
  if (q.dueKey) return q.dueKey;
  return /Z$/.test(q.due) ? dateKey(new Date(q.due)) : q.due.slice(0, 10);
}
export function daysBetween(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}

/* ---------- deep merge so new default fields appear after an update ---------- */
function merge(base, saved) {
  if (Array.isArray(saved)) return saved;
  if (saved && typeof saved === 'object' && !Array.isArray(base) && base && typeof base === 'object') {
    const out = { ...base };
    for (const k of Object.keys(saved)) out[k] = merge(base[k], saved[k]);
    return out;
  }
  return saved === undefined ? base : saved;
}

/* ---------- the store ---------- */
class Store {
  constructor() {
    this.state = freshState();
    this.listeners = new Set();
    this.cloud = false;
    this.key = localStorage.getItem(KEY_KEY) || '';
    this.saveTimer = null;
    this.status = 'local';
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((f) => f(this.state)); }

  setKey(k) {
    this.key = (k || '').trim();
    localStorage.setItem(KEY_KEY, this.key);
  }

  async load() {
    // local first so the UI paints immediately
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      try { this.state = merge(freshState(), JSON.parse(raw)); } catch { /* corrupt, ignore */ }
    }
    this.emit();

    if (!this.key) { this.status = 'local'; return; }
    try {
      const r = await fetch('/api/state', { headers: { 'x-hunter-key': this.key } });
      if (r.status === 401) { this.status = 'badkey'; this.emit(); return; }
      if (r.status === 501) { this.status = 'nocloud'; this.emit(); return; }
      if (!r.ok) throw new Error(r.status);
      const body = await r.json();
      if (body.state) {
        const remote = merge(freshState(), body.state);
        const localAt = this.state.updatedAt ? Date.parse(this.state.updatedAt) : 0;
        const remoteAt = remote.updatedAt ? Date.parse(remote.updatedAt) : 0;
        if (remoteAt >= localAt) this.state = remote;
      }
      this.cloud = true;
      this.status = 'cloud';
      this.save({ immediate: true });
    } catch {
      this.status = 'offline';
    }
    this.emit();
  }

  /* mutate + persist */
  update(fn) {
    fn(this.state);
    this.state.updatedAt = new Date().toISOString();
    this.emit();
    this.save();
  }

  save({ immediate = false } = {}) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(this.state));
    if (!this.key) return;
    clearTimeout(this.saveTimer);
    const push = async () => {
      try {
        const payload = { ...this.state, __week: this.weekStats ? this.weekStats(this.state) : {} };
        const r = await fetch('/api/state', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-hunter-key': this.key },
          body: JSON.stringify({ state: payload }),
        });
        this.status = r.ok ? 'cloud' : (r.status === 501 ? 'nocloud' : 'offline');
        if (r.ok) { try { this.standing = (await r.json()).standing; } catch { /* ignore */ } }
      } catch { this.status = 'offline'; }
      this.emit();
    };
    if (immediate) return push();
    this.saveTimer = setTimeout(push, 1200);
    return Promise.resolve();
  }

  async board() {
    if (!this.key) return { error: 'Connect your hunter key first.' };
    try {
      const r = await fetch('/api/board', { headers: { 'x-hunter-key': this.key } });
      const j = await r.json();
      return r.ok ? j : { error: j.error || `Error ${r.status}` };
    } catch (e) { return { error: e.message }; }
  }

  export() { return JSON.stringify(this.state, null, 2); }

  import(json) {
    const parsed = JSON.parse(json);
    this.state = merge(freshState(), parsed);
    this.state.updatedAt = new Date().toISOString();
    this.emit();
    this.save({ immediate: true });
  }

  reset() {
    this.state = freshState();
    this.emit();
    this.save({ immediate: true });
  }
}

export const store = new Store();
