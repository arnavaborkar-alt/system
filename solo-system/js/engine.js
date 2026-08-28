import { RANKS, xpForLevel, levelForXp, HUNTER_RANK_BY_LEVEL, STATS } from './config.js';
import { todayKey, addDays, daysBetween, dueDay } from './store.js';

/* ============================================================
   DIFFICULTY
   ============================================================ */
export function scoreQuest(quest, settings) {
  if (quest.manualRank) return quest.manualRank;
  if (!settings.autoRate) return quest.autoRank || 'C';

  const hay = `${quest.title || ''} ${quest.course || ''} ${quest.notes || ''}`.toLowerCase();
  let score = settings.baseScore;

  // longest keyword wins so "final exam" doesn't double-count with "exam"
  const hits = Object.keys(settings.keywordWeights)
    .filter((k) => hay.includes(k))
    .sort((a, b) => b.length - a.length);
  const used = [];
  for (const k of hits) {
    if (used.some((u) => u.includes(k))) continue;
    used.push(k);
    score += settings.keywordWeights[k];
    if (used.length >= 2) break;
  }

  const cw = settings.courseWeights || {};
  for (const course of Object.keys(cw)) {
    if (course && hay.includes(course.toLowerCase())) { score += cw[course]; break; }
  }
  if (/\bap\b|honors|honours|\bib\b/.test(hay)) score += 1;
  if (quest.priority >= 4) score += 1;   // Todoist's own "urgent" flag

  return RANKS[Math.max(0, Math.min(RANKS.length - 1, Math.round(score)))];
}

export function rankOf(quest, settings) {
  return quest.manualRank || scoreQuest(quest, settings);
}

/* ============================================================
   GOLD
   ============================================================ */
export function questReward(quest, settings, streak, whenKey, state = null) {
  const rank = rankOf(quest, settings);
  const base = settings.goldByRank[rank] ?? 25;
  const xp = settings.xpByRank[rank] ?? 12;

  let pct = 0;
  const dk = dueDay(quest);
  if (dk) {
    const diff = daysBetween(whenKey, dk);           // + = done early
    if (diff >= 1) pct += settings.earlyBonusPct;
    else if (diff === 0) pct += settings.onTimeBonusPct;
    else pct -= settings.latePenaltyPct;
  }
  pct += Math.min(settings.streakBonusMaxPct, streak * settings.streakBonusPct);

  const mult = state ? boostFor(state, whenKey) : 1;
  return {
    rank,
    gold: Math.max(1, Math.round(base * (1 + pct / 100) * mult)),
    xp: Math.round(xp * mult),
    bonusPct: Math.round(pct),
    mult,
  };
}

/* ============================================================
   LEVELS & STATS
   ============================================================ */
export function levelFromXp(xp) { return levelForXp(xp); }
export function levelProgress(xp) {
  const lvl = levelFromXp(Math.max(0, xp));
  const cur = xpForLevel(lvl);
  const need = Math.max(1, xpForLevel(lvl + 1) - cur);
  const into = Math.max(0, Math.max(0, xp) - cur);
  return { level: lvl, cur: into, need, pct: (into / need) * 100 };
}
export function hunterTitle(level) {
  let t = HUNTER_RANK_BY_LEVEL[0];
  for (const r of HUNTER_RANK_BY_LEVEL) if (level >= r.min) t = r;
  return t;
}

export function grantStat(state, stat, amount = 1) {
  if (!STATS.includes(stat)) return;
  state.stats[stat] = (state.stats[stat] || 0) + amount;
}

export function pay(state, delta, reason) {
  if (delta > 0) state.lifetimeEarned = Math.round(((state.lifetimeEarned || 0) + delta) * 100) / 100;
  else if (delta < 0) state.lifetimeSpent = Math.round(((state.lifetimeSpent || 0) - delta) * 100) / 100;
  state.gold = Math.round((state.gold + delta) * 100) / 100;
  if (!state.settings.shop.allowNegativeGold && state.gold < 0) state.gold = 0;
  state.ledger.unshift({ at: new Date().toISOString(), delta, reason });
  if (state.ledger.length > 400) state.ledger.length = 400;
}

