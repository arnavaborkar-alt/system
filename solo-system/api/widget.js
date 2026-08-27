/**
 * GET /api/widget?key=<HUNTER_KEY>
 * Compact summary for the iOS Scriptable widget. Read-only.
 */

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const crypto = require('crypto');
const LEGACY_KEY = 'solo-system:state';

const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();
const slotFor = (pass) => `solo-system:state:${sha(pass).toString('hex').slice(0, 24)}`;

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

const RANKS = ['E', 'D', 'C', 'B', 'A', 'S', 'S+'];

function todayKey(hour = 4) {
  const d = new Date();
  d.setHours(d.getHours() - hour);
  return d.toISOString().slice(0, 10);
}

function rankFor(q, s) {
  if (q.manualRank) return q.manualRank;
  const hay = `${q.title || ''} ${q.course || ''}`.toLowerCase();
  let score = s.baseScore ?? 2;
  const hits = Object.keys(s.keywordWeights || {}).filter((k) => hay.includes(k)).sort((a, b) => b.length - a.length);
  if (hits.length) score += s.keywordWeights[hits[0]];
  return RANKS[Math.max(0, Math.min(RANKS.length - 1, Math.round(score)))];
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);

  if (!allowList().length) return res.status(501).json({ error: 'HUNTER_KEYS not set' });
  if (!authorized(q.key)) return res.status(401).json({ error: 'Wrong key' });
  if (!URL_ || !TOKEN) return res.status(501).json({ error: 'No database connected' });

  const read = async (k) => {
    const r = await fetch(`${URL_}/get/${encodeURIComponent(k)}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const j = await r.json();
    return j.result ? JSON.parse(j.result) : null;
  };

  try {
    let st = await read(slotFor(q.key));
    if (!st && process.env.HUNTER_KEY && q.key === process.env.HUNTER_KEY) st = await read(LEGACY_KEY);
    if (!st) return res.status(200).json({ empty: true });

    const s = st.settings || {};
    const today = todayKey(s.dayResetHour ?? 4);
    const tomorrow = new Date(new Date(today + 'T12:00:00').getTime() + 86400000).toISOString().slice(0, 10);

    const open = Object.values(st.quests || {}).filter((x) => !x.done && !x.missed && !x.dismissed);
    const dk = (x) => x.dueKey || (x.due ? x.due.slice(0, 10) : null);
    const dueToday = open.filter((x) => dk(x) && dk(x) <= today);
    const dueTomorrow = open.filter((x) => dk(x) === tomorrow);

    const habitsToday = (st.habits || []).filter((h) => {
      if (h.paused) return false;
      const dow = new Date(today + 'T12:00:00').getDay();
      const sc = h.schedule || { type: 'daily' };
      if (sc.type === 'daily') return true;
      if (sc.type === 'weekdays') return dow >= 1 && dow <= 5;
      if (sc.type === 'days') return (sc.days || []).includes(dow);
      if (sc.type === 'monthly') return new Date(today + 'T12:00:00').getDate() === (sc.dayOfMonth || 1);
      return true;
    });
    const habitsDone = habitsToday.filter((h) => st.habitLog?.[today]?.[h.id]).length;

    const boost = (st.boosts || []).find((b) => b.day === today);
    let boostEnds = null;
    if (boost) {
      const d = new Date(`${tomorrow}T00:00:00Z`);
      d.setUTCHours(d.getUTCHours() + (s.dayResetHour ?? 4));
      boostEnds = d.toISOString();
    }

    return res.status(200).json({
      hunter: s.hunterName || 'Hunter',
      boost: boost ? { mult: boost.mult || 2, endsAt: boostEnds } : null,
      gold: Math.round(st.gold || 0),
      level: st.level || 1,
      dayOff: (st.daysOff || []).includes(today),
      gymDone: !!st.gymLog?.[today]?.done,
      habits: { done: habitsDone, total: habitsToday.length },
      quests: {
        dueToday: dueToday.length,
        dueTomorrow: dueTomorrow.length,
        top: dueToday
          .map((x) => ({ title: x.title, course: x.course, rank: rankFor(x, s) }))
          .sort((a, b) => RANKS.indexOf(b.rank) - RANKS.indexOf(a.rank))
          .slice(0, 4),
      },
      updatedAt: st.updatedAt || null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
