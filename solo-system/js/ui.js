import { store, todayKey, addDays, daysBetween, dueDay } from './store.js';
import { RANKS, STATS, STAT_LABEL, rankClass } from './config.js';
import * as E from './engine.js';
import { icon } from './icons.js';
import { THEMES, DEFAULT_LOOK, paletteFor, applyLook } from './theme.js';
import * as C from './challenges.js';
import * as A from './achievements.js';
import * as FX from './fx.js';
import * as R from './reminders.js';
import * as B from './boss.js';
import * as I from './insights.js';
import * as F from './focus.js';
import * as SC from './schedule.js';
import { SHOP_CATS } from './config.js';
import { GOALS, SKILLS, EQUIPMENT, FOCUS, AVOID, LIFTING, PISTOL, DEFAULT_PROFILE, cleanProfile, buildPlan } from './planner.js';

export const ui = {
  tab: 'quests', questFilter: 'open', editingGym: false, calMonth: null, calDay: null,
  selecting: false, selected: new Set(),
  showWelcome: false, welcomeMode: 'choose', welcomeError: '', welcomeBusy: false,
  tutorialOpen: false, tutorialStep: 0,
  planner: null,   // { step, profile, result } while the Find-my-plan form is open
  prev: null,      // last drawn numbers, so the bar and gold can animate to the new ones
  lastTab: null, achFilter: 'All',
};

/* ---------- helpers ---------- */
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const g = () => store.state;
const tk = () => todayKey(g().settings);

function dueLabel(q) {
  const k = dueDay(q);
  if (!k) return { text: 'no due date', cls: 'muted' };
  const d = daysBetween(tk(), k);
  if (d < 0) return { text: `${-d}d overdue`, cls: 'overdue' };
  if (d === 0) return { text: 'due today', cls: 'soon' };
  if (d === 1) return { text: 'due tomorrow', cls: 'soon' };
  if (d <= 7) return { text: `due in ${d}d`, cls: 'muted' };
  return { text: new Date(q.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), cls: 'muted' };
}

function notify(kind, key, value) {
  const stack = document.getElementById('notify');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `notify ${kind}`;
  el.innerHTML = `<div class="k">${h(key)}</div><div class="v">${h(value)}</div>`;
  stack.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 320); }, 2600);
}
export { notify };

/** A System-styled replacement for prompt()/confirm(). Resolves with a values
 *  object, or null if the hunter backs out. */
