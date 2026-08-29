import { store, todayKey, addDays, dateKey } from './store.js';
import { RANKS } from './config.js';
import * as E from './engine.js';
import { ui, render, notify, levelUpWindow, dialog } from './ui.js';

const g = () => store.state;
const tk = () => todayKey(g().settings);
const $ = (sel) => document.querySelector(sel);

/* ============================================================
   SCHOOLOGY SYNC
   ============================================================ */
const localDay = (iso) => (/Z$/.test(iso) ? dateKey(new Date(iso)) : iso.slice(0, 10));

const shiftM = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

let syncingTodoist = false;
async function syncTodoist(quiet = false) {
  const s = g();
  if (!s.settings.todoistToken) return;   // silent when not configured; the button covers both sources
  if (syncingTodoist) return;
  syncingTodoist = true;
  if (!quiet) notify('', 'System', 'Pulling from Todoist\u2026');

  try {
    const r = await fetch('/api/todoist', { headers: { 'x-todoist-token': s.settings.todoistToken } });
    const body = await r.json();
    if (!r.ok) { notify('bad', 'Todoist sync failed', body.error || `Error ${r.status}`); return; }

    const priorIds = new Set(
      Object.values(s.quests)
        .filter((q) => q.source === 'todoist' && !q.dismissed && !q.done && !q.missed)
        .map((q) => q.id.slice(3))   // strip the "td:" prefix to compare against raw uids
    );
    const rawIds = new Set(body.events.map((ev) => ev.uid));

    const ignore = (s.settings.ignoreKeywords || []).map((x) => x.toLowerCase()).filter(Boolean);
    let added = 0;
    let skipped = 0;

    store.update((st) => {
      const cutoff = st.settings.ignoreBefore || '';

      body.events.forEach((ev) => {
        const hay = `${ev.title} ${ev.course}`.toLowerCase();
        if (ignore.some((k) => hay.includes(k))) return;
        if (cutoff && ev.due && localDay(ev.due) < cutoff) { skipped++; return; }
        const id = `td:${ev.uid}`;
        const existing = st.quests[id];
        if (existing?.dismissed) return;
        if (existing) {
          existing.title = ev.title;
          existing.course = ev.course || existing.course;
          existing.due = ev.due || existing.due;
          existing.dueKey = ev.due ? localDay(ev.due) : existing.dueKey;
          existing.notes = ev.notes;
          existing.priority = ev.priority;
          if (existing.missed && existing.dueKey >= tk()) existing.missed = false;
        } else {
          st.quests[id] = {
            id, source: 'todoist',
            title: ev.title, course: ev.course, notes: ev.notes,
            due: ev.due, dueKey: ev.due ? localDay(ev.due) : null, allDay: ev.allDay,
            priority: ev.priority,
            done: false, missed: false, addedAt: new Date().toISOString(),
          };
          added++;
        }
      });
      st.lastTodoistSync = new Date().toISOString();
    });

    // Anything that was open, is ours, and Todoist's raw feed no longer
    // mentions at all (not filtered out by our own ignore rules — genuinely
    // gone from their side) needs a real answer: checked off, or deleted.
    // The list endpoint can't say which, so ask about each one directly.
    const vanished = [...priorIds].filter((uid) => !rawIds.has(uid));
    if (vanished.length) {
      try {
        const cr = await fetch(`/api/todoist?check=${encodeURIComponent(vanished.slice(0, 25).join(','))}`, {
          headers: { 'x-todoist-token': s.settings.todoistToken },
        });
        const cbody = await cr.json();
        if (cr.ok && cbody.results) {
          let completedCount = 0;
          let deletedCount = 0;
          store.update((st) => {
            Object.entries(cbody.results).forEach(([uid, status]) => {
              const id = `td:${uid}`;
              const q = st.quests[id];
              if (!q || q.done || q.dismissed) return;
              if (status === 'deleted') {
                delete st.quests[id];
                deletedCount++;
              } else if (status === 'completed') {
                const reward = E.questReward(q, st.settings, st.questStreak || 0, tk(), st);
                q.done = true; q.missed = false; q.doneAt = new Date().toISOString();
                q.paid = reward.gold; q.paidRank = reward.rank;
                E.pay(st, reward.gold, `Quest: ${q.title}`);
                E.grantXp(st, reward.xp);
                E.grantStat(st, 'INT', 1);
                bumpQuestStreak(st);
                completedCount++;
              }
              // 'active' or 'unknown' — leave it, try again next sync
            });
          });
          if (completedCount || deletedCount) {
            const parts = [];
            if (completedCount) parts.push(`${completedCount} checked off in Todoist`);
            if (deletedCount) parts.push(`${deletedCount} deleted in Todoist`);
            notify(completedCount ? 'gold' : '', 'Todoist matched', parts.join(', '));
          }
        }
      } catch { /* the sync itself already succeeded; a reconciliation hiccup isn't worth surfacing */ }
    }

    if (!quiet) notify(added ? 'gold' : '', 'Todoist synced',
      `${added ? `${added} new quest${added === 1 ? '' : 's'}` : 'Nothing new'}${skipped ? ` \u00b7 ${skipped} old skipped` : ''}`);
  } catch (e) {
    notify('bad', 'Todoist sync failed', e.message);
  } finally {
    syncingTodoist = false;
    render();
  }
}

