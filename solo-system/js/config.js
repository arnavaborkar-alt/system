/* ============================================================
   SYSTEM — default configuration
   Every value here is editable at runtime in Settings.
   This file is only the starting state.
   ============================================================ */

export const RANKS = ['E', 'D', 'C', 'B', 'A', 'S', 'S+'];

/** 'S+' can't be a CSS class on its own, so styling uses this. */
export const rankClass = (r) => (r === 'S+' ? 'SS' : r);

export const DEFAULT_SETTINGS = {
  hunterName: 'Hunter',
  schoolYearEnd: '2027-06-11',   // after this date the Summer plan takes over
  season: 'auto',                // 'auto' | 'school' | 'summer'
  dayResetHour: 4,               // a "day" rolls over at 4am, not midnight

  // ---- Schoology ----
  icsUrl: '',
  todoistToken: '',
  autoSyncHours: 6,
  ignoreBefore: '',   // sync skips anything due before this date (YYYY-MM-DD)
  ignoreKeywords: ['attendance', 'no school', 'holiday', 'spirit week', 'assembly'],

  // ---- Gold paid per rank ----
  goldByRank: { E: 10, D: 25, C: 45, B: 80, A: 140, S: 240, 'S+': 400 },

  // ---- XP paid per rank ----
  xpByRank: { E: 6, D: 12, C: 22, B: 40, A: 70, S: 120, 'S+': 200 },

  // ---- Bonuses & penalties (multipliers / flat gold) ----
  earlyBonusPct: 15,        // finished >24h before due
  onTimeBonusPct: 0,        // finished on the due day
  latePenaltyPct: 40,       // finished after due date
  missedQuestPenalty: 30,   // flat gold lost when a quest expires unfinished
  streakBonusPct: 3,        // +3% gold per day of streak
  streakBonusMaxPct: 45,    // capped
  penaltiesEnabled: true,

  // ---- Difficulty scoring ----
  autoRate: true,
  baseScore: 2,
  keywordWeights: {
    'final exam': 4, 'final': 3, 'midterm': 3, 'exam': 3, 'test': 3,
    'research paper': 3, 'project': 2, 'essay': 2, 'lab report': 2,
    'presentation': 2, 'portfolio': 2, 'frq': 2, 'dbq': 3,
    'quiz': 1, 'lab': 1, 'problem set': 1, 'pset': 1, 'packet': 1,
    'homework': 0, 'hw': 0, 'worksheet': 0, 'practice': 0, 'classwork': 0,
    'review': 0, 'notes': -1, 'reading': -1, 'read': -1, 'watch': -1,
    'video': -1, 'discussion': -1, 'signature': -2, 'form': -2, 'survey': -2,
  },
  courseWeights: {},   // { "AP Chemistry": 1, "Gym": -1 } — set per class in Settings

  // ---- Gym ----
  gym: {
    cycleLength: 30,
    setsDefault: 3,
    deloadEveryNCycles: 4,     // every 4th cycle runs reduced volume
    deloadVolumePct: 60,
    progressThresholdPct: 85,  // hit this % of a cycle's sessions -> full progression
    holdThresholdPct: 60,      // below this -> repeat the block
    goldPerSession: 70,
    goldPerFullWeek: 150,      // bonus for clearing every training day in a week
    restDayGold: 0,
    autoAdvanceCycle: true,
  },

  // ---- Habits ----
  habits: { streakBonusGold: 5, streakBonusEvery: 7 },

  // ---- Shop ----
  shop: { refundPct: 0, allowNegativeGold: false },

  theme: { accent: '#38BDF8', gold: '#F5C542' },
};

/* ============================================================
   LEVEL CURVE — total XP required to reach each level
   ============================================================ */
export const XP_BASE = 90;
export const XP_CURVE = 1.55;

export function xpForLevel(level) {
  // Level 1 must sit at 0 XP, or the progress readout goes negative
  // and every level costs one level's worth of XP too much.
  return Math.round(XP_BASE * Math.pow(Math.max(0, level - 1), XP_CURVE));
}

/** No level ceiling. Inverts the curve directly, then nudges for rounding,
 *  so there's no loop bound to run into however far someone gets. */
export function levelForXp(xp) {
  const x = Math.max(0, Number(xp) || 0);
  if (!isFinite(x) || x < xpForLevel(2)) return 1;
  let l = Math.floor(Math.pow(x / XP_BASE, 1 / XP_CURVE)) + 1;
  if (!isFinite(l) || l < 1) return 1;
  while (l > 1 && xpForLevel(l) > x) l--;
  while (xpForLevel(l + 1) <= x) l++;
  return l;
}

