/* ============================================================
   MERGE — combine two saves without ever losing progress.
   Used when this device and the cloud disagree. The save with more
   lifetime gold earned is the base (earned only ever goes up, so a stale
   copy can never win); anything the other copy did that the base is
   missing is added on top.
   ============================================================ */

const num = (v) => Number(v) || 0;
const stamp = (s) => (s?.updatedAt ? Date.parse(s.updatedAt) || 0 : 0);

/** The copy that should win. Progress first; on a tie, whichever was changed last. */
export function pickBase(a, b) {
  const d = num(a.lifetimeEarned) - num(b.lifetimeEarned);
  if (Math.abs(d) > 0.5) return d > 0 ? a : b;
  return stamp(a) >= stamp(b) ? a : b;
}

const unionObj = (base, other) => ({ ...(other || {}), ...(base || {}) });   // base wins on conflict
const maxMap = (x, y) => {
  const out = { ...(y || {}), ...(x || {}) };
  Object.keys(out).forEach((k) => { out[k] = Math.max(num((x || {})[k]), num((y || {})[k])); });
  return out;
};

export function mergeStates(a, b) {
  if (!a) return b;
  if (!b) return a;
  const base = pickBase(a, b);
  const other = base === a ? b : a;
  const out = structuredClone(base);
  const newer = stamp(other) > stamp(base) ? other : base;

  // quests: anything the other copy knows about; cleared / deleted on either side sticks
  out.quests = out.quests || {};
  for (const [id, q] of Object.entries(other.quests || {})) {
    const mine = out.quests[id];
    if (!mine) { out.quests[id] = structuredClone(q); continue; }
    if (q.done && !mine.done) Object.assign(mine, { done: true, missed: false, doneAt: q.doneAt, paid: q.paid, paidRank: q.paidRank, paidXp: q.paidXp });
    if (q.dismissed && !mine.dismissed) mine.dismissed = true;
    if (q.manualRank && !mine.manualRank) mine.manualRank = q.manualRank;
  }

  // logs keyed by day: union, so a day logged on either device survives
  out.habitLog = out.habitLog || {};
  for (const [day, entries] of Object.entries(other.habitLog || {})) out.habitLog[day] = unionObj(out.habitLog[day], entries);
  out.gymLog = out.gymLog || {};
  for (const [day, e] of Object.entries(other.gymLog || {})) {
    if (!out.gymLog[day]) out.gymLog[day] = structuredClone(e);
    else {
      if (e.done && !out.gymLog[day].done) out.gymLog[day].done = true;
      out.gymLog[day].exercises = unionObj(out.gymLog[day].exercises, e.exercises);
    }
  }
  out.xpLog = maxMap(out.xpLog, other.xpLog);
  out.penaltiesApplied = unionObj(out.penaltiesApplied, other.penaltiesApplied);

  // lists of events
  const byId = (list, otherList, keyFn) => {
    const seen = new Set((list || []).map(keyFn));
    return [...(list || []), ...(otherList || []).filter((x) => !seen.has(keyFn(x)))];
  };
  out.purchases = byId(out.purchases, other.purchases, (p) => p.id).sort((x, y) => (y.at || '').localeCompare(x.at || ''));
  out.ledger = byId(out.ledger, other.ledger, (l) => `${l.at}|${l.delta}|${l.reason}`).sort((x, y) => (y.at || '').localeCompare(x.at || '')).slice(0, 400);
  out.daysOff = [...new Set([...(out.daysOff || []), ...(other.daysOff || [])])].sort();
  out.gymRestDays = [...new Set([...(out.gymRestDays || []), ...(other.gymRestDays || [])])].sort();
  out.boosts = byId(out.boosts, other.boosts, (x) => x.day);

  // counters that only go up
  out.stats = maxMap(out.stats, other.stats);
  out.counters = maxMap(out.counters, other.counters);
  out.habitStreaks = maxMap(out.habitStreaks, other.habitStreaks);
  out.achievements = unionObj(out.achievements, other.achievements);
  out.lifetimeEarned = Math.max(num(out.lifetimeEarned), num(other.lifetimeEarned));
  out.lifetimeSpent = Math.max(num(out.lifetimeSpent), num(other.lifetimeSpent));
  out.questStreak = Math.max(num(out.questStreak), num(other.questStreak));
  if ((other.lastQuestDay || '') > (out.lastQuestDay || '')) out.lastQuestDay = other.lastQuestDay;
  if ((other.lastRollover || '') > (out.lastRollover || '')) out.lastRollover = other.lastRollover;
  out.lastSync = [out.lastSync, other.lastSync].filter(Boolean).sort().pop() || null;
  out.lastTodoistSync = [out.lastTodoistSync, other.lastTodoistSync].filter(Boolean).sort().pop() || null;

  // preferences follow whoever edited last (they never affect progress)
  if (newer !== base) { out.settings = structuredClone(newer.settings); out.habits = structuredClone(newer.habits); out.shop = structuredClone(newer.shop); }

  out.level = base.level;
  out.updatedAt = new Date(Math.max(stamp(a), stamp(b)) || Date.now()).toISOString();
  return out;
}
