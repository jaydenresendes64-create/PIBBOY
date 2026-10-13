/**
 * DATA MODEL — informal reference (no build step here, so this is the
 * closest thing to types/interfaces; keep it in sync when the shape below
 * changes). All of `state` is one JSON document, persisted whole by
 * storage.js (a copy in IndexedDB and one in localStorage).
 *
 * State {
 *   level: number, xp: number, xpToNext: number, lifetimeXp: number,
 *   lifetimeLogEntries: number,             // every accepted entry, even past the LOG_MAX (200) kept in `log`
 *   capsQuestsLinked: true,                 // linkCapsQuests() has run on this document (see migrate())
 *   lastBackup: 'YYYY-M-D'|null,            // the day of the last Export backup (rads, Settings)
 *   unspentSpecialPoints: number,           // level-up points not yet placed
 *   perks: { [perk id]: rank(1-ranks) },    // the perks taken (PERKS); older saves: see migrate()
 *   unspentPerkPoints: number,              // a perk point comes with each level-up too
 *   bobbleheads: { [bobblehead id]: 'YYYY-M-D' },   // the ones found (BOBBLEHEADS), and when
 *   lifetimeDailies: number,                // daily quests done, ever (a bobblehead counts them)
 *   lifetimeHolotapes: number,              // holotapes recorded, ever (the recordings themselves
 *                                           // stay on the device: js/holotapes.js)
 *   history: [ { t: ms, type: EVENT_TYPES, xp: number, data: { name: string|number } } ],
 *                                           // what happened, oldest first (record(); the latest
 *                                           // HISTORY_MAX); saves from before it start empty;
 *                                           // data.skills 'KNOWLEDGE:3,FINANCE:1': the skill points
 *                                           // a reward gave (award()); older events have none
 *   stats:  { STR,END,CHA,INT,AGI: number(0-10) },   // SPECIAL — see "S.P.E.C.I.A.L." below
 *   statTrain: { STR,END,CHA,INT,AGI: number(0-TRAIN_PER_POINT) },   // training toward each stat's next
 *                                           // point (trainStat); older saves: none yet
 *   skills: { CONCENTRATION,KNOWLEDGE,SPEECH,SURVIVAL,COOKING,FINANCE,MUSIC,BUSINESS: number(0-100) },
 *                                           // CONCENTRATION was SCIENCE: see migrate()
 *   quests: {
 *     mains: [ MainQuest ],                  // older saves had one, as `main`: see migrate()
 *     side:  [ { id, questName, name, xp, done,      // done ones stay, hidden, for the Lifetime count
 *                skillGains: [SkillGain] } ],        // paid once with the XP (completeSide); see migrate()
 *     daily: [ { id, questName, name, xp, lastDate:'YYYY-M-D'|null,  // done today: dailyDoneToday()
 *                stat?: one of STAT_KEYS } ]        // the stat it trains, when it has one (completeDaily)
 *   },
 *   chems: {                                // the chem-free streak (VITALS tab)
 *     cleanSince: 'YYYY-M-D'|null,          // the run's first chem-free day (day 1); tomorrow after a lapse
 *     best: number, totalClean: number,     // full days: the longest run before this one, and all of them
 *     claimed: [ days ],                    // the CLEAN_MILESTONES paid in this run
 *     lapses: [ 'YYYY-M-D' ]                // the latest LAPSES_MAX
 *   },
 *   streaks: [ { id, name,                  // the player's own streaks (VITALS), at most STREAKS_MAX:
 *                cleanSince, best, totalClean, claimed, lapses } ],  // a name they type (never in
 *                                           // the code), the rest as in chems, same milestones;
 *                                           // older saves: none yet
 *   vitals: [ { date:'YYYY-M-D', logged: boolean,   // VITALS: one entry a day (the latest VITALS_MAX), a day
 *                                           // from 4:00 to 4:00, dated the day it starts (vitalsDayStr);
 *               energy, mood, hunger, tension, sleep, craving: number(0-10),   // logged: the day's
 *               pulse: number(PULSE_MIN-PULSE_MAX)|null,   // check-in was paid (logVitals)
 *               radN, radT: number(0-RAD_COUNT_MAX) } ],
 *   urges: {                                // VITALS' urge decoder
 *     active: { start: ms, need: one of URGE_NEEDS, rounds: number }|null,   // the timer running
 *     log: [ { date:'YYYY-M-D', need, rounds } ]   // the urges ridden out, the latest URGES_MAX
 *   },
 *   trials: {                               // VITALS → TRIALS: tests to repeat about once a week
 *     custom: [ { id, name, kind: TRIAL_KINDS key, stat: one of STAT_KEYS } ],   // the player's own
 *     hidden: [ id ],                       // built-in TRIALS put away
 *     log: [ { id: trial id, date:'YYYY-M-D', value: number,   // the results, oldest first (the
 *              xp: number, t: ms } ],       // latest TRIALS_LOG_MAX): reps, or seconds; xp: what it paid
 *     active: { id, start: ms }|null        // a trial's timer (it counts from `start`, a few seconds
 *   },                                      // after the tap: the 3-2-1)
 *   inventory: [ { id, name, category: one of CATS,     // WEAPONS is gone: see migrate()
 *                  price?: number>=0 } ],    // asking price in CAD, optional, shown in THINGS TO SELL (SELL)
 *                                           // only; kept when the item moves to another category
 *   books: [ { id, title, author, date: 'YYYY-M-D'|null,   // ITEMS → BOOKS: the books read, each
 *              skillGains: [SkillGain] } ],   // paid once when added (readBook): BOOK_XP and at most
 *                                           // one skill gain, +1 to BOOK_SKILL_MAX; older saves: none
 *   finances: { holdings: [ { id, label, amount, rateToCAD: number>0 } ] },  // Caps = total CAD / CAD_PER_CAP
 *                                           // a sale adds to the holding labelled CASH (made if missing)
 *   log: [ { date, text, xp, reason } ],     // date as shown ('Sep 24, 2026'); the latest LOG_MAX only
 *   map: {                                  // the MAP tab: what's revealed under the fog (js/places.js)
 *     cities:  [ { id, name, cc, lat, lon, radius, date, note, gid? } ],  // gid: its GeoNames id, when
 *                                           // picked from the city list (not placed by hand)
 *     regions: [ { id, name, cc, code, date, note } ],   // code: REGION_CODE, a region (or a group of
 *                                           // them, like a French region) of data/regions/<cc>.json
 *     pins:    [ { id, name, cc, lat, lon, radius, date, note } ],
 *     routes:  [ { id, name, stops: [ { name, lat, lon } ], path, km, date, note } ],  // a road trip
 *                                           // (js/routes.js): `path` is the road, as an encoded
 *                                           // polyline (decodePath()), traced once; km its length
 *     discovered: [ key ]                   // every city and region that already gave its XP, even
 *   }                                       // once removed: 'c:<gid>', 'c:<cc>:<name>' or 'r:<code>'
 * }
 * Places: `cc` is a country code (COUNTRY_CODES), or '' when unknown (a pin
 * at sea); lat/lon in degrees; `radius` in metres, CITY_RADIUS_MIN-MAX for a
 * city, PIN_RADIUS_MIN-MAX for a pin; `date` the day it was revealed,
 * 'YYYY-M-D'; `note` optional text ('' when none). Saves from before the MAP
 * tab start with it empty (migrate()).
 * Every `id` is a short string of letters, digits, _ and - (SAFE_ID): genId()
 * for anything the player adds.
 * MainQuest {
 *   id, questName, title, xp, completed,          // completed ones stay in the list
 *   skillGains: [SkillGain],
 *   bonus: [ { id, name, xp, done } ],             // bonus objectives
 *   progressType: 'percent'|'streak'|'caps',       // saves from before streaks: 'percent'
 *   progress: number(0-100),                       // percent: the slider; caps: follows the wallet; at 100 the
 *                                                  // quest waits for its Complete button (mainReady)
 *   capsTarget: number,                            // caps quests only: the wallet's CAPS to reach (syncCapsQuests)
 *   // streak quests only: a check-in a day; reaching streakTarget completes it
 *   streakTarget: number(1-STREAK_MAX_DAYS),
 *   streakDays: number,                            // days in a row, up to lastCheckIn...
 *   lastCheckIn: 'YYYY-M-D'|null                   // ...kept only while that is today or yesterday
 * }
 * SkillGain { skill: one of SKILL_KEYS, amount: number }
 *
 * Quest names: `questName` (at most QUEST_NAME_MAX characters) is the quest's
 * title, like a Fallout quest: "Caps on the Line". `title` (main) and `name`
 * (side, daily) hold its objective: "Obtain 5 Caps". The name is optional:
 * quests saved before it existed have none ('' or missing) and show only
 * their objective. Bonus objectives have no name.
 *
 * REWARDS — every reward is an event paid through award(type, data, xp,
 * skillGains): the perks taken change it (the PERKS table, withPerks), its
 * skills and XP are given (grantSkill, gainXp), and it's recorded in
 * `history`. The reward functions only say what happened: completeMain,
 * completeSide, completeBonus, completeDaily, rewardCheckIn (a streak
 * check-in), acceptJournal (a journal proposal), sellItem (SALE_XP, the
 * money in the wallet and a journal line), discoverPlace (CITY_XP or
 * REGION_XP, once per place), rewardRoute, readBook (BOOK_XP and its skill),
 * findBobbleheads, logVitals (the day's check-in), claimCleanMilestones
 * (the chem-free streak and the player's own), urgeWon (an urge ridden out), logTrial (a
 * TRIALS result). Milestones
 * without XP are recorded too (level-ups, perks, S.P.E.C.I.A.L. points,
 * backups, holotapes). Nothing else touches state.skills / state.xp;
 * events.js and vitals.js only add the toasts.
 *
 * LOADING — every document the app takes in (a saved copy, a backup file,
 * another window's save) goes through sanitizeImported(), which runs
 * migrate() first. A change to the shape above goes in migrate(), so it
 * reaches saves in the browser and old backups alike; tests/migrate.test.js
 * keeps every earlier format.
 *
 * S.P.E.C.I.A.L.: `stats` goes up two ways. Each level-up adds one
 * unspentSpecialPoint; the player taps a stat in the STATUS tab's level-up
 * banner and confirms "Yes", which calls spendSpecialPoint(key) (grantStat,
 * and the point spent). And training (the owner's choice, 2026-10-09): a
 * daily quest tagged with a stat, the VITALS check-in (Intelligence) and
 * TRIALS results (their trial's stat) add their XP to that stat's training;
 * every TRAIN_PER_POINT is one point (trainStat). No other reward (quest, bonus objective, journal proposal) and no button
 * changes `stats`, and a journal proposal is XP + SkillGains only.
 *
 * SCRIPTS — every file attaches to one namespace, window.StatusTerminal, and
 * index.html loads them in dependency order: state → storage → ai → places →
 * weather → boot → render → mascot → crt → tilt → fog → map → bulk → routes → radar →
 * holotapes → insight → vitals → trials → events → main (map.js loads
 * MapLibre, vendor/maplibre/, the first time MAP opens: the one module, needing
 * http(s) like the map's lists). They are plain scripts rather than ES modules so the app
 * still runs when index.html is opened straight from disk (file://), where
 * browsers refuse to load modules. The tests (tests/) load the same files in
 * Node: `node --test`.
 */
