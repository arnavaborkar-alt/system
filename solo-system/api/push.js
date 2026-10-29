/**
 * GET  /api/push                       -> { configured, publicKey }
 * POST /api/push  (x-hunter-key)       { action: 'subscribe' | 'unsubscribe' | 'test', ... }
 *
 * Stores one record per device. /api/remind reads them and sends the reminders.
 *
 * Env vars:  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL (optional)
 * Make the keys once with:  npx web-push generate-vapid-keys
 */
const { sha, slotFor, authorized, kv, readBody } = require('../lib/kv.js');

const INDEX = 'solo-system:push:index';
const recKey = (endpoint) => `solo-system:push:${sha(endpoint).toString('hex').slice(0, 24)}`;
const hourOr = (v, fallback) => { const n = Number(v); return Number.isInteger(n) && n >= -1 && n <= 23 ? n : fallback; };

function sender() {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return null;
  const wp = require('web-push');
  wp.setVapidDetails(`mailto:${process.env.VAPID_EMAIL || 'admin@example.com'}`, pub, priv);
  return wp;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const configured = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

  if (req.method === 'GET') return res.status(200).json({ configured, publicKey: configured ? process.env.VAPID_PUBLIC_KEY : null });
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed.' }); }

  if (!configured) return res.status(501).json({ error: 'Reminders are not set up on this server yet (VAPID keys missing).' });
  if (!kv.ready()) return res.status(501).json({ error: 'No database connected.' });
  const pass = req.headers['x-hunter-key'] || '';
  if (!authorized(pass)) return res.status(401).json({ error: 'Wrong key.' });

  try {
    const body = await readBody(req);
    const endpoint = body.sub?.endpoint || body.endpoint;
    if (!endpoint) return res.status(400).json({ error: 'No subscription.' });
    const key = recKey(endpoint);

    if (body.action === 'unsubscribe') {
      await kv.del(key); await kv.srem(INDEX, key);
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'subscribe') {
      if (!body.sub?.keys) return res.status(400).json({ error: 'Bad subscription.' });
      const prev = await kv.get(key);
      await kv.set(key, {
        slot: slotFor(pass), sub: body.sub,
        tzo: Number.isFinite(Number(body.tzo)) ? Number(body.tzo) : 0,
        morning: hourOr(body.morning, -1), evening: hourOr(body.evening, 19),
        lastSent: prev?.lastSent || {},
      });
      await kv.sadd(INDEX, key);
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'test') {
      const rec = await kv.get(key);
      if (!rec || rec.slot !== slotFor(pass)) return res.status(404).json({ error: 'This device is not subscribed.' });
      await sender().sendNotification(rec.sub, JSON.stringify({ title: 'Reminders are on', body: 'You will get a nudge when something is left for the day.', tag: 'test', url: '/' }));
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    return res.status(e.statusCode === 410 || e.statusCode === 404 ? 410 : 500).json({ error: e.statusCode === 410 ? 'That device is no longer subscribed.' : `Failed: ${e.message}` });
  }
};