export const HUNTER_RANK_BY_LEVEL = [
  { min: 1, rank: 'E', title: 'E-Rank Hunter' },
  { min: 10, rank: 'D', title: 'D-Rank Hunter' },
  { min: 20, rank: 'C', title: 'C-Rank Hunter' },
  { min: 32, rank: 'B', title: 'B-Rank Hunter' },
  { min: 46, rank: 'A', title: 'A-Rank Hunter' },
  { min: 62, rank: 'S', title: 'S-Rank Hunter' },
  { min: 80, rank: 'S+', title: 'National Level' },
  { min: 100, rank: 'S+', title: 'Monarch' },
  { min: 130, rank: 'S+', title: 'Absolute Monarch' },
  { min: 170, rank: 'S+', title: 'Ruler' },
  { min: 220, rank: 'S+', title: 'Sovereign' },
];

/* ============================================================
   PROGRESSION LADDERS
   Each exercise sits on a ladder. Reps climb from lo to hi,
   then the exercise advances to the next rung and resets to lo.
   Fully editable — add, remove or reorder rungs in Settings.
   ============================================================ */
export const LADDERS = {
  push: {
    label: 'Push',
    stat: 'STR',
    rungs: [
      { name: 'Incline push-up', lo: 8, hi: 16 },
      { name: 'Knee push-up', lo: 8, hi: 16 },
      { name: 'Push-up', lo: 8, hi: 20 },
      { name: 'Wide push-up', lo: 10, hi: 20 },
      { name: 'Diamond push-up', lo: 8, hi: 16 },
      { name: 'Decline push-up', lo: 6, hi: 16 },
      { name: 'Archer push-up', lo: 5, hi: 12 },
      { name: 'Pseudo-planche push-up', lo: 5, hi: 12 },
      { name: 'One-arm negative push-up', lo: 3, hi: 8 },
    ],
  },
  pull: {
    label: 'Pull',
    stat: 'STR',
    rungs: [
      { name: 'Dead hang', lo: 20, hi: 60, unit: 'sec' },
      { name: 'Inverted row', lo: 8, hi: 16 },
      { name: 'Negative pull-up', lo: 3, hi: 8 },
      { name: 'Pull-up', lo: 3, hi: 10 },
      { name: 'Chin-up', lo: 5, hi: 12 },
      { name: 'Wide-grip pull-up', lo: 5, hi: 12 },
      { name: 'Archer pull-up', lo: 4, hi: 10 },
      { name: 'Weighted pull-up', lo: 4, hi: 10 },
    ],
  },
  legs: {
    label: 'Legs',
    stat: 'VIT',
    rungs: [
      { name: 'Bodyweight squat', lo: 15, hi: 30 },
      { name: 'Split squat', lo: 10, hi: 20 },
      { name: 'Bulgarian split squat', lo: 8, hi: 16 },
      { name: 'Jump squat', lo: 10, hi: 20 },
      { name: 'Pistol squat negative', lo: 5, hi: 10 },
      { name: 'Pistol squat', lo: 3, hi: 8 },
    ],
  },
  core: {
    label: 'Core',
    stat: 'VIT',
    rungs: [
      { name: 'Plank', lo: 30, hi: 90, unit: 'sec' },
      { name: 'Lying leg raise', lo: 8, hi: 20 },
      { name: 'Hollow body hold', lo: 20, hi: 60, unit: 'sec' },
      { name: 'Hanging knee raise', lo: 6, hi: 15 },
      { name: 'Hanging leg raise', lo: 5, hi: 12 },
      { name: 'Toes-to-bar', lo: 4, hi: 10 },
    ],
  },
  dip: {
    label: 'Dip',
    stat: 'STR',
    rungs: [
      { name: 'Bench dip', lo: 8, hi: 20 },
      { name: 'Parallel bar dip', lo: 5, hi: 15 },
      { name: 'Weighted dip', lo: 5, hi: 12 },
    ],
  },
  conditioning: {
    label: 'Conditioning',
    stat: 'AGI',
    rungs: [
      { name: 'Jog', lo: 10, hi: 25, unit: 'min' },
      { name: 'Run', lo: 15, hi: 35, unit: 'min' },
      { name: 'Interval sprints', lo: 6, hi: 14, unit: 'rounds' },
    ],
  },
  // Summer / gym-floor ladders use load, not variation.
  barbell: {
    label: 'Barbell',
    stat: 'STR',
    weighted: true,
    incrementLb: 5,
    rungs: [
      { name: 'Goblet squat', lo: 8, hi: 12 },
      { name: 'Back squat', lo: 5, hi: 10 },
      { name: 'Bench press', lo: 5, hi: 10 },
      { name: 'Overhead press', lo: 5, hi: 10 },
      { name: 'Romanian deadlift', lo: 6, hi: 12 },
      { name: 'Barbell row', lo: 6, hi: 12 },
    ],
  },
};

/* ============================================================
   DEFAULT 30-DAY PLANS
   dayOfCycle 1..30. Empty array = rest day.
   ============================================================ */
