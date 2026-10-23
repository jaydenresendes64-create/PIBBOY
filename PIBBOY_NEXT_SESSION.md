# PIBBOY — next session

## State
- PRs #39 to #42 were merged by the owner and are live: the urge decoder record, places quests,
  instant open, the data-format guard, Undo last replace and the design recheck.
- **PR #43 is open** (iPhone polish, branch `claude/laughing-dijkstra-14x4dd`): 16 px fields (no
  iPhone zoom), no double-tap zoom on controls, the right keyboard for each field, the error log in
  Settings → About, a theme-color and manifest id, a lint pass, amber example text in fields,
  "How strong" on one line, the pressed look on iPhone (passive touchstart),
  a return key named for what Enter does, sliders drawn in amber (36px to grab),
  damaged backups show no "[object Object]".
  GitHub "test" check green. Waiting for the owner to merge; never merge it yourself.
- `node --test`: 379 pass, 0 fail (`tests/fuzz.test.js` damages a backup 400 ways;
  `tests/actions.test.js` plays 1,200 random actions and checks the numbers add up).
- `sw.js` VERSION is a hash of the app files: after any app file change run `node tools/stamp-sw.js`
  (the tests fail otherwise). `DATA_SCHEMA` (js/state.js) is 1: raise it when a version saves fields
  an older one would drop.
- Checked with no change needed: phone landscape (844x390) on every screen (no sideways scroll, no
  clipping, no errors); accessible names; focus rings; performance profile.
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
