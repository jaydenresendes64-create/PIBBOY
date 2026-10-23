# PIBBOY optimization log

Newest first. Each entry: what changed, files, tests actually run.

## 2026-10-23 — The right keyboard, no autofill bar
- 10 number fields had no `inputmode` (an iPhone then shows the full keyboard's number row, not a
  pad), and 17 text fields had no `autocomplete="off"` (Safari offers contacts and addresses above
  the keyboard for fields named like "name"). js/render.js, map.js, routes.js, holotapes.js,
  bulk.js, trials.js, sfx-custom.js: `inputmode="numeric"` (XP, days, places), `"decimal"`
  (Caps target, amounts, rates, clip times), `autocomplete="off"` on every text field.
- Tests: `tests/mobile.test.js` +1 (scans every `<input>` in js/); `node --test` → 372 pass, 0 fail.
  Chromium phone mode: the fields carry the new attributes; no layout change, no page error.

## 2026-10-23 — No double-tap zoom on controls
- Two quick taps on a control (the RADS + and −, a quest's ○, "Another angle") zoom the page on an
  iPhone; only the trial counter had `touch-action:manipulation`. `css/terminal.css`: buttons, links,
  fields and labels get it (pinch zoom still works; the map's canvas keeps MapLibre's own `none`).
- Tests: `tests/mobile.test.js` +1; `node --test` → 371 pass, 0 fail. Chromium phone mode: buttons
  and tabs `manipulation`, the map canvas `none`, the page `auto`.

## 2026-10-23 — Lint pass
- ESLint 9 (from the scratchpad, not a repo dependency) with the browser, service-worker and Node
  globals, rules for undefined/unused names, unreachable code, duplicate keys, self-compare, typeof,
  fall-through and the like, over js/, sw.js, tests/, api/: two findings, both dead code, removed
  (`motion` in js/items3d.js, `DAY` in tests/history.test.js). tools/perf-check.js's flags are code
  that runs in the browser (page.evaluate): left. Now clean. `node --test` → 370 pass, 0 fail.

## 2026-10-23 — Installed-app details; performance measured
- `index.html`: `<meta name="theme-color">` (the browser's bars dark amber, as the manifest);
  `manifest.webmanifest`: `"id": "./"` (a stable identity for the installed app). Chromium parses the
  manifest with no error. `tests/mobile.test.js` +1 (manifest and page agree). Icons checked: 180,
  192, 512 and a 512 maskable.
- Performance (tools/perf-check.js, CPU ×4): opening busy 612/603 ms (style 69/81, layout 49/46),
  longest task 165 ms; VITALS, STATUS, QUESTS 3 ms/s and LOG 11 ms/s sitting still (ITEMS and MAP
  draw WebGL on the processor in headless Chromium, as noted before). A CPU profile of the opening
  puts the most in renderHeader (the first date formatting) and placeWalker (reading the layout);
  the country list is 2.5 ms. No change made: no single fix worth its risk.
- `node --test` → 370 pass, 0 fail.

## 2026-10-23 — Error log (plan task 25); accessibility checks
- New `js/errors.js` (first script; APP_SHELL; sw VERSION stamped): uncaught errors and unhandled
  rejections kept on this device (latest 20, "Script error." and failed resources left out), a
  notice once a session; `index.html` + `js/events.js`: Settings → About "Errors: N · last … — …",
  Copy the error list (clipboard), Clear. Checked first that normal use makes none (Chromium, every
  tab, online and offline: 0).
- Accessibility, no change needed: Chromium's accessibility tree gives every control on every
  screen a name; 44 controls reached by Tab on VITALS all show the amber focus ring (one false
  alarm on the date field: it does, read too early).
- Tests: new `tests/errors.test.js` (2); `node --test` → 369 pass, 0 fail. Chromium: a thrown error
  and a rejected promise → one notice, About "Errors: 2 · last …", Copy → both lines on the
  clipboard, Clear → "Errors: none".

## 2026-10-23 — No more iPhone zoom when typing (plan task 24)
- Measured every field on every screen and form (Chromium, phone mode): 19 of 20 had text under
  16px (12.8–14.4px: the pulse, the streak date, the quest/item/book/wallet forms, the map search,
  the journal), and iOS Safari zooms the page into such a field and stays zoomed.
- `css/terminal.css`: on touch screens (`pointer:coarse`) every text field, select and textarea is
  16px (!important over each component's size); the new item's price field 84 → 96px so "Price $"
  stays whole. Pinch zoom stays allowed (no maximum-scale).
- Tests: new `tests/mobile.test.js` (2); `node --test` → 367 pass, 0 fail. Chromium phone mode:
  0 fields under 16px; the layout audit at 320/390px finds no clipping or sideways scroll; the forms
  looked at 320px.

## 2026-10-22 — Design recheck of every screen (plan task 23)
- Method: a Chromium script fills the app with realistic data, then on every tab, Settings, the
  trials, the urge timer (running and at zero), the perk chart, a bobblehead and the level-up, at
  320/390/768/1024 px, measures WCAG contrast of every text, text under 11px, clipped or off-screen
  text, tap areas (counting the invisible ::before ones) and sideways scroll; screenshots looked at.
- Fixed (`css/terminal.css` unless said):
  - contrast: skill gains under quests and books 4.22:1 → `--text-dim` (≥ 4.5:1); hidden
    bobbleheads' "?" 3.59:1 → `--text-dim`; map credits 4.31:1 at 9px → `--text-dim` at 10px;
  - smallest text 9.6–10.2px → 10.6px (stats labels, TRAIN, skill sources, bobblehead names, trial
    tags, the trials count); the slider anchors stay 9.9px (they'd wrap at 320px);
  - tap areas: quest names 24/29px → 36/35px (an invisible area above and below; on a main quest
    only 2px below, so the objective's box keeps its top edge: checked with elementFromPoint); the
    main quest objective 31 → 36px; the inline "Decoder" 32 → 36px;
  - the VITALS table at 320px: N and T were scrolled out of view → a little smaller and tighter
    under 360px, fits with 5px or more between numbers (a 1px try made numbers touch: rejected);
  - `js/render.js`: an open side quest showed ✓ (looks done) → ○ like dailies and bonuses;
    `js/vitals.js`: the RADS "-" (a hyphen, smaller than "+") → "−".
- Not changed, checked: the dark bands in full-page captures are the CRT layers in the capture only
  (a real screen has none); VT323's slashed zero; bonus ○ 40×34 and ⇄ 34×40 are sized for their
  neighbours (comments in the CSS); the level-up banner covers the top for a moment by design.
- Tests: `node --test` → 365 pass, 0 fail. Audit after: no contrast, size or clipping problem left
  except the bobblehead button's own colour (its text is the "?" span, now readable); no sideways
  scroll at any width; no page errors.

## 2026-10-22 — Places quest form fits narrow phones
- The country list took the width of its longest name: at 320–390 px the row ran past the form
  (select to 460 px, clipped). `css/terminal.css`: the places row takes the form's width, the list
  what's left (ellipsis). Chromium 320/360/390 px: row and list end at the form's edge; no errors.
  `node --test` → 365 pass, 0 fail.

## 2026-10-22 — Undo last replace (plan task 22); audit notes
- The two destructive operations (Reset progress, Import → Yes, replace) and the old-terminal merge
  had no way back without an exported file. `js/storage.js` `keepPrevious`/`readPrevious`;
  `js/events.js` keeps the state before each, Settings shows "Undo last replace" with when and what
  (level · XP · check-ins), asks, swaps. `index.html` two Settings rows; `css/terminal.css`
  `.set-link[hidden], .set-note[hidden]` (a display rule was showing the hidden button: caught in
  Chromium). `js/main.js`: `watchUpdates` ignores a missing registration (page error when service
  workers are blocked, caught in Chromium).
- Audit, no change needed: every `new Date()` from a stored date uses numeric parts (Safari-safe);
  after-change hook 0.74 ms and VITALS redraw 3.8 ms on a heavy state at 4× CPU slowdown.
- Tests: new `tests/undo.test.js` (2); `node --test` → 365 pass, 0 fail. Chromium 360 px: check-in →
  Reset → Undo shown ("From before the reset, Oct 22 at 16:08: level 2 · 15 XP · 1 check-ins.") →
  Yes, put it back → 15 XP → reload → 15 XP; Undo hidden before any replace; no page errors.

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
