/* ============================================================
   ACHIEVEMENTS & TITLES
   Counters are high-water marks (max of stored and re-derived), so undoing
   something never lets you farm a threshold twice, and purging old quests
   never takes progress away.
   ============================================================ */
import { RANKS } from './config.js';
import * as E from './engine.js';

export const ACH_VERSION = 2;   // bump when new achievements are added; old progress is credited silently
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
    [1, 'First Blood', 'bronze'], [5, 'Warm-Up', 'bronze'], [10, 'Gate Crasher', 'bronze'], [25, 'Quarter Century', 'bronze'], [50, 'Dungeon Regular', 'silver', 'Dungeon Regular'],
    [100, 'Centurion', 'silver'], [175, 'Seasoned', 'silver'], [250, 'Veteran', 'gold', 'Veteran'], [400, 'Relentless Clearer', 'gold'], [500, 'Gatebreaker', 'gold'],
    [750, 'Warlord', 'legend'], [1000, 'Thousand Gates', 'legend', 'Gate Eater'], [2000, 'Endless Dungeon', 'legend', 'Endless']]],
  ['S', 'S-rank', 'sword', 'S-rank quests cleared', [
    [1, 'Beyond Elite', 'silver'], [5, 'Boss Slayer', 'silver'], [10, 'Dragon Hunter', 'gold'], [25, 'Raid Leader', 'gold', 'Raid Leader'],
    [50, 'S-Rank Specialist', 'gold'], [100, 'Calamity', 'legend', 'Calamity'], [250, 'Disaster Class', 'legend', 'Disaster']]],
  ['A', 'A-rank', 'target', 'A-rank (or higher) quests cleared', [
    [1, 'Rising Threat', 'bronze'], [10, 'Heavy Hitter', 'silver'], [25, 'Sharpshooter', 'silver'], [50, 'Elite Striker', 'gold', 'Striker'], [150, 'Apex Predator', 'legend']]],
  ['B', 'B-rank', 'target', 'B-rank (or higher) quests cleared', [
    [1, 'Mid-Tier', 'bronze'], [10, 'Steady Hands', 'bronze'], [30, 'Dependable', 'silver'], [100, 'Backbone', 'gold'], [300, 'Pillar', 'legend']]],
  ['early', 'Ahead of time', 'clock', 'quests finished early', [
    [1, 'One Step Ahead', 'bronze'], [5, 'Early Bird', 'bronze'], [25, 'Ahead of Schedule', 'silver', 'Early Riser'], [60, 'Planner', 'silver'],
    [100, 'Time Bender', 'gold', 'Time Bender'], [250, 'Precognition', 'gold'], [500, 'Clairvoyant', 'legend', 'Clairvoyant']]],
  ['morning', 'Early hours', 'clock', 'quests cleared before 9am', [
    [1, 'Up Early', 'bronze'], [10, 'Morning Person', 'silver', 'Morning Person'], [50, 'Dawn Patrol', 'gold'], [150, 'First Light', 'legend']]],
  ['night', 'Late hours', 'moon', 'quests cleared after 10pm', [
    [1, 'Burning the Midnight Oil', 'bronze'], [10, 'Night Owl', 'silver', 'Night Owl'], [50, 'Nocturnal', 'gold'], [150, 'Insomniac King', 'legend']]],
  ['weekend', 'Weekends', 'calendar', 'quests cleared on a weekend', [
    [1, 'Weekend Work', 'bronze'], [15, 'Weekend Warrior', 'silver', 'Weekend Warrior'], [60, 'No Days Off', 'gold'], [200, 'Seven-Day Grind', 'legend']]],
  ['sessions', 'Training', 'gym', 'training sessions', [
    [1, 'First Rep', 'bronze'], [5, 'Getting Going', 'bronze'], [10, 'Warmed Up', 'bronze'], [30, 'Iron Habit', 'silver', 'Iron Will'], [50, 'Gym Rat', 'silver'],
    [100, 'Body Forged', 'gold', 'Forged'], [150, 'Built Different', 'gold'], [250, 'Physique of a Monarch', 'legend', 'Iron Monarch'], [500, 'Living Weapon', 'legend', 'Living Weapon']]],
  ['cycles', 'Cycles', 'flag', 'training cycles completed', [
    [1, 'First Cycle', 'bronze'], [3, 'Three Rounds', 'silver'], [6, 'Half a Year of Gains', 'gold'], [12, 'Full Year of Progress', 'legend']]],
  ['habits', 'Habits', 'habits', 'habits ticked', [
    [1, 'Day One', 'bronze'], [10, 'Routine Starts', 'bronze'], [50, 'Creature of Habit', 'bronze'], [100, 'Locked In', 'silver'], [200, 'Disciplined', 'silver', 'Disciplined'],
    [500, 'Unshakeable', 'gold'], [1000, 'Machine', 'gold'], [1500, 'Habit Incarnate', 'legend', 'Unshakeable'], [3000, 'Clockwork', 'legend']]],
  ['habitStreak', 'Habit streaks', 'flame', 'day streak on a single habit', [
    [3, 'Three in a Row', 'bronze'], [7, 'One Full Week', 'bronze'], [14, 'Two Weeks Clean', 'silver'], [30, 'A Month Straight', 'silver', 'Consistent'],
    [60, 'Two Months Straight', 'gold'], [100, 'Hundred-Day Habit', 'gold'], [200, 'Ironclad', 'legend'], [365, 'A Whole Year', 'legend', 'Evergreen']]],
  ['perfect', 'Perfect days', 'star', 'perfect days', [
    [1, 'Flawless', 'bronze'], [3, 'Hat Trick', 'bronze'], [7, 'Perfect Week', 'silver', 'Flawless'], [14, 'Two Perfect Weeks', 'silver'], [30, 'Perfect Month', 'gold'],
    [60, 'Spotless', 'gold'], [100, 'Perfection', 'legend', 'The Perfect'], [200, 'Untouchable', 'legend']]],
  ['bestStreak', 'Quest streaks', 'flame', 'day quest streak', [
    [3, 'On a Roll', 'bronze'], [7, 'Week Warrior', 'bronze'], [14, 'Fortnight', 'silver'], [21, 'Three Weeks', 'silver'], [30, 'Unbroken', 'gold', 'Unbroken'],
    [45, 'Forty-Five Strong', 'gold'], [60, 'Relentless', 'gold'], [100, 'Century Streak', 'legend', 'Relentless'], [200, 'Double Century Streak', 'legend'], [365, 'Year of the Grind', 'legend', 'Year-Rounder']]],
  ['level', 'Levels', 'crown', 'level reached', [
    [3, 'Getting Started', 'bronze'], [5, 'Awakened', 'bronze', 'Awakened'], [10, 'Double Digits', 'bronze'], [15, 'Climbing', 'silver'], [20, 'Proven', 'silver'], [25, 'Quarter Hundred', 'silver'],
    [30, 'Seasoned Player', 'silver'], [40, 'Forty Up', 'gold'], [50, 'Half a Hundred', 'gold', 'Elite'], [60, 'Sixty Club', 'gold'], [75, 'Apex', 'gold'], [90, 'Almost There', 'legend'],
    [100, 'Centennial', 'legend', 'Shadow Monarch'], [125, 'Beyond Mortal', 'legend'], [150, 'Beyond Limits', 'legend'], [200, 'Sovereign', 'legend', 'Sovereign']]],
  ['xp', 'Experience', 'bolt', 'XP earned, lifetime', [
    [500, 'First Steps', 'bronze'], [2500, 'Gaining Ground', 'bronze'], [10000, 'Five Figures', 'silver'], [25000, 'Power Surge', 'silver'], [75000, 'Deep Reserves', 'gold'],
    [200000, 'Overflowing', 'gold'], [500000, 'Boundless', 'legend']]],
  ['gold', 'Wealth', 'coin', 'gold earned, lifetime', [
    [500, 'Pocket Change', 'bronze'], [1000, 'First Fortune', 'bronze'], [5000, 'Well Funded', 'silver'], [10000, 'Ten Grand', 'silver'], [20000, 'Treasury', 'gold', 'Treasurer'],
    [50000, 'Vault', 'gold'], [100000, 'Dragon Hoard', 'legend'], [250000, 'Kingdom Coffers', 'legend'], [1000000, 'Millionaire', 'legend', 'Millionaire']]],
  ['spent', 'Spending', 'bag', 'gold spent, lifetime', [
    [500, 'Window Shopper', 'bronze'], [5000, 'Free Spender', 'silver'], [25000, 'Big Baller', 'gold'], [100000, 'Whale', 'legend']]],
  ['purchases', 'Shopper', 'bag', 'items bought', [
    [1, 'Treat Yourself', 'bronze'], [3, 'Hooked', 'bronze'], [10, 'Regular', 'silver'], [20, 'Loyal Customer', 'silver'], [30, 'Big Spender', 'gold'], [60, 'VIP', 'gold'], [120, 'Shopaholic', 'legend']]],
  ['boosts', 'Boosts', 'bolt', 'boosts bought', [
    [1, 'Double Up', 'bronze'], [5, 'Power Player', 'silver'], [15, 'Overclocked', 'gold'], [40, 'Permanent Surge', 'legend']]],
  ['daysOff', 'Time off', 'moon', 'days off taken', [
    [1, 'Well Earned', 'bronze'], [5, 'Recharged', 'silver'], [14, 'Two-Week Break', 'gold'], [30, 'Sabbatical', 'legend']]],
  ['challenges', 'Challenger', 'trophy', 'challenges completed', [
    [1, 'Challenge Accepted', 'bronze'], [5, 'Taking Names', 'bronze'], [10, 'Contender', 'silver', 'Contender'], [25, 'Challenge Seeker', 'silver'], [50, 'Champion', 'gold', 'Champion'],
    [100, 'Gauntlet Runner', 'gold'], [150, 'Undefeated', 'legend', 'Undefeated'], [300, 'Legend of the Board', 'legend']]],
  ['STR', 'Strength', 'dumbbell', 'Strength', [[25, 'Stronger', 'bronze'], [100, 'Heavy Lifter', 'silver'], [250, 'Powerhouse', 'gold'], [500, 'Titan', 'legend', 'Titan']]],
  ['VIT', 'Vitality', 'heart', 'Vitality', [[25, 'Healthy', 'bronze'], [100, 'Resilient', 'silver'], [250, 'Ironclad Body', 'gold'], [500, 'Immortal', 'legend', 'Immortal']]],
  ['AGI', 'Agility', 'bolt', 'Agility', [[25, 'Quick', 'bronze'], [100, 'Nimble', 'silver'], [250, 'Blur', 'gold'], [500, 'Phantom', 'legend', 'Phantom']]],
  ['INT', 'Intelligence', 'scroll', 'Intelligence', [[25, 'Sharp', 'bronze'], [100, 'Scholar', 'silver'], [250, 'Mastermind', 'gold'], [500, 'Sage', 'legend', 'Sage']]],
  ['PER', 'Perception', 'eye', 'Perception', [[25, 'Observant', 'bronze'], [100, 'Keen Eye', 'silver'], [250, 'Hawkeye', 'gold'], [500, 'All-Seeing', 'legend', 'All-Seeing']]],
  ['days', 'Veteran', 'calendar', 'days since you started', [
    [7, 'First Week', 'bronze'], [30, 'One Month In', 'bronze'], [100, 'Hundred Days', 'silver'], [200, 'Two Hundred Days', 'gold'], [365, 'One Year', 'legend', 'Founder']]],
];

