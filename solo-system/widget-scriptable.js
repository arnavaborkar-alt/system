// ============================================================
//  SYSTEM — iOS home screen widget
//  Runs in Scriptable (free on the App Store).
//
//  Setup:
//    1. Open Scriptable, tap +, paste this whole file in.
//    2. Change the two lines below to your own values.
//    3. Name the script "System" and close it.
//    4. Long-press your home screen, tap +, find Scriptable,
//       pick a Medium widget, add it.
//    5. Long-press the new widget, tap Edit Widget,
//       set Script to "System" and When Interacting to Run Script.
// ============================================================

const SITE = 'https://YOUR-PROJECT.vercel.app';   // <- your Vercel URL, no trailing slash
const KEY  = 'YOUR-HUNTER-KEY';                   // <- same value as HUNTER_KEY on Vercel

// ---------- palette ----------
const VOID = new Color('#04070F');
const PANEL = new Color('#0A1226');
const MANA = new Color('#38BDF8');
const GLOW = new Color('#9BDCFF');
const GOLD = new Color('#F5C542');
const MUTED = new Color('#6E82AC');
const FAINT = new Color('#46577C');
const DANGER = new Color('#FB5E7E');

const RANK_COLOR = { E: MUTED, D: new Color('#4FA3D1'), C: MANA, B: GLOW, A: new Color('#A78BFA'), S: GOLD, 'S+': new Color('#FF9E4A') };

async function load() {
  const req = new Request(`${SITE}/api/widget?key=${encodeURIComponent(KEY)}`);
  req.timeoutInterval = 12;
  return await req.loadJSON();
}

function shell() {
  const w = new ListWidget();
  const grad = new LinearGradient();
  grad.colors = [new Color('#0B1730'), VOID];
  grad.locations = [0, 1];
  w.backgroundGradient = grad;
  w.setPadding(13, 14, 13, 14);
  w.url = SITE;
  return w;
}

function label(stack, text, size, color, bold = false) {
  const t = stack.addText(String(text));
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  return t;
}

function errorWidget(msg) {
  const w = shell();
  label(w, 'SYSTEM', 9, MANA, true);
  w.addSpacer(6);
  const t = label(w, msg, 12, DANGER);
  t.lineLimit = 3;
  return w;
}

const BOOST = new Color('#B98CFF');

function timeLeft(iso) {
  const ms = new Date(iso) - new Date();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3.6e6);
  const m = Math.floor((ms % 3.6e6) / 6e4);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function build(d, size) {
  const w = shell();

  if (d.boost) {
    const grad = new LinearGradient();
    grad.colors = [new Color('#1D1338'), VOID];
    grad.locations = [0, 1];
    w.backgroundGradient = grad;
  }

  // ---- top line: level, name, gold ----
  const head = w.addStack();
  head.centerAlignContent();
  label(head, `LV ${d.level}`, 11, GLOW, true);
  head.addSpacer(7);
  const n = label(head, String(d.hunter).toUpperCase(), 9, FAINT, true);
  n.lineLimit = 1;
  head.addSpacer();
  label(head, `${d.gold.toLocaleString()}g`, 15, GOLD, true);

  w.addSpacer(3);
  const rule = w.addStack();
  rule.size = new Size(0, 1);
  rule.backgroundColor = d.boost ? BOOST : new Color('#1B2C55');
  w.addSpacer(8);

  if (d.boost) {
    const bl = w.addStack();
    bl.centerAlignContent();
    label(bl, `\u2726 ${d.boost.mult}\u00d7 GOLD & XP`, 9.5, BOOST, true);
    bl.addSpacer();
    const left = d.boost.endsAt ? timeLeft(d.boost.endsAt) : null;
    if (left) label(bl, `${left} left`, 9.5, BOOST);
    w.addSpacer(7);
  }

  if (d.dayOff) {
    label(w, 'DAY OFF', 9, GOLD, true);
    w.addSpacer(4);
    label(w, 'Nothing counts today.', 12, MUTED);
    return w;
  }

  // ---- counters ----
  const row = w.addStack();
  row.spacing = 14;

  const col = (title, value, color) => {
    const c = row.addStack();
    c.layoutVertically();
    label(c, title, 8, FAINT, true);
    label(c, value, 15, color, true);
  };

  col('DUE TODAY', String(d.quests.dueToday), d.quests.dueToday ? DANGER : GLOW);
  col('HABITS', `${d.habits.done}/${d.habits.total}`,
      d.habits.total && d.habits.done >= d.habits.total ? GLOW : MUTED);
  col('TRAINING', d.gymDone ? 'done' : 'open', d.gymDone ? GLOW : MUTED);
  row.addSpacer();

  // ---- top quests (medium and large widgets have the room) ----
  if (size !== 'small' && d.quests.top.length) {
    w.addSpacer(9);
    d.quests.top.slice(0, size === 'large' ? 4 : 2).forEach((q) => {
      const line = w.addStack();
      line.centerAlignContent();
      line.spacing = 6;
      const chip = label(line, q.rank, 10, RANK_COLOR[q.rank] || MANA, true);
      chip.lineLimit = 1;
      const t = label(line, q.title, 11.5, new Color('#DCE7FF'));
      t.lineLimit = 1;
      w.addSpacer(3);
    });
  }

  w.addSpacer();
  const foot = w.addStack();
  label(foot, d.quests.dueTomorrow ? `${d.quests.dueTomorrow} due tomorrow` : 'nothing due tomorrow', 9, FAINT);
  foot.addSpacer();
  label(foot, new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), 9, FAINT);

  return w;
}

let widget;
try {
  const data = await load();
  widget = data.empty
    ? errorWidget('No data yet. Open the app once so it can save.')
    : data.error
      ? errorWidget(data.error)
      : build(data, config.widgetFamily || 'medium');
} catch (e) {
  widget = errorWidget(`Cannot reach the System. Check SITE and KEY.\n${e.message}`);
}

// tick faster while a boost is counting down
widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
