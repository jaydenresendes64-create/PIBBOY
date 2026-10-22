# MALIK // Status Terminal

A personal, Fallout-inspired life tracker: S.P.E.C.I.A.L. stats, skills, main / side / daily quests,
inventory, a Caps wallet, and a journal that turns diary entries into XP and skill proposals you
accept or reject. In ITEMS, **THINGS TO SELL** keeps an asking price per item; tapping **Sold** puts
the money in the wallet's CASH row, gives 25 XP and writes the sale in the journal. The **⇄** button on
an item moves it to another category (its asking price is kept for if it goes back to THINGS TO SELL).
Beside each ITEMS category, a small 3D model drawn in amber wireframe turns slowly, like the items in a
Fallout 4 Pip-Boy (a price tag, a vault jumpsuit, a first-aid kit, a crate, a key); drag one sideways
to turn it by hand.

**BOOKS** (end of ITEMS): the books you've read. **+ New book** opens the form: the title, the author
(optional) and the skill it raised, **+1 to +5** (or no skill). **Add** gives **+50 XP** and those
skill points at once (a BOOK READ banner), and the book joins the list with the day you finished it,
the latest first. Removing a book from the list keeps what it gave.

**VITALS** (its own tab, from your in-Claude version): the day's **check-in**: energy, mood, hunger,
tension, sleep and craving from 0 to 10 (each slider says what its 0 and 10 mean: energy drained → full,
mood very low → great, hunger not hungry → starving, tension relaxed → very tense, sleep is last night,
awful → great, craving none → overwhelming), the resting pulse, and two counters (RADS // type N and T).
**Log check-in** gives **+15 XP** once a day and trains Intelligence; what you change after it is
kept. At the bottom, the last 7 entries with their averages. The **urge decoder**: name the real
need (hungry, angry, lonely, tired, or none of these), read what to do first, and leave the room for a
**20-minute timer** (it keeps running when the app is closed). Under the clock, one message at a time
and **Another angle** for the next: what might be behind it (DECODER), REALITY CHECK, DIRECT, INNER
DIALOGUE, STRATEGY, and WHY (your chem-free day and the next milestone). What the app already knows
comes first, as questions: a short night or high hunger at today's check-in ("You logged sleep 2 this
morning. Could tiredness be part of this?"), the urges of the same kind you rode out before and how
many rounds the last one took, a second round, a late hour. The rest change from one urge to the next,
and none comes back until all have shown. Without a check-in or a history, it uses the general ones.
While the clock runs you can note, if you want: **how strong** it is (0-10), **what set it off**
(stress, boredom, people around, alone, usual time or place, something I saw, celebrating, pain or
discomfort) and **what you're doing about it**: your own list of ways (six to start with; **+ Mine**
adds one, **Edit** removes). The way you've most often ridden urges out with comes first among the
messages ("“Walk outside”: you rode it out 3 of the 4 times you used it. Worth a go now?"). Tapping
what set it off shows one practical thing to do about that trigger at once, and how urges set off
the same way went before ("Urges set off by being alone before: 2 of 3 ridden out.").
At zero: one question to look back with (REFLECTION), then **Rode it out** (**+40 XP
and +1 SURVIVAL**, 3 times a day; logged every time), **Still strong** (another round) or **I gave in**
(at any point: logged as it was, no XP lost, no streak reset; a lapse on a streak stays your call;
tapped by mistake? **Undo**, right after, and the urge runs on where it was).
Then one line for next time, if you want: the next urge brings back the latest one you wrote after
an urge you rode out (YOUR WORDS, the same need first). Once 3 urges are logged, **patterns** from your own log:
the way most often ridden out with, what most often sets them off (and how those ended), how the
strong ones (7 or more) ended next to the milder ones, the time of day most come at,
the intensity lately, how many were ridden out (counted, never a cause); **Last urges** lists them. The day of a
lapse, the streak card and the decoder each show a way back (RESET), without blame. The support
line (1-800-265-2626, 24/7) and when to call 911 are always on the card. When a round ends, the app says so
whatever tab is open (a sound and a notice). A small light on the **VITALS** tab key shows, from every
tab, a timer running (pulsing) or over (steady), or today's check-in still to do (dim). The RobCo boot
also shows the chem-free day and whether today's check-in is done.

