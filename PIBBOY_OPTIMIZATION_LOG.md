# PIBBOY optimization log

Newest first. Each entry: what changed, files, tests actually run.

## 2026-10-22 — Instant open (plan task 21, step 2)
- `sw.js`: cache first from `CACHE` = prefix + `VERSION` (hash of APP_SHELL's files); install precaches
  the whole version (`cache:'reload'`), a core file failing keeps the old one; the first version takes
  over at once, a later one waits for `SKIP_WAITING`; region shapes in `status-terminal-data`
  (stale-while-revalidate, kept across versions); activate deletes older versions only.
  `tools/stamp-sw.js` writes VERSION (`--check` to verify). `js/main.js`: `watchUpdates()`,
  `ST.reopen()`; `js/render.js` banner's Reopen uses it. CLAUDE.md/README/HANDOFF updated.
- Tests: `tests/sw.test.js` rewritten (9: VERSION matches the files, install, cache first with no
  network asked, navigation, skipped file, region shapes, activate, waiting/SKIP_WAITING, pass-through);
  `node --test` → 363 pass, 0 fail.
- Chromium, real service worker on a copy of the site: first open controlled; offline reopen with
  data; deploy while in use → waits, old files served, background → reload on the new version, an
  unsaved change kept, old cache deleted; deploy found while away → put in at the next untouched
  open; live v36 (network-first) → this worker: new files on the next open, data kept, put in at the
  next background, v36 cache deleted, offline open works. No page errors.
- Measured (local server, 1.5 s per request): reopen to a usable VITALS 4097/4539/4510 ms (live) →
  87/82/79 ms (new).

## 2026-10-22 — Newer data is never written over by an older version (instant-open, step 1)
- Before cache-first opens (an older cached version can run once after a deploy), and for old tabs
  left open: `js/state.js` `DATA_SCHEMA` (1); `js/storage.js` stamps both copies with it (IndexedDB
  record `schema`, localStorage `status_terminal_schema_v1`). A copy from a higher schema is never
  adopted or overwritten: the window goes read-only (`goStale`), the IndexedDB check refuses the
  write and puts localStorage back to the newer copy; `onNewerVersion` → `render.showNewerVersion()`
  banner with Reopen. Saves without a schema (all before this) read as 0 and load as before.
- Residual risk: versions already deployed (no schema check) can still write over newer fields if
  left open in a tab during this one deploy.
- Tests: `tests/storage.test.js` +4; `node --test` → 359 pass, 0 fail. Chromium: data stamped schema 2
  with an unknown field → reload → banner; a tap → nothing written (field and schema kept); no errors.

## 2026-10-22 — Review since f5087bf; QUESTS country list cached
- Read every app-code change since the last review (state, vitals, insight, events, render, items3d,
  weather, css). One inefficiency: the QUESTS form rebuilt and sorted the 250-country list on every
  QUESTS redraw. `js/render.js` makes it once. Chromium, 50 redraws: 2.38 ms → 1.68 ms each.
- Checked, no change: urge ids (`t`) stay unique per tap; Undo restores the snapshot; places count and
  `mainReady` with a bad target; new 3D canvases while lost are hidden; offline weather shows only a
  recent reading. `node --test` → 355 pass, 0 fail.

## 2026-10-22 — Places quests (plan task 20)
- New main quest type `places` (data model updated; sanitizer validates `placesTarget`, `placesCc`; no
  migrate step: old saves have no such quest). `js/state.js` count/progress/sync; `mainReady` via
  `questProgress`. `js/events.js`: synced after every change and on a new state, the form reads the
  type, count and country. `js/render.js`: the row (`2 / 5 PLACES`), "Follows your MAP, in …", the
  form option with a country list (`Intl.DisplayNames`, English names, code if unsupported).
- Tests: new `tests/placesquest.test.js` (3: sanitize incl. hostile values and idempotence; count by
  country, Complete once, completed left alone; the screen); `node --test` → 355 pass, 0 fail.
  Chromium 360 px: form (Morocco, 2) → Fes + Lyon revealed → 1/2 → Rabat → 2/2, Complete shown → tap
  → +1000 XP → reload: kept completed; first layout squeezed the bar, country moved to the note line.

## 2026-10-22 — Notes on earlier urges (plan task 19)
- `js/vitals.js`: `urgeEntry()`, `urgeLine()` (shared by the list and the box), a Note button per
  urge in Last urges; the note box shows that urge's line, its note (escaped) and Cancel; saving it
  empty removes the note. `css/terminal.css`: list items as a row (text, button). No data change.
- Tests: `tests/urges.test.js` +1, history markup updated; `node --test` → 352 pass, 0 fail. Chromium
  320 px: Note on the older urge → typed → Enter → saved on that one; reopened pre-filled; cleared →
  removed after reload; Note buttons 36 px tall; no sideways scroll; no page errors.

## 2026-10-22 — Urge history paging (plan task 18)
- `js/vitals.js`: `app.urgeHistory` is now how many are shown; "8 more (N older)" adds 8, focus on the
  first added. Checked: the urge clock only rewrites its text each second (no costly redraw); the AI
  journal client holds no key (server-side), falls back to offline rules.
- Tests: `tests/urges.test.js` +1; `node --test` → 351 pass, 0 fail. Chromium: 11 urges → 8 shown,
  "3 more (3 older)" → 11, focus on the 9th, Hide folds; no page errors.

## 2026-10-22 — Backups verified end to end (plan task 17)
- New `tests/roundtrip.test.js`: two weeks of use through the app's functions (check-ins, urges with
  details/notes/lapses and one running, copes, trials incl. a custom one, chem-free and own streak with
  a lapse, dailies, a side quest, a book, the journal, map cities/pins/regions/routes, history) →
  JSON → `sanitizeImported` gives the identical document; a second pass changes nothing;
  `compareBackup` sees nothing lost. Passed first time: the import gate keeps every feature's data.
