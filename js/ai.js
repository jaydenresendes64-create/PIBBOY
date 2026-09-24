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

  function sanitizeProposal(data){
    data = data || {};
    var xp = clamp(Math.round(Number(data.xp)||10),1,150);
    var reason = typeof data.reason==='string' ? data.reason.slice(0,80) : 'Logged activity';
    var skillGains = Array.isArray(data.skillGains) ? data.skillGains.filter(function(g){
      return g && SKILL_KEYS.indexOf(g.skill)!==-1;
    }).slice(0,2).map(function(g){ return {skill:g.skill, amount:clamp(Math.round(Number(g.amount)||1),1,5)}; }) : [];
    return {xp:xp, reason:reason, skillGains:skillGains};
  }

  function localHeuristic(text){
    var t = text.toLowerCase();
    var rules = [
      {kws:['gym','workout','run','walk','marche','sport','entra','training','exercise'], skill:'SURVIVAL', xp:20, reason:'Physical activity'},
      {kws:['study','read','course','class','exam','learn','tudier','livre','cours','apprendre','cizr','pssac','certificat'], skill:'SCIENCE', xp:25, reason:'Learning / studying'},
      {kws:['friend','social','call','met','meeting','ami','rencontre','appel','parl','party','soir'], skill:'SPEECH', xp:15, reason:'Social connection'},
      {kws:['cook','recipe','meal','cuisine','recette','repas'], skill:'COOKING', xp:15, reason:'Cooking'},
      {kws:['music','guitar','song','musique','guitare','chanson','compose'], skill:'MUSIC', xp:15, reason:'Music practice'},
      {kws:['budget','save','money','finance','pargne','argent'], skill:'FINANCE', xp:15, reason:'Financial progress'},
      {kws:['work','job','application','projet','travail','bureau','deadline','business'], skill:'BUSINESS', xp:20, reason:'Work progress'}
    ];
    var totalXp = 8, reasons=[], skillGains=[];
    rules.forEach(function(r){
      for (var i=0;i<r.kws.length;i++){
        if (t.indexOf(r.kws[i])!==-1){
          totalXp += r.xp;
          reasons.push(r.reason);
          if (r.skill && skillGains.length<2 && !skillGains.some(function(g){return g.skill===r.skill;})) skillGains.push({skill:r.skill,amount:2});
          break;
        }
      }
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