**The morning** (the app opens on **VITALS**): the screen says what to do today. Its three cards come
in the order that matters today: the **urge decoder** first while its timer runs or after a craving of
6 or more (today's check-in, or yesterday's), the **chem-free streak** first the day before a milestone
("Day 7. Tomorrow: +150 XP."), else the **check-in**, then the streak, then the urge decoder. The sliders start from your last check-in, shown
above them ("Yesterday · energy 4 · sleep 3 · craving 7"), so a day like yesterday is one tap. Under
the button, the Intelligence training (`INT 5 · TRAIN 15/300`). Once logged, the check-in folds into one
line, then what your check-ins say, a few short lines, each only when the data says something:
**STATUS** (a level past its line, or the lowest or highest in your recent check-ins), **TREND** (a
level going one way several check-ins running, today against your average or since the last one,
how regularly you checked in, urges ridden out this week against last), **PRIORITY** and **ACTION**
(the one level that deserves attention today and one small step; for a craving, a **Decoder** button),
**PATTERN** (a link in your history, like "craving ran higher on days with sleep at 4 or less", only
on such a day and with enough check-ins on both sides, said as a link, never as a cause). The wording
changes from day to day; the numbers don't. Then the **FIELD REPORT** ("INT 5 · TRAIN 30/300.
2 dailies left. 1 trial due. Chem-free day 11 (4 to 14).") and the **NEXT** step: a trial that's due
(**Go** opens it), else the daily quest left the longest (**Go** opens QUESTS). The two counters
(RADS // type N and T) stay on the folded card: a tap on **+** each time, any time of the day; the
"Last 7 entries" table gives their average. **Edit check-in** opens it again. **Check-in first**: until the day's check-in is logged, QUESTS, ITEMS, MAP and LOG wait
(their keys are dimmed; a tap says "Check-in first"); STATUS, VITALS and the urge decoder stay open.
Turn it off in Settings → Morning.

**VITALS' day starts at 4:00**, not midnight: up late, the counters still go to the evening's day,
nothing locks, and the next morning's check-in stays yours to do in the morning. At 4:00 the screen
moves to the new day by itself. Dailies, the streak and trials keep midnight.

**Chem-free streak** (VITALS): set the first chem-free day of the run; the card shows the day,
the next milestone and the days to go. Milestones at **7, 14, 30, 60 and 90 days** (+150, +300, +600,
+900, +1,500 XP), each paid once a run, by itself, the moment it's reached; correcting the start date
never pays one twice. **Log a lapse** asks first: the run's days stay in your totals (and best run),
no XP is lost, and the count starts again tomorrow. **Urge? Decode it** opens the urge decoder.

**Your own streaks** (VITALS, under the chem-free one): **+ New streak**, then a name only you will
see and the run's first day. Each one works like the chem-free streak: the same milestones and XP
(7, 14, 30, 60 and 90 days: +150 to +1,500 XP, each once a run), **Log a lapse** asked first (the
days stay in its total and best run, no XP is lost). **Edit** renames it, moves its first day, or
removes it (asked first; the XP it gave stays). Up to 10. The name lives only in your data (on the
device and in your backups), never in the app's code; it's not on the RobCo boot, in the field
report or on STATUS. While a run is under way, the urge decoder's WHY lines include it.

**TRIALS** (VITALS tab, second button at the top): physical tests to repeat about **once a week**, to
see yourself get stronger. Built in: **Push-ups** (most in one set, trains STR), **Plank** (longest
hold, END), **Squats** (most in 60 seconds, AGI), **1 km** (fastest, walking or running, END) and
**Distance** (your longest walk or run, END: you type the km yourself, `5.4`).
**Start** opens the trial: a 3-2-1, then a stopwatch (plank, 1 km) or a 60-second countdown (squats);
for reps, a big button to tap at each one (or touch it with your chin for push-ups). You can also
type the result yourself (seconds as `1:30`). Saving asks first: a **new record** gives **+50 XP**
(a NEW RECORD banner), any other result **+15 XP**, once a trial a day; a distance pays by the km
instead: **+5 XP a km** (at most 100), and +50 more for a new record (6 km: 30 XP, or 80 as a record).
The XP trains the trial's stat. Each card shows the record, the last results as bars, the next goal, and **DUE** when the
last try is 7 days old or more. **+ New trial** adds your own (name, kind, stat), **×** hides a
built-in one (Show brings it back) or deletes yours, and a result can be removed (its XP stays).
The tab key's light pulses while a trial's timer runs, and the RobCo boot says how many are due.

**1 km with Strava**: the 1 km trial has a **Run with Strava** button (a distance has **Start with
Strava**, the same shortcut). It opens a shortcut of yours
in the iPhone's Shortcuts app, named exactly **PIBBOY Run**, which starts the run in Strava (no link
can start a Strava recording by itself, so the shortcut does it). To make it, once: in Strava, turn
on its Siri shortcut for starting a run (its settings, or the "Add to Siri" button); then in
Shortcuts, **+**, add Strava's start-a-run action (if Strava doesn't offer one, **Open App** →
Strava, and tap Record yourself), and name the shortcut **PIBBOY Run**. The first tap, iOS asks to
let PIBBOY open Shortcuts. Back in PIBBOY after the run, type your 1 km time from Strava (its
first split, e.g. `5:42`), or the distance it shows (`5.4`), and save it.
Warm up first; stop if you feel chest pain, dizziness or short of breath.

