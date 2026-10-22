/* ============================================================
   PLANNER — turns the "Find my plan" answers into a training cycle.
   Pure functions: no DOM, no store. Everything comes in as arguments,
   so it can be tested on its own.

   The rules follow a simple chain:
     days per week  -> split   (5-6 push/pull/legs, 4 upper/lower, 2-3 full body)
     minutes        -> how many exercises fit in a session
     tested maxes   -> which rung of each ladder to start on, and at how many reps
     goal / focus   -> what gets priority, what gets added (conditioning, skills)
     avoid          -> what gets swapped out
   ============================================================ */

export const GOALS = {
  aesthetic: { label: 'Aesthetic build', blurb: 'V-taper, size and definition' },
  strength: { label: 'Get stronger', blurb: 'Harder movements, lower reps' },
  fatloss: { label: 'Lean out', blurb: 'Keep muscle, add conditioning' },
  athletic: { label: 'Athletic', blurb: 'Power, stamina and speed' },
  skills: { label: 'Calisthenics skills', blurb: 'Handstand, L-sit, planche' },
};
export const SKILLS = { handstand: 'Handstand', lsit: 'L-sit', planche: 'Planche' };
export const EQUIPMENT = {
  none: { label: 'Just my body', blurb: 'Floor, a wall, a sturdy table' },
  bar: { label: 'Home + pull-up bar', blurb: 'Bar, plus chairs or parallettes' },
  gym: { label: 'Gym', blurb: 'Barbell, rack, bench, pull-up bar' },
};
export const FOCUS = { chest: 'Chest', back: 'Back / V-taper', shoulders: 'Shoulders', arms: 'Arms', legs: 'Legs', core: 'Core' };
export const AVOID = { knees: 'Go easy on knees', wrists: 'Go easy on wrists' };
export const LIFTING = { new: 'New to lifting', some: 'A few months', years: '2+ years' };
export const PISTOL = { none: 'Not yet', negative: 'Slow negatives', some: 'A few reps' };

/** 4 full weeks, so the weekly pattern always lines up with the calendar. */
export const CYCLE_LEN = 28;

export const DEFAULT_PROFILE = {
  goal: 'aesthetic',
  skill: 'handstand',
  target: 'school',        // which plan slot this fills: school | summer
  equipment: 'bar',
  days: 4,
  minutes: 45,
  pushups: 10,
  pullups: 2,
  squats: 25,
  plank: 40,
  pistol: 'none',
  bodyweightLb: 150,
  lifting: 'new',
  focus: [],
  avoid: [],
};

const clampInt = (v, lo, hi, d) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const pick = (v, allowed, d) => (allowed.includes(v) ? v : d);

/** Whatever the form sends, this always returns something safe to plan from. */
export function cleanProfile(p = {}) {
  const d = DEFAULT_PROFILE;
  return {
    goal: pick(p.goal, Object.keys(GOALS), d.goal),
    skill: pick(p.skill, Object.keys(SKILLS), d.skill),
    target: pick(p.target, ['school', 'summer'], d.target),
    equipment: pick(p.equipment, Object.keys(EQUIPMENT), d.equipment),
    days: clampInt(p.days, 2, 6, d.days),
    minutes: clampInt(p.minutes, 15, 120, d.minutes),
    pushups: clampInt(p.pushups, 0, 200, d.pushups),
    pullups: clampInt(p.pullups, 0, 60, d.pullups),
    squats: clampInt(p.squats, 0, 300, d.squats),
    plank: clampInt(p.plank, 0, 600, d.plank),
    pistol: pick(p.pistol, Object.keys(PISTOL), d.pistol),
    bodyweightLb: clampInt(p.bodyweightLb, 70, 400, d.bodyweightLb),
    lifting: pick(p.lifting, Object.keys(LIFTING), d.lifting),
    focus: (Array.isArray(p.focus) ? p.focus : []).filter((f) => FOCUS[f]),
    avoid: (Array.isArray(p.avoid) ? p.avoid : []).filter((a) => AVOID[a]),
  };
}