let syncing = false;
async function syncSchoology(quiet = false) {
  const s = g();
  if (!s.settings.icsUrl) return;   // silent when not configured; the button covers both sources
  if (syncing) return;
  syncing = true;
  if (!quiet) notify('', 'System', 'Pulling from Schoology\u2026');

  try {
    const r = await fetch(`/api/ics?url=${encodeURIComponent(s.settings.icsUrl)}`);
    const body = await r.json();
    if (!r.ok) { notify('bad', 'Sync failed', body.error || `Error ${r.status}`); return; }

    const priorIds = new Set(
      Object.values(s.quests)
        .filter((q) => q.source === 'schoology' && !q.dismissed && !q.done && !q.missed)
        .map((q) => q.id.slice(4))   // strip the "ics:" prefix
    );
    const rawIds = new Set(body.events.map((ev) => ev.uid));

    const ignore = (s.settings.ignoreKeywords || []).map((x) => x.toLowerCase()).filter(Boolean);
    let added = 0;
    let skipped = 0;

    store.update((st) => {
      const cutoff = s.settings.ignoreBefore || '';

      body.events.forEach((ev) => {
        const hay = `${ev.title} ${ev.course}`.toLowerCase();
        if (ignore.some((k) => hay.includes(k))) return;
        if (cutoff && ev.due && localDay(ev.due) < cutoff) { skipped++; return; }
        const id = `ics:${ev.uid}`;
        const existing = st.quests[id];
        if (existing?.dismissed) return;              // deleted on purpose — leave it alone
        if (existing) {
          // refresh the fields Schoology owns; never touch the user's decisions
          existing.title = ev.title;
          existing.course = ev.course || existing.course;
          existing.due = ev.due || existing.due;
          existing.dueKey = ev.due ? localDay(ev.due) : existing.dueKey;
          existing.notes = ev.notes;
          if (existing.missed && existing.dueKey >= tk()) existing.missed = false;
        } else {
          st.quests[id] = {
            id, source: 'schoology',
            title: ev.title, course: ev.course, notes: ev.notes,
            due: ev.due, dueKey: ev.due ? localDay(ev.due) : null, allDay: ev.allDay,
            done: false, missed: false, addedAt: new Date().toISOString(),
          };
          added++;
        }
      });
      st.lastSync = new Date().toISOString();
    });

    // Unlike Todoist, there's no per-item lookup that can tell "deleted" apart
    // from "just aged out of the calendar's export window" — Schoology's ICS
    // feed has no completed state at all, and some feeds only cover the
    // current term. Guessing wrong here means silently deleting a real
    // assignment, so this only surfaces a count for you to check yourself
    // with Select, rather than acting on it.
    const vanished = [...priorIds].filter((uid) => !rawIds.has(uid));
    if (vanished.length) {
      notify('', 'Schoology', `${vanished.length} quest${vanished.length === 1 ? '' : 's'} no longer on the calendar \u2014 check with Select if any should go.`);
    }

    notify(added ? 'gold' : '', 'Sync complete',
      `${added ? `${added} new quest${added === 1 ? '' : 's'}` : 'Nothing new'}${skipped ? ` \u00b7 ${skipped} old skipped` : ''}`);
  } catch (e) {
    notify('bad', 'Sync failed', e.message);
  } finally {
    syncing = false;
    render();
  }
}

/* ============================================================
   ACTIONS
   ============================================================ */
function bumpQuestStreak(st) {
  const today = tk();
  if (st.lastQuestDay === today) return;
  st.questStreak = st.lastQuestDay === addDays(today, -1) ? (st.questStreak || 0) + 1 : 1;
  st.lastQuestDay = today;
}