**Training** S.P.E.C.I.A.L.: a daily quest can train a stat (pick it when adding: "Trains STR"...). Its
XP adds up under that stat in STATUS (`TRAIN 120/300`), and every **300 XP** is **+1 point** (a
TRAINED banner), up to 10. The VITALS check-in trains Intelligence the same way, and TRIALS train
their own stat. Level-up points still
work as before.

**Perks** (STATUS tab): each level-up gives a perk point as well as its S.P.E.C.I.A.L. point. Open the
**Perk chart** and take a perk (it asks first); each rank needs its stat a little higher. Every perk
changes a real reward: **Wanderer** (END 3) +25 XP a rank for each new route · **Cartographer** (INT 4)
+25% a rank discovering a city or region · **Iron Will** (END 4) +10 XP a rank per streak check-in ·
**Barter** (CHA 3) selling gives 2×/3× the XP · **Scholar** (INT 5) +1 a rank on every skill gain from a
quest · **Creature of Habit** (STR 3) daily quests +5 XP a rank · **Comprehension** (INT 3) journal
entries +20% a rank · **Quick Hands** (AGI 3) bonus objectives +25% a rank. A save from before perks
got the points its level-ups would have given.

**Holotapes** (LOG tab): journal entries in your own voice. **Record a holotape** asks for the
microphone the first time, shows a level meter and the time, and stops by itself after 5 minutes (or
when the app goes to the background; what was recorded is kept). Each tape plays back on the Pip-Boy
(its reels turn), can be renamed, shared (the share sheet: Save to Files, AirDrop...) or erased (asks
first). The recordings stay on this device only, in their own storage: they are not in the backup
file (too big), so use a tape's Share button to keep a copy.

**Last 7 days** (STATUS tab, above Lifetime): XP gained, check-ins (out of 7), urges ridden out (and
given in to), dailies done, trials logged (and records), quests completed, each next to the 7 days
before; counted from what's recorded only, and hidden until something is. The RobCo boot says it in
one line.

**Bobbleheads** (STATUS tab): 16 collectibles for real milestones, each with its own trophy on the
shelf, found by themselves the moment one is reached (a banner showing the trophy, a springy sound,
+50 XP each): Vault Dweller (level 5: a vault door), Wasteland Veteran (level 10: a medal), Devotion
(a day-streak quest completed: an eternal flame), Capitalist (a Caps goal completed: a money bag),
Merchant (an item sold: scales), Errand Runner (10 side quests: a running boot), Creature of Routine
(30 daily quests: an alarm clock), Explorer (10 cities: a compass), Globetrotter (places in 5
countries: a globe), Bookworm (5 books read: a stack of books, the top one open), Scribe (25 journal
entries: a quill and inkwell), Specialist (a skill at 50: a bullseye), S.P.E.C.I.A.L.ist (a stat at
10: the atom), Perk Collector (3 perks: perk cards), Rad-Free (a backup made: RadAway), Archivist (5
holotapes: a tape). Each is drawn in detail (bolts, a beaded rim, engraved graduations, a glint of
light, a faint amber volume) on a collector's stand with its plate and rivets; the ones not found yet
are dim outlines. Tap one to see what it is and when it was found; the ones still hidden say
how to find them. A save from before them finds the ones it already earned, all at once.