/* ---------- levels ---------- */

/** Which band of an ascending threshold list `value` falls in, and how far through it. */
function locate(thr, value) {
  let i = 0;
  thr.forEach((t, k) => { if (value >= t) i = k; });
  const lo = thr[i];
  const hi = thr[i + 1] ?? lo * 1.4 + 6;
  return { i, pos: Math.min(1, Math.max(0, (value - lo) / (hi - lo))) };
}
const cap = (l, max) => (l.i > max ? { i: max, pos: 0.5 } : l);

// Tested max needed before starting on each rung.
const PUSH_THR = [0, 6, 12, 20, 26, 32, 42, 55, 70];   // push ladder, by rung index
const PULL_THR = [0, 4, 9, 12, 16, 20];                // for PULL_RUNGS below
const PULL_RUNGS = [2, 3, 4, 5, 6, 7];
const LEG_THR = [0, 25, 45];                           // legs rungs 0..2
const SHOULDER_THR = [8, 20, 32, 45];                  // shoulder rungs 0..3

function levels(p) {
  const gym = p.equipment === 'gym';
  const knees = p.avoid.includes('knees');
  const wrists = p.avoid.includes('wrists');

  const push = cap(locate(PUSH_THR, p.pushups), wrists ? 6 : 8);

  const pu = locate(PULL_THR, p.pullups);
  const pullRung = PULL_RUNGS[Math.min(pu.i, gym ? 5 : 4)];
  let pullList;
  if (p.equipment === 'none') pullList = [1];                       // inverted rows only
  else if (p.pullups < 4) pullList = [2, 1, 0];                     // negatives, rows, hangs
  else pullList = [pullRung, pullRung >= 5 ? 4 : pullRung === 4 ? 5 : 4, 1];

  const lg = locate(LEG_THR, p.squats);
  const legRung = Math.min(lg.i, knees ? 1 : 2);
  const legsList = [legRung];
  if (legRung < 2) legsList.push(legRung + 1);
  else if (!knees && p.pistol === 'some') legsList.push(5);
  else if (!knees && p.pistol === 'negative') legsList.push(4);
  else legsList.push(1);
  if (!knees && p.goal === 'athletic') legsList.push(3);            // jump squat
  else if (!knees && legRung === 2 && p.pistol !== 'none') legsList.push(p.pistol === 'some' ? 5 : 4);
  if (knees) { while (legsList.length && legsList[legsList.length - 1] > 1) legsList.pop(); }

  const shoulder = p.pushups >= SHOULDER_THR[0] ? cap(locate(SHOULDER_THR, p.pushups), wrists ? 1 : 3) : null;

  let dip = null;
  if (p.equipment !== 'none') dip = p.pushups >= 18 ? 1 : 0;
  else dip = 0;                                                      // bench dip off a chair
  if (gym && p.pushups >= 35 && p.lifting !== 'new') dip = 2;

  // core: plank hold decides how hard to start
  let coreList;
  const bar = p.equipment !== 'none';
  if (p.plank < 30) coreList = [1];
  else if (p.plank < 60) coreList = [0, 1];
  else if (p.plank < 90) coreList = [2, 1];
  else if (bar && p.pullups >= 8 && p.plank >= 120) coreList = [4, 3];
  else if (bar) coreList = [3, 2];
  else coreList = [2, 1];

  // conditioning: sprints for athletes, otherwise a jog that scales with fitness
  let cond = 0;
  if (!knees && p.goal === 'athletic') cond = 2;
  else if (p.pushups >= 20 && p.squats >= 40) cond = 1;

  const pushSecond = push.i === 2 ? 3 : push.i === 3 ? 2 : Math.max(2, push.i - 2);

  return { push, pushSecond, pullList, legsList, shoulder, dip, coreList, cond, pu };
}

