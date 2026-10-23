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

## 3b. Connect Todoist (2 min, optional)

Useful on its own, and useful as a workaround if Schoology or this app's own URL is
blocked on a school Chromebook but Todoist isn't — put your assignments in Todoist
from any device and they'll still land in your quest list here.

1. In Todoist: **Settings → Integrations → Developer**.
2. Copy the **API token** shown there.
3. In the app: **System → Todoist** → paste it → **Sync now**.

Each Todoist project becomes a "class" the same way a Schoology course does, and task
titles become quest titles. Mark a task **Priority 1** (the red flag, Todoist's own
"urgent") to give it the same difficulty bump an AP or Honors class gets.

Schoology and Todoist run side by side — the same **Sync** button pulls both, and they
share the same ignore-keywords list and the same "ignore anything before this date"
cutoff in Settings. Deleting a quest that came from either source keeps it from coming
back on the next sync, same as Schoology.

**Deleting or checking off a task in Todoist itself** carries over automatically.
Todoist's task list only ever shows open tasks, so when something drops off it, the app
looks that one task up directly to find out what actually happened: a 404 means it's
genuinely gone and the quest is removed; a completed task is marked done here too, gold
and all. If Todoist's own lookup fails for some reason, the quest is just left alone
until the next sync tries again — nothing gets guessed at.

Schoology can't offer the same guarantee. An ICS calendar has no "completed" concept at
all, and some schools only export the current term, so a vanished item might mean it
was deleted, or it might just mean it aged out of the feed's date window. Since guessing
wrong there means silently deleting a real assignment, the app doesn't auto-act on it —
instead it tells you how many quests fell off the Schoology feed and leaves the call to
you, via **Select**.

This token grants Todoist write access to your account, so treat it like a password —
don't share it, and if you ever need to revoke it, generate a new one from the same
Todoist settings page; the old one stops working immediately.

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
Refreshes roughly every 15 minutes, and tapping it opens the app. If you set it up before
this version, paste the new `widget-scriptable.js` over the old one — it now sends your
timezone so the widget's "today" matches the app's.

---

## How the numbers work

**Today card.** The top of the Quests tab shows what's due, habits left and training status
for today, each tappable, plus how close you are to a perfect day.

**Day rollover.** A "day" ends at the hour set in System → Hunter (4am by default), in your
own timezone. Late-night work before that hour counts toward the previous day.

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
high, "reading" scores low, AP and Honors classes get a bump, and a task marked
**Priority 1** in Todoist gets the same bump. Tap the rank chip on any
quest to override it; a gold dot marks the ones you've set yourself. All the keyword
weights are editable in **System → Gold & difficulty**.

**Gold.** E 10 · D 25 · C 45 · B 80 · A 140 · S 240 · S+ 400. S+ is reserved for
things like a final exam in an AP class; ordinary homework can't reach it.

**Levels.** There's no maximum level and no maximum gold. Hunter ranks: D at level 8,
C at 16, B at 26, A at 38, S at 52, then National Level (70), Monarch (95), Absolute
Monarch (125), Ruler (160) and Sovereign (200). Level 16 takes about 3,200 XP, level 52
about 20,000 and level 100 about 54,000. XP comes from quests, training and habits, all
multiplied by **XP scale** (1.5 by default, System → Gold & difficulty), and a streak adds
a little on top. A **perfect day** — every habit, quest and training session scheduled
for that day cleared, with at least 3 things scheduled — pays 60 XP (×scale) and 50 gold
the next morning. Level is always worked out from total XP, so changing the curve never
costs anyone progress. Finishing more than a day early
adds 15%. Finishing late costs 40%. A daily streak adds 3% per day up to 45%. Letting
a quest expire costs 30 gold, and skipping a habit costs whatever penalty that habit
carries.

**Gym plan finder.** Gym tab → **Find my plan**. Four short steps — goal, equipment and
schedule, your tested push-up / pull-up / squat / plank numbers, and what to emphasise or
go easy on — then a preview of the whole week. Days per week picks the split (5–6 push /
pull / legs, 4 upper / lower, 2–3 full body), minutes per session picks how many exercises
fit, and your tested maxes pick the starting rung of each ladder. Gym plans get starting
weights estimated from bodyweight. Using the plan starts a fresh 28-day cycle today and
replaces the school or summer plan you built it for; rebuild any time.

**Training.** Each session pays 70. The cycle runs 30 days by default (28 for plans from
the finder, so the weekly pattern stays lined up with the calendar); at the end the app
looks at how much of it you actually cleared:

- 85%+ → reps go up 2 (timed holds go up 10 seconds), and when you hit the top of the rep range the exercise itself
  gets harder (push-up → diamond → decline → archer, and so on up the ladder)
- 60–85% → reps go up 1 (timed holds, 5 seconds)
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

**Shop.** Priced so a day off costs roughly a week and a half of staying consistent,
and a vacation week costs about two months. Each item also has a cooldown so you
can't chain them. Buying a day off books actual calendar dates — on those days
nothing penalises you and your streaks survive.

**Challenges.** The Hunter tab holds a daily, weekly and monthly set of three. Targets scale with
your level (and the Easy/Normal/Hard setting) and are fixed when the period starts; from level 20 up
some ask for higher-rank quests, and at 100+ they ask for S-rank. Progress is read straight from your
logs, so undoing something takes it back. Finished ones pay on Claim, or automatically when the
period ends. Reroll tokens (Shop) swap one for another.

**Achievements and titles.** About 60 across quests, ranks, training, habits, perfect days, streaks,
levels, gold, shopping and challenges, in bronze / silver / gold / legend tiers that pay gold and XP.
Some unlock a title you can wear under your name. Existing saves are credited silently on first load.

**Shop.** Now grouped (Treats, Power-ups, Time off, Big rewards), about 30% cheaper, with new items:
1.5x and 3x boosts, streak shield, challenge reroll and more. Prices you edited yourself are kept.

**Customize.** System → Customize: six colour themes plus your own accent colour, corner style, density, text size, font and background effects. On a wide screen the tabs become a side rail and pages use two or three columns.

Everything above is a number in Settings. Change any of it.

---

## Files

```
index.html              app shell
styles.css              theme
js/config.js            all defaults: ranks, gold, XP curve, ladders, shop, habits
js/store.js             state + cloud/local persistence
js/engine.js            scoring, gold and XP math, progression, rollover
js/planner.js           the Find-my-plan rules (pure functions)
js/challenges.js        daily / weekly / monthly challenges
js/achievements.js      achievements and titles
js/fx.js                floating numbers, bursts, haptics
js/icons.js             SVG icon set
js/theme.js             colour themes and the Customize options
js/ui.js                rendering
js/main.js              actions and wiring
api/state.js            cloud read/write
api/ics.js              Schoology feed fetch + parse
api/todoist.js          Todoist task fetch + normalize
api/signup.js           self-signup + welcome email
api/widget.js           widget data
api/calendar.js         read-only calendar feed of your quests
lib/rank.js             quest scoring shared by the widget and calendar feed
widget-scriptable.js    the iOS widget
sw.js                   offline shell cache
```

Back up any time with **System → Sync & data → Export backup**.
