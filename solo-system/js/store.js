import { mergeStates } from './merge.js';
import {
  DEFAULT_SETTINGS, DEFAULT_PLANS, DEFAULT_SHOP, DEFAULT_HABITS, LADDERS, STATS, SHOP_VERSION,
} from './config.js';

const LOCAL_KEY = 'solo-system-v1';
const KEY_KEY = 'solo-system-key';

/* ---------- fresh state ---------- */
export function freshState() {
  const stats = {};
  STATS.forEach((s) => (stats[s] = 0));
  return {
    version: 3,
    settings: structuredClone(DEFAULT_SETTINGS),
    ladders: structuredClone(LADDERS),
    plans: structuredClone(DEFAULT_PLANS),
    shop: structuredClone(DEFAULT_SHOP),
    shopVersion: SHOP_VERSION,
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
    xpLog: {},           // 'YYYY-MM-DD' -> XP earned that day
    gymProfile: null,    // answers from the Find-my-plan form
    boss: null,          // this week's boss gate
    focusLog: {},        // 'YYYY-MM-DD' -> focus minutes paid
    challenges: {},      // { daily|weekly|monthly: { key, items: [...] } }
    counters: {},        // lifetime high-water marks used by achievements
    achievements: {},    // id -> ISO time unlocked
    achInit: false,
    title: '',           // equipped title id ('' = rank title)
    rerolls: 0,
    streakShields: 0,
    lastSync: null,
    lastTodoistSync: null,
    createdAt: new Date().toISOString(),
  };
}

/* ---------- date helpers (respect dayResetHour) ---------- */
export function todayKey(settings) {
  // Shift the clock back by the reset hour, THEN read the local calendar date.
  // (toISOString() would read the UTC date, which puts the rollover at the wrong hour.)
  const h = settings?.dayResetHour ?? 4;
  return dateKey(new Date(Date.now() - h * 3600000));
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

/** Merge a saved copy over the defaults. A save from before shop versions existed
 *  must read as version 1, not inherit today's default and skip the migration. */
function hydrate(saved) {
  if (saved && typeof saved === 'object' && saved.shopVersion === undefined) saved.shopVersion = 1;
  return merge(freshState(), saved);
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
      try { this.state = hydrate(JSON.parse(raw)); } catch { /* corrupt, ignore */ }
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
        const remote = hydrate(body.state);
        // Never trust timestamps alone: a device that was left alone for months can carry a
        // newer "last edited" stamp than the cloud and wipe real progress. Merge on progress.
        const mergedState = mergeStates(this.state, remote);
        this.lastRemoteStamp = remote.updatedAt;
        this.noteRescue(this.state, mergedState);
        this.state = mergedState;
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
    if (this.beforeCommit) this.beforeCommit(this.state);   // set by main.js (keeps imports one-way)
    this.state.updatedAt = new Date().toISOString();
    this.emit();
    this.save();
  }

  save({ immediate = false } = {}) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(this.state));
    if (!this.key) return;
    clearTimeout(this.saveTimer);
    const push = async (retry = true) => {
      try {
        const force = this.forceNext; this.forceNext = false;
        const r = await fetch('/api/state', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-hunter-key': this.key },
          body: JSON.stringify({ state: this.state, force }),
        });
        if (r.status === 409 && retry) {
          // the cloud has more progress than this device: fold it in, then try again
          const body = await r.json().catch(() => ({}));
          if (body.state) {
            const rescued = mergeStates(this.state, hydrate(body.state));
            this.noteRescue(this.state, rescued);
            this.state = rescued;
            this.status = 'cloud'; this.emit();
            localStorage.setItem(LOCAL_KEY, JSON.stringify(this.state));
            this.changedRemotely = true;
            return push(false);
          }
        }
        this.status = r.ok ? 'cloud' : (r.status === 501 ? 'nocloud' : 'offline');
        if (r.ok) this.lastRemoteStamp = this.state.updatedAt;
      } catch { this.status = 'offline'; }
      this.emit();
    };
    if (immediate) return push();
    this.saveTimer = setTimeout(push, 1200);
    return Promise.resolve();
  }

  /** Tells the app when a merge brought in real progress this device didn't have. */
  noteRescue(before, after) {
    if (!this.onRescue || !before || !after) return;
    if ((after.xp || 0) - (before.xp || 0) > 1 && (after.lifetimeEarned || 0) - (before.lifetimeEarned || 0) > 1) this.onRescue(before, after);
  }

  /** Fetch the cloud copy and fold it in. Returns true if what you are looking at changed. */
  async pull() {
    if (!this.key || !this.cloud || this.pulling) return false;
    this.pulling = true;
    try {
      const r = await fetch('/api/state', { headers: { 'x-hunter-key': this.key } });
      if (!r.ok) { if (r.status !== 401) this.status = 'offline'; this.emit(); return false; }
      const body = await r.json();
      this.status = 'cloud';
      if (!body.state) return false;
      const remote = hydrate(body.state);
      if (remote.updatedAt === this.lastRemoteStamp) return false;   // nothing new since we last looked
      this.lastRemoteStamp = remote.updatedAt;
      const before = JSON.stringify(this.state);
      const merged = mergeStates(this.state, remote);
      const changed = JSON.stringify(merged) !== before;
      if (changed) {
        this.noteRescue(this.state, merged);
        this.state = merged;
        localStorage.setItem(LOCAL_KEY, JSON.stringify(this.state));
        // if this device had something the cloud lacked, send the combined result back
        if (JSON.stringify(merged) !== JSON.stringify(remote)) this.save({ immediate: true });
      }
      this.emit();
      return changed;
    } catch { this.status = 'offline'; this.emit(); return false; }
    finally { this.pulling = false; }
  }

  /** The daily server snapshot, or null. Used by Settings > Restore. */
  async snapshot() {
    if (!this.key) return null;
    try {
      const r = await fetch('/api/state?backup=1', { headers: { 'x-hunter-key': this.key } });
      if (!r.ok) return null;
      const b = await r.json();
      return b.state ? { state: hydrate(b.state), savedAt: b.savedAt || null } : null;
    } catch { return null; }
  }

  export() { return JSON.stringify(this.state, null, 2); }

  import(json) {
    const parsed = JSON.parse(json);
    this.state = hydrate(parsed);
    this.state.updatedAt = new Date().toISOString();
    this.forceNext = true;     // an import is deliberate, so the server must accept it even if it is "behind"
    this.emit();
    this.save({ immediate: true });
  }

  reset() {
    this.state = freshState();
    this.forceNext = true;
    this.emit();
    this.save({ immediate: true });
  }
}

export const store = new Store();
