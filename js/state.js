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
 *   lastBackup: 'YYYY-M-D'|null,            // the day of the last Export backup (the footer's reminder)
 *   unspentSpecialPoints: number,           // level-up points not yet placed
 *   perks: { [perk id]: rank(1-ranks) },    // the perks taken (PERKS); older saves: see migrate()
 *   unspentPerkPoints: number,              // a perk point comes with each level-up too
 *   stats:  { STR,END,CHA,INT,AGI: number(0-10) },   // SPECIAL — see "S.P.E.C.I.A.L." below
 *   skills: { CONCENTRATION,KNOWLEDGE,SPEECH,SURVIVAL,COOKING,FINANCE,MUSIC,BUSINESS: number(0-100) },
 *                                           // CONCENTRATION was SCIENCE: see migrate()
 *   quests: {
 *     mains: [ MainQuest ],                  // older saves had one, as `main`: see migrate()
 *     side:  [ { id, questName, name, xp, done,      // done ones stay, hidden, for the Lifetime count
 *                skillGains: [SkillGain] } ],        // paid once with the XP (completeSide); see migrate()
 *     daily: [ { id, questName, name, xp, lastDate:'YYYY-M-D'|null } ]  // done today: dailyDoneToday()
 *   },
 *   inventory: [ { id, name, category: one of CATS,     // WEAPONS is gone: see migrate()
 *                  price?: number>=0 } ],    // asking price in CAD, optional, shown in THINGS TO SELL (SELL)
 *                                           // only; kept when the item moves to another category
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
 *   progress: number(0-100),                       // percent: the slider, 100 completes it; caps: follows the wallet
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
 * Every reward path (quest completion, bonus objective, journal proposal)
 * should express its reward as XP plus zero or more SkillGains, and apply
 * them through grantSkill()/gainXp() (completeMain() and completeSide() do
 * both for a quest) rather than touching state.skills / state.xp directly — that's
 * what keeps the bounds checks and lifetime counters in one place instead
 * of duplicated at each call site. events.js adds the toasts (addXp()).
 * Selling an item (sellItem()) is one of them too: SALE_XP, plus the money
 * in the wallet and a line in the journal. So is revealing a new city or
 * region on the map (discoverPlace()): CITY_XP or REGION_XP, once per place.
 *
 * LOADING — every document the app takes in (a saved copy, a backup file,
 * another window's save) goes through sanitizeImported(), which runs
 * migrate() first. A change to the shape above goes in migrate(), so it
 * reaches saves in the browser and old backups alike; tests/migrate.test.js
 * keeps every earlier format.
 *
 * S.P.E.C.I.A.L.: `stats` only goes up one way. Each level-up adds one
 * unspentSpecialPoint; the player taps a stat in the STATUS tab's level-up
 * banner and confirms "Yes", which calls grantStat(key, 1) and spends the
 * point. No reward (quest, bonus objective, journal proposal) and no button
 * changes `stats` otherwise, and a journal proposal is XP + SkillGains only.
 *
 * SCRIPTS — every file attaches to one namespace, window.StatusTerminal, and
 * index.html loads them in dependency order: state → storage → ai → places →
 * render → mascot → crt → tilt → fog → map → bulk → routes → events → main (map.js loads
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
    finances:{ holdings:[] },   // starts empty: add your own in ITEMS → wallet
    log:[],
    map:{ cities:[], regions:[], pins:[], routes:[], discovered:[] }
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
    confirmPerk: null           // id of the perk whose rank awaits "Yes"
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
  // returns the ones that reached their target (events.js completes them).
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
    var xp = SALE_XP*(1+perkRank('barter'));
    addLogEntry({date:todayDisplay(), text:'Sold '+item.name+' for $'+money(amount), xp:xp, reason:'Item sold'});
    return {name:item.name, amount:amount, xp:xp, leveled:gainXp(xp)};
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
  // nothing. Returns null when it already paid, else {xp, leveled}.
  function discoverPlace(key, xp){
    var list = app.state.map.discovered;
    if (list.indexOf(key)!==-1) return null;
    list.push(key);
    xp = Math.round(xp*(1+0.25*perkRank('cartographer')));
    return {xp:xp, leveled:gainXp(xp)};
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

  // ---------- centralized reward logic ----------
  // Every code path that hands out a skill point goes through grantSkill(),
  // so the bounds and validity checks live in one place instead of being
  // copy-pasted at each call site. grantStat() has a single caller: spending
  // a level-up point, once the player confirmed it (see S.P.E.C.I.A.L. above).
  function grantSkill(key, amount){
    var state = app.state;
    amount = Number(amount);
    if (SKILL_KEYS.indexOf(key)===-1 || !amount || !isFinite(amount)) return;
    state.skills[key] = clamp((Number(state.skills[key])||0)+amount, 0, 100);
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
      leveled = true;
    }
    return leveled;
  }
  // Completes a main quest: its XP and skill gains, once. Returns null when
  // it was completed already, else {xp, leveled} for the toasts.
  function completeMain(m){
    if (m.completed) return null;
    m.completed = true;
    return payQuest(m);
  }
  // Completes a side quest the same way: its XP and skill gains, once.
  function completeSide(q){
    if (q.done) return null;
    q.done = true;
    return payQuest(q);
  }
  // A main quest's bonus objective: its XP, once (Quick Hands adds to it).
  function completeBonus(b){
    if (b.done) return null;
    b.done = true;
    return payQuest({xp:Math.round((Number(b.xp)||0)*(1+0.25*perkRank('quickhands')))});
  }
  // A daily quest, once a day: its XP only (no skills, the owner's choice:
  // a skill a day would reach 100 within months). Creature of Habit adds to it.
  function completeDaily(d){
    if (dailyDoneToday(d)) return null;
    d.lastDate = todayStr();
    return payQuest({xp:(Number(d.xp)||0)+5*perkRank('habit')});
  }
  // {xp, leveled, skillGains} for the toasts. Scholar adds to each skill
  // gain (the gains given are returned, for the toast).
  function payQuest(q){
    var scholar = perkRank('scholar');
    var gains = (q.skillGains || []).map(function(g){
      return {skill:g.skill, amount:Number(g.amount)>0 ? Number(g.amount)+scholar : g.amount};
    });
    gains.forEach(function(g){ grantSkill(g.skill, g.amount); });
    var xp = Number(q.xp)||0;
    return {xp:xp, leveled:gainXp(xp), skillGains:gains};
  }

  // ---------- perks ----------
  // A perk point comes with each level-up, like the S.P.E.C.I.A.L. point;
  // the player spends it on a perk of the chart (STATUS tab). Rank r of a
  // perk needs its stat at `min`+r-1. Each perk changes one reward, in the
  // function that pays it: effect(rank) says how, for the chart.
  var PERKS = [
    {id:'wanderer', name:'Wanderer', stat:'END', min:3, ranks:3, icon:'road',
      effect:function(r){ return 'Each new route: +'+(25*r)+' XP'; }},
    {id:'cartographer', name:'Cartographer', stat:'INT', min:4, ranks:2, icon:'map',
      effect:function(r){ return 'Discovering a city or region: +'+(25*r)+'% XP'; }},
    {id:'ironwill', name:'Iron Will', stat:'END', min:4, ranks:3, icon:'flame',
      effect:function(r){ return 'Each streak check-in: +'+(10*r)+' XP'; }},
    {id:'barter', name:'Barter', stat:'CHA', min:3, ranks:2, icon:'cap',
      effect:function(r){ return 'Selling an item: '+(r+1)+'× the XP'; }},
    {id:'scholar', name:'Scholar', stat:'INT', min:5, ranks:2, icon:'book',
      effect:function(r){ return 'Every skill gain from a quest: +'+r; }},
    {id:'habit', name:'Creature of Habit', stat:'STR', min:3, ranks:3, icon:'calendar',
      effect:function(r){ return 'Daily quests: +'+(5*r)+' XP'; }},
    {id:'comprehension', name:'Comprehension', stat:'INT', min:3, ranks:2, icon:'eye',
      effect:function(r){ return 'Journal entries (Analyze): +'+(20*r)+'% XP'; }},
    {id:'quickhands', name:'Quick Hands', stat:'AGI', min:3, ranks:2, icon:'bolt',
      effect:function(r){ return 'Bonus objectives: +'+(25*r)+'% XP'; }}
  ];
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
    return s.perks[id];
  }
  // XP from a perk alone (Wanderer's per route, Iron Will's per check-in):
  // {xp, leveled}, or null without the perk.
  function perkXp(id, perRank){
    var xp = perRank*perkRank(id);
    return xp>0 ? {xp:xp, leveled:gainXp(xp)} : null;
  }
  function rewardRoute(){ return perkXp('wanderer', 25); }
  function rewardCheckIn(){ return perkXp('ironwill', 10); }
  // A journal proposal's XP, with Comprehension.
  function journalXp(xp){ return Math.round((Number(xp)||0)*(1+0.2*perkRank('comprehension'))); }

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
    STAT_KEYS.forEach(function(k){ s.stats[k] = clamp(Math.round(num(s.stats[k], 0)), 0, 10); });
    SKILL_KEYS.forEach(function(k){ s.skills[k] = clamp(Math.round(num(s.skills[k], 0)), 0, 100); });

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
    return s;
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
  ST.REGION_XP = REGION_XP;
  ST.COUNTRY_CODES = COUNTRY_CODES;
  ST.REGION_CODE = REGION_CODE;
  ST.app = app;

  ST.el = el;
  ST.clamp = clamp;
  ST.genId = genId;
  ST.todayStr = todayStr;
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
  ST.grantStat = grantStat;
  ST.gainXp = gainXp;
  ST.completeMain = completeMain;
  ST.completeSide = completeSide;
  ST.completeBonus = completeBonus;
  ST.PERKS = PERKS;
  ST.perkById = perkById;
  ST.perkRank = perkRank;
  ST.perkOpen = perkOpen;
  ST.takePerk = takePerk;
  ST.rewardRoute = rewardRoute;
  ST.rewardCheckIn = rewardCheckIn;
  ST.journalXp = journalXp;
  ST.completeDaily = completeDaily;
  ST.sellItem = sellItem;
  ST.moveItem = moveItem;
  ST.foldName = foldName;
  ST.placeKey = placeKey;
  ST.discoverPlace = discoverPlace;
})(window.StatusTerminal = window.StatusTerminal || {});