Main quests track their progress three ways: a **percentage** slider, a **day streak** (one check-in a
day; missing a day starts it over), or a **Caps goal**: the bar follows the wallet by itself (`1.50 / 5 CAPS`)
up to the target. A quest saved before Caps goals existed whose objective is a Caps amount ("Obtain 5
Caps") switches to one automatically, once. A percentage or Caps quest at 100% never completes by
itself: a **COMPLETE QUEST · +XP** button appears, and its tap pays the reward. A slip of the finger on
the slider, or a typo in the wallet, pays nothing (slide back, or fix the wallet, and the button goes).
A streak quest completes with the check-in that reaches its target.

Side quests can raise a skill too: **+3** of the skill picked when adding one (the first four: KNOWLEDGE,
FINANCE, SURVIVAL, MUSIC), given once with the XP. Daily quests give XP only (and can train a
S.P.E.C.I.A.L. stat, see Training). Skills otherwise come from Analyze, books and urges ridden out.
In STATUS, tap a skill to see where its points came from (**Earned**: quests done, books, journal
entries, urges ridden out) and what's still to come (**Coming**: open quests that give it); under each
skill, a short line says the next one coming or the latest earned. Skills have no − / + buttons: their
points come from what you do.

In QUESTS, each list's add form stays folded behind its **+ New main / side / daily quest** button
until you tap it (the cursor goes into its first box); **Cancel** folds and empties it, and adding a
quest folds it too. Every section title has a small lit marker and a line fading out after it.

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
js/mascot.js        when the mascot walks or gestures (his moves, part by part, are in css/terminal.css)
js/crt.js           the screen's rare flicker (the tube look itself is in css/terminal.css)
js/tilt.js          3D tilt: the screen's layers follow the phone's motion (or the mouse)
js/sfx.js           sounds, all made in code (no audio files), and the power-on screen
js/weather.js       the real weather (Open-Meteo), read the Pip-Boy way
js/boot.js          the RobCo boot: the startup typed with your real status, once a day
js/sfx-custom.js    "Custom sounds": your own clips, cut from a video or audio file, kept on the device
js/places.js        the MAP tab's logic: positions, city and region lists, finding and revealing places
js/fog.js           MAP: the fog of war (flat map and globe), the globe's glow, drawn with WebGL in the map's frame
js/map.js           the MAP tab (loads MapLibre the first time it's opened)
js/bulk.js          MAP: "Add several places" (paste a list, review it, reveal it all)
js/routes.js        MAP: routes (road trips): stops, the road traced once (OSRM), its line and card
js/radar.js         MAP: the scanner, a radar sweep whose blips are real undiscovered cities
js/holotapes.js     LOG: holotapes, voice recordings kept on the device (their own IndexedDB)
js/insight.js       VITALS: what the check-ins say (STATUS, TREND...) and the urge decoder's messages
js/vitals.js        VITALS (check-in, urge decoder, chem-free streak, last 7 days), the morning path
js/trials.js        VITALS: TRIALS (weekly physical tests, records, timers, tap counter)
vendor/maplibre/    MapLibre GL JS 6.11.2, the map library (licence: vendor/maplibre/LICENSE.txt)
vendor/three/       Three.js r186, only the parts ITEMS uses (licence: vendor/three/LICENSE)
js/events.js        user actions
js/main.js          startup
sw.js               service worker: offline use (network first for the app, so updates show right away)
manifest.webmanifest name, colours and icons (icons/) for installing on a phone
images/vaultboy/    the Vault Boy walking on the level gauge (the hand on his hip ahead, the thumb behind):
                    the original one (images/mascot-parts.png) for
                    levels 1-4, then one outfit per tier (5, 10, 20, 30, 50): lvlXX.png in colour (the
                    sources, not loaded by the app) and
                    parts-lvlXX.png, the same in amber cut into parts that each move, with round hips and
                    knees (js/render.js syncWalker);
                    walk-lvl05.png, the level 5 outfit's walk as 16 amber drawings (Gemini's 8 and an
                    in-between after each, made by tools/vaultboy-walk.py), shown in turn while he walks,
                    at levels 1-9 (walk-lvl05-source.webp: the sheet of poses they come from, not loaded)
images/mascot.png   the old corner mascot's picture (288x408), the source of his parts (hidden since 2026-10-10)
images/mascot-parts.png  the mascot cut into parts that each move (legs, knees, thumb arm, body, head, blink)
data/map-style.json MAP: the map's own amber Pip-Boy style (colours, line widths, labels, by zoom)
data/places.txt     MAP: every country, region and city (15,000 people or more), for searching
data/regions/       MAP: one file per country with the shapes of its regions
tools/              build-map-data.js, which makes data/ (see "Map data"); build-three.mjs, which makes
                    vendor/three/ from the parts listed in three-entry.mjs; mascot-parts.py, which cuts
                    images/mascot.png into images/mascot-parts.png (Python with Pillow and numpy);
                    mascot-moves.py, which writes the mascot's moves into css/terminal.css (Python);
                    vaultboy-parts.py (amber + parts for the five outfits), vaultboy-walk.py (an outfit's
                    drawn walk from a sheet of poses) and vaultboy-moves.py (his walk on the level gauge,
                    worked out from where his boots go), the same for the Vault Boy; perf-check.js,
                    how hard the app works on a phone (opening, each tab sitting still: see HANDOFF)
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
Settings (About) show `AI analysis: offline rules`.

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

## Settings

The **⚙** in the topbar (beside the date) opens Settings, over the app: **Display** (3D tilt, the
power-on screen and its RobCo boot), **Morning** (Check-in first: the tabs that wait for the day's
check-in, on this device), **Sound** (sound on/off, Custom sounds), **Data** (Export backup
= RadAway, with the last backup's date; Import backup (before anything is replaced, it shows the backup
next to this phone: level, XP, check-ins, urges, when each was last used, and warns when the backup is
older or would lose XP, check-ins, urges, journal entries or places); **Add from the old terminal**: from a backup of
your in-Claude version, it adds only its VITALS check-ins, chem-free streak, urges, training and the
daily / side quests not here yet, after saying what (adding the same file twice adds nothing); Reset
progress, which asks first; holotapes and
custom sounds are in neither the backup nor the reset, they stay on the device, and it says so) and
**About** (the journal's analysis mode and the credits). Each setting is a whole row to tap, its
state shown as `[ ON ]` / `[ OFF ]`. × , Escape or a tap outside closes it.

## 3D tilt

The **3D tilt** switch in Settings makes the screen's layers follow the phone's motion (or, lightly,
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
| step / map select | a − / + button (VITALS' counters) / a place opened on the MAP |

When the app opens, a black screen says **TAP TO POWER ON**; the tap plays the boot sound while the
screen lights up like a tube (browsers only allow sound after a tap). Two switches in Settings, remembered on
each device: **Sound: on/off** and **Power-on: on/off** (with power-on off, the app opens directly and
the boot sound plays on the first tap). The phone's own volume and silent switch apply as usual.

**RobCo boot** (`js/boot.js`): the first power-on of the day, the terminal then types its startup
letter by letter, about 2.5 seconds: the RobCo logon, then your real status (level and XP, quests,
today's dailies, a streak quest's day, the last 7 days, S.P.E.C.I.A.L. points waiting, rads and the last backup) and
the weather outside. A tap shows it all at once; a second tap (or the end) opens the app. Not with
Power-on off, nor with Reduce Motion.

**Weather** (`js/weather.js`): Montréal's real weather beside the date in the topbar (☂︎ 14°C); a
tap reads it the Pip-Boy way ("RAD-STORM INCOMING — SEEK SHELTER" when it rains, "NUCLEAR WINTER
CONDITIONS" in snow, "FOG BANK — WATCH FOR FERAL GHOULS"...). From [Open-Meteo](https://open-meteo.com)
(free, no key, CC BY 4.0, credited in Settings), asked at most every 30 minutes, for Montréal only
(never your position), and kept on the phone for offline for 3 hours; an older reading isn't shown
(the boot says NO SIGNAL) rather than pass for the weather now.

### Custom sounds (your own clips)

**Custom sounds** (in Settings) replaces any sound with a clip of your own (`js/sfx-custom.js`):

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
pinch on the phone (drag and the mouse wheel on a computer); the map always stays north up (never
rotated or tilted), and goes from the whole world to zoom 19 (a few houses). **Zoomed out, it's a
globe**: a round Earth you turn with your finger, in space, with an amber glow around it and a few
still stars; zooming in, it flattens out into the usual map (fully flat from zoom 12). It opens on Montréal. The round buttons on the
map: **⌖** recenters on your latest place (Montréal when there's none yet), **⛶** zooms to show all
your places. Each city is an amber diamond and each pin a dot, sized by the zoom so they never cover
the map: small points over the whole world (about 6 px), their usual size at a city (as the map opens
on Montréal), a little bigger in the streets. They stay just as easy to tap (the tap area doesn't
shrink), and the place that's open keeps its full size.

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

**Fog of war:** dark, smoky amber-grey clouds cover all the land: three layers of cloud of
different sizes, each drifting slowly its own way, a little brighter on their edges, with a fine
grain. They're stuck to the world, so they move with the map when you drag and grow with it when you
pinch. Only the exact places you've been are cut out of it: a circle around each city and pin, the
exact shape of each region, a corridor along each route's road, with soft edges that billow gently
like smoke pulling back. Sizes are
real distances, so a 5 km circle stays 5 km whatever the zoom. A newly revealed place clears in
over about a second and a half; a removed one fogs over again. **The oceans and seas always show**,
over the fog, with their names (Pacific, Atlantic, Indian, Arctic, Southern, Mediterranean...), and
so do the continents' names when the whole globe is in view; lakes and rivers stay under the fog
until you reveal them. On the globe the same fog wraps the sphere (the clouds turn with it, with no
seam), and it hands over smoothly to the flat map's as you zoom in. The scanner only finds places on
the side of the globe facing you.

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
- **Add a route (a road trip):** the roads you drove between cities close to each other, like
  Toronto → Ottawa → Montréal. Pick the stops in the order you travelled, from your cities and pins
  (the nearest to the last stop first, with the distance) or by tapping them on the map, then
  **Trace the road**. The fog clears in a corridor 3 km wide along the real road (the 401, the 417...),
  from the first stop to the last, and the map draws it as an amber dotted line. Nothing is ever linked
  by itself, so a flight (Vancouver → Toronto) is simply never added. The road is traced once, online,
  by [OSRM](https://project-osrm.org)'s free public server (OpenStreetMap roads, for reasonable
  non-commercial use, at most one request a second; only the stops' positions are sent), then kept
  in your save (about 2 KB for 650 km), so it shows offline. Routes give no XP. Tap a route in the list
  (or its line on the map) to see it whole, rename it, add a note or remove it.
- Tap a place in the lists (or its mark on the map) to go there, rename it, resize it, add a note or
  remove it (asks first).
- **Scanner** (the ◎ button on the map): a Pip-Boy radar sweeps the map. Its blips are real places:
  the 24 biggest cities in view that you haven't revealed yet (not the ones inside a revealed city,
  pin or region), lit as the sweep passes and fading like phosphor, with a soft ping. Tap a blip: what
  it is, its population, how far it is from your nearest place, and **I've been there** to reveal it
  (DISCOVERED, 50 XP). Works offline (the city list is on the phone); still with Reduce Motion.
- The line above the map counts your places: "3 countries · 14 cities · 5 regions · 8 pins" (and
  "· 2 routes" once you have some). The countries are the ones your cities, regions and pins are in.
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

- **History:** everything that happens is recorded as an event, in order: quests, dailies, bonus
  objectives, check-ins, journal entries, sales, places discovered, routes, bobbleheads, level-ups,
  perks, S.P.E.C.I.A.L. points (spent or trained), backups, holotapes, VITALS check-ins, chem-free
  milestones and your own streaks' (with their name), urges ridden out, TRIALS (with the XP each gave, perks included). The
  latest 2,000 are kept, in the save and in backups. Nothing shows it yet: it's the base for a weekly
  summary, quests that progress by themselves, and statistics. A save from before it starts empty.

- Saved in the browser you use, twice (IndexedDB and localStorage): if one copy is damaged, the
  other is used. If neither can be read, the app says so and changes nothing rather than starting
  empty. Another browser or device starts empty. Use **Export backup / Import backup** in Settings
  to move it (a backup is saved as `status-terminal-backup-YYYY-MM-DD.json`, dated the day you made it). An imported file is checked (and brought up to date if it comes from an older
  version) before you confirm; a file that isn't a backup is refused and nothing changes.
- **Backups on iPhone:** Export backup opens the share sheet (Save to Files, iCloud Drive, AirDrop...),
  since a Home Screen app can't download a file; on a computer it downloads. Settings show the
  last one ("Last backup: 3 days ago", marked ▲ when it's been 14 days or more, or never with
  progress to lose), and a notice says so once a day while one is due, with a Geiger crackle.
  Everything lives on the phone: a backup file is the only other copy.
- **RADS** (beside the XP, in the header): the same reminder, the Fallout way. Rads build up 40 a day
  since the last backup (560 at 14 days, 1000 at most; 1000 when never backed up with progress to
  lose). Tap the meter for a **RadAway**: it makes the backup, and the rads drain back to 0.
- The topbar's **ONLINE** is real: it says OFFLINE (red dot) with no signal. Everything still works
  offline except loading new map tiles, tracing a route and the weather.
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
host that runs serverless functions (such as Vercel); there, Settings show `AI analysis: on` once
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
