/* ============================================================
   ACHIEVEMENTS & TITLES
   Counters are high-water marks (max of stored and re-derived), so undoing
   something never lets you farm a threshold twice, and purging old quests
   never takes progress away.
   ============================================================ */
import { RANKS } from './config.js';
import * as E from './engine.js';

export const queue = [];   // feedback events for the UI to flush

export const TIERS = {
  bronze: { label: 'Bronze', gold: 50, xp: 40 },
  silver: { label: 'Silver', gold: 150, xp: 120 },
  gold: { label: 'Gold', gold: 400, xp: 300 },
  legend: { label: 'Legend', gold: 1200, xp: 900 },
};

// group: [counter, label, icon, unit text, rows: [threshold, name, tier, title?]]
const GROUPS = [
  ['quests', 'Quests', 'quests', 'quests cleared', [
    [1, 'First Blood', 'bronze'], [10, 'Gate Crasher', 'bronze'], [50, 'Dungeon Regular', 'silver', 'Dungeon Regular'],
    [100, 'Centurion', 'silver'], [250, 'Veteran', 'gold', 'Veteran'], [500, 'Gatebreaker', 'gold'], [1000, 'Thousand Gates', 'legend', 'Gate Eater']]],
  ['S', 'Slayer', 'sword', 'S-rank quests cleared', [
    [1, 'Beyond Elite', 'silver'], [5, 'Boss Slayer', 'silver'], [25, 'Raid Leader', 'gold', 'Raid Leader'],
    [50, 'S-Rank Specialist', 'gold'], [100, 'Calamity', 'legend', 'Calamity']]],
  ['A', 'Heavy hitter', 'target', 'A-rank quests cleared', [
    [1, 'Rising Threat', 'bronze'], [10, 'Heavy Hitter', 'silver'], [50, 'Elite Striker', 'gold', 'Striker']]],
  ['early', 'Ahead of time', 'clock', 'quests finished early', [
    [5, 'Early Bird', 'bronze'], [25, 'Ahead of Schedule', 'silver', 'Early Riser'], [100, 'Time Bender', 'gold', 'Time Bender']]],
  ['sessions', 'Training', 'gym', 'training sessions', [
    [1, 'First Rep', 'bronze'], [10, 'Warmed Up', 'bronze'], [30, 'Iron Habit', 'silver', 'Iron Will'],
    [100, 'Body Forged', 'gold', 'Forged'], [250, 'Physique of a Monarch', 'legend', 'Iron Monarch']]],
  ['habits', 'Habits', 'habits', 'habits ticked', [
    [10, 'Routine Starts', 'bronze'], [50, 'Creature of Habit', 'bronze'], [200, 'Disciplined', 'silver', 'Disciplined'],
    [500, 'Unshakeable', 'gold'], [1500, 'Habit Incarnate', 'legend', 'Unshakeable']]],
  ['perfect', 'Perfect days', 'star', 'perfect days', [
    [1, 'Flawless', 'bronze'], [7, 'Perfect Week', 'silver', 'Flawless'], [30, 'Perfect Month', 'gold'], [100, 'Perfection', 'legend', 'The Perfect']]],
  ['bestStreak', 'Streaks', 'flame', 'day quest streak', [
    [3, 'On a Roll', 'bronze'], [7, 'Week Warrior', 'bronze'], [14, 'Fortnight', 'silver'],
    [30, 'Unbroken', 'gold', 'Unbroken'], [60, 'Relentless', 'gold'], [100, 'Century Streak', 'legend', 'Relentless']]],
  ['level', 'Levels', 'crown', 'level reached', [
    [5, 'Awakened', 'bronze', 'Awakened'], [10, 'Double Digits', 'bronze'], [20, 'Proven', 'silver'], [30, 'Seasoned', 'silver'],
    [50, 'Half a Hundred', 'gold', 'Elite'], [75, 'Apex', 'gold'], [100, 'Centennial', 'legend', 'Shadow Monarch'], [150, 'Beyond Limits', 'legend']]],
  ['gold', 'Wealth', 'coin', 'gold earned, lifetime', [
    [1000, 'First Fortune', 'bronze'], [5000, 'Well Funded', 'silver'], [20000, 'Treasury', 'gold', 'Treasurer'], [100000, 'Dragon Hoard', 'legend']]],
  ['purchases', 'Shopper', 'bag', 'items bought', [
    [1, 'Treat Yourself', 'bronze'], [10, 'Regular', 'silver'], [30, 'Big Spender', 'gold']]],
  ['challenges', 'Challenger', 'trophy', 'challenges completed', [
    [1, 'Challenge Accepted', 'bronze'], [10, 'Contender', 'silver', 'Contender'], [50, 'Champion', 'gold', 'Champion'], [150, 'Undefeated', 'legend', 'Undefeated']]],
];