/* ---------- barbell starting loads ---------- */
// Fraction of bodyweight at [new, a few months, 2+ years].
const LIFT = {
  0: [0.15, 0.22, 0.28],   // goblet squat (dumbbell)
  1: [0.40, 0.70, 1.00],   // back squat
  2: [0.35, 0.60, 0.85],   // bench press
  3: [0.25, 0.40, 0.55],   // overhead press
  4: [0.45, 0.70, 1.00],   // romanian deadlift
  5: [0.35, 0.55, 0.75],   // barbell row
};
function startLoad(rung, p) {
  const f = LIFT[rung][['new', 'some', 'years'].indexOf(p.lifting)];
  const floor = rung === 0 ? 10 : 45;      // a dumbbell vs. the empty bar
  return Math.max(floor, Math.round((p.bodyweightLb * f) / 5) * 5);
}

/* ---------- sessions ---------- */
const SESSION = {
  PUSH: { label: 'Push', pats: ['push', 'shoulder', 'dip', 'push2', 'core', 'core2'] },
  PULL: { label: 'Pull', pats: ['pull', 'pull2', 'pull3', 'core', 'core2'] },
  LEGS: { label: 'Legs', pats: ['legs', 'legs2', 'legs3', 'core', 'cond'] },
  UPPER: { label: 'Upper', pats: ['push', 'pull', 'shoulder', 'pull2', 'dip', 'push2', 'core'] },
  LOWER: { label: 'Lower', pats: ['legs', 'legs2', 'legs3', 'core', 'core2', 'cond'] },
  FULL: { label: 'Full body', pats: ['push', 'pull', 'legs', 'core', 'shoulder', 'legs2', 'pull2', 'dip', 'core2'] },
  COND: { label: 'Conditioning', pats: ['cond', 'core'] },
};
const AREA = {
  push: 'chest', push2: 'chest', dip: 'arms', shoulder: 'shoulders',
  pull: 'back', pull2: 'back', pull3: 'arms',
  legs: 'legs', legs2: 'legs', legs3: 'legs', core: 'core', core2: 'core',
  skill: 'shoulders', skill2: 'shoulders',
};
const WEEK = {
  6: ['PUSH', 'PULL', 'LEGS', 'PUSH', 'PULL', 'LEGS', null],
  5: ['PUSH', 'PULL', 'LEGS', null, 'UPPER', 'LOWER', null],
  4: ['UPPER', 'LOWER', null, 'UPPER', 'LOWER', null, null],
  3: ['FULL', null, 'FULL', null, 'FULL', null, null],
  2: ['FULL', null, null, 'FULL', null, null, null],
};
const SPLIT_NAME = { 6: 'Push / Pull / Legs', 5: 'Push / Pull / Legs + Upper / Lower', 4: 'Upper / Lower', 3: 'Full body', 2: 'Full body' };

