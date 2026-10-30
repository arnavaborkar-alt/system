/* ============================================================
   BOSS GATES — one boss a week.
   Its health is set when the week starts (scaled to your level) and
   every quest, habit, session and perfect day hurts it. Damage is
   DERIVED from the logs, so undoing something heals it. Beat it by
   Sunday and it pays out; a defeated boss left unclaimed pays itself.
   ============================================================ */
import { todayKey, dateKey, addDays } from './store.js';
import * as E from './engine.js';

export const queue = [];

const RANK_DMG = { E: 2, D: 3, C: 5, B: 8, A: 13, S: 21, 'S+': 34 };
const HABIT_DMG = 1; const GYM_DMG = 8; const PERFECT_DMG = 10;

const NAMES = [
  ['Cave Goblin', 'Bog Troll', 'Mine Lurker', 'Rat King'],
  ['Orc Chieftain', 'Stone Golem', 'Frost Warg', 'Crypt Warden'],
  ['Naga Queen', 'Iron Knight', 'Ashen Wyvern', 'Plague Druid'],
  ['Hollow Titan', 'Dread Hydra', 'Blood Baron', 'Storm Colossus'],
  ['Void Tyrant', 'Abyssal Drake', 'Doom Sovereign', 'Eclipse Wraith'],
];
const hash = (str) => { let x = 2166136261; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };

export const weekKey = (settings) => { const t = todayKey(settings); return addDays(t, -((new Date(t + 'T12:00:00').getDay() + 6) % 7)); };
const eachDay = (a, b) => { const out = []; for (let k = a; k <= b; k = addDays(k, 1)) out.push(k); return out; };
const doneDay = (q, settings) => dateKey(new Date(Date.parse(q.doneAt) - (settings.dayResetHour ?? 4) * 3600000));

export function spawn(state, key) {
  const level = state.level || 1;
  const diff = state.settings.challengeScale ?? 1;
  const tier = Math.min(NAMES.length - 1, Math.floor(level / 12));
  const names = NAMES[tier];
  const maxHp = Math.max(40, Math.round((70 + level * 3.2) * diff));
  return {
    key, name: names[hash(key + tier) % names.length], tier, maxHp,
    rewardGold: Math.round(maxHp * 3), rewardXp: E.scaleXp(state.settings, maxHp * 1.2),
    claimed: false,
  };
}

/** Damage dealt so far this boss week, with a breakdown for the UI. */
export function damage(state, boss = state.boss) {
  if (!boss) return { total: 0, quests: 0, habits: 0, sessions: 0, perfect: 0 };
  const s = state.settings;
  const a = boss.key; const b = addDays(a, 6);
  const today = todayKey(s);
  let quests = 0; let habits = 0; let sessions = 0; let perfect = 0;
  for (const q of Object.values(state.quests || {})) {
    if (!q.done || !q.doneAt) continue;
    const d = doneDay(q, s);
    if (d < a || d > b) continue;
    quests += RANK_DMG[q.paidRank || E.rankOf(q, s)] || 2;
  }
  eachDay(a, b).forEach((k) => {
    Object.values(state.habitLog?.[k] || {}).forEach((v) => { if (v !== false && v !== 'skipped') habits += HABIT_DMG; });
    if (state.gymLog?.[k]?.done) sessions += GYM_DMG;
    if (k < today && E.dayStatus(state, k).perfect) perfect += PERFECT_DMG;
  });
  return { total: quests + habits + sessions + perfect, quests, habits, sessions, perfect };
}
export const isDefeated = (state, boss = state.boss) => !!boss && damage(state, boss).total >= boss.maxHp;
export const claimable = (state) => (state.settings.challengesEnabled !== false && state.boss && !state.boss.claimed && isDefeated(state) ? 1 : 0);

function payOut(state, boss) {
  E.pay(state, boss.rewardGold, `Boss defeated: ${boss.name}`);
  const lv = E.grantBonusXp(state, boss.rewardXp);
  E.grantStat(state, ['STR', 'VIT', 'AGI', 'INT', 'PER'][hash(boss.key) % 5], 2);
  state.counters = state.counters || {};
  state.counters.bosses = (state.counters.bosses || 0) + 1;
  boss.claimed = true;
  if (lv) queue.push({ type: 'levelup', level: lv });
}

/** Run after every change: start a new boss on Monday and pay out a beaten one from last week. */
export function sync(state) {
  if (state.settings.bossEnabled === false) return;
  const key = weekKey(state.settings);
  const cur = state.boss;
  if (cur && cur.key === key) return;
  if (cur && !cur.claimed && isDefeated(state, cur)) {
    payOut(state, cur);
    queue.push({ type: 'auto', text: `${cur.name} paid out: +${cur.rewardGold}g, +${cur.rewardXp} XP` });
  } else if (cur && !cur.claimed) {
    queue.push({ type: 'auto', text: `${cur.name} got away. A new boss is here.` });
  }
  state.boss = spawn(state, key);
}

export function claim(state) {
  const boss = state.boss;
  if (!boss || boss.claimed || !isDefeated(state, boss)) return null;
  payOut(state, boss);
  return { gold: boss.rewardGold, xp: boss.rewardXp, name: boss.name };
}