function homeCycle() {
  const P = (l, r) => ({ ladder: l, rung: r, sets: 3 });
  const push = [P('push', 2), P('dip', 0), P('core', 0)];
  const pull = [P('pull', 2), P('core', 1)];
  const legs = [P('legs', 0), P('legs', 1), P('core', 2)];
  const cond = [P('conditioning', 0)];
  const week = [push, pull, legs, [], push, cond, []];
  const days = {};
  for (let d = 1; d <= 30; d++) days[d] = week[(d - 1) % 7].map((e) => ({ ...e }));
  return days;
}

function summerCycle() {
  const P = (l, r) => ({ ladder: l, rung: r, sets: 3 });
  const upper = [P('barbell', 2), P('barbell', 5), P('pull', 3), P('core', 3)];
  const lower = [P('barbell', 1), P('barbell', 4), P('legs', 2), P('core', 1)];
  const full = [P('barbell', 3), P('dip', 1), P('pull', 4), P('core', 4)];
  const cond = [P('conditioning', 1)];
  const week = [upper, lower, [], full, cond, upper, []];
  const days = {};
  for (let d = 1; d <= 30; d++) days[d] = week[(d - 1) % 7].map((e) => ({ ...e }));
  return days;
}

export const DEFAULT_PLANS = {
  school: { name: 'School Year — Home', location: 'home', days: homeCycle() },
  summer: { name: 'Summer — Gym Floor', location: 'gym', days: summerCycle() },
};

/* ============================================================
   DEFAULT SHOP
   Prices assume ~250-450 gold/day when you're actually consistent.
   cooldownDays stops you stacking rewards back to back.
   ============================================================ */
export const DEFAULT_SHOP = [
  { id: 's1', name: 'Skip one habit', desc: 'Clear a single habit without doing it. No penalty.', price: 250, cooldownDays: 2, icon: '◈', grants: { type: 'habitSkip', n: 1 } },
  { id: 's2', name: 'Cheat meal', desc: 'Whatever you want, guilt-free.', price: 400, cooldownDays: 3, icon: '◆', grants: null },
  { id: 's3', name: 'Rest day (gym)', desc: 'Skip one training day. Streak stays alive.', price: 550, cooldownDays: 5, icon: '◇', grants: { type: 'gymRest', days: 1 } },
  { id: 's4', name: '2 hours of gaming', desc: 'Blocked-off time, nothing owed.', price: 700, cooldownDays: 2, icon: '⬗', grants: null },
  { id: 's5', name: 'Late night pass', desc: 'Stay up as late as you want, once.', price: 900, cooldownDays: 7, icon: '☾', grants: null },
  { id: 's9', name: 'Double gold & XP', desc: 'Everything you clear for one day pays twice. Not usable on a day off.', price: 1200, cooldownDays: 5, icon: '✦', grants: { type: 'boost', days: 1, mult: 2 } },
  { id: 's6', name: 'Full day off', desc: 'No quests, no training, no habits. Nothing counts against you.', price: 3500, cooldownDays: 14, icon: '★', grants: { type: 'dayOff', days: 1 } },
  { id: 's7', name: 'Weekend off', desc: 'Two consecutive days, fully clear.', price: 6000, cooldownDays: 30, icon: '✦', grants: { type: 'dayOff', days: 2 } },
  { id: 's8', name: 'Vacation week', desc: 'Seven days off. Everything pauses, nothing decays.', price: 20000, cooldownDays: 120, icon: '✵', grants: { type: 'dayOff', days: 7 } },
];

/* ============================================================
   DEFAULT HABITS
   schedule: { type: 'daily' | 'weekdays' | 'days' | 'monthly', days: [0..6] }
   0 = Sunday
   ============================================================ */
export const DEFAULT_HABITS = [
  { id: 'h1', name: 'Laundry', gold: 120, stat: 'PER', schedule: { type: 'days', days: [6] }, penalty: 40 },
  { id: 'h2', name: 'Make the bed', gold: 20, stat: 'PER', schedule: { type: 'daily' }, penalty: 10 },
  { id: 'h3', name: 'Clean room', gold: 90, stat: 'PER', schedule: { type: 'days', days: [0] }, penalty: 30 },
  { id: 'h4', name: 'Read 20 min', gold: 45, stat: 'INT', schedule: { type: 'daily' }, penalty: 15 },
  { id: 'h5', name: 'Dishes', gold: 35, stat: 'PER', schedule: { type: 'weekdays' }, penalty: 15 },
  { id: 'h6', name: 'Water — 8 glasses', gold: 30, stat: 'VIT', schedule: { type: 'daily' }, penalty: 10 },
  { id: 'h7', name: 'In bed by 11', gold: 60, stat: 'VIT', schedule: { type: 'daily' }, penalty: 25 },
];

export const STATS = ['STR', 'VIT', 'AGI', 'INT', 'PER'];

export const STAT_LABEL = {
  STR: 'Strength', VIT: 'Vitality', AGI: 'Agility',
  INT: 'Intelligence', PER: 'Perception',
};
