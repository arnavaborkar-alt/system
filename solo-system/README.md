# SYSTEM

A hunter-interface tracker: Schoology assignments become ranked quests, quests pay
gold, gold buys days off. Plus a 30-day training cycle that raises its own difficulty,
and habits on a schedule.

Works fine with zero setup (data stays on one device). The 15-minute setup below adds
cloud sync across devices and the iPhone home screen widget.

---

## 1. Put it on Vercel (5 min)

**Use GitHub, not drag-and-drop.** A dropped folder can never be updated in place —
every change becomes a brand-new project at a brand-new URL, and since data is tied to
the URL, you'd lose your progress each time. Going through GitHub means fixes deploy to
the same URL forever.

1. Go to **github.com/new**, name the repo `solo-system`, create it.
2. On the empty repo page, click **uploading an existing file**, then drag the
   *contents* of this folder in (the `js` and `api` folders included). Commit.
3. Go to **vercel.com/new**, sign in with GitHub, **Import** the repo.
4. Framework preset: **Other**. Leave build command and output directory blank.
5. **Deploy.**

You'll get a URL like `https://solo-system.vercel.app`. Open it on your phone —
it already works at this point, storing everything locally in the browser.

From now on, editing a file on GitHub redeploys the site automatically.

---

## 2. Add the database (5 min)

This is what makes the widget and multi-device sync possible.

1. In your Vercel project → **Storage** tab → **Create Database** → pick a Redis
   store (Upstash is the default option and has a free tier).
2. Connect it to this project. Vercel writes `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` into your environment variables automatically.
3. Go to **Settings → Environment Variables** — note this is *not* the same as
   "Custom Environments", which is a paid feature you don't need. Add:

   | Name | Value |
   |---|---|
   | `HUNTER_KEYS` | comma-separated passphrases, one per person |

   Start with just your own, e.g. `shadow-monarch-2027`.

4. **Redeploy** (Deployments tab → ⋯ on the newest one → Redeploy). Environment
   variables only take effect on a fresh deploy.
5. Open the app → **System** tab → **Sync & data** → paste your passphrase →
   **Connect**. The dot next to the XP bar turns green.

Anyone with your passphrase can read your save, so don't post it anywhere.

### Letting friends in

Send them the same link. Each person needs their own passphrase in `HUNTER_KEYS`:

```
HUNTER_KEYS = shadow-monarch-2027,jordan-pass-here,sam-pass-here
```

Redeploy and they're in. Every passphrase gets a separate storage slot — own gold,
own quests, own Schoology link, own gym plan. Nobody can see anyone else's, and the
passphrases themselves are never written to the database, only hashes of them.

If you'd rather not redeploy every time someone joins, set `HUNTER_KEYS` to the single
word `open`. Then any passphrase of 12 characters or more works and creates its own
save. Convenient, but anyone who finds your URL can use your database, so only do that
if you don't mind.

---

## 3. Connect Schoology (2 min)

1. In Schoology: click your name (top right) → **Settings**.
2. Scroll to **Share Your Schoology Calendar** → **Enable**.
3. Copy the iCal link.
4. In the app: **System → Schoology** → paste it → **Sync now**.

If the Enable button does nothing, your calendar is empty — add any single event in
Schoology first, then try again. If the whole section is missing, your district
turned it off; you can still add quests by hand with **+ Quest**.

After the first sync it re-checks every 6 hours on its own.

---

## 4. Home screen icon (1 min)

Open your Vercel URL **in Safari** (not Chrome — iOS only allows this from Safari).
Share button → **Add to Home Screen** → Add.

It now launches full-screen with no address bar.

**Do step 2 before this one.** Without the database, iOS gives the home-screen app its
own storage, walled off from Safari — so anything you set up in the Safari tab won't be
there when you open the icon. Once cloud sync is on, both point at the same data and it
stops mattering.

---

## 5. Home screen widget (5 min)

iOS doesn't let a web app draw a widget, so this goes through Scriptable.

1. Install **Scriptable** from the App Store (free).
2. Open it, tap **+**, and paste in everything from `widget-scriptable.js`.
3. Change the top two lines to your Vercel URL and your `HUNTER_KEY`.
4. Name the script **System**, close it.
5. Long-press your home screen → **+** → **Scriptable** → **Medium** → Add Widget.
6. Long-press the new widget → **Edit Widget** → Script: **System**,
   When Interacting: **Run Script**.

It shows level, gold, what's due today, habit progress and whether you've trained.
Refreshes roughly every 15 minutes, and tapping it opens the app.

