/* ============================================================
   FOCUS TIMER — start a block, put the phone down, collect a small
   bonus when it ends. The running timer lives in localStorage so it
   survives a reload; the reward is paid through the normal save.
   Paid minutes are capped per day so it can't be farmed.
   ============================================================ */
import { todayKey } from './store.js';
import * as E from './engine.js';

const KEY = 'solo-system-focus';
export const DAILY_CAP_MIN = 120;
export const OPTIONS = [15, 25, 45, 60];

export function running() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && v.start && v.mins ? v : null; } catch { return null; }
}
export function start(mins, label = '') {
  const t = { start: Date.now(), mins, label };
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* ignore */ }
  return t;
}
export function cancel() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
export const remainingMs = (t) => Math.max(0, t.start + t.mins * 60000 - Date.now());
export const isFinished = (t) => !!t && remainingMs(t) <= 0;

/** What a block would pay, given what has already been paid today. */
export function rewardFor(state, mins) {
  const used = state.focusLog?.[todayKey(state.settings)] || 0;
  const paid = Math.max(0, Math.min(mins, DAILY_CAP_MIN - used));
  const level = state.level || 1;
  return { paid, gold: Math.round(paid * 0.6 * (1 + level * 0.01)), xp: E.scaleXp(state.settings, paid * 0.4) };
}

/** Pay out a finished block. Returns the reward, or null if it isn't finished. */
export function collect(state) {
  const t = running();
  if (!isFinished(t)) return null;
  const r = rewardFor(state, t.mins);
  const k = todayKey(state.settings);
  state.focusLog = state.focusLog || {};
  state.focusLog[k] = (state.focusLog[k] || 0) + t.mins;
  state.counters = state.counters || {};
  state.counters.focusMins = (state.counters.focusMins || 0) + t.mins;
  if (r.gold) E.pay(state, r.gold, `Focus: ${t.mins} min${t.label ? ` (${t.label})` : ''}`);
  const lv = r.xp ? E.grantXp(state, r.xp) : null;
  E.grantStat(state, 'PER', 1);
  cancel();
  return { ...r, mins: t.mins, level: lv };
}