/** Resolves one named slot ("push", "legs2"...) to a concrete plan entry, or null. */
function resolve(name, c) {
  const { p, L, mk } = c;
  const gym = p.equipment === 'gym';
  const knees = p.avoid.includes('knees');
  const wrists = p.avoid.includes('wrists');

  switch (name) {
    case 'push':
      return gym ? mk('barbell', 2, { weight: startLoad(2, p), primary: true })
        : mk('push', L.push.i, { pos: L.push.pos, primary: true });
    case 'push2':
      return gym ? mk('push', Math.max(2, Math.min(L.push.i, 6)), { pos: 0.4 })
        : mk('push', L.pushSecond, { pos: 0.3 });
    case 'shoulder':
      if (gym) return mk('barbell', 3, { weight: startLoad(3, p) });
      return L.shoulder ? mk('shoulder', L.shoulder.i, { pos: L.shoulder.pos }) : null;
    case 'dip':
      return L.dip == null ? null : mk('dip', L.dip, { pos: 0.3 });

    case 'pull':
      if (p.equipment === 'none') return mk('pull', 1, { pos: 0.3, extraSet: true, primary: true });
      return mk('pull', L.pullList[0], { pos: L.pu.pos, primary: true });
    case 'pull2':
      if (gym) return mk('barbell', 5, { weight: startLoad(5, p) });
      return p.equipment === 'none' ? null : mk('pull', L.pullList[1], { pos: 0.3 });
    case 'pull3':
      return p.equipment === 'none' ? null : mk('pull', L.pullList[2], { pos: 0.3 });

    case 'legs':
      if (gym) return knees || p.lifting === 'new' ? mk('barbell', 0, { weight: startLoad(0, p), primary: true })
        : mk('barbell', 1, { weight: startLoad(1, p), primary: true });
      return mk('legs', L.legsList[0], { pos: 0.3, primary: true });
    case 'legs2':
      if (gym) return mk('barbell', 4, { weight: startLoad(4, p) });
      return L.legsList[1] != null ? mk('legs', L.legsList[1], { pos: 0.2 }) : null;
    case 'legs3':
      if (gym) return mk('legs', knees ? 1 : 2, { pos: 0.2 });
      return L.legsList[2] != null ? mk('legs', L.legsList[2], { pos: 0.2 }) : null;

    case 'core': return mk('core', L.coreList[0], { pos: 0.3 });
    case 'core2': return L.coreList[1] != null ? mk('core', L.coreList[1], { pos: 0.3 }) : null;

    case 'cond': return mk('conditioning', L.cond, { pos: 0.2 });

    case 'skill': {
      if (wrists) return null;
      if (p.goal !== 'skills') return null;
      if (p.skill === 'handstand') return mk('skill', p.pushups >= 10 ? 1 : 0, { pos: 0.2 });
      if (p.skill === 'lsit') return mk('skill', p.plank >= 40 ? 2 : 0, { pos: 0.2 });
      return mk('skill', p.pushups >= 25 ? 4 : 0, { pos: 0.1 });     // planche
    }
    case 'skill2': {
      if (wrists || p.goal !== 'skills') return null;
      if (p.skill === 'handstand' && p.pushups >= 10) return mk('skill', 0, { pos: 0.2 });
      if (p.skill === 'planche' && p.pushups >= 25) return mk('skill', 0, { pos: 0.2 });
      if (p.skill === 'planche') return L.shoulder ? mk('shoulder', 0, { pos: 0.2 }) : null;
      return null;
    }
    default: return null;
  }
}

