import { store, todayKey, addDays, daysBetween, dueDay } from './store.js';
import { RANKS, STATS, STAT_LABEL, rankClass } from './config.js';
import * as E from './engine.js';

export const ui = { tab: 'quests', questFilter: 'open', editingGym: false, calMonth: null, calDay: null, selecting: false, selected: new Set(), board: null, boardLoading: false };

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
  el.innerHTML = `<div class="card">
    <div class="eyebrow">Notification</div>
    <p style="margin:14px 0 6px;font-family:var(--b);font-size:15px;color:var(--muted)">You have leveled up.</p>
    <div class="big">LV ${level}</div>
    <div style="margin-top:10px;color:var(--mana);letter-spacing:.12em;text-transform:uppercase;font-size:12px">${h(t.title)}</div>
    <button style="margin-top:22px;width:100%" data-act="close-levelup">Accept</button>
  </div>`;
  el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
  document.body.appendChild(el);
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

function statusBar() {
  const s = g();
  const p = E.levelProgress(s.xp);
  const t = E.hunterTitle(p.level);
  const off = E.isDayOff(s, tk());
  const label = { cloud: 'synced', local: 'this device', offline: 'offline', nocloud: 'no database', badkey: 'wrong key' }[store.status] || store.status;

  return `${boostBanner()}<div class="status">
    <div class="status-top">
      <div class="lvl-badge"><div><b>${p.level}</b><span>LV</span></div></div>
      <div>
        <div class="name">${h(s.settings.hunterName || 'Hunter')}</div>
        <div class="title">${h(t.title)}</div>
      </div>
      <div class="purse"><b class="num">${Math.round(s.gold).toLocaleString()}</b><span>GOLD</span></div>
    </div>
    <div class="xpbar"><i style="width:${Math.max(0, Math.min(100, p.pct)).toFixed(1)}%"></i></div>
    <div class="xp-meta">
      <span>${p.cur} / ${p.need} XP</span>
      <span class="sync"><i class="${store.status}"></i>${h(label)}${off ? ' \u00b7 DAY OFF' : ''}</span>
    </div>
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
        No open quests.<br><span class="tiny">${s.settings.icsUrl ? 'Pull to sync, or add one by hand.' : 'Add your Schoology link in Settings to load them automatically.'}</span></div></div>`
    : section('Overdue', buckets.overdue) + section('Due today', buckets.today)
      + section('This week', buckets.soon) + section('Later', buckets.later);

  const oldCount = E.questsBefore(s, today, 'all').length;

  return `<div class="wrap">
    ${ui.selecting ? `<div class="selbar">
        <button class="sm ghost" data-act="sel-all">${ui.selected?.size === open.length && open.length ? 'None' : 'All'}</button>
        <span class="num">${ui.selected?.size || 0} selected</span>
        <button class="sm danger" data-act="sel-delete" ${ui.selected?.size ? '' : 'disabled'}>Delete</button>
        <button class="sm ghost" data-act="select-mode">Done</button>
      </div>`
    : `<div style="display:flex;gap:8px;margin-bottom:14px">
        <button style="flex:1" data-act="sync">${s.settings.icsUrl ? 'Sync Schoology' : 'Add calendar link'}</button>
        <button data-act="add-quest">+ Quest</button>
        ${open.length ? '<button data-act="select-mode">Select</button>' : ''}
      </div>`}

    ${oldCount >= 5 && !ui.selecting ? `<div class="window" style="padding:13px 16px">
      <div class="tiny" style="color:var(--gold);margin-bottom:9px">${oldCount} quests are dated before today \u2014 usually leftovers from joining a course.</div>
      <button class="sm gold" data-act="purge-old">Clear them out</button>
    </div>` : ''}
    ${s.lastSync ? `<div class="tiny muted" style="margin:-8px 0 12px;font-family:var(--m)">Last sync ${new Date(s.lastSync).toLocaleString()}</div>` : ''}
    ${body}
    ${missed.length ? `<div class="window"><div class="window-title"><h2>Failed</h2><span class="count">${missed.length}</span></div>
      ${missed.map((q) => `<div class="row missed"><div class="body tappable" data-act="open-quest" data-id="${h(q.id)}"><div class="t">${h(q.title)}</div><div class="s">${h(q.course || '')}</div></div>
      <button class="sm ghost" data-act="revive" data-id="${h(q.id)}">Restore</button></div>`).join('')}</div>` : ''}
    ${done.length ? `<details class="acc"><summary>Cleared (${cleared.length})</summary><div>
      ${done.map((q) => `<div class="row done"><div class="body tappable" data-act="open-quest" data-id="${h(q.id)}"><div class="t">${h(q.title)}</div>
        <div class="s">${h(q.course || '')} \u00b7 +${q.paid || 0}g</div></div>
        <button class="sm ghost" data-act="undo-quest" data-id="${h(q.id)}">Undo</button></div>`).join('')}
    </div></details>` : ''}
    ${dismissed.length ? `<details class="acc"><summary>Deleted (${dismissed.length})</summary><div>
      <div class="tiny muted" style="margin-bottom:8px">Kept only so Schoology can\u2019t re-add them on the next sync.</div>
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

  return `<div class="wrap">
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
   TAB — RANKING
   ============================================================ */
function boardTab() {
  const st = g();
  const b = ui.board;
  const mine = st.board || {};

  if (!store.key) {
    return `<div class="wrap"><div class="window"><div class="empty">
      <span class="mark">\u25b2</span>The ranking needs cloud sync.<br>
      <span class="tiny">Add your hunter key under System \u2192 Sync &amp; data.</span>
    </div></div></div>`;
  }

  const rowFor = (r) => `<div class="brow ${r.me ? 'me' : ''}">
    <span class="place ${r.rank <= 3 ? `p${r.rank}` : ''}">${r.rank}</span>
    <div class="body">
      <div class="t">${h(r.name)}${r.me ? ' <span class="pill on">you</span>' : ''}</div>
      <div class="s">
        <span>LV ${r.level}</span>
        ${r.streak ? `<span>${r.streak}d streak</span>` : ''}
        <span>${r.week.quests} quests</span>
        <span>${r.week.sessions}/7 training</span>
      </div>
    </div>
    <span class="pay">${Math.round(r.gold ?? 0).toLocaleString()}g</span>
  </div>`;


  return `<div class="wrap">
    <div class="window">
      <div class="window-title">
        <h2>Ranking</h2>
        <span class="count">${b?.onBoard ?? '\u2014'} hunters</span>
      </div>
      <div class="tiny muted" style="margin-bottom:12px">Ranked by gold on hand. This is the honor system \u2014 nothing here is verified, so it\u2019s only worth using with people you actually trust not to edit their save.</div>
      <div class="grid2">
        <button data-act="board-refresh">${ui.boardLoading ? 'Loading\u2026' : 'Refresh'}</button>
        <button class="${mine.optIn ? 'ghost' : 'gold'}" data-act="board-join">${mine.optIn ? 'Edit / leave' : 'Join'}</button>
      </div>
    </div>

    ${b?.error ? `<div class="window"><div class="tiny" style="color:var(--danger)">${h(b.error)}</div></div>` : ''}

    ${!mine.optIn ? `<div class="window"><div class="empty">
        <span class="mark">\u25b2</span>You're not on the board.<br>
        <span class="tiny">Tap Join to add your name. You can leave any time.</span>
      </div></div>` : ''}

    ${b?.rows?.length ? `<div class="window">
        ${b.rows.map(rowFor).join('')}
      </div>` : b && !b.error ? `<div class="window"><div class="empty">
        <span class="mark">\u25cb</span>Nobody has joined yet.
      </div></div>` : ''}

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
      <div class="sigil">${h(it.icon || '\u25c8')}</div>
      <div class="body" style="flex:1;min-width:0">
        <div class="t">${h(it.name)}</div>
        <div class="s tiny muted">${h(it.desc)}</div>
        ${cd > 0 ? `<div class="tiny" style="color:var(--danger);margin-top:3px">Locked ${cd} more day${cd === 1 ? '' : 's'}</div>` : ''}
      </div>
      <div style="text-align:right">
        <div class="price">${it.price.toLocaleString()}g</div>
        ${broke ? `<span class="afford">${Math.ceil(need).toLocaleString()} short</span>`
          : `<button class="sm gold" data-act="buy" data-id="${h(it.id)}" ${cd > 0 ? 'disabled' : ''}>Buy</button>`}
      </div>
    </div>`;
  };

  const active = (s.daysOff || []).filter((d) => d >= today).sort();
  const recent = s.purchases.slice(0, 8);
  const week = s.ledger.filter((l) => l.delta > 0 && daysBetween(l.at.slice(0, 10), today) <= 7).reduce((a, l) => a + l.delta, 0);

  return `<div class="wrap">
    <div class="window">
      <div class="window-title"><h2>Balance</h2><span class="count">last 7 days: +${Math.round(week).toLocaleString()}g</span></div>
      <div style="font-family:var(--m);font-size:34px;color:var(--gold);text-shadow:0 0 24px rgba(245,197,66,.3)">${Math.round(s.gold).toLocaleString()}</div>
      ${active.length ? `<div class="tiny" style="color:var(--gold);margin-top:8px">Days off booked: ${active.map((d) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })).join(', ')}</div>` : ''}
    </div>
    <div class="window">
      <div class="window-title"><h2>Shop</h2><span class="count">${s.shop.length} items</span></div>
      ${s.shop.map(item).join('')}
    </div>
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
  const T = (label, path, type = 'text', extra = '') =>
    `<div class="field"><label>${label}</label><input class="${type === 'number' ? 'num-in' : ''}" type="${type}" data-set="${path}" value="${h(getPath(st, path))}" ${extra}></div>`;

  const statBlock = `<div class="stats">${STATS.map((k) => `<div class="stat"><b>${s.stats[k] || 0}</b><span>${k}</span></div>`).join('')}</div>
    <div class="tiny muted" style="margin-top:8px">${STATS.map((k) => `${k} = ${STAT_LABEL[k]}`).join(' \u00b7 ')}</div>`;

  return `<div class="wrap">
    <div class="window"><div class="window-title"><h2>Status</h2></div>${statBlock}</div>

    <details class="acc" ${ui.open === 'hunter' ? 'open' : ''}><summary>Hunter</summary><div>
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
      <div class="tiny muted" style="margin:-8px 0 12px">Stops old back-work appearing when you join a course mid-year. Leave blank to import everything.</div>
      <div class="field"><label>Skip anything containing</label>
        <input data-set="ignoreKeywords" value="${h((st.ignoreKeywords || []).join(', '))}" placeholder="no school, assembly"></div>
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

    <details class="acc" ${ui.open === 'gym' ? 'open' : ''}><summary>Gym plan</summary><div>
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
            ${[['', 'No auto-effect'], ['dayOff', 'Books days off'], ['gymRest', 'Free gym rest day'], ['habitSkip', 'Habit skip pass']]
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
      <div class="field"><label>Hunter key</label>
        <input type="password" id="hkey" value="${h(store.key)}" placeholder="your passphrase">
        <div class="tiny muted" style="margin-top:6px">Your own passphrase, listed in HUNTER_KEYS on Vercel. Everyone on this link uses a different one and gets a completely separate save \u2014 own gold, own quests, own plan. Leave it blank and the app still works, just on this device.</div>
      </div>
      <button data-act="save-key">Connect</button>
      <div class="tiny muted" style="margin:14px 0 6px">Status: ${h(store.status)}</div>
      <div class="grid2" style="margin-top:12px">
        <button class="ghost" data-act="export">Export backup</button>
        <button class="ghost" data-act="import">Import backup</button>
      </div>
      <button class="danger" style="width:100%;margin-top:10px" data-act="wipe">Erase everything</button>
    </div></details>

    <div class="foot">SYSTEM \u00b7 ${h(s.settings.hunterName || 'Hunter')} \u00b7 since ${new Date(s.createdAt).toLocaleDateString()}</div>
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
  ['quests', '\u25c8', 'Quests'],
  ['calendar', '\u25a6', 'Month'],
  ['gym', '\u2694', 'Gym'],
  ['habits', '\u25c9', 'Habits'],
  ['shop', '\u25c6', 'Shop'],
  ['board', '\u25b2', 'Rank'],
  ['settings', '\u2699', 'System'],
];
// Ranking is built but disabled \u2014 the anti-cheat scoring gave a wrong number
// on a real account and the cause wasn't nailed down. Flip 'board' back into
// TABS above to bring the tab back once that's actually fixed.

export function render() {
  const s = g();
  const today = tk();
  const openQ = Object.values(s.quests).filter((q) => !q.done && !q.missed && !q.dismissed && dueDay(q) && dueDay(q) <= today).length;
  const dueH = E.habitsFor(s, today).filter((x) => !s.habitLog[today]?.[x.id]).length;

  const body = { quests: questsTab, calendar: calendarTab, gym: gymTab, habits: habitsTab, shop: shopTab, board: boardTab, settings: settingsTab }[ui.tab] || questsTab;
  const bodyHtml = typeof body === 'function' ? body() : body;

  document.body.classList.toggle('boosted', E.boostFor(s, today) > 1);
  document.getElementById('app').innerHTML = statusBar() + bodyHtml;
  document.getElementById('tabs').innerHTML = TABS.map(([k, ico, label]) => {
    const n = k === 'quests' ? openQ : k === 'habits' ? dueH : 0;
    return `<button class="${ui.tab === k ? 'on' : ''}" data-tab="${k}">
      <span class="ico">${ico}</span>${label}${n ? `<span class="dot">${n}</span>` : ''}</button>`;
  }).join('');
}
