/**
 * GET  /api/board                 -> { rows: [{ name, level, xp, weekXp, me }] }
 * POST /api/board { on, name, level, xp, weekXp }   join/update (on:true) or leave (on:false)
 *
 * An opt-in friends board for everyone on this deployment. Only a player name, level, total XP
 * and this week's XP are stored, keyed by a hash of the passphrase, never the passphrase itself.
 */
const { sha, authorized, allowList, kv, readBody } = require('../lib/kv.js');

const BOARD = 'solo-system:board';
const clean = (v, n) => Math.max(0, Math.min(n, Math.round(Number(v) || 0)));

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!allowList().length) return res.status(501).json({ error: 'Cloud sync is off.' });
  if (!kv.ready()) return res.status(501).json({ error: 'No database connected.' });
  const pass = req.headers['x-hunter-key'] || '';
  if (!authorized(pass)) return res.status(401).json({ error: 'Wrong key.' });
  const id = sha(pass).toString('hex').slice(0, 16);

  try {
    const board = (await kv.get(BOARD)) || {};
    if (req.method === 'POST') {
      const b = await readBody(req);
      if (b.on === false) delete board[id];
      else {
        const name = String(b.name || 'Player').replace(/[<>]/g, '').trim().slice(0, 24) || 'Player';
        board[id] = { name, level: clean(b.level, 999), xp: clean(b.xp, 1e9), weekXp: clean(b.weekXp, 1e8), at: new Date().toISOString() };
      }
      await kv.set(BOARD, board);
    }
    const cutoff = Date.now() - 120 * 86400000;   // players gone for four months drop off
    const rows = Object.entries(board)
      .filter(([, r]) => Date.parse(r.at || 0) > cutoff)
      .map(([k, r]) => ({ name: r.name, level: r.level, xp: r.xp, weekXp: r.weekXp, me: k === id }));
    return res.status(200).json({ rows, joined: !!board[id] });
  } catch (e) {
    return res.status(500).json({ error: `Storage failed: ${e.message}` });
  }
};