function assemble(kind, c) {
  const { p } = c;
  let pats = [...SESSION[kind].pats];

  if (kind !== 'COND' && p.goal === 'skills') pats.splice(1, 0, 'skill', 'skill2');
  if ((p.goal === 'fatloss' || p.goal === 'athletic') && ['LEGS', 'LOWER', 'FULL'].includes(kind)) {
    pats = pats.filter((x) => x !== 'cond');
    pats.splice(Math.min(3, pats.length), 0, 'cond');
  }

  // Focus areas climb the list, but never ahead of the lead lift.
  const ranked = pats
    .map((x, i) => ({ x, k: i === 0 ? -99 : i - (p.focus.includes(AREA[x]) ? 2.5 : 0) }))
    .sort((a, b) => a.k - b.k);

  const out = [];
  const seen = new Set();
  for (const { x } of ranked) {
    if (out.length >= c.slots) break;
    const e = resolve(x, c);
    if (!e) continue;
    const id = `${e.ladder}:${e.rung}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(e);
  }
  return out;
}

/* ---------- the entry point ---------- */
export function buildPlan(rawProfile, ladders) {
  const p = cleanProfile(rawProfile);
  const L = levels(p);
  const gym = p.equipment === 'gym';

  const slots = Math.min(7, Math.max(3, Math.round((p.minutes - 5) / 9)));
  const baseSets = p.minutes <= 20 ? 2 : 3;

  const mk = (ladder, rung, o = {}) => {
    const r = ladders?.[ladder]?.rungs?.[rung];
    if (!r) return null;
    let reps;
    if (p.goal === 'strength') reps = r.lo + Math.round((o.pos ?? 0.25) * (r.hi - r.lo) * 0.25);
    else reps = r.lo + Math.round((o.pos ?? 0.25) * (r.hi - r.lo) * 0.6);
    if (r.unit === 'sec') reps = Math.round(reps / 5) * 5;
    reps = Math.min(r.hi, Math.max(r.lo, reps));
    let sets = baseSets;
    if (o.primary && p.goal === 'strength' && p.minutes >= 45) sets += 1;
    if (o.extraSet) sets += 1;
    const e = { ladder, rung, sets, reps };
    if (ladders[ladder].weighted) e.weightLb = o.weight ?? 0;
    return e;
  };

  const ctx = { p, L, mk, slots };

  // weekly layout, plus conditioning days where there's room
  const week = [...WEEK[p.days]];
  const wantCond = p.goal === 'fatloss' ? 2 : p.goal === 'athletic' ? 1 : 0;
  const rest = week.map((k, i) => (k ? -1 : i)).filter((i) => i >= 0);
  const room = Math.max(0, rest.length - 1);                // always keep one true rest day
  let placed = 0;
  for (const i of [5, 2, 3, 1, 6, 4]) {
    if (placed >= Math.min(wantCond, room)) break;
    if (week[i] === null) { week[i] = 'COND'; placed++; }
  }

  const sessions = {};
  [...new Set(week.filter(Boolean))].forEach((k) => { sessions[k] = assemble(k, ctx); });

  const days = {};
  for (let d = 1; d <= CYCLE_LEN; d++) {
    const k = week[(d - 1) % 7];
    days[d] = k ? sessions[k].map((e) => ({ ...e })) : [];
  }

  const describe = (e) => {
    const r = ladders[e.ladder].rungs[e.rung];
    const unit = r.unit && r.unit !== 'reps' ? ` ${r.unit}` : '';
    return `${e.sets}×${e.reps}${unit} ${r.name}${e.weightLb ? ` @${e.weightLb}lb` : ''}`;
  };
  const summary = week.map((k, i) => ({
    day: i + 1,
    kind: k,
    label: k ? SESSION[k].label : 'Rest',
    items: k ? sessions[k].map(describe) : [],
  }));

  /* ---- notes the hunter should actually read ---- */
  const notes = [];
  notes.push('Take every set to within a rep or two of failure. On the last set of each move, go past it: rest 10 seconds and squeeze out more reps, or lower slowly for 3 seconds.');
  notes.push(`This is a ${CYCLE_LEN}-day cycle. Clear 85% of its sessions and every move gets harder next cycle: more reps, then a tougher variation${gym ? ', then +5 lb' : ''}.`);
  if (p.equipment === 'none') notes.push('No bar: rows go under a sturdy table. A doorway pull-up bar is the best upgrade you can make for back and arm work.');
  if (gym) notes.push('Starting weights are estimates from your bodyweight. Use the first week to find a weight where the last set is hard, and fix the number under System → Gym plan.');
  if (p.avoid.includes('knees')) notes.push('Knees: jumps, pistols and deep split squats are left out. Stop each rep at a depth that feels fine.');
  if (p.avoid.includes('wrists')) notes.push('Wrists: handstand, planche and L-sit work is left out. Push-ups on fists or parallettes keep the wrist straight.');
  if (p.goal === 'fatloss') notes.push('Fat loss happens in the kitchen. Roughly 1 g of protein per lb of goal bodyweight keeps muscle while you cut.');
  if (p.goal === 'skills' && p.avoid.includes('wrists')) notes.push('Skills goal with sore wrists: the skill holds are skipped for now, so this plan is mostly strength work toward them.');
  if (p.pullups === 0 && p.equipment !== 'none') notes.push('Zero pull-ups yet: negatives (jump up, lower for 3 to 5 seconds) are the fastest way to your first one.');

  const gymName = gym ? 'Gym' : 'Home';
  return {
    profile: p,
    name: `${GOALS[p.goal].label} — ${p.days}-day ${SPLIT_NAME[p.days]}`,
    location: gym ? 'gym' : 'home',
    days,
    len: CYCLE_LEN,
    split: SPLIT_NAME[p.days],
    exercisesPerSession: slots,
    where: gymName,
    summary,
    notes,
  };
}