export function dialog({ title, message = '', fields = [], confirm = 'Confirm', danger = false, third = null }) {
  return new Promise((resolve) => {
    document.querySelector('.levelup.levelup-notice')?.remove();   // don't stack overlays
    const el = document.createElement('div');
    el.className = 'levelup levelup-dialog';
    el.innerHTML = `<div class="card" style="text-align:left;max-width:380px">
      <div class="eyebrow">${h(title)}</div>
      ${message ? `<p style="margin:12px 0 4px;font-size:14.5px;color:var(--ink)">${h(message)}</p>` : ''}
      <div style="margin-top:14px">${fields.map((f, i) => `
        <div class="field">
          ${f.label ? `<label>${h(f.label)}</label>` : ''}
          ${f.options
            ? `<select data-f="${i}">${f.options.map((o) => `<option value="${h(o.value)}" ${o.value === f.value ? 'selected' : ''}>${h(o.label)}</option>`).join('')}</select>`
            : `<input data-f="${i}" type="${f.type || 'text'}" value="${h(f.value ?? '')}" placeholder="${h(f.placeholder || '')}" ${f.type === 'number' ? 'inputmode="numeric"' : ''}>`}
        </div>`).join('')}</div>
      ${third ? `<button class="danger" style="width:100%;margin-bottom:8px" data-x="third">${h(third)}</button>` : ''}
      <div class="grid2" style="margin-top:6px">
        <button class="ghost" data-x="cancel">Cancel</button>
        <button class="${danger ? 'danger' : 'gold'}" data-x="ok">${h(confirm)}</button>
      </div>
    </div>`;

    const close = (val) => { el.remove(); document.removeEventListener('keydown', onKey); resolve(val); };
    const submit = () => {
      const out = {};
      fields.forEach((f, i) => {
        const node = el.querySelector(`[data-f="${i}"]`);
        out[f.name] = f.type === 'number' ? Number(node.value) : node.value.trim();
      });
      close(out);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); if (e.key === 'Enter' && fields.length) submit(); };

    el.addEventListener('click', (e) => {
      if (e.target === el) return close(null);
      const b = e.target.closest('[data-x]');
      if (!b) return;
      if (b.dataset.x === 'ok') return submit();
      if (b.dataset.x === 'third') return close({ __third: true });
      close(null);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(el);
    el.querySelector('input, select')?.focus();
  });
}

export function levelUpWindow(level) {
  const t = E.hunterTitle(level);
  document.querySelector('.levelup')?.remove();
  const el = document.createElement('div');
  el.className = 'levelup levelup-notice';
  el.innerHTML = `<div class="rays"></div><div class="card lvcard">
    <div class="eyebrow">Notification</div>
    <p style="margin:14px 0 4px;font-family:var(--b);font-size:15px;color:var(--muted)">You have leveled up.</p>
    <div class="lvring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52"/></svg><div class="big num" id="lvnum">${Math.max(1, level - 1)}</div></div>
    <div class="lvtitle">${h(t.title)}</div>
    <button class="primary" style="margin-top:22px;width:100%" data-act="close-levelup">Accept</button>
  </div>`;
  el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
  document.body.appendChild(el);
  setTimeout(() => { const n = el.querySelector('#lvnum'); if (n) n.textContent = level; }, 380);
  FX.haptic('big');
  FX.burst(innerWidth / 2, innerHeight / 2 - 30, { color: 'var(--glow)', count: 26, big: true });
  FX.coinShower(12);
}

const TIER_COL = { bronze: '#C98B5A', silver: '#B8C7E6', gold: '#F5C542', legend: '#FF9E4A' };

/** Slides in from the top when an achievement unlocks. */
export function achievementBanner(ev) {
  const stack = document.getElementById('notify');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `notify ach ${ev.tier}`;
  el.innerHTML = `<div class="ach-ico" style="color:${TIER_COL[ev.tier]}">${icon('trophy', 26)}</div>
    <div><div class="k">Achievement \u00b7 ${h(ev.tier)}</div><div class="v">${h(ev.name)}</div>
    <div class="tiny" style="color:var(--muted);margin-top:2px">+${ev.gold}g \u00b7 +${ev.xp} XP${ev.title ? ` \u00b7 title: ${h(ev.title)}` : ''}</div></div>`;
  stack.appendChild(el);
  FX.haptic('good');
  setTimeout(() => { el.style.transition = 'opacity .3s, transform .3s'; el.style.opacity = '0'; el.style.transform = 'translateY(-8px)'; setTimeout(() => el.remove(), 320); }, 4200);
}

/* ============================================================
   STATUS HEADER
   ============================================================ */
function boostBanner() {
  const s = g();
  const mult = E.boostFor(s, tk());
  if (mult === 1) return '';
  const ends = E.boostEndsAt(s, tk());
  const left = Math.max(0, ends - Date.now());
  const hrs = Math.floor(left / 3.6e6);
  const mins = Math.floor((left % 3.6e6) / 6e4);
  return `<div class="boostbar">
    <span class="k">\u2726 ${mult}\u00d7 GOLD &amp; XP</span>
    <span class="t num">${hrs}h ${String(mins).padStart(2, '0')}m left</span>
  </div>`;
}

const RING_R = 29;
const RING_C = 2 * Math.PI * RING_R;
const ringOffset = (pct) => (RING_C * (1 - Math.max(0, Math.min(100, pct)) / 100)).toFixed(1);

export function levelRing(level, pct, size = 68) {
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 68 68" width="${size}" height="${size}">
      <circle class="trk" cx="34" cy="34" r="${RING_R}"/>
      <circle class="bar" cx="34" cy="34" r="${RING_R}" stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="${ringOffset(pct)}" transform="rotate(-90 34 34)"/>
    </svg>
    <div class="lv"><b>${level}</b><span>LV</span></div></div>`;
}

function statusBar() {
  const s = g();
  const p = E.levelProgress(s.xp);
  const t = E.hunterTitle(p.level);
  const off = E.isDayOff(s, tk());
  const label = { cloud: 'synced', local: 'this device', offline: 'offline', nocloud: 'no database', badkey: 'wrong key' }[store.status] || store.status;
  const title = A.equippedTitle(s, t.title);

  return `${boostBanner()}<div class="status hero">
    <div class="status-top">
      ${levelRing(p.level, p.pct)}
      <div class="who">
        <div class="name">${h(s.settings.hunterName || 'Player')}</div>
        <div class="title">${h(title)}</div>
        ${title !== t.title ? `<div class="rk">${h(t.title)}</div>` : ''}
      </div>
      <div class="purse"><div class="gold-pill">${icon('coin', 15)}<b class="num" data-count="gold">${Math.round(s.gold).toLocaleString()}</b></div>
        <span>${E.xpToday(s) ? `+${E.xpToday(s)} XP today` : 'GOLD'}</span></div>
    </div>
    <div class="xpbar"><i style="width:${Math.max(0, Math.min(100, p.pct)).toFixed(1)}%"></i></div>
    <div class="xp-meta">
      <span class="num">${p.cur.toLocaleString()} / ${p.need.toLocaleString()} XP</span>
      <span class="sync" data-act="cloud-sync" role="button" title="Tap to sync" style="cursor:pointer"><i class="${store.status}"></i>${h(label)}${off ? ' \u00b7 DAY OFF' : ''}</span>
    </div>
  </div>`;
}

/** After a redraw: animate the ring/bar from where they were, and count the gold up. */
function animateStatus() {
  const s = g();
  const p = E.levelProgress(s.xp);
  const now = { level: p.level, pct: p.pct, gold: Math.round(s.gold) };
  const prev = ui.prev;
  ui.prev = now;
  const goldEl = document.querySelector('[data-count="gold"]');
  if (!prev) return;
  if (prev.level === now.level) {
    const bar = document.querySelector('.status .ring .bar');
    const fill = document.querySelector('.status .xpbar i');
    if (bar && Math.abs(prev.pct - now.pct) > 0.2) {
      bar.style.strokeDashoffset = ringOffset(prev.pct);
      fill.style.width = `${prev.pct.toFixed(1)}%`;
      void bar.getBoundingClientRect();
      bar.style.strokeDashoffset = ringOffset(now.pct);
      fill.style.width = `${now.pct.toFixed(1)}%`;
    }
  }
  if (goldEl && prev.gold !== now.gold) FX.countUp(goldEl, prev.gold, now.gold, 700);
}

/* ============================================================
   TODAY — one glance at what's left, tappable through to each tab
   ============================================================ */
function todayCard() {
  const s = g();
  const today = tk();
  const off = E.isDayOff(s, today);
  const st = E.dayStatus(s, today);
  const dueQ = Object.values(s.quests)
    .filter((q) => !q.done && !q.missed && !q.dismissed && dueDay(q) && dueDay(q) <= today).length;
  const habitsLeft = st.habits - st.habitsDone;
  const gymLabel = off || E.isGymRest(s, today) ? 'rest pass'
    : !st.gymScheduled ? 'rest day' : st.gymDone ? 'done' : 'open';

  const tile = (tab, n, label, good) => `<button class="tile ${good ? 'good' : ''}" data-tab="${tab}">
    <b class="num">${n}</b><span>${label}</span></button>`;

  const perfect = !off && st.eligible
    ? `<div class="tiny" style="margin-top:11px;color:${st.perfect ? 'var(--ok)' : 'var(--muted)'}">
        ${st.perfect ? 'Everything cleared — perfect day bonus pays tomorrow.'
          : `Perfect day: ${st.done}/${st.items} cleared · +${E.scaleXp(s.settings, s.settings.perfectDayXp || 0)} XP and +${s.settings.perfectDayGold || 0}g when it’s all done.`}
      </div>` : '';

  return `<div class="window flat" style="padding:13px 14px 14px">
    <div class="tiles">
      ${tile('quests', dueQ, 'due', dueQ === 0)}
      ${tile('habits', st.habits ? `${st.habitsDone}/${st.habits}` : '—', 'habits', habitsLeft === 0)}
      ${tile('gym', gymLabel, 'training', st.gymDone || !st.gymScheduled)}
    </div>
    ${perfect}
  </div>`;
}

/* ============================================================
   CHALLENGES (shared by the Hunter tab and the quests teaser)
   ============================================================ */
const PERIOD_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };

function leftText(p) {
  const ms = Math.max(0, C.periodEndsAt(p, g()) - Date.now());
  const d = Math.floor(ms / 864e5), hr = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4);
  return d ? `${d}d ${hr}h left` : `${hr}h ${String(m).padStart(2, '0')}m left`;
}

function chRow(p, ch, c, compact = false) {
  const s = g();
  const have = C.progressOf(s, c, p, ch.key);
  const done = have >= c.target;
  const pct = Math.min(100, (have / c.target) * 100);
  const state = c.claimed ? 'claimed' : done ? 'ready' : '';
  const action = c.claimed ? `<span class="chk">${icon('check', 18)}</span>`
    : done ? (compact ? '<span class="pill on">ready</span>' : `<button class="primary sm" data-act="claim-ch" data-p="${p}" data-id="${c.id}">Claim</button>`)
    : (!compact && (s.rerolls || 0) > 0 ? `<button class="ghost sm icon-btn" data-act="reroll-ch" data-p="${p}" data-id="${c.id}" title="Reroll (uses 1 token)" aria-label="Reroll">${icon('reroll', 15)}</button>` : '');
  return `<div class="ch ${state}">
    <div class="ch-ico">${icon(C.iconOf(c.metric), 18)}</div>
    <div class="ch-body">
      <div class="ch-t">${h(C.labelOf(c))}</div>
      <div class="ch-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="ch-s"><span class="num">${Math.min(have, c.target).toLocaleString()} / ${c.target.toLocaleString()}</span>
        <span class="num rw">+${c.rewardGold}g · +${c.rewardXp} XP</span></div>
    </div>
    <div class="ch-act">${action}</div>
  </div>`;
}

function challengeBlock(p) {
  const s = g();
  const ch = s.challenges?.[p];
  if (!ch) return '';
  const ready = ch.items.filter((c) => !c.claimed && C.isDone(s, c, p, ch.key)).length;
  return `<div class="window">
    <div class="window-title"><h2>${PERIOD_LABEL[p]}</h2>
      ${ready ? `<span class="pill on">${ready} ready</span>` : ''}
      <span class="count">${leftText(p)}</span></div>
    ${ch.items.length ? ch.items.map((c) => chRow(p, ch, c)).join('')
      : '<div class="tiny muted" style="padding:4px 0 2px">Day off. Nothing to chase today.</div>'}
  </div>`;
}

function challengeTeaser() {
  const s = g();
  if (!s.settings.challengesEnabled) return '';
  const ch = s.challenges?.daily;
  if (!ch?.items.length) return '';
  const left = ch.items.filter((c) => !c.claimed).length;
  const ready = ch.items.filter((c) => !c.claimed && C.isDone(s, c, 'daily', ch.key)).length;
  return `<div class="window flat teaser" data-tab="hunter" role="button" tabindex="0">
    <div class="window-title" style="margin-bottom:6px;padding-bottom:8px"><h2>Daily challenges</h2>
      <span class="count">${ready ? `${ready} ready to claim` : left ? `${left} left` : 'all claimed'}</span></div>
    ${ch.items.map((c) => chRow('daily', ch, c, true)).join('')}
  </div>`;
}

/* ============================================================
   BOSS, REVIEW, STATS, BOARD, FOCUS, SCHEDULE
   ============================================================ */
const fmt = (n) => Number(n || 0).toLocaleString();
const dayLabel = (k) => new Date(`${k}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

function bossBlock(compact = false) {
  const s = g();
  if (s.settings.bossEnabled === false || !s.boss) return '';
  const b = s.boss;
  const d = B.damage(s, b);
  const pct = Math.min(100, (d.total / b.maxHp) * 100);
  const beaten = d.total >= b.maxHp;
  const left = Math.max(0, Math.ceil((Date.parse(`${addDays(b.key, 7)}T00:00:00`) + (s.settings.dayResetHour ?? 4) * 3600000 - Date.now()) / 864e5));
  const act = b.claimed ? '<span class="pill on">defeated</span>'
    : beaten ? (compact ? '<span class="pill on">ready</span>' : '<button class="primary sm" data-act="claim-boss">Claim</button>') : '';
  const head = `<div class="window-title"><h2>${compact ? 'Boss gate' : 'Weekly boss'}</h2><span class="count">${b.claimed ? 'claimed' : beaten ? 'defeated' : `${left}d left`}</span></div>`;
  return `<div class="window boss t${b.tier} ${beaten ? 'beaten' : ''}" ${compact ? 'data-tab="hunter" role="button" tabindex="0"' : ''}>
    ${head}
    <div class="boss-row"><div class="boss-ico">${icon('sword', 22)}</div>
      <div class="boss-body"><div class="boss-name">${h(b.name)}</div>
        <div class="hp"><i style="width:${(100 - pct).toFixed(1)}%"></i></div>
        <div class="ch-s"><span class="num">${fmt(Math.max(0, b.maxHp - d.total))} / ${fmt(b.maxHp)} HP</span><span class="num rw">+${fmt(b.rewardGold)}g · +${fmt(b.rewardXp)} XP</span></div></div>
      <div class="ch-act">${act}</div></div>
    ${compact ? '' : `<div class="tiny muted" style="margin-top:8px">Quests ${d.quests} · habits ${d.habits} · training ${d.sessions} · perfect days ${d.perfect}. Bigger quests hit harder. A new boss arrives every Monday and a beaten one pays out by itself.</div>`}
  </div>`;
}

function delta(a, b, unit = '') {
  const d = a - b;
  if (!b && !a) return '';
  if (d === 0) return '<span class="dl flat">same</span>';
  return `<span class="dl ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d))}${unit}</span>`;
}

function reviewBlock() {
  const s = g();
  const off = ui.reviewOff || 0;
  const { cur, prev, start } = I.weekReview(s, off);
  const tile = (label, v, p, unit = '') => `<div class="tile"><b class="num">${fmt(v)}${unit}</b><span>${label}</span>${delta(v, p, unit)}</div>`;
  const quiet = !cur.quests && !cur.habits && !cur.sessions;
  return `<div class="window" id="review">
    <div class="window-title"><h2>Week in review</h2><span class="count">${h(dayLabel(start))} – ${h(dayLabel(cur.b))}</span></div>
    <div class="chips" style="margin-bottom:12px">
      <button class="chip ${off === 0 ? 'on' : ''}" data-act="review-week" data-o="0">This week</button>
      <button class="chip ${off === -1 ? 'on' : ''}" data-act="review-week" data-o="-1">Last week</button>
      <button class="chip ${off === -2 ? 'on' : ''}" data-act="review-week" data-o="-2">2 weeks ago</button>
    </div>
    <div class="tiles">
      ${tile('quests', cur.quests, prev.quests)}${tile('habits', cur.habits, prev.habits)}
      ${tile('sessions', cur.sessions, prev.sessions)}${tile('perfect days', cur.perfect, prev.perfect)}
      ${tile('XP', cur.xp, prev.xp)}${tile('gold earned', cur.gold, prev.gold)}
    </div>
    <div class="tiny" style="margin-top:12px;color:var(--ink)">${h(I.verdict(cur, prev))}</div>
    ${quiet ? '' : `<div class="tiny muted" style="margin-top:6px">${cur.best ? `Biggest clear: ${h(cur.best.title)} (${cur.best.rank}). ` : ''}${cur.bestDay ? `Best day: ${h(dayLabel(cur.bestDay.key))}, ${fmt(cur.bestDay.xp)} XP. ` : ''}${cur.early ? `${cur.early} finished early. ` : ''}Spent ${fmt(cur.spent)}g.</div>`}
    <div class="tiny muted" style="margin-top:6px">Arrows compare with the week before.</div>
  </div>`;
}

function barChart(vals, labels, { color = 'var(--mana)', h: H = 90, fmtv = fmt } = {}) {
  const max = Math.max(1, ...vals.map((v) => v ?? 0));
  const w = 100 / vals.length;
  const bars = vals.map((v, i) => {
    if (v == null) return '';
    const bh = Math.max(v ? 2 : 0, (v / max) * (H - 4));
    return `<rect x="${(i * w + w * 0.14).toFixed(2)}" y="${(H - bh).toFixed(1)}" width="${(w * 0.72).toFixed(2)}" height="${bh.toFixed(1)}" rx="1.2" fill="${color}"><title>${h(labels[i])}: ${h(fmtv(v))}</title></rect>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 100 ${H}" preserveAspectRatio="none" role="img">${bars}</svg>`;
}

function statsBlock() {
  const s = g();
  const n = ui.statDays || 14;
  const ser = I.series(s, n);
  const wd = I.byWeekday(s, 90);
  const wmax = Math.max(1, ...wd);
  const tot = ser.reduce((a, d) => ({ xp: a.xp + d.xp, q: a.q + d.quests, gold: a.gold + (d.goldKnown ? d.gold : 0), spent: a.spent + (d.goldKnown ? d.spent : 0) }), { xp: 0, q: 0, gold: 0, spent: 0 });
  const ends = `<div class="axis"><span>${h(dayLabel(ser[0].k))}</span><span>today</span></div>`;
  const goldKnown = ser.some((d) => d.goldKnown);
  return `<div class="window">
    <div class="window-title"><h2>Stats</h2><span class="count">last ${n} days</span></div>
    <div class="chips" style="margin-bottom:12px">${[14, 30, 90].map((d) => `<button class="chip ${n === d ? 'on' : ''}" data-act="stat-days" data-d="${d}">${d} days</button>`).join('')}</div>
    <div class="cap">XP per day <b class="num">${fmt(tot.xp)}</b></div>
    ${barChart(ser.map((d) => d.xp), ser.map((d) => dayLabel(d.k)))}${ends}
    <div class="cap" style="margin-top:14px">Quests cleared per day <b class="num">${fmt(tot.q)}</b></div>
    ${barChart(ser.map((d) => d.quests), ser.map((d) => dayLabel(d.k)), { color: 'var(--ok)', h: 60 })}
    ${goldKnown ? `<div class="cap" style="margin-top:14px">Gold earned <b class="num" style="color:var(--gold)">${fmt(tot.gold)}</b> <span class="muted">· spent</span> <b class="num">${fmt(tot.spent)}</b></div>
      ${barChart(ser.map((d) => (d.goldKnown ? d.gold : null)), ser.map((d) => dayLabel(d.k)), { color: 'var(--gold)', h: 60 })}
      ${ser.some((d) => !d.goldKnown) ? '<div class="tiny muted" style="margin-top:4px">Gold history only goes back as far as your last 400 transactions.</div>' : ''}` : ''}
    <div class="cap" style="margin-top:14px">Quests by weekday <span class="muted">(90 days)</span></div>
    <div class="wd">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => `<div><i style="height:${Math.round((wd[i] / wmax) * 100)}%"></i><b class="num">${wd[i]}</b><span>${l}</span></div>`).join('')}</div>
  </div>`;
}

function boardBlock() {
  const s = g();
  const on = !!s.settings.board?.enabled;
  const b = ui.board || {};
  const rows = b.rows || [];
  const sort = ui.boardSort || 'level';
  const list = [...rows].sort((x, y) => (sort === 'week' ? y.weekXp - x.weekXp : (y.level - x.level) || (y.xp - x.xp)));
  return `<div class="window">
    <div class="window-title"><h2>Leaderboard</h2><span class="count">${on ? `${rows.length} playing` : 'off'}</span></div>
    ${on ? `<div class="chips" style="margin-bottom:10px">
        <button class="chip ${sort === 'level' ? 'on' : ''}" data-act="board-sort" data-s="level">Level</button>
        <button class="chip ${sort === 'week' ? 'on' : ''}" data-act="board-sort" data-s="week">XP this week</button>
        <button class="chip" data-act="board-refresh">${b.loading ? 'Loading…' : 'Refresh'}</button></div>
      ${list.length ? list.map((r, i) => `<div class="lb ${r.me ? 'me' : ''}"><b class="num">${i + 1}</b><span class="lb-n">${h(r.name)}</span><span class="tiny muted">${h(E.hunterTitle(r.level).title)}</span><span class="num">Lv ${r.level}</span><span class="num muted">${fmt(r.weekXp)} wk</span></div>`).join('')
        : `<div class="tiny muted">${b.err ? h(b.err) : b.loading ? 'Loading…' : 'Nobody yet.'}</div>`}
      <div class="tiny muted" style="margin-top:10px">Shows your name, level and weekly XP to anyone on this site. Nothing else.</div>
      <button class="ghost sm" style="margin-top:8px" data-act="board-toggle" data-on="0">Leave the board</button>`
    : `<div class="tiny muted" style="margin-bottom:10px">See friends on the same site. Joining shares only your player name, level and weekly XP with them.</div>
      <button class="sm" data-act="board-toggle" data-on="1">Join the board</button>`}
  </div>`;
}

function reviewBanner() {
  const s = g();
  const wk = I.mondayOf(tk());
  const dow = new Date(`${tk()}T12:00:00`).getDay();
  if (!(dow === 0 || dow === 1) || lsGet('solo-review-seen') === wk) return '';
  const off = dow === 1 ? -1 : 0;
  return `<div class="window flat teaser" data-act="open-review" data-o="${off}" role="button" tabindex="0">
    <div class="window-title" style="margin:0;padding:0;border:0"><h2>${dow === 1 ? 'Last week' : 'This week'} in review</h2><span class="count">tap to view</span></div></div>`;
}

function focusCard() {
  const s = g();
  const t = F.running();
  if (t) {
    const done = F.isFinished(t);
    const r = F.rewardFor(s, t.mins);
    return `<div class="window focus ${done ? 'done' : ''}">
      <div class="window-title"><h2>Focus</h2><span class="count">${t.mins} min${t.label ? ` · ${h(t.label)}` : ''}</span></div>
      <div class="focus-time num" id="focus-time">${done ? 'Done' : fmtClock(F.remainingMs(t))}</div>
      <div class="ch-bar"><i id="focus-bar" style="width:${Math.min(100, ((Date.now() - t.start) / (t.mins * 60000)) * 100).toFixed(1)}%"></i></div>
      <div style="display:flex;gap:8px;margin-top:10px">
        ${done ? `<button class="primary" style="flex:1" data-act="focus-collect">Collect ${r.gold ? `+${r.gold}g` : ''}</button>` : '<button class="ghost" style="flex:1" data-act="focus-cancel">Give up</button>'}
      </div>
      ${done && !r.paid ? `<div class="tiny muted" style="margin-top:8px">Today's ${F.DAILY_CAP_MIN} paid minutes are used up. It still counts toward Focus awards.</div>` : ''}
    </div>`;
  }
  const used = s.focusLog?.[tk()] || 0;
  return `<div class="window flat teaser" data-act="focus-open" role="button" tabindex="0">
    <div class="window-title" style="margin:0;padding:0;border:0"><h2>Focus timer</h2><span class="count">${used ? `${used} min today` : 'start a block'}</span></div></div>`;
}
export const fmtClock = (ms) => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

function scheduleBlock() {
  const s = g();
  const p = SC.plan(s, 7);
  if (!p.days.some((d) => d.load) && !p.overflow.length) return '';
  const open = !!ui.schedOpen;
  const head = `<div class="window-title"><h2>Smart schedule</h2><span class="count">${p.today.length ? `${p.today.reduce((n, x) => n + 1, 0)} to work on today` : 'nothing needed today'}</span></div>`;
  return `<div class="window">
    ${head}
    ${p.overflow.length ? `<div class="tiny" style="color:var(--danger);margin-bottom:8px">Too much for the time left: ${p.overflow.slice(0, 3).map((o) => h(o.title)).join(', ')}${p.overflow.length > 3 ? '…' : ''}. Start these now.</div>` : ''}
    ${p.today.length ? p.today.map((x) => `<div class="sch-row"><span class="rank ${rankClass(x.rank)}" style="pointer-events:none">${x.rank}</span><span class="sch-t">${h(x.title)}</span><span class="tiny muted">${x.final ? 'due today' : `due ${h(dayLabel(x.due))}`}</span></div>`).join('') : '<div class="tiny muted">Today is clear. Light days are a good time to get ahead.</div>'}
    <div class="sch-days">${p.days.map((d, i) => {
      const pct = Math.min(100, (d.load / p.cap) * 100);
      return `<div class="sd ${d.load > p.cap ? 'over' : ''} ${d.off ? 'off' : ''}" title="${h(dayLabel(d.k))}: ${d.load}/${p.cap}"><i style="height:${d.off ? 0 : pct}%"></i><span>${i === 0 ? 'Now' : DOW[new Date(`${d.k}T12:00:00`).getDay()]}</span></div>`;
    }).join('')}</div>
    <button class="ghost sm" style="margin-top:10px" data-act="sched-toggle">${open ? 'Hide plan' : 'Show full plan'}</button>
    ${open ? p.days.filter((d) => d.items.length).map((d) => `<div class="sch-day"><div class="tiny muted" style="margin:10px 0 4px">${h(dayLabel(d.k))} · ${d.load}/${p.cap}</div>${d.items.map((x) => `<div class="sch-row"><span class="rank ${rankClass(x.rank)}" style="pointer-events:none">${x.rank}</span><span class="sch-t">${h(x.title)}</span><span class="tiny muted">${x.final ? 'finish' : 'work'}</span></div>`).join('')}</div>`).join('') : ''}
    <div class="tiny muted" style="margin-top:8px">Works backward from each due date using quest rank as effort, so nothing lands all at once. Change the daily limit in System.</div>
  </div>`;
}

/* ============================================================
   HUNTER TAB — profile, titles, challenges, achievements
   ============================================================ */
function achCard(a) {
  const s = g();
  const have = Math.min(s.counters?.[a.counter] || 0, a.need);
  const on = !!s.achievements?.[a.id];
  const pct = (have / a.need) * 100;
  const t = A.TIERS[a.tier];
  return `<div class="ach-card ${a.tier} ${on ? 'on' : ''}">
    <div class="badge" style="--tc:${TIER_COL[a.tier]}">${icon(on ? a.icon : 'lock', 22)}</div>
    <div class="ach-n">${h(a.name)}</div>
    <div class="ach-d">${h(a.desc)}</div>
    ${on ? `<div class="ach-r num">${t.label}${a.title ? ` · title` : ''}</div>`
      : `<div class="ch-bar thin"><i style="width:${pct.toFixed(1)}%"></i></div><div class="ach-r num">${have.toLocaleString()} / ${a.need.toLocaleString()} · +${t.gold}g</div>`}
  </div>`;
}

function hunterTab() {
  const s = g();
  const p = E.levelProgress(s.xp);
  const rank = E.hunterTitle(p.level);
  const title = A.equippedTitle(s, rank.title);
  const owned = A.ownedTitles(s);
  const c = s.counters || {};
  const total = A.LIST.length, got = A.unlockedCount(s);

  const filters = ['All', 'Unlocked', 'Locked', ...A.GROUP_NAMES];
  const list = A.LIST.filter((a) => {
    const on = !!s.achievements?.[a.id];
    if (ui.achFilter === 'All') return true;
    if (ui.achFilter === 'Unlocked') return on;
    if (ui.achFilter === 'Locked') return !on;
    return a.group === ui.achFilter;
  });

  return `<div class="wrap">
    <div class="window profile">
      <div class="prof-top">${levelRing(p.level, p.pct, 84)}
        <div><div class="disp prof-name">${h(s.settings.hunterName || 'Player')}</div>
          <div class="prof-title">${h(title)}</div>
          <div class="tiny muted">${h(rank.title)} · ${p.cur.toLocaleString()} / ${p.need.toLocaleString()} XP</div></div></div>
      <div class="stats" style="margin-top:14px">${STATS.map((k) => `<div class="stat"><b>${s.stats[k] || 0}</b><span>${k}</span></div>`).join('')}</div>
      <div class="facts">
        <div><b class="num">${(c.quests || 0).toLocaleString()}</b><span>quests</span></div>
        <div><b class="num">${(c.sessions || 0).toLocaleString()}</b><span>sessions</span></div>
        <div><b class="num">${s.questStreak || 0}</b><span>day streak</span></div>
        <div><b class="num">${got}/${total}</b><span>awards</span></div>
      </div>
      ${(s.streakShields || 0) || (s.rerolls || 0) ? `<div class="tiny muted" style="margin-top:12px">Holding: ${s.streakShields ? `${s.streakShields} streak shield${s.streakShields > 1 ? 's' : ''}` : ''}${s.streakShields && s.rerolls ? ' · ' : ''}${s.rerolls ? `${s.rerolls} reroll${s.rerolls > 1 ? 's' : ''}` : ''}</div>` : ''}
    </div>

    <div class="window">
      <div class="window-title"><h2>Title</h2><span class="count">${owned.length} earned</span></div>
      <div class="chips">
        <button class="chip ${!s.title || !owned.some((t) => t.id === s.title) ? 'on' : ''}" data-act="equip-title" data-t="">${h(rank.title)}</button>
        ${owned.map((t) => `<button class="chip ${s.title === t.id ? 'on' : ''}" data-act="equip-title" data-t="${h(t.id)}">${h(t.name)}</button>`).join('')}
      </div>
      ${owned.length ? '' : '<div class="tiny muted" style="margin-top:10px">Titles come from achievements. Earn one and it shows up here.</div>'}
    </div>

    ${bossBlock()}
    ${reviewBlock()}
    ${s.settings.challengesEnabled ? `<h2 class="sect">Challenges</h2>
      ${C.PERIODS.map(challengeBlock).join('')}
      <div class="tiny muted" style="margin:-4px 2px 16px">Targets scale with your level and are fixed when the period starts. Finished ones pay out on their own if you forget to claim.${(s.rerolls || 0) ? '' : ' Rerolls are in the shop.'}</div>` : ''}

    ${statsBlock()}
    ${boardBlock()}

    <h2 class="sect">Achievements <span class="num">${got}/${total}</span></h2>
    <div class="chips scroll" style="margin-bottom:12px">${filters.map((f) => `<button class="chip ${ui.achFilter === f ? 'on' : ''}" data-act="ach-filter" data-f="${h(f)}">${h(f)}</button>`).join('')}</div>
    <div class="ach-grid">${list.map(achCard).join('') || '<div class="empty tiny">Nothing here yet.</div>'}</div>
  </div>`;
}

/* ============================================================
   TAB 1 — QUESTS
   ============================================================ */
function questsTab() {
  const s = g();
  const today = tk();
  const all = Object.values(s.quests);
  const open = all.filter((q) => !q.done && !q.missed && !q.dismissed);
  const sorted = [...open].sort((a, b) => (dueDay(a) || '9999').localeCompare(dueDay(b) || '9999'));

  const buckets = {
    overdue: sorted.filter((q) => dueDay(q) && dueDay(q) < today),
    today: sorted.filter((q) => dueDay(q) === today),
    soon: sorted.filter((q) => dueDay(q) > today && daysBetween(today, dueDay(q)) <= 7),
    later: sorted.filter((q) => !dueDay(q) || daysBetween(today, dueDay(q)) > 7),
  };

  const row = (q) => {
    const rank = E.rankOf(q, s.settings);
    const r = E.questReward(q, s.settings, s.questStreak || 0, today, s);
    const dl = dueLabel(q);
    const picked = ui.selected?.has(q.id);
    return `<div class="row" data-quest="${h(q.id)}">
      ${ui.selecting
        ? `<button class="check ${picked ? 'on' : ''}" data-act="sel-toggle" data-id="${h(q.id)}">\u2713</button>`
        : `<button class="check" data-act="finish-quest" data-id="${h(q.id)}" aria-label="Complete ${h(q.title)}">\u2713</button>`}
      <div class="body ${ui.selecting ? '' : 'tappable'}" ${ui.selecting ? `data-act="sel-toggle" data-id="${h(q.id)}"` : `data-act="open-quest" data-id="${h(q.id)}"`} role="button" tabindex="0">
        <div class="t">${h(q.title)}</div>
        <div class="s">
          ${q.course ? `<span>${h(q.course)}</span>` : ''}
          <span class="${dl.cls}">${dl.text}</span>
          ${q.manualRank ? '<span class="pill on">set by you</span>' : ''}
        </div>
      </div>
      <span class="pay">+${r.gold}g</span>
      <button class="rank ${rankClass(rank)}${q.manualRank ? ' manual' : ''}" data-act="cycle-rank" data-id="${h(q.id)}"
        title="Tap to change difficulty">${rank}</button>
    </div>`;
  };

  const section = (title, list, note = '') => list.length
    ? `<div class="window"><div class="window-title"><h2>${title}</h2>${note ? `<span class="eyebrow">${note}</span>` : ''}<span class="count">${list.length}</span></div>${list.map(row).join('')}</div>`
    : '';

  const cleared = all.filter((q) => q.done && !q.dismissed);
  const done = [...cleared].sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')).slice(0, 12);
  const missed = all.filter((q) => q.missed && !q.dismissed).slice(0, 8);
  const dismissed = all.filter((q) => q.dismissed);

  const body = (buckets.overdue.length + buckets.today.length + buckets.soon.length + buckets.later.length) === 0
    ? `<div class="window"><div class="empty"><span class="mark">\u25c7</span>
        No open quests.<br><span class="tiny">${s.settings.icsUrl || s.settings.todoistToken ? 'Pull to sync, or add one by hand.' : 'Add Schoology or Todoist in Settings to load quests automatically.'}</span></div></div>`
    : section('Overdue', buckets.overdue) + section('Due today', buckets.today)
      + section('This week', buckets.soon) + section('Later', buckets.later);

  const oldCount = E.questsBefore(s, today, 'all').length;

  return `<div class="wrap">
    ${ui.selecting ? '' : todayCard()}
    ${ui.selecting ? '' : reviewBanner()}
    ${ui.selecting ? '' : challengeTeaser()}
    ${ui.selecting ? '' : bossBlock(true)}
    ${ui.selecting ? '' : focusCard()}
    ${ui.selecting ? `<div class="selbar">
        <button class="sm ghost" data-act="sel-all">${ui.selected?.size === open.length && open.length ? 'None' : 'All'}</button>
        <span class="num">${ui.selected?.size || 0} selected</span>
        <button class="sm danger" data-act="sel-delete" ${ui.selected?.size ? '' : 'disabled'}>Delete</button>
        <button class="sm ghost" data-act="select-mode">Done</button>
      </div>`
    : `<div style="display:flex;gap:8px;margin-bottom:14px">
        <button style="flex:1" data-act="sync">${
          s.settings.icsUrl && s.settings.todoistToken ? 'Sync Schoology + Todoist'
          : s.settings.icsUrl ? 'Sync Schoology'
          : s.settings.todoistToken ? 'Sync Todoist'
          : 'Add a calendar source'
        }</button>
        <button data-act="add-quest">+ Quest</button>
        ${open.length ? '<button data-act="select-mode">Select</button>' : ''}
      </div>`}

    ${oldCount >= 5 && !ui.selecting ? `<div class="window" style="padding:13px 16px">
      <div class="tiny" style="color:var(--gold);margin-bottom:9px">${oldCount} quests are dated before today \u2014 usually leftovers from joining a course.</div>
      <button class="sm gold" data-act="purge-old">Clear them out</button>
    </div>` : ''}
    ${s.lastSync ? `<div class="tiny muted" style="margin:-8px 0 12px;font-family:var(--m)">Last sync ${new Date(s.lastSync).toLocaleString()}</div>` : ''}
    ${body}
    ${ui.selecting ? '' : scheduleBlock()}
    ${missed.length ? `<div class="window"><div class="window-title"><h2>Failed</h2><span class="count">${missed.length}</span></div>
      ${missed.map((q) => `<div class="row missed"><div class="body tappable" data-act="open-quest" data-id="${h(q.id)}"><div class="t">${h(q.title)}</div><div class="s">${h(q.course || '')}</div></div>
      <button class="sm ghost" data-act="revive" data-id="${h(q.id)}">Restore</button></div>`).join('')}</div>` : ''}
    ${done.length ? `<details class="acc"><summary>Cleared (${cleared.length})</summary><div>
      ${done.map((q) => `<div class="row done"><div class="body tappable" data-act="open-quest" data-id="${h(q.id)}"><div class="t">${h(q.title)}</div>
        <div class="s">${h(q.course || '')} \u00b7 +${q.paid || 0}g</div></div>
        <button class="sm ghost" data-act="undo-quest" data-id="${h(q.id)}">Undo</button></div>`).join('')}
    </div></details>` : ''}
    ${dismissed.length ? `<details class="acc"><summary>Deleted (${dismissed.length})</summary><div>
      <div class="tiny muted" style="margin-bottom:8px">Kept only so Schoology or Todoist can\u2019t re-add them on the next sync.</div>
      ${dismissed.map((q) => `<div class="row"><div class="body"><div class="t tiny muted">${h(q.title)}</div>
        <div class="s">${h(q.course || '')}</div></div>
        <button class="sm ghost" data-act="restore-quest" data-id="${h(q.id)}">Restore</button></div>`).join('')}
    </div></details>` : ''}
  </div>`;
}

/* ============================================================
   TAB 2 — GYM
   ============================================================ */
function gymTab() {
  const s = g();
  const today = tk();
  const pre = E.prescribedFor(s, today);
  const log = s.gymLog[today] || { exercises: {} };
  const pos = E.cyclePosition(s, today);
  const rested = E.isGymRest(s, today) || E.isDayOff(s, today);

  const bar = [];
  const plan = s.plans[pre.planKey];
  for (let d = 1; d <= pos.len; d++) {
    const key = addDays(s.cycle.startDate, d - 1);
    const isRest = !(plan.days[d] || []).length;
    const done = s.gymLog[key]?.done;
    bar.push(`<i class="${d === pos.day ? 'today' : done ? 'done' : isRest ? 'rest' : ''}" title="Day ${d}"></i>`);
  }

  const exHtml = pre.exercises.map((e) => {
    const st = log.exercises?.[e.key] || { sets: [] };
    const boxes = Array.from({ length: e.sets }, (_, i) =>
      `<button class="setbox ${st.sets?.[i] ? 'on' : ''}" data-act="set" data-key="${h(e.key)}" data-i="${i}">${st.sets?.[i] ? '\u2713' : i + 1}</button>`).join('');
    return `<div class="ex">
      <div class="ex-head">
        <span class="pill">${h(e.ladderLabel)}</span>
        <span class="ex-name">${h(e.name)}</span>
        <span class="ex-dose num">${e.sets}\u00d7${e.reps}${e.unit !== 'reps' ? ` ${e.unit}` : ''}${e.weightLb ? ` @${e.weightLb}lb` : ''}</span>
      </div>
      <div class="sets">${boxes}
        <button class="setbox" data-act="bump" data-key="${h(e.key)}" title="Nudge target reps">+</button>
      </div>
      <div class="tiny muted" style="margin-top:6px">Range ${e.range}${e.atTop ? ' \u00b7 at the top \u2014 next cycle moves you up' : ''}</div>
    </div>`;
  }).join('');

  const isRestDay = pre.exercises.length === 0;
  const history = (s.cycleHistory || [])[0];

  const prof = s.gymProfile;
  const finder = `<div class="window flat" style="padding:13px 16px">
      <div class="tiny" style="margin-bottom:10px;color:${prof ? 'var(--muted)' : 'var(--ink)'}">${prof
        ? `Built for <b style="color:var(--glow)">${h(GOALS[prof.goal]?.label || 'your goal')}</b> \u00b7 ${prof.days} days a week \u00b7 ${prof.minutes} min`
        : 'Not sure what to train? Answer a few questions and the System builds a plan around your levels, schedule and equipment.'}</div>
      <button class="${prof ? 'ghost' : 'gold'}" style="width:100%" data-act="planner-open">${prof ? 'Rebuild my plan' : 'Find my plan'}</button>
    </div>`;

  return `<div class="wrap">
    ${finder}
    <div class="window">
      <div class="window-title"><h2>${h(pre.planName)}</h2><span class="count">Cycle ${s.cycle.index} \u00b7 Day ${pos.day}/${pos.len}</span></div>
      <div class="cyclebar">${bar.join('')}</div>
      ${pre.deload ? '<div class="tiny" style="color:var(--gold);margin-top:10px">Deload cycle \u2014 volume is cut on purpose. Same movements, fewer sets.</div>' : ''}
      ${rested ? '<div class="tiny" style="color:var(--gold);margin-top:10px">Rest pass active. Today won\u2019t count against your cycle.</div>' : ''}
    </div>

    ${isRestDay
      ? `<div class="window"><div class="empty"><span class="mark">\u25cb</span>Rest day.<br><span class="tiny">Recovery is when the strength actually shows up.</span></div></div>`
      : `<div class="window">
          <div class="window-title"><h2>Today\u2019s training</h2><span class="count">${pre.location === 'gym' ? 'gym floor' : 'at home'}</span></div>
          ${exHtml}
          <button style="width:100%;margin-top:14px" class="${log.done ? 'ghost' : 'gold'}" data-act="finish-gym">
            ${log.done ? 'Session cleared \u2014 tap to undo' : `Clear session \u00b7 +${s.settings.gym.goldPerSession}g`}</button>
        </div>`}

    ${history ? `<details class="acc"><summary>Last cycle\u2019s adjustment</summary><div>
      ${history.changes.map((c) => c.result === 'progressed'
        ? `<div class="row"><div class="body"><div class="t tiny">${h(c.from)} \u2192 ${h(c.to)}</div><div class="s">${c.rate}% of sessions cleared</div></div></div>`
        : `<div class="row"><div class="body"><div class="t tiny muted">${h(c.name || c.slot)} \u2014 held</div><div class="s">${c.rate}% cleared, below the bar</div></div></div>`).join('')}
    </div></details>` : ''}

    <button style="width:100%" class="ghost" data-act="tab-settings-gym">Edit the 30-day plan</button>
  </div>`;
}

/* ============================================================
   TAB 3 — HABITS
   ============================================================ */
function habitsTab() {
  const s = g();
  const today = tk();
  const due = E.habitsFor(s, today);
  const log = s.habitLog[today] || {};
  const off = E.isDayOff(s, today);

  const row = (hb) => {
    const done = !!log[hb.id];
    const streak = s.habitStreaks[hb.id] || 0;
    const bonus = streak > 0 && streak % s.settings.habits.streakBonusEvery === 0 ? s.settings.habits.streakBonusGold : 0;
    return `<div class="row ${done ? 'done' : ''}">
      <button class="check ${done ? 'on' : ''}" data-act="toggle-habit" data-id="${h(hb.id)}" aria-label="${h(hb.name)}">\u2713</button>
      <div class="body">
        <div class="t">${h(hb.name)}</div>
        <div class="s">
          <span>${scheduleLabel(hb.schedule)}</span>
          ${streak ? `<span style="color:var(--mana)">${streak}\u00d7 streak</span>` : ''}
          ${hb.penalty && !done ? `<span class="overdue">\u2212${hb.penalty}g if missed</span>` : ''}
        </div>
      </div>
      <span class="pay">+${hb.gold + bonus}g</span>
    </div>`;
  };

  const upcoming = [1, 2, 3, 4, 5, 6].map((n) => {
    const k = addDays(today, n);
    const list = E.habitsFor(s, k);
    return list.length ? `<div class="row"><div class="body"><div class="t tiny">${new Date(k + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long' })}</div>
      <div class="s">${list.map((x) => h(x.name)).join(' \u00b7 ')}</div></div>
      <span class="pay tiny">+${list.reduce((a, x) => a + x.gold, 0)}g</span></div>` : '';
  }).join('');

  return `<div class="wrap">
    ${off ? '<div class="window"><div class="tiny" style="color:var(--gold)">Day off is active. Nothing here can penalise you today.</div></div>' : ''}
    <div class="window">
      <div class="window-title"><h2>Today</h2><span class="count">${Object.keys(log).filter((k) => log[k]).length}/${due.length}</span></div>
      ${due.length ? due.map(row).join('') : '<div class="empty"><span class="mark">\u25cb</span>Nothing scheduled today.</div>'}
      ${s.habitSkips ? `<button class="sm gold" style="margin-top:12px" data-act="use-skip">Use a skip pass (${s.habitSkips} left)</button>` : ''}
    </div>
    ${upcoming ? `<div class="window"><div class="window-title"><h2>Coming up</h2></div>${upcoming}</div>` : ''}
    <button style="width:100%" class="ghost" data-act="tab-settings-habits">Edit habits</button>
  </div>`;
}

function scheduleLabel(s) {
  if (!s) return 'daily';
  if (s.type === 'daily') return 'every day';
  if (s.type === 'weekdays') return 'school days';
  if (s.type === 'monthly') return `day ${s.dayOfMonth || 1} monthly`;
  return (s.days || []).map((d) => DOW[d]).join(' ') || 'never';
}

/* ============================================================
   TAB — CALENDAR
   ============================================================ */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

function monthKey(k) { return k.slice(0, 7); }
function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthGrid(ym) {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const lead = first.getDay();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(`${ym}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

function calendarTab() {
  const st = g();
  const today = tk();
  const ym = ui.calMonth || monthKey(today);
  const sel = ui.calDay || today;
  const cells = monthGrid(ym);

  // one pass over the month so we're not recomputing per cell
  const info = {};
  cells.filter(Boolean).forEach((k) => { info[k] = E.dayDetail(st, k); });

  const cell = (k) => {
    if (!k) return '<div class="cal-cell empty"></div>';
    const d = info[k];
    const n = Number(k.slice(8));
    const cls = [
      'cal-cell',
      k === today ? 'today' : '',
      k === sel ? 'sel' : '',
      d.dayOff ? 'off' : '',
      k < today ? 'past' : '',
    ].filter(Boolean).join(' ');

    const marks = [];
    if (d.openQuests.length) {
      const top = E.rankOf(d.openQuests[0], st.settings);
      marks.push(`<i class="m rank-${rankClass(top)}" title="${d.openQuests.length} due"></i>`);
    } else if (d.quests.length) {
      marks.push('<i class="m done"></i>');
    }
    if (d.training?.exercises.length) marks.push(`<i class="m gym${d.trained ? ' done' : ''}"></i>`);
    if (d.habits.length) {
      const all = d.habitsDone >= d.habits.length && d.habits.length > 0;
      marks.push(`<i class="m hab${all ? ' done' : ''}"></i>`);
    }

    return `<button class="${cls}" data-act="cal-day" data-k="${k}">
      <span class="n">${n}</span>
      <span class="marks">${marks.join('')}</span>
    </button>`;
  };

  const d = info[sel] || E.dayDetail(st, sel);
  const selDate = new Date(sel + 'T12:00:00');
  const isToday = sel === today;

  const questLine = (q) => {
    const r = E.rankOf(q, st.settings);
    return `<div class="row ${q.done ? 'done' : q.missed ? 'missed' : ''}">
      ${q.done || q.missed ? '<span class="check" style="opacity:.4"></span>'
        : `<button class="check" data-act="finish-quest" data-id="${h(q.id)}">\u2713</button>`}
      <div class="body tappable" data-act="open-quest" data-id="${h(q.id)}">
        <div class="t">${h(q.title)}</div>
        <div class="s">${h(q.course || '')}${q.done ? ` \u00b7 +${q.paid || 0}g` : ''}</div>
      </div>
      <span class="rank ${rankClass(r)}">${r}</span>
    </div>`;
  };

  // month totals
  const monthDays = cells.filter(Boolean);
  const cleared = monthDays.reduce((a, k) => a + (info[k]?.quests.filter((q) => q.done).length || 0), 0);
  const sessions = monthDays.filter((k) => st.gymLog[k]?.done).length;
  const offDays = monthDays.filter((k) => info[k]?.dayOff).length;

  return `<div class="wrap">
    <div class="window">
      <div class="cal-head">
        <button class="sm ghost" data-act="cal-prev">\u2039</button>
        <div>
          <h2 style="font-size:16px">${MONTHS[Number(ym.slice(5)) - 1]}</h2>
          <span class="eyebrow">${ym.slice(0, 4)}</span>
        </div>
        <button class="sm ghost" data-act="cal-next">\u203a</button>
        <button class="sm" style="margin-left:auto" data-act="cal-today">Today</button>
      </div>

      <div class="cal-dow">${DOW.map((x) => `<span>${x}</span>`).join('')}</div>
      <div class="cal-grid">${cells.map(cell).join('')}</div>

      <div class="cal-legend">
        <span><i class="m rank-C"></i>quest due</span>
        <span><i class="m gym"></i>training</span>
        <span><i class="m hab"></i>habits</span>
        <span><i class="m off"></i>day off</span>
      </div>
    </div>

    <div class="window">
      <div class="window-title">
        <h2>${isToday ? 'Today' : selDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</h2>
        <span class="count">${d.dayOff ? 'DAY OFF' : ''}</span>
      </div>

      ${d.dayOff ? '<div class="tiny" style="color:var(--gold);margin-bottom:12px">Nothing counts against you on this day.</div>' : ''}

      <div class="eyebrow" style="margin-bottom:6px">Quests</div>
      ${d.quests.length ? d.quests.map(questLine).join('')
        : '<div class="tiny muted" style="padding:4px 0 12px">Nothing due.</div>'}

      <div class="eyebrow" style="margin:16px 0 6px">Training</div>
      ${!d.training ? '<div class="tiny muted">Before this cycle started.</div>'
        : d.training.exercises.length === 0 ? '<div class="tiny muted">Rest day.</div>'
        : `<div class="tiny ${d.trained ? '' : 'muted'}" style="margin-bottom:4px">
             ${d.trained ? 'Cleared' : sel > today ? 'Planned' : 'Not cleared'} \u00b7 ${h(d.training.planName)} \u00b7 day ${d.training.day}
           </div>
           ${d.training.exercises.map((e) => `<div class="tiny" style="padding:3px 0;color:var(--ink)">
             <span class="num" style="color:var(--glow)">${e.sets}\u00d7${e.reps}${e.unit !== 'reps' ? ` ${e.unit}` : ''}</span>
             ${h(e.name)}${e.weightLb ? ` <span class="muted">@${e.weightLb}lb</span>` : ''}</div>`).join('')}`}

      <div class="eyebrow" style="margin:16px 0 6px">Habits \u00b7 ${d.habitsDone}/${d.habits.length}</div>
      ${d.habits.length ? d.habits.map((hb) => {
        const done = st.habitLog[sel]?.[hb.id] !== undefined;
        return `<div class="tiny" style="padding:3px 0;color:${done ? 'var(--faint)' : 'var(--ink)'}">
          ${done ? '\u2713 ' : '\u25cb '}${h(hb.name)} <span class="muted">+${hb.gold}g</span></div>`;
      }).join('') : '<div class="tiny muted">Nothing scheduled.</div>'}
    </div>

    <div class="window">
      <div class="window-title"><h2>This month</h2></div>
      <div class="grid3">
        <div class="stat"><b>${cleared}</b><span>CLEARED</span></div>
        <div class="stat"><b>${sessions}</b><span>SESSIONS</span></div>
        <div class="stat"><b>${offDays}</b><span>DAYS OFF</span></div>
      </div>
    </div>
  </div>`;
}

/* ============================================================
   TAB 4 — SHOP
   ============================================================ */
function shopTab() {
  const s = g();
  const today = tk();

  const item = (it) => {
    const cd = E.cooldownLeft(s, it);
    const broke = s.gold < it.price;
    const locked = cd > 0 || broke;
    const need = it.price - s.gold;
    return `<div class="shop-item ${locked ? 'locked' : ''}">
      <div class="sigil">${icon(it.icon || 'gift', 21)}</div>
      <div class="body" style="flex:1;min-width:0">
        <div class="t">${h(it.name)}</div>
        <div class="s tiny muted">${h(it.desc)}</div>
        ${cd > 0 ? `<div class="tiny" style="color:var(--danger);margin-top:3px">Available in ${cd} day${cd === 1 ? '' : 's'}</div>` : ''}
      </div>
      <div style="text-align:right">
        <div class="price">${it.price.toLocaleString()}g</div>
        ${broke ? `<span class="afford">${Math.ceil(need).toLocaleString()} short</span>`
          : `<button class="sm gold" data-act="buy" data-id="${h(it.id)}" ${cd > 0 ? 'disabled' : ''}>Buy</button>`}
      </div>
    </div>`;
  };

  const cats = [...SHOP_CATS, ...new Set(s.shop.map((i) => i.cat || 'Other').filter((c) => !SHOP_CATS.includes(c)))];
  const groups = cats.map((cat) => [cat, s.shop.filter((i) => (i.cat || 'Other') === cat)]).filter(([, l]) => l.length);
  const bag = [
    (s.rerolls || 0) ? `${s.rerolls} reroll${s.rerolls > 1 ? 's' : ''}` : '',
    (s.streakShields || 0) ? `${s.streakShields} streak shield${s.streakShields > 1 ? 's' : ''}` : '',
    (s.habitSkips || 0) ? `${s.habitSkips} habit skip${s.habitSkips > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' \u00b7 ');

  const active = (s.daysOff || []).filter((d) => d >= today).sort();
  const recent = s.purchases.slice(0, 8);
  const week = s.ledger.filter((l) => l.delta > 0 && daysBetween(l.at.slice(0, 10), today) <= 7).reduce((a, l) => a + l.delta, 0);

  return `<div class="wrap">
    <div class="window">
      <div class="window-title"><h2>Balance</h2><span class="count">last 7 days: +${Math.round(week).toLocaleString()}g</span></div>
      <div class="bigbal">${icon('coin', 28)}<span class="num">${Math.round(s.gold).toLocaleString()}</span></div>
      ${bag ? `<div class="tiny muted" style="margin-top:8px">In your bag: ${bag}</div>` : ''}
      ${active.length ? `<div class="tiny" style="color:var(--gold);margin-top:8px">Days off booked: ${active.map((d) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })).join(', ')}</div>` : ''}
    </div>
    ${groups.map(([cat, list]) => `<div class="window">
      <div class="window-title"><h2>${h(cat)}</h2><span class="count">${list.length}</span></div>
      ${list.map(item).join('')}
    </div>`).join('')}
    ${recent.length ? `<details class="acc"><summary>Purchase history</summary><div>
      ${recent.map((p) => `<div class="row"><div class="body"><div class="t tiny">${h(p.name)}</div>
        <div class="s">${new Date(p.at).toLocaleDateString()}${p.covers ? ` \u00b7 covers ${p.covers.length}d` : ''}</div></div>
        <span class="pay" style="color:var(--danger)">\u2212${p.price}g</span></div>`).join('')}
    </div></details>` : ''}
    <details class="acc"><summary>Gold ledger</summary><div>
      ${s.ledger.slice(0, 40).map((l) => `<div class="row"><div class="body"><div class="t tiny">${h(l.reason)}</div>
        <div class="s">${new Date(l.at).toLocaleString()}</div></div>
        <span class="pay" style="color:${l.delta < 0 ? 'var(--danger)' : 'var(--gold)'}">${l.delta > 0 ? '+' : ''}${Math.round(l.delta)}g</span></div>`).join('') || '<div class="empty tiny">Nothing yet.</div>'}
    </div></details>
    <button style="width:100%" class="ghost" data-act="tab-settings-shop">Edit prices</button>
  </div>`;
}

/* ============================================================
   TAB 5 — SETTINGS
   ============================================================ */
function settingsTab() {
  const s = g();
  const st = s.settings;
  const look = { ...DEFAULT_LOOK, ...(st.look || {}) };
  const rem = { enabled: false, morning: -1, evening: 19, ...(st.reminders || {}) };
  const T = (label, path, type = 'text', extra = '') =>
    `<div class="field"><label>${label}</label><input class="${type === 'number' ? 'num-in' : ''}" type="${type}" data-set="${path}" value="${h(getPath(st, path))}" ${extra}></div>`;

  const statBlock = `<div class="stats">${STATS.map((k) => `<div class="stat"><b>${s.stats[k] || 0}</b><span>${k}</span></div>`).join('')}</div>
    <div class="tiny muted" style="margin-top:8px">${STATS.map((k) => `${k} = ${STAT_LABEL[k]}`).join(' \u00b7 ')}</div>`;

  return `<div class="wrap">
    <button class="ghost" style="width:100%;margin-bottom:14px" data-act="tutorial-replay">Replay tutorial</button>
    <div class="window"><div class="window-title"><h2>Status</h2></div>${statBlock}</div>

    <details class="acc" ${ui.open === 'customize' ? 'open' : ''}><summary>Customize</summary><div>
      <div class="field"><label>Theme</label>
        <div class="swatches">${Object.entries(THEMES).map(([k, t]) => `<button class="swatch ${look.theme === k ? 'on' : ''}" data-act="look" data-k="theme" data-v="${k}" aria-label="${t.name} theme">
          <i style="background:linear-gradient(135deg,${t.void} 0%,${t.hi} 45%,${t.mana} 100%)"></i><span>${t.name}</span></button>`).join('')}
          <button class="swatch ${look.theme === 'custom' ? 'on' : ''}" data-act="look" data-k="theme" data-v="custom" aria-label="Custom colour">
          <i style="background:linear-gradient(135deg,${paletteFor({ theme: 'custom', accent: look.accent }).void},${look.accent})"></i><span>Custom</span></button></div>
        <div class="colorrow"><input type="color" value="${h(look.accent)}" data-look-accent aria-label="Accent colour">
          <div><div class="tiny">Your own accent colour</div><div class="hex">${h(look.accent.toUpperCase())}</div></div></div></div>
      ${[
        ['Corners', 'corners', [['cut', 'Cut'], ['round', 'Round'], ['square', 'Square']]],
        ['Density', 'density', [['comfy', 'Roomy'], ['compact', 'Compact']]],
        ['Text &amp; UI size', 'scale', [['0.9', 'Small'], ['1', 'Normal'], ['1.12', 'Large'], ['1.25', 'Huge']]],
        ['Font', 'font', [['hunter', 'Default'], ['clean', 'Clean'], ['mono', 'Mono']]],
        ['Background glow', 'haze', [['true', 'On'], ['false', 'Off']]],
        ['Background grid', 'grid', [['true', 'On'], ['false', 'Off']]],
      ].map(([label, k, opts]) => `<div class="field"><label>${label}</label><div class="seg">${opts.map(([v, l]) => `<button class="${String(look[k]) === v ? 'on' : ''}" data-act="look" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div></div>`).join('')}
      <button class="ghost" style="width:100%" data-act="look-reset">Reset look</button>
    </div></details>

    <details class="acc" ${ui.open === 'hunter' ? 'open' : ''}><summary>Player</summary><div>
      ${T('Name', 'hunterName')}
      ${T('School year ends', 'schoolYearEnd', 'date')}
      <div class="field"><label>Season</label>
        <div class="seg">${['auto', 'school', 'summer'].map((v) => `<button class="${st.season === v ? 'on' : ''}" data-set-val="season" data-v="${v}">${v}</button>`).join('')}</div>
        <div class="tiny muted" style="margin-top:5px">On auto, the summer plan takes over the day after your school year ends.</div>
      </div>
      ${T('Day rolls over at (hour, 0\u201323)', 'dayResetHour', 'number', 'min="0" max="23"')}
    </div></details>

    <details class="acc" ${ui.open === 'schoology' ? 'open' : ''}><summary>Schoology</summary><div>
      ${T('iCal link', 'icsUrl', 'url', 'placeholder="https://\u2026.schoology.com/ical/\u2026"')}
      <div class="tiny muted" style="margin-bottom:12px">In Schoology: your name \u2192 Settings \u2192 Share Your Schoology Calendar \u2192 Enable \u2192 copy the link. It only appears once your calendar has at least one item on it.</div>
      ${T('Auto-sync every (hours)', 'autoSyncHours', 'number', 'min="1" max="48"')}
      ${T('Ignore anything due before', 'ignoreBefore', 'date')}
      <div class="tiny muted" style="margin:-8px 0 12px">Stops old back-work appearing when you join a course mid-year. Leave blank to import everything. This cutoff applies to Todoist too.</div>
      <div class="field"><label>Skip anything containing</label>
        <input data-set="ignoreKeywords" value="${h((st.ignoreKeywords || []).join(', '))}" placeholder="no school, assembly"></div>
      <button data-act="sync">Sync now</button>
    </div></details>

    <details class="acc" ${ui.open === 'todoist' ? 'open' : ''}><summary>Todoist</summary><div>
      ${T('Personal API token', 'todoistToken', 'password', 'placeholder="paste your token"')}
      <div class="tiny muted" style="margin-bottom:12px">In Todoist: Settings \u2192 Integrations \u2192 Developer \u2192 copy the API token. Runs alongside Schoology \u2014 tasks from both land in the same quest list, and the same ignore rules and cutoff above apply to both.</div>
      <button data-act="sync">Sync now</button>
    </div></details>

    <details class="acc" ${ui.open === 'gold' ? 'open' : ''}><summary>Gold &amp; difficulty</summary><div>
      <label>Gold per rank</label>
      ${RANKS.map((r) => `<div class="editrow"><span class="rank ${rankClass(r)}">${r}</span>
        <input class="num-in" type="number" data-set="goldByRank.${r}" value="${st.goldByRank[r]}">
        <input class="num-in w" type="number" data-set="xpByRank.${r}" value="${st.xpByRank[r]}" title="XP"></div>`).join('')}
      <div class="tiny muted" style="margin:6px 0 16px">Left column is gold, right is XP.</div>
      <div class="grid2">
        ${T('Early bonus %', 'earlyBonusPct', 'number')}
        ${T('Late penalty %', 'latePenaltyPct', 'number')}
        ${T('Streak bonus % / day', 'streakBonusPct', 'number')}
        ${T('Streak cap %', 'streakBonusMaxPct', 'number')}
        ${T('Missed quest costs', 'missedQuestPenalty', 'number')}
        ${T('Base difficulty score', 'baseScore', 'number')}
      </div>
      <div class="field"><label>Penalties</label>
        <div class="seg"><button class="${st.penaltiesEnabled ? 'on' : ''}" data-set-val="penaltiesEnabled" data-v="true">On</button>
        <button class="${!st.penaltiesEnabled ? 'on' : ''}" data-set-val="penaltiesEnabled" data-v="false">Off</button></div></div>
      <div class="field"><label>Auto-rate difficulty</label>
        <div class="seg"><button class="${st.autoRate ? 'on' : ''}" data-set-val="autoRate" data-v="true">On</button>
        <button class="${!st.autoRate ? 'on' : ''}" data-set-val="autoRate" data-v="false">Off</button></div></div>

      <label style="margin-top:10px">Keyword weights</label>
      <div class="tiny muted" style="margin-bottom:8px">Higher number = harder = more gold. Ranks run ${RANKS.join(' \u2039 ')}.</div>
      ${Object.entries(st.keywordWeights).map(([k, v]) => `<div class="editrow">
        <input value="${h(k)}" data-kw-name="${h(k)}"><input class="num-in w" type="number" data-kw-val="${h(k)}" value="${v}">
        <button class="sm danger" data-act="del-kw" data-k="${h(k)}">\u2715</button></div>`).join('')}
      <button class="sm" style="margin-top:8px" data-act="add-kw">+ Keyword</button>

      <label style="margin-top:18px">Course weights</label>
      <div class="tiny muted" style="margin-bottom:8px">Bump a class up or down if the auto-rating gets it wrong for that course.</div>
      ${Object.entries(st.courseWeights || {}).map(([k, v]) => `<div class="editrow">
        <input value="${h(k)}" data-cw-name="${h(k)}"><input class="num-in w" type="number" data-cw-val="${h(k)}" value="${v}">
        <button class="sm danger" data-act="del-cw" data-k="${h(k)}">\u2715</button></div>`).join('')}
      <button class="sm" style="margin-top:8px" data-act="add-cw">+ Course</button>
    </div></details>

    <details class="acc" ${ui.open === 'reminders' ? 'open' : ''}><summary>Reminders</summary><div>
      <div class="tiny muted" style="margin-bottom:12px">A notification on your phone or computer when something is still open, even with the app closed. It stays quiet if you have nothing left.</div>
      <div id="rem-status" class="tiny" style="margin-bottom:12px;color:var(--gold)">${h(ui.remMsg || 'Checking\u2026')}</div>
      <div class="field"><label>Evening nudge</label>
        <select data-rem="evening">${[[-1, 'Off'], ...[16, 17, 18, 19, 20, 21, 22].map((x) => [x, `${((x + 11) % 12) + 1}:00 ${x < 12 ? 'AM' : 'PM'}`])].map(([v, l]) => `<option value="${v}" ${Number(rem.evening) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>Morning briefing</label>
        <select data-rem="morning">${[[-1, 'Off'], ...[6, 7, 8, 9, 10].map((x) => [x, `${x}:00 AM`])].map(([v, l]) => `<option value="${v}" ${Number(rem.morning) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="grid2">
        <button class="${rem.enabled ? 'ghost' : 'primary'}" data-act="${rem.enabled ? 'rem-disable' : 'rem-enable'}">${rem.enabled ? 'Turn off' : 'Turn on'}</button>
        <button class="ghost" data-act="rem-test" ${rem.enabled ? '' : 'disabled'}>Send a test</button>
      </div>
      <div class="tiny muted" style="margin-top:12px">On iPhone: open the app from the Home Screen first (Share \u2192 Add to Home Screen). Times are your local time.</div>
    </div></details>

    <details class="acc" ${ui.open === 'challenges' ? 'open' : ''}><summary>Challenges &amp; effects</summary><div>
      <div class="field"><label>Challenges</label>
        <div class="seg"><button class="${st.challengesEnabled ? 'on' : ''}" data-set-val="challengesEnabled" data-v="true">On</button>
        <button class="${!st.challengesEnabled ? 'on' : ''}" data-set-val="challengesEnabled" data-v="false">Off</button></div></div>
      <div class="field"><label>Challenge difficulty</label>
        <div class="seg">${[['0.7', 'Easy'], ['1', 'Normal'], ['1.3', 'Hard']].map(([v, l]) => `<button class="${String(st.challengeScale) === v ? 'on' : ''}" data-set-val="challengeScale" data-v="${v}">${l}</button>`).join('')}</div>
        <div class="tiny muted" style="margin-top:5px">Applies to challenges created from now on. Harder ones pay a bit more.</div></div>
      <div class="field"><label>Weekly boss</label>
        <div class="seg"><button class="${st.bossEnabled !== false ? 'on' : ''}" data-set-val="bossEnabled" data-v="true">On</button>
        <button class="${st.bossEnabled === false ? 'on' : ''}" data-set-val="bossEnabled" data-v="false">Off</button></div></div>
      ${T('Smart schedule: work points per day', 'dayCapacity', 'number', 'min="3" max="30"')}
      <div class="field"><label>Visual effects</label>
        <div class="seg"><button class="${st.fxEnabled ? 'on' : ''}" data-set-val="fxEnabled" data-v="true">On</button>
        <button class="${!st.fxEnabled ? 'on' : ''}" data-set-val="fxEnabled" data-v="false">Off</button></div></div>
      <div class="field"><label>Vibration</label>
        <div class="seg"><button class="${st.haptics ? 'on' : ''}" data-set-val="haptics" data-v="true">On</button>
        <button class="${!st.haptics ? 'on' : ''}" data-set-val="haptics" data-v="false">Off</button></div></div>
    </div></details>

    <details class="acc" ${ui.open === 'gym' ? 'open' : ''}><summary>Gym plan</summary><div>
      <button class="gold" style="width:100%;margin-bottom:14px" data-act="planner-open">${s.gymProfile ? 'Rebuild my plan' : 'Find my plan'}</button>
      <div class="grid2">
        ${T('Cycle length (days)', 'gym.cycleLength', 'number', 'min="7" max="60"')}
        ${T('Gold per session', 'gym.goldPerSession', 'number')}
        ${T('Progress at % cleared', 'gym.progressThresholdPct', 'number')}
        ${T('Hold below % cleared', 'gym.holdThresholdPct', 'number')}
        ${T('Deload every N cycles', 'gym.deloadEveryNCycles', 'number', 'min="0"')}
        ${T('Deload volume %', 'gym.deloadVolumePct', 'number')}
      </div>
      <div class="field"><label>Which plan are you editing</label>
        <div class="seg">${['school', 'summer'].map((v) => `<button class="${(ui.planEdit || 'school') === v ? 'on' : ''}" data-act="plan-edit" data-v="${v}">${v}</button>`).join('')}</div></div>
      ${planEditor(ui.planEdit || 'school')}
    </div></details>

    <details class="acc" ${ui.open === 'habits' ? 'open' : ''}><summary>Habits</summary><div>
      ${s.habits.map(habitEditor).join('')}
      <button class="sm" style="margin-top:10px" data-act="add-habit">+ Habit</button>
      <div class="grid2" style="margin-top:14px">
        ${T('Streak bonus gold', 'habits.streakBonusGold', 'number')}
        ${T('Bonus every N days', 'habits.streakBonusEvery', 'number')}
      </div>
    </div></details>

    <details class="acc" ${ui.open === 'shop' ? 'open' : ''}><summary>Shop</summary><div>
      ${s.shop.map((it, i) => `<div style="padding:11px 0;border-bottom:1px solid rgba(27,44,85,.5)">
        <div class="editrow" style="border:0;padding:0 0 7px">
          <input value="${h(it.name)}" data-shop="${i}.name">
          <input class="num-in w" type="number" value="${it.price}" data-shop="${i}.price">
          <button class="sm danger" data-act="del-shop" data-i="${i}">\u2715</button>
        </div>
        <input value="${h(it.desc)}" data-shop="${i}.desc" placeholder="What it gets you">
        <div class="editrow" style="border:0">
          <select data-shop="${i}.grantType" style="flex:1">
            ${[['', 'No auto-effect'], ['dayOff', 'Books days off'], ['gymRest', 'Free gym rest day'], ['habitSkip', 'Habit skip pass'], ['boost', 'Gold & XP boost'], ['streakShield', 'Streak shield'], ['reroll', 'Challenge reroll']]
              .map(([v, l]) => `<option value="${v}" ${(it.grants?.type || '') === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <input class="num-in w" type="number" value="${it.grants?.days || it.grants?.n || 1}" data-shop="${i}.grantN" title="How many">
          <input class="num-in w" type="number" value="${it.cooldownDays || 0}" data-shop="${i}.cooldownDays" title="Cooldown days">
        </div>
      </div>`).join('')}
      <button class="sm" style="margin-top:10px" data-act="add-shop">+ Item</button>
      <div class="tiny muted" style="margin-top:10px">Three numbers on the bottom row: how many days/uses it grants, then the cooldown before you can buy it again.</div>
    </div></details>

    <details class="acc"><summary>Sync &amp; data</summary><div>
      <div class="field"><label>Player key</label>
        <input type="password" id="hkey" value="${h(store.key)}" placeholder="your passphrase">
        <div class="tiny muted" style="margin-top:6px">Your own passphrase, listed in HUNTER_KEYS on Vercel. Everyone on this link uses a different one and gets a completely separate save \u2014 own gold, own quests, own plan. Leave it blank and the app still works, just on this device.</div>
      </div>
      <button data-act="save-key">Connect</button>
      <div class="tiny muted" style="margin:14px 0 6px">Status: ${h(store.status)}</div>
      <div class="grid2" style="margin-top:12px">
        <button class="ghost" data-act="export">Export backup</button>
        <button class="ghost" data-act="import">Import backup</button>
      </div>
      <button class="ghost" style="width:100%;margin-top:10px" data-act="restore-snapshot">Restore yesterday\u2019s cloud snapshot</button>
      <div class="tiny muted" style="margin-top:6px">The server keeps one snapshot a day, taken just before a save. Use it if something ever looks wrong.</div>
      <button class="danger" style="width:100%;margin-top:10px" data-act="wipe">Erase everything</button>
    </div></details>

    <details class="acc" ${ui.open === 'calendar-export' ? 'open' : ''}><summary>Export to another calendar</summary><div>
      <div class="tiny muted" style="margin-bottom:12px">A read-only feed of your open quest due dates, for subscribing to in Google Calendar, Apple Calendar, or anywhere else. This link can only ever show due dates \u2014 it can\u2019t read your gold or change anything, and it\u2019s separate from your hunter key, so it\u2019s fine to paste into another app.</div>
      ${!store.key ? `<div class="tiny" style="color:var(--gold)">Connect your player key above first \u2014 this feed is built from your saved data.</div>`
        : !s.settings.calendarToken ? `<button data-act="cal-generate">Create calendar link</button>`
        : `<div class="field"><label>Your link</label>
             <input readonly value="${h(window.location.origin)}/api/calendar?key=${h(s.settings.calendarToken)}" onclick="this.select()"></div>
           <div class="grid2">
             <button data-act="cal-copy">Copy link</button>
             <button class="danger" data-act="cal-revoke">Replace link</button>
           </div>`}
    </div></details>

    <div class="foot">SYSTEM \u00b7 ${h(s.settings.hunterName || 'Player')} \u00b7 since ${new Date(s.createdAt).toLocaleDateString()}</div>
  </div>`;
}

function planEditor(planKey) {
  const s = g();
  const plan = s.plans[planKey];
  const len = s.settings.gym.cycleLength || 30;
  const ladderOpts = Object.entries(s.ladders).map(([k, l]) => `<option value="${k}">${h(l.label)}</option>`).join('');

  let out = `<div class="tiny muted" style="margin-bottom:10px">Day 1 of the cycle is the first day. Leave a day empty for rest. Once the cycle ends the app raises every movement on its own.</div>`;
  for (let d = 1; d <= len; d++) {
    const ex = plan.days[d] || [];
    out += `<details class="acc"><summary>Day ${d}${ex.length ? '' : ' \u2014 rest'} <span style="float:right;margin-right:22px;font-family:var(--m);font-size:11px;color:var(--faint);text-transform:none">${ex.map((e) => {
      const L = s.ladders[e.ladder]; const r = L?.rungs?.[e.rung];
      return r ? `${e.sets}\u00d7${e.reps ?? r.lo} ${r.name}` : '?';
    }).join(', ')}</span></summary><div>
      ${ex.map((e, i) => {
        const L = s.ladders[e.ladder] || { rungs: [] };
        return `<div class="editrow">
          <select data-plan="${planKey}.${d}.${i}.ladder" style="flex:0 0 96px">${ladderOpts.replace(`value="${e.ladder}"`, `value="${e.ladder}" selected`)}</select>
          <select data-plan="${planKey}.${d}.${i}.rung" style="flex:1">${L.rungs.map((r, ri) => `<option value="${ri}" ${ri === e.rung ? 'selected' : ''}>${h(r.name)}</option>`).join('')}</select>
          <input class="num-in w" type="number" value="${e.sets}" data-plan="${planKey}.${d}.${i}.sets" title="sets">
          <input class="num-in w" type="number" value="${e.reps ?? L.rungs[e.rung]?.lo ?? 8}" data-plan="${planKey}.${d}.${i}.reps" title="reps">
          ${L.weighted ? `<input class="num-in w" type="number" value="${e.weightLb ?? 0}" data-plan="${planKey}.${d}.${i}.weightLb" title="weight (lb)">` : ''}
          <button class="sm danger" data-act="del-ex" data-p="${planKey}" data-d="${d}" data-i="${i}">\u2715</button>
        </div>`;
      }).join('')}
      <button class="sm" data-act="add-ex" data-p="${planKey}" data-d="${d}">+ Exercise</button>
      ${d === 1 ? `<button class="sm ghost" data-act="copy-week" data-p="${planKey}">Repeat days 1\u20137 across the cycle</button>` : ''}
    </div></details>`;
  }
  return out;
}

function habitEditor(hb) {
  const s = hb.schedule || { type: 'daily' };
  return `<div style="padding:11px 0;border-bottom:1px solid rgba(27,44,85,.5)">
    <div class="editrow" style="border:0;padding:0 0 7px">
      <input value="${h(hb.name)}" data-habit="${h(hb.id)}.name">
      <input class="num-in w" type="number" value="${hb.gold}" data-habit="${h(hb.id)}.gold" title="gold">
      <input class="num-in w" type="number" value="${hb.penalty || 0}" data-habit="${h(hb.id)}.penalty" title="penalty">
      <button class="sm danger" data-act="del-habit" data-id="${h(hb.id)}">\u2715</button>
    </div>
    <div class="editrow" style="border:0">
      <select data-habit="${h(hb.id)}.type" style="flex:1">
        ${[['daily', 'Every day'], ['weekdays', 'School days'], ['days', 'Certain days'], ['monthly', 'Monthly']]
          .map(([v, l]) => `<option value="${v}" ${s.type === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <select data-habit="${h(hb.id)}.stat" style="flex:0 0 84px">
        ${STATS.map((v) => `<option value="${v}" ${hb.stat === v ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
    </div>
    ${s.type === 'days' ? `<div class="dowpick">${DOW.map((d, i) =>
      `<button class="${(s.days || []).includes(i) ? 'on' : ''}" data-act="dow" data-id="${h(hb.id)}" data-d="${i}">${d}</button>`).join('')}</div>` : ''}
    ${s.type === 'monthly' ? `<input class="num-in" type="number" min="1" max="28" value="${s.dayOfMonth || 1}" data-habit="${h(hb.id)}.dayOfMonth" placeholder="Day of month">` : ''}
  </div>`;
}

function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o) ?? ''; }

/* ============================================================
   SHELL
   ============================================================ */
const TABS = [
  ['quests', 'quests', 'Quests'],
  ['calendar', 'month', 'Month'],
  ['gym', 'gym', 'Gym'],
  ['habits', 'habits', 'Habits'],
  ['hunter', 'hunter', 'Player'],
  ['shop', 'shop', 'Shop'],
  ['settings', 'system', 'System'],
];

/* ============================================================
   WELCOME / SIGNUP — shown once, before a brand-new visitor
   has ever loaded anything locally
   ============================================================ */
export function welcomeScreen() {
  const err = ui.welcomeError ? `<div class="tiny" style="color:var(--danger);margin-bottom:12px">${h(ui.welcomeError)}</div>` : '';

  if (ui.welcomeMode === 'signup') {
    return `<div class="wrap" style="padding-top:calc(env(safe-area-inset-top) + 24px)">
      <div class="window">
        <div class="window-title"><h2>Create a player</h2></div>
        ${err}
        <div class="field"><label>Name</label><input id="wf-name" placeholder="What should we call you"></div>
        <div class="field"><label>Email</label><input id="wf-email" type="email" placeholder="you@example.com"></div>
        <div class="tiny muted" style="margin:-8px 0 12px">Used to send you a welcome email and, later, notifications. It never unlocks your account \u2014 only your passphrase does.</div>
        <div class="field"><label>Passphrase (12+ characters)</label><input id="wf-pass" type="password" placeholder="something only you know"></div>
        <div class="field"><label>Confirm passphrase</label><input id="wf-pass2" type="password"></div>
        <div class="tiny muted" style="margin:-8px 0 14px">There's no way to recover this if you lose it \u2014 write it down somewhere.</div>
        <button style="width:100%" data-act="welcome-signup" ${ui.welcomeBusy ? 'disabled' : ''}>${ui.welcomeBusy ? 'Creating\u2026' : 'Create player'}</button>
        <button class="ghost" style="width:100%;margin-top:8px" data-act="welcome-mode" data-mode="choose">Back</button>
      </div>
    </div>`;
  }

  if (ui.welcomeMode === 'existing') {
    return `<div class="wrap" style="padding-top:calc(env(safe-area-inset-top) + 24px)">
      <div class="window">
        <div class="window-title"><h2>Sign in</h2></div>
        ${err}
        <div class="field"><label>Your passphrase</label><input id="wf-existing-key" type="password" placeholder="the one you were given"></div>
        <button style="width:100%" data-act="welcome-existing">Continue</button>
        <button class="ghost" style="width:100%;margin-top:8px" data-act="welcome-mode" data-mode="choose">Back</button>
        <div class="tiny muted" style="margin-top:14px">Rather look around first? <span data-act="welcome-existing" style="text-decoration:underline;cursor:pointer">Continue with no account</span> \u2014 you can connect one later in Settings.</div>
      </div>
    </div>`;
  }

  return `<div class="wrap" style="padding-top:calc(env(safe-area-inset-top) + 40px)">
    <div class="window" style="text-align:center">
      <div class="eyebrow">System</div>
      <h2 style="font-size:22px;margin:8px 0 4px">Welcome, Player</h2>
      <p class="tiny muted" style="margin-bottom:20px">Quests pay gold. Gold buys days off. Training gets harder as you do.</p>
      <button style="width:100%" class="gold" data-act="welcome-mode" data-mode="signup">Create a player</button>
      <button class="ghost" style="width:100%;margin-top:10px" data-act="welcome-mode" data-mode="existing">I already have a passphrase</button>
    </div>
  </div>`;
}

/* ============================================================
   TUTORIAL — walks through setup, replayable any time from Settings
   ============================================================ */
export const TUTORIAL_STEPS = [
  { title: 'How this works', body: 'Quests pay gold and XP when you clear them \u2014 harder work pays more. Training sessions and habits pay too. XP raises your level and rank; gold buys rewards in the Shop.' },
  { title: 'Connect Schoology', body: 'System \u2192 Schoology \u2192 paste your Schoology iCal link \u2192 Sync now. Your assignments show up as quests automatically, ranked by difficulty. Tap a quest\u2019s rank badge to change it.', goto: { tab: 'settings', open: 'schoology' } },
  { title: 'Connect Todoist', body: 'System \u2192 Todoist \u2192 paste your personal API token \u2192 Sync now. Works alongside Schoology \u2014 one Sync button pulls both.', goto: { tab: 'settings', open: 'todoist' } },
  { title: 'Build your gym plan', body: 'Tap Find my plan on the Gym tab and answer a few questions. It builds a training cycle around your levels, schedule and equipment, and the cycle gets harder on its own as you clear sessions. Edit any exercise later in System \u2192 Gym plan.', goto: { tab: 'gym' } },
  { title: 'Set up your habits', body: 'The Habits tab is for recurring things \u2014 chores, routines, anything on a schedule. Add one with System \u2192 Habits \u2192 + Habit. Keeping a habit going builds a streak bonus.', goto: { tab: 'habits' } },
  { title: 'Daily, weekly and monthly challenges', body: 'The Player tab gives you three challenges for each period. Targets grow with your level, so they stay hard as you improve. Tap Claim when one is done (unclaimed ones pay out on their own when the period ends). A reroll token from the Shop swaps one you don\u2019t like.', goto: { tab: 'hunter' } },
  { title: 'Achievements and titles', body: 'Scroll down on the Player tab for achievements \u2014 bronze to legend, each paying gold and XP. Some unlock a title you can wear under your name. Use the filters to see what you have and what\u2019s left.', goto: { tab: 'hunter' } },
  { title: 'Perfect days and streaks', body: 'Clear everything scheduled for a day and you earn a perfect-day bonus. Clearing at least one quest every day builds a streak that adds a gold bonus. A streak shield from the Shop saves it once if you miss a day.' },
  { title: 'The Shop', body: 'Treats, power-ups, time off and big rewards. Power-ups include 1.5\u00d7, 2\u00d7 and 3\u00d7 gold and XP boosts for a day, streak shields and challenge rerolls. Time off books real days where nothing counts against you. Edit any price or add your own rewards in System \u2192 Shop.', goto: { tab: 'shop' } },
  { title: 'Make it yours', body: 'System \u2192 Customize has colour themes (or pick your own colour), corner style, text size, density and font. Visual effects and vibration can be switched off under Challenges & effects.', goto: { tab: 'settings', open: 'customize' } },
  { title: 'Where everything lives', body: 'Quests: what\u2019s due. Month: a calendar of everything. Gym and Habits: training and routines. Player: your profile, challenges and achievements. Shop: spend your gold. System: every setting. You can replay this tutorial any time from System.' },
];

export function tutorialOverlay() {
  document.querySelector('.tutorial-overlay')?.remove();
  const step = TUTORIAL_STEPS[ui.tutorialStep];
  if (step.goto) { ui.tab = step.goto.tab; ui.open = step.goto.open || null; render(); }
  const last = ui.tutorialStep === TUTORIAL_STEPS.length - 1;
  const el = document.createElement('div');
  el.className = 'levelup tutorial-overlay';
  el.innerHTML = `<div class="card" style="text-align:left;max-width:380px">
    <div class="eyebrow">Step ${ui.tutorialStep + 1} of ${TUTORIAL_STEPS.length}</div>
    <h3 style="margin:10px 0 8px;font-size:18px">${h(step.title)}</h3>
    <p style="font-size:14.5px;color:var(--ink);line-height:1.55;margin:0 0 18px">${h(step.body)}</p>
    <div class="grid2">
      <button class="ghost" data-act="tutorial-skip">Skip</button>
      <button class="gold" data-act="${last ? 'tutorial-finish' : 'tutorial-next'}">${last ? 'Finish' : 'Next'}</button>
    </div>
    ${ui.tutorialStep > 0 ? '<button class="ghost" style="width:100%;margin-top:8px" data-act="tutorial-back">Back</button>' : ''}
  </div>`;
  document.body.appendChild(el);
}

/* ============================================================
   FIND MY PLAN — a short questionnaire, then a preview, as an overlay.
   The planning rules live in planner.js; this only collects answers.
   ============================================================ */
export function openPlanner() {
  const s = g();
  const target = E.activePlanKey(s);
  const base = { ...DEFAULT_PROFILE, target, equipment: target === 'summer' ? 'gym' : DEFAULT_PROFILE.equipment, ...(s.gymProfile || {}) };
  ui.planner = { step: 1, profile: cleanProfile(base), result: null };
  renderPlanner(false);
}

export function closePlanner() {
  ui.planner = null;
  document.querySelector('.planner-overlay')?.remove();
}

function plannerStepHtml() {
  const pl = ui.planner;
  const p = pl.profile;
  const chip = (k, v, label) => `<button class="chip ${p[k] === v ? 'on' : ''}" data-act="pf-set" data-k="${k}" data-v="${h(v)}">${h(label)}</button>`;
  const multi = (k, v, label) => `<button class="chip ${p[k].includes(v) ? 'on' : ''}" data-act="pf-toggle" data-k="${k}" data-v="${h(v)}">${h(label)}</button>`;
  const opt = (k, v, title, blurb) => `<button class="opt ${p[k] === v ? 'on' : ''}" data-act="pf-set" data-k="${k}" data-v="${h(v)}"><b>${h(title)}</b><span>${h(blurb)}</span></button>`;
  const num = (k, label, hint) => `<div class="field"><label>${label}</label>
      <input class="num-in" type="number" inputmode="numeric" min="0" value="${p[k]}" data-pf="${k}">
      ${hint ? `<div class="tiny muted" style="margin-top:4px">${hint}</div>` : ''}</div>`;

  if (pl.step === 1) {
    return `<h3>What are you training for?</h3>
      <div class="opts">${Object.entries(GOALS).map(([k, v]) => opt('goal', k, v.label, v.blurb)).join('')}</div>
      ${p.goal === 'skills' ? `<label style="margin-top:16px">Which skill first</label>
        <div class="chips">${Object.entries(SKILLS).map(([k, v]) => chip('skill', k, v)).join('')}</div>` : ''}
      <label style="margin-top:16px">Build it for</label>
      <div class="chips">${chip('target', 'school', 'School year')}${chip('target', 'summer', 'Summer')}</div>
      <div class="tiny muted" style="margin-top:6px">The school-year and summer plans are kept separately. Summer takes over once your school year ends.</div>`;
  }
  if (pl.step === 2) {
    return `<h3>Your week</h3>
      <label>Equipment</label>
      <div class="opts">${Object.entries(EQUIPMENT).map(([k, v]) => opt('equipment', k, v.label, v.blurb)).join('')}</div>
      <label style="margin-top:16px">Days a week you can train</label>
      <div class="chips">${[2, 3, 4, 5, 6].map((n) => chip('days', n, String(n))).join('')}</div>
      <div class="tiny muted" style="margin-top:6px">Pick what you will actually keep up. A plan you can’t stick to is a bad plan.</div>
      <label style="margin-top:16px">Time per session</label>
      <div class="chips">${[20, 30, 45, 60, 75].map((n) => chip('minutes', n, `${n} min`)).join('')}</div>`;
  }
  if (pl.step === 3) {
    const bar = p.equipment !== 'none';
    return `<h3>Where you are now</h3>
      <div class="tiny muted" style="margin-bottom:12px">Test each one fresh, with clean form, as many in a row as you can. Guess if you haven’t tested — you can rebuild later.</div>
      <div class="grid2">
        ${num('pushups', 'Push-ups')}
        ${bar ? num('pullups', 'Pull-ups') : ''}
        ${num('squats', 'Bodyweight squats')}
        ${num('plank', 'Plank (seconds)')}
      </div>
      <label>Pistol squats</label>
      <div class="chips">${Object.entries(PISTOL).map(([k, v]) => chip('pistol', k, v)).join('')}</div>
      ${p.equipment === 'gym' ? `<div class="grid2" style="margin-top:16px">${num('bodyweightLb', 'Bodyweight (lb)', 'Sets your starting weights')}</div>
        <label>Lifting experience</label>
        <div class="chips">${Object.entries(LIFTING).map(([k, v]) => chip('lifting', k, v)).join('')}</div>` : ''}`;
  }
  if (pl.step === 4) {
    return `<h3>Focus and limits</h3>
      <label>Bring up (optional, any number)</label>
      <div class="chips">${Object.entries(FOCUS).map(([k, v]) => multi('focus', k, v)).join('')}</div>
      <label style="margin-top:16px">Go easy on (optional)</label>
      <div class="chips">${Object.entries(AVOID).map(([k, v]) => multi('avoid', k, v)).join('')}</div>
      <div class="tiny muted" style="margin-top:6px">Those moves get swapped out. This isn’t medical advice — if something hurts, stop and see someone who can look at it.</div>`;
  }

  // preview
  const r = pl.result;
  const willSwitch = r.profile.target !== E.activePlanKey(g());
  return `<h3 style="margin-bottom:4px">${h(r.name)}</h3>
    <div class="tiny muted" style="margin-bottom:14px">${r.exercisesPerSession} exercises a session · ${r.len}-day cycle · ${h(r.where.toLowerCase())}</div>
    ${r.summary.map((d) => `<div class="pv ${d.kind ? '' : 'rest'}">
        <div class="pv-h"><span>Day ${d.day}</span><b>${h(d.label)}</b></div>
        ${d.items.map((t) => `<div class="pv-i">${h(t)}</div>`).join('')}
      </div>`).join('')}
    <div style="margin-top:16px">${r.notes.map((n) => `<p class="tiny" style="margin:0 0 9px;color:var(--ink);line-height:1.5">${h(n)}</p>`).join('')}</div>
    ${willSwitch ? `<div class="tiny" style="color:var(--gold);margin-top:6px">This fills your ${h(r.profile.target)} plan, so using it switches the season to ${h(r.profile.target)}.</div>` : ''}
    <div class="tiny muted" style="margin-top:6px">Using it starts a fresh cycle today and replaces your ${h(r.profile.target)} plan. Your gold, XP and training history stay.</div>`;
}

export function renderPlanner(keepScroll = true) {
  if (!ui.planner) return;
  const pl = ui.planner;
  let el = document.querySelector('.planner-overlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'levelup planner-overlay';
    document.body.appendChild(el);
  }
  const scroll = keepScroll ? (el.querySelector('.card')?.scrollTop || 0) : 0;
  const last = pl.step === 5;
  el.innerHTML = `<div class="card planner-card" style="text-align:left">
    <div class="eyebrow">${last ? 'Your plan' : `Find my plan · step ${pl.step} of 4`}</div>
    <div class="planner-body">${plannerStepHtml()}</div>
    <div class="grid2" style="margin-top:20px">
      <button class="ghost" data-act="${pl.step === 1 ? 'planner-close' : 'planner-back'}">${pl.step === 1 ? 'Cancel' : 'Back'}</button>
      <button class="gold" data-act="${last ? 'planner-apply' : 'planner-next'}">${last ? 'Use this plan' : pl.step === 4 ? 'Build my plan' : 'Next'}</button>
    </div>
    ${pl.step > 1 ? '<button class="ghost" style="width:100%;margin-top:8px" data-act="planner-close">Cancel</button>' : ''}
  </div>`;
  el.querySelector('.card').scrollTop = scroll;
}

export function render() {
  if (ui.showWelcome) {
    document.getElementById('app').innerHTML = welcomeScreen();
    document.getElementById('tabs').innerHTML = '';
    return;
  }

  applyLook(g().settings.look);
  const s = g();
  const today = tk();
  const openQ = Object.values(s.quests).filter((q) => !q.done && !q.missed && !q.dismissed && dueDay(q) && dueDay(q) <= today).length;
  const dueH = E.habitsFor(s, today).filter((x) => !s.habitLog[today]?.[x.id]).length;

  const body = { quests: questsTab, calendar: calendarTab, gym: gymTab, habits: habitsTab, hunter: hunterTab, shop: shopTab, settings: settingsTab }[ui.tab] || questsTab;
  const bodyHtml = typeof body === 'function' ? body() : body;

  document.body.classList.toggle('boosted', E.boostFor(s, today) > 1);
  const entering = ui.lastTab !== ui.tab;
  ui.lastTab = ui.tab;
  document.getElementById('app').innerHTML = statusBar() + bodyHtml;
  if (entering) document.querySelector('#app .wrap')?.classList.add('enter');
  animateStatus();
  const claim = C.claimable(s);
  document.getElementById('tabs').innerHTML = TABS.map(([k, ico, label]) => {
    const n = k === 'quests' ? openQ : k === 'habits' ? dueH : 0;
    const pip = k === 'hunter' && claim ? '<span class="dot gold">' + claim + '</span>' : n ? `<span class="dot">${n}</span>` : '';
    return `<button class="${ui.tab === k ? 'on' : ''}" data-tab="${k}">
      <span class="ico">${icon(ico, 22)}</span><span class="lbl">${label}</span>${pip}</button>`;
  }).join('');
}