export const LIST = [];
GROUPS.forEach(([counter, group, icon, unit, rows]) => rows.forEach(([n, name, tier, title]) => {
  LIST.push({ id: `${counter}-${n}`, counter, group, icon, unit, need: n, name, tier, title: title || null,
    desc: counter === 'bestStreak' ? `Reach a ${n}-day quest streak` : counter === 'level' ? `Reach level ${n}` : counter === 'gold' ? `Earn ${n.toLocaleString()} gold in total` : ['STR','VIT','AGI','INT','PER'].includes(counter) ? `Reach ${n} ${unit}` : counter === 'xp' ? `Earn ${n.toLocaleString()} XP in total` : counter === 'spent' ? `Spend ${n.toLocaleString()} gold in total` : counter === 'days' ? `Play for ${n} days` : counter === 'habitStreak' ? `Keep one habit going ${n} days in a row` : `${n.toLocaleString()} ${n === 1 ? unit.replace(/s\b/, '') : unit}` });
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
  let B = 0; let morning = 0; let night = 0; let weekend = 0;
  for (const q of Object.values(state.quests || {})) {
    if (!q.done) continue;
    if ((RI[q.paidRank || E.rankOf(q, s)] ?? 0) >= RI.B) B++;
    if (!q.doneAt) continue;
    const d = new Date(q.doneAt); const hr = d.getHours(); const dow = d.getDay();
    if (hr < 9 && hr >= 4) morning++;
    if (hr >= 22 || hr < 4) night++;
    if (dow === 0 || dow === 6) weekend++;
  }
  const boosters = new Set((state.shop || []).filter((i) => i.grants?.type === 'boost').map((i) => i.id));
  const boosts = (state.purchases || []).filter((p) => boosters.has(p.itemId)).length;
  const habitStreak = Math.max(0, ...Object.values(state.habitStreaks || {}).map(Number).filter(Number.isFinite));
  const days = state.createdAt ? Math.max(0, Math.floor((Date.now() - Date.parse(state.createdAt)) / 864e5)) : 0;
  const stats = {}; ['STR', 'VIT', 'AGI', 'INT', 'PER'].forEach((k) => { stats[k] = state.stats?.[k] || 0; });
  return { quests, S, A, B, early, morning, night, weekend, sessions, habits, habitStreak, days, ...stats,
    cycles: Math.max(0, (state.cycle?.index || 1) - 1), xp: Math.round(state.xp || 0), spent: Math.round(state.lifetimeSpent || 0),
    boosts, daysOff: (state.daysOff || []).length,
    bestStreak: state.questStreak || 0, level: state.level || 1,
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
  const silent = !state.achInit || (state.achVersion || 1) < ACH_VERSION;
  state.achVersion = ACH_VERSION;
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
