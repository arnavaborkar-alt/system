/**
 * POST /api/signup   { name, email, passphrase }  ->  { ok: true, emailSent }
 *
 * Only does anything when HUNTER_KEYS is the single word "open" \u2014 in the
 * closed multi-hunter mode, adding someone is still a deliberate edit to an
 * environment variable, on purpose. This endpoint doesn't create the actual
 * save; the client does that the normal way the first time it connects with
 * the new passphrase. All this does is record an email address against that
 * passphrase's slot and send a one-time welcome email, so account creation
 * itself never depends on email delivery succeeding.
 *
 * Required env vars on Vercel (in addition to the usual KV ones):
 *   GMAIL_USER            the Gmail address welcome emails are sent from
 *   GMAIL_APP_PASSWORD    a 16-character App Password for that account,
 *                          generated at myaccount.google.com/apppasswords
 *                          (needs 2-Step Verification turned on first)
 */

const crypto = require('crypto');
const nodemailer = require('nodemailer');

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();
const slotIdFor = (pass) => sha(pass).toString('hex').slice(0, 24);

function openModeEnabled() {
  const raw = (process.env.HUNTER_KEYS || process.env.HUNTER_KEY || '').trim();
  return raw.toLowerCase() === 'open';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function readMap(key) {
  try {
    const r = await fetch(`${URL_}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!r.ok) return {};
    const j = await r.json();
    return j.result ? JSON.parse(j.result) : {};
  } catch { return {}; }
}
async function writeMap(key, map) {
  await fetch(`${URL_}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'text/plain' },
    body: JSON.stringify(map),
  });
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e5) reject(new Error('too large')); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

async function sendWelcomeEmail(to, name) {
  const user = process.env.GMAIL_USER || '';
  const pass = process.env.GMAIL_APP_PASSWORD || '';
  if (!user || !pass) return { sent: false, reason: 'Email is not configured yet.' };

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `"System" <${user}>`,
    to,
    subject: 'Welcome, Hunter',
    text: `Hey ${name || 'Hunter'},\n\nYour account is ready. Open the app and sign in with the passphrase you just chose \u2014 there's no way to recover it if you lose it, so keep it somewhere safe.\n\nGood luck out there.`,
    html: `<p>Hey ${name || 'Hunter'},</p><p>Your account is ready. Open the app and sign in with the passphrase you just chose \u2014 <strong>there's no way to recover it if you lose it</strong>, so keep it somewhere safe.</p><p>Good luck out there.</p>`,
  });
  return { sent: true };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!openModeEnabled()) {
    return res.status(403).json({ error: 'Self-signup is off. Ask whoever set this up for a passphrase.' });
  }
  if (!URL_ || !TOKEN) {
    return res.status(501).json({ error: 'No database connected.' });
  }

  let body;
  try { body = await readBody(req); } catch { return res.status(400).json({ error: 'Bad request.' }); }

  const passphrase = String(body.passphrase || '');
  const email = String(body.email || '').trim();
  const name = String(body.name || '').trim().slice(0, 24) || 'Hunter';

  if (passphrase.length < 12) {
    return res.status(400).json({ error: 'Passphrase needs to be at least 12 characters.' });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'That doesn\u2019t look like a valid email.' });
  }

  const slotId = slotIdFor(passphrase);

  try {
    const emails = await readMap('solo-system:emails');
    emails[slotId] = { email, name, createdAt: new Date().toISOString() };
    await writeMap('solo-system:emails', emails);
  } catch { /* the account still works locally even if this record-keeping hiccups */ }

  let emailSent = false;
  try {
    const r = await sendWelcomeEmail(email, name);
    emailSent = r.sent;
  } catch (e) {
    // account creation must never fail just because the welcome email couldn't send
    emailSent = false;
  }

  return res.status(200).json({ ok: true, emailSent });
};
