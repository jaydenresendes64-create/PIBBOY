# MALIK // Status Terminal

A personal, Fallout-inspired life tracker: S.P.E.C.I.A.L. stats, skills, main / side / daily quests,
inventory, a Caps wallet, and a journal that turns diary entries into XP and skill proposals you
accept or reject. In ITEMS, **THINGS TO SELL** keeps an asking price per item; tapping **Sold** puts
the money in the wallet's CASH row, gives 25 XP and writes the sale in the journal.

Plain HTML, CSS and JavaScript: no framework, no build step.

**Hosted on GitHub Pages:** https://jaydenresendes64-create.github.io/PIBBOY/

## Project layout

```
index.html          markup
css/terminal.css    styles
js/state.js         data model, defaults, reward rules, migrating and checking saves and backups
js/storage.js       saving: two copies (IndexedDB and localStorage), backup files
js/ai.js            journal analysis client + offline keyword rules
js/render.js        builds each tab
js/mascot.js        when the mascot walks or gestures (his moves are in css/terminal.css)
js/crt.js           the screen's rare flicker (the tube look itself is in css/terminal.css)
js/tilt.js          3D tilt: the screen's layers follow the phone's motion (or the mouse)
js/places.js        the MAP tab's logic: positions, city and region lists, finding and revealing places
js/map.js           the MAP tab (loads Leaflet the first time it's opened) and its fog of war
vendor/leaflet/     Leaflet 1.9.4, the map library (licence: vendor/leaflet/LICENSE)
js/events.js        user actions
js/main.js          startup
sw.js               service worker: offline use (network first for the app, so updates show right away)
manifest.webmanifest name, colours and icons (icons/) for installing on a phone
images/mascot.png   the amber mascot in the top-right corner
fonts/              the two terminal fonts, VT323 and IBM Plex Mono (licence: fonts/OFL.txt)
api/analyze.js      optional serverless AI function (not used on GitHub Pages, see below)
tests/              automated tests (see "Run the tests")
.github/workflows/  runs the tests on GitHub after every push
.nojekyll           tells GitHub Pages to serve the files as they are, without Jekyll
```

## Hosting (GitHub Pages)

The app is a static site served by GitHub Pages from this repository:
**Settings → Pages → Deploy from a branch → `main` / root.** Every push to `main` is live at
https://jaydenresendes64-create.github.io/PIBBOY/ a minute or two later.

There is no server and no API key. The journal uses the offline keyword rules in `js/ai.js`, and the
footer shows `AI analysis: offline rules`.

## Install it on your phone / use it offline

Open the site once while online, then:

- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** menu ⋮ → **Install app** (or **Add to Home screen**).

It opens full screen like an app and keeps working without a connection. Updates still arrive
normally: while online the app loads from GitHub Pages like any website (checked against the server
on every open, so a new version shows up the next time you open it), and the copy saved on the phone
is only used when there's no connection. Nothing needs to change in `sw.js` when you update the app.
The terminal fonts are part of the app (`fonts/`), so they work offline from the very first open and
nothing is loaded from Google.

Where your data lives: on Android the installed app shares it with Chrome. On iPhone the Home Screen
app keeps its own data, separate from Safari, so use **Export backup** in Safari and **Import backup**
in the app to bring it over.

## 3D tilt

The footer link **3D tilt: off/on** makes the screen's layers follow the phone's motion (or, lightly,
the mouse on a computer): the glass, scanlines and mascot turn a little, while everything you tap only
shifts a few pixels, so taps land where you aim. It's off by default and remembered on each device.
On iPhone, turning it on asks for motion access (allow it); if iOS asks again after reopening the app,
the first tap anywhere brings the question back. It pauses in the background and never runs with
**Reduce Motion** switched on.

## MAP tab