export function grantXp(state, amount) {
  const before = levelFromXp(state.xp);
  state.xp += amount;
  const after = levelFromXp(state.xp);
  state.level = after;
  return after > before ? after : null;
}

/* ============================================================
   DAY OFF / PASSES
   ============================================================ */
export function isDayOff(state, key) {
  return (state.daysOff || []).includes(key);
}

/** Payout multiplier for a given day. 1 when no boost is running. */
export function boostFor(state, key) {
  const b = (state.boosts || []).find((x) => x.day === key);
  return b ? (b.mult || 2) : 1;
}

/** When the running boost expires, respecting the custom day-rollover hour. */
export function boostEndsAt(state, key) {
  if (boostFor(state, key) === 1) return null;
  const h = state.settings?.dayResetHour ?? 4;
  const end = new Date(`${addDays(key, 1)}T00:00:00`);
  end.setHours(end.getHours() + h);
  return end.getTime();
}
export function isGymRest(state, key) {
  return (state.gymRestDays || []).includes(key);
}
export function habitSkipsAvailable(state) {
  return state.habitSkips || 0;
}

/* ============================================================
   HABITS
   ============================================================ */
export function habitDueOn(habit, key) {
  const d = new Date(key + 'T12:00:00');
  const dow = d.getDay();
  const s = habit.schedule || { type: 'daily' };
  if (habit.paused) return false;
  switch (s.type) {
    case 'daily': return true;
    case 'weekdays': return dow >= 1 && dow <= 5;
    case 'days': return (s.days || []).includes(dow);
    case 'monthly': return d.getDate() === (s.dayOfMonth || 1);
    default: return true;
  }
}

export function habitsFor(state, key) {
  return state.habits.filter((h) => habitDueOn(h, key));
}

/* ============================================================
   GYM — plan selection, cycle position, progression
   ============================================================ */
export function activePlanKey(state, key) {
  const s = state.settings;
  if (s.season === 'school') return 'school';
  if (s.season === 'summer') return 'summer';
  const end = s.schoolYearEnd;
  if (!end) return 'school';
  return (key || todayKey(s)) > end ? 'summer' : 'school';
}

export function cyclePosition(state, key = todayKey(state.settings)) {
  const len = state.settings.gym.cycleLength || 30;
  const elapsed = Math.max(0, daysBetween(state.cycle.startDate, key));
  return { day: (elapsed % len) + 1, cyclesPassed: Math.floor(elapsed / len), len };
}

export function prescribedFor(state, key = todayKey(state.settings)) {
  const planKey = activePlanKey(state, key);
  const plan = state.plans[planKey];
  const { day } = cyclePosition(state, key);
  const raw = (plan.days[day] || []).map((e) => ({ ...e }));
  const g = state.settings.gym;
  const deload = g.deloadEveryNCycles > 0 && state.cycle.index % g.deloadEveryNCycles === 0;

  return {
    planKey, planName: plan.name, location: plan.location, day, deload,
    exercises: raw.map((e, i) => {
      const ladder = state.ladders[e.ladder];
      const rung = ladder?.rungs?.[e.rung] || { name: 'Unknown', lo: 8, hi: 12 };
      const reps = e.reps ?? rung.lo;
      const sets = deload ? Math.max(1, Math.round(e.sets * (g.deloadVolumePct / 100))) : e.sets;
      return {
        key: `${e.ladder}:${e.rung}:${i}`,
        ladderKey: e.ladder,
        ladderLabel: ladder?.label || e.ladder,
        stat: ladder?.stat || 'STR',
        name: rung.name,
        unit: rung.unit || 'reps',
        reps, sets,
        weighted: !!ladder?.weighted,
        weightLb: e.weightLb ?? 0,
        atTop: reps >= rung.hi,
        range: `${rung.lo}\u2013${rung.hi}`,
      };
    }),
  };
}

/** Training for any date. Null when the date predates the current cycle,
 *  since we can't say what was scheduled before it began. */
export function planForDate(state, key) {
  if (key < state.cycle.startDate) return null;
  return prescribedFor(state, key);
}

