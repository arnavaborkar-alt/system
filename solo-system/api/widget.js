/**
 * GET /api/widget?key=<HUNTER_KEY>&tzo=<minutes>
 * Compact summary for the iOS Scriptable widget. Read-only.
 *
 * tzo is the phone's own UTC offset as JavaScript reports it (minutes, positive when
 * west of UTC). The server runs in UTC, so without it "today" would roll over at the
 * wrong hour for anyone who isn't on UTC.
 */

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const crypto = require('crypto');
const { RANKS, scoreQuest } = require('../lib/rank.js');
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

/** The hunter's local calendar day, with the day rolling over at `hour` local time. */
function todayKey(hour, tzo) {
  const localMs = Date.now() - tzo * 60000 - hour * 3600000;
  return new Date(localMs).toISOString().slice(0, 10);
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
    const hour = s.dayResetHour ?? 4;
    const tzo = Number.isFinite(Number(q.tzo)) ? Number(q.tzo) : 0;
    const today = todayKey(hour, tzo);
    const tomorrow = new Date(new Date(today + 'T12:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);

    const open = Object.values(st.quests || {}).filter((x) => !x.done && !x.missed && !x.dismissed);
    const dk = (x) => x.dueKey || (x.due ? x.due.slice(0, 10) : null);
    const dueToday = open.filter((x) => dk(x) && dk(x) <= today);
    const dueTomorrow = open.filter((x) => dk(x) === tomorrow);

    const dowToday = new Date(today + 'T12:00:00Z').getUTCDay();
    const dom = new Date(today + 'T12:00:00Z').getUTCDate();
    const habitsToday = (st.habits || []).filter((h) => {
      if (h.paused) return false;
      const sc = h.schedule || { type: 'daily' };
      if (sc.type === 'daily') return true;
      if (sc.type === 'weekdays') return dowToday >= 1 && dowToday <= 5;
      if (sc.type === 'days') return (sc.days || []).includes(dowToday);
      if (sc.type === 'monthly') return dom === (sc.dayOfMonth || 1);
      return true;
    });
    const habitsDone = habitsToday.filter((h) => st.habitLog?.[today]?.[h.id] !== undefined).length;

    const boost = (st.boosts || []).find((b) => b.day === today);
    let boostEnds = null;
    if (boost) {
      // midnight at the end of today, local, plus the rollover hour, expressed in UTC
      const d = new Date(`${tomorrow}T00:00:00Z`);
      d.setUTCMinutes(d.getUTCMinutes() + tzo + hour * 60);
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
          .map((x) => ({ title: x.title, course: x.course, rank: scoreQuest(x, s) }))
          .sort((a, b) => RANKS.indexOf(b.rank) - RANKS.indexOf(a.rank))
          .slice(0, 4),
      },
      updatedAt: st.updatedAt || null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
