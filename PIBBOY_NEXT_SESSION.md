# PIBBOY — next session

## State
- PRs #39 to #42 were merged by the owner and are live: the urge decoder record, places quests,
  instant open, the data-format guard, Undo last replace and the design recheck.
- **PR #43 is open** (branch `claude/laughing-dijkstra-14x4dd`), waiting for the owner to merge;
  never merge it yourself. In it:
  - iPhone: 16 px fields (no zoom), no double-tap zoom, the right keyboard and return key per
    field, the pressed look (passive touchstart), amber sliders with a 26 px knob, amber example
    text, "How strong" on one line, a theme-color and manifest id;
  - the error log and the version (and a newer one waiting) in Settings → About; a lint pass;
  - a year of use: MAP lists and the journal show "10/30 more", a skill's detail groups the same
    source, STATUS and VITALS redraw faster;
  - data safety: damaged backups show no "[object Object]"; random tests (fuzz, actions);
  - CI runs the tests a second time on Montréal's clock (`TZ=America/Toronto`).
- `node --test`: 389 pass, 0 fail, in UTC and in 10 time zones. Random but repeatable tests:
  `tests/fuzz.test.js` (a backup damaged 400 ways), `tests/actions.test.js` (1,200 actions, the
  numbers add up). Expect 389: a lower total means a test file was lost (it happened once).
- Checked, nothing to fix: landscape, accessible names, focus rings, a long session (no leak), a
  year's backup (575 KB, under the 5 MB import limit), date formatting at opening.
- `sw.js` VERSION is a hash of the app files: after any app file change run `node tools/stamp-sw.js`
  (the tests fail otherwise). `DATA_SCHEMA` (js/state.js) is 1: raise it when a version saves fields
  an older one would drop.
- Details: `PIBBOY_OPTIMIZATION_LOG.md`; status: `PIBBOY_OPTIMIZATION_PLAN.md`.
- Known failures: none.

## Known risks
- Measured in Chromium, not changed (log, "A year of data"): from level 10 the Vault Boy's walk in
  parts makes the page recompute styles every frame while he walks (the thighs' keyframes). The
  iPhone may behave differently; a fix goes through tools/vaultboy-moves.py and HANDOFF §4.
- Versions deployed before DATA_SCHEMA (before `ae17ebf`) don't check it: one left open in a second
  tab during that deploy could save over new fields once. From then on, older code stops.
- An update shows after the app has been in the background once (or at an untouched open), not on the
  open that downloads it.
- Not tested on a real iPhone: the update hand-off while a Home Screen app is suspended, the new
  urge screen, check-in anchors, places quests, Undo last replace, the PR #43 field and tap changes.

## Waiting on the owner
1. Merge PR #43 when happy, then try it on the iPhone (it shows after leaving the app once): tap the
   pulse field, the map search, the journal (no zoom); tap + twice on a RADS counter (no zoom).
2. French caps goals: "not yet". Opt-in plan in HANDOFF §8 step 3, not built.
3. MAP clouds (30 fps) and ITEMS model copies (30 fps): GPU cost vs looks (HANDOFF §4).

## Resume
```
cd PIBBOY && git status && git log --oneline -5 && node --test && node tools/stamp-sw.js --check
```
Pushing this branch is authorized for follow-up commits; never merge or deploy without the owner.