/** Everything happening on one day, in one object. */
export function dayDetail(state, key) {
  const quests = Object.values(state.quests)
    .filter((q) => !q.dismissed && dueDay(q) === key)
    .sort((a, b) => RANKS.indexOf(rankOf(b, state.settings)) - RANKS.indexOf(rankOf(a, state.settings)));
  const training = planForDate(state, key);
  const habits = habitsFor(state, key);
  const log = state.habitLog[key] || {};
  return {
    key,
    quests,
    openQuests: quests.filter((q) => !q.done && !q.missed),
    training,
    trained: !!state.gymLog[key]?.done,
    habits,
    habitsDone: habits.filter((x) => log[x.id] !== undefined).length,
    dayOff: isDayOff(state, key),
    gymRest: isGymRest(state, key),
  };
}

/** How much of the last cycle did they actually clear, per ladder? */
export function cycleCompletion(state, startKey, len) {
  const planKey = activePlanKey(state);
  const plan = state.plans[planKey];
  const tally = {};
  for (let i = 0; i < len; i++) {
    const key = addDays(startKey, i);
    const day = (i % len) + 1;
    const ex = plan.days[day] || [];
    if (!ex.length) continue;
    const log = state.gymLog[key];
    const rested = isGymRest(state, key) || isDayOff(state, key);
    ex.forEach((e) => {
      const id = `${e.ladder}:${e.rung}`;
      tally[id] = tally[id] || { seen: 0, done: 0 };
      if (rested) return;                 // paid rest days don't count against you
      tally[id].seen++;
      if (log?.done) tally[id].done++;
    });
  }
  return tally;
}

/** Advance every exercise in the active plan by one cycle's worth of progress. */
export function progressPlan(state, startKey) {
  const g = state.settings.gym;
  const len = g.cycleLength || 30;
  const planKey = activePlanKey(state);
  const plan = state.plans[planKey];
  const tally = cycleCompletion(state, startKey, len);
  const changes = [];

  const seenSlots = new Set();
  for (let day = 1; day <= len; day++) {
    (plan.days[day] || []).forEach((e) => {
      const slot = `${e.ladder}:${e.rung}`;
      if (seenSlots.has(slot)) return;
      seenSlots.add(slot);

      const ladder = state.ladders[e.ladder];
      if (!ladder) return;
      const rung = ladder.rungs[e.rung];
      if (!rung) return;
      const t = tally[slot] || { seen: 0, done: 0 };
      const rate = t.seen ? (t.done / t.seen) * 100 : 0;

      const before = { name: rung.name, reps: e.reps ?? rung.lo, weight: e.weightLb ?? 0 };
      let step = 0;
      if (rate >= g.progressThresholdPct) step = 2;
      else if (rate >= g.holdThresholdPct) step = 1;
      if (step === 0) {
        changes.push({ slot, name: rung.name, rate: Math.round(rate), result: 'held' });
        return;
      }

      let reps = (e.reps ?? rung.lo) + step;
      let weight = e.weightLb ?? 0;
      let rungIdx = e.rung;

      if (reps > rung.hi) {
        if (ladder.weighted) {
          weight += (ladder.incrementLb || 5);
          reps = rung.lo;
        } else if (rungIdx + 1 < ladder.rungs.length) {
          rungIdx += 1;
          reps = ladder.rungs[rungIdx].lo;
        } else {
          reps = rung.hi;                              // top of the ladder — hold there
        }
      }

      // apply to every occurrence of this slot in the plan
      for (let d = 1; d <= len; d++) {
        (plan.days[d] || []).forEach((x) => {
          if (`${x.ladder}:${x.rung}` === slot) {
            x.rung = rungIdx; x.reps = reps; x.weightLb = weight;
          }
        });
      }

      const after = ladder.rungs[rungIdx];
      changes.push({
        slot, rate: Math.round(rate), result: 'progressed',
        from: `${before.reps}\u00d7 ${before.name}${before.weight ? ` @${before.weight}lb` : ''}`,
        to: `${reps}\u00d7 ${after.name}${weight ? ` @${weight}lb` : ''}`,
      });
    });
  }
  return changes;
}