- Chromium, real controls: taps (pulse, check-in, urge with trigger/cope, lapse, note) → Settings →
  Export (download, 4.8 KB) → a fresh profile → Import → Yes, replace → reload: every top-level key
  identical to the file; no page errors.
- `node --test` → 350 pass, 0 fail.

## 2026-10-22 — Urge intensity anchors (plan task 16)
- `js/vitals.js`: "How strong" says what 0 (unrated) and 10 (extreme) mean, `aria-describedby` like the
  check-in sliders. Tests: `node --test` → 349 pass, 0 fail; Chromium 320/390 px: no wrap, no overflow.

## 2026-10-22 — Urges logged when they happened (plan task 15)
- `js/state.js`: `dayStr()`, `urgesOn()`, `urgeStarted()`, `urgePays()`; `logUrge` takes date and hour
  from the round's start (t stays the tap: the entry's id); the XP cap counts the urge's own day.
  `js/vitals.js`: over for more than an hour, the card says when the round started. No data-shape
  change (same fields, truer values from now on; older entries untouched).
- Tests: `tests/urges.test.js` +1 test (next-morning tap, capped day, lapse mid-round), screen assert,
  history hour updated (21:40 start → 21h); `node --test` → 349 pass, 0 fail. Chromium: urge started
  10 h earlier, reload → "This round started Oct 21 at 22:20", logged 2026-10-21 22h; no page errors.

## 2026-10-22 — Urge decoder uses the trigger (plan task 14)
- `urgeContext().trigger` was collected but unused. `js/insight.js`: `TRIGGER_WORDS`, `TRIGGER_TIPS`
  (one practical step per trigger), messages `ctx-trigger` and `ctx-trigger-past` (counted from the
  log, 2 at least); `pat-trigger` now says how those urges ended; new `pat-strong` (rated 7+ vs 1-6,
  3 each, shown at a 25-point gap). `js/vitals.js`: tapping a trigger shows its step at once.
- Tests: `tests/urges.test.js` +2 tests, pattern wording updated; `node --test` → 348 pass, 0 fail.
  Chromium 360 px, real taps: "People around" → its STRATEGY line replaces the message shown,
  focus stays on the chip; no page errors.

## 2026-10-22 — No stale weather passed off as current (plan task 13)
- `js/weather.js`: offline (or with Open-Meteo failing) the last kept reading was shown in the topbar
  and the boot however old. `STALE_MS` (3 h) and `recent()`: older readings show nothing (the boot
  says NO SIGNAL). Checked too: the fog layer already rebuilds its GL state after a context loss.
- Tests: `tests/boot.test.js` +1 (1 h kept, 3 h gone, button hidden, NO SIGNAL); `node --test` →
  346 pass, 0 fail. Chromium with Open-Meteo blocked: 1 h-old reading shown, 4 h-old hidden.

## 2026-10-22 — ITEMS 3D models survive a GPU context loss (plan task 12)
- `js/items3d.js`: a context loss set `broken` for good (models gone until reload; iOS drops GPU
  contexts of backgrounded apps). Now `lost` hides them, `webglcontextrestored` brings them back,
  and if it's still lost when ITEMS opens, `renew()` makes a new renderer. Only the current
  renderer's events count.
- Also decided: the service worker's mixed-version open (first weak-signal open after a deploy)
  stays as documented; changing the fetch strategy is the cache-first question waiting on the owner.
- Tests: `node --test` → 345 pass, 0 fail (`tests/items3d.test.js` builds the models; the GPU part
  has no unit harness). Chromium (SwiftShader), WEBGL_lose_context: open → drawn; lose → hidden;
  restore → shown and drawing; lose + reopen ITEMS → 2nd context, drawing; no page errors.

## 2026-10-22 — Check-in levels defined (plan task 11)
- The six sliders shared one rule ("0 is none, 10 is maximum"): "mood 0" or "sleep 6" had no stated
  meaning. `js/vitals.js` `SCALE`: anchors under each slider (`.vital-scale`, `aria-describedby`),
  read the way insight.js `LINES` reads them; the fine print says Sleep is last night. No data change.
