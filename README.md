# MALIK // Status Terminal

A personal, Fallout-inspired life tracker: S.P.E.C.I.A.L. stats, skills, main / side / daily quests,
inventory, a Caps wallet, and a journal that turns diary entries into XP and skill proposals you
accept or reject. In ITEMS, **THINGS TO SELL** keeps an asking price per item; tapping **Sold** puts
the money in the wallet's CASH row, gives 25 XP and writes the sale in the journal. The **⇄** button on
an item moves it to another category (its asking price is kept for if it goes back to THINGS TO SELL).
Beside each ITEMS category, a small 3D model drawn in amber wireframe turns slowly, like the items in a
Fallout 4 Pip-Boy (a price tag, a vault jumpsuit, a first-aid kit, a crate, a key); drag one sideways
to turn it by hand.

Main quests track their progress three ways: a **percentage** slider, a **day streak** (one check-in a
day; missing a day starts it over), or a **Caps goal**: the bar follows the wallet by itself (`1.50 / 5 CAPS`)
and the quest completes on its own when the wallet reaches the target. A quest saved before Caps goals
existed whose objective is a Caps amount ("Obtain 5 Caps") switches to one automatically, once.

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
js/items3d.js       ITEMS: the turning 3D wireframe models (loads Three.js the first time ITEMS opens)
js/mascot.js        when the mascot walks or gestures (his moves are in css/terminal.css)
js/crt.js           the screen's rare flicker (the tube look itself is in css/terminal.css)
js/tilt.js          3D tilt: the screen's layers follow the phone's motion (or the mouse)
js/sfx.js           sounds, all made in code (no audio files), and the power-on screen
js/sfx-custom.js    "Custom sounds": your own clips, cut from a video or audio file, kept on the device
js/places.js        the MAP tab's logic: positions, city and region lists, finding and revealing places
js/fog.js           MAP: the fog of war, drawn with WebGL in the same frame as the map
js/map.js           the MAP tab (loads MapLibre the first time it's opened)
js/bulk.js          MAP: "Add several places" (paste a list, review it, reveal it all)
vendor/maplibre/    MapLibre GL JS 6.11.2, the map library (licence: vendor/maplibre/LICENSE.txt)
vendor/three/       Three.js r186, only the parts ITEMS uses (licence: vendor/three/LICENSE)
js/events.js        user actions
js/main.js          startup
sw.js               service worker: offline use (network first for the app, so updates show right away)
manifest.webmanifest name, colours and icons (icons/) for installing on a phone
images/mascot.png   the amber mascot in the top-right corner
data/map-style.json MAP: the map's own amber Pip-Boy style (colours, line widths, labels, by zoom)
data/places.txt     MAP: every country, region and city (15,000 people or more), for searching
data/regions/       MAP: one file per country with the shapes of its regions
tools/              build-map-data.js, which makes data/ (see "Map data"); build-three.mjs, which makes
                    vendor/three/ from the parts listed in three-entry.mjs
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

## Sounds

Original sound effects in the spirit of the Fallout Pip-Boy, all made in code with the Web Audio API
(`js/sfx.js`): there are no audio files and nothing is copied from a game. They go through an "old
speaker" filter so they sound mechanical and lo-fi:

| Sound | When |
|---|---|
| boot: relay click, rising whine, tube thunk, crackle into a hum | tapping the power-on screen |
| tick: a dry knob detent | scrolling a list (one per row), moving the progress slider (every 10%) |
| press / tab | any button / switching tabs |
| complete | a quest, bonus objective, daily quest or streak check-in |
| level up / quest / discover / sold | the LEVEL UP, QUEST COMPLETED, DISCOVERED and SOLD banners |
| error | a failed save, a rejected import |
| step / map select | a skill's − / + button / a place opened on the MAP |

When the app opens, a black screen says **TAP TO POWER ON**; the tap plays the boot sound while the
screen lights up like a tube (browsers only allow sound after a tap). Two footer links, remembered on
each device: **Sound: on/off** and **Power-on: on/off** (with power-on off, the app opens directly and
the boot sound plays on the first tap). The phone's own volume and silent switch apply as usual.

### Custom sounds (your own clips)

The footer link **Custom sounds** replaces any sound with a clip of your own (`js/sfx-custom.js`):

- **Choose a video or audio file** (mp4, m4a, mp3, wav…): every separate sound in it is found and
  listed (#1, #2…), plus **ALL** for the whole file. Play each with ▶, trim it with its start/end
  times, and pick **Use as…**. Most sounds keep at most 6 s; **Level up** and **Main quest completed**
  can play a whole piece of music, up to 60 s.
- **Reset** puts a sound back to the built-in one.
- **Export / Import sound pack** moves all your clips to another device in one file
  (`pibboy-sound-pack.json`), for example cut on a computer and imported on the phone.

Your clips stay on your devices: they're kept in the browser (IndexedDB, separate from the saved
data), never in this public repository (`.gitignore` excludes sound packs and video files) and never
in backups.

## MAP tab

A crisp vector map of the whole world, down to street level (street names, buildings, shops and
places, train and metro lines and stations), drawn in the app's own amber Pip-Boy style. Drag and
pinch on the phone (drag and the mouse wheel on a computer); the map always stays north up and flat,
and goes from the whole world to zoom 19 (a few houses). The round buttons on the map: **⌖** recenters
on your latest place (the whole world when there's none yet), **⛶** zooms to show all your places.

- **Map library:** [MapLibre GL JS](https://maplibre.org) 6.11.2, kept in `vendor/maplibre/` (no CDN;
  the files are the package's, with only the source-map comment line removed). It draws the map with
  the phone's graphics chip, sharp on retina screens. It's only loaded the first time you open MAP, so
  the app starts as fast as before. It's a JavaScript module, so the map needs the app opened from its
  web address (like the city list); opened straight from disk, MAP says so.
- **Map data (vector tiles):** [OpenFreeMap](https://openfreemap.org), chosen because it's free with
  no key, no account and no limit on map views, it's made from OpenStreetMap (the most detailed map
  there is), and it uses the common OpenMapTiles layout, so the style is ours to write. Its terms:
  free for any use, the credit must show ("OpenFreeMap © OpenMapTiles Data from OpenStreetMap", in
  the map's corner, which also covers geoBoundaries' "© OpenStreetMap contributors" below), and no
  bulk or automated downloading, so the app only keeps tiles you've actually looked at.
- **The style** (`data/map-style.json`) is a real MapLibre style, not a colour filter: near-black
  ground; amber roads, brighter and thicker as they get bigger, with a soft glow on motorways and main
  roads; darker amber water with lit shores; dim amber building outlines from street level; parks and
  woods barely tinted; dashed borders, railways with ties, metro lines in tunnels; place names in
  VT323 and street, shop and station names in IBM Plex Mono, with a faint warm glow. The labels use the
  app's own font files (`fonts/`), so they work offline; letters those files don't have (Polish,
  Arabic, Chinese...) come from the phone's own fonts. Names are shown in Latin letters when the map
  has them.
- **Offline:** tiles you've looked at are kept on the phone (at most 800, about 50 MB, the oldest go
  first; never downloaded ahead) and refreshed in the background once a month, so places you've seen
  still show offline. MapLibre, the style and the fonts are saved with the app when it installs. A
  piece of map never seen shows the old faint grid instead, and the fog and your places still work on
  top.
- With 3D tilt on, the map holds still while your finger is on it, so drags and pinches land exactly.

**Fog of war:** dark, smoky amber-grey clouds cover the whole world: three layers of cloud of
different sizes, each drifting slowly its own way, a little brighter on their edges, with a fine
grain. They're stuck to the world, so they move with the map when you drag and grow with it when you
pinch. Only the exact places you've been are cut out of it: a circle around each city and pin, the
exact shape of each region, with soft edges that billow gently like smoke pulling back. Sizes are
real distances, so a 5 km circle stays 5 km whatever the zoom. A newly revealed place clears in
over about a second and a half; a removed one fogs over again.

The fog is drawn with WebGL (`js/fog.js`) in the same frame as the map, with the map's own camera, so
it can't lag or slide while you drag and pinch. It only moves while the map is on the screen and the
app is open (30 frames a second while the map is still, full speed while you move it), and stops
completely in another tab, scrolled away, or in the background. If the phone can't keep up while you
move the map, the fog lowers its own resolution (it's soft, so that barely shows) and raises it again
later. With **Reduce Motion** on, the fog stays still and changes appear at once.

**Revealing places** (under the map):

- **Search city:** type a name (accents and capitals don't matter; "Paris, Texas" or "Paris, USA"
  narrows it down) and tap it. It reveals a circle around the city: about 3 km for a town of 15,000
  people up to 15 km for a city of 3 million or more. The slider changes it (1-30 km).
- **Mark a region:** pick a country, then one of its provinces, states or departments; the exact
  shape of that region is revealed. In France, Italy, Spain, Belgium and the Philippines you can
  also pick a whole region (Île-de-France, Lombardia...), which reveals all its departments/provinces.
- **Pins:** long-press the map (or right-click on a computer), or tap **Drop pin** and then the map.
  Name it, add a note if you like; it reveals a 500 m circle (100 m to 5 km with the slider).
- **I'm here:** asks for your location once (never followed afterwards) and offers to reveal the
  city you're in, your region, or a pin on the spot.
- **Add several places:** paste a list, one place per line, like `Montréal, Canada` or
  `region: Casablanca-Settat, Morocco` (a region or state after the city narrows it down:
  `Springfield, Illinois, USA`). **Check the list** matches every line against the city list and the
  regions (accents and capitals don't matter) and shows a review before anything is saved: what was
  found (city or region, with its region and country; untick to leave one out), a choice when a
  name is ambiguous or only close names were found (Marrakech → Marrakesh), and lines not found,
  which you can fix and check again, skip, or place by hand with a tap on the map (a 3 km circle with
  that name). **Reveal all** adds them all at once: one DISCOVERED banner, XP once per new place.
- Tap a place in the lists (or its mark on the map) to go there, rename it, resize it, add a note or
  remove it (asks first).
- The line above the map counts your places: "3 countries · 14 cities · 5 regions · 8 pins". The
  countries are the ones your cities, regions and pins are in.
- A city or region revealed for the first time shows **DISCOVERED** and gives 50 XP (city) or
  100 XP (region), once per place: removing it and adding it back gives nothing again. Pins give no XP.

**Map data** (`data/`, made by `tools/build-map-data.js`):

- Cities: [GeoNames](https://www.geonames.org) "cities15000", every place of 15,000 people or more,
  licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (credit: GeoNames,
  geonames.org). `data/places.txt` is about 1.7 MB (about 0.8 MB as sent). It's downloaded with the
  app when it installs (and again with each new version), so city search works offline from the first
  open; the app only reads it the first time you search, mark a region or drop a pin.
- Regions: [Natural Earth](https://www.naturalearthdata.com) 1:10m "Admin 1 – States, Provinces"
  (public domain), version 5.1.2, simplified to about 400 m and split into one small file per country
  (`data/regions/CA.json`...), each loaded only when a region of that country is shown or looked up.
- Morocco's regions: its 12 current regions (since 2015: Casablanca-Settat, Marrakech-Safi,
  Fez-Meknes...) from [geoBoundaries](https://www.geoboundaries.org) (gbOpen release, made from
  OpenStreetMap), because Natural Earth still has the 16 from before 2015. Their licence is
  [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), not CC BY: it asks for the credit
  "© OpenStreetMap contributors" (already in the map's corner) and that `data/regions/MA.json`, made
  from it, stays under ODbL (the file says so in its `source` field). Each region's code is its
  ISO 3166-2 code (`MA-06` for Casablanca-Settat); French spellings are found too (Fès-Meknès).
- To rebuild them (only to update the data), download
  [ne_10m_admin_1_states_provinces.geojson](https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2/geojson),
  `cities15000.zip` (unzipped) and `countryInfo.txt` from
  [download.geonames.org/export/dump](https://download.geonames.org/export/dump/), and
  [geoBoundaries-MAR-ADM1.geojson](https://github.com/wmgeolab/geoBoundaries/tree/5c25134028196d43ce97b5071934fd0cfc92f09f/releaseData/gbOpen/MAR/ADM1)
  (the version used), then run
  `node tools/build-map-data.js ne_10m_admin_1_states_provinces.geojson cities15000.txt countryInfo.txt geoBoundaries-MAR-ADM1.geojson`.
  The files in this repository were made from the copy of GeoNames' cities15000 and country list
  packaged in geonamescache 3.0.2 (the same data, in JSON).

## Run it locally

Double-click `index.html`. Everything works the same as on GitHub Pages, except installing, offline
use and the MAP tab's city and region lists, which need the site to be served over http(s) (for example `npx http-server` in this
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
