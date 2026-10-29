/**
 * GET  /api/state   -> { state }
 * POST /api/state   { state }  -> { ok: true }
 *
 * One deployment can serve any number of people. Each passphrase gets its own
 * storage slot, derived from a hash of the passphrase, so nobody can read or
 * overwrite anyone else's save.
 *
 * Required env vars on Vercel:
 *   HUNTER_KEYS      comma-separated passphrases, one per person.
 *                    e.g.  my-secret-phrase,jordans-phrase,sams-phrase
 *                    Set it to the single word  open  to let anyone in with a
 *                    passphrase of 12+ characters (no redeploy to add a friend).
 *   KV_REST_API_URL     (or UPSTASH_REDIS_REST_URL)
 *   KV_REST_API_TOKEN   (or UPSTASH_REDIS_REST_TOKEN)
 */

const crypto = require('crypto');

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const LEGACY_KEY = 'solo-system:state';   // from before multi-hunter support

const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();

/** Where the calendar-feed token points back to a save slot. */
function calKey(token) {
  return `solo-system:cal:${sha(token).toString('hex').slice(0, 24)}`;
}

/** Storage slot for a passphrase. The passphrase itself is never stored. */
function slotFor(pass) {
  return `solo-system:state:${sha(pass).toString('hex').slice(0, 24)}`;
}

function allowList() {
  const raw = process.env.HUNTER_KEYS || process.env.HUNTER_KEY || '';
  return raw.split(',').map((x) => x.trim()).filter(Boolean);
}

/** Constant-time membership check, so the response time leaks nothing. */
function authorized(pass) {
  if (!pass) return false;
  const list = allowList();
  if (!list.length) return false;
  if (list.length === 1 && list[0].toLowerCase() === 'open') return pass.length >= 12;
  const given = sha(pass);
  return list.reduce((hit, k) => (crypto.timingSafeEqual(given, sha(k)) ? true : hit), false);
}

async function kvGet(key) {
  const r = await fetch(`${URL_}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!r.ok) throw new Error(`kv get ${r.status}`);
  const j = await r.json();
  return j.result ? JSON.parse(j.result) : null;
}

async function kvSet(key, value) {
  const r = await fetch(`${URL_}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'text/plain' },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error(`kv set ${r.status}`);
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 8e6) reject(new Error('too large')); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (!allowList().length) {
    return res.status(501).json({ error: 'Cloud sync is off. Set HUNTER_KEYS in your Vercel environment variables.' });
  }
  if (!URL_ || !TOKEN) {
    return res.status(501).json({ error: 'No database connected. Add an Upstash Redis store in Vercel, then redeploy.' });
  }

  const pass = req.headers['x-hunter-key'] || '';
  if (!authorized(pass)) return res.status(401).json({ error: 'Wrong key.' });
  const slot = slotFor(pass);

  try {
    if (req.method === 'GET') {
      if (req.query && req.query.backup) {
        const bak = await kvGet(`${slot}:bak`);
        return res.status(200).json(bak ? { state: bak.state, savedAt: bak.savedAt } : { state: null });
      }
      let state = await kvGet(slot);
      // one-time rescue of a save written before slots existed
      if (!state && process.env.HUNTER_KEY && pass === process.env.HUNTER_KEY) {
        state = await kvGet(LEGACY_KEY);
        if (state) await kvSet(slot, state);
      }
      return res.status(200).json({ state });
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (!body || !body.state) return res.status(400).json({ error: 'No state in request.' });

      // Refuse to overwrite the cloud with a copy that has LESS progress. Lifetime gold earned only
      // ever grows, so a lower number means a stale device (one left alone for months, say). The
      // client folds the cloud copy into its own and retries. `force` is for imports and resets.
      const existing = await kvGet(slot);
      if (existing && !body.force) {
        const have = Number(existing.lifetimeEarned) || 0;
        const sent = Number(body.state.lifetimeEarned) || 0;
        if (sent + 1 < have) return res.status(409).json({ error: 'This copy is behind the cloud.', state: existing });
      }
      // keep a daily snapshot of the previous cloud copy as a safety net (GET /api/state?backup=1)
      try {
        if (existing) {
          const bak = await kvGet(`${slot}:bak`);
          if (!bak || Date.now() - Date.parse(bak.savedAt || 0) > 20 * 3600e3) await kvSet(`${slot}:bak`, { savedAt: new Date().toISOString(), state: existing });
        }
      } catch { /* the save itself matters more */ }
      await kvSet(slot, body.state);

      // Index the calendar-feed token so /api/calendar can find this save from the
      // token alone. The feed re-checks the token against the save itself, so a
      // replaced token stops working even though its index entry lingers.
      try {
        const tok = body.state.settings?.calendarToken;
        if (typeof tok === 'string' && /^[a-f0-9]{20,64}$/.test(tok)) await kvSet(calKey(tok), slot);
      } catch { /* the save itself already succeeded */ }

      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (e) {
    return res.status(500).json({ error: `Storage failed: ${e.message}` });
  }
};
