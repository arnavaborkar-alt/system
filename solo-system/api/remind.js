/**
 * GET /api/remind?secret=<CRON_SECRET>      (or  Authorization: Bearer <CRON_SECRET>)
 *
 * Call this once an hour. For every subscribed device it checks whether the player's
 * LOCAL time has reached their morning/evening hour, builds the message from their
 * saved state, and sends it at most once per day per reminder.
 *
 * Free hourly trigger: cron-job.org (or any scheduler) hitting this URL.
 * Vercel's own cron only runs hourly on a Pro plan, so it is not configured here.
 *
 * Env vars: CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL (optional)
 */
const crypto = require('crypto');
const { kv } = require('../lib/kv.js');
const { localClock, build } = require('../lib/remind.js');

const INDEX = 'solo-system:push:index';
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const given = q.secret || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!secret) return res.status(501).json({ error: 'CRON_SECRET is not set.' });
  if (!given || !same(given, secret)) return res.status(401).json({ error: 'Nope.' });
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return res.status(501).json({ error: 'VAPID keys missing.' });
  if (!kv.ready()) return res.status(501).json({ error: 'No database connected.' });

  const wp = require('web-push');
  wp.setVapidDetails(`mailto:${process.env.VAPID_EMAIL || 'admin@example.com'}`, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  const out = { checked: 0, sent: 0, removed: 0, errors: 0 };
  const now = Number(q.now) || Date.now();   // `now` is only for testing

  for (const key of await kv.smembers(INDEX)) {
    try {
      const rec = await kv.get(key);
      if (!rec) { await kv.srem(INDEX, key); continue; }
      out.checked++;
      const state = await kv.get(rec.slot);
      if (!state) continue;
      const { hour, day } = localClock(now, rec.tzo || 0, state.settings?.dayResetHour ?? 4);
      rec.lastSent = rec.lastSent || {};
      let dirty = false;

      for (const kind of ['morning', 'evening']) {
        const at = rec[kind];
        if (at === undefined || at < 0) continue;
        // a two-hour window so one late cron tick does not lose the reminder
        if (!(hour === at || hour === (at + 1) % 24)) continue;
        if (rec.lastSent[kind] === day) continue;
        const msg = build(state, kind, day);
        rec.lastSent[kind] = day; dirty = true;     // mark even when silent, so it is evaluated once
        if (!msg) continue;
        try {
          await wp.sendNotification(rec.sub, JSON.stringify({ ...msg, url: '/' }));
          out.sent++;
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) { await kv.del(key); await kv.srem(INDEX, key); out.removed++; dirty = false; break; }
          out.errors++;
        }
      }
      if (dirty) await kv.set(key, rec);
    } catch { out.errors++; }
  }
  return res.status(200).json(out);
};
