# PIBBOY optimization plan

Architecture, decisions and history live in `HANDOFF.md`; this file only tracks the current
improvement campaign. Status: `[x]` done (tests pass), `[ ]` to do, `[~]` in progress.

## Priorities and tasks

| # | Area | Task | Verify by | Status |
|---|------|------|-----------|--------|
| 1 | Urge decoder | Record every urge with its outcome (ridden out / given in to), intensity, trigger, coping ways used, one-line note, hour; the XP cap counts only urges ridden out | `tests/urges.test.js`, Chromium end to end | [x] |
| 2 | Urge decoder | Player's own coping list (add / remove, 6 generic defaults), best way suggested first, patterns from the log (counted, never causal) | `tests/urges.test.js` (exact wording) | [x] |
| 3 | Data integrity | Old saves and backups read the new urge fields safely (no migrate step needed: defaults + sanitize) | documents tests (identical round trip, hostile input) | [x] |
| 4 | VITALS / QUESTS | Inspect reward paths for double taps, reloads and the 4:00 VITALS day vs midnight dailies | existing tests (flags `completed`/`done`/`logged`/`lastDate`) | [x] no defect found |
| 5 | Backup / restore | Import: show what a backup holds next to this phone before replacing; warn when older or losing data | `tests/backup.test.js`, Chromium with a real file | [x] |
| 6 | Mobile usability | Tap targets and focus on the new urge controls; long names wrap | browser at 360-390 px | [x] |
| 7 | Progression | Last 7 days next to the 7 before (XP, check-ins, urges, dailies, trials, quests) on STATUS and in the RobCo boot, from recorded data only | `tests/week.test.js`, Chromium at 360 px | [x] |
| 8 | Urge decoder | "I gave in" tapped by mistake: Undo right after (the urge runs on where it was) | `tests/urges.test.js`, Chromium real clicks + reload | [x] |
| 10 | Urge decoder | The owner's own notes come back: the latest line written after an urge ridden out shows while the next timer runs (YOUR WORDS) | `tests/urges.test.js` (exact wording, escaped), Chromium | [x] |
| 11 | VITALS | Every check-in level defined on screen (0 / 10 anchors, read out with the slider; Sleep = last night), matching insight.js `LINES` | `tests/vitals.test.js`, Chromium 320/360/390 px | [x] |
| 12 | ITEMS / errors | 3D models came back only after a reload once the GPU context was lost; now they hide, then return on restore or with a new renderer when ITEMS reopens | Chromium + WEBGL_lose_context (lose, restore, lose and reopen) | [x] |
| 13 | Integrations | Weather: a kept reading of any age was shown as the weather now (offline); now only while under 3 h old | `tests/boot.test.js`, Chromium (1 h shown, 4 h hidden) | [x] |
| 14 | Urge decoder | The trigger noted was stored but never used: now a practical step per trigger at once, how urges with that trigger went before, the top trigger's outcomes, strong vs milder urges | `tests/urges.test.js` (exact wording), Chromium real taps | [x] |
| 15 | Urge decoder | Urges were logged at the hour the end was tapped (often hours later, "come back at zero"), skewing time patterns and the day's cap; now at the round's start | `tests/urges.test.js`, Chromium (10 h late, reload) | [x] |
| 16 | Urge decoder | "How strong" slider gets the same 0/10 anchors as the check-in (0 unrated, 10 extreme) | `tests/urges.test.js`, Chromium 320/390 px | [x] |
| 17 | Backup / restore | Verify a backup of every feature comes back whole (the identity test only covered quests, items, wallet, journal) | new `tests/roundtrip.test.js`; Chromium Export → fresh profile Import → reload | [x] verified, no defect |
| 18 | Urge decoder | Last urges showed only 8 of up to 300 kept: "N more" pages back to the oldest | `tests/urges.test.js`, Chromium clicks | [x] |
| 19 | Urge decoder | A note could only be written right after an urge: Note on any urge in Last urges adds, changes or removes it | `tests/urges.test.js`, Chromium 320 px clicks + reload | [x] |
| 20 | Quests | Places quests ("reveal 5 cities in Morocco", HANDOFF §8 step 0): the bar follows the MAP, the reward waits for Complete | `tests/placesquest.test.js`, Chromium form → reveal → complete → reload | [x] |
| 9 | Quests | French caps objectives (`CAPS_OBJECTIVE`) | needs the owner's yes: a second one-time link would switch quests kept on a manual % to the wallet | on hold |

## Rules (from CLAUDE.md)
- Every data-shape change through `sanitizeImported()` (and `migrate()` when defaults aren't enough), with a test.
- Every reward through `award()`. No penalties. No LUCK. Personal data never in the repo.
- `node --test` before every commit; bump `CACHE` in `sw.js` when app files change.
- Pushing needs the owner's go-ahead.