---

## How the numbers work

**Month view.** The calendar tab shows every due date, training day, habit day and
booked day off in one grid. Coloured dot = highest-ranked quest due that day (green once
they're all cleared), diamond = training, bar = habits, gold cell = day off. Tap any day
for its full breakdown, and you can clear quests straight from there. Works for past and
future months, so you can see a heavy week coming.

**Quests.** Tap any quest's name to open it — rename it, change the class, move the
due date, or delete it. Deleting one that came from Schoology keeps a hidden tombstone
so the next sync can't put it back; it sits under **Deleted** if you want it returned.
Manual quests are removed outright.

**Clearing out a backlog.** Joining a course mid-year dumps its whole past into your
list. When five or more quests are dated before today, a banner offers **Clear them
out** — pick a date, choose whether to include already-cleared ones, and they're gone.
It also sets the sync cutoff to that date so Schoology can't hand them back. For picking
specific ones, hit **Select**, tap the rows you want, and delete them together. The
cutoff is editable any time under System → Schoology.

**Ranks.** Every quest gets E through S+ from words in its title — "final exam" scores
high, "reading" scores low, AP and Honors classes get a bump. Tap the rank chip on any
quest to override it; a gold dot marks the ones you've set yourself. All the keyword
weights are editable in **System → Gold & difficulty**.

**Gold.** E 10 · D 25 · C 45 · B 80 · A 140 · S 240 · S+ 400. S+ is reserved for
things like a final exam in an AP class; ordinary homework can't reach it.

**No ceilings.** There's no maximum level and no maximum gold. Levels keep going past
100 with new titles (National Level Hunter, Shadow Monarch, Monarch of Destruction,
Ruler of Ash, Sovereign). The only limit anywhere is how fast the leaderboard will
credit gold — which affects the board, not your save. Finishing more than a day early
adds 15%. Finishing late costs 40%. A daily streak adds 3% per day up to 45%. Letting
a quest expire costs 30 gold, and skipping a habit costs whatever penalty that habit
carries.

**Training.** Each session pays 70. The cycle runs 30 days; at the end the app looks at
how much of it you actually cleared:

- 85%+ → reps go up 2, and when you hit the top of the rep range the exercise itself
  gets harder (push-up → diamond → decline → archer, and so on up the ladder)
- 60–85% → reps go up 1
- under 60% → the block repeats unchanged

Every 4th cycle is a deload — same movements, fewer sets, on purpose. The ladders,
thresholds and the whole 30-day plan are editable in **System → Gym plan**.

**Summer.** Set your school year end date in **System → Hunter**. The day after it
passes, the summer plan takes over — barbell work with double progression instead of
bodyweight variations. Edit either plan any time, or force a season with the
auto / school / summer switch.

**Double gold & XP (1,200).** Everything you clear that day pays twice — quests,
training and habits alike. The whole interface turns violet while it runs and a countdown
sits at the top; the home screen widget shows the same. It can't be stacked with a day
off in either direction, since doubling a day where nothing counts would be wasted gold.
Five-day cooldown, and it can be booked for a future date — worth lining up against a
week with a couple of tests in it.

**Ranking.** Everyone on your link can opt in from the Rank tab — name, level, gold on
hand, streak, and this week's quests and training. It's honor system: each save mirrors
its own numbers to a shared board, unverified. Nothing enforces that a save is honest,
so it's only worth turning on with people you actually trust not to edit their own file.
Quest titles, classes, Schoology links and notes never leave your own save regardless —
only the aggregate numbers above ever reach the board. Join or leave any time; leaving hides your row from everyone else's board immediately.

**Shop.** Priced so a day off costs roughly a week and a half of staying consistent,
and a vacation week costs about two months. Each item also has a cooldown so you
can't chain them. Buying a day off books actual calendar dates — on those days
nothing penalises you and your streaks survive.

Everything above is a number in Settings. Change any of it.

---

## Files

```
index.html              app shell
styles.css              theme
js/config.js            all defaults: ranks, gold, ladders, shop, habits
js/store.js             state + cloud/local persistence
js/engine.js            scoring, gold math, progression, rollover
js/ui.js                rendering
js/main.js              actions and wiring
api/state.js            cloud read/write
api/board.js            leaderboard read (scoring rules live in state.js + board.js)

api/ics.js              Schoology feed fetch + parse
api/widget.js           widget data
widget-scriptable.js    the iOS widget
sw.js                   offline shell cache
```

Back up any time with **System → Sync & data → Export backup**.
