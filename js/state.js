/**
 * DATA MODEL — informal reference (no build step here, so this is the
 * closest thing to types/interfaces; keep it in sync when the shape below
 * changes). All of `state` is one JSON document, persisted whole by
 * storage.js (a copy in IndexedDB and one in localStorage).
 *
 * State {
 *   level: number, xp: number, xpToNext: number, lifetimeXp: number,
 *   lifetimeLogEntries: number,             // every accepted entry, even past the 200 kept in `log`
 *   unspentSpecialPoints: number,           // level-up points not yet placed
 *   stats:  { STR,END,CHA,INT,AGI: number(0-10) },   // SPECIAL — see "S.P.E.C.I.A.L." below
 *   skills: { CONCENTRATION,KNOWLEDGE,SPEECH,SURVIVAL,COOKING,FINANCE,MUSIC,BUSINESS: number(0-100) },
 *                                           // CONCENTRATION was SCIENCE: see migrate()
 *   quests: {
 *     mains: [ MainQuest ],                  // older saves had one, as `main`: see migrate()
 *     side:  [ { id, questName, name, xp, done } ],
 *     daily: [ { id, questName, name, xp, lastDate:'YYYY-M-D'|null } ]  // done = lastDate===today
 *   },
 *   inventory: [ { id, name, category: one of CATS } ],
 *   finances: { holdings: [ { id, label, amount, rateToCAD } ] },
 *   log: [ { date, text, xp, reason } ]
 * }
 * MainQuest {
 *   id, questName, title, xp, completed,          // completed ones stay in the list
 *   skillGains: [SkillGain],
 *   bonus: [ { id, name, xp, done } ],             // bonus objectives
 *   progressType: 'percent'|'streak',              // missing = 'percent'
 *   progress: number(0-100),                       // percent: the slider, 100 completes it
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
 * them through grantSkill()/addXp() rather than touching state.skills /
 * state.xp directly — that's what keeps the bounds checks and lifetime
 * counters in one place instead of duplicated at each call site.
 *
 * S.P.E.C.I.A.L.: `stats` only goes up one way. Each level-up adds one
 * unspentSpecialPoint; the player taps a stat in the STATUS tab's level-up
 * banner and confirms "Yes", which calls grantStat(key, 1) and spends the
 * point. No reward (quest, bonus objective, journal proposal) and no button
 * changes `stats` otherwise, and a journal proposal is XP + SkillGains only.
 *
 * SCRIPTS — every file attaches to one namespace, window.StatusTerminal, and
 * index.html loads them in dependency order: state → storage → ai → render →
 * mascot → events → main. They are plain scripts rather than ES modules so the app
 * still runs when index.html is opened straight from disk (file://), where
 * browsers refuse to load modules.
 */
