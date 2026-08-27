/**
 * GET /api/board  -> ranked standings for everyone who opted in.
 *
 * Only aggregate numbers leave the server. Quest titles, courses, Schoology
 * links and notes stay private to each hunter.
 */

const crypto = require('crypto');

/* ---------- shared board logic (inlined deliberately: no cross-file imports
     inside /api, so nothing depends on Vercel's helper-file conventions) ---------- */

const BOARD_KEY = 'solo-system:board';
const GOLD_PER_HOUR = 120;
const BURST_FLOOR = 500;
const DAILY_CAP = 1500;
const BASELINE_CAP = 50000;   // ceiling on a first-sighting starting line
const BOARD_V = 2;            // bump to re-baseline everyone after a scoring change

function normWeek(week) {
  const w = week || {};
  return {
    quests: Math.max(0, Number(w.quests) || 0),
    sessions: Math.min(7, Math.max(0, Number(w.sessions) || 0)),
    habits: Math.max(0, Number(w.habits) || 0),
    habitsDue: Math.max(0, Number(w.habitsDue) || 0),
  };
}

function xpForLevel(level) {
  return Math.round(90 * Math.pow(Math.max(0, level - 1), 1.55));
}
function levelFromXp(xp) {
  const x = Math.max(0, Number(xp) || 0);
  if (!isFinite(x) || x < xpForLevel(2)) return 1;
  let l = Math.floor(Math.pow(x / 90, 1 / 1.55)) + 1;
  if (!isFinite(l) || l < 1) return 1;
  while (l > 1 && xpForLevel(l) > x) l--;
  while (xpForLevel(l + 1) <= x) l++;
  return l;
}

async function readBoard(URL_, TOKEN) {
  try {
    const r = await fetch(`${URL_}/get/${encodeURIComponent(BOARD_KEY)}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!r.ok) return {};
    const j = await r.json();
    return j.result ? JSON.parse(j.result) : {};
  } catch { return {}; }
}

async function writeBoard(URL_, TOKEN, board) {
  await fetch(`${URL_}/set/${encodeURIComponent(BOARD_KEY)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'text/plain' },
    body: JSON.stringify(board),
  });
}

/** Fold one save into the board. Never trusts the numbers the browser sends. */
function scoreEntry(prev, state, now = Date.now()) {
  const e = prev || { verified: 0, claimed: 0, flags: [], firstSeen: now, writes: 0 };
  const flags = new Set();

  const claimed = Math.max(0, Number(state.lifetimeEarned) || 0);

  // First time the server sees this hunter there is no history to compare
  // against, so the save becomes the starting line rather than evidence of
  // anything. Rate checks begin from the next write on. BOARD_V bumps let a
  // scoring change re-baseline everyone once instead of flagging them all.
  if (!prev || prev.v !== BOARD_V) {
    const base = Math.min(BASELINE_CAP, claimed);
    const spent0 = Math.max(0, Number(state.lifetimeSpent) || 0);
    return {
      v: BOARD_V,
      slot: e.slot,
      name: String(state.board?.name || '').slice(0, 18) || 'Hunter',
      optIn: !!state.board?.optIn,
      verified: Math.round(base),
      gold: Math.round(Math.min(Math.max(0, Number(state.gold) || 0), Math.max(0, base - spent0))),
      spent: spent0,
      claimed,
      level: levelFromXp(state.xp),
      xp: Math.max(0, Number(state.xp) || 0),
      streak: Math.max(0, Number(state.questStreak) || 0),
      week: normWeek(state.__week),
      flags: [],
      firstSeen: e.firstSeen || now,
      lastWrite: now,
      writes: (e.writes || 0) + 1,
    };
  }

  const elapsedH = e.lastWrite ? Math.max(0, (now - e.lastWrite) / 3.6e6) : 24;
  const allowance = Math.min(DAILY_CAP, Math.max(BURST_FLOOR, elapsedH * GOLD_PER_HOUR));

  let delta = claimed - (e.claimed || 0);
  if (!isFinite(delta) || delta < 0) delta = 0;
  if (delta > allowance) { flags.add('rate'); delta = allowance; }

  const xp = Math.max(0, Number(state.xp) || 0);
  const trueLevel = levelFromXp(xp);
  if ((Number(state.level) || 1) > trueLevel + 1) flags.add('level');

  const verified = Math.round((e.verified || 0) + delta);
  const spent = Math.max(0, Number(state.lifetimeSpent) || 0);
  const ceiling = Math.max(0, verified - spent);
  const claimedGold = Math.max(0, Number(state.gold) || 0);
  if (claimedGold > ceiling + 1) flags.add('balance');
  const gold = Math.min(claimedGold, ceiling);

  if (e.lastWrite && now - e.lastWrite < 400) flags.add('spam');

  const week = state.__week || {};
  const keep = new Set([...(e.flags || []), ...flags]);

  return {
    v: BOARD_V,
    slot: e.slot,
    name: String(state.board?.name || '').slice(0, 18) || 'Hunter',
    optIn: !!state.board?.optIn,
    verified, gold, spent, claimed,
    level: trueLevel,
    xp,
    streak: Math.max(0, Number(state.questStreak) || 0),
    week: normWeek(week),
    flags: [...keep],
    firstSeen: e.firstSeen || now,
    lastWrite: now,
    writes: (e.writes || 0) + 1,
  };
}

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();
const slotFor = (pass) => sha(pass).toString('hex').slice(0, 24);

function allowList() {
  const raw = process.env.HUNTER_KEYS || process.env.HUNTER_KEY || '';
  return raw.split(',').map((x) => x.trim()).filter(Boolean);
}
function authorized(pass) {
  if (!pass) return false;
  const list = allowList();
  if (!list.length) return false;
  if (list.length === 1 && list[0].toLowerCase() === 'open') return pass.length >= 12;
  const given = sha(pass);
  return list.reduce((hit, k) => (crypto.timingSafeEqual(given, sha(k)) ? true : hit), false);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!allowList().length) return res.status(501).json({ error: 'Cloud sync is off.' });
  if (!URL_ || !TOKEN) return res.status(501).json({ error: 'No database connected.' });

  const pass = req.headers['x-hunter-key'] || '';
  if (!authorized(pass)) return res.status(401).json({ error: 'Wrong key.' });

  try {
    const board = await readBoard(URL_, TOKEN);
    const me = slotFor(pass);

    const rows = Object.values(board)
      .filter((e) => e && e.optIn)
      .map((e) => ({
        id: e.slot,
        me: e.slot === me,
        name: e.name || 'Hunter',
        level: e.level || 1,
        gold: e.gold || 0,
        earned: e.verified || 0,
        streak: e.streak || 0,
        week: e.week || { quests: 0, sessions: 0, habits: 0, habitsDue: 0 },
        flagged: (e.flags || []).length > 0,
        flags: e.flags || [],
        lastSeen: e.lastWrite || null,
      }))
      .sort((a, b) => b.gold - a.gold || b.earned - a.earned || b.level - a.level);

    rows.forEach((r, i) => { r.rank = i + 1; });

    return res.status(200).json({
      scoring: BOARD_V,
      rows,
      total: Object.keys(board).length,
      onBoard: rows.length,
      youOptedIn: !!board[me]?.optIn,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
