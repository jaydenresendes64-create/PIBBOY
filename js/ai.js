/**
 * Journal analysis — replaces the Claude-only `sample` capability.
 *
 * The browser never holds an API key: it posts the diary entry to the
 * serverless function in api/analyze.js, which calls the model with the key
 * from its environment. Where that function doesn't exist (file://, GitHub
 * Pages) the app uses the offline keyword rules, as it did outside Claude.
 */
(function(ST){
  'use strict';

  var SKILL_KEYS = ST.SKILL_KEYS, clamp = ST.clamp;

  var ENDPOINT = 'api/analyze';   // relative: resolves next to index.html
  var REQUEST_TIMEOUT_MS = 20000;
  // Errors that switch AI off for the rest of the session: this host has no
  // analyze function, or the function has no API key configured.
  var PERMANENT_ERRORS = ['not_configured','http_404','http_405'];

  // Opened from disk or served from GitHub Pages there is no function to
  // call, so don't request one (it would only log a 404 in the console).
  function hasEndpoint(){
    if (location.protocol!=='http:' && location.protocol!=='https:') return false;
    return !/\.github\.io$/i.test(location.hostname);
  }

  // Resolves true when the server reports an API key configured.
  function probe(){
    if (!hasEndpoint() || typeof fetch!=='function') return Promise.resolve(false);
    return fetch(ENDPOINT, {headers:{'Accept':'application/json'}, cache:'no-store'})
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(body){ return !!(body && body.ok===true); })
      .catch(function(){ return false; });
  }

  // Resolves with the model's raw proposal (run it through sanitizeProposal);
  // rejects with an Error whose `code` says why.
  function analyze(text){
    var controller = typeof AbortController==='function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function(){ controller.abort(); }, REQUEST_TIMEOUT_MS) : null;
    return fetch(ENDPOINT, {
      method:'POST',
      headers:{'Content-Type':'application/json', 'Accept':'application/json'},
      body:JSON.stringify({text:text, skills:SKILL_KEYS}),
      signal:controller ? controller.signal : undefined
    }).then(function(r){
      return r.json().catch(function(){ return null; }).then(function(body){
        if (r.ok && body && body.proposal) return body.proposal;
        var err = new Error('Journal analysis failed');
        err.code = (body && body.error) || ('http_'+r.status);
        throw err;
      });
    }).then(function(proposal){
      clearTimeout(timer);
      return proposal;
    }, function(err){
      clearTimeout(timer);
      throw err;
    });
  }

  function isPermanentError(err){
    return !!err && PERMANENT_ERRORS.indexOf(err.code)!==-1;
  }

  // A proposal is XP plus skill gains, nothing else: only SKILL_KEYS pass,
  // so it can never raise S.P.E.C.I.A.L. (that takes a level-up point).
  function sanitizeProposal(data){
    data = data || {};
    var xp = clamp(Math.round(Number(data.xp)||10),1,150);
    var reason = typeof data.reason==='string' ? data.reason.slice(0,80) : 'Logged activity';
    var skillGains = Array.isArray(data.skillGains) ? data.skillGains.filter(function(g){
      return g && SKILL_KEYS.indexOf(g.skill)!==-1;
    }).slice(0,2).map(function(g){ return {skill:g.skill, amount:clamp(Math.round(Number(g.amount)||1),1,5)}; }) : [];
    return {xp:xp, reason:reason, skillGains:skillGains};
  }

  // ---------- offline rules ----------
  // A keyword is a whole word or a phrase of whole words, never a fragment:
  // 'ami' matches "j'ai vu mon ami" but not "examined". Case and accents are
  // ignored ('étudié' also matches "Etudie"), so list each word form you want
  // matched (run, ran, running). When two keywords start at the same word the
  // longer one wins: "worked out" is exercise, not work.
  var RULES = [
    {skill:'SURVIVAL', xp:20, reason:'Physical activity', kws:[
      'gym','workout','workouts','work out','worked out','working out','exercise','exercised','exercising',
      'training','run','ran','running','jog','jogged','jogging','walk','walked','walking','hike','hiked',
      'hiking','swim','swam','swimming','bike ride','biking','cycling','yoga','stretching','cardio',
      'lifted weights','lifting','push ups','pushups','pull ups','pullups','squats','sport','sports',
      'soccer','football','basketball','tennis','boxing','climbing',
      'salle de sport','salle de gym','allé à la salle','allée à la salle','aller à la salle',
      'entraînement','entraînements','entraîné','entraîner','muscu','musculation','courir','couru',
      'je cours','course à pied','footing','marcher','une marche','de la marche','ai marché','a marché',
      'avons marché','promenade','balade','randonnée','rando','vélo','natation','nager','nagé',
      'étirements','boxe','escalade','basket','abdos','pompes'
    ]},
    {skill:'SCIENCE', xp:25, reason:'Learning / studying', kws:[
      'study','studied','studying','read','reading','book','course','class','classes','lecture','lectures',
      'lesson','lessons','homework','exam','exams','quiz','learn','learned','learnt','learning','research',
      'tutorial','school','university','college','library','revised','revising','revision',
      'certification','certificate','documentary',
      'étudier','étudié','étude','études','lire','ai lu','livre','livres','cours','classe','leçon','leçons',
      'examen','examens','partiel','partiels','apprendre','appris','réviser','révisé','révisions','devoirs',
      'bibliothèque','école','université','fac','formation','certificat','documentaire'
    ]},
    {skill:'SPEECH', xp:15, reason:'Social connection', kws:[
      'friend','friends','social','socialized','socializing','call','called','facetime','facetimed',
      'meeting','meetings','met up','met with','meet up','meetup','hung out','hang out','hanging out',
      'caught up with','catch up with','party','parties','conversation','chatted','talked','visited',
      'family','girlfriend','boyfriend','date night','dinner with','lunch with','coffee with','drinks',
      'networking','presentation','presented','public speaking','speech',
      'ami','amie','amis','amies','pote','potes','copain','copine','copains','copines','rencontré',
      'rencontrer','appel','appelé','appeler','parlé','parler','discuté','discussion','soirée','soirées',
      'fête','sortie','famille','réunion','visite','rendu visite','dîner avec','déjeuner avec',
      'café avec','apéro','exposé'
    ]},
    {skill:'COOKING', xp:15, reason:'Cooking', kws:[
      'cook','cooked','cooking','recipe','recipes','meal','meals','meal prep','bake','baked','baking',
      'made dinner','made lunch','made breakfast','kitchen','groceries','grocery','homemade',
      'cuisine','cuisiner','recette','recettes','repas','fait à manger','préparé à manger','pâtisserie',
      'gâteau','fait les courses','faire les courses'
    ]},
    {skill:'MUSIC', xp:15, reason:'Music practice', kws:[
      'music','musical','guitar','piano','bass','drums','drum','song','songs','sing','singing','compose',
      'composed','composing','lyrics','melody','chords','jammed','jam session','rehearsal','rehearsed',
      'concert','gig','band','violin','ukulele','instrument','instruments',
      'musique','guitare','chanson','chansons','chanté','chanter','chant','mélodie','solfège'
    ]},
    {skill:'FINANCE', xp:15, reason:'Financial progress', kws:[
      'budget','budgeted','budgeting','save','saved','saving','savings','money','finance','finances',
      'financial','invest','invested','investing','investment','investments','paid off','debt','bank',
      'expenses','income','salary','paycheck','taxes','crypto','stocks','bills',
      'épargne','économisé','économies','économiser','argent','investi','investir','investissement',
      'placement','dette','dettes','banque','dépenses','impôts','salaire','facture','factures'
    ]},
    {skill:'BUSINESS', xp:20, reason:'Work progress', kws:[
      'work','worked','working','job','jobs','application','applications','applied','interview',
      'interviews','project','projects','deadline','deadlines','business','client','clients','office',
      'boss','career','resume','hired','promotion','side hustle','startup',
      'travail','travaillé','travailler','boulot','emploi','candidature','candidatures','postulé',
      'postuler','entretien','projet','projets','bureau','entreprise','patron','carrière','embauché','cv'
    ]}
  ];
  // Phrases that contain a keyword without being that activity: they're
  // matched like keywords, then ignored.
  var NOT_ACTIVITIES = [
    'ran out','run out','running out','runs out','so called','call it a day','called it a day',
    'call it a night','called it a night','it worked out','all worked out','things worked out'
  ];

  // "J'ai étudié l'œuvre" → ['j','ai','etudie','l','oeuvre']
  function toWords(text){
    return String(text).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }

  // First word → every keyword starting with it, longest first.
  var KEYWORDS = Object.create(null);
  function addKeyword(phrase, rule){
    var words = toWords(phrase);
    (KEYWORDS[words[0]] = KEYWORDS[words[0]] || []).push({words:words, rule:rule});
  }
  RULES.forEach(function(r, i){ r.kws.forEach(function(kw){ addKeyword(kw, i); }); });
  NOT_ACTIVITIES.forEach(function(kw){ addKeyword(kw, -1); });
  Object.keys(KEYWORDS).forEach(function(w){
    KEYWORDS[w].sort(function(a, b){ return b.words.length - a.words.length; });
  });

  // The keyword that starts at words[i], or null.
  function keywordAt(words, i){
    var candidates = KEYWORDS[words[i]] || [];
    for (var c=0; c<candidates.length; c++){
      var kw = candidates[c].words, j = 1;
      while (j<kw.length && words[i+j]===kw[j]) j++;
      if (j===kw.length) return candidates[c];
    }
    return null;
  }

  function localHeuristic(text){
    var words = toWords(text), matched = {};
    for (var i=0; i<words.length; ){
      var kw = keywordAt(words, i);
      if (kw) matched[kw.rule] = true;
      i += kw ? kw.words.length : 1;
    }
    var totalXp = 8, reasons=[], skillGains=[];
    RULES.forEach(function(r, i){
      if (!matched[i]) return;
      totalXp += r.xp;
      reasons.push(r.reason);
      if (skillGains.length<2) skillGains.push({skill:r.skill, amount:2});
    });
    totalXp = Math.min(100,totalXp);
    return {xp:totalXp, reason: reasons.length? reasons.slice(0,2).join(' + ') : 'Logged your day', skillGains:skillGains};
  }

  ST.ai = {
    probe: probe,
    analyze: analyze,
    isPermanentError: isPermanentError,
    sanitizeProposal: sanitizeProposal,
    localHeuristic: localHeuristic
  };
})(window.StatusTerminal);