- Tests: `tests/vitals.test.js` asserts the anchors; `node --test` → 345 pass, 0 fail. Chromium at
  320/360/390 px: no wrapping, no overlap with the slider, no sideways scroll, no page errors.

## 2026-10-22 — Review of the branch since the PR #38 merge
- Read every app-code change of this campaign (state, vitals, insight, events, render, boot).
  One defect: "I gave in" and its Undo didn't redraw STATUS, so "Last 7 days" kept an old
  "given in to" count until another redraw. `js/vitals.js`: both now call `renderStatus()`.
- Checked, no change: default arrays are cloned (`defaultState`, `deepMergeDefaults`); old log
  entries (hour -1, intensity 0, no trigger) stay out of the patterns; a lapse's note is never
  shown back.
- Tests: `node --test` → 345 pass, 0 fail. Chromium, real clicks: STATUS panel appears after the
  lapse and goes after Undo, with no forced redraw; no page errors.

## 2026-10-22 — Your own words back while the timer runs (plan task 10)
- The notes written after urges were stored but never shown again. `js/insight.js`: `lastNote()`,
  `urgeContext().note`, message `ctx-note` (style YOUR WORDS) right after the coping suggestion:
  "After an urge you rode out 3 days ago, you wrote: “…”". Only ridden-out urges; same need first.
- Tests: `tests/urges.test.js` +1 test, hostile note escaped on the running card; `node --test` →
  345 pass, 0 fail. Chromium 360×800, real taps: rode it out → note (Enter) → new urge: the note
  shows first; no page errors.

## 2026-10-22 — Undo a mistaken "I gave in" (plan task 8); French caps on hold (task 9)
- "I gave in" sits next to Cancel: a mis-tap ended the timer and logged a lapse for good.
  `js/state.js`: `undoLapse()` (+ `app.urgeUndo`, not saved); `js/vitals.js`: "Tapped by mistake?
  Undo" in the note prompt after a lapse. No data-shape change.
- Task 9 not done: linking French caps titles again would change quests on the owner's phone
  (manual % overwritten by the wallet). Left for the owner to decide.
- Tests: `tests/urges.test.js` +1 test and screen asserts; `node --test` → 344 pass, 0 fail.
  Chromium 360×800, real clicks: lapse → Undo → urge running with its trigger, log empty; same
  after a reload; no page errors.

## 2026-10-22 — Last 7 days summary (plan task 7); mobile check (task 6)
- Task 6: urge controls and the import comparison at 360 px in Chromium: no sideways scroll, every
  button ≥ 36 px tall, long coping names wrap (checked before this entry; marked done now).
- `js/state.js`: `weekSummary()` (no new data). `js/render.js`: `weekHtml()`, a "Last 7 days" grid
  above Lifetime (hidden when both weeks are empty; the week before in brackets, no minus signs).
  `js/boot.js`: `LAST 7 DAYS... +X XP · N CHECK-INS · N URGES RIDDEN OUT`.
- Tests: new `tests/week.test.js` (2); `node --test` → 343 pass, 0 fail. Chromium 360×800: the panel
  renders after a check-in, an urge given in to and a daily; scrollWidth 360; no page errors.

## 2026-10-22 — Backup import comparison (plan task 5); reward paths reviewed (task 4)
- Task 4: `completeMain/Side/Bonus/Daily`, `logVitals`, `urgeWon` are guarded by their flags and
  covered by existing tests; no change needed.
- `js/state.js`: `stateSummary()`, `compareBackup()`. `js/events.js`: `importQuestion()` shows the
  backup and this phone side by side, warns when the backup is older or would lose XP, check-ins,
  urges, journal entries or places. `css/terminal.css`: `.import-compare`.
- Tests: new `tests/backup.test.js` (3); `node --test` → 341 pass, 0 fail. Chromium: Settings →
  Import with an older real file shows both lines and the warning; nothing replaced; no page errors.

## 2026-10-22 — Urge decoder record (plan tasks 1-3)
- `js/state.js`: urge `active` and log entries gain `intensity`, `trigger`, `copes`; log entries gain
  `outcome`, `note`, `hour`, `t`; `urges.copes` (player's ways). New: `setUrgeDetail`, `urgeLapsed`,
  `noteUrge`, `addCope`, `removeCope`, `copeById`. `urgesToday()` counts only urges ridden out (the
  XP cap). Sanitizer rebuilds every new field (old entries read as ridden out).
- `js/insight.js`: `urgePatterns()`, `bestCope()`; `ctx-cope` suggestion first while the timer runs;
  urge counts in TREND and context use ridden-out urges only.
- `js/vitals.js`: running/over phases show intensity slider, trigger chips, coping chips (+ Mine,
  Edit), "I gave in"; one-line note after an outcome; patterns and "Last urges" on the start card.
- `js/render.js`: STATUS "Urges ridden out" no longer counts lapses.
- `css/terminal.css`: chips, details, note box, patterns, history. `sw.js` cache v37.
- Tests: `node --test` → 338 pass, 0 fail (new `tests/urges.test.js`: 10). Chromium end to end:
  details → "I gave in" → note (Enter) → history → reload: all kept, no page errors.
