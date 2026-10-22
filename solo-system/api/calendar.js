/**
 * GET /api/calendar?key=<calendar token>
 *
 * A read-only iCalendar feed of open quest due dates, for subscribing to from
 * Google Calendar, Apple Calendar and so on. The token is the one created under
 * System -> Export to another calendar; it can show due dates and nothing else,
 * and replacing it kills the old link.
 *
 * Lookup: api/state.js writes an index entry (token hash -> save slot) whenever a
 * save carries a calendar token. This endpoint follows that entry, loads the save,
 * and checks the token against the save's own copy before returning anything.
 */

const crypto = require('crypto');
const { scoreQuest } = require('../lib/rank.js');

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();
const calKey = (token) => `solo-system:cal:${sha(token).toString('hex').slice(0, 24)}`;

async function kvGet(key) {
  const r = await fetch(`${URL_}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`kv get ${r.status}`);
  const j = await r.json();
  return j.result ? JSON.parse(j.result) : null;
}

const esc = (v) => String(v ?? '')
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** RFC 5545 asks for lines of 75 octets or fewer; continuation lines start with a space. */
function fold(line) {
  const out = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 74) {
    let cut = 74;
    while (Buffer.byteLength(rest.slice(0, cut)) > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n');
}

const ymd = (key) => key.replace(/-/g, '');
const nextDay = (key) => new Date(new Date(key + 'T12:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const token = String(q.key || '');

  if (!URL_ || !TOKEN) return res.status(501).send('No database connected.');
  if (!/^[a-f0-9]{20,64}$/.test(token)) return res.status(404).send('Not found.');

  try {
    const slot = await kvGet(calKey(token));
    if (!slot) return res.status(404).send('Not found.');
    const st = await kvGet(slot);
    if (!st || st.settings?.calendarToken !== token) return res.status(404).send('Not found.');

    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//System//Quests//EN', 'CALSCALE:GREGORIAN',
      `X-WR-CALNAME:${esc(`${st.settings?.hunterName || 'Hunter'} \u2014 quests`)}`,
      'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H',
    ];

    Object.values(st.quests || {})
      .filter((x) => !x.done && !x.missed && !x.dismissed && (x.dueKey || x.due))
      .forEach((x) => {
        const day = x.dueKey || x.due.slice(0, 10);
        const rank = scoreQuest(x, st.settings || {});
        lines.push(
          'BEGIN:VEVENT',
          `UID:${esc(x.id)}@system`,
          `DTSTAMP:${stamp}`,
          `DTSTART;VALUE=DATE:${ymd(day)}`,
          `DTEND;VALUE=DATE:${ymd(nextDay(day))}`,
          `SUMMARY:${esc(`[${rank}] ${x.title}`)}`,
        );
        if (x.course) lines.push(`DESCRIPTION:${esc(x.course)}`);
        lines.push('END:VEVENT');
      });

    lines.push('END:VCALENDAR');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    return res.status(200).send(lines.map(fold).join('\r\n') + '\r\n');
  } catch (e) {
    return res.status(502).send(`Calendar unavailable: ${e.message}`);
  }
};