/* ============================================================
   DAILY ROLLOVER
   Applies missed-quest and missed-habit penalties for any day
   that has fully passed and hasn't been settled yet.
   Also advances the gym cycle when 30 days elapse.
   ============================================================ */
export function rollover(state) {
  const s = state.settings;
  const today = todayKey(s);
  const events = [];

  // Saves that predate the lifetime counters report gold they never "earned".
  // Rebuild the floor from what's demonstrably passed through the purse.
  // Once the invariant holds this is a no-op, so it's safe to run every boot.
  const passedThrough = Math.round((state.gold || 0) + (state.lifetimeSpent || 0));
  if ((state.lifetimeEarned || 0) < passedThrough) state.lifetimeEarned = passedThrough;

  state.daysOff = state.daysOff || [];
  state.gymRestDays = state.gymRestDays || [];
  state.habitSkips = state.habitSkips || 0;
  state.penaltiesApplied = state.penaltiesApplied || {};

  // --- settle past days ---
  const startFrom = state.lastRollover || (state.createdAt ? state.createdAt.slice(0, 10) : today);
  let cursor = startFrom;
  let guard = 0;
  while (cursor < today && guard++ < 400) {
    if (!state.penaltiesApplied[cursor] && s.penaltiesEnabled && !isDayOff(state, cursor)) {
      // habits
      habitsFor(state, cursor).forEach((h) => {
        const done = state.habitLog[cursor]?.[h.id];
        if (done === undefined || done === false) {
          if (h.penalty) { pay(state, -h.penalty, `Missed: ${h.name}`); events.push({ type: 'penalty', text: `${h.name} \u2014 \u2212${h.penalty}g` }); }
          state.habitStreaks[h.id] = 0;
        }
      });
      // quests that were due that day and never cleared
      Object.values(state.quests).forEach((q) => {
        if (q.done || q.missed || q.dismissed) return;
        if (dueDay(q) !== cursor) return;
        q.missed = true;
        if (s.missedQuestPenalty) {
          pay(state, -s.missedQuestPenalty, `Missed quest: ${q.title}`);
          events.push({ type: 'penalty', text: `${q.title} \u2014 \u2212${s.missedQuestPenalty}g` });
        }
      });
    }
    state.penaltiesApplied[cursor] = true;
    cursor = addDays(cursor, 1);
  }
  state.lastRollover = today;

  // keep the map small
  const cutoff = addDays(today, -120);
  Object.keys(state.penaltiesApplied).forEach((k) => { if (k < cutoff) delete state.penaltiesApplied[k]; });

  // --- gym cycle advance ---
  const { cyclesPassed } = cyclePosition(state, today);
  if (cyclesPassed >= 1 && state.settings.gym.autoAdvanceCycle) {
    const len = state.settings.gym.cycleLength || 30;
    for (let i = 0; i < cyclesPassed && i < 24; i++) {
      const startKey = addDays(state.cycle.startDate, i * len);
      const changes = progressPlan(state, startKey);
      state.cycle.index += 1;
      state.cycleHistory = state.cycleHistory || [];
      state.cycleHistory.unshift({ index: state.cycle.index - 1, startKey, changes, at: new Date().toISOString() });
      if (state.cycleHistory.length > 24) state.cycleHistory.length = 24;
      events.push({ type: 'cycle', text: `Cycle ${state.cycle.index - 1} complete \u2014 difficulty raised`, changes });
    }
    state.cycle.startDate = addDays(state.cycle.startDate, cyclesPassed * len);
  }

  // --- season flip resets the cycle onto the new plan ---
  const planKey = activePlanKey(state);
  if (state.cycle.plan !== planKey) {
    state.cycle.plan = planKey;
    state.cycle.startDate = today;
    state.cycle.index = 1;
    events.push({ type: 'season', text: planKey === 'summer' ? 'Summer segment unlocked' : 'School-year segment active' });
  }

  return events;
}