const actions = {
  sync() {
    const s = g();
    if (!s.settings.icsUrl && !s.settings.todoistToken) {
      ui.tab = 'settings'; ui.open = 'schoology'; render();
      notify('', 'System', 'Add a Schoology link or Todoist token below.');
      return;
    }
    syncSchoology(); syncTodoist();
  },

  'finish-quest'(el) {
    const id = el.dataset.id;
    let lvl = null;
    store.update((st) => {
      const q = st.quests[id];
      if (!q || q.done) return;
      const r = E.questReward(q, st.settings, st.questStreak || 0, tk(), st);
      q.done = true; q.missed = false; q.doneAt = new Date().toISOString(); q.paid = r.gold; q.paidRank = r.rank;
      E.pay(st, r.gold, `Quest: ${q.title}`);
      lvl = E.grantXp(st, r.xp);
      E.grantStat(st, 'INT', 1);
      bumpQuestStreak(st);
      notify('gold', `+${r.gold} gold`, `${r.rank}-rank cleared${r.bonusPct ? ` \u00b7 ${r.bonusPct > 0 ? '+' : ''}${r.bonusPct}%` : ''}`);
    });
    if (lvl) levelUpWindow(lvl);
    render();
  },

  'undo-quest'(el) {
    store.update((st) => {
      const q = st.quests[el.dataset.id];
      if (!q?.done) return;
      E.pay(st, -(q.paid || 0), `Undo: ${q.title}`);
      st.xp = Math.max(0, st.xp - (st.settings.xpByRank[q.paidRank] || 0));
      st.level = E.levelFromXp(st.xp);
      q.done = false; delete q.paid; delete q.doneAt;
    });
    render();
  },

  'cycle-rank'(el) {
    store.update((st) => {
      const q = st.quests[el.dataset.id];
      if (!q) return;
      const cur = E.rankOf(q, st.settings);
      const next = RANKS[(RANKS.indexOf(cur) + 1) % RANKS.length];
      q.manualRank = next;
    });
    render();
  },

  async 'open-quest'(el) {
    const q = g().quests[el.dataset.id];
    if (!q) return;
    const SOURCE_LABEL = { schoology: 'Schoology', todoist: 'Todoist' };
    const synced = q.source === 'schoology' || q.source === 'todoist';
    const sourceName = SOURCE_LABEL[q.source] || '';
    const v = await dialog({
      title: synced ? `Quest \u00b7 from ${sourceName}` : 'Quest',
      confirm: 'Save',
      third: 'Delete quest',
      fields: [
        { name: 'title', label: 'Name', value: q.title },
        { name: 'course', label: 'Class', value: q.course || '' },
        { name: 'due', label: 'Due', type: 'date', value: q.dueKey || '' },
      ],
    });
    if (!v) return;

    if (v.__third) {
      const sure = await dialog({
        title: 'Delete quest', danger: true, confirm: 'Delete',
        message: synced
          ? `"${q.title}" disappears from your list. ${sourceName} won't put it back.`
          : `"${q.title}" is gone for good.`,
      });
      if (!sure) return;
      store.update((st) => {
        if (synced) st.quests[q.id].dismissed = true;   // tombstone, so sync skips it
        else delete st.quests[q.id];
      });
      notify('bad', 'Deleted', q.title);
      return render();
    }

    store.update((st) => {
      const t = st.quests[q.id];
      if (!t) return;
      if (v.title) t.title = v.title;
      t.course = v.course;
      if (v.due) { t.dueKey = v.due; t.due = `${v.due}T23:59:00`; }
      else { t.dueKey = null; t.due = null; }
      t.edited = true;
    });
    render();
  },

  async 'purge-old'() {
    const st = g();
    const today = tk();
    const openCount = E.questsBefore(st, today, 'open').length;
    const allCount = E.questsBefore(st, today, 'all').length;

    if (!allCount) return notify('', 'System', 'Nothing dated before today.');

    const v = await dialog({
      title: 'Clear out old quests',
      message: `${openCount} unfinished and ${allCount - openCount} cleared quests are dated before today.`,
      confirm: 'Delete',
      fields: [
        { name: 'before', label: 'Delete anything due before', type: 'date', value: today },
        { name: 'scope', label: 'What to remove', value: 'open', options: [
          { value: 'open', label: 'Only unfinished ones' },
          { value: 'all', label: 'Everything, cleared ones too' },
        ] },
      ],
    });
    if (!v || !v.before) return;

    let n = 0;
    store.update((stt) => { n = E.purgeBefore(stt, v.before, v.scope); });
    notify(n ? 'bad' : '', n ? 'Cleared' : 'System',
      n ? `${n} quest${n === 1 ? '' : 's'} deleted \u00b7 sync will skip anything older` : 'Nothing matched that date');
    render();
  },

  async 'board-refresh'() {
    ui.boardLoading = true; render();
    // push a save first so your own row reflects anything not yet synced
    store.state.updatedAt = new Date().toISOString();
    await store.save({ immediate: true });
    await new Promise((r) => setTimeout(r, 400));
    ui.board = await store.board();
    ui.boardLoading = false;
    render();
  },

  async 'board-join'() {
    const st = g();
    const v = await dialog({
      title: st.board?.optIn ? 'Board settings' : 'Join the ranking',
      confirm: 'Save',
      message: 'Everyone on this link sees your name, level, gold earned and weekly activity. Quest titles, classes and notes stay private.',
      fields: [
        { name: 'name', label: 'Display name', value: st.board?.name || st.settings.hunterName || '', placeholder: 'Hunter' },
        { name: 'optIn', label: 'Show me on the board', value: st.board?.optIn ? 'yes' : 'no',
          options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No, hide me' }] },
      ],
    });
    if (!v) return;
    store.update((stt) => {
      stt.board = { optIn: v.optIn === 'yes', name: (v.name || 'Hunter').slice(0, 18) };
    });
    store.save({ immediate: true });
    setTimeout(() => actions['board-refresh'](), 900);
    render();
  },

  'select-mode'() { ui.selecting = !ui.selecting; ui.selected = new Set(); render(); },

  'sel-toggle'(el) {
    const id = el.dataset.id;
    ui.selected = ui.selected || new Set();
    ui.selected.has(id) ? ui.selected.delete(id) : ui.selected.add(id);
    render();
  },

  'sel-all'() {
    const st = g();
    const open = Object.values(st.quests).filter((q) => !q.done && !q.missed && !q.dismissed);
    ui.selected = ui.selected?.size === open.length ? new Set() : new Set(open.map((q) => q.id));
    render();
  },

  async 'sel-delete'() {
    const ids = [...(ui.selected || [])];
    if (!ids.length) return;
    const v = await dialog({
      title: 'Delete selected', danger: true, confirm: `Delete ${ids.length}`,
      message: `${ids.length} quest${ids.length === 1 ? '' : 's'} will be removed. Schoology won't re-add them.`,
    });
    if (!v) return;
    store.update((st) => {
      ids.forEach((id) => {
        const q = st.quests[id];
        if (!q) return;
        if (q.source === 'schoology' || q.source === 'todoist') q.dismissed = true; else delete st.quests[id];
      });
    });
    ui.selected = new Set();
    ui.selecting = false;
    notify('bad', 'Deleted', `${ids.length} quest${ids.length === 1 ? '' : 's'}`);
    render();
  },

  'restore-quest'(el) {
    store.update((st) => {
      const q = st.quests[el.dataset.id];
      if (q) { delete q.dismissed; q.missed = false; }
    });
    render();
  },

  revive(el) {
    store.update((st) => { const q = st.quests[el.dataset.id]; if (q) { q.missed = false; q.done = false; } });
    render();
  },

  async 'add-quest'() {
    const v = await dialog({
      title: 'New quest', confirm: 'Add',
      fields: [
        { name: 'title', label: 'What is it', placeholder: 'Lab writeup' },
        { name: 'course', label: 'Class', placeholder: 'AP Chemistry' },
        { name: 'due', label: 'Due', type: 'date', value: tk() },
      ],
    });
    if (!v || !v.title) return;
    const { title, course, due } = v;
    store.update((st) => {
      const id = `man:${Date.now()}`;
      st.quests[id] = { id, source: 'manual', title, course, due: due ? `${due}T23:59:00` : null, dueKey: due || null, done: false, missed: false, addedAt: new Date().toISOString() };
    });
    render();
  },

  /* ---- gym ---- */
  set(el) {
    const key = el.dataset.key; const i = +el.dataset.i;
    store.update((st) => {
      const day = tk();
      st.gymLog[day] = st.gymLog[day] || { exercises: {} };
      const ex = (st.gymLog[day].exercises[key] = st.gymLog[day].exercises[key] || { sets: [] });
      ex.sets[i] = !ex.sets[i];
    });
    render();
  },

  bump(el) {
    const [ladderKey, rungIdx] = el.dataset.key.split(':');
    store.update((st) => {
      const planKey = E.activePlanKey(st);
      const plan = st.plans[planKey];
      const L = st.ladders[ladderKey];
      const rung = L.rungs[+rungIdx];
      Object.values(plan.days).forEach((day) => day.forEach((e) => {
        if (e.ladder === ladderKey && e.rung === +rungIdx) {
          const cur = e.reps ?? rung.lo;
          e.reps = cur >= rung.hi ? rung.lo : cur + 1;
        }
      }));
    });
    render();
  },

  'finish-gym'() {
    let lvl = null;
    store.update((st) => {
      const day = tk();
      st.gymLog[day] = st.gymLog[day] || { exercises: {} };
      const was = st.gymLog[day].done;
      st.gymLog[day].done = !was;
      const mult = E.boostFor(st, day);
      const gold = Math.round(st.settings.gym.goldPerSession * mult);
      if (!was) {
        E.pay(st, gold, `Training session${mult > 1 ? ` (${mult}\u00d7)` : ''}`);
        lvl = E.grantXp(st, Math.round((st.settings.gym.goldPerSession / 3) * mult));
        const pre = E.prescribedFor(st, day);
        pre.exercises.forEach((e) => E.grantStat(st, e.stat, 1));
        notify('gold', `+${gold} gold`, 'Session cleared');
      } else {
        E.pay(st, -gold, 'Undo training session');
        st.xp = Math.max(0, st.xp - Math.round((st.settings.gym.goldPerSession / 3) * mult));
        st.level = E.levelFromXp(st.xp);
      }
    });
    if (lvl) levelUpWindow(lvl);
    render();
  },

  /* ---- habits ---- */
  'toggle-habit'(el) {
    const id = el.dataset.id;
    let lvl = null;
    store.update((st) => {
      const day = tk();
      st.habitLog[day] = st.habitLog[day] || {};
      const hb = st.habits.find((x) => x.id === id);
      if (!hb) return;
      if (st.habitLog[day][id] !== undefined) {
        const refund = typeof st.habitLog[day][id] === 'number' ? st.habitLog[day][id] : 0;
        delete st.habitLog[day][id];
        st.habitStreaks[id] = Math.max(0, (st.habitStreaks[id] || 1) - 1);
        if (refund) E.pay(st, -refund, `Undo: ${hb.name}`);
      } else {
        st.habitStreaks[id] = (st.habitStreaks[id] || 0) + 1;
        const streak = st.habitStreaks[id];
        const bonus = streak % st.settings.habits.streakBonusEvery === 0 ? st.settings.habits.streakBonusGold : 0;
        const mult = E.boostFor(st, day);
        const total = Math.round((hb.gold + bonus) * mult);
        st.habitLog[day][id] = total > 0 ? total : true;
        E.pay(st, total, `Habit: ${hb.name}${mult > 1 ? ` (${mult}\u00d7)` : ''}`);
        lvl = E.grantXp(st, Math.max(1, Math.round((hb.gold / 4) * mult)));
        E.grantStat(st, hb.stat || 'PER', 1);
        notify('gold', `+${total} gold`, bonus ? `${streak}\u00d7 streak bonus` : hb.name);
      }
    });
    if (lvl) levelUpWindow(lvl);
    render();
  },

  async 'use-skip'() {
    const day = tk();
    const due = E.habitsFor(g(), day).filter((x) => g().habitLog[day]?.[x.id] === undefined);
    if (!due.length) return notify('bad', 'System', 'Nothing left to skip today.');
    const v = await dialog({
      title: 'Skip pass', message: 'Which habit does this cover?', confirm: 'Use pass',
      fields: [{ name: 'id', label: 'Habit', value: due[0].id, options: due.map((x) => ({ value: x.id, label: x.name })) }],
    });
    if (!v) return;
    const pick = due.find((x) => x.id === v.id);
    if (!pick) return;
    store.update((st) => {
      st.habitSkips = Math.max(0, (st.habitSkips || 0) - 1);
      st.habitLog[day] = st.habitLog[day] || {};
      st.habitLog[day][pick.id] = 'skipped';
    });
    notify('', 'Pass used', `${pick.name} cleared`);
    render();
  },

  /* ---- shop ---- */
  async buy(el) {
    const item = g().shop.find((x) => x.id === el.dataset.id);
    if (!item) return;
    const needsDate = item.grants?.type === 'dayOff' || item.grants?.type === 'gymRest';
    const v = await dialog({
      title: item.name,
      message: `${item.price.toLocaleString()} gold\u2003\u00b7\u2003you have ${Math.round(g().gold).toLocaleString()}`,
      confirm: 'Buy',
      fields: needsDate ? [{ name: 'start', label: 'Starting on', type: 'date', value: tk() }] : [],
    });
    if (!v) return;
    const start = needsDate ? v.start : tk();
    if (needsDate && !start) return;
    store.update((st) => {
      const res = E.buy(st, item, start);
      if (!res.ok) notify('bad', 'Denied', res.why);
      else notify('gold', 'Purchased', item.name);
    });
    render();
  },

  /* ---- settings ---- */
  'save-key'() { store.setKey($('#hkey').value); store.load().then(render); notify('', 'System', 'Connecting\u2026'); },
  export() {
    const blob = new Blob([store.export()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `solo-system-${tk()}.json`;
    a.click();
  },
  import() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json';
    inp.onchange = async () => {
      try { store.import(await inp.files[0].text()); notify('', 'System', 'Backup loaded'); render(); }
      catch (e) { notify('bad', 'Import failed', e.message); }
    };
    inp.click();
  },
  async wipe() {
    const v = await dialog({
      title: 'Erase everything', danger: true, confirm: 'Erase',
      message: 'Gold, quests, streaks, plans and settings all go. Type ERASE to confirm.',
      fields: [{ name: 'word', label: 'Confirm', placeholder: 'ERASE' }],
    });
    if (!v || v.word.toUpperCase() !== 'ERASE') return;
    store.reset(); render();
  },

  async 'add-kw'() {
    const v = await dialog({ title: 'New keyword', confirm: 'Add',
      message: 'Anything in a quest title containing this word gets the weight you set.',
      fields: [{ name: 'k', label: 'Word', placeholder: 'dbq' }, { name: 'w', label: 'Weight', type: 'number', value: 1 }] });
    if (!v || !v.k) return;
    store.update((st) => { st.settings.keywordWeights[v.k.toLowerCase()] = v.w; });
    ui.open = 'gold'; render();
  },
  'del-kw'(el) { store.update((st) => { delete st.settings.keywordWeights[el.dataset.k]; }); render(); },
  async 'add-cw'() {
    const v = await dialog({ title: 'Class weight', confirm: 'Add',
      message: 'Nudge one class up or down when the auto-rating gets it wrong.',
      fields: [{ name: 'k', label: 'Class name, as Schoology writes it', placeholder: 'AP Chemistry' },
               { name: 'w', label: 'Weight', type: 'number', value: 1 }] });
    if (!v || !v.k) return;
    store.update((st) => { st.settings.courseWeights[v.k] = v.w; });
    ui.open = 'gold'; render();
  },
  'del-cw'(el) { store.update((st) => { delete st.settings.courseWeights[el.dataset.k]; }); render(); },

  async 'add-habit'() {
    const v = await dialog({ title: 'New habit', confirm: 'Add',
      fields: [
        { name: 'name', label: 'Name', placeholder: 'Take out the trash' },
        { name: 'gold', label: 'Gold when you do it', type: 'number', value: 40 },
        { name: 'penalty', label: 'Gold lost when you skip it', type: 'number', value: 15 },
        { name: 'type', label: 'How often', value: 'daily', options: [
          { value: 'daily', label: 'Every day' }, { value: 'weekdays', label: 'School days' },
          { value: 'days', label: 'Certain days' }, { value: 'monthly', label: 'Monthly' }] },
      ] });
    if (!v || !v.name) return;
    store.update((st) => st.habits.push({
      id: `h${Date.now()}`, name: v.name, gold: v.gold, penalty: v.penalty,
      stat: 'PER', schedule: { type: v.type, days: [], dayOfMonth: 1 },
    }));
    ui.open = 'habits'; render();
  },
  async 'del-habit'(el) {
    const hb = g().habits.find((x) => x.id === el.dataset.id);
    const v = await dialog({ title: 'Delete habit', danger: true, confirm: 'Delete',
      message: `"${hb?.name}" and its streak will be gone.` });
    if (!v) return;
    store.update((st) => { st.habits = st.habits.filter((x) => x.id !== el.dataset.id); });
    ui.open = 'habits'; render();
  },
  dow(el) {
    store.update((st) => {
      const hb = st.habits.find((x) => x.id === el.dataset.id);
      const d = +el.dataset.d;
      hb.schedule.days = hb.schedule.days || [];
      hb.schedule.days = hb.schedule.days.includes(d) ? hb.schedule.days.filter((x) => x !== d) : [...hb.schedule.days, d].sort();
    });
    ui.open = 'habits'; render();
  },

  'add-shop'() {
    store.update((st) => st.shop.push({ id: `s${Date.now()}`, name: 'New reward', desc: '', price: 500, cooldownDays: 0, icon: '\u25c8', grants: null }));
    ui.open = 'shop'; render();
  },
  async 'del-shop'(el) {
    const it = g().shop[+el.dataset.i];
    const v = await dialog({ title: 'Remove reward', danger: true, confirm: 'Remove', message: `"${it?.name}" comes off the shop list.` });
    if (!v) return;
    store.update((st) => st.shop.splice(+el.dataset.i, 1));
    ui.open = 'shop'; render();
  },

  'plan-edit'(el) { ui.planEdit = el.dataset.v; ui.open = 'gym'; render(); },
  'add-ex'(el) {
    const { p, d } = el.dataset;
    store.update((st) => {
      st.plans[p].days[d] = st.plans[p].days[d] || [];
      st.plans[p].days[d].push({ ladder: 'push', rung: 2, sets: st.settings.gym.setsDefault, reps: st.ladders.push.rungs[2].lo });
    });
    ui.open = 'gym'; render();
  },
  'del-ex'(el) {
    const { p, d, i } = el.dataset;
    store.update((st) => st.plans[p].days[d].splice(+i, 1));
    ui.open = 'gym'; render();
  },
  async 'copy-week'(el) {
    const p = el.dataset.p;
    const v = await dialog({ title: 'Repeat week one', confirm: 'Repeat',
      message: 'Days 1\u20137 get copied across the rest of the cycle. Anything on day 8 onward is replaced.' });
    if (!v) return;
    store.update((st) => {
      const len = st.settings.gym.cycleLength || 30;
      for (let d = 8; d <= len; d++) st.plans[p].days[d] = structuredClone(st.plans[p].days[((d - 1) % 7) + 1] || []);
    });
    ui.open = 'gym'; render();
  },

  'cal-prev'() { ui.calMonth = shiftM(ui.calMonth || tk().slice(0, 7), -1); ui.calDay = null; render(); },
  'cal-next'() { ui.calMonth = shiftM(ui.calMonth || tk().slice(0, 7), 1); ui.calDay = null; render(); },
  'cal-today'() { ui.calMonth = tk().slice(0, 7); ui.calDay = tk(); render(); },
  'cal-day'(el) { ui.calDay = el.dataset.k; ui.calMonth = el.dataset.k.slice(0, 7); render(); },

  'tab-settings-gym'() { ui.tab = 'settings'; ui.open = 'gym'; render(); window.scrollTo(0, 0); },
  'tab-settings-habits'() { ui.tab = 'settings'; ui.open = 'habits'; render(); window.scrollTo(0, 0); },
  'tab-settings-shop'() { ui.tab = 'settings'; ui.open = 'shop'; render(); window.scrollTo(0, 0); },
  'close-levelup'() { document.querySelector('.levelup')?.remove(); },
};

/* ============================================================
   EVENT WIRING
   ============================================================ */
document.addEventListener('click', (ev) => {
  const tab = ev.target.closest('[data-tab]');
  if (tab) {
    ui.tab = tab.dataset.tab; ui.open = null;
    if (ui.tab === 'calendar' && !ui.calDay) { ui.calDay = tk(); ui.calMonth = tk().slice(0, 7); }
    render(); window.scrollTo(0, 0); return;
  }

  const setVal = ev.target.closest('[data-set-val]');
  if (setVal) {
    const raw = setVal.dataset.v;
    const v = raw === 'true' ? true : raw === 'false' ? false : raw;
    store.update((st) => { st.settings[setVal.dataset.setVal] = v; });
    ui.open = setVal.closest('details')?.querySelector('summary')?.textContent.trim().toLowerCase().split(' ')[0];
    render(); return;
  }

  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (fn) { ev.preventDefault(); fn(el); }
});

document.addEventListener('change', (ev) => {
  const t = ev.target;
  const keepOpen = () => {
    const sum = t.closest('details.acc')?.querySelector('summary')?.textContent.trim().toLowerCase();
    if (sum) ui.open = sum.split(/[\s&]/)[0];
  };

  if (t.dataset.set !== undefined) {
    const path = t.dataset.set;
    let v = t.type === 'number' ? Number(t.value) : t.value;
    if (path === 'ignoreKeywords') v = t.value.split(',').map((x) => x.trim()).filter(Boolean);
    store.update((st) => {
      const parts = path.split('.');
      let o = st.settings;
      for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
      o[parts.at(-1)] = v;
    });
    keepOpen(); render(); return;
  }

  if (t.dataset.kwName !== undefined) {
    const old = t.dataset.kwName;
    store.update((st) => {
      const val = st.settings.keywordWeights[old];
      delete st.settings.keywordWeights[old];
      st.settings.keywordWeights[t.value.toLowerCase().trim()] = val;
    });
    keepOpen(); render(); return;
  }
  if (t.dataset.kwVal !== undefined) {
    store.update((st) => { st.settings.keywordWeights[t.dataset.kwVal] = Number(t.value); });
    keepOpen(); return;
  }
  if (t.dataset.cwName !== undefined) {
    const old = t.dataset.cwName;
    store.update((st) => {
      const val = st.settings.courseWeights[old];
      delete st.settings.courseWeights[old];
      st.settings.courseWeights[t.value.trim()] = val;
    });
    keepOpen(); render(); return;
  }
  if (t.dataset.cwVal !== undefined) {
    store.update((st) => { st.settings.courseWeights[t.dataset.cwVal] = Number(t.value); });
    keepOpen(); return;
  }

  if (t.dataset.habit !== undefined) {
    const [id, field] = t.dataset.habit.split('.');
    store.update((st) => {
      const hb = st.habits.find((x) => x.id === id);
      if (!hb) return;
      if (field === 'type') { hb.schedule = { ...hb.schedule, type: t.value, days: hb.schedule?.days || [] }; }
      else if (field === 'dayOfMonth') hb.schedule.dayOfMonth = Number(t.value);
      else if (field === 'gold' || field === 'penalty') hb[field] = Number(t.value);
      else hb[field] = t.value;
    });
    ui.open = 'habits'; render(); return;
  }

  if (t.dataset.shop !== undefined) {
    const [i, field] = t.dataset.shop.split('.');
    store.update((st) => {
      const it = st.shop[+i];
      if (!it) return;
      if (field === 'price' || field === 'cooldownDays') it[field] = Number(t.value);
      else if (field === 'grantType') it.grants = t.value ? { type: t.value, days: it.grants?.days || 1, n: it.grants?.n || 1 } : null;
      else if (field === 'grantN') { if (it.grants) { it.grants.days = Number(t.value); it.grants.n = Number(t.value); } }
      else it[field] = t.value;
    });
    ui.open = 'shop'; render(); return;
  }

  if (t.dataset.plan !== undefined) {
    const [planKey, day, idx, field] = t.dataset.plan.split('.');
    store.update((st) => {
      const e = st.plans[planKey].days[day][+idx];
      if (!e) return;
      if (field === 'ladder') { e.ladder = t.value; e.rung = 0; e.reps = st.ladders[t.value].rungs[0].lo; }
      else if (field === 'rung') { e.rung = Number(t.value); e.reps = st.ladders[e.ladder].rungs[e.rung].lo; }
      else e[field] = Number(t.value);
    });
    ui.open = 'gym'; render(); return;
  }
});

/* ============================================================
   BOOT
   ============================================================ */
async function boot() {
  store.weekStats = (st) => E.weekStats(st);
  await store.load();

  const events = [];
  store.update((st) => { events.push(...E.rollover(st)); });
  render();

  events.slice(0, 4).forEach((e, i) => setTimeout(() => {
    notify(e.type === 'penalty' ? 'bad' : e.type === 'cycle' ? 'gold' : '',
      e.type === 'penalty' ? 'Penalty' : e.type === 'cycle' ? 'Cycle complete' : 'System', e.text);
  }, 400 + i * 600));

  // auto-sync if it's been long enough
  const s = g();
  if (s.settings.icsUrl) {
    const hrs = s.lastSync ? (Date.now() - Date.parse(s.lastSync)) / 3.6e6 : 999;
    if (hrs >= (s.settings.autoSyncHours || 6)) syncSchoology(true);
  }
  if (s.settings.todoistToken) {
    const hrs = s.lastTodoistSync ? (Date.now() - Date.parse(s.lastTodoistSync)) / 3.6e6 : 999;
    if (hrs >= (s.settings.autoSyncHours || 6)) syncTodoist(true);
  }

  // re-check the date when the app comes back to the foreground
  let lastDay = tk();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (tk() !== lastDay) { lastDay = tk(); store.update((st) => E.rollover(st)); }
    render();
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

store.on(() => { /* status pill updates on next render */ });
boot();
