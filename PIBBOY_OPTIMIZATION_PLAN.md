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
| 9 | Quests | French caps objectives (`CAPS_OBJECTIVE`) | needs the owner's yes: a second one-time link would switch quests kept on a manual % to the wallet | on hold |

## Rules (from CLAUDE.md)
- Every data-shape change through `sanitizeImported()` (and `migrate()` when defaults aren't enough), with a test.
- Every reward through `award()`. No penalties. No LUCK. Personal data never in the repo.
- `node --test` before every commit; bump `CACHE` in `sw.js` when app files change.
- Pushing needs the owner's go-ahead.