/** Rolling 7-day activity, for the leaderboard. */
export function weekStats(state) {
  const today = todayKey(state.settings);
  let quests = 0, sessions = 0, habits = 0, habitsDue = 0;
  for (let i = 0; i < 7; i++) {
    const k = addDays(today, -i);
    if (state.gymLog[k]?.done) sessions++;
    const due = habitsFor(state, k);
    habitsDue += due.length;
    habits += due.filter((hb) => state.habitLog[k]?.[hb.id] !== undefined).length;
  }
  Object.values(state.quests).forEach((q) => {
    if (q.done && q.doneAt && daysBetween(q.doneAt.slice(0, 10), today) <= 7) quests++;
  });
  return { quests, sessions, habits, habitsDue };
}

/* ============================================================
   BULK CLEANUP
   ============================================================ */
/** Quests dated before `before`. scope: 'open' | 'all' */
export function questsBefore(state, before, scope = 'open') {
  return Object.values(state.quests).filter((q) => {
    if (q.dismissed) return false;
    const d = dueDay(q);
    if (!d || d >= before) return false;
    return scope === 'all' ? true : !q.done;
  });
}

/** Remove them outright. Safe to hard-delete because the sync cutoff moves with it,
 *  so Schoology can't hand them back on the next pull. Gold already earned is untouched. */
export function purgeBefore(state, before, scope = 'open') {
  const doomed = questsBefore(state, before, scope);
  doomed.forEach((q) => { delete state.quests[q.id]; });
  const cur = state.settings.ignoreBefore || '';
  if (!cur || before > cur) state.settings.ignoreBefore = before;
  return doomed.length;
}

/* ============================================================
   SHOP
   ============================================================ */
export function cooldownLeft(state, item) {
  if (!item.cooldownDays) return 0;
  const last = state.purchases.find((p) => p.itemId === item.id);
  if (!last) return 0;
  const elapsed = daysBetween(last.at.slice(0, 10), todayKey(state.settings));
  return Math.max(0, item.cooldownDays - elapsed);
}

export function buy(state, item, startKey) {
  if (state.gold < item.price) return { ok: false, why: 'Not enough gold.' };
  const cd = cooldownLeft(state, item);
  if (cd > 0) return { ok: false, why: `On cooldown for ${cd} more day${cd === 1 ? '' : 's'}.` };

  const from = startKey || todayKey(state.settings);
  if (item.grants?.type === 'boost') {
    for (let i = 0; i < (item.grants.days || 1); i++) {
      if (isDayOff(state, addDays(from, i))) {
        return { ok: false, why: "That's a day off \u2014 there'd be nothing to double." };
      }
    }
  }
  if (item.grants?.type === 'dayOff') {
    for (let i = 0; i < (item.grants.days || 1); i++) {
      if (boostFor(state, addDays(from, i)) > 1) {
        return { ok: false, why: 'A double-gold day is already running then.' };
      }
    }
  }

  pay(state, -item.price, `Bought: ${item.name}`);
  const rec = { id: `p${Date.now()}`, itemId: item.id, name: item.name, price: item.price, at: new Date().toISOString() };

  const g = item.grants;
  if (g?.type === 'dayOff') {
    const from = startKey || todayKey(state.settings);
    const days = [];
    for (let i = 0; i < g.days; i++) days.push(addDays(from, i));
    state.daysOff = [...new Set([...(state.daysOff || []), ...days])];
    rec.covers = days;
  } else if (g?.type === 'gymRest') {
    const from = startKey || todayKey(state.settings);
    state.gymRestDays = [...new Set([...(state.gymRestDays || []), from])];
    rec.covers = [from];
  } else if (g?.type === 'habitSkip') {
    state.habitSkips = (state.habitSkips || 0) + (g.n || 1);
  } else if (g?.type === 'boost') {
    const from = startKey || todayKey(state.settings);
    const days = [];
    for (let i = 0; i < (g.days || 1); i++) days.push(addDays(from, i));
    state.boosts = [
      ...(state.boosts || []).filter((b) => !days.includes(b.day)),
      ...days.map((day) => ({ day, mult: g.mult || 2 })),
    ].filter((b) => b.day >= addDays(todayKey(state.settings), -30));
    rec.covers = days;
  }

  state.purchases.unshift(rec);
  return { ok: true, rec };
}
