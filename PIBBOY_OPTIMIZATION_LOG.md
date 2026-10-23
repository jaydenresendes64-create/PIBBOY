# PIBBOY optimization log

Newest first. Each entry: what changed, files, tests actually run.

## 2026-10-23 — Settings → About shows the version (and a newer one waiting)
- An update comes in when the app goes to the background, so nothing showed whether the new
  version was in yet (the thing to check after a merge). `sw.js`: asked `{type:'VERSION'}`, it
  answers `{version: VERSION}` on the port it was given. `js/main.js`: `ST.appVersion()` asks the
  controlling worker (2 s at most) and adds whether a version waits. `js/events.js`: opening
  Settings writes "Version 3b72f452d8b2", with " · a newer one is ready: it comes in when you leave
  the app" while one waits, or "Version: no offline copy" without a service worker.
  `index.html`: the line under About.
- Chromium with the real service worker (a copy of the site, its sw.js really changed mid-test):
  the installed version shown (= sw.js); after `update()` the newer one waits and the line says so;
  after the app goes to the background it reloads on the newer one and shows its version; no page
  error.
- Tests: `tests/sw.test.js` +1 (the answer, nothing without a port, never puts a version in),
  new `tests/version.test.js` (2); `node --test` → 389 pass, 0 fail.

## 2026-10-23 — The slider knob a finger's size
- Re-reading the PR's diff before a merge: on an iPhone a slider moves only when its knob is
  grabbed, and iOS's own knob is ~28px; the amber one was 22px, so harder to catch on the six
  check-in sliders every morning. `css/terminal.css`: the knob 26px (the fill's offset and the
  WebKit `margin-top` adjusted: 13px, -11px). Close-ups of the 4 sliders at 390px: centred, the
  fill reaching the knob's middle. `tests/mobile.test.js` updated; `node --test` → 386 pass.

## 2026-10-23 — The journal: older entries readable ("30 more")
- The app keeps the latest 200 journal entries, but LOG showed only 30: the other 170 could only
  be read in a backup file.
- `js/render.js` `renderLog`: the latest 30, then "30 more (N older)"; `js/events.js` action
  `log-more` shows 30 more and focuses the first of them; how many show is kept until the page
  reloads. `css/terminal.css`: `.list-more` shares the MAP's "more" row style.
- Tests: new `tests/loglist.test.js` (2: 75 entries shown 30, 60, 75 with the right counts, text
  escaped; 30 or fewer: no button); `node --test` → 386 pass, 0 fail. Chromium phone mode with
  the year (200 entries): 30, then 60 with the focus on the 31st, all 200 after six taps, a journal
  entry being typed kept; button 328x44; no page error.
- Mistake: commit `de6a1d9` wrote these tests with a shell `cat >` over the existing
  `tests/journal.test.js` (7 tests of the offline journal rules), which went from 7 tests to 2; the
  run said 379 pass, 0 fail, and the drop is how it was caught. Next commit: the file restored from
  `9622054` exactly, the new tests in `tests/loglist.test.js`; every test file compared with main's
  (none has fewer tests). From then on new files are made with the editor (it refuses to overwrite a
  file not read first), and the total is compared with the expected count before a push.

## 2026-10-23 — Backup size against the import limit (checked, no change)
- Import refuses files over 5 MB (`MAX_IMPORT_BYTES`, js/storage.js), so an export bigger than that
  couldn't be restored. A year of daily use exports 575 KB (history, capped at 2,000 events, is half
  of it; urges, check-ins, journal and trials are capped too). Uncapped: places and routes; a route's
  road is kept simplified (~10 characters a km: Montréal–Vancouver ~45 KB), so 5 MB needs over a
  hundred cross-country trips. Far-fetched: no code added. README and HANDOFF now mention the
  random tests and the CI's second pass on Montréal's clock.

## 2026-10-23 — A long session: no leak (measured, no change)
- The app stays open for days on the iPhone, so a long session was measured in Chromium with the
  year of data: rounds of 60 tab switches, 10 Settings open/close, 20 urges started and dropped
  with full redraws; after each, heap (after garbage collection), elements and listeners.
- Elements (4,448) and listeners (window 26, document 23, body 11; 447 in all once MapLibre is
  in) don't move after the first round. The heap jumps once when the MAP first opens (MapLibre,
  3 → 10 MB), then grows ~0.13 MB a round (~0.05 MB without the MAP). Heap snapshots of round 2 and
  round 8 compared by kind: the growth is the engine's compiled code (code objects, instruction
  streams), none of the app's own objects. Nothing to fix.

