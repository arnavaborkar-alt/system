/** Small shared helpers for the push endpoints: auth + Upstash REST. */
const crypto = require('crypto');

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();
const slotFor = (pass) => `solo-system:state:${sha(pass).toString('hex').slice(0, 24)}`;

function allowList() {
  return (process.env.HUNTER_KEYS || process.env.HUNTER_KEY || '').split(',').map((x) => x.trim()).filter(Boolean);
}
function authorized(pass) {
  if (!pass) return false;
  const list = allowList();
  if (!list.length) return false;
  if (list.length === 1 && list[0].toLowerCase() === 'open') return String(pass).length >= 12;
  const given = sha(pass);
  return list.reduce((hit, k) => (crypto.timingSafeEqual(given, sha(k)) ? true : hit), false);
}

const H = { Authorization: `Bearer ${TOKEN}` };
async function cmd(path, init) {
  const r = await fetch(`${URL_}/${path}`, { headers: H, ...init });
  if (!r.ok) throw new Error(`kv ${r.status}`);
  return (await r.json()).result;
}
const enc = encodeURIComponent;
const kv = {
  ready: () => !!(URL_ && TOKEN),
  async get(key) { const v = await cmd(`get/${enc(key)}`); return v ? JSON.parse(v) : null; },
  async set(key, value) { await cmd(`set/${enc(key)}`, { method: 'POST', headers: { ...H, 'content-type': 'text/plain' }, body: JSON.stringify(value) }); },
  async del(key) { await cmd(`del/${enc(key)}`); },
  async sadd(key, member) { await cmd(`sadd/${enc(key)}/${enc(member)}`); },
  async srem(key, member) { await cmd(`srem/${enc(key)}/${enc(member)}`); },
  async smembers(key) { return (await cmd(`smembers/${enc(key)}`)) || []; },
};

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e6) reject(new Error('too large')); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

module.exports = { sha, slotFor, authorized, allowList, kv, readBody };