(function(ST){
  'use strict';

  var STAT_KEYS = ['STR','END','CHA','INT','AGI'];
  var STAT_LABELS = {STR:'Strength',END:'Endurance',CHA:'Charisma',INT:'Intelligence',AGI:'Agility'};
  var SKILL_KEYS = ['CONCENTRATION','KNOWLEDGE','SPEECH','SURVIVAL','COOKING','FINANCE','MUSIC','BUSINESS'];
  var CATS = ['WEAPONS','APPAREL','AID','MISC','IMPORTANT'];
  var CAD_PER_CAP = 1000;
  var QUEST_NAME_MAX = 60;
  var STREAK_MAX_DAYS = 1000;
  var LOG_MAX = 200;

  var DEFAULT_STATE = {
    level:2, xp:0, xpToNext:1000,
    lifetimeXp:0,
    lifetimeLogEntries:0,
    unspentSpecialPoints:0,
    stats:{STR:4,END:3,CHA:4,INT:5,AGI:2},
    skills:{CONCENTRATION:21,KNOWLEDGE:10,SPEECH:42,SURVIVAL:23,COOKING:8,FINANCE:17,MUSIC:35,BUSINESS:5},
    quests:{
      mains:[
        {id:'m1', questName:'Caps on the Line', title:'Obtain 5 Caps', progressType:'percent', progress:0, xp:1000, completed:false, skillGains:[{skill:'FINANCE',amount:8},{skill:'BUSINESS',amount:2}], bonus:[
          {id:'b1',name:'Find a job',xp:500,done:false},
          {id:'b2',name:'Launch a project',xp:500,done:false}
        ]}
      ],
      side:[
        {id:'s1',questName:'Paper Trail',name:'Earn a certification',xp:150,done:false},
        {id:'s2',questName:'Pennies from Heaven',name:'Build up savings',xp:100,done:false},
        {id:'s3',questName:'Back in the Saddle',name:'Get back into consistent training',xp:100,done:false},
        {id:'s4',questName:'Sing, Sing, Sing',name:'Push the music project forward',xp:100,done:false}
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
    log:[]
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
    confirmSpecial: null        // SPECIAL key whose level-up point awaits "Yes"
  };

  function el(id){ return document.getElementById(id); }
  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
  function genId(){ return 'x'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
  function todayStr(){ var d=new Date(); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); }
  function todayDisplay(){ return new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
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
  // before the defaults are merged in. Saves and imported backups both pass
  // through here (via mergeDefaults). Edits `doc` in place and returns it.
  function migrate(doc){
    if (!doc || typeof doc!=='object') return doc;
    migrateMainQuests(doc.quests);
    migrateSkills(doc);
    return doc;
  }
  // Older saves have a single main quest, the object quests.main. It
  // becomes the first of the list with every field it had (progress,
  // completion, bonus objectives...), and no name unless it had one.
  function migrateMainQuests(quests){
    if (!quests || typeof quests!=='object') return;
    var main = quests.main;
    if (!Array.isArray(quests.mains) && main && typeof main==='object' && !Array.isArray(main)){
      var first = {id:'m1', questName:'', progressType:'percent'};
      Object.keys(main).forEach(function(k){ first[k] = main[k]; });
      quests.mains = [first];
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
  function has(obj, key){ return Object.prototype.hasOwnProperty.call(obj, key); }
  function mergeDefaults(loaded){
    return deepMergeDefaults(DEFAULT_STATE, migrate(loaded||{}));
  }
  function defaultState(){ return clone(DEFAULT_STATE); }

  function totalHoldingsCAD(){
    return app.state.finances.holdings.reduce(function(sum,h){
      return sum + (Number(h.amount)||0) * (Number(h.rateToCAD)||1);
    }, 0);
  }
  function capsValue(){
    return totalHoldingsCAD() / CAD_PER_CAP;
  }
  function capsText(){ return cents(capsValue()).toFixed(2); }
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

  // ---------- streak main quests ----------
  // A check-in dated tomorrow still counts as today's: after flying west,
  // the calendar can be a day behind the check-in. One dated later than
  // that can only come from a clock that was wrong: it doesn't lock the
  // quest until that date, the next check-in simply continues the streak.
  function checkedInToday(q){
    var d = daysSince(q.lastCheckIn);
    return d!==null && d<=0 && d>=-1;
  }
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
      leveled = true;
    }
    return leveled;
  }
  // Completes a main quest: its XP and skill gains, once. Returns null when
  // it was completed already, else {xp, leveled} for the toasts.
  function completeMain(m){
    if (m.completed) return null;
    m.completed = true;
    (m.skillGains||[]).forEach(function(g){ grantSkill(g.skill, g.amount); });
    var xp = Number(m.xp)||0;
    return {xp:xp, leveled:gainXp(xp)};
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
      var out = {};
      Object.keys(x).forEach(function(k){ out[k] = x[k]; });
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
    STAT_KEYS.forEach(function(k){ s.stats[k] = clamp(Math.round(num(s.stats[k], 0)), 0, 10); });
    SKILL_KEYS.forEach(function(k){ s.skills[k] = clamp(Math.round(num(s.skills[k], 0)), 0, 100); });

    s.quests.mains = records(s.quests.mains, function(m){
      m.id = safeId(m.id);
      fixQuestName(m);
      m.title = text(m.title, 60);
      m.progressType = m.progressType==='streak' ? 'streak' : 'percent';
      m.progress = clamp(Math.round(num(m.progress, 0)), 0, 100);
      if (m.progressType==='streak'){
        m.streakTarget = clamp(Math.round(num(m.streakTarget, 7)), 1, STREAK_MAX_DAYS);
        m.streakDays = clamp(Math.round(num(m.streakDays, 0)), 0, m.streakTarget);
        m.lastCheckIn = normalizeDate(m.lastCheckIn);
      }
      m.xp = Math.max(0, num(m.xp, 0));
      m.completed = m.completed===true;
      m.skillGains = records(m.skillGains, function(g){ g.amount = num(g.amount, 0); })
        .filter(function(g){ return SKILL_KEYS.indexOf(g.skill)!==-1; });
      m.bonus = records(m.bonus, fixDoneQuest);
    });
    s.quests.side = records(s.quests.side, function(q){ fixDoneQuest(q); fixQuestName(q); });
    s.quests.daily = records(s.quests.daily, function(q){
      fixQuest(q);
      fixQuestName(q);
      q.lastDate = normalizeDate(q.lastDate);
    });

    s.inventory = records(s.inventory, function(i){
      i.id = safeId(i.id);
      i.name = text(i.name);
      if (CATS.indexOf(i.category)===-1) i.category = 'MISC';
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
    s.log = log.slice(-LOG_MAX);
    return s;
  }

  ST.STAT_KEYS = STAT_KEYS;
  ST.STAT_LABELS = STAT_LABELS;
  ST.SKILL_KEYS = SKILL_KEYS;
  ST.CATS = CATS;
  ST.CAD_PER_CAP = CAD_PER_CAP;
  ST.QUEST_NAME_MAX = QUEST_NAME_MAX;
  ST.STREAK_MAX_DAYS = STREAK_MAX_DAYS;
  ST.app = app;

  ST.el = el;
  ST.clamp = clamp;
  ST.genId = genId;
  ST.todayStr = todayStr;
  ST.todayDisplay = todayDisplay;
  ST.commas = commas;
  ST.money = money;
  ST.capsText = capsText;
  ST.escapeHtml = escapeHtml;

  ST.defaultState = defaultState;
  ST.sanitizeImported = sanitizeImported;
  ST.totalHoldingsCAD = totalHoldingsCAD;
  ST.capsValue = capsValue;
  ST.logEntryCount = logEntryCount;
  ST.addLogEntry = addLogEntry;
  ST.checkedInToday = checkedInToday;
  ST.currentStreak = currentStreak;
  ST.streakCheckIn = streakCheckIn;
  ST.grantSkill = grantSkill;
  ST.grantStat = grantStat;
  ST.gainXp = gainXp;
  ST.completeMain = completeMain;
})(window.StatusTerminal = window.StatusTerminal || {});