export const LIST = [];
GROUPS.forEach(([counter, group, icon, unit, rows]) => rows.forEach(([n, name, tier, title]) => {
  LIST.push({ id: `${counter}-${n}`, counter, group, icon, unit, need: n, name, tier, title: title || null,
    desc: counter === 'bestStreak' ? `Reach a ${n}-day quest streak` : counter === 'level' ? `Reach level ${n}` : counter === 'gold' ? `Earn ${n.toLocaleString()} gold in total` : `${n.toLocaleString()} ${n === 1 ? unit.replace(/s\b/, '') : unit}` });
}));
export const GROUP_NAMES = GROUPS.map((g) => g[1]);

/** Titles you can wear. Rank titles from the level curve are always available. */
export const TITLES = LIST.filter((a) => a.title).map((a) => ({ id: a.title, from: a.id, name: a.title, tier: a.tier }));
export const titleList = () => [...new Map(TITLES.map((t) => [t.id, t])).values()];

/* ---------- counters ---------- */
const RI = Object.fromEntries(RANKS.map((r, i) => [r, i]));

function derive(state) {
  const s = state.settings;
  let quests = 0; let S = 0; let A = 0; let early = 0;
  for (const q of Object.values(state.quests || {})) {
    if (!q.done) continue;
    quests++;
    const r = RI[q.paidRank || E.rankOf(q, s)] ?? 0;
    if (r >= RI.S) S++;
    if (r >= RI.A) A++;
    const due = q.dueKey || (q.due ? q.due.slice(0, 10) : null);
    if (q.doneAt && due && due > q.doneAt.slice(0, 10)) early++;
  }
  let sessions = 0;
  Object.values(state.gymLog || {}).forEach((d) => { if (d?.done) sessions++; });
  let habits = 0;
  Object.values(state.habitLog || {}).forEach((day) => Object.values(day || {}).forEach((v) => { if (v !== false && v !== 'skipped') habits++; }));
  return { quests, S, A, early, sessions, habits, bestStreak: state.questStreak || 0, level: state.level || 1,
    gold: Math.round(state.lifetimeEarned || 0), purchases: (state.purchases || []).length };
}

export function refresh(state) {
  state.counters = state.counters || {};
  const d = derive(state);
  Object.keys(d).forEach((k) => { state.counters[k] = Math.max(state.counters[k] || 0, d[k]); });
  return state.counters;
}

/** Called when a perfect day pays out in the rollover. */
export function notePerfect(state) {
  state.counters = state.counters || {};
  state.counters.perfect = (state.counters.perfect || 0) + 1;
}

/** Unlock anything newly met. The first run on an existing save is silent. */
export function evaluate(state) {
  state.achievements = state.achievements || {};
  const c = refresh(state);
  const silent = !state.achInit;
  let silentCount = 0;
  for (let pass = 0; pass < 3; pass++) {
    let any = false;
    for (const a of LIST) {
      if (state.achievements[a.id] || (c[a.counter] || 0) < a.need) continue;
      state.achievements[a.id] = new Date().toISOString();
      any = true;
      if (silent) { silentCount++; continue; }
      const t = TIERS[a.tier];
      E.pay(state, t.gold, `Achievement: ${a.name}`);
      const lv = E.grantBonusXp(state, t.xp);
      queue.push({ type: 'ach', id: a.id, name: a.name, tier: a.tier, gold: t.gold, xp: t.xp, title: a.title });
      if (lv) queue.push({ type: 'levelup', level: lv });
    }
    if (!any) break;
    refresh(state);
  }
  if (silent) {
    state.achInit = true;
    if (silentCount) queue.push({ type: 'backfill', n: silentCount });
  }
}

export const unlockedCount = (state) => Object.keys(state.achievements || {}).length;

/** Name to show under the hunter's name: equipped title, else the rank title. */
export function equippedTitle(state, rankTitle) {
  const t = state.title;
  if (!t) return rankTitle;
  const owned = TITLES.some((x) => x.id === t && state.achievements?.[x.from]);
  return owned ? t : rankTitle;
}
export const ownedTitles = (state) => titleList().filter((t) => TITLES.some((x) => x.id === t.id && state.achievements?.[x.from]));
