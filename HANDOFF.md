# PIBBOY — technical handoff

State as of commit `8d299ab` (2026-09-24). Live: https://jaydenresendes64-create.github.io/PIBBOY/
173/173 tests pass locally and on GitHub Actions. `sw.js` cache: `v13`.

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
| `js/mascot.js` | Mascot gesture scheduling (moves are CSS keyframes) |
| `js/crt.js`, `js/tilt.js` | CRT flicker; 3D tilt (DeviceOrientation/mouse) incl. glass glare parallax |
| `js/events.js` | All user actions → state change → re-render → debounced save |
| `js/main.js` | Boot: load → setup events → render → `syncCaps()` → SW registration |
| `sw.js` | Service worker: network-first app files with a 2.5 s timeout (then the cached copy, refreshed in the background), APP_SHELL precache (big `HEAVY` files may fail without stopping the install), vector tiles cache (≤800); tested in `tests/sw.test.js` with a fake network |
| `css/terminal.css` | All styles (palette variables in `:root`) |
| `vendor/three/three.pibboy.min.js` | Three.js r186, tree-shaken (parts in `tools/three-entry.mjs`, built by `tools/build-three.mjs`) |
| `tests/*.test.js` | `node --test` (Node built-in runner, vm harness in `tests/helpers.js`, no deps) |
| `.github/workflows/test.yml` | Runs the tests on every push |

**Code rules (engineering pass, 2026-09-24):**
- Every reward goes through state.js: `completeMain/Side/Bonus/Daily()` (once, `payQuest()` =
  skills + `gainXp()`), `sellItem()`, `discoverPlace()`; events.js only shows toasts.
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

- STATUS: S.P.E.C.I.A.L. (STR, END, CHA, INT, AGI; raised **only** by confirmed level-up points),
  skills (CONCENTRATION, KNOWLEDGE, SPEECH, SURVIVAL, COOKING, FINANCE, MUSIC, BUSINESS; −/+ allowed),
  Lifetime stats.
- QUESTS: several main quests (types **percent** slider, **streak** daily check-in, **caps** goal
  that follows the wallet and self-completes), bonus objectives, side quests (XP + one skill +3)
  and daily quests (XP), quest names
  (tap to rename), completion animation + banners, confirmations before removing.
- ITEMS: categories SELL ("THINGS TO SELL", price + Sold → CASH + 25 XP + journal line), APPAREL,
  AID, MISC, IMPORTANT (WEAPONS migrated to MISC); move between categories; wallet holdings with
  manual CAD rates, **1000 CAD = 1 Cap**; 3D wireframe model per category.
- MAP: see architecture; DISCOVERED banner + XP once per place (50 city / 100 region). Routes
  (road trips between nearby cities; the owner picks the stops, never auto-linked; no XP).
- LOG: journal → proposal (XP + skills only, never SPECIAL) → Accept/Reject.
- Look & feel: CRT vignette/flicker, scanlines, bezel with rounded corners (+ screws ≥600px), glass
  glare, physical tab keys, recessed panels, faint "PIBBOY 3000" plate, animated amber mascot
  (stepped Vault-Boy-style gestures per tab; MAP = "scout"), tab swing transition, 3D tilt (opt-in).
- Sounds: boot, tick (scroll/slider), press, tab, complete, levelUp, quest, discover, sold, error,
  step (skill ±), mapSelect; power-on screen; Sound / Power-on / Custom sounds footer links.
- Data safety: dual storage, backups with dated file names (share sheet on phones), a "Last backup"
  footer line + a once-a-day notice when one is due (`lastBackup`, `backupDue()`), cross-tab conflict
  handling, CSP. RADS meter in the header (`rads()`: 40/day since `lastBackup`, max 1000; tap =
  export = RadAway). Live ONLINE/OFFLINE topbar (main.js).
- PWA: installable, offline (fonts local, city list precached).

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
   owner asks (maybe later). Skills come from Analyze, the −/+ buttons and quests' `skillGains`:
   main quests, and **side quests** (+3 of one skill, `SIDE_SKILL_GAIN`, paid once by
   `completeSide()`; s1–s4 got theirs by migration). **Daily quests give XP only** (owner's choice
   2026-09-24: +1/day would max skills in months).

## 5. Workflow

- Working copy: `C:\Users\ibra6\Desktop\PIBBOY` (git remote `origin`, credentials in Git Credential
  Manager). Node v24 at `C:\Program Files\nodejs`. Git at `C:\Program Files\Git\cmd`.
- Each change: edit → `node --test` → browser check → commit (with the Co-Authored-By line) →
  `git push origin main` (= deploy to Pages in ~1 min) → confirm Actions "Tests" + "pages build" green.
- Bump `CACHE` in `sw.js` when files are added/removed; add new app files to `APP_SHELL`.
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
  French objective ("Obtenir 5 caps") is not auto-converted.
- Scroll ticks only follow window scrolling (not inner scroll areas such as the custom-sounds panel).
- Right after a deploy, one open on a weak signal (>2.5 s) may mix old cached and new files; the next
  open is whole again.
- The MAP opens on Montréal (`HOME` in `map.js`), not on the whole world.
- Routes need a connection when added (OSRM's public demo server; if it ever goes away, another
  OSRM/Valhalla server with CORS can replace `ROUTER` in `routes.js` and the CSP). Removing a city
  doesn't remove the routes through it.
- 3D models: canvases are small (78×44 CSS px) and weren't reviewed on a real phone yet; after a
  WebGL context loss they stay hidden until reload.
- Custom sounds and 3D tilt choice are per device/origin; on iPhone the Home Screen app and Safari
  have separate storage.
- Footer settings links are small and easy to miss (owner couldn't find "Custom sounds" at first).

## 7. Pending / waiting on the owner

- Owner feedback on the latest pushes: 3D model size/readability, bezel/glare/plate, MAP "scout"
  gesture, caps quest on the real wallet.
- Proposal awaiting an answer: move Sound / Power-on / Custom sounds / 3D tilt into a proper
  **⚙ SETTINGS** section.
- Deferred: "PIBBOY 2.0" roadmap (reward engine, custom skills with XP, weekly/auto quests,
  achievements, dashboard). Owner chose to polish V1 first.

## 8. Exact next engineering steps

1. Collect the owner's phone feedback and adjust: `canvas.item-model` size in `css/terminal.css`,
   `.crt-glare` opacity, `.device-plate` opacity, `mascotScout` keyframes.
2. If approved, build the **SETTINGS** section (render.js + events.js + css), keeping the element ids
   `tilt-btn`, `sound-btn`, `power-btn`, `sounds-btn` so `tilt.js`/`sfx.js` keep working; add tests.
3. Extend `CAPS_OBJECTIVE` in `state.js` with French verbs (obtenir|avoir|atteindre|gagner) — a new
   one-time migration flag is needed since `capsQuestsLinked` is already set on existing saves.
4. (Done: caps quests re-sync after import, reset and another window's save.)
5. Optional next features the owner showed interest in: STATUS 3D globe with revealed places
   (`SphereGeometry` already in the Three bundle; reuse items3d's shared renderer), Fallout-style
   full-screen LEVEL UP screen.