## 2026-10-23 — The tests in every time zone; CI also on the owner's clock
- CI runs the tests in UTC; the owner lives on Montréal time. The whole suite in 10 time zones
  (UTC, Toronto, Vancouver, Adak, Paris, Casablanca, Kolkata, Auckland, Chatham, Kiritimati) found
  two tests (not the app) that only held in some: `tests/errors.test.js` expected the error's UTC
  time on the local date (in Auckland 09:12 on the 23rd is the 22nd in UTC); `tests/insight.test.js`
  expected every reflection to end with "?" (which one shows depends on the minute; one ends "Good
  to know for next time."). Both now check what they mean; 384 pass in all 10.
- The random-actions test (crossing the 1 November clock change) passed on Montréal time with 3
  more seeds of 3,000 actions.
- `.github/workflows/test.yml`: a second `node --test` with `TZ: America/Toronto`.

## 2026-10-23 — MAP lists: the latest 10, then "10 more"
- With the year of data the MAP's Cities list was 60 rows (2,640px) under the map; a bulk list
  of places makes it longer in one go. The journal (30 shown) and the urge history ("more") were
  already bounded; the places lists weren't.
- `js/map.js` `listHtml`: each list (cities, regions, pins) shows its latest 10, newest first, then
  "10 more (N older)", which shows ten more and moves the focus to the first new one; the place
  open in the panel shows wherever it is. How many show is kept until the page reloads (not
  saved). `css/terminal.css` `.place-more`: a 44px row, dimmed amber, underlined.
- Tests: new `tests/maplist.test.js` (3: the first 10 and the count, no button at 10 or fewer, the
  open place shown); `node --test` → 384 pass, 0 fail. Chromium phone mode with the year: page
  4,043 → 1,887px, the button 328x44, a tap shows 20 with the focus on the 11th, all 60 after
  five more; no page error.

## 2026-10-23 — A skill's detail: the same source on one line, counted
- Found with the year of data: SURVIVAL's "Earned" showed one line per urge ridden out, 438
  "Urge ridden out +1" lines (and as many elements on the page once opened).
- `js/render.js` `skillDetailHtml`: sources with the same name share one line, with how many and
  their total ("Urge ridden out ×438 +438", "The Road ×2 +3"), in the order they first came. Display
  only: `skillSources()` still lists each one; the summary line under the skill is unchanged.
- Tests: `tests/skills.test.js` +1 (a book read twice and three urges: two lines; fails without the
  change); `node --test` → 381 pass, 0 fail. Chromium with the year: SURVIVAL's detail is 3 lines,
  screenshot checked; no page error.

## 2026-10-23 — STATUS redraw with a year of data: one pass, not eight
- Profile of 30 STATUS redraws with the year of data (full speed): `skillSources` ran once per skill
  (8), each going through the 2,000 history events and splitting their text (~54 ms); the 7-day
  summary turned each event's time into "2026-10-22" text and parsed it back (`dayNumber(dayStr())`,
  ~31 ms).
- `js/state.js`: `skillSourcesAll()` gives every skill's sources in one pass over the quests, the
  books and the history (`skillSources(key)` reads from it); `js/render.js` asks once per draw.
  `weekSummary`: an event's day straight from its date (`Date.UTC` of its local year, month, day).
- Same results, checked: old and new skill sources identical for all 8 skills on the year and the
  used phone, with a skill twice in a quest, a negative gain and junk in the history; old and new
  week summaries identical on the year at 5 days (DST changes among them) in 4 time zones
  (UTC, Toronto, Casablanca, Auckland). The JS part goes from ~85 ms to ~21–37 ms per 30 redraws:
  about 2 ms per STATUS redraw at full speed (~8 ms on a phone 4× slower); the rest is the browser.
- Tests: the existing skills and week tests cover both; `node --test` → 380 pass, 0 fail.

## 2026-10-23 — VITALS redraw with a year of data: two hot spots
- CPU profile of 30 VITALS redraws with the year of data (full speed): `shortDay` 23 ms (a new
  date formatter for every date), `dayNumber` + `byDate` 28 ms (`lastVitals` sorted all 365
  check-ins working out both entries' days at each of ~6,000 comparisons, several times a draw).
- `js/vitals.js` `shortDay`: one `Intl.DateTimeFormat`, made the first time (same text: "Oct 22").
  `js/state.js` `lastVitals`: each entry's day worked out once, then sorted (same order, the list
  not touched). After: `shortDay` 1–2 ms, `byDate` gone, `dayNumber` ~10 ms: about 1 ms saved per
  VITALS redraw at full speed (~4 ms on a phone 4× slower). The rest of a redraw is mostly the
  browser laying the page out, which a smaller change can't remove.
- Tests: `tests/vitals.test.js` +1 (400 shuffled check-ins: newest first by day, across a month
  change, the saved list left as it was); `node --test` → 380 pass, 0 fail.

