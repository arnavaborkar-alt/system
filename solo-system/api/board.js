/**
 * GET /api/board  -> standings for everyone who opted in.
 *
 * No anti-cheat here \u2014 whatever gold and level a save reports is what's shown.
 * Only aggregate numbers leave the server: quest titles, courses, Schoology
 * links and notes stay on each hunter's own save.
 */

const crypto = require('crypto');

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const BOARD_KEY = 'solo-system:board';

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

async function readBoard() {
  try {
    const r = await fetch(`${URL_}/get/${encodeURIComponent(BOARD_KEY)}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!r.ok) return {};
    const j = await r.json();
    return j.result ? JSON.parse(j.result) : {};
  } catch { return {}; }
}

function normWeek(week) {
  const w = week || {};
  return {
    quests: Math.max(0, Number(w.quests) || 0),
    sessions: Math.min(7, Math.max(0, Number(w.sessions) || 0)),
    habits: Math.max(0, Number(w.habits) || 0),
    habitsDue: Math.max(0, Number(w.habitsDue) || 0),
  };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!allowList().length) return res.status(501).json({ error: 'Cloud sync is off.' });
  if (!URL_ || !TOKEN) return res.status(501).json({ error: 'No database connected.' });

  const pass = req.headers['x-hunter-key'] || '';
  if (!authorized(pass)) return res.status(401).json({ error: 'Wrong key.' });

  try {
    const board = await readBoard();
    const me = slotFor(pass);

    const rows = Object.values(board)
      .filter((e) => e && e.optIn)
      .map((e) => ({
        id: e.slot,
        me: e.slot === me,
        name: e.name || 'Hunter',
        level: Math.max(1, Number(e.level) || 1),
        gold: Math.max(0, Number(e.gold) || 0),
        streak: Math.max(0, Number(e.streak) || 0),
        week: normWeek(e.week),
        lastSeen: e.lastWrite || null,
      }))
      .sort((a, b) => b.gold - a.gold || b.level - a.level);

    rows.forEach((r, i) => { r.rank = i + 1; });

    return res.status(200).json({
      rows,
      onBoard: rows.length,
      total: Object.keys(board).length,
      youOptedIn: !!board[me]?.optIn,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