(function(ST){
  'use strict';

  var STAT_KEYS = ['STR','END','CHA','INT','AGI'];
  var STAT_LABELS = {STR:'Strength',END:'Endurance',CHA:'Charisma',INT:'Intelligence',AGI:'Agility'};
  var SKILL_KEYS = ['CONCENTRATION','KNOWLEDGE','SPEECH','SURVIVAL','COOKING','FINANCE','MUSIC','BUSINESS'];
  // Inventory categories, in the order the ITEMS tab and its Add form show
  // them. The key is what is saved; CAT_LABELS gives a longer name to show.
  var CATS = ['SELL','APPAREL','AID','MISC','IMPORTANT'];
  var CAT_LABELS = {SELL:'THINGS TO SELL'};
  var SALE_XP = 25;
  var CAD_PER_CAP = 1000;
  var SIDE_SKILL_GAIN = 3;      // the skill points a side quest gives (its skill picked when added)
  var QUEST_NAME_MAX = 60;
  var STREAK_MAX_DAYS = 1000;
  var LOG_MAX = 200;
  // The MAP tab (see "map" above).
  var CITY_RADIUS_MIN = 1000, CITY_RADIUS_MAX = 30000;
  var PIN_RADIUS_MIN = 100, PIN_RADIUS_MAX = 5000;
  var PLACE_NAME_MAX = 80, PLACE_NOTE_MAX = 500;
  var ROUTE_NAME_MAX = 120, ROUTE_STOPS_MAX = 25, ROUTE_PATH_MAX = 200000;
  var CITY_XP = 50, REGION_XP = 100;
  // ITEMS → BOOKS (see "books" above).
  var BOOK_XP = 50, BOOK_SKILL_MAX = 5, BOOK_TITLE_MAX = 120, BOOK_AUTHOR_MAX = 80;
  // VITALS, the chem-free streak and the urge decoder (see "vitals", "chems"
  // and "urges" above), from the owner's own design (2026-10-09).
  var VITAL_KEYS = ['energy','mood','hunger','tension','sleep','craving'];
  var VITALS_XP = 15;                 // the day's check-in, once a day; it trains Intelligence as much
  var VITALS_MAX = 400, PULSE_MIN = 30, PULSE_MAX = 220, RAD_COUNT_MAX = 99;
  var VITALS_DAY_START = 4;           // VITALS' day starts at 4:00 local time (vitalsDayStr)
  var CLEAN_MILESTONES = [{days:7, xp:150}, {days:14, xp:300}, {days:30, xp:600}, {days:60, xp:900}, {days:90, xp:1500}];
  var LAPSES_MAX = 200;
  var STREAKS_MAX = 10, STREAK_NAME_MAX = 24;   // the player's own streaks (see "streaks" above)
  var URGE_NEEDS = ['HUNGRY','ANGRY','LONELY','TIRED','NONE'];
  var URGE_MS = 20*60*1000;           // one round of the urge timer
  var URGE_XP = 40, URGE_XP_PER_DAY = 3, URGE_SKILL = 'SURVIVAL', URGES_MAX = 300;
  var TRAIN_PER_POINT = 300;          // training XP for one S.P.E.C.I.A.L. point
  // TRIALS (see "trials" above). A kind says how a trial is measured: the
  // most reps in one set (a tap counter helps), the most reps in a set time,
  // the longest hold, the fastest time (lower is better). Values are reps,
  // or whole seconds.
  var TRIAL_KINDS = {
    reps:    {unit:'reps', better:'more', timer:'counter', label:'Most reps in one set'},
    timed:   {unit:'reps', better:'more', timer:'countdown', seconds:60, label:'Most reps in 60 seconds'},
    hold:    {unit:'seconds', better:'more', timer:'stopwatch', label:'Longest hold'},
    fastest: {unit:'seconds', better:'less', timer:'stopwatch', label:'Fastest time'}
  };
  var TRIALS = [
    {id:'pushups', name:'Push-ups', what:'Most in one set, good form', kind:'reps', stat:'STR'},
    {id:'plank', name:'Plank', what:'Longest hold, back straight', kind:'hold', stat:'END'},
    {id:'squats', name:'Squats', what:'Most in 60 seconds, full depth', kind:'timed', stat:'AGI'},
    {id:'km', name:'1 km', what:'Fastest, walking or running', kind:'fastest', stat:'END'}
  ];
  var TRIAL_RECORD_XP = 50, TRIAL_XP = 15;    // one paid result a trial a day: a new record, or not
  var TRIAL_DUE_DAYS = 7, TRIAL_COUNTDOWN_MS = 3000;
  var TRIALS_LOG_MAX = 1000, TRIALS_CUSTOM_MAX = 12, TRIAL_NAME_MAX = 40;
  var TRIAL_VALUE_MAX = {reps:9999, seconds:86400};
  // Every country a place can be in (GeoNames' country list, as in data/places.txt).
  var COUNTRY_CODES = ('AD AE AF AG AI AL AM AN AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR '+
    'BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CS CU CV CW CX CY CZ DE DJ DK DM DO DZ '+
    'EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY '+
    'HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA '+
    'LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY '+
    'MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS '+
    'RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM '+
    'TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW').split(' ');
  // A region: its country's three letters and a number (CAN-683, GAZ-X00),
  // a group of regions: G and its name (FRA-G-ile-de-france), or, for the
  // regions from geoBoundaries (Morocco's), its ISO 3166-2 code (MA-06).
  var REGION_CODE = /^([A-Z]{3}-(X?\d{1,6}|G-[a-z0-9-]{1,40})|[A-Z]{2}-[A-Z0-9]{1,3})$/;

  var DEFAULT_STATE = {
    level:2, xp:0, xpToNext:1000,
    lifetimeXp:0,
    lifetimeLogEntries:0,
    capsQuestsLinked:true,
    lastBackup:null,
    unspentSpecialPoints:0,
    perks:{},
    unspentPerkPoints:0,
    bobbleheads:{},
    lifetimeDailies:0,
    lifetimeHolotapes:0,
    history:[],
    stats:{STR:4,END:3,CHA:4,INT:5,AGI:2},
    skills:{CONCENTRATION:21,KNOWLEDGE:10,SPEECH:42,SURVIVAL:23,COOKING:8,FINANCE:17,MUSIC:35,BUSINESS:5},
    quests:{
      mains:[
        {id:'m1', questName:'Caps on the Line', title:'Obtain 5 Caps', progressType:'caps', capsTarget:5, progress:0, xp:1000, completed:false, skillGains:[{skill:'FINANCE',amount:8},{skill:'BUSINESS',amount:2}], bonus:[
          {id:'b1',name:'Find a job',xp:500,done:false},
          {id:'b2',name:'Launch a project',xp:500,done:false}
        ]}
      ],
      side:[
        {id:'s1',questName:'Paper Trail',name:'Earn a certification',xp:150,done:false,skillGains:[{skill:'KNOWLEDGE',amount:3}]},
        {id:'s2',questName:'Pennies from Heaven',name:'Build up savings',xp:100,done:false,skillGains:[{skill:'FINANCE',amount:3}]},
        {id:'s3',questName:'Back in the Saddle',name:'Get back into consistent training',xp:100,done:false,skillGains:[{skill:'SURVIVAL',amount:3}]},
        {id:'s4',questName:'Sing, Sing, Sing',name:'Push the music project forward',xp:100,done:false,skillGains:[{skill:'MUSIC',amount:3}]}
      ],
      daily:[
        {id:'d1',questName:'Shake, Rattle and Roll',name:'Move your body',xp:20,lastDate:null},
        {id:'d2',questName:'How Little We Know',name:'Learn or study something',xp:20,lastDate:null},
        {id:'d3',questName:'Why Can\'t We Be Friends?',name:'Reach out to someone',xp:15,lastDate:null}
      ]
    },
    inventory:[
      {id:'i1',name:'Phone',category:'MISC'},
      {id:'i2',name:'Keys',category:'IMPORTANT'}
    ],
    books:[],                   // starts empty: add the ones you finish in ITEMS → BOOKS
    finances:{ holdings:[] },   // starts empty: add your own in ITEMS → wallet
    log:[],
    map:{ cities:[], regions:[], pins:[], routes:[], discovered:[] },
    statTrain:{STR:0,END:0,CHA:0,INT:0,AGI:0},
    chems:{ cleanSince:null, best:0, totalClean:0, claimed:[], lapses:[] },
    streaks:[],
    vitals:[],
    urges:{ active:null, log:[] },
    trials:{ custom:[], hidden:[], log:[], active:null }
  };

  // Shared runtime state. `state` is the persisted document described above;
  // the other fields are per-session UI state and are never saved.
  var app = {
    state: null,
    walletExpanded: false,
    aiAvailable: false,
    pendingProposal: null,
    finishRename: null,         // saves the quest name being edited, while its box is open
    confirmRemoveMain: null,    // id of the main quest whose removal awaits "Yes, remove"
    confirmSell: null,          // id of the item whose sale awaits "Yes"
    confirmRemove: null,        // {kind:'side'|'daily'|'item'|'wallet', id} whose removal awaits "Yes, remove"
    confirmMove: null,          // id of the item whose "Move to" choice is open
    confirmSpecial: null,       // SPECIAL key whose level-up point awaits "Yes"
    perkChart: false,           // the STATUS tab's perk chart is open
    bobbleOpen: null,           // id of the bobblehead whose details show
    skillOpen: null,            // the skill whose sources show (STATUS)
    confirmPerk: null,          // id of the perk whose rank awaits "Yes"
    addOpen: null,              // the add form unfolded: 'main', 'side', 'daily' (QUESTS) or 'book' (ITEMS)
    streakEdit: false,          // the chem-free streak's start date is being set (VITALS)
    confirmLapse: false,        // "Log a lapse?" awaits "Yes, log it"
    ownForm: null,              // one of the player's own streaks being edited (its id), or 'new' (VITALS)
    ownConfirm: null,           // {id, what: 'lapse'|'remove'}: that streak's question awaits its answer
    urgeAngle: 0,               // which of the urge decoder's messages shows ("Another angle"), from 0 each round
    vitalsView: 'checkin',      // VITALS shows 'checkin' or 'trials'
    trialOpen: null,            // id of the trial whose panel (timer, result) is open
    trialCount: null,           // {id, n}: the tap counter of that trial's set
    trialConfirm: null,         // {id, value}: the result whose saving awaits "Yes, save"
    trialRemove: null,          // {id, t}: the result whose removal awaits "Yes, remove"
    trialHide: null,            // id of the trial whose hiding (or removal) awaits "Yes"
    trialAddOpen: false         // the "+ New trial" form is unfolded
  };

  function el(id){ return document.getElementById(id); }
  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
  function genId(){ return 'x'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
  function todayStr(){ var d=new Date(); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); }
  function todayDisplay(){ return new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
  // A saved date ('YYYY-M-D') as shown: "Sep 24, 2026", or '' when it isn't one.
  function dateText(date){
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date || '');
    return m ? new Date(+m[1], +m[2]-1, +m[3]).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
  }
  // The phone's Reduce Motion setting: every animation checks it (and the
  // ones that run on their own listen for it changing). null where the
  // browser can't tell.
  var motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function stayStill(){ return !!(motion && motion.matches); }
  function commas(n){ return Number(n).toLocaleString('en-US'); }
  // Rounded to the cent first, so a tiny negative amount shows 0.00, not -0.00.
  function cents(n){ return Math.round(Number(n)*100)/100 || 0; }
  function money(n){ return cents(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function clone(value){ return JSON.parse(JSON.stringify(value)); }
  // Copies `from`'s own fields onto `to`. A "__proto__" key (JSON.parse
  // makes it an ordinary key) would replace `to`'s prototype: skipped.
  function copyFields(to, from){
    Object.keys(from).forEach(function(k){ if (k!=='__proto__') to[k] = from[k]; });
    return to;
  }

  // Recursive merge: any field added to DEFAULT_STATE later (a new stat, a new
  // quest property, a new top-level system) is filled in automatically for a
  // save made before that field existed, instead of silently disappearing.
  // Arrays and primitives from a real save always win over the default;
  // objects merge key by key; extra keys the save has that the default
  // doesn't (forward-compat) are kept rather than dropped.
  function deepMergeDefaults(defaults, loaded){
    if (loaded===undefined || loaded===null) return clone(defaults);
    if (Array.isArray(defaults)) return Array.isArray(loaded) ? loaded : clone(defaults);
    if (defaults && typeof defaults==='object'){
      if (!loaded || typeof loaded!=='object' || Array.isArray(loaded)) return clone(defaults);
      var out = {};
      Object.keys(defaults).forEach(function(k){ out[k] = deepMergeDefaults(defaults[k], loaded[k]); });
      Object.keys(loaded).forEach(function(k){ if (!(k in out)) out[k] = loaded[k]; });
      return out;
    }
    return loaded;
  }
  // Brings a document written by an older version up to the current shape,
  // before the defaults are merged in. Saved copies, backups and other
  // windows' saves all pass through here (sanitizeImported → mergeDefaults).
  // Edits `doc` in place and returns it.
  function migrate(doc){
    if (!doc || typeof doc!=='object') return doc;
    migrateMainQuests(doc.quests);
    linkCapsQuests(doc);
    migrateSideQuests(doc.quests);
    migratePerks(doc);
    migrateSkills(doc);
    migrateInventory(doc);
    migrateMap(doc);
    migrateBooks(doc);
    migrateVitals(doc);
    return doc;
  }
  // Side quests from before their skill gains: the app's first four (s1-s4,
  // whose objectives can't be edited: certification, savings, training,
  // music) get theirs, any other none. Once a quest has the list, it's left
  // alone. One already done isn't paid again.
  // Perks came later: a save from before them gets the perk points its
  // level-ups would have given (one per level since the start, level 2).
  function migratePerks(doc){
    if (doc.perks!==undefined) return;
    doc.perks = {};
    doc.unspentPerkPoints = Math.max(0, Math.round(Number(doc.level)||2) - 2);
  }
  var FIRST_SIDE_SKILLS = {s1:'KNOWLEDGE', s2:'FINANCE', s3:'SURVIVAL', s4:'MUSIC'};
  function migrateSideQuests(quests){
    var side = quests && typeof quests==='object' && Array.isArray(quests.side) ? quests.side : [];
    side.forEach(function(q){
      if (!q || typeof q!=='object' || Array.isArray(q.skillGains)) return;
      var skill = has(FIRST_SIDE_SKILLS, q.id) ? FIRST_SIDE_SKILLS[q.id] : null;
      q.skillGains = skill ? [{skill:skill, amount:SIDE_SKILL_GAIN}] : [];
    });
  }
  // Main quests from before "caps" quests whose objective is a Caps amount
  // ("Obtain 5 Caps") start following the wallet, once: after that the
  // player's choice of type is left alone.
  var CAPS_OBJECTIVE = /^\s*(?:obtain|get|reach|earn|have|save)\s+(\d+(?:[.,]\d+)?)\s*caps?\s*!?\s*$/i;
  function linkCapsQuests(doc){
    if (doc.capsQuestsLinked===true) return;
    var mains = doc.quests && Array.isArray(doc.quests.mains) ? doc.quests.mains : [];
    mains.forEach(function(m){
      if (!m || typeof m!=='object' || m.completed===true) return;
      if (m.progressType && m.progressType!=='percent') return;
      var match = CAPS_OBJECTIVE.exec(String(m.title || ''));
      if (!match) return;
      m.progressType = 'caps';
      m.capsTarget = Number(match[1].replace(',', '.'));
    });
    doc.capsQuestsLinked = true;
  }
  // Older saves have a single main quest, the object quests.main. It
  // becomes the first of the list with every field it had (progress,
  // completion, bonus objectives...), and no name unless it had one.
  function migrateMainQuests(quests){
    if (!quests || typeof quests!=='object') return;
    var main = quests.main;
    if (!Array.isArray(quests.mains) && main && typeof main==='object' && !Array.isArray(main)){
      quests.mains = [copyFields({id:'m1', questName:'', progressType:'percent'}, main)];
    }
    delete quests.main;
  }
  // The SCIENCE skill became CONCENTRATION, and KNOWLEDGE was added. An
  // older save keeps its SCIENCE value as CONCENTRATION (quests' skill gains
  // included) and starts KNOWLEDGE at 0; only a new player gets the default.
  function migrateSkills(doc){
    var skills = doc.skills;
    if (skills && typeof skills==='object' && !Array.isArray(skills)){
      if (has(skills, 'SCIENCE')){
        if (!has(skills, 'CONCENTRATION')) skills.CONCENTRATION = skills.SCIENCE;
        delete skills.SCIENCE;
      }
      if (!has(skills, 'KNOWLEDGE')) skills.KNOWLEDGE = 0;
    }
    var quests = doc.quests;
    if (!quests || typeof quests!=='object') return;
    ['mains','side','daily'].forEach(function(list){
      (Array.isArray(quests[list]) ? quests[list] : []).forEach(function(q){
        if (!q || !Array.isArray(q.skillGains)) return;
        q.skillGains.forEach(function(g){
          if (g && g.skill==='SCIENCE') g.skill = 'CONCENTRATION';
        });
      });
    });
  }
  // The WEAPONS category was removed: its items move to MISC, nothing is lost.
  function migrateInventory(doc){
    (Array.isArray(doc.inventory) ? doc.inventory : []).forEach(function(i){
      if (i && i.category==='WEAPONS') i.category = 'MISC';
    });
  }
  // The MAP tab came later: a save from before it gets an empty map (no
  // city, region or pin), and nothing else changes. Routes came after it:
  // none yet.
  function migrateMap(doc){
    if (!doc.map || typeof doc.map!=='object' || Array.isArray(doc.map)) doc.map = {};
    ['cities','regions','pins','routes','discovered'].forEach(function(list){
      if (!Array.isArray(doc.map[list])) doc.map[list] = [];
    });
  }
  // Books came later: a save from before them has none yet.
  function migrateBooks(doc){
    if (!Array.isArray(doc.books)) doc.books = [];
  }
  // VITALS, the chem-free streak, urges and stat training came later (from
  // the owner's in-Claude version, whose backups already have them, with
  // dates written 'YYYY-MM-DD': sanitizeImported reads those). A save from
  // before them has none yet: no check-in, no streak started, no training.
  // TRIALS came after them: no result yet, and every built-in trial shown.
  // The player's own streaks came after that: none yet.
  function migrateVitals(doc){
    if (!Array.isArray(doc.vitals)) doc.vitals = [];
    if (!Array.isArray(doc.streaks)) doc.streaks = [];
    ['chems','urges','statTrain','trials'].forEach(function(part){
      if (!doc[part] || typeof doc[part]!=='object' || Array.isArray(doc[part])) doc[part] = {};
    });
  }
  function has(obj, key){ return Object.prototype.hasOwnProperty.call(obj, key); }
  function mergeDefaults(loaded){
    return deepMergeDefaults(DEFAULT_STATE, migrate(loaded||{}));
  }
  function defaultState(){ return clone(DEFAULT_STATE); }
  function catLabel(cat){ return CAT_LABELS[cat] || cat; }

  function totalHoldingsCAD(){
    return app.state.finances.holdings.reduce(function(sum,h){
      return sum + (Number(h.amount)||0) * (Number(h.rateToCAD)||1);
    }, 0);
  }
  function capsValue(){
    return totalHoldingsCAD() / CAD_PER_CAP;
  }
  function capsText(){ return cents(capsValue()).toFixed(2); }
  // A caps quest's progress, 0-100: the wallet's CAPS against its target.
  function capsProgress(m){
    var target = Number(m.capsTarget);
    if (!(target>0)) return 0;
    return Math.floor(clamp(capsValue()/target*100, 0, 100));
  }
  // Brings every open caps quest's progress up to date with the wallet and
  // returns the ones that reached their target (their Complete button shows:
  // mainReady).
  function syncCapsQuests(){
    var reached = [];
    app.state.quests.mains.forEach(function(m){
      if (m.progressType!=='caps' || m.completed) return;
      m.progress = capsProgress(m);
      if (m.progress>=100) reached.push(m);
    });
    return reached;
  }
  // `log` only keeps the latest LOG_MAX entries. Saves made before
  // lifetimeLogEntries existed start from the entries they still have.
  function logEntryCount(){
    return Math.max(app.state.lifetimeLogEntries||0, app.state.log.length);
  }
  // An accepted journal entry: counted for good, and kept in `log` among
  // the latest LOG_MAX.
  function addLogEntry(entry){
    var state = app.state;
    state.lifetimeLogEntries = logEntryCount() + 1;
    state.log.push(entry);
    if (state.log.length>LOG_MAX) state.log = state.log.slice(-LOG_MAX);
  }

  // ---------- selling ----------
  // Sells a THINGS TO SELL item for `amount` CAD: the item goes, the amount
  // goes into the wallet's CASH holding (made at rate 1 if there is none; at
  // another rate, the CAD value still grows by `amount`), SALE_XP and a
  // journal line. Returns null when there's nothing to sell or the amount
  // isn't a price, else {name, amount, leveled} for the toasts.
  function sellItem(id, amount){
    var state = app.state;
    amount = Number(amount);
    if (!(amount>=0) || !isFinite(amount)) return null;
    amount = cents(amount);
    var item = state.inventory.filter(function(i){ return i.id===id && i.category==='SELL'; })[0];
    if (!item) return null;
    state.inventory = state.inventory.filter(function(i){ return i!==item; });
    var cash = state.finances.holdings.filter(function(h){ return String(h.label).trim().toUpperCase()==='CASH'; })[0];
    if (!cash){
      cash = {id:genId(), label:'CASH', amount:0, rateToCAD:1};
      state.finances.holdings.push(cash);
    }
    cash.amount = cents((Number(cash.amount)||0) + amount/(Number(cash.rateToCAD)||1));
    var reward = award('ITEM_SOLD', {name:item.name, amount:amount}, SALE_XP);
    addLogEntry({date:todayDisplay(), text:'Sold '+item.name+' for $'+money(amount), xp:reward.xp, reason:'Item sold'});
    return {name:item.name, amount:amount, xp:reward.xp, leveled:reward.leveled};
  }

  // ---------- places on the map ----------
  // A name to compare, whatever its accents, case, spaces and punctuation:
  // 'Montréal' and 'MONTREAL', 'Tanger - Tétouan' and 'Tanger-Tetouan'.
  var FOLD = {'ø':'o','æ':'ae','œ':'oe','ß':'ss','ł':'l','đ':'d','ı':'i','ð':'d','þ':'th'};
  function foldName(name){
    return String(name===null || name===undefined ? '' : name).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[øæœßłđıðþ]/g, function(c){ return FOLD[c]; }).replace(/[^\p{L}\p{N}]+/gu, '');
  }
  // What a place is known by for its XP: a listed city by its GeoNames id,
  // one placed by hand by its country and name, a region by its code.
  function placeKey(kind, place){
    if (kind==='region') return 'r:'+place.code;
    return place.gid ? 'c:'+place.gid : 'c:'+(place.cc||'')+':'+foldName(place.name);
  }
  // A new city or region's XP, once ever per place: the key stays in
  // map.discovered when the place is removed, so adding it back pays
  // nothing. Returns null when it already paid, else {xp, leveled}. `data`:
  // what it is, for the history ({kind, name, cc}).
  function discoverPlace(key, xp, data){
    var list = app.state.map.discovered;
    if (list.indexOf(key)!==-1) return null;
    list.push(key);
    var reward = award('PLACE_DISCOVERED', data || {key:key}, xp);
    return {xp:reward.xp, leveled:reward.leveled};
  }

  // Moves an item to another category, keeping everything else (an asking
  // price too: it shows again if the item goes back to THINGS TO SELL).
  // Returns false when there's no such item or category.
  function moveItem(id, cat){
    var item = app.state.inventory.filter(function(i){ return i.id===id; })[0];
    if (!item || CATS.indexOf(cat)===-1 || item.category===cat) return false;
    item.category = cat;
    return true;
  }

  // ---------- dates ----------
  // Dates are stored as local calendar days, 'YYYY-M-D' (todayStr()).
  var DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
  // The same day written 'YYYY-M-D' ('2026-09-04' becomes '2026-9-4'), or
  // null when `date` isn't one.
  function normalizeDate(date){
    var m = DATE.exec(typeof date==='string' ? date : '');
    return m ? (+m[1])+'-'+(+m[2])+'-'+(+m[3]) : null;
  }
  // Whole days from the date to today: 0 today, 1 yesterday, negative for a
  // later date; null when unset. Counted on calendar days, so daylight
  // saving changes don't matter.
  function daysSince(date){
    var m = DATE.exec(date || '');
    if (!m) return null;
    var now = new Date();
    return Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
      Date.UTC(+m[1], +m[2]-1, +m[3])) / 864e5);
  }

  // ---------- backups ----------
  // Everything lives on this one phone: a backup file is the only copy
  // elsewhere. Days since the last one (null: never), and whether it's time
  // for another (BACKUP_DUE_DAYS, or never made while there's progress to lose).
  var BACKUP_DUE_DAYS = 14;
  function backupDays(){ return daysSince(app.state.lastBackup); }
  function backupDue(){
    var d = backupDays();
    return d===null ? (app.state.lifetimeXp||0)>0 : d>=BACKUP_DUE_DAYS;
  }
  // Rads, the header's meter: the same reminder, the Fallout way. They build
  // up RADS_PER_DAY a day since the last backup, up to RADS_MAX; never backed
  // up with progress to lose is RADS_MAX. A backup is the RadAway: back to 0.
  // (BACKUP_DUE_DAYS is 560 rads.)
  var RADS_PER_DAY = 40, RADS_MAX = 1000;
  function rads(){
    var d = backupDays();
    if (d===null) return (app.state.lifetimeXp||0)>0 ? RADS_MAX : 0;
    return clamp(d*RADS_PER_DAY, 0, RADS_MAX);
  }

  // ---------- once a day: daily quests and streak check-ins ----------
  // Done today, for a date saved when it was done. A date of tomorrow still
  // counts as today: after flying west, the calendar can be a day behind
  // it, and the same day must not be ticked twice. One dated later than
  // that can only come from a clock that was wrong: it doesn't lock
  // anything until that date.
  function doneToday(date){
    var d = daysSince(date);
    return d!==null && d<=0 && d>=-1;
  }
  function dailyDoneToday(q){ return doneToday(q.lastDate); }

  // ---------- streak main quests ----------
  // A check-in follows doneToday(): one dated far ahead simply lets the
  // next check-in continue the streak.
  function checkedInToday(q){ return doneToday(q.lastCheckIn); }
  // The streak as it stands today: a missed day resets it to 0 (as soon as
  // the app is opened, not only at the next check-in). A completed quest
  // keeps the streak it finished with.
  function currentStreak(q){
    if (q.completed) return q.streakDays||0;
    var d = daysSince(q.lastCheckIn);
    return d!==null && d<=1 ? (q.streakDays||0) : 0;
  }
  // Today's check-in: days in a row add up; after a missed day the streak
  // starts again at 1. Returns false when there's nothing to do (checked in
  // already, or completed), 'target' when this one reaches the target (the
  // caller then completes the quest), true otherwise.
  function streakCheckIn(q){
    if (q.completed || checkedInToday(q)) return false;
    q.streakDays = currentStreak(q) + 1;
    q.lastCheckIn = todayStr();
    return q.streakDays>=q.streakTarget ? 'target' : true;
  }

  // ---------- the history: what happened, as events ----------
  // Every reward, level-up and milestone is an event, recorded in
  // state.history (oldest first, the latest HISTORY_MAX kept):
  //   {t: when (ms), type: one of EVENT_TYPES, xp: what it gave (perks
  //    included), data: a few names and numbers (strings and numbers only)}
  // One stream for "what happened this week", instead of each part of the
  // app keeping its own. award() records every reward; the milestones that
  // give no XP call record() themselves.
  var HISTORY_MAX = 2000;
  var EVENT_TYPES = ['QUEST_COMPLETED', 'BONUS_COMPLETED', 'DAILY_DONE', 'STREAK_CHECKIN', 'JOURNAL_ENTRY',
    'ITEM_SOLD', 'PLACE_DISCOVERED', 'ROUTE_ADDED', 'BOBBLEHEAD_FOUND', 'LEVEL_UP', 'PERK_TAKEN',
    'SPECIAL_RAISED', 'BACKUP_MADE', 'HOLOTAPE_RECORDED', 'BOOK_READ',
    'VITALS_CHECKIN', 'CLEAN_MILESTONE', 'URGE_RESISTED', 'SPECIAL_TRAINED', 'TRIAL_DONE', 'STREAK_MILESTONE'];
  function record(type, data, xp){
    var s = app.state;
    if (!Array.isArray(s.history)) s.history = [];
    var event = {t:Date.now(), type:type, xp:Math.max(0, Math.round(Number(xp)||0)), data:eventData(data)};
    s.history.push(event);
    if (s.history.length>HISTORY_MAX) s.history = s.history.slice(-HISTORY_MAX);
    return event;
  }
  // An event's data, kept small and plain: strings (at most 200 letters) and
  // numbers, at most 8 of them.
  function eventData(data){
    var out = {};
    if (!data || typeof data!=='object' || Array.isArray(data)) return out;
    Object.keys(data).slice(0, 8).forEach(function(k){
      var v = data[k];
      if (k==='__proto__') return;
      if (typeof v==='string') out[k] = v.slice(0, 200);
      else if (typeof v==='number' && isFinite(v)) out[k] = v;
    });
    return out;
  }
  // The events of the last `days` days, oldest first.
  function recentEvents(days){
    var since = Date.now() - days*864e5;
    return (app.state.history||[]).filter(function(e){ return e.t>=since; });
  }
  // Over the last `days` days: {xp: all the XP gained, count, byType: {type: count}}.
  function historySummary(days){
    var out = {xp:0, count:0, byType:{}};
    recentEvents(days).forEach(function(e){
      out.xp += e.xp;
      out.count++;
      out.byType[e.type] = (out.byType[e.type]||0) + 1;
    });
    return out;
  }

  // ---------- centralized reward logic ----------
  // Every reward goes through award(): the perks taken change it (withPerks,
  // from the PERKS table below), its skill gains and XP are given, and it's
  // recorded in the history. The reward functions below only say what
  // happened (an event type and its data) and its base XP and skills.
  //
  // Every skill point goes through grantSkill(), so the bounds and validity
  // checks live in one place. grantStat() has two callers: spending a
  // level-up point, once the player confirmed it (spendSpecialPoint), and
  // training (trainStat).
  function grantSkill(key, amount){
    var state = app.state;
    amount = Number(amount);
    if (SKILL_KEYS.indexOf(key)===-1 || !amount || !isFinite(amount)) return;
    state.skills[key] = clamp((Number(state.skills[key])||0)+amount, 0, 100);
  }
  // Where a skill's points came from, and what's still to come: main and
  // side quests (their skillGains: done, or still open), books, and the
  // other rewards that gave some (journal entries, urges ridden out), from
  // the history's data.skills. Amounts before perks; the starting values
  // aren't listed. {earned: [{name, amount}], coming: [...]}.
  function skillSources(key){
    var s = app.state, earned = [], coming = [];
    function gainOf(list){
      var n = 0;
      (list || []).forEach(function(g){ if (g && g.skill===key) n += Number(g.amount) || 0; });
      return n;
    }
    s.quests.mains.forEach(function(m){
      var n = gainOf(m.skillGains);
      if (n>0) (m.completed ? earned : coming).push({name:m.questName || m.title || 'Main quest', amount:n});
    });
    s.quests.side.forEach(function(q){
      var n = gainOf(q.skillGains);
      if (n>0) (q.done ? earned : coming).push({name:q.questName || q.name || 'Side quest', amount:n});
    });
    (s.books || []).forEach(function(b){
      var n = gainOf(b.skillGains);
      if (n>0) earned.push({name:b.title || 'Book', amount:n});
    });
    var NAMES = {JOURNAL_ENTRY:'Journal', URGE_RESISTED:'Urge ridden out'};
    (s.history || []).forEach(function(e){
      if (!e.data || typeof e.data.skills!=='string' || e.type==='QUEST_COMPLETED' || e.type==='BOOK_READ') return;
      var n = 0;
      e.data.skills.split(',').forEach(function(part){
        var bits = part.split(':');
        if (bits[0]===key) n += Number(bits[1]) || 0;
      });
      if (n>0) earned.push({name:NAMES[e.type] || String(e.data.name || e.type), amount:n});
    });
    return {earned:earned, coming:coming};
  }
  function grantStat(key, amount){
    var state = app.state;
    amount = Number(amount);
    if (STAT_KEYS.indexOf(key)===-1 || !amount || !isFinite(amount)) return;
    state.stats[key] = clamp((Number(state.stats[key])||0)+amount, 0, 10);
  }
  // The state half of addXp() (events.js adds the toasts). Returns true when
  // the player levelled up; several levels at once each give their point.
  // Anything but a positive amount is ignored, so XP can't become NaN or
  // go down.
  function gainXp(amount){
    var state = app.state;
    amount = Number(amount);
    if (!(amount>0) || !isFinite(amount)) return false;
    state.xp += amount;
    state.lifetimeXp = (state.lifetimeXp||0) + amount;
    var leveled = false;
    while (state.xp >= state.xpToNext){
      state.xp -= state.xpToNext;
      state.level += 1;
      state.xpToNext += 400;
      state.unspentSpecialPoints = (state.unspentSpecialPoints||0) + 1;
      state.unspentPerkPoints = (state.unspentPerkPoints||0) + 1;
      record('LEVEL_UP', {level:state.level}, 0);
      leveled = true;
    }
    return leveled;
  }
  // What the perks taken do to a reward of this event type: {xp, gains}.
  // Their flat XP is added first, then their percentages, rounded; each
  // positive skill gain grows by their skillFlat.
  function withPerks(type, xp, gains){
    var flat = 0, percent = 0, skill = 0;
    PERKS.forEach(function(p){
      var rank = perkRank(p.id);
      if (!rank || p.on!==type) return;
      flat += (p.xpFlat||0)*rank;
      percent += (p.xpPercent||0)*rank;
      skill += (p.skillFlat||0)*rank;
    });
    return {
      xp: Math.round(((Number(xp)||0)+flat)*(1+percent/100)),
      gains: (gains||[]).map(function(g){
        return {skill:g.skill, amount:Number(g.amount)>0 ? Number(g.amount)+skill : g.amount};
      })
    };
  }
  // Pays a reward: {xp, leveled, skillGains} (what was given, for the toasts).
  // The event goes in the history before the level-ups it causes.
  function award(type, data, xp, gains){
    var r = withPerks(type, xp, gains), d = {};
    r.gains.forEach(function(g){ grantSkill(g.skill, g.amount); });
    // The skill points it gave go in the event too ("KNOWLEDGE:3,FINANCE:1"):
    // STATUS shows where each skill's points came from (skillSources).
    Object.keys(data || {}).forEach(function(k){ d[k] = data[k]; });
    if (r.gains.length) d.skills = r.gains.map(function(g){ return g.skill+':'+g.amount; }).join(',');
    record(type, d, r.xp);
    return {xp:r.xp, leveled:gainXp(r.xp), skillGains:r.gains};
  }
  // A main quest whose bar is full (a percentage or a Caps goal at 100%)
  // waits for the player's tap on its Complete button: a slip of the finger
  // on the slider, or a typo in the wallet, never pays its reward by itself.
  // A streak quest completes with the check-in that reaches its target.
  function mainReady(m){
    if (!m || m.completed || m.progressType==='streak') return false;
    return (m.progressType==='caps' ? capsProgress(m) : Number(m.progress)||0) >= 100;
  }
  // Completes a main quest: its XP and skill gains, once. Returns null when
  // it was completed already, else award()'s result.
  function completeMain(m){
    if (m.completed) return null;
    m.completed = true;
    return award('QUEST_COMPLETED', {kind:'main', name:m.questName || m.title || ''}, m.xp, m.skillGains);
  }
  // Completes a side quest the same way: its XP and skill gains, once.
  function completeSide(q){
    if (q.done) return null;
    q.done = true;
    return award('QUEST_COMPLETED', {kind:'side', name:q.questName || q.name || ''}, q.xp, q.skillGains);
  }
  // A main quest's bonus objective (of `quest`): its XP, once.
  function completeBonus(b, quest){
    if (b.done) return null;
    b.done = true;
    return award('BONUS_COMPLETED', {name:b.name || '', quest:quest ? quest.questName || quest.title || '' : ''}, b.xp);
  }
  // A daily quest, once a day: its XP only (no skills, the owner's choice:
  // a skill a day would reach 100 within months). One tagged with a stat
  // trains it with that XP; `trained` then lists the stats it raised.
  function completeDaily(d){
    if (dailyDoneToday(d)) return null;
    d.lastDate = todayStr();
    app.state.lifetimeDailies = (app.state.lifetimeDailies||0) + 1;
    var reward = award('DAILY_DONE', {name:d.questName || d.name || ''}, d.xp);
    if (STAT_KEYS.indexOf(d.stat)!==-1) reward.trained = trainStat(d.stat, reward.xp);
    return reward;
  }
  // A streak quest's check-in (after streakCheckIn): no XP of its own, only
  // what perks give (Iron Will); recorded either way.
  function rewardCheckIn(m){
    return award('STREAK_CHECKIN', {name:m ? m.questName || m.title || '' : '', day:m ? Number(m.streakDays)||0 : 0}, 0);
  }
  // A route added on the map: the same (Wanderer).
  function rewardRoute(route){
    return award('ROUTE_ADDED', {name:route ? route.name : '', km:route ? Number(route.km)||0 : 0}, 0);
  }
  // A book finished (ITEMS → BOOKS): kept in the list with today's date, and
  // paid once, now: BOOK_XP and its one skill gain (+1 to BOOK_SKILL_MAX;
  // none when no skill is picked). Returns null without a title, else
  // {book, xp, leveled, skillGains}.
  function readBook(title, author, skill, amount){
    title = String(title===undefined || title===null ? '' : title).trim().slice(0, BOOK_TITLE_MAX);
    if (!title) return null;
    var gains = SKILL_KEYS.indexOf(skill)===-1 ? [] :
      [{skill:skill, amount:clamp(Math.round(Number(amount)||1), 1, BOOK_SKILL_MAX)}];
    var book = {id:genId(), title:title, author:String(author===undefined || author===null ? '' : author).trim().slice(0, BOOK_AUTHOR_MAX),
      date:todayStr(), skillGains:gains};
    app.state.books.push(book);
    var reward = award('BOOK_READ', {name:title}, BOOK_XP, gains);
    return {book:book, xp:reward.xp, leveled:reward.leveled, skillGains:reward.skillGains};
  }
  // A journal proposal accepted: its XP and skill gains, and its line in the
  // journal (with the XP it really gave).
  function acceptJournal(p){
    var reward = award('JOURNAL_ENTRY', {reason:p.reason || ''}, p.xp, p.skillGains);
    addLogEntry({date:todayDisplay(), text:p.text, xp:reward.xp, reason:p.reason});
    return reward;
  }
  // A level-up point spent on a stat, after "Yes": false when it can't be
  // (no point left, the stat at 10 already, not a stat).
  function spendSpecialPoint(key){
    var s = app.state;
    if (STAT_KEYS.indexOf(key)===-1 || (s.unspentSpecialPoints||0)<=0 || s.stats[key]>=10) return false;
    grantStat(key, 1);
    s.unspentSpecialPoints -= 1;
    record('SPECIAL_RAISED', {stat:key, value:s.stats[key]}, 0);
    return true;
  }
  // A backup file handed over: today is the last backup (the rads drain).
  function markBackup(){
    app.state.lastBackup = todayStr();
    record('BACKUP_MADE', {}, 0);
  }
  // A holotape recorded (the recording itself stays on the device).
  function countHolotape(seconds){
    app.state.lifetimeHolotapes = (app.state.lifetimeHolotapes||0) + 1;
    record('HOLOTAPE_RECORDED', {seconds:Math.round(Number(seconds)||0)}, 0);
  }

  // ---------- training S.P.E.C.I.A.L. ----------
  // A daily quest tagged with a stat, and the VITALS check-in (Intelligence),
  // train it: their XP adds up in statTrain, and every TRAIN_PER_POINT is one
  // more point (recorded: SPECIAL_TRAINED), up to 10; at 10 the training
  // stays full. Returns the stats raised (twice the same if it got 2 points).
  function trainStat(key, amount){
    var s = app.state, raised = [];
    amount = Math.round(Number(amount));
    if (STAT_KEYS.indexOf(key)===-1 || !(amount>0)) return raised;
    var v = (Number(s.statTrain[key])||0) + amount;
    while (v>=TRAIN_PER_POINT && (Number(s.stats[key])||0)<10){
      v -= TRAIN_PER_POINT;
      grantStat(key, 1);
      record('SPECIAL_TRAINED', {stat:key, value:s.stats[key]}, 0);
      raised.push(key);
    }
    s.statTrain[key] = Math.min(v, TRAIN_PER_POINT);
    return raised;
  }

  // ---------- VITALS: the day's check-in ----------
  // One entry a day in state.vitals, made by the day's first change: six
  // levels from 0 to 10 (until moved, the last check-in's, or 5 without
  // one), the resting pulse, two counters.
  // The check-in itself is paid once a day (logVitals): VITALS_XP, which
  // trains Intelligence as much. What changes after it is kept, unpaid.
  // VITALS' day runs from VITALS_DAY_START (4:00) to 4:00, not midnight to
  // midnight: late at night, a counter tapped or the check-in still belongs
  // to the evening's day, so the next morning's check-in stays the
  // morning's. Its date is the day it started (vitalsDayStr()). The rest of
  // the app (dailies, the streak, trials) keeps midnight.
  function vitalsDayStr(){
    var d = new Date();
    if (d.getHours()<VITALS_DAY_START) d.setDate(d.getDate()-1);
    return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
  }
  function dayNumber(date){
    var m = DATE.exec(date || '');
    return m ? Date.UTC(+m[1], +m[2]-1, +m[3])/864e5 : NaN;
  }
  function byDate(a, b){ return dayNumber(a.date)-dayNumber(b.date); }
  function vitalsToday(create){
    var s = app.state, today = vitalsDayStr();
    var e = s.vitals.filter(function(v){ return v.date===today; })[0] || null;
    if (!e && create){
      var last = lastCheckIn();
      e = {date:today, logged:false};
      VITAL_KEYS.forEach(function(k){ e[k] = last ? clamp(Math.round(Number(last[k])||0), 0, 10) : 5; });
      e.pulse = null; e.radN = 0; e.radT = 0;
      s.vitals.push(e);
      if (s.vitals.length>VITALS_MAX) s.vitals = s.vitals.slice(-VITALS_MAX);
    }
    return e;
  }
  // A level moved (0-10, whole). Returns the value kept, or null for an
  // unknown level or a value that isn't a number.
  function setVital(key, value){
    var v = Math.round(Number(value));
    if (VITAL_KEYS.indexOf(key)===-1 || String(value).trim()==='' || !isFinite(v)) return null;
    return (vitalsToday(true)[key] = clamp(v, 0, 10));
  }
  // The resting pulse typed: kept when it's a pulse (PULSE_MIN-PULSE_MAX),
  // else none. Returns what's kept.
  function setPulse(value){
    var text = String(value===undefined || value===null ? '' : value).trim(), v = Math.round(Number(text));
    return (vitalsToday(true).pulse = text && isFinite(v) && v>=PULSE_MIN && v<=PULSE_MAX ? v : null);
  }
  // One more (dir > 0) or one less on a counter, 'N' or 'T'.
  function stepRads(which, dir){
    var e = vitalsToday(true), field = which==='T' ? 'radT' : 'radN';
    return (e[field] = clamp((Number(e[field])||0) + (Number(dir)>0 ? 1 : -1), 0, RAD_COUNT_MAX));
  }
  // The day's check-in, once: null when it was logged already, else
  // award()'s result with `trained` (the stats it raised).
  function logVitals(){
    var e = vitalsToday(true);
    if (e.logged) return null;
    e.logged = true;
    var reward = award('VITALS_CHECKIN', {}, VITALS_XP);
    reward.trained = trainStat('INT', reward.xp);
    return reward;
  }
  // The latest `n` entries, newest first.
  function lastVitals(n){
    return app.state.vitals.slice().sort(byDate).reverse().slice(0, n);
  }
  // The latest check-in logged before today's VITALS day, with how many
  // days before it (`ago`: 1 is yesterday); null for none.
  function lastCheckIn(){
    var today = dayNumber(vitalsDayStr());
    var e = lastVitals(VITALS_MAX).filter(function(v){ return v.logged && dayNumber(v.date)<today; })[0];
    if (!e) return null;
    var copy = {};
    Object.keys(e).forEach(function(k){ copy[k] = e[k]; });
    copy.ago = Math.round(today - dayNumber(e.date));
    return copy;
  }

  // ---------- the chem-free streak, and the player's own ----------
  // chems.cleanSince is the run's first chem-free day: that day is day 1,
  // and the full days done are one less. After a lapse the run starts again
  // tomorrow (day 0 today). Each milestone (CLEAN_MILESTONES) is paid once a
  // run, as soon as it's reached (claimCleanMilestones): correcting the
  // start date never pays one twice. A lapse keeps the days done (they go
  // into totalClean, and best), and takes nothing back.
  // The player's own streaks (state.streaks, a name they type) work the
  // same way, with the same milestones (STREAK_MILESTONE): the functions
  // below take a streak's id, and without one they mean the chem-free one.
  function streakById(id){
    if (id===undefined || id===null) return app.state.chems;
    return (app.state.streaks || []).filter(function(x){ return x.id===id; })[0] || null;
  }
  function cleanDay(id){
    var c = streakById(id), d = c ? daysSince(c.cleanSince) : null;
    return d===null ? null : d+1;
  }
  function cleanFullDays(id){ var d = cleanDay(id); return d===null ? 0 : Math.max(0, d-1); }
  function cleanTotal(id){ var c = streakById(id); return c ? (Number(c.totalClean)||0) + cleanFullDays(id) : 0; }
  function cleanBest(id){ var c = streakById(id); return c ? Math.max(Number(c.best)||0, cleanFullDays(id)) : 0; }
  function nextCleanMilestone(id){
    var done = cleanFullDays(id);
    return CLEAN_MILESTONES.filter(function(m){ return done<m.days; })[0] || null;
  }
  // The run's first day, set or corrected: a date up to today. Returns false
  // for anything else.
  function setCleanStart(date, id){
    var c = streakById(id);
    date = normalizeDate(date);
    var d = daysSince(date);
    if (!c || !date || d===null || d<0) return false;
    c.cleanSince = date;
    return true;
  }
  // The milestones reached and not paid yet in this run, the chem-free
  // streak's (CLEAN_MILESTONE) then each of the player's own
  // (STREAK_MILESTONE): each one its reward. Returns [{days, xp, leveled,
  // name (the player's own only)}], [] for none.
  function claimCleanMilestones(){
    var paid = [];
    [null].concat((app.state.streaks || []).map(function(x){ return x.id; })).forEach(function(id){
      var c = streakById(id), done = cleanFullDays(id);
      CLEAN_MILESTONES.forEach(function(m){
        if (done<m.days || c.claimed.indexOf(m.days)!==-1) return;
        c.claimed.push(m.days);
        var reward = id===null ? award('CLEAN_MILESTONE', {days:m.days}, m.xp) :
          award('STREAK_MILESTONE', {streak:c.id, name:c.name, days:m.days}, m.xp);
        var out = {days:m.days, xp:reward.xp, leveled:reward.leveled};
        if (id!==null) out.name = c.name;
        paid.push(out);
      });
    });
    return paid;
  }
  // A lapse today: the run's days are kept in the totals, and the next run
  // starts tomorrow. False when no run was started.
  function logLapse(id){
    var c = streakById(id), today = todayStr();
    if (!c || !c.cleanSince) return false;
    var run = cleanFullDays(id);
    c.totalClean = (Number(c.totalClean)||0) + run;
    c.best = Math.max(Number(c.best)||0, run);
    if (c.lapses[c.lapses.length-1]!==today) c.lapses.push(today);
    if (c.lapses.length>LAPSES_MAX) c.lapses = c.lapses.slice(-LAPSES_MAX);
    var tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate()+1);
    c.cleanSince = tomorrow.getFullYear()+'-'+(tomorrow.getMonth()+1)+'-'+tomorrow.getDate();
    c.claimed = [];
    return true;
  }
  // A lapse logged today, on any streak (the urge decoder's reset line).
  function lapsedToday(){
    var today = todayStr();
    return [app.state.chems].concat(app.state.streaks || []).some(function(c){
      var lapses = (c && c.lapses) || [];
      return lapses.length>0 && lapses[lapses.length-1]===today;
    });
  }
  // The player's own streak, started: a name (STREAK_NAME_MAX letters at
  // most) and its first day, up to today (today without one). Returns it,
  // or null (no name, a bad date, STREAKS_MAX already).
  function addStreak(name, date){
    var list = app.state.streaks;
    name = text(name, STREAK_NAME_MAX).trim();
    date = date ? normalizeDate(date) : todayStr();
    var d = daysSince(date);
    if (!name || list.length>=STREAKS_MAX || !date || d===null || d<0) return null;
    var x = {id:genId(), name:name, cleanSince:date, best:0, totalClean:0, claimed:[], lapses:[]};
    list.push(x);
    return x;
  }
  function renameStreak(id, name){
    var x = id ? streakById(id) : null;
    name = text(name, STREAK_NAME_MAX).trim();
    if (!x || !name) return false;
    x.name = name;
    return true;
  }
  // Put away for good (asked first, vitals.js): the XP its milestones gave
  // stays, and so do their events in the history.
  function removeStreak(id){
    var list = app.state.streaks, i = list.map(function(x){ return x.id; }).indexOf(id);
    if (!id || i===-1) return false;
    list.splice(i, 1);
    return true;
  }

  // ---------- the urge decoder ----------
  // Name the real need, then a timer of URGE_MS (urges.active, so it keeps
  // running when the app is closed). At zero: ridden out (urgeWon: URGE_XP
  // and +1 SURVIVAL, at most URGE_XP_PER_DAY times a day; logged either
  // way), or another round.
  function startUrge(need){
    app.state.urges.active = {start:Date.now(), need:URGE_NEEDS.indexOf(need)!==-1 ? need : 'NONE', rounds:1};
    return app.state.urges.active;
  }
  // What's left of the round, in ms: 0 when it's over or none runs.
  function urgeLeft(){
    var a = app.state.urges.active;
    return a ? clamp(URGE_MS - (Date.now() - a.start), 0, URGE_MS) : 0;
  }
  function urgeAgain(){
    var a = app.state.urges.active;
    if (!a) return false;
    a.start = Date.now();
    a.rounds = (a.rounds||1) + 1;
    return true;
  }
  function cancelUrge(){ app.state.urges.active = null; }
  function urgesToday(){
    var today = todayStr();
    return app.state.urges.log.filter(function(u){ return u.date===today; }).length;
  }
  // Ridden out, once the round is over: null before that (or when none
  // runs); else award()'s result, or {xp:0, capped:true} past the day's cap.
  function urgeWon(){
    var u = app.state.urges, a = u.active;
    if (!a || urgeLeft()>0) return null;
    var paid = urgesToday()<URGE_XP_PER_DAY;
    u.log.push({date:todayStr(), need:a.need, rounds:a.rounds||1});
    if (u.log.length>URGES_MAX) u.log = u.log.slice(-URGES_MAX);
    u.active = null;
    if (!paid) return {xp:0, leveled:false, skillGains:[], capped:true};
    return award('URGE_RESISTED', {need:a.need, rounds:a.rounds||1}, URGE_XP, [{skill:URGE_SKILL, amount:1}]);
  }

  // ---------- TRIALS: tests to repeat about once a week ----------
  // The built-in TRIALS (some may be hidden) and the player's own, each with
  // its kind (TRIAL_KINDS). A result is logged with the day; the best one is
  // the record. One result a trial a day is paid (the first): a new record
  // TRIAL_RECORD_XP, else TRIAL_XP, and that XP trains the trial's stat.
  // More results the same day are kept (a record too), unpaid. Removing a
  // result (a typo) keeps what it paid, like a book.
  function trialById(id){
    var t = TRIALS.filter(function(x){ return x.id===id; })[0] ||
      app.state.trials.custom.filter(function(x){ return x.id===id; })[0];
    if (!t) return null;
    var k = TRIAL_KINDS[t.kind] || TRIAL_KINDS.reps;
    return {id:t.id, name:t.name, what:t.what || k.label, kind:has(TRIAL_KINDS, t.kind) ? t.kind : 'reps', stat:t.stat,
      unit:k.unit, better:k.better, timer:k.timer, seconds:k.seconds || 0, custom:!t.what};
  }
  // The trials shown: the built-in ones not hidden, then the player's own.
  function trialList(){
    var hidden = app.state.trials.hidden;
    return TRIALS.filter(function(t){ return hidden.indexOf(t.id)===-1; }).concat(app.state.trials.custom)
      .map(function(t){ return trialById(t.id); });
  }
  function trialResults(id){
    return app.state.trials.log.filter(function(r){ return r.id===id; });
  }
  function beats(trial, a, b){ return trial.better==='less' ? a<b : a>b; }
  // The record: the best value logged, or null.
  function trialBest(id){
    var t = trialById(id), best = null;
    if (!t) return null;
    trialResults(id).forEach(function(r){ if (best===null || beats(t, r.value, best)) best = r.value; });
    return best;
  }
  function trialPaidToday(id){
    var today = todayStr();
    return trialResults(id).some(function(r){ return r.date===today && r.xp>0; });
  }
  // What a result would be, before it's saved: {value, record, xp}, or null
  // when it isn't a result (see trialValue).
  function trialPreview(id, value){
    var t = trialById(id);
    value = trialValue(t, value);
    if (value===null) return null;
    var best = trialBest(id), record = best===null || beats(t, value, best);
    return {value:value, record:record, xp:trialPaidToday(id) ? 0 : record ? TRIAL_RECORD_XP : TRIAL_XP};
  }
  // A result as stored: whole reps or seconds, from 1 to the kind's most;
  // null for anything else.
  function trialValue(t, value){
    var v = Math.round(Number(value));
    if (!t || !isFinite(v) || v<1) return null;
    return Math.min(v, TRIAL_VALUE_MAX[t.unit]);
  }
  // Saves a result: {entry, record, reward} (reward null when today's was
  // paid already; else award()'s result with `trained`), or null.
  function logTrial(id, value){
    var t = trialById(id), preview = trialPreview(id, value);
    if (!preview) return null;
    var s = app.state, entry = {id:t.id, date:todayStr(), value:preview.value, xp:0, t:Date.now()};
    s.trials.log.push(entry);
    if (s.trials.log.length>TRIALS_LOG_MAX) s.trials.log = s.trials.log.slice(-TRIALS_LOG_MAX);
    var reward = null;
    if (preview.xp){
      reward = award('TRIAL_DONE', {trial:t.name, value:preview.value, record:preview.record ? 1 : 0}, preview.xp);
      entry.xp = reward.xp;
      reward.trained = trainStat(t.stat, reward.xp);
    }
    return {entry:entry, record:preview.record, reward:reward};
  }
  // A result removed (logged by mistake): what it paid stays.
  function removeTrialResult(id, t){
    var log = app.state.trials.log, i;
    for (i=log.length-1;i>=0;i--){
      if (log[i].id===id && log[i].t===Number(t)){ log.splice(i, 1); return true; }
    }
    return false;
  }
  // Due: no result in the last TRIAL_DUE_DAYS days (or never tried).
  function trialDue(id){
    var last = trialResults(id).slice(-1)[0];
    var d = last ? daysSince(last.date) : null;
    return d===null || d>=TRIAL_DUE_DAYS;
  }
  function trialsDue(){
    return trialList().filter(function(t){ return trialDue(t.id); }).length;
  }
  // The next goal: a little past the record (5% more reps, 5 seconds or 5%
  // longer, 3% or 5 seconds faster). null before the first result.
  function trialGoal(id){
    var t = trialById(id), best = trialBest(id);
    if (!t || best===null) return null;
    if (t.better==='less') return Math.max(1, best - Math.max(5, Math.round(best*0.03)));
    return Math.min(TRIAL_VALUE_MAX[t.unit], best + Math.max(t.unit==='seconds' ? 5 : 1, Math.round(best*0.05)));
  }
  // The player's own trial: a name, a kind, a stat. Returns it, or null (no
  // name, the list full).
  function addTrial(name, kind, stat){
    var list = app.state.trials.custom;
    name = String(name===undefined || name===null ? '' : name).trim().slice(0, TRIAL_NAME_MAX);
    if (!name || list.length>=TRIALS_CUSTOM_MAX) return null;
    var t = {id:genId(), name:name, kind:has(TRIAL_KINDS, kind) ? kind : 'reps', stat:STAT_KEYS.indexOf(stat)!==-1 ? stat : 'END'};
    list.push(t);
    return trialById(t.id);
  }
  // A built-in trial is hidden (its results kept, for when it's shown again);
  // the player's own is removed with its results (their XP stays).
  function removeTrial(id){
    var tr = app.state.trials;
    if (TRIALS.some(function(t){ return t.id===id; })){
      if (tr.hidden.indexOf(id)===-1) tr.hidden.push(id);
    } else {
      var before = tr.custom.length;
      tr.custom = tr.custom.filter(function(t){ return t.id!==id; });
      if (tr.custom.length===before) return false;
      tr.log = tr.log.filter(function(r){ return r.id!==id; });
    }
    if (tr.active && tr.active.id===id) tr.active = null;
    return true;
  }
  function showTrial(id){
    var tr = app.state.trials;
    tr.hidden = tr.hidden.filter(function(h){ return h!==id; });
  }
  // A trial's timer: it counts from TRIAL_COUNTDOWN_MS after the tap (the
  // 3-2-1). One at a time.
  function startTrial(id){
    if (!trialById(id)) return null;
    return (app.state.trials.active = {id:id, start:Date.now()+TRIAL_COUNTDOWN_MS});
  }
  // Ms since the timer's start: negative during the 3-2-1; null when none runs.
  function trialElapsed(){
    var a = app.state.trials.active;
    return a ? Date.now()-a.start : null;
  }
  // Stops it: the whole seconds it ran (0 when stopped during the 3-2-1).
  function stopTrial(){
    var ms = trialElapsed();
    app.state.trials.active = null;
    return ms===null ? null : Math.max(0, Math.round(ms/1000));
  }
  // Typed results: reps as a number; a time as m:ss (or h:mm:ss), or seconds.
  function parseTrialValue(id, text){
    var t = trialById(id);
    text = String(text===undefined || text===null ? '' : text).trim();
    if (!t || !text) return null;
    if (t.unit==='seconds' && /^\d+(:\d{1,2}){1,2}$/.test(text)){
      var parts = text.split(':').map(Number);
      if (parts.slice(1).some(function(p){ return p>59; })) return null;
      return trialValue(t, parts.reduce(function(sum, p){ return sum*60+p; }, 0));
    }
    return /^\d+([.,]\d+)?$/.test(text) ? trialValue(t, Number(text.replace(',', '.'))) : null;
  }
  // A value as shown: "32" (reps), "1:30" or "1:02:05" (a time).
  function trialValueText(id, value){
    var t = trialById(id), v = Math.round(Number(value)) || 0;
    if (!t || t.unit!=='seconds') return String(v);
    var h = Math.floor(v/3600), m = Math.floor(v%3600/60), sec = v%60;
    return (h ? h+':'+(m<10 ? '0' : '') : '')+m+':'+(sec<10 ? '0' : '')+sec;
  }

  // ---------- the old terminal's data ----------
  // The owner's in-Claude version (one page, with its own data) has VITALS,
  // the streak, urges and training too. Its backup can be added to this
  // app's data: those parts, and the daily and side quests this app doesn't
  // have yet (same id or same objective); never its XP, level, skills,
  // stats, items, wallet or journal, which this app has its own of. `src`
  // comes from sanitizeImported(); `into` is the state to add to (a copy, to
  // say first what would be added). Adding the same file twice adds nothing.
  // Nothing is paid here: a streak milestone reached is paid afterwards, by
  // claimCleanMilestones. Returns what was added.
  function mergeOld(into, src){
    var added = {vitals:0, streak:false, lapses:0, urges:0, dailies:0, side:0, training:false};
    // Check-ins: the days this app has none for.
    var days = {};
    into.vitals.forEach(function(v){ days[v.date] = true; });
    src.vitals.forEach(function(v){
      if (days[v.date]) return;
      days[v.date] = true;
      into.vitals.push(clone(v));
      added.vitals++;
    });
    into.vitals = into.vitals.sort(byDate).slice(-VITALS_MAX);
    // The streak: its start when this app has none; the longest and the total days.
    var c = into.chems, o = src.chems;
    if (!c.cleanSince && o.cleanSince){ c.cleanSince = o.cleanSince; added.streak = true; }
    c.best = Math.max(c.best, o.best);
    c.totalClean = Math.max(c.totalClean, o.totalClean);
    o.lapses.forEach(function(d){
      if (c.lapses.indexOf(d)!==-1) return;
      c.lapses.push(d);
      added.lapses++;
    });
    c.lapses = c.lapses.sort(function(a, b){ return dayNumber(a)-dayNumber(b); }).slice(-LAPSES_MAX);
    // Urges ridden out: the ones from before every one here.
    var first = into.urges.log.length ? dayNumber(into.urges.log[0].date) : Infinity;
    var older = src.urges.log.filter(function(u){ return dayNumber(u.date)<first; });
    into.urges.log = older.map(clone).concat(into.urges.log).slice(-URGES_MAX);
    added.urges = older.length;
    // Training: the further of the two, stat by stat.
    STAT_KEYS.forEach(function(k){
      if (src.statTrain[k]>into.statTrain[k]){ into.statTrain[k] = src.statTrain[k]; added.training = true; }
    });
    // Quests: the daily ones (to do today) and the open side ones this app lacks.
    function known(list, q){
      var objective = foldName(q.name);
      return list.some(function(x){ return x.id===q.id || (objective && foldName(x.name)===objective); });
    }
    src.quests.daily.forEach(function(q){
      if (known(into.quests.daily, q)) return;
      var copy = clone(q);
      copy.lastDate = null;
      into.quests.daily.push(copy);
      added.dailies++;
    });
    src.quests.side.forEach(function(q){
      if (q.done || known(into.quests.side, q)) return;
      into.quests.side.push(clone(q));
      added.side++;
    });
    return added;
  }

  // ---------- bobbleheads ----------
  // Collectibles for real milestones, found once each (with BOBBLEHEAD_XP)
  // as soon as their condition holds: findBobbleheads() looks after every
  // change (events.js). A save from before them finds the ones it already
  // earned, all at once, the first time.
  var BOBBLEHEAD_XP = 50;
  function countries(s){
    var seen = {};
    s.map.cities.concat(s.map.regions, s.map.pins).forEach(function(p){ if (p.cc) seen[p.cc] = true; });
    return Object.keys(seen).length;
  }
  function doneMain(s, type){ return s.quests.mains.some(function(m){ return m.completed && m.progressType===type; }); }
  function highest(values){ return Math.max.apply(null, Object.keys(values).map(function(k){ return Number(values[k])||0; })); }
  var BOBBLEHEADS = [
    {id:'vault', name:'Vault Dweller', how:'Reach level 5', found:function(s){ return s.level>=5; }},
    {id:'veteran', name:'Wasteland Veteran', how:'Reach level 10', found:function(s){ return s.level>=10; }},
    {id:'devotion', name:'Devotion', how:'Complete a day-streak main quest', found:function(s){ return doneMain(s, 'streak'); }},
    {id:'capitalist', name:'Capitalist', how:'Complete a Caps goal', found:function(s){ return doneMain(s, 'caps'); }},
    {id:'merchant', name:'Merchant', how:'Sell an item', found:function(s){
      return s.log.some(function(e){ return e.reason==='Item sold'; }); }},
    {id:'errands', name:'Errand Runner', how:'Complete 10 side quests', found:function(s){
      return s.quests.side.filter(function(q){ return q.done; }).length>=10; }},
    {id:'routine', name:'Creature of Routine', how:'Do 30 daily quests', found:function(s){ return (s.lifetimeDailies||0)>=30; }},
    {id:'explorer', name:'Explorer', how:'Reveal 10 cities', found:function(s){ return s.map.cities.length>=10; }},
    {id:'globetrotter', name:'Globetrotter', how:'Places in 5 countries', found:function(s){ return countries(s)>=5; }},
    {id:'bookworm', name:'Bookworm', how:'Read 5 books', found:function(s){ return (s.books||[]).length>=5; }},
    {id:'scribe', name:'Scribe', how:'25 journal entries', found:function(s){ return logEntryCount()>=25; }},
    {id:'specialist', name:'Specialist', how:'A skill at 50', found:function(s){ return highest(s.skills)>=50; }},
    {id:'special', name:'S.P.E.C.I.A.L.ist', how:'A S.P.E.C.I.A.L. stat at 10', found:function(s){ return highest(s.stats)>=10; }},
    {id:'perks', name:'Perk Collector', how:'Take 3 perks', found:function(s){ return Object.keys(s.perks||{}).length>=3; }},
    {id:'radfree', name:'Rad-Free', how:'Make a backup (RadAway)', found:function(s){ return !!s.lastBackup; }},
    {id:'archivist', name:'Archivist', how:'Record 5 holotapes', found:function(s){ return (s.lifetimeHolotapes||0)>=5; }}
  ];
  // The bobbleheads found by this change: {found: [bobblehead], xp, leveled},
  // or null when there's none new. Each is its own reward (and event).
  function findBobbleheads(){
    var s = app.state, found = [], xp = 0, leveled = false;
    BOBBLEHEADS.forEach(function(b){
      if (has(s.bobbleheads, b.id) || !b.found(s)) return;
      s.bobbleheads[b.id] = todayStr();
      found.push(b);
      var reward = award('BOBBLEHEAD_FOUND', {id:b.id, name:b.name}, BOBBLEHEAD_XP);
      xp += reward.xp;
      leveled = leveled || reward.leveled;
    });
    return found.length ? {found:found, xp:xp, leveled:leveled} : null;
  }

  // ---------- perks ----------
  // A perk point comes with each level-up, like the S.P.E.C.I.A.L. point;
  // the player spends it on a perk of the chart (STATUS tab). Rank r of a
  // perk needs its stat at `min`+r-1. What each perk does is data, applied
  // in one place (withPerks, in award): to the rewards of event type `on`,
  // per rank, `xpFlat` XP added, then `xpPercent` % more, and `skillFlat`
  // added to each skill gain. `text` says it for the chart ({flat},
  // {percent}, {times}, {skill}: the numbers at a rank).
  var PERKS = [
    {id:'wanderer', name:'Wanderer', stat:'END', min:3, ranks:3, icon:'road',
      on:'ROUTE_ADDED', xpFlat:25, text:'Each new route: +{flat} XP'},
    {id:'cartographer', name:'Cartographer', stat:'INT', min:4, ranks:2, icon:'map',
      on:'PLACE_DISCOVERED', xpPercent:25, text:'Discovering a city or region: +{percent}% XP'},
    {id:'ironwill', name:'Iron Will', stat:'END', min:4, ranks:3, icon:'flame',
      on:'STREAK_CHECKIN', xpFlat:10, text:'Each streak check-in: +{flat} XP'},
    {id:'barter', name:'Barter', stat:'CHA', min:3, ranks:2, icon:'cap',
      on:'ITEM_SOLD', xpPercent:100, text:'Selling an item: {times}× the XP'},
    {id:'scholar', name:'Scholar', stat:'INT', min:5, ranks:2, icon:'book',
      on:'QUEST_COMPLETED', skillFlat:1, text:'Every skill gain from a quest: +{skill}'},
    {id:'habit', name:'Creature of Habit', stat:'STR', min:3, ranks:3, icon:'calendar',
      on:'DAILY_DONE', xpFlat:5, text:'Daily quests: +{flat} XP'},
    {id:'comprehension', name:'Comprehension', stat:'INT', min:3, ranks:2, icon:'eye',
      on:'JOURNAL_ENTRY', xpPercent:20, text:'Journal entries (Analyze): +{percent}% XP'},
    {id:'quickhands', name:'Quick Hands', stat:'AGI', min:3, ranks:2, icon:'bolt',
      on:'BONUS_COMPLETED', xpPercent:25, text:'Bonus objectives: +{percent}% XP'}
  ];
  // "Each new route: +50 XP": a perk's text at rank r (for the chart).
  PERKS.forEach(function(p){
    p.effect = function(r){
      return p.text.replace('{flat}', (p.xpFlat||0)*r).replace('{percent}', (p.xpPercent||0)*r)
        .replace('{times}', 1+(p.xpPercent||0)*r/100).replace('{skill}', (p.skillFlat||0)*r);
    };
  });
  function perkById(id){ return PERKS.filter(function(p){ return p.id===id; })[0] || null; }
  function perkRank(id){
    var perks = app.state && app.state.perks;
    return perks && Object.prototype.hasOwnProperty.call(perks, id) ? Number(perks[id])||0 : 0;
  }
  // The next rank of a perk can be taken: not maxed, and the stat is high enough.
  function perkOpen(id){
    var p = perkById(id);
    if (!p) return false;
    var next = perkRank(id)+1;
    return next<=p.ranks && (Number(app.state.stats[p.stat])||0) >= p.min+next-1;
  }
  // Spends a perk point on the next rank of a perk. Returns the new rank, or
  // 0 when it can't be taken (no point, stat too low, maxed).
  function takePerk(id){
    var s = app.state;
    if ((s.unspentPerkPoints||0)<=0 || !perkOpen(id)) return 0;
    s.perks[id] = perkRank(id)+1;
    s.unspentPerkPoints -= 1;
    record('PERK_TAKEN', {perk:id, name:perkById(id).name, rank:s.perks[id]}, 0);
    return s.perks[id];
  }

  // ---------- checking a document ----------
  // Every document the app takes in goes through sanitizeImported(): a
  // backup file (untrusted input), each copy storage.js loads, and a copy
  // saved by another window. Every field is coerced back to the type the
  // data model gives it, so a broken or hostile document can't break the
  // page or put markup into it. Text is only shortened where the app itself
  // never writes more (quest names and main objectives: 60, like their
  // boxes; journal dates and reasons), so a document the app saved or
  // exported comes back exactly as it was.
  var SAFE_ID = /^[A-Za-z0-9_-]{1,40}$/;
  function num(v, fallback){ var n = Number(v); return isFinite(n) ? n : fallback; }
  function text(v, max){
    var str = v===null || v===undefined ? '' : String(v);
    return max ? str.slice(0, max) : str;
  }
  function safeId(v){ return (typeof v==='string' && SAFE_ID.test(v)) ? v : genId(); }
  function records(list, fix){
    return (Array.isArray(list) ? list : []).filter(function(x){
      return x && typeof x==='object' && !Array.isArray(x);
    }).map(function(x){
      var out = copyFields({}, x);
      fix(out);
      return out;
    });
  }
  function fixQuest(q){
    q.id = safeId(q.id);
    q.name = text(q.name);
    q.xp = Math.max(0, num(q.xp, 0));
  }
  function fixDoneQuest(q){ fixQuest(q); q.done = q.done===true; }
  function fixQuestName(q){ q.questName = text(q.questName, QUEST_NAME_MAX).trim(); }
  function fixGains(list){
    return records(list, function(g){ g.amount = num(g.amount, 0); })
      .filter(function(g){ return SKILL_KEYS.indexOf(g.skill)!==-1; });
  }

  // Returns a clean state document, or null when `raw` isn't a state document
  // of this app (a backup, or a saved copy).
  function sanitizeImported(raw){
    if (!raw || typeof raw!=='object' || Array.isArray(raw)) return null;
    if (!raw.stats || typeof raw.stats!=='object' || !raw.quests || typeof raw.quests!=='object') return null;
    var s = mergeDefaults(raw);
    s.level = Math.max(1, Math.round(num(s.level, 1)));
    s.xpToNext = Math.max(1, Math.round(num(s.xpToNext, 1000)));
    s.xp = clamp(num(s.xp, 0), 0, 1e9);
    s.lifetimeXp = Math.max(0, num(s.lifetimeXp, 0));
    s.unspentSpecialPoints = Math.max(0, Math.round(num(s.unspentSpecialPoints, 0)));
    // Perks: only the chart's, each at a whole rank within its ranks.
    var perks = {};
    PERKS.forEach(function(p){
      var rank = s.perks && typeof s.perks==='object' && has(s.perks, p.id) ? Math.round(num(s.perks[p.id], 0)) : 0;
      if (rank>0) perks[p.id] = Math.min(rank, p.ranks);
    });
    s.perks = perks;
    s.unspentPerkPoints = Math.max(0, Math.round(num(s.unspentPerkPoints, 0)));
    // Bobbleheads: only the known ones, each with the day it was found.
    var bobbleheads = {};
    BOBBLEHEADS.forEach(function(b){
      var date = s.bobbleheads && typeof s.bobbleheads==='object' && has(s.bobbleheads, b.id) ? normalizeDate(s.bobbleheads[b.id]) : null;
      if (date) bobbleheads[b.id] = date;
    });
    s.bobbleheads = bobbleheads;
    s.lifetimeDailies = Math.max(0, Math.round(num(s.lifetimeDailies, 0)));
    s.lifetimeHolotapes = Math.max(0, Math.round(num(s.lifetimeHolotapes, 0)));
    // The history: known event types at a real time, their data kept plain.
    s.history = (Array.isArray(s.history) ? s.history : []).filter(function(e){
      return e && typeof e==='object' && EVENT_TYPES.indexOf(e.type)!==-1 && isFinite(Number(e.t)) && Number(e.t)>0;
    }).map(function(e){
      return {t:Number(e.t), type:e.type, xp:Math.max(0, Math.round(num(e.xp, 0))), data:eventData(e.data)};
    }).slice(-HISTORY_MAX);
    STAT_KEYS.forEach(function(k){ s.stats[k] = clamp(Math.round(num(s.stats[k], 0)), 0, 10); });
    SKILL_KEYS.forEach(function(k){ s.skills[k] = clamp(Math.round(num(s.skills[k], 0)), 0, 100); });
    // Training: a whole number from 0 to TRAIN_PER_POINT for each stat.
    var train = s.statTrain;
    s.statTrain = {};
    STAT_KEYS.forEach(function(k){ s.statTrain[k] = clamp(Math.round(num(train[k], 0)), 0, TRAIN_PER_POINT); });

    s.quests.mains = records(s.quests.mains, function(m){
      m.id = safeId(m.id);
      fixQuestName(m);
      m.title = text(m.title, 60);
      m.progressType = m.progressType==='streak' || m.progressType==='caps' ? m.progressType : 'percent';
      if (m.progressType==='caps') m.capsTarget = clamp(num(m.capsTarget, 5), 0.01, 1e6);
      m.progress = clamp(Math.round(num(m.progress, 0)), 0, 100);
      if (m.progressType==='streak'){
        m.streakTarget = clamp(Math.round(num(m.streakTarget, 7)), 1, STREAK_MAX_DAYS);
        m.streakDays = clamp(Math.round(num(m.streakDays, 0)), 0, m.streakTarget);
        m.lastCheckIn = normalizeDate(m.lastCheckIn);
      }
      m.xp = Math.max(0, num(m.xp, 0));
      m.completed = m.completed===true;
      m.skillGains = fixGains(m.skillGains);
      m.bonus = records(m.bonus, fixDoneQuest);
    });
    s.quests.side = records(s.quests.side, function(q){
      fixDoneQuest(q);
      fixQuestName(q);
      q.skillGains = fixGains(q.skillGains);
    });
    s.quests.daily = records(s.quests.daily, function(q){
      fixQuest(q);
      fixQuestName(q);
      q.lastDate = normalizeDate(q.lastDate);
      if (STAT_KEYS.indexOf(q.stat)===-1) delete q.stat;
    });

    s.inventory = records(s.inventory, function(i){
      i.id = safeId(i.id);
      i.name = text(i.name);
      if (CATS.indexOf(i.category)===-1) i.category = 'MISC';
      if (i.price===undefined || i.price===null || i.price==='') delete i.price;
      else {
        var price = num(i.price, -1);
        if (price>=0) i.price = price;
        else delete i.price;
      }
    });
    s.books = records(s.books, function(b){
      b.id = safeId(b.id);
      b.title = text(b.title, BOOK_TITLE_MAX).trim() || 'Untitled';
      b.author = text(b.author, BOOK_AUTHOR_MAX).trim();
      b.date = normalizeDate(b.date);
      b.skillGains = fixGains(b.skillGains).slice(0, 1).map(function(g){
        return {skill:g.skill, amount:clamp(Math.round(g.amount), 1, BOOK_SKILL_MAX)};
      });
    });
    s.finances.holdings = records(s.finances.holdings, function(h){
      h.id = safeId(h.id);
      h.label = text(h.label);
      h.amount = num(h.amount, 0);
      var rate = num(h.rateToCAD, 1);
      h.rateToCAD = rate>0 ? rate : 1;
    });
    var log = records(s.log, function(entry){
      entry.date = text(entry.date, 40);
      entry.text = text(entry.text);
      entry.xp = num(entry.xp, 0);
      entry.reason = text(entry.reason, 200);
    });
    s.lifetimeLogEntries = Math.max(log.length, Math.round(num(s.lifetimeLogEntries, 0)));
    s.lastBackup = normalizeDate(s.lastBackup);
    s.log = log.slice(-LOG_MAX);
    sanitizeMap(s.map);
    sanitizeVitals(s);
    return s;
  }

  // VITALS, the streak and the urges: each field rebuilt from what's known
  // of it (dates 'YYYY-MM-DD' from the in-Claude version become 'YYYY-M-D').
  function dates(list){
    var seen = {};
    return (Array.isArray(list) ? list : []).map(normalizeDate).filter(function(d){
      if (!d || seen[d]) return false;
      seen[d] = true;
      return true;
    }).sort(function(a, b){ return dayNumber(a)-dayNumber(b); });
  }
  function urgeNeed(v){ return URGE_NEEDS.indexOf(v)!==-1 ? v : 'NONE'; }
  function rounds(v){ return Math.max(1, Math.round(num(v, 1))); }
  // A streak's run (chems, or one of the player's own).
  function streakRun(c){
    var milestones = CLEAN_MILESTONES.map(function(m){ return m.days; });
    return {
      cleanSince: normalizeDate(c.cleanSince),
      best: Math.max(0, Math.round(num(c.best, 0))),
      totalClean: Math.max(0, Math.round(num(c.totalClean, 0))),
      claimed: milestones.filter(function(d){ return Array.isArray(c.claimed) && c.claimed.some(function(x){ return num(x, 0)===d; }); }),
      lapses: dates(c.lapses).slice(-LAPSES_MAX)
    };
  }
  function sanitizeVitals(s){
    s.chems = streakRun(s.chems);
    // The player's own streaks: a name (or "Streak"), an id of their own, at most STREAKS_MAX.
    var ids = {};
    s.streaks = records(s.streaks, function(){}).map(function(x){
      var out = {id:safeId(x.id), name:text(x.name, STREAK_NAME_MAX).trim() || 'Streak'};
      var run = streakRun(x);
      Object.keys(run).forEach(function(k){ out[k] = run[k]; });
      return out;
    }).filter(function(x){
      if (ids[x.id]) return false;
      ids[x.id] = true;
      return true;
    }).slice(0, STREAKS_MAX);
    // One entry a day: a second one for the same day replaces the first.
    var byDay = {};
    records(s.vitals, function(){}).forEach(function(v){
      var date = normalizeDate(v.date);
      if (!date) return;
      var out = {date:date, logged:v.logged===true};
      VITAL_KEYS.forEach(function(k){ out[k] = clamp(Math.round(num(v[k], 5)), 0, 10); });
      var pulse = Math.round(num(v.pulse, 0));
      out.pulse = pulse>=PULSE_MIN && pulse<=PULSE_MAX ? pulse : null;
      out.radN = clamp(Math.round(num(v.radN, 0)), 0, RAD_COUNT_MAX);
      out.radT = clamp(Math.round(num(v.radT, 0)), 0, RAD_COUNT_MAX);
      byDay[date] = out;
    });
    s.vitals = Object.keys(byDay).map(function(d){ return byDay[d]; }).sort(byDate).slice(-VITALS_MAX);
    var urges = s.urges, a = urges.active, start = a && typeof a==='object' ? num(a.start, 0) : 0;
    s.urges = {
      active: start>0 ? {start:start, need:urgeNeed(a.need), rounds:rounds(a.rounds)} : null,
      log: records(urges.log, function(){}).map(function(u){
        return {date:normalizeDate(u.date), need:urgeNeed(u.need), rounds:rounds(u.rounds)};
      }).filter(function(u){ return u.date; }).slice(-URGES_MAX)
    };
    sanitizeTrials(s);
  }
  // TRIALS: the player's own (a known kind and stat, a name), the built-in
  // ones hidden, and the results of a trial that exists, each within its
  // kind's limits.
  function sanitizeTrials(s){
    var tr = s.trials, builtIn = TRIALS.map(function(t){ return t.id; }), seen = {};
    builtIn.forEach(function(id){ seen[id] = true; });
    var custom = records(tr.custom, function(){}).map(function(t){
      return {id:safeId(t.id), name:text(t.name, TRIAL_NAME_MAX).trim() || 'Trial',
        kind:typeof t.kind==='string' && has(TRIAL_KINDS, t.kind) ? t.kind : 'reps', stat:STAT_KEYS.indexOf(t.stat)!==-1 ? t.stat : 'END'};
    }).filter(function(t){
      if (seen[t.id]) return false;
      seen[t.id] = true;
      return true;
    }).slice(0, TRIALS_CUSTOM_MAX);
    var units = {};
    TRIALS.concat(custom).forEach(function(t){ units[t.id] = TRIAL_KINDS[t.kind].unit; });
    var a = tr.active, start = a && typeof a==='object' ? num(a.start, 0) : 0;
    s.trials = {
      custom: custom,
      hidden: builtIn.filter(function(id){ return Array.isArray(tr.hidden) && tr.hidden.indexOf(id)!==-1; }),
      log: records(tr.log, function(){}).filter(function(r){ return typeof r.id==='string' && has(units, r.id); }).map(function(r){
        return {id:r.id, date:normalizeDate(r.date), value:clamp(Math.round(num(r.value, 0)), 0, TRIAL_VALUE_MAX[units[r.id]]),
          xp:Math.max(0, Math.round(num(r.xp, 0))), t:Math.max(0, num(r.t, 0))};
      }).filter(function(r){ return r.date && r.value>=1; }).slice(-TRIALS_LOG_MAX),
      active: start>0 && typeof a.id==='string' && has(units, a.id) ? {id:a.id, start:start} : null
    };
  }

  // The map's places. A place with no usable position (coordinates out of
  // range, an unknown region code) is dropped; a second copy of the same
  // city or region too. Everything else is brought within its limits.
  function fixPlace(p){
    p.id = safeId(p.id);
    p.name = text(p.name, PLACE_NAME_MAX).trim() || 'Unnamed place';
    p.cc = COUNTRY_CODES.indexOf(p.cc)!==-1 ? p.cc : '';
    p.date = normalizeDate(p.date);
    p.note = text(p.note, PLACE_NOTE_MAX);
  }
  // A coordinate: a number, or text holding one (missing or empty is none, not 0).
  function coordinate(v){
    return (typeof v==='number' || (typeof v==='string' && v.trim())) ? num(v, NaN) : NaN;
  }
  function fixPosition(p, min, max){
    p.lat = coordinate(p.lat);
    p.lon = coordinate(p.lon);
    p.radius = clamp(Math.round(num(p.radius, min)), min, max);
  }
  function onEarth(p){ return p.lat>=-90 && p.lat<=90 && p.lon>=-180 && p.lon<=180; }
  function once(list, key){
    var seen = {};
    return list.filter(function(p){
      var k = key(p);
      if (k===null) return true;
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }
  // A route's road, as an encoded polyline (Google's format, 5 decimals, the
  // one road services answer with): a few characters a point. decodePath()
  // gives [lat, lon, lat, lon, ...], or null when the text isn't one (a
  // broken number, a point off the Earth).
  function encodePath(points){
    var out = '', lastLat = 0, lastLon = 0;
    function part(v){
      v = v<0 ? ~(v*2) : v*2;
      var s = '';
      while (v>=32){ s += String.fromCharCode((32 | (v & 31))+63); v = Math.floor(v/32); }
      return s+String.fromCharCode(v+63);
    }
    for (var i=0;i+1<points.length;i+=2){
      var lat = Math.round(points[i]*1e5), lon = Math.round(points[i+1]*1e5);
      out += part(lat-lastLat)+part(lon-lastLon);
      lastLat = lat; lastLon = lon;
    }
    return out;
  }
  function decodePath(text){
    if (typeof text!=='string') return null;
    var out = [], i = 0, n = text.length, lat = 0, lon = 0;
    function part(){
      var result = 0, factor = 1, b;
      do {
        if (i>=n) return null;
        b = text.charCodeAt(i++)-63;
        if (b<0 || b>63) return null;
        result += (b & 31)*factor;
        factor *= 32;
      } while (b>=32 && factor<=Math.pow(32, 6));
      if (b>=32) return null;
      return result%2 ? -(result+1)/2 : result/2;
    }
    while (i<n){
      var dLat = part(), dLon = dLat===null ? null : part();
      if (dLat===null || dLon===null) return null;
      lat += dLat; lon += dLon;
      if (lat<-9000000 || lat>9000000 || lon<-18000000 || lon>18000000) return null;
      out.push(lat/1e5, lon/1e5);
    }
    return out;
  }

  function sanitizeMap(m){
    m.cities = once(records(m.cities, function(c){
      fixPlace(c);
      fixPosition(c, CITY_RADIUS_MIN, CITY_RADIUS_MAX);
      var gid = num(c.gid, 0);
      if (gid>0 && gid===Math.floor(gid)) c.gid = gid;
      else delete c.gid;
    }).filter(onEarth), function(c){ return c.gid ? 'c:'+c.gid : null; });
    m.regions = once(records(m.regions, function(r){
      fixPlace(r);
      r.code = REGION_CODE.test(r.code) ? r.code : null;
    }).filter(function(r){ return r.code; }), function(r){ return r.code; });
    m.pins = records(m.pins, function(p){
      fixPlace(p);
      fixPosition(p, PIN_RADIUS_MIN, PIN_RADIUS_MAX);
    }).filter(onEarth);
    // A route whose road can't be read (not a polyline, a point off the
    // Earth, fewer than two points) is dropped.
    m.routes = records(m.routes, function(r){
      r.id = safeId(r.id);
      r.name = text(r.name, ROUTE_NAME_MAX).trim() || 'Route';
      r.stops = records(r.stops, function(s){
        s.name = text(s.name, PLACE_NAME_MAX).trim() || 'Stop';
        s.lat = coordinate(s.lat);
        s.lon = coordinate(s.lon);
      }).filter(onEarth).slice(0, ROUTE_STOPS_MAX).map(function(s){ return {name:s.name, lat:s.lat, lon:s.lon}; });
      r.path = typeof r.path==='string' && r.path.length<=ROUTE_PATH_MAX ? r.path : '';
      r.km = Math.max(0, num(r.km, 0));
      r.date = normalizeDate(r.date);
      r.note = text(r.note, PLACE_NOTE_MAX);
    }).filter(function(r){
      var points = decodePath(r.path);
      return !!points && points.length>=4;
    });
    var keys = {};
    m.discovered = (Array.isArray(m.discovered) ? m.discovered : []).filter(function(k){
      if (typeof k!=='string' || !/^[cr]:\S{1,120}$/.test(k) || keys[k]) return false;
      keys[k] = true;
      return true;
    });
  }

  ST.STAT_KEYS = STAT_KEYS;
  ST.STAT_LABELS = STAT_LABELS;
  ST.SKILL_KEYS = SKILL_KEYS;
  ST.CATS = CATS;
  ST.SALE_XP = SALE_XP;
  ST.SIDE_SKILL_GAIN = SIDE_SKILL_GAIN;
  ST.CAD_PER_CAP = CAD_PER_CAP;
  ST.QUEST_NAME_MAX = QUEST_NAME_MAX;
  ST.STREAK_MAX_DAYS = STREAK_MAX_DAYS;
  ST.CITY_RADIUS_MIN = CITY_RADIUS_MIN;
  ST.CITY_RADIUS_MAX = CITY_RADIUS_MAX;
  ST.PIN_RADIUS_MIN = PIN_RADIUS_MIN;
  ST.PIN_RADIUS_MAX = PIN_RADIUS_MAX;
  ST.PLACE_NAME_MAX = PLACE_NAME_MAX;
  ST.ROUTE_NAME_MAX = ROUTE_NAME_MAX;
  ST.ROUTE_STOPS_MAX = ROUTE_STOPS_MAX;
  ST.encodePath = encodePath;
  ST.decodePath = decodePath;
  ST.PLACE_NOTE_MAX = PLACE_NOTE_MAX;
  ST.CITY_XP = CITY_XP;
  ST.BOOK_XP = BOOK_XP;
  ST.BOOK_SKILL_MAX = BOOK_SKILL_MAX;
  ST.BOOK_TITLE_MAX = BOOK_TITLE_MAX;
  ST.BOOK_AUTHOR_MAX = BOOK_AUTHOR_MAX;
  ST.REGION_XP = REGION_XP;
  ST.VITAL_KEYS = VITAL_KEYS;
  ST.VITALS_XP = VITALS_XP;
  ST.PULSE_MIN = PULSE_MIN;
  ST.PULSE_MAX = PULSE_MAX;
  ST.CLEAN_MILESTONES = CLEAN_MILESTONES;
  ST.URGE_NEEDS = URGE_NEEDS;
  ST.URGE_MS = URGE_MS;
  ST.URGE_XP = URGE_XP;
  ST.URGE_XP_PER_DAY = URGE_XP_PER_DAY;
  ST.TRAIN_PER_POINT = TRAIN_PER_POINT;
  ST.trainStat = trainStat;
  ST.vitalsToday = vitalsToday;
  ST.vitalsDayStr = vitalsDayStr;
  ST.VITALS_DAY_START = VITALS_DAY_START;
  ST.setVital = setVital;
  ST.setPulse = setPulse;
  ST.stepRads = stepRads;
  ST.logVitals = logVitals;
  ST.lastVitals = lastVitals;
  ST.lastCheckIn = lastCheckIn;
  ST.STREAKS_MAX = STREAKS_MAX;
  ST.STREAK_NAME_MAX = STREAK_NAME_MAX;
  ST.streakById = streakById;
  ST.addStreak = addStreak;
  ST.renameStreak = renameStreak;
  ST.removeStreak = removeStreak;
  ST.lapsedToday = lapsedToday;
  ST.cleanDay = cleanDay;
  ST.cleanFullDays = cleanFullDays;
  ST.cleanTotal = cleanTotal;
  ST.cleanBest = cleanBest;
  ST.nextCleanMilestone = nextCleanMilestone;
  ST.setCleanStart = setCleanStart;
  ST.claimCleanMilestones = claimCleanMilestones;
  ST.logLapse = logLapse;
  ST.startUrge = startUrge;
  ST.urgeLeft = urgeLeft;
  ST.urgeAgain = urgeAgain;
  ST.cancelUrge = cancelUrge;
  ST.urgesToday = urgesToday;
  ST.urgeWon = urgeWon;
  ST.mergeOld = mergeOld;
  ST.TRIALS = TRIALS;
  ST.TRIAL_KINDS = TRIAL_KINDS;
  ST.TRIAL_RECORD_XP = TRIAL_RECORD_XP;
  ST.TRIAL_XP = TRIAL_XP;
  ST.TRIAL_DUE_DAYS = TRIAL_DUE_DAYS;
  ST.TRIAL_NAME_MAX = TRIAL_NAME_MAX;
  ST.TRIALS_CUSTOM_MAX = TRIALS_CUSTOM_MAX;
  ST.trialById = trialById;
  ST.trialList = trialList;
  ST.trialResults = trialResults;
  ST.trialBest = trialBest;
  ST.trialPaidToday = trialPaidToday;
  ST.trialPreview = trialPreview;
  ST.logTrial = logTrial;
  ST.removeTrialResult = removeTrialResult;
  ST.trialDue = trialDue;
  ST.trialsDue = trialsDue;
  ST.trialGoal = trialGoal;
  ST.addTrial = addTrial;
  ST.removeTrial = removeTrial;
  ST.showTrial = showTrial;
  ST.startTrial = startTrial;
  ST.trialElapsed = trialElapsed;
  ST.stopTrial = stopTrial;
  ST.parseTrialValue = parseTrialValue;
  ST.trialValueText = trialValueText;
  ST.COUNTRY_CODES = COUNTRY_CODES;
  ST.REGION_CODE = REGION_CODE;
  ST.app = app;

  ST.el = el;
  ST.clamp = clamp;
  ST.genId = genId;
  ST.todayStr = todayStr;
  ST.daysSince = daysSince;
  ST.todayDisplay = todayDisplay;
  ST.dateText = dateText;
  ST.backupDays = backupDays;
  ST.backupDue = backupDue;
  ST.rads = rads;
  ST.RADS_MAX = RADS_MAX;
  ST.motion = motion;
  ST.stayStill = stayStill;
  ST.commas = commas;
  ST.money = money;
  ST.capsText = capsText;
  ST.capsProgress = capsProgress;
  ST.syncCapsQuests = syncCapsQuests;
  ST.escapeHtml = escapeHtml;
  ST.catLabel = catLabel;

  ST.migrate = migrate;
  ST.defaultState = defaultState;
  ST.sanitizeImported = sanitizeImported;
  ST.totalHoldingsCAD = totalHoldingsCAD;
  ST.logEntryCount = logEntryCount;
  ST.addLogEntry = addLogEntry;
  ST.dailyDoneToday = dailyDoneToday;
  ST.checkedInToday = checkedInToday;
  ST.currentStreak = currentStreak;
  ST.streakCheckIn = streakCheckIn;
  ST.grantSkill = grantSkill;
  ST.skillSources = skillSources;
  ST.grantStat = grantStat;
  ST.gainXp = gainXp;
  ST.mainReady = mainReady;
  ST.completeMain = completeMain;
  ST.completeSide = completeSide;
  ST.completeBonus = completeBonus;
  ST.PERKS = PERKS;
  ST.BOBBLEHEADS = BOBBLEHEADS;
  ST.BOBBLEHEAD_XP = BOBBLEHEAD_XP;
  ST.findBobbleheads = findBobbleheads;
  ST.perkById = perkById;
  ST.perkRank = perkRank;
  ST.perkOpen = perkOpen;
  ST.takePerk = takePerk;
  ST.rewardRoute = rewardRoute;
  ST.readBook = readBook;
  ST.rewardCheckIn = rewardCheckIn;
  ST.acceptJournal = acceptJournal;
  ST.spendSpecialPoint = spendSpecialPoint;
  ST.markBackup = markBackup;
  ST.countHolotape = countHolotape;
  ST.withPerks = withPerks;
  ST.award = award;
  ST.EVENT_TYPES = EVENT_TYPES;
  ST.HISTORY_MAX = HISTORY_MAX;
  ST.record = record;
  ST.recentEvents = recentEvents;
  ST.historySummary = historySummary;
  ST.completeDaily = completeDaily;
  ST.sellItem = sellItem;
  ST.moveItem = moveItem;
  ST.foldName = foldName;
  ST.placeKey = placeKey;
  ST.discoverPlace = discoverPlace;
})(window.StatusTerminal = window.StatusTerminal || {});