## 2026-10-23 — A year of data, and the Vault Boy from level 10 (measured, not changed)
- A year of daily use built through the app's own functions (365 check-ins, 300 urges, 264 trials,
  200 journal entries, 2,000 history events, 122 places, level 17; 337 KB), opened in Chromium
  with the processor slowed 4×: busy ~2,000 ms in the first 4 s, style+layout ~1,050 ms, longest
  task ~200 ms; a full redraw 75–90 ms, VITALS 20 ms, a save 5 ms, the import gate 30 ms. An
  empty phone: busy ~450 ms, style ~110 ms. Only 1,640 elements on the page.
- Bisected: the data isn't the cost, the **level** is. An empty phone at level 10 or more costs the
  same as the year (levels 2–8: busy ~400–540 ms). From level 10 the Vault Boy walks in parts
  (outfits 10/20/30/50); while he walks (about 4 s of each 11 s loop) Chromium recomputes the style
  of all ~20 animated elements every frame (~60/s, ~140 ms per 250 ms at 4×; nothing while he
  stands, so the idle measure missed it). Turning animations off one at a time: the thighs'
  (`vbLegF`/`vbLegB`, 229/237 keyframes of `rotate(calc(var(--vb-swing, 1) * …deg))`) are the
  cause; with 3 plain keyframes in their place it stops; without the `var()` it halves. The
  shins have the same kind of keyframes and don't cause it; `clip-path` on `.vb-knee`,
  `will-change` and the sprite don't matter. Chromium's trace marks every animation composited, yet
  ticks them all on the main thread.
- Not changed: it's the Vault Boy (the owner's checklist and eyes, HANDOFF §4), and the owner's
  phone is an iPhone, whose WebKit handles animations its own way; not measurable here. Candidate
  for the next session if the owner reaches level 10 and notices heat or stutter: have
  tools/vaultboy-moves.py write the thighs' keyframes with fewer, plain-angle keyframes (the
  swing applied another way), then compare frames at levels 2, 5 and 10.
- Scripts (not in the repo): a year generator through tests/helpers, a per-level timeline of
  style recalcs (CDP Performance metrics every 250 ms), and per-animation kill switches.

## 2026-10-23 — Random actions: the numbers always add up
- New `tests/actions.test.js`: 1,200 actions picked at random from a fixed seed (check-ins, RADS,
  dailies, quests and bonuses, urges won/given in/dropped with notes, trials, streaks and lapses,
  books, journal, sales, perks, SPECIAL points, places), through the app's own functions with time
  going by. After each: lifetime XP grew by exactly the history's new XP (every reward through
  `award()`); level, XP and next threshold are what that XP gives (+400 a level); skills 0-100,
  SPECIAL 1-10, points ≥ 0; no NaN or Infinity anywhere; every 25 actions the import gate takes the
  state back unchanged. `seededRandom` shared in tests/helpers.js (fuzz uses it too).
- Found nothing: 18,000 more actions over 6 seeds passed. Checked that it catches real bugs: a
  planted extra XP point and a reward left out of the history both fail it at once. (Its skill-cap
  check is a guard: no skill gets near 100 in a run; tests/rewards.test.js tests the cap.)
- `node --test` → 379 pass, 0 fail. Test files only.

## 2026-10-23 — Damaged backups: a fuzz test, and no "[object Object]"
- New `tests/fuzz.test.js`: the phone used every way (`usedPhone`, moved from
  tests/roundtrip.test.js to tests/helpers.js) is exported, damaged at 1 to 5 random places (junk
  of every type, or removed), 400 rounds from a fixed seed (`FUZZ_ROUNDS`/`FUZZ_SEED` for more).
  Each round: `sanitizeImported` doesn't throw, a second pass changes nothing, and STATUS, QUESTS,
  ITEMS, LOG and VITALS (check-in and trials) draw with no NaN, "undefined" or "[object Object]".
- It found one thing: a list or an object where text belongs (a quest name, a journal line) showed
  as "[object Object]". `js/state.js` `text()`: such a value is no text (''). Every field it
  cleans is one the app only ever writes as text (checked: no older version stored text as a list),
  so no saved data changes; the round-trip test still gives the same document.
- Tests: fuzz +1, `tests/sanitize.test.js` +1 (both fail without the fix); 20,000 rounds over 4
  seeds and 12,000 more with the trials view passed locally; `node --test` → 378 pass, 0 fail.
