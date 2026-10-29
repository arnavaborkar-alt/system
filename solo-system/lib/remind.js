/**
 * Works out what a reminder should say, from a saved state. Pure: no network.
 * Returns { title, body } or null when there is nothing worth interrupting for.
 */

const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (key, n) => ymd(new Date(new Date(key + 'T12:00:00Z').getTime() + n * 864e5));
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);

/** The player's local calendar day (rolling over at the reset hour) and local hour. */
function localClock(nowMs, tzo, resetHour = 4) {
  const local = new Date(nowMs - tzo * 60000);
  return { hour: local.getUTCHours(), day: ymd(new Date(local.getTime() - resetHour * 3600000)) };
}

function habitDue(h, key) {
  if (h.paused) return false;
  const d = new Date(key + 'T12:00:00Z');
  const dow = d.getUTCDay();
  const s = h.schedule || { type: 'daily' };
  if (s.type === 'weekdays') return dow >= 1 && dow <= 5;
  if (s.type === 'days') return (s.days || []).includes(dow);
  if (s.type === 'monthly') return d.getUTCDate() === (s.dayOfMonth || 1);
  return true;
}

function trainingScheduled(st, key) {
  const s = st.settings || {};
  const end = s.schoolYearEnd;
  const summer = s.season === 'summer' || (s.season !== 'school' && end && key > end);
  const plan = (st.plans || {})[summer ? 'summer' : 'school'];
  if (!plan || !st.cycle?.startDate) return false;
  if ((st.gymRestDays || []).includes(key)) return false;
  const len = s.gym?.cycleLength || 30;
  const elapsed = Math.max(0, daysBetween(st.cycle.startDate, key));
  return ((plan.days || {})[(elapsed % len) + 1] || []).length > 0;
}

function snapshot(st, key) {
  const s = st.settings || {};
  const dayOff = (st.daysOff || []).includes(key);
  const dk = (q) => q.dueKey || (q.due ? q.due.slice(0, 10) : null);
  const open = Object.values(st.quests || {}).filter((q) => !q.done && !q.missed && !q.dismissed);
  const dueToday = open.filter((q) => dk(q) && dk(q) <= key).length;
  const dueTomorrow = open.filter((q) => dk(q) === addDays(key, 1)).length;
  const habits = (st.habits || []).filter((h) => habitDue(h, key));
  const log = (st.habitLog || {})[key] || {};
  const habitsLeft = habits.filter((h) => log[h.id] === undefined || log[h.id] === false).length;
  const gymScheduled = trainingScheduled(st, key);
  const gymLeft = gymScheduled && !(st.gymLog || {})[key]?.done;
  const clearedToday = Object.values(st.quests || {}).some((q) => q.done && q.doneAt && ymd(new Date(Date.parse(q.doneAt) - (s.dayResetHour ?? 4) * 3600000)) === key);
  const streak = st.questStreak || 0;
  const streakAtRisk = streak > 0 && st.lastQuestDay && st.lastQuestDay !== key && !clearedToday;
  return { dayOff, dueToday, dueTomorrow, habitsLeft, habitTotal: habits.length, gymLeft, streak, streakAtRisk,
    shields: st.streakShields || 0 };
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function build(st, kind, key) {
  const n = snapshot(st, key);
  if (n.dayOff) return null;

  if (kind === 'morning') {
    const bits = [];
    if (n.dueToday) bits.push(plural(n.dueToday, 'quest') + ' due');
    if (n.habitTotal) bits.push(plural(n.habitTotal, 'habit'));
    if (n.gymLeft) bits.push('training');
    if (!bits.length) return null;
    return { title: 'Today’s quests', body: bits.join(' · ') + (n.streak > 1 ? ` · ${n.streak}-day streak` : ''), tag: 'morning' };
  }

  // evening: only speak up if something is actually left
  const left = [];
  if (n.dueToday) left.push(plural(n.dueToday, 'quest') + ' still due');
  if (n.habitsLeft) left.push(plural(n.habitsLeft, 'habit') + ' left');
  if (n.gymLeft) left.push('training not done');
  if (!left.length && !n.streakAtRisk) return null;
  let body = left.join(' · ');
  if (n.streakAtRisk) {
    const s = `Clear one quest to keep your ${n.streak}-day streak${n.shields ? ' (a shield will cover you if you miss)' : ''}`;
    body = body ? `${body}. ${s}.` : `${s}.`;
  }
  return { title: n.streakAtRisk ? 'Streak at risk' : 'Still open today', body, tag: 'evening' };
}

module.exports = { localClock, build, snapshot, addDays };
