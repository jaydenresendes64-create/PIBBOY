# PIBBOY — next session

## State
- PR #39 was merged by the owner (2026-10-22 16:08, `ae17ebf`) and deployed (Pages run green): the
  urge decoder record, places quests, instant open and the data-format guard are live.
- PR #40 (Undo last replace, places form on narrow phones) was merged by the owner too (`d5d7299`,
  Tests and Pages green). Everything from this campaign is in `main` and live; nothing is pending.
- `node --test`: 365 pass, 0 fail. GitHub "Tests" workflow green on the pushed commits checked.
- `sw.js` VERSION is a hash of the app files: after any app file change run `node tools/stamp-sw.js`
  (the tests fail otherwise). `DATA_SCHEMA` (js/state.js) is 1: raise it when a version saves fields
  an older one would drop.
- Done this campaign (details: `PIBBOY_OPTIMIZATION_LOG.md`; status: `PIBBOY_OPTIMIZATION_PLAN.md`):
  urge decoder record and insights; places quests; Last 7 days; check-in levels defined; backup
  comparison, round-trip test, Undo last replace; ITEMS 3D context recovery; no stale weather;
  **instant open** (cache-first whole versions, updates when the app goes to the background) with the
  storage guard (older code never writes over newer data).
- Known failures: none.

## Known risks
- Versions deployed before DATA_SCHEMA (before `ae17ebf`) don't check it: one left open in a second
  tab during that deploy could save over new fields once. From then on, older code stops.
- An update shows after the app has been in the background once (or at an untouched open), not on the
  open that downloads it.
- Not tested on a real iPhone: the update hand-off while a Home Screen app is suspended, the new
  urge screen, check-in anchors, places quests, Undo last replace.

## Waiting on the owner
1. Try the new version on the iPhone (it shows after leaving the app once) and report anything odd.
2. French caps goals: "not yet". Opt-in plan in HANDOFF §8 step 3, not built.
3. MAP clouds (30 fps) and ITEMS model copies (30 fps): GPU cost vs looks (HANDOFF §4).

## Resume
```
cd PIBBOY && git status && git log --oneline -5 && node --test && node tools/stamp-sw.js --check
```
Pushing this branch is authorized for follow-up commits; never merge or deploy without the owner.