- Measured, no change: date and number formatting at opening (the profile's top item): 1 date and
  5–7 number formats per open or redraw; the ~17ms is the first one setting up (a cache can't save
  it), the rest under 0.5ms.

## 2026-10-23 — Sliders in amber on every phone; the quest slider easier to grab
- The 4 sliders (the 6 check-in levels, the urge's strength, a quest's progress, a place's radius)
  were the browser's own, tinted with `accent-color`: an iPhone draws them as a white knob on a grey
  line, only the filled part amber. The quest's progress slider was 16px high (the design audit
  leaves sliders out; measured now): hard to grab.
- `css/terminal.css`: one rule for every slider: an amber-edged groove lit up to the knob, a lit
  amber knob (22px, a dark ring), 36px of height to grab (the check-in rows keep their 30px); the
  urge's in `--amber`; a done quest's dimmed. WebKit/Blink and Firefox pseudo-elements; the
  `accent-color` lines removed. `js/state.js`: `rangeShare`/`rangeFill` (where the knob sits,
  0 to 1, written as `style="--p:…"` in each slider's HTML: render.js, vitals.js ×2, map.js);
  `js/main.js`: one input listener keeps `--p` up to date while the knob moves.
- Chromium (390px, phone mode): before/after close-ups of all 4; quest slider 16 → 36px; a finger
  drag moves the value, the shown number, the saved level and the fill together; arrow keys too,
  with the focus ring; a done quest's slider dim and locked; the design audit at 320px unchanged; no
  page error. Not checkable here: the iPhone's own drawing (expected the same: WebKit).
- Tests: `tests/mobile.test.js` +1 (the share, the CSS, every slider writes `--p`),
  `tests/urges.test.js` pattern; `node --test` → 376 pass, 0 fail (exit code checked).

## 2026-10-23 — The return key says what Enter does
- The iPhone keyboard's return key said "return" in every text field, though Enter adds the quest,
  item, book, trial or way, saves the note or the name. 20 text fields (js/render.js, map.js,
  routes.js, trials.js, vitals.js, holotapes.js, bulk.js): `enterkeyhint="done"` ("OK" on a French
  iPhone); a bulk line's fix `"search"` (Enter looks it up again), like the map search already.
- Two fields where Enter did nothing: a new streak's name now starts it (what Start/Save does), a
  route's name closes the keyboard like a place's (the name is kept as typed).
- Tests: `tests/ownstreaks.test.js` +1 (Enter starts, then renames; fails without the handler);
  `tests/mobile.test.js` scan: every text field names its return key; `node --test` → 375 pass,
  0 fail. Chromium phone mode: Enter in the streak name starts "Focus" and closes the form; Enter in
  a route's name keeps it and leaves the box; the fields on screen carry the hint; no page error.
- Mistake: commit `a90bc69` was pushed with 3 failing tests (tests/trials.test.js ×2,
  tests/urges.test.js ×1 match a field's exact HTML, which now has `enterkeyhint`): my command
  checked that the test output printed, not that it passed. Fixed in the next commit (patterns
  updated; 375 pass). From then on the push waits for `node --test`'s own exit code.

## 2026-10-23 — The pressed look on iPhone
- The tabs' "physical key" press (`.tab-btn:active`) and the trial counter's (`.trial-tap:active`)
  don't show in iOS Safari: it applies `:active` only when the page listens for touches (Apple's
  Safari Web Content Guide; still the standard answer, WebKit bugs 221366 and 310540). `js/main.js`:
  one `touchstart` listener on the document that does nothing, passive (it never holds up
  scrolling).
- Chromium phone mode (CDP): the listener is there and passive; a tap still switches tabs; no page
  error. Not checkable here: the pressed look itself on the iPhone.
- Tests: `tests/mobile.test.js` +1; `node --test` → 374 pass, 0 fail.

## 2026-10-23 — Urge "How strong" on one line
- The urge's "How strong" label sat in the check-in's name column (5.2em, 67px) and broke onto two
  lines at every width. `css/terminal.css`: in `.urge-details` its column fits the name (`auto`,
  `nowrap`); under 360px, where the shorter slider would push its scale ("0 unrated / extreme 10")
  onto two lines, the name goes above and the slider takes the full width.
- Chromium at 320, 360, 375, 390: name and scale each on one line (screenshots); the design audit at
  320 and 390 finds nothing new, no page error. `node --test` → 373 pass, 0 fail (CSS only).

## 2026-10-23 — Example text in fields: amber, readable; landscape checked
- Every field's example text ("Quest name", "Search city…", "Price $") was the browser's grey
  (#757575, 3.63:1 on the form panels; under the 4.5:1 floor and off the amber look).
  `css/terminal.css`: `::placeholder{ color:var(--text-dim); opacity:1; }`. Measured in Chromium on
  all 19 fields, including the forms that open on a tap (own streak, cope, trial, map search, bulk
  list): 4.51:1 to 5.42:1.
- Phone landscape (844x390), every screen with realistic data: no sideways scroll, no clipping, no
  page error; the small taps found are the known, deliberate ones. No change.
- Tests: `tests/mobile.test.js` +1 (the rule, and `--text-dim` against `--bg`, `--panel`,
  `--panel-alt` computed from the CSS; fails without the rule); `node --test` → 373 pass, 0 fail.

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
