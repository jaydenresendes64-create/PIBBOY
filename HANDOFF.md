# PIBBOY — technical handoff

State as of PR #39 and its follow-ups (2026-10-22). Live: https://jaydenresendes64-create.github.io/PIBBOY/
`node --test` passes locally and on GitHub (Tests workflow). `sw.js` VERSION: a hash of the app's
files, written by `node tools/stamp-sw.js`; `DATA_SCHEMA` (js/state.js): 1.

## 1. What it is

A **single-user, personal** Fallout Pip-Boy–style life tracker (never distributed or sold), used
mainly as a Home Screen web app on the owner's phone. Plain HTML/CSS/JS, **no framework, no build
step** for the app itself. Hosted on **GitHub Pages** from `main` (the repo must stay **public** for
free Pages). No server, no paid services: the journal uses offline keyword rules.

## 2. Architecture

Plain scripts (not ES modules, so `index.html` still opens from disk) sharing
`window.StatusTerminal` (`ST`), loaded with `defer` in this order (see `index.html`):

| File | Role |
|---|---|
| `js/state.js` | Data model (DATA MODEL comment at top), `DEFAULT_STATE`, `migrate()`, `sanitizeImported()`, rewards (`gainXp`, `grantSkill`, `grantStat`, `completeMain`), wallet/Caps (`capsValue`, `capsProgress`, `syncCapsQuests`), streaks, sales |
| `js/storage.js` | Two copies of the state (IndexedDB + localStorage, `savedAt`), newest wins; cross-tab sync; flush on hide; backups export/import; `requestPersistence()` |
| `js/ai.js` | Journal: offline EN/FR keyword rules (whole words, accents ignored) + optional `api/analyze.js` client (unused on Pages) |
| `js/places.js`, `js/map.js`, `js/fog.js`, `js/bulk.js`, `js/routes.js` | MAP tab: MapLibre GL 6.11.2 (`vendor/maplibre`, dynamic `import()`), OpenFreeMap vector tiles + custom amber style (`data/map-style.json`), WebGL fog-of-war custom layer, city search (GeoNames ≥15k, `data/places.txt`), regions (Natural Earth admin-1, Morocco from geoBoundaries, `data/regions/`), pins, "I'm here", bulk add with review, **routes** (road trips: stops picked by the owner, road traced once by OSRM's public server `router.project-osrm.org` — in the CSP — simplified to 40 m and stored as an encoded polyline in `state.map.routes`; fog corridor 1.5 km each side, `routeOnScreen()` in fog.js; dotted GeoJSON line layers under the fog) |
| `js/sfx.js` | Sounds, all synthesized (Web Audio, lo-fi chain); power-on screen; custom clip playback |
| `js/sfx-custom.js` | "Custom sounds" panel: decode a video/audio file, detect sounds, trim, assign; clips in IndexedDB `status_terminal_sounds`; sound-pack JSON export/import |
| `js/render.js` | Builds every tab's HTML (escapes everything), toasts/banners, `switchTab` |
| `js/items3d.js` | ITEMS 3D wireframe models (Three.js, dynamic `import()`), one shared WebGLRenderer copied into small 2D canvases |
| `js/mascot.js` | Mascot gesture scheduling (moves are CSS keyframes, per body part: see §3 Look & feel) |
| `js/insight.js` | VITALS words, read-only (`ST.insight`): `readings()` (STATUS / TREND / PRIORITY / ACTION / PATTERN from the logged check-ins), `urgeContext()` + `urgeMessages()` (the urge decoder's messages, context first), `urgeReflection()`, `resetLine()`, `urgeHint()`, `urgePatterns()` (from the urge log); keeps no data |
| `js/vitals.js` | VITALS tab with its CHECK-IN / TRIALS sub-tabs (`app.vitalsView`; check-in, urge decoder + its timer's clock, chem-free streak card, last 7 days), the morning path (`order`, `fieldReport`, `nextStep`) and Check-in first (`locked`); its buttons use `data-vital` (its own listeners), the rules are in state.js |
| `js/trials.js` | VITALS → TRIALS screen (`ST.trials.html()` drawn by vitals.js `render()`): cards, the open trial's panel (3-2-1, stopwatch/countdown clock, tap counter, save confirm, last results), the timer loop + wake lock; buttons use `data-trial` (its own listeners), the rules are in state.js |
| `js/crt.js`, `js/tilt.js` | CRT flicker; 3D tilt (DeviceOrientation/mouse) incl. glass glare parallax |
| `js/events.js` | All user actions → state change → re-render → debounced save |
| `js/main.js` | Boot: load → setup events → render → `syncCaps()` → SW registration |
| `sw.js` | Service worker: cache first, one whole version at a time (`CACHE` = prefix + `VERSION`, a hash of APP_SHELL's files from `tools/stamp-sw.js`); install precaches APP_SHELL past the HTTP cache (big `HEAVY` files may fail without stopping it; a core file failing keeps the old version); a later version waits for the page's `SKIP_WAITING` (js/main.js `watchUpdates`: when the app goes to the background, or at an untouched open); region shapes in `status-terminal-data` (stale-while-revalidate, kept across versions); vector tiles cache (≤800); tested in `tests/sw.test.js` with a fake network |
| `css/terminal.css` | All styles (palette variables in `:root`) |
| `vendor/three/three.pibboy.min.js` | Three.js r186, tree-shaken (parts in `tools/three-entry.mjs`, built by `tools/build-three.mjs`) |
| `tests/*.test.js` | `node --test` (Node built-in runner, vm harness in `tests/helpers.js`, no deps) |
| `.github/workflows/test.yml` | Runs the tests on every push |

**Code rules (engineering pass, 2026-09-24):**
- **Event core (2026-09-25):** every reward is an event paid through `award(type, data, xp, gains)` in
  state.js: `withPerks()` applies the perk table, then skills + `gainXp()`, then `record()` appends
  `{t, type, xp, data}` to `state.history` (EVENT_TYPES, last HISTORY_MAX = 2000; sanitized). The
  reward functions only say what happened: completeMain/Side/Bonus/Daily, rewardCheckIn, rewardRoute,
  acceptJournal, sellItem, discoverPlace, findBobbleheads. Milestones without XP call `record()`:
  LEVEL_UP (in gainXp), PERK_TAKEN, SPECIAL_RAISED (`spendSpecialPoint`), BACKUP_MADE (`markBackup`),
  HOLOTAPE_RECORDED (`countHolotape`). Queries: `recentEvents(days)`, `historySummary(days)`.
  The history's XP always adds up to lifetimeXp (for events since it exists).
- **Perks are data:** each PERKS entry says `on` (an event type) and `xpFlat` / `xpPercent` /
  `skillFlat` per rank; `text` is generated from those numbers. A new perk = one table entry.
- events.js never changes XP, skills or stats itself; it asks state.js and shows the toasts.
- Settings (index.html `#settings`, opened by `#settings-btn`): the old footer controls moved there
  with their ids, so tilt.js / sfx.js / events.js still find them; toggles are `.set-toggle` rows whose
  text ("Sound: on") is for screen readers and shows as `data-label` + `[ ON ]` (CSS on aria-pressed).
- events.js dispatches taps through tables: `ACTIONS` (by `data-action`: `run(btn, id, key)`) and
  `BUTTONS` (by id). A new button = one entry. `replaceState()` (import/reset) and `adoptState()`
  both re-sync caps quests.
- Shared helpers live in state.js: `ST.stayStill()`/`ST.motion` (Reduce Motion), `ST.dateText()`,
  `encodePath/decodePath`. Don't re-declare them in a module.
- Measured (desktop, local): DOMContentLoaded ~0.1 s; each tab renders in ~1 ms with a heavy save
  (200 log entries, 40 quests, 80 items); sanitize ~0.7 ms. Rendering isn't a bottleneck: no
  virtual DOM or lazy script loading needed.

**Data flow rule:** every document entering the app (storage load, other tab, backup import) goes
through `sanitizeImported()` → `mergeDefaults(migrate(doc))` → type coercion. Any schema change
needs a `migrate()` step + `sanitizeImported()` coverage + a test.

## 3. Features implemented

- STATUS: S.P.E.C.I.A.L. (STR, END, CHA, INT, AGI; raised by confirmed level-up points and by
  **training**, see below), skills (CONCENTRATION, KNOWLEDGE, SPEECH, SURVIVAL, COOKING, FINANCE, MUSIC,
  BUSINESS; tap one for its sources: `skillSources()` in state.js, Earned / Coming; no −/+ since
  2026-10-10, from a Grok render.js the owner brought), Lifetime stats (+ chem-free days, urges ridden out, vitals check-ins).
- **VITALS, chem-free streak, urge decoder, training (2026-10-09):** the owner built these in an
  in-Claude copy of the app (a single page from the very first version, its own data in the artifact's
  db) and asked to bring them here. state.js: `vitals` (one entry a day: six 0-10 levels, pulse, radN/radT
  counters; `logVitals()` once a day = award('VITALS_CHECKIN', 15) + trains INT), `chems` (cleanSince =
  day 1; `claimCleanMilestones()` pays 7/14/30/60/90 days once a run, called from events.js
  `checkBobbleheads` after every change, at boot and on a new day (main.js `newDay`); claimed is kept
  when the start date is corrected, so editing it never pays twice; `logLapse()` adds the run to
  totalClean/best, restarts tomorrow, clears claimed), `urges` (`startUrge`, 20 min from a saved start,
  `urgeWon()` only at zero: award('URGE_RESISTED', 40, +1 SURVIVAL), 3 paid a day, all logged),
  `statTrain` + daily `stat` (`trainStat()`: every 300 XP = +1 stat, SPECIAL_TRAINED event; completeDaily
  returns `trained`). Dates are 'YYYY-M-D' like the rest (the in-Claude backups' 'YYYY-MM-DD' are
  normalized by sanitize). Settings → **Add from the old terminal**: `mergeOld(into, src)` adds only those
  parts + daily/side quests missing by id or objective (lastDate reset, claimed not carried, so the
  milestones are paid here), never XP/level/skills/stats/items/wallet/journal; asked first with a
  summary computed on a copy; idempotent. Its seeded personal quests (dailies, a doctor's visit) were
  **not** put in the public code: they come with that import, or the owner adds them.
  Fit pass (same day, owner: "optimise ça au max pour que ça fit bien"): the RobCo boot shows
  `CHEM-FREE ... DAY nn (x TO next)` and `VITALS ... CHECK-IN DUE / CHECKED IN TODAY`; the VITALS tab key
  gets a light (`data-alert` = urge / over / due, vitals.js `markTab`, CSS `.tab-btn[data-alert]::after`);
  the end of an urge round is announced once a round from any tab (vitals.js `syncAlarm`: a timeout
  to the end while the app is visible, a sound, a notice when VITALS isn't open).
- **TRIALS (2026-10-10, owner: "on commence par Trials"):** weekly physical tests with personal
  records, a sub-tab of VITALS. state.js: `TRIAL_KINDS` (reps = most in one set, timed = most in 60 s,
  hold = longest, fastest = least seconds), built-in `TRIALS` (pushups STR, plank END, squats AGI, km
  END), `trials` = { custom (≤12, own id/name/kind/stat), hidden (built-in ids), log (≤1000 {id, date,
  value, xp, t}), active ({id, start} of a running timer, start = tap + 3 s for the 3-2-1, survives a
  reload) }. `logTrial()` always logs; it pays once a trial a day (`trialPaidToday`): a record (`beats`
  the best, by the kind's `better`) award('TRIAL_DONE', 50), otherwise 15, and `trainStat()` with the
  reward's XP. `removeTrialResult()` keeps the XP (like books). `trialDue()` = never tried or last ≥ 7
  days; `trialGoal()` = best ±5% (at least 1 rep / 5 s). `parseTrialValue()` takes m:ss / h:mm:ss or
  plain numbers. Sanitize drops unknown trials and results < 1, caps values (9999 reps, 1 day).
  vitals.js: `subTabsHtml()` (TRIALS shows "N due"), the tab key's light gets `trial` (timer running),
  the urge ticker/announce only count on the CHECK-IN view (`urgeShown`). render.js `showRecord()`
  (NEW RECORD banner). Boot line `TRIALS ... N DUE THIS WEEK / ALL DONE THIS WEEK`.
  Tested in `tests/trials.test.js`; checked live with Playwright (timers, tap counter, confirm, reload).
  1 km + Strava (2026-10-10, owner: "open Strava and start the run"): trials.js shows, on the `km`
  trial's panel (not while its stopwatch runs), a link `shortcuts://run-shortcut?name=PIBBOY%20Run`
  (Apple's documented URL to run a shortcut). Strava has no documented link that starts a recording;
  its Siri shortcut (start a run/walk) goes in the owner's "PIBBOY Run" shortcut. The result is typed
  back by hand (Strava's 1 km split): reading it automatically would need Strava's API, whose OAuth
  needs a client secret, so a server; not on GitHub Pages.
  **Distance (2026-10-21, owner: "parfois je fais 5 km, 6 km… alors que je n'ai qu'un objectif de 1 km;
  ça devrait être moi qui l'ajoute manuellement, avec mon record"; the owner chose the XP by the km and
  to keep the 1 km):** a kind `distance` (unit `m`, better more, timer `none`: typed in) and a built-in
  `distance` trial (END). Values are whole metres (`TRIAL_VALUE_MAX.m` 200 km), typed in km ("5.4",
  "5,4 km") and shown in km to the 10 m. It pays by the km (`trialXp()`): `TRIAL_KM_XP` 5 a km, at
  least 1, at most `TRIAL_KM_XP_MAX` 100 (a typo can't pay much), + `TRIAL_RECORD_XP` for a record;
  still once a trial a day. Goal: 5% or 100 m further, to the next 100 m. The panel has no timer: the
  Strava shortcut button ("Start with Strava") and a km box. Own trials can use the kind too (a bike).
  No migrate: the shape is the same (a new kind and unit in the code; sanitize caps by unit). Tests in
  `tests/trials.test.js` (parsing, XP, document, screen); `5 trials due` on a fresh save.
- **Morning path (2026-10-10, from a Grok prompt the owner brought, reviewed against the code):** the
  app opens on VITALS (main.js; index.html shows #tab-vitals first). vitals.js `order()`: urge decoder
  first if `urges.active` or a craving ≥ 6 (today's logged check-in, else yesterday's: `lastCheckIn().ago===1`),
  streak first when the next milestone is tomorrow (`next.days - cleanFullDays() === 1`), else the
  check-in; the others follow in the usual order check-in, streak, urge (owner's "Patch 2": the streak
  stays in sight under the field report); the three cards are always there, then "Last 7 entries". The streak card moved off STATUS
  (Lifetime keeps the total). state.js `lastCheckIn()` (latest logged entry before today + `ago`);
  `vitalsToday(true)` seeds the six levels from it (5 without one; pulse/counters start empty), and the
  sliders show the same before the first move. Logged → folded (`app.vitalsEdit` reopens it, session
  only): one line, `fieldReport()` (sleep ≤ 3, craving ≥ 6, INT training, dailies left, trials due,
  chem-free day like the boot line) and `nextStep()` (first trial due, else the daily with the oldest
  lastDate, `go` → TRIALS with that trial open, or QUESTS). Check-in first: `locked(tab)` for
  quests/items/map/log until today's check-in is logged; events.js refuses the tab tap with a notice;
  keys get `.locked` + aria-disabled in `markTab()`; device pref `status_terminal_checkin_first`
  ('0' = off), Settings → Morning. No new data, no new XP path. Changed from Grok's text: training is
  300 XP a point (not 100), SURVIVAL is a skill (shown read-only on the urge card after a ride-out),
  fold happens on log (no separate "close morning" tap), UI stays in English, and the lock is a
  setting. Tested in `tests/morning.test.js`.
  The radN / radT counters ("RADS // type N / T", the owner's own private counters, tapped through
  the day; their meaning stays out of the public code) are on the folded card too (`countsHtml()`),
  since folding had hidden them behind "Edit check-in" (2026-10-10).
  Rewards are saved before the screen is drawn (vitals-log, urge-won, trials save-yes), like
  events.js `afterCheck()`: a drawing error can't lose them (ChatGPT audit, 2026-10-10; tested).
  VITALS day 4:00 → 4:00 (2026-10-11, audit recommendation 2): state.js `vitalsDayStr()` (local
  hour < `VITALS_DAY_START` = 4 → the day before; wall clock, so DST nights are right) is used by
  `vitalsToday()` and `lastCheckIn()` (`ago` counted from it; entries dated after it ignored), so
  everything on top (setVital/setPulse/stepRads/logVitals, the lock, the order, the "Yesterday"
  line, the boot line, the tab light) follows. Dates stored as before, no migration. vitals.js
  remembers the day it drew (`shownDay`): `refreshIfNewDay()` (main.js `newDay`, every minute and
  on return) redraws at 4:00, and a Log tap on a form drawn before 4:00 redraws with a notice
  instead of logging unseen values. Dailies, streak, urges' daily cap, trials keep midnight
  (`todayStr`). Tests in `tests/vitalsday.test.js`; checked live with a fake clock (Toronto).
- **Undo last replace (2026-10-22):** storage.js `keepPrevious(state, reason)` (IndexedDB key
  `state/previous`, one copy, stamped with DATA_SCHEMA) and `readPrevious()` (sanitized; null for a
  higher schema); events.js `replaceState(state, reason)` keeps the old one first (import, reset, undo),
  `confirmMerge` too; Settings → `undo-btn` / `undo-note` (refreshed on open), confirm, `doUndo()`.
  `tests/undo.test.js`.
- **Instant open (2026-10-22, owner's yes):** sw.js cache first, whole versions (`VERSION` hash of
  APP_SHELL from `tools/stamp-sw.js`; `tests/sw.test.js` fails if stale), the first version takes
  over at once, a later one waits; js/main.js `watchUpdates()`: `reg.update()` when back on screen
  after 30 min, `SKIP_WAITING` when the app goes to the background (after `leaving()` saved) or at an
  open where it's already waiting and nothing was touched, one reload on `controllerchange`;
  `ST.reopen()` fetches the new version for the stale banner. js/storage.js stamps every copy with
  `DATA_SCHEMA` and never adopts or writes over a higher one (`goStale`, `showNewerVersion`).
  Measured: reopen on a 1.5 s-latency link 4.1–4.5 s → 79–87 ms. Checked in Chromium with a real
  worker: offline open, deploy while in use (old files kept until the background, then new, unsaved
  change kept, old cache deleted), deploy found while away (put in at the next untouched open), the
  move from the live network-first worker (v36) to this one.
- **Places quests (2026-10-22, HANDOFF §8 step 0):** main quest `progressType:'places'`, `placesTarget`
  (1-PLACES_TARGET_MAX), `placesCc` (a COUNTRY_CODES entry or '' anywhere). state.js `placesCount()` =
  cities + regions on the MAP now (in that country), `placesProgress()`, `questProgress()` (mainReady
  uses it), `syncPlacesQuests()` (true when a bar moved). events.js runs it after every change
  (`checkBobbleheads`, the storage change hook) and on a new state; render.js `placesRowHtml()`, the
  form's "Places to reveal" with a country list from `Intl.DisplayNames`. No migrate step (a new
  type; old saves have none); the sanitizer checks both fields. `tests/placesquest.test.js`.
- **Last 7 days (2026-10-22):** state.js `weekSummary()` → `{week, before}` (calendar days: today and
  the 6 before, then the 7 before those): XP and check-ins/dailies/quests/trial records from
  `state.history`, urges ridden out / given in to from `urges.log`, trials from `trials.log`. No new
  data. render.js `weekHtml()` (STATUS, above Lifetime, hidden when both weeks are empty; each cell
  shows the week before in brackets, never a minus); boot.js a `LAST 7 DAYS` line once the week has
  XP or urges. `historySummary(days)` stays (rolling hours, by type). `tests/week.test.js`.
- **Backup import comparison (2026-10-22):** state.js `stateSummary(s)` (level, lifetimeXp, logged
  check-ins, urges, quests done, journal entries, places, `last` = latest history/urge `t` or logged
  check-in day at 4:00) and `compareBackup(here, backup)` (`older`, `lose` per count, never negative);
  events.js `importQuestion()` puts both lines and the warning before "Replace all data with this
  backup?". Nothing changes before "Yes, replace" (tested: state byte-identical, a non-backup file
  refused). `tests/backup.test.js`; checked in Chromium with a real file.
- **Urge decoder record (2026-10-22, owner's "autonomous engineering mission" prompt: trigger and
  intensity tracking, history, user-defined coping, patterns, reflection):** state.js `urges.active`
  gets `intensity` (0-10, 0 = not noted), `trigger` (`URGE_TRIGGERS`, '' none), `copes` (ids); log
  entries get `outcome` ('won' | 'lapsed'), the same three, `note` (≤ `URGE_NOTE_MAX` 140), `hour`,
  `t` (ms; 0/-1 for entries from before); `urges.copes` = the player's ways (`DEFAULT_COPES`, 6
  generic ones, then theirs; ≤ `COPES_MAX` 12, names ≤ 30, no two the same). No migrate step:
  `DEFAULT_STATE.urges.copes` reaches old saves through `deepMergeDefaults` (an emptied list stays
  empty), and `sanitizeVitals` rebuilds every field (old entries read as ridden out: they were).
  `setUrgeDetail(key, value)`, `urgeLapsed()` (any time a timer exists: logged, no award, no penalty,
  no streak lapse), `noteUrge(t, words)`, `addCope`/`removeCope` (logged ids stay, unnamed),
  `urgesToday()` counts only ridden-out urges (the XP cap must not count lapses). insight.js:
  `copeStats`/`bestCope` (≥ 2 uses on this need, else ≥ 3 on any, won more than half),
  `urgeContext().cope` → first message `ctx-cope`; `urgeContext().note` (`lastNote()`: the latest
  note on a ridden-out urge, this need first, else any) → `ctx-note` (style YOUR WORDS); the trigger
  tapped → `ctx-trigger` (`TRIGGER_TIPS`, one practical step each) and `ctx-trigger-past` (urges with
  that trigger before, 2 at least); vitals.js jumps `app.urgeAngle` to `ctx-trigger` on the tap;
  patterns add `pat-strong` (rated ≥ 7 vs 1-6, 3 each, told at a 25-point difference); `urgePatterns()` (≥ 3 logged): best way,
  top trigger (≥ 3), day part with ≥ 40% (≥ 5 timed), intensity last half vs first half of the last
  10 rated (≥ 6, |Δ| ≥ 1), ridden-out count; observational wording only. vitals.js: the running and
  over phases show `urgeDetailsHtml()` (range, trigger chips, cope chips with aria-pressed, + Mine /
  Edit), "I gave in"; after an outcome `app.urgeNote` asks one line (`urgeNoteHtml`, Enter saves);
  log entries take `date`/`hour` from the round's start (`urgeStarted`), `t` from the tap; the cap
  counts that day (`urgesOn`, `urgePays`); the over card says when it started once LATE_MS has passed;
  after a lapse it also offers "Tapped by mistake? Undo": state.js `undoLapse()` takes that latest
  entry off the log and puts back the urge it ended (`app.urgeUndo`, in memory only; never a
  ridden-out urge, never while another runs);
  the start phase shows the patterns and **Last urges** (`app.urgeHistory`: how many shown, 8 at a
  time with "N more", focus on the first added; each with a Note button: `urge-note-edit` opens the
  same box on that entry, its line above and its note in it; saved empty, the note is removed). Tests:
  `tests/urges.test.js` (details, outcomes and the cap, notes, copes, documents with hostile input,
  patterns with exact wording, the suggestion, the screen, inert hostile text); checked end to end
  in Chromium (details → lapse → note → history → reload).
- **VITALS readings + urge decoder messages (2026-10-12, owner's "OPUS ULTRA CODE" prompt):**
  `js/insight.js`, pure and read-only (no new data, no migration, no XP: tested that the state is
  byte-identical after every call and that an edit after logging still pays nothing). `readings()`
  only for today's *logged* check-in (an unlogged entry holds the last one's levels); earlier
  check-ins with a level that isn't a number are left out for that level, never read as 0. Lines in
  `LINES` (sleep/energy/mood ≤ 3, tension/hunger ≥ 7, craving ≥ 6). STATUS: the two levels furthest
  past their line or at their lowest/highest in up to 14 check-ins (needs 4 before), else "steady"
  (each within 1 of its 7-check-in average), else "nothing past its line". TREND: the best scored of
  run (3+ check-ins one way, ≥ 2 in all, within 10 days), avg (|today − avg of up to 7| ≥ 2, needs 4;
  dropped for a level STATUS flagged), last (≤ 3 days back, change ≥ 2), back after ≥ 3 days, regular
  (≥ 5 of 7 days), urges this week vs last. PRIORITY: furthest past its line, +1 when its run goes
  the bad way, +0.5 for craving (first among equals); ACTION one step for it (craving → a `goto-urge`
  "Decoder" button). PATTERN (`LINKS`): mean craving on matching days vs the others, shown only when
  today matches, ≥ 3 entries each side and a difference ≥ 1.5, ending "a link, not a cause". The
  phrasing is picked by the VITALS day number (`pick()`), so it changes daily; the numbers don't.
  `fieldReport()` dropped its "Sleep low. Craving high." (STATUS says it now).
  Urge decoder: `urgeMessages()` = context lines first (today's logged check-in: sleep ≤ 3 unless
  TIRED, hunger ≥ 7 unless HUNGRY, tension ≥ 7 unless ANGRY, as questions; round ≥ 2; same need
  ridden out before, with the last one's rounds and when, else the total; 22:00–4:00; WHY = clean day
  + next milestone + best run) then `POOL` (DECODER, REALITY CHECK, DIRECT, INNER DIALOGUE, STRATEGY;
  need-specific entries `{NEED: text}`) interleaved in `ORDER[need]`, starting at `seed % n`
  (`seed` = urges logged + the start minute), deduplicated. vitals.js shows
  `said[app.urgeAngle % said.length]` in `.urge-angle` (aria-live), "Another angle" (`urge-angle`)
  increments it; `urge-start` / `urge-again` reset it to 0 (session only, not saved). At zero:
  `urgeReflection()` (REFLECTION; after 2+ rounds it asks what changed). After a lapse logged today:
  `resetLine()` on the streak card and `urgeHint()` on the decoder pick different lines (no blame
  words, tested); otherwise `urgeHint()` is the sleep ≤ 3 or hunger ≥ 7 line, or nothing. No AI call:
  everything is local text. Tested in `tests/insight.test.js`; checked in Chromium at 390 and 320 px.
- **Own streaks (2026-10-13, owner: a private streak named in the app, same XP as chem-free, not on
  the boot):** `state.streaks` = `[{id, name, cleanSince, best, totalClean, claimed, lapses}]`
  (≤ `STREAKS_MAX` 10, name ≤ `STREAK_NAME_MAX` 24). The owner types the name: it must never be
  written in the code, tests or docs (public repo), like the N/T counters' meaning. state.js: the
  chem-free functions take an optional streak id (`cleanDay(id)`, `cleanFullDays`, `cleanTotal`,
  `cleanBest`, `nextCleanMilestone`, `setCleanStart(date, id)`, `logLapse(id)`; no id = `chems`,
  so every older caller is unchanged), `streakById`, `addStreak(name, date)`, `renameStreak`,
  `removeStreak` (the XP and history stay), `lapsedToday()` (any streak). `claimCleanMilestones()`
  pays chems (`CLEAN_MILESTONE`) then each own streak (`STREAK_MILESTONE`, data `{streak, name,
  days}`, same `CLEAN_MILESTONES` XP) and returns `name` for those; events.js passes it to
  `R.showMilestone(days, name)` (the banner's name set as text). migrate: `streaks` → `[]`;
  sanitize: `streakRun()` shared with chems, ids safe and unique, "Streak" for an empty name.
  vitals.js: `ownStreaksHtml()` after the chem-free card (the "streak" block of `order()`, first
  when any streak's milestone is tomorrow), `runHtml(id)` shared with the chem-free card, form
  `app.ownForm` ('new' or an id), questions `app.ownConfirm` ({id, what: lapse|remove}); actions
  `own-*` refuse a tap without a streak id (never the chem-free one). insight.js: a WHY line per
  own streak under way; `resetLine()` always 4 lines, so the decoder (shift 1), the chem-free card
  (0) and an own card (2) differ. Not in boot.js, `fieldReport()` or STATUS (owner's choice).
  Tested in `tests/ownstreaks.test.js`; checked in Chromium at 390 and 320 px.
- **MAP globe (2026-10-15, owner: "comme Google Earth 3D... un globe", amber look kept, "voir les
  différents océans"):** `data/map-style.json` `"projection": {"type": "globe"}` (MapLibre's preset:
  vertical-perspective until zoom 11, mercator at 12) and `"sky": {"atmosphere-blend": 0}` (MapLibre's
  default atmosphere is blue; fog.js draws an amber one). The last style layers, from `ST.fog.BEFORE`
  ('sea'), are drawn over the fog: `sea` (water class ocean, same colour as `water`), `label-sea`
  (water_name ocean/sea; `label-water` keeps the others under the fog) and `label-continent` (maxzoom
  3). map.js adds the fog and `routes.attach(map, before)` the routes' lines before it. The fog's
  composite pass keeps MapLibre's depth test on (the opaque `sea` layer, drawn earlier in the opaque
  pass, occludes it) — it used to disable it when it was the top layer.
  fog.js globe path, when `globeOf(args)` (custom-layer args: `shaderData.variantName==='globe'` and
  `defaultProjectionData.projectionTransition>0`; `tileMercatorCoords` is [0,0,1,1], so positions are
  0-1 world coords): programs compiled lazily from `shaderData.define + vertexShaderPrelude`
  (`projectTile(p)`, poles as y = -32768 / 32767 with `projectTile(p, p)`), uniforms from
  `setProjection()`. Mask: regions = same stencil fan + their box as a 16x16 grid (`gridBox`);
  circles/routes as quads on the 0-1 world relative to the view centre (`globeCircle`,
  `routeOnGlobe`; px per world unit = `globePxPerUnit`, MapLibre's radius worldSize/2pi/cos(centre
  lat)); MapLibre's clipping plane hides the far side. Clouds: `globeMesh` (96x64 + pole rows) below
  zoom 5, a 24x24 grid over the view from 5 (`viewPatch`, so triangles stay small); noise read
  triplanar on the sphere (`sphereNoiseScale`, level ≥ 3 so far out the clouds turn with the globe),
  mixed into the flat path's noise (same `layer()`, from `v_px` = where the flat map puts the point)
  by `flatNoise(zoom)` 5→8, so at the hand-over (zoom 12, `globeOf` turns null and the flat path
  runs) nothing jumps (checked frame by frame at 11.97–12.03). `CLOUD_GLSL` (layer + shade) shared
  by both cloud shaders. Composite: `u_globe` = `globeOutline()` (pitch 0: centred; radius from the
  camera distance d = 1 + cameraToCenter/R) → amber glow + still stars outside the limb, scaled by
  the transition. radar.js: `inSight()` (fog `facing()` > horizon) drops cities behind the globe.
  Tested in fog/map/radar tests; checked in Chromium (SwiftShader) with mock OpenMapTiles tiles made
  from Natural Earth (the sandbox can't reach OpenFreeMap): globe, Manitoba/cities/route revealed,
  poles, the date line, Casablanca's coast up close. Not checked on a phone GPU or with real tiles.
- **Skill sources (2026-10-10, a Grok render.js the owner sent):** STATUS skills are buttons
  (`data-action="skill"` toggles `app.skillOpen`, events.js); open: Earned / Coming from state.js
  `skillSources(key)` (mains/side by their skillGains and done/completed, books, and history events with
  `data.skills` other than QUEST_COMPLETED/BOOK_READ, so nothing counts twice). The −/+ steppers are gone.
  award() adds `data.skills` ('KNOWLEDGE:3,FINANCE:1', after perks) to each event that gave skill points;
  it fits eventData (strings ≤200, ≤8 keys), so no migration. Not taken from that file: its
  `syncMorningLock()` (vitals.js `markTab()` already locks, and respects the setting), its `<div>`s
  inside a `<button>`, and its history parsing of a `data.skills` that award() didn't write yet.
  Tested in `tests/skills.test.js`.
- QUESTS: several main quests (types **percent** slider, **streak** daily check-in, **caps** goal
  that follows the wallet; a percent or caps quest at 100% shows a **COMPLETE QUEST** button and only
  its tap pays, `mainReady()`), bonus objectives, side quests (XP + one skill +3)
  and daily quests (XP), quest names
  (tap to rename), completion animation + banners, confirmations before removing.
- ITEMS: categories SELL ("THINGS TO SELL", price + Sold → CASH + 25 XP + journal line), APPAREL,
  AID, MISC, IMPORTANT (WEAPONS migrated to MISC); move between categories; wallet holdings with
  manual CAD rates, **1000 CAD = 1 Cap**; 3D wireframe model per category. **BOOKS** (owner's request
  2026-09-26): `state.books`, `readBook()` → award('BOOK_READ', +50 XP, one skill +1..+5, owner's choice),
  paid once when added; removing a book keeps what it gave; folded form (`addFormHtml`, kind 'book').
  Bookworm (5 books) replaced Road Warrior (1,000 km of routes) on the shelf: the owner wanted to stay
  at 16 and drop the least well drawn; sanitize drops an old 'roadwarrior' find (its XP stays).
- MAP: see architecture; DISCOVERED banner + XP once per place (50 city / 100 region). Routes
  (road trips between nearby cities; the owner picks the stops, never auto-linked; no XP).
  City diamonds and pin dots are DOM markers sized by zoom: `places.js markerScale()` (0.4 at zoom ≤3,
  1 at 9 ≈ the Montréal opening view, 1.2 at ≥14) → one `--mk-scale` CSS variable on the map, set by
  map.js `scaleMarks()` on `zoom`; the 44 px tap area never shrinks; the open place keeps ≥1.
- LOG: journal → proposal (XP + skills only, never SPECIAL) → Accept/Reject.
- Look & feel: CRT vignette/flicker, scanlines, bezel with rounded corners (+ screws ≥600px), glass
  glare, physical tab keys, recessed panels, faint "PIBBOY 3000" plate, animated mascot (the
  owner's own cartoon since 2026-09-27; stepped Vault-Boy-style gestures per tab; MAP = "scout"),
  tab swing transition, 3D tilt (opt-in).
  **Vault Boy on the level bar (2026-10-10):** PR #20 put the owner's 5 colour PNGs (outfits by level)
  on the XP bar as one sliding picture; the owner found it "franchement nul": they wanted the old
  mascot's animations, touch and colour, on the bar, ~100px, from level 1, never over the text. Now:
  `tools/vaultboy-parts.py` turns each colour source (`images/vaultboy/lvlXX.png`, 308×420, scaled
  from 770×1050) amber with the old mascot's palette (one tone curve from lvl05's brightness spread to
  images/mascot.png's, then its colour for each brightness), clears background left inside the outline
  (HOLES: the arm's crook at 50) and cuts it into the old rig's 8 cells (`parts-lvlXX.png`, ~100 KB):
  same pose, so one set of JOINTS for all; where the legs start differs (LEGS_TOP: under the hand,
  the bag at 20, the jacket flaps at 50); blink = the head unchanged behind sunglasses (10, 20).
  `tools/vaultboy-moves.py` writes one 11 s loop between its markers in the CSS: wind-up, 6 quick
  steps of 0.28 s, brake, look around, thumbs-up, card spin, back, the same; breathing and blink reuse
  the old `mascotBreathe` / `mascotBlink`. **A real walk (2026-10-11, owner: "un Vault Boy qui marche
  réellement sur une jauge de niveau en 3D … pieds qui restent en contact avec la surface. Pas de
  glissade"):** the earlier versions keyed leg angles by hand and slid the picture along; measured,
  the boots slid, sank up to 1.8px into the gauge, and the legs made unequal steps (a limp: 0.21 vs
  0.09 frame heights), because the outfits' legs are drawn at different angles. Now the tool works
  out where each boot goes (one planted, the other swinging forward in an arc 3.8px up, equal steps,
  even speed, a small bob), then each rig's leg angles from it by inverse kinematics (`reach()`;
  separate keyframes vbLegF… for the outfits; the original's vbLegFOld… are gone since he walks with
  drawings, below), then reads its own
  keyframes back (`planted()`: each leg turned at knee and hip, the body down by y, .vb-move's lean
  and squash) to make vbTrack (x: the boot with the weight stays put) and vbBody (y: the lower boot on
  its lane), and asserts the boot with the weight is never more than 0.2% of his height above the
  gauge (actual: 0.00% for both). `--vb-span` (0.68 / 0.58 frame heights: 68px) is how far he goes;
  placeWalker shortens his steps with `--vb-swing` (legs and track scale together) only when the
  free stretch is shorter (under ~390px wide; there the boots can be up to ~1px off). The CSS is
  ~290 KB (39 KB gzipped), mostly the leg keyframes. **The 3D gauge:** `.xp-gauge` wraps `.xp-top`
  (a plane `perspective(240px) rotateX(65deg)` above the bar, ~10px deep, its far edge shorter so the
  ends slope like bevels, showing the fill too: `#hdr-xp-top`) and `.xp-bar-outer` (the front face,
  lit top edge, shadow); his front boot stands `--vb-lane` (3px) back on the top, the back boot
  higher (drawn further back), a soft shadow under him. **The head cut (same day, owner: "on voit le
  découpage déborder sur le fond"):** both cutting tools now follow the neckline precisely, drop thin
  collar/shoulder slivers from the head cell (`without_slivers`) and fill under the head only between
  the shoulders with the drawing's dark shade (`shadow_under`); the head turns at most ±5°.
  **A drawn walk (same day):** cut-out parts from one front-facing, thumbs-up drawing have hard limits
  (no ankle, so a planted boot pivots up to 43°; the cut shows at a 73° knee; the body faces us while
  walking sideways; only the thumb arm moves). The owner chose drawn poses: a brief (claude.ai
  artifact "Fiche marche Vault Boy") and a black-and-white pose guide (8 stick figures, 2×4) went to
  Gemini ("Nano Banana") with lvl05.png; its sheet is `images/vaultboy/walk-lvl05-source.webp` (2×4
  cells of 500×558, facing right; same head and size in all 8, but the near leg in front in all 8 and
  the arms never swing; the top row's hips sit higher). `tools/vaultboy-walk.py` builds the cycle
  from the bottom row (contact, down, passing, up) plus the same 4 with the two legs' blues exchanged
  (`CYCLES`: a minus sign), evens a greyer jacket, makes the white transparent (keeps it facing
  right, as drawn: see "Which way he walks"), applies the outfits' amber (`amber()` imported from vaultboy-parts.py), scales it to lvl05's height
  (×0.804) with the boots on 411 and the belt over lvl05's, and writes `images/vaultboy/walk-lvl05.png`
  (8 frames of 325×420 then; now 16 with the in-betweens, below). It measures the
  boot that stays on the ground between drawings (`PLANTED`, toes of the boots ≤13px above the lowest)
  into `tools/vaultboy-walk.json`; Gemini's spacing is uneven (its "down" = "contact", its "up" = the
  next contact: −6, +76, +45, +2 px of 420), so where he is at each drawing is halfway (`PLANT` 0.5)
  between an even pace and the boot held exactly (the boot slips ≤17.5 px of 420, ~4px on screen).
  `tools/vaultboy-moves.py` now builds two timelines (`timeline(drawn)`): the parts' one, and a drawn
  one with the same moves at the same moments but `DRAWN_STEPS` = 2 steps (a drawn step is ~28px on
  screen; 2 fit the 69px room of a 390px screen; `--vb-span` 0.559), 9 drawings of 70 ms (the parts'
  pace), longer waits between moves. For tier 05 (`drawn_css()`): `.vb-walk` (a span after
  `.vb-breathe`, inside `.vb-move` so it turns with him; `opacity:0` unless animated, so hidden with
  Reduce Motion) shows the drawings (vbWalk05: its opacity; since 2026-10-22 the strip is a
  `.vb-strip` inside it, `overflow:hidden`, moved a whole drawing at a time by vbStrip05's
  `translateX`, held keyframes: see "Performance"), the
  parts are hidden meanwhile (vbParts05 on `.vb-breathe`), the track moves at each drawing (vbTrack05,
  held), the legs and body don't animate, the move/arm/head use vbMoveDrawn/vbArmDrawn/vbHeadDrawn.
  Other tiers keep the parts' walk until they get drawings: same process (send Gemini the tier's
  lvlXX.png with the brief and pose guide), then add the tier to `CYCLES` and run both tools.
  **Which way he walks (same day, owner: "il ne doit pas marcher vers le côté pouce en l'air, mais
  … où sa main est derrière son dos"):** he leads with the hand on his hip, the thumb behind, so at
  each end of the gauge his thumbs-up points to the middle of the screen, not the edge. As drawn he
  goes right (`RIGHT, LEFT = 1, -1`: .vb-move's scale x), `AHEAD = 1` (his front along the picture's
  x), `LEAD, TRAIL = 'B', 'F'`. The legs keep their names, which are about depth: front = his right,
  near us, on top, its boot on the lower lane (411); back = his left, under the hand, its boot higher
  (401). `reach()` gives CSS angles with the knee to his front; the back leg's knee is drawn bent the
  other way, so it comes round in the wind-up and goes back in the brake. The boot behind stands far
  back as drawn (42.5 px of 420 behind its hip, the leg straight), so: he gets going evenly over the
  wind-up and the first step (with only the wind-up, the boot ahead, which stands until the first
  contact, couldn't stay down), its first step is longer, he slows down evenly in the last step and
  straightens up then (leaning, the straight back leg couldn't reach the gauge); the step length
  comes from `SPAN` (69px each way, so steps of ~13px on screen, were 11.5). Each leg's keyframes
  keep its boot within 0.1px of picture (`simplified_leg()`, thigh and shin at the same moments;
  angle by angle, the planted boot wobbled when the knee came round). The drawn walk faces right
  as Gemini drew it. Tested: while he goes right his scale is 1, left −1 (both rigs and level 5).
  **Smooth seat and knees (same day, owner: "les fesses et les genoux … trop carré, pas assez
  lisse"):** walking, the top of each thigh swung out from under the belt as a striped square
  block (the old `extend_up()` repeated its top row), the knee caps were measured on one side only
  (the old front), and the straight cut at the top of each shin made a step at a bent knee. Now, in
  both cutting tools (`vaultboy-parts.py`, `mascot-parts.py`): `round_end()` gives each thigh a round
  end under the part in front, at the hip (under the body) and at the knee (under the shin): its
  own cross-section swept round the joint, each side out to its edge, outline and shading
  included (where the part starts short of the joint, straight on up first); `hip_slivers()` gives
  the body what a leg has above its hip joint outside that circle (the hip's outline holds still,
  the leg turns under it); the belt's bottom outline (a thin dark run at the top of a leg column)
  stays with the body; the original Vault Boy's legs now start right under the belt and the fist
  (`LEGS_TOP` polyline; a band of trousers used to stay with the body). Each shin sits in a
  `.vb-knee` span in its leg (`index.html`), turned with the thigh, whose `clip-path` (evenodd
  polygon from `knee_css()` in vaultboy-moves.py, `thighF/B` in `RIGS`: the narrowest thigh at the
  knee line, a pixel inside its outline) hides the shin above the knee line where the thigh is:
  the back of a bent knee folds into a V, the front shows the thigh's round end. At rest nothing
  changes (both tools still give back the picture exactly). Tested: the boxes start on the knee
  line, reach the hip, are as wide as the thigh, and never hide the boot while he walks.
  **In-betweens for the drawn walk (2026-10-12, owner: "Fabrique les toi même"):** with Gemini's 8
  drawings a cycle he moved in jumps (14 a second). `tools/vaultboy-walk.py` now makes one drawing
  between each two (`inbetween()`), so 16 a cycle, 8 a step, 35 ms each (`PER_STEP` in
  vaultboy-moves.py; `background-size:1600%` in the tier rule; `walk-lvl05.png` is 16 × 325×420,
  100 KB). How: `legs_of()` splits each source drawing's legs below the belt (fists aside): the near
  leg's light blue and the far leg's dark blue (their thick parts, not the soft outline edges), each
  boot's grey inside (the black outline parts boots that touch; each to the nearest trousers), then
  the outlines grown from those. The joints are measured by hand (`TWEEN_JOINTS`: hip, knee, ankle,
  boot tip for both legs of drawings 5–8; the automatic guess failed on the far leg, half hidden).
  `bent()` moves each pixel of a leg by its bones (thigh, shin, foot, weighted by nearness: a cartoon
  knee, no cut) and by a pelvis bone just above the hips that holds still (no flap or gap under the
  belt); each leg comes from the drawing that shows more of it (where the legs cross, the swinging
  leg comes in front, as in the next drawing); a hidden far thigh is filled in its own blue. The
  in-between stands halfway between the two drawings' places. The tests read the frame count from
  `tools/vaultboy-walk.json`.
  **Swinging arms (2026-10-19, owner tried Grok for a new walk sheet; it drew one pose 8 times, so
  "fais les bras toi-même"):** Gemini's arms never moved. `tools/vaultboy-walk.py` `with_arms()` now
  swings them on every frame of the strip (drawn and in-between), after the steps are measured: the
  chest is drawn almost from the front, an arm each side, so each arm swings on its own side, in
  turn with the steps (phase k/16: the front arm hangs along the body at frame 0, the back one is
  out behind; half a cycle later the other way round). `ARMS[tier]`: each arm's zone (cut from the
  chest along the shoulder and armpit, `cut`, which holds still so no gap opens), `shoulder`, and
  `down` (the shoulder-to-wrist direction when hanging; the turn is down minus the drawn angle,
  measured per drawing, so the four drawings' slightly different arms all end alike). `swung()` is
  `bent()` with the arm's bones (shoulder-wrist, wrist-fist); the back arm goes under the body, the
  front one over it, composited with alpha after `transparent()` (else the gap an arm closes against
  the hip stayed white). `walk-lvl05.png` 100 → 143 KB. Checked frame by frame in the app.
  **The turn (2026-10-19, owner's sheets from Gemini with guide-turn stick figures):**
  `images/vaultboy/turn-lvl05-source.webp`: 7 drawings in a row of 264 px, each on white, picked
  from the owner's two 4×3 Gemini sheets (cells counted row by row from 0; the second sheet is the
  first one cleaned up): sheet 2 cells 2, 3 (three-quarters, then a hand on his hip), sheet 1 cell 4
  and sheet 2 cell 6 (front), sheet 1 cells 6 (the other hand raised) and 9 (its fist), sheet 2
  cell 11 (thumbs-up). Left out: the winks (sheet 1 cells 3 and 11), the side views (sheet 2 cells
  0, 1: he walks in three-quarters, so turning through the side view sent his head there and back),
  sheet 1 cell 10 (the thumb by his shoulder: its other hand hangs instead of staying on the hip, a
  flicker) and the repeated poses. Sheet 1's black grid lines were whitened and each figure cut out
  as its whole outline (the thumbs-up's hand crosses into the next cell), by a one-off script, not
  in the repo. History: 4 drawings at 70 ms were too fast, at 140 ms not smooth; 8 at 87.5 ms (PR
  #35, with the side views) "c'est bon mais meilleur". `vaultboy-walk.py` `TURNS` appends them to
  `walk-lvl05.png` after the 16 walk drawings (`turn: 7` in the JSON): each made transparent
  (`crooks_cleared()` also clears white left inside the outline below his face, `FACE`: an arm's
  crook; the eyes and teeth stay), then placed by his head (`skull()`: the middle of the widest run
  of him in his forehead rows, a raised fist being narrower, and the top of his hair): its middle
  and top go evenly (u = (i+1)/7) from the walk's last drawing to lvl05.png's (the parts' rest
  pose), boots on GROUND, so the thumbs-up stands where the parts' does. (Placed by the belt, as in
  PR #35, his head jumped ~18 px of 420 between three-quarters and front: the belt's middle moves as
  the body turns.) `vaultboy-moves.py`: a drawn walk starts with the turn backwards and ends with it
  forwards; `TURN_BEATS` (3, 2, 2, 3, 2, 3, 3) FRAMEs each, 0.63 s: longer on the first (settling
  from the walk), the front view and the fist (the beat before the thumbs-up). `TURN_TIME` is taken
  off the drawn timeline's pauses before the look and the thumbs-up (`wait`, may be a little
  negative: those pauses must stay 0.15 s or more). The drawings breathe like the parts (`BREATHE`:
  `mascotBreathe` on `.vb-walk` too, from the same point on the page, `transform-origin` worked out
  per tier): the parts were up to 2.5% taller than the last drawing when they took over.
  `background-size` and positions count all `frames + turn`. Mirrored with .vb-move when he goes
  left, like the walk. Tests: the strip's size, the shown order per walk (turn back, 16 + landing,
  turn), each turn drawing's time (`TURN_BEATS` ±2 ms, 0.6 s or more in all) and the breathing's
  origin.
  **The cut-out (2026-10-19 evening, owner: "le truc mal découpé quand le perso marche… pas juste
  des taches, l'image est mal découpée en tant que tel, arrange-moi le perso, tout autour de
  lui"):** four faults, all fixed in `vaultboy-walk.py`: (1) the soft edge between his black outline
  and the white page (light grey) stayed opaque and the amber lit it into a pale dotted rim:
  `matted()` turns it into the outline's dark, see-through as it was white (`INK`, `PAPER`, at most
  `SOFT` px in from the clear ground, the outline stopping the way in); (2) Pillow's FASTOCTREE RGBA
  quantizer made his whole inside alpha 254 and speckled the rim: `paletted()` writes the PNG's
  palette itself (clear; `EDGE_TONES` × `EDGE_LEVELS` edge entries, the fainter half the outline's
  dark; `AMBERS` solid ambers): 263 → 346 KB, for clean edges; (3) the swinging arms (and the
  in-between legs) drew their soft edge over the body where they meet, a dark seam down the
  sleeve: `swung()`/`bent()` keep that ring only on the page side; (4) the swapped legs' blues were
  exchanged pixel by pixel by saturation, leaving a light line along the swapped leg's outline:
  `drawing()` now shifts each leg as a whole (`legs_of()`), weighted by how much of a pixel is
  trouser rather than ink. Test: `the drawn walk and turn are cleanly cut out` decodes the PNG
  (palette or RGBA) and checks that his rim is never pale (≤ 0.1%; it was 1.9%) and his inside is
  solid (≤ 1% see-through; it was 99.5% at alpha 254). The parts (rest pose, levels 10+) were already
  clean (cut from the owner's transparent PNGs).
  **Levels 1-4 walk with the drawings too (same day; the owner is level 2: "revoir tout le taff et
  refaire en mieux"):** the original Vault Boy is the same man in the same suit, so tier '00' borrows
  level 5's drawings (`BORROW` in vaultboy-moves.py): `drawn_css()` fits them to his frame (288×408,
  117px high) at their size on the page (k = (100/420)/(117/408) ≈ 0.83 of his px a drawing px), their
  ground on his front sole (393), their belt's middle (`belt` in vaultboy-walk.json, 184, measured on
  the strip) over his (163.5, measured on mascot.png); his own track (`vbTrack00`: level 5's × 100/117),
  level 5's drawings, parts switch and timing (`vbWalk05`, `vbParts05`, vbMoveDrawn…). The original's
  walk in parts is gone (the `Old` rig, vbTrackOld/vbBodyOld/vbLeg…Old, his knee boxes): the CSS went
  from 291 to 234 KB. Only the outfits from level 10 still walk in parts (their sunglasses, bag or
  jacket aren't in the drawings). Tested: as tall on the page as level 5, ground on his `--vb-feet`,
  belt over his, the same distance on the page at every key.
  Markup: `#vaultboy-walk > .vb-track > .vb-move > .vb-body > .vb-breathe > .vb` parts, right after
  `.xp-gauge`; boots on the gauge's top (`margin-top: -14px - --vb-lane - --vb-feet` of the 100px
  frame, `--vb-feet` = the front sole, 411/420; 84px under 360px). render.js: `walkerTier(level)`
  ('00' for 1-4, then 05/10/20/30/50), `syncWalker()` (end of `renderHeader()`) sets `data-tier` only on a
  new tier, `placeWalker()` (rAF after each header render, on resize and when fonts are ready)
  measures the text as high as him (`.hero-name`, `.hero-sub`, `.level-row > *`, by Range) and sets
  `--vb-from`, `--vb-len` and `--vb-swing` (his walk in the middle of the stretch 10px right of the
  text, at most 150px). Reduced Motion:
  still in the middle of his stretch. Levels 1-4 (2026-10-11, owner reached level 5 and saw no
  change, since lvl05 showed from level 1): tier '00' is the original Vault Boy on the bar, the old
  mascot's `images/mascot-parts.png` with the `.mp-*` joints copied onto `.vaultboy[data-tier="00"]
  .vb-*`, his own frame (`--vb-ratio` 144:204, `--vb-feet` 0.9632) 117px high so he stands as tall
  as the outfits (98px under 360px); placeWalker reads the track's real width. The old corner mascot stays `display:none`; tests in
  `tests/vaultboy.test.js` (the drawn walk: markup, tier-05 rules, drawings in order, parts or drawings
  never both, never a step back; tiers, data-tier, placement with a fake layout, sheets, joints vs the
  tool, the loop, reduced motion, the gauge; and a replay of the CSS walk in JS, every millisecond,
  for both rigs: a boot always on its lane and still within 0.25px, none sinking over 0.1px, never a
  step back, the swinging boot lifting, the distance = `--vb-span`).
  **Mascot rig (2026-09-28, owner: "animate him like the Pip-Boy in Fallout 4"):** the picture is cut
  by `tools/mascot-parts.py` into `images/mascot-parts.png` (8 picture-sized cells: back leg, its
  lower leg, front leg, its lower leg, thumb arm, body, head, head with eyes shut). `index.html` stacks
  them as full-size `.mp` layers (background-size 800%), each lower leg nested in its leg so it turns
  with the hip and bends again at the knee (added 2026-09-28, owner: "legs works"; each upper leg
  carries a hidden round, outlined knee under its lower leg so a bend shows no gap); each turns
  around its joint (`transform-origin` = the tool's `JOINTS`, as % of 144×204). Each move = one
  `.mascot-move` keyframe (where he goes / faces, squash and stretch) + part keyframes of the same
  length (legs −10–16°, knees 0 to −40° (negative = bent, boot back; the swinging knee bends to −38°
  as it passes, the hop tucks both), arm −7–18°, head −10–7°, body bob 1–2 px). **Smooth and
  cartoon-like since 2026-09-30** (owner: "le plus fluide possible, cartoon comme Vault Boy"; before,
  every move jumped between poses with `steps(1,end)`): `tools/mascot-moves.py` writes all the move
  CSS (between "/* Cartoon animation, like Vault Boy" and "/* End of the moves made by
  tools/mascot-moves.py. */") from per-part keys (time, value, easing): a wind-up before each move,
  slow in/out, squash on landing and stretch in the air, overshoot then settle, the head a beat
  late, turns as a flat-card spin (through a thin sliver, never invisible); every move starts and
  ends at rest (tested). Change a move in the tool, never by hand in the CSS. Only the blink stays
  instant (`steps`). Idle: breathing on `.mascot-body`, a slight head/thumb sway, a blink every
  5.3 s; mascot.js picks walk-left / walk-right / thumbs every 10–20 s. At rest the layers rebuild the picture exactly (the tool checks);
  moving parts carry a little of themselves under the part in front, so no hole shows.
  `tests/mascot.test.js` keeps sheet, page, CSS joints and moves in sync. A new picture (same size
  and pose): replace `images/mascot.png`, run the tool, check the cut lines.
- Sounds: boot, tick (scroll/slider), press, tab, complete, levelUp, quest, discover, sold, error,
  step (skill ±), mapSelect; power-on screen; Settings panel (⚙ in the topbar): 3D tilt, Power-on, Sound, Custom sounds, backup/import/reset, credits.
- Data safety: dual storage, backups with dated file names (share sheet on phones), a "Last backup"
  Settings line + a once-a-day notice when one is due (`lastBackup`, `backupDue()`), cross-tab conflict
  handling, CSP. RADS meter in the header (`rads()`: 40/day since `lastBackup`, max 1000; tap =
  export = RadAway). Live ONLINE/OFFLINE topbar (main.js). RobCo boot once a day after power-on
  (boot.js, `lines()` tested); weather from Open-Meteo for Montréal (weather.js, CSP + credit in Settings).
  MAP scanner (radar.js): 2D canvas over the map, blips = `candidates()` of the offline city list
  not `covered()` by a revealed place; runs only while on + on screen + app visible.
  Perks (state.js `PERKS`, `takePerk`, effects inside each reward fn: discoverPlace, sellItem,
  payQuest (Scholar), completeDaily/Bonus, `journalXp`, `rewardRoute`, `rewardCheckIn`); chart in
  render.js `perksHtml()`; migration gives old saves level-2 perk points.
  Bobbleheads (state.js `BOBBLEHEADS`, `findBobbleheads()` +50 XP each; `lifetimeDailies` counter):
  checked after every change through `storage.onChange` (events.js `checkBobbleheads`) and once after
  the boot screens (main.js `afterBoot`). Each has its own trophy (render.js `TROPHIES`, by id, on a shared
  `TROPHY_STAND`; the owner found the old smiley figure ugly), shown on the shelf and in the FOUND
  banner. Drawn in detail on a 48×60 grid (DA pass, 2026-09-26): main lines plus classes `f` (faint
  volume), `d` (fine details), `t` (thick teeth), `g` (glint, `--glint`), `solid`, `hole`; no nested
  <g> (the render test reads each trophy's group). The owner saw a DA proposal page and chose only the
  detailed trophies and the section titles / folded add forms (QUESTS `addFormHtml`, `app.addOpen`);
  declined for now: icons for S.P.E.C.I.A.L. and skills, a vault-door level emblem instead of the mascot. Render test allows only the app's own icon <svg>s.
  Holotapes (holotapes.js): MediaRecorder (audio/mp4 on iPhone), recordings in IndexedDB
  `status_terminal_holotapes` (NOT in state/backups; Share per tape), state keeps `lifetimeHolotapes`;
  CSP `media-src 'self' blob:` for playback.
- PWA: installable, offline (fonts local, city list precached).

- **Performance (2026-10-22, owner: "optimise mon application comme un pro"):** measured in
  Chromium with the processor slowed 4× (a mid-range phone), `tools/perf-check.js` (needs a local
  server and Playwright; it prints the opening's busy time and each tab's cost sitting still).
  Found and fixed: (1) the drawn walk's strip moved by `background-position` (held keyframes): the
  browser redid the style 60 times a second on every tab, 232 ms of each second (a quarter of a
  phone's processor) even with nothing moving; now `.vb-walk` holds a `.vb-strip` (23 frames wide,
  `will-change:transform`) that `vbStrip05` moves by `translateX(-k/N·100%)`, and `vbWalk05` only
  switches the opacity (4 keyframes): 5 ms/s. Every other walker animation was already a transform
  or an opacity (var() inside a transform still runs on the GPU). (2) The XP gauge's two fills and the
  rad meter grew by a `width` transition at every open (1.4 s: a layout each frame): now
  `transform:scaleX()` from the left, the same picture. (3) Forced layouts at boot: `sfx.init` read
  `scrollY` (now known from the first scroll), `syncWalker` hid/showed the walker to restart its
  animations even on its first show, and asked `document.fonts.ready` mid-render (now in
  `placeWalker`, in the frame callback). (4) The two fonts are preloaded (`<link rel="preload"
  as="font" crossorigin>`): in at 0.64 s instead of 1.24 s on a 300 ms connection, before the first
  paint, so the text no longer jumps. Opening, first 4 s: busy 1356 → 509 ms, style 523 → 64 ms.
  `tests/perf.test.js` keeps the rules: whatever loops animates only transform/opacity, no width
  transition, fonts preloaded (and cached by sw.js). Done 2026-10-22 (owner's yes): cache-first opens
  with whole versions installed in the background (see "Instant open" below). Still to decide: the MAP's clouds
  drift at 30 frames a second while the map is still, and ITEMS copies a WebGL picture into each
  model's canvas at 30 fps (`drawImage`): both cost GPU time on a phone, not measurable here
  (headless Chromium draws WebGL on the processor).

## 4. Important design decisions

1. **Personal use only**: no multi-user, onboarding or generic features.
2. **Never lose data**: dual storage, migrations, sanitize everything, tests for each format.
3. **No copyrighted assets in the repo** (it is public): built-in sounds are synthesized; the owner's
   genuine Fallout clips live only on their devices (IndexedDB / sound pack). Never commit audio,
   video or `pibboy-sound-pack*.json` (`.gitignore` covers `*.mp3`, `*.mp4`, packs).
4. **No paid services**: no Vercel, no OpenAI key (GitHub Models was retired 2026-07-30).
5. Decorations are optional modules guarded with `if (ST.x)` and never block taps
   (`pointer-events:none`); everything respects `prefers-reduced-motion` and stops in background.
6. Heavy libraries (MapLibre, Three.js) are vendored, pinned, and loaded only when their tab opens.
7. Plain scripts rather than ES modules so the app still runs from `file://`.
8. S.P.E.C.I.A.L. keeps its 5 stats: **no LUK** (the owner doesn't believe in luck); PER only if the
   owner asks (maybe later). Stats go up by level-up points and, since 2026-10-09 (the owner's own
   design), by training: stat-tagged dailies, the VITALS check-in and TRIALS, 300 XP a point. Skills come from Analyze, books, urges and quests' `skillGains` (the −/+ buttons were removed
   2026-10-10; award() now records each reward's skill points in the event, `data.skills`):
   main quests, and **side quests** (+3 of one skill, `SIDE_SKILL_GAIN`, paid once by
   `completeSide()`; s1–s4 got theirs by migration). **Daily quests give XP only** (owner's choice
   2026-09-24: +1/day would max skills in months).
9. **No big reward without a deliberate tap** (audit, 2026-09-25): there is no undo, so a main quest
   never completes from a slider slip or a wallet typo (the Complete button), and a backup export runs
   one at a time (a double tap on iPhone used to be able to drain the rads with no file saved).
   Holotapes and custom sounds are not in backups nor erased by Reset, and the UI says so.
10. **Personal content stays out of the public repo**: the code holds generic features; the owner's own
   habits, health notes and quests live only in their data (on the phone, in backups).
11. **What loops moves only transform or opacity** (the GPU plays those; anything else is redone by
   the processor every frame): `tests/perf.test.js`. Measure a change with `tools/perf-check.js`.
12. **The Vault Boy: everything the owner asked for** (2026-10-19, owner: "double check tout ce que je
   t'ai dit sur le Vault Boy pour que ça ne se reproduise pas"). After any change to him, check each
   one in the app, at level 2 (the owner's level: the original outfit with level 5's drawings) and
   level 5, before pushing:
   - The amber look, the same colour and feel as the first mascot (2026-10-10).
   - A clean cut-out all round him: no pale or dotted rim, no seam, no spots (2026-10-19; test
     "cleanly cut out").
   - The hand on his hip shows; the thumbs-up fist sits well (2026-09-28). Sharp on the phone.
   - His outfit follows the level (00/05/10/20/30/50, never past 50), and levels 1-4 walk with
     drawings too.
   - He really walks on the 3D gauge: boots planted, no sliding, arms and legs in turn (2026-10-11);
     drawn poses rather than CSS tricks ("les poses dessinées c mieux"), in-betweens made by us.
   - He walks toward the hand on his hip, not the thumbs-up side (2026-10-11).
   - Hips and knees smooth, never square (2026-10-11).
   - Fluid and cartoon-like, like Fallout's Vault Boy (2026-09-30); precise, even moves (2026-10-11:
     "il marche comme un infirme" was a bug).
   - The turn: 0.6 s or more, enough drawings to be smooth, no head jump, and the parts take over
     without a pop (2026-10-19).
   - Taps go through him; Reduce Motion: he stands still, centred; he never covers the name or level.
   - Run `node tools/stamp-sw.js` with every change, or the phone keeps the old one ("je ne vois aucun
     changement", 2026-10-11); the tests fail until it's done.

## 5. Workflow

- Working copy: `C:\Users\ibra6\Desktop\PIBBOY` (git remote `origin`, credentials in Git Credential
  Manager). Node v24 at `C:\Program Files\nodejs`. Git at `C:\Program Files\Git\cmd`.
- Each change: edit → `node --test` → browser check → on a **feature branch**, commit (with the
  Co-Authored-By line) → push → open a PR with GitHub CLI (`C:Program FilesGitHub CLIgh.exe`,
  installed 2026-09-25, owner signed in) → the owner merges it on GitHub (= deploy to Pages in ~1 min)
  → `git checkout main && git pull`. PRs #8 (bobbleheads + holotapes), #9 (event core), #10 (settings),
  #11 (safety fixes), #12 (trophies), #13 (map marks), #14 (DA) were done this way. Earlier features were pushed straight to main.
- The working copy now has CRLF line endings (git autocrlf after pulls): scripted text edits must
  normalize `
` first (the Edit tool is fine).
- `node tools/stamp-sw.js` after any app file change (tests check VERSION); add new app files to `APP_SHELL`.
- Raise `DATA_SCHEMA` (js/state.js) when a version saves fields an older one would drop.
- Code the owner brings from other AIs (Grok, ChatGPT): diff it against the repo, test it, and take
  only the good parts; never paste whole files over newer ones. Grok's first `sw.js` broke opening
  offline (fixed before merging); its later "places worker" and "PER/LUK + quest skillGains" passes
  weren't merged as files (the owner declined PER/LUK and daily skill gains; side-quest skill gains
  were rewritten here, see decision 8).
- Local-only, never pushed: `.claude/` (test server `serve.ps1` on port 8766 with a PUT helper that
  saves to `.claude/out/`; copies of the source video/mp3), `PIBBOY-upload.zip`, `.env.example`
  (excluded via `.git/info/exclude`). The owner's sound pack is at `Desktop\pibboy-sound-pack.json`
  (boot = video #1, tab = #23, mapSelect = #17, step = #16, levelUp = full New Vegas music 12.79 s).
- Preview-pane caveats: service-worker registration fails on the PowerShell test server, and the
  mobile emulation renders tiny when the pane is small; verify with DOM checks instead.

## 6. Known bugs / limitations

- Caps linking regex only matches English objectives ("Obtain/Get/Reach/Earn/Have/Save N Caps"); a
  French objective ("Obtenir 5 caps") is not auto-converted (on purpose: opt-in plan in §8 step 3).
- Scroll ticks only follow window scrolling (not inner scroll areas such as the custom-sounds panel).
- An update shows after the app has been in the background once (or at an open where it's already
  downloaded and nothing was touched), not on the open that downloads it. The very first deploy of
  the cache-first worker comes through the old network-first one (checked in Chromium: data kept).
- Versions deployed before `DATA_SCHEMA` don't check it: one of them left open in a second tab during
  the first deploy of 2026-10-22 could still save over new fields; from then on, older code stops.
- The MAP opens on Montréal (`HOME` in `map.js`), not on the whole world.
- Routes need a connection when added (OSRM's public demo server; if it ever goes away, another
  OSRM/Valhalla server with CORS can replace `ROUTER` in `routes.js` and the CSP). Removing a city
  doesn't remove the routes through it.
- 3D models: canvases are small (78×44 CSS px) and weren't reviewed on a real phone yet. After a
  WebGL context loss (iOS, app in the background) they hide until the context is restored, or until
  ITEMS next opens with a new renderer (`makeRenderer`/`renew` in items3d.js; checked in Chromium
  with WEBGL_lose_context, 2026-10-22).
- Custom sounds and 3D tilt choice are per device/origin; on iPhone the Home Screen app and Safari
  have separate storage.

## 7. Pending / waiting on the owner

- **Agreed pause (2026-09-25):** the owner uses the app for a week (first RadAway backup, real data:
  wallet, routes, dailies, perks) and keeps a list of what bothers him on the iPhone. Next work comes
  from that list, not new features. Never seen on a real iPhone yet: ITEMS 3D models, the radar, the
  perk chart, holotape recording (real microphone), the RobCo boot, the Settings panel.
- After the feedback, one small step at a time; top candidate: a weekly summary (`historySummary(7)`)
  as a line in the RobCo boot. Then, if wanted, event-driven quest objectives.
- The owner brings prompts from ChatGPT/Grok: review them against the code and keep only what fits
  (ChatGPT's 8-phase "event OS" rewrite was declined in favour of the light event core, PR #9; a
  forensic "PIBBOY 2.0" audit prompt was answered with a short read-only audit instead, which found
  the data layer solid and led to the `safety-fixes` PR).
- **The mascot** stays: the owner had planned to remove it (2026-09-25), then replaced the Vault Boy
  drawing with their own cartoon (2026-09-27): `images/mascot.png`, same 144×204 canvas, white
  background cut out with soft edges, `transform-origin` moved to the new feet (52% 97%). The hand
  on the hip was too small to read, so a Vault-Boy-style fist was drawn in (2026-09-28, redrawn the
  same day from the owner's close-up of Vault Boy's hand: a round hand tucked under the end of the
  sleeve, and on the outside the curled index finger, a line that splits under the sleeve and curls
  in to a small round tip; colours of the thumb hand). Placed like Vault Boy's: level with the belt
  and a little over the body's edge, not hanging below the belt (the owner's feedback); the old
  hand under it was erased and the body's side line put back. It's part of the body layer. The owner asked about sending drawings of other poses: welcome, if they keep
  the same character, size and framing on a white background (each could become a frame).
  Upscaled the same day so he's sharp on a phone: the owner's original 144×204 JPEG went through
  Real-ESRGAN "realesr-animevideov3" ×4 (the ncnn build from PyPI `realesrgan-ncnn-py`, run on CPU;
  the "x4plus-anime" model changed the face, waifu2x failed on CPU), the background was cut out and
  the fist drawn at ×4, then everything brought down to **288×408** (2×; the box is 54×76 CSS px,
  162×228 device px on an iPhone). `images/mascot-parts.png` is 2304×408, ~82 KB. Mascot
  reactions to rewards were declined; on 2026-09-28 the owner asked for Fallout 4 Pip-Boy-style
  animation, so he's now a rig of moving parts (see §3). Removing him would touch: `index.html`
  (`#mascot`), `js/mascot.js`, `images/mascot*.png`, `tools/mascot-parts.py`, `tests/mascot.test.js`,
  the `.mascot*` / `.mp*` rules and keyframes in `css/terminal.css`,
  `js/tilt.js` (its `mascot` layer), `js/events.js` (`ST.mascot.onTab`), `js/main.js`
  (`ST.mascot.init`), `sw.js` `APP_SHELL`, README/HANDOFF.
- Deferred: "PIBBOY 2.0" roadmap (reward engine, custom skills with XP, weekly/auto quests,
  achievements, dashboard). Owner chose to polish V1 first.

## 8. Exact next engineering steps

0. Next on the event core (owner's call): (done 2026-10-22: places quests, "reveal 5 cities in Morocco",
   `progressType:'places'`, see §3), (done: the weekly summary, `weekSummary()`, on
   STATUS and in the RobCo boot), bobbleheads based on events.

1. Collect the owner's phone feedback and adjust: VITALS insight wording (`PRIORITY`, `ACTION`,
   `POOL` in js/insight.js are plain lists, easy to edit or extend; the thresholds are `LINES`),
   `canvas.item-model` size in `css/terminal.css`, `.crt-glare` opacity, `.device-plate` opacity.
2. (Done: the SETTINGS panel, PR #10.)
3. French caps objectives — owner's answer 2026-10-22: **not yet**; no migration, nothing automatic.
   Safe plan for when it's wanted (opt-in, never silent):
   - No load-time change: `linkCapsQuests()` and its `capsQuestsLinked` flag stay as they are; a
     second automatic link is ruled out (it would overwrite a manual % the owner chose).
   - `CAPS_OBJECTIVE` gains French forms (obtenir|avoir|atteindre|gagner|économiser, "caps" or
     "capsules", decimal comma) but is used only to *offer*: an open percentage quest whose
     objective matches shows "Follow the wallet? (5 CAPS)" and "Keep manual" on its card.
   - "Follow the wallet" (a tap) sets `progressType:'caps'`, `capsTarget`, and keeps the slider's
     value in `manualProgress`; "Back to manual %" on a caps quest restores it. "Keep manual" sets
     `capsOffer:false` so it's never asked again. Both fields go through `sanitizeImported()`
     (`manualProgress` 0-100, `capsOffer` boolean), with a test; old saves need no migrate step.
   - The new-quest form: an objective that reads as a caps amount, with "Percentage" picked, gets a
     hint to pick "Caps goal" (no switch by itself).
   - Never offered on completed quests, streak or places quests. Tests: regex cases (FR/EN, "5,5"),
     a French percent quest unchanged after load/import, conversion only on the tap, revert gives the
     same %, export → import identical.
4. (Done: caps quests re-sync after import, reset and another window's save.)
5. Optional next features the owner showed interest in: STATUS 3D globe with revealed places
   (`SphereGeometry` already in the Three bundle; reuse items3d's shared renderer), Fallout-style
   full-screen LEVEL UP screen.