A world map at city level, tinted amber like the rest of the screen. Drag and pinch on the phone
(drag and the mouse wheel on a computer). The round buttons on the map: **⌖** recenters on your latest
place (the whole world when there's none yet), **⛶** zooms to show all your places.

- **Map library:** [Leaflet](https://leafletjs.com) 1.9.4, kept in `vendor/leaflet/` (no CDN). It's
  only loaded the first time you open MAP, so the app starts as fast as before.
- **Map pictures (tiles):** CARTO's dark basemap ("Dark Matter", made from OpenStreetMap data), chosen
  because its dark greys turn into a clean amber with a CSS filter, it has street-level detail and
  labels, and CARTO allows free use for a personal, non-commercial app (up to 75,000 map views a
  month, far more than one person uses) as long as the credit shows: the small
  "© OpenStreetMap © CARTO" in the map's corner. OpenStreetMap's own tiles would work too, but their
  usage policy asks apps not to lean on their servers, and their bright colours tint poorly.
- Tiles you've looked at are kept on the phone (at most 400, the oldest go first; never downloaded
  ahead), so places you've seen still show offline. With no tile at all, the map shows a plain dark
  background and everything else still works.
- With 3D tilt on, the map holds still while your finger is on it, so drags and pinches land exactly.

**Fog of war:** dark, grainy fog covers the whole world. Only the exact places you've been are cut
out of it, with soft smoky edges: a circle around each city and pin, the exact shape of each region.
Sizes are real distances, so a 5 km circle stays 5 km whatever the zoom. The fog is one canvas
drawn over the tiles, redrawn at most once per frame while the map moves, and only then.

## Run it locally

Double-click `index.html`. Everything works the same as on GitHub Pages, except installing and
offline use, which need the site to be served over http(s) (for example `npx http-server` in this
folder, then http://localhost:8080). Served that way, the browser console shows one harmless 404: the
app checking whether the optional AI function exists (it never checks on GitHub Pages).

## Run the tests

With [Node.js](https://nodejs.org) 20 or newer installed, run this in the project folder:

```
node --test
```

No install step and no dependencies: the tests use Node's built-in test runner and load the app's own
scripts from `js/` with a small fake browser (`tests/helpers.js`). They cover migrating every earlier
save format, checking backup files (including hostile ones), XP and level-ups, skill and
S.P.E.C.I.A.L. limits, selling items, streaks across days, the offline journal rules in English and French, safe
HTML output, and saving (both copies, damaged copies, two tabs).

GitHub also runs them after every push (the **Actions** tab, `.github/workflows/test.yml`): a red ✗
next to a commit means a test failed.

## Your data

- Saved in the browser you use, twice (IndexedDB and localStorage): if one copy is damaged, the
  other is used. If neither can be read, the app says so and changes nothing rather than starting
  empty. Another browser or device starts empty. Use **Export backup / Import backup** in the footer
  to move it (a backup is saved as `status-terminal-backup-YYYY-MM-DD.json`, dated the day you made it). An imported file is checked (and brought up to date if it comes from an older
  version) before you confirm; a file that isn't a backup is refused and nothing changes.
- The MAP tab's places (cities, regions, pins, and which ones already gave XP) are part of the same
  data: saved in the browser and included in backups. A backup from before the MAP tab loads with an
  empty map and nothing else changed.
- The app asks the browser to keep its storage even when space runs low (on a phone this is silent).
- With the app open in two tabs, each follows the other's changes. A change can never overwrite a
  newer one made in the other tab: if both change at the same moment, the second one gives way and
  says so.
- **Coming from the Claude version:** open it in Claude, click **Export backup**, then **Import backup**
  in this app.
- With the offline rules, diary entries never leave your browser.
- This repository is public: never commit a backup file or a key. `.gitignore` excludes both.

## Optional: AI analysis (not used on GitHub Pages)

`api/analyze.js` is a serverless function that sends a diary entry to an AI model. GitHub Pages can't
run it or keep a secret, so the live site never calls it. It only matters if you ever move the app to a
host that runs serverless functions (such as Vercel); there, the footer shows `AI analysis: on` once
the key is set, and the diary text is sent to the AI provider for analysis.

| Variable         | Required | Default                      | Notes                                         |
|------------------|----------|------------------------------|-----------------------------------------------|
| `OPENAI_API_KEY` | yes      | none                         | OpenAI key, or an Azure OpenAI key            |
| `AI_MODEL`       | no       | `gpt-4o-mini`                | model name, or your Azure deployment name     |
| `AI_BASE_URL`    | no       | `https://api.openai.com/v1`  | any OpenAI-compatible `/v1` base URL          |

**OpenAI:** at platform.openai.com, create a project just for this app, give it a monthly budget
limit, and create the key inside it. For a restricted key, enable **Model capabilities** (that covers
`/v1/chat/completions`) and leave everything else at None; if calls fail with a missing
`model.request` scope, use a key with **All** permissions in that dedicated project instead. The
project must be allowed to use the model in `AI_MODEL`. One entry costs roughly 300 input and
50 output tokens.

**Azure OpenAI** (for example with Student Pack credit): deploy `gpt-4o-mini`, then set
`OPENAI_API_KEY` to the Azure key, `AI_BASE_URL` to `https://<resource>.openai.azure.com/openai/v1`
and `AI_MODEL` to the deployment name.

The function only accepts a diary entry and returns a reward proposal (it builds the prompt itself and
caps input and output), so it can't be used as a general proxy to the model. The budget limit is still
your real cost guard. Keep keys in the host's environment settings or in a `.env.local` file, which
`.gitignore` keeps out of the repository.
