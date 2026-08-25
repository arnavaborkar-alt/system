/**
 * GET /api/ics?url=<schoology ical url>
 * Fetches the feed server-side (browsers can't, CORS) and returns parsed events.
 */

function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function unescape_(v) {
  return (v || '')
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "20260901T235900Z" | "20260901T235900" | "20260901" -> ISO string + allDay flag */
function parseDate(value, params) {
  const v = (value || '').trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss, z] = m;
  if (!hh) return { iso: `${y}-${mo}-${d}T12:00:00`, allDay: true };
  if (z) return { iso: new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss)).toISOString(), allDay: false };
  return { iso: `${y}-${mo}-${d}T${hh}:${mm}:${ss}`, allDay: false, tzid: params.TZID || null };
}

function splitLine(line) {
  const i = line.indexOf(':');
  if (i < 0) return null;
  const left = line.slice(0, i);
  const value = line.slice(i + 1);
  const parts = left.split(';');
  const name = parts[0].toUpperCase();
  const params = {};
  parts.slice(1).forEach((p) => {
    const [k, ...rest] = p.split('=');
    params[k.toUpperCase()] = rest.join('=');
  });
  return { name, params, value };
}

/** Schoology writes SUMMARY as "Course Name: Assignment" or "Assignment (Course)" fairly often. */
function splitCourse(summary) {
  let title = summary;
  let course = '';
  let m = summary.match(/^(.{2,60}?):\s+(.*)$/);
  if (m && !/^(re|fwd|note|reminder)$/i.test(m[1])) { course = m[1].trim(); title = m[2].trim(); }
  else {
    m = summary.match(/^(.*)\s+\(([^()]{2,60})\)\s*$/);
    if (m) { title = m[1].trim(); course = m[2].trim(); }
  }
  return { title: title || summary, course };
}

function parseIcs(text) {
  const lines = unfold(text).split('\n');
  const events = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur && cur.SUMMARY) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const p = splitLine(line);
    if (!p) continue;
    if (p.name === 'DTSTART' || p.name === 'DTEND') cur[p.name] = parseDate(p.value, p.params);
    else cur[p.name] = p.value;
  }

  return events.map((e, i) => {
    const summary = unescape_(e.SUMMARY);
    const { title, course } = splitCourse(summary);
    return {
      uid: e.UID || `ics-${i}-${summary.slice(0, 40)}`,
      title,
      course: course || unescape_(e.LOCATION) || '',
      notes: unescape_(e.DESCRIPTION).slice(0, 400),
      due: e.DTSTART?.iso || null,
      allDay: !!e.DTSTART?.allDay,
      url: e.URL || '',
    };
  });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const url = (req.query?.url) || new URL(req.url, 'http://x').searchParams.get('url');

  if (!url) return res.status(400).json({ error: 'Add your calendar link in Settings first.' });

  let target;
  try { target = new URL(url.replace(/^webcal:/i, 'https:')); }
  catch { return res.status(400).json({ error: "That doesn't look like a link. Copy the whole iCal URL from Schoology." }); }

  if (!/^https?:$/.test(target.protocol)) {
    return res.status(400).json({ error: 'Only http and https links work here.' });
  }

  try {
    const r = await fetch(target.toString(), {
      headers: { 'user-agent': 'SoloSystem/1.0', accept: 'text/calendar, text/plain, */*' },
      redirect: 'follow',
    });
    if (!r.ok) {
      return res.status(502).json({ error: `Schoology returned ${r.status}. Regenerate the iCal link in Account Settings and paste the new one.` });
    }
    const text = await r.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) {
      return res.status(502).json({ error: 'That link returned a web page, not a calendar feed. Use the iCal link from Account Settings \u2192 Share Your Schoology Calendar.' });
    }
    const events = parseIcs(text);
    return res.status(200).json({ count: events.length, events, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(502).json({ error: `Could not reach the calendar: ${e.message}` });
  }
};
