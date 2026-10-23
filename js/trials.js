/**
 * TRIALS (VITALS → TRIALS) — physical tests to repeat about once a week,
 * like Fallout's trials: push-ups, a plank, squats in 60 seconds, 1 km, the
 * longest distance (typed in from Strava), and the player's own. Each card shows the record, the last result, the next
 * goal and the last results as bars; a trial not tried for a week is due.
 *
 * Starting one opens its panel: a 3-2-1, then a stopwatch (a hold, a time)
 * or a 60-second countdown (the most reps in a set time), and a big tap
 * counter for reps (phone on the floor, a tap of the chin each rep). A
 * result can be typed too; saving asks first, saying what it pays. The
 * rules and rewards live in js/state.js (logTrial: through award(), in the
 * history; the XP trains the trial's stat).
 *
 * The timer counts from its saved start (state.trials.active), so it keeps
 * going if the app is closed; its clock ticks on screen while TRIALS shows,
 * and the screen is kept awake while it runs (where the phone allows).
 * Buttons carry data-trial="..."; js/vitals.js draws the tab around this.
 */
(function(ST){
  'use strict';

  // The 1 km trial and the distances can start a Strava run: the button
  // opens the iPhone Shortcuts app on a shortcut the owner makes once, named
  // SHORTCUT_NAME, whose action starts a run in Strava (or just opens
  // Strava). There's no link that starts a Strava recording by itself, and
  // the result comes back by hand (the 1 km split, or the distance, typed in).
  var RUN_TRIAL = 'km', SHORTCUT_NAME = 'PIBBOY Run';
  var STRAVA_SHORTCUT = 'shortcuts://run-shortcut?name='+encodeURIComponent(SHORTCUT_NAME);

  var el = ST.el, escapeHtml = ST.escapeHtml, attr = ST.escapeHtml, app = ST.app;

  function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
  function sound(name){ if (ST.sfx) ST.sfx.play(name); }
  function save(now){ if (now) ST.storage.saveNow(); else ST.storage.scheduleSave(); }
  // "32 reps", "1:30", "5.4 km".
  function valueText(t, v){ return ST.trialValueText(t.id, v)+(t.unit==='reps' ? ' reps' : t.unit==='m' ? ' km' : ''); }
  function shortDay(day){
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(day || '');
    return m ? new Date(+m[1], +m[2]-1, +m[3]).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : '';
  }
  function clock(seconds){
    var s = Math.max(0, Math.round(seconds));
    return Math.floor(s/60)+':'+(s%60<10 ? '0' : '')+(s%60);
  }

  var draft = {id:null, text:''};           // what's typed in the open trial's result box

  // ---------- the cards ----------
  // The last results as bars (better is taller, a time too), the record lit.
  function barsHtml(t, results){
    var last = results.slice(-8);
    if (last.length<2) return '';
    var values = last.map(function(r){ return num(r.value); });
    var max = Math.max.apply(null, values), min = Math.min.apply(null, values), best = ST.trialBest(t.id);
    return '<div class="trial-bars" aria-hidden="true">'+last.map(function(r){
      var v = num(r.value), share = t.better==='less' ? min/v : v/max;
      return '<span class="trial-bar'+(v===best ? ' best' : '')+'" style="height:'+Math.max(8, Math.round(share*100))+'%"></span>';
    }).join('')+'</div>';
  }
  function cardHtml(t){
    var results = ST.trialResults(t.id), best = ST.trialBest(t.id), last = results[results.length-1];
    var due = ST.trialDue(t.id), open = app.trialOpen===t.id, goal = ST.trialGoal(t.id);
    var html = '<div class="trial-card'+(open ? ' open' : '')+'">'+
      '<div class="trial-head">'+
        '<span class="trial-name">'+escapeHtml(t.name)+'</span>'+
        '<span class="trial-stat" title="Trains '+escapeHtml(ST.STAT_LABELS[t.stat] || t.stat)+'">'+escapeHtml(t.stat)+'</span>'+
        (due ? '<span class="trial-due">DUE</span>' : '')+
        '<button class="remove-btn" data-trial="hide" data-id="'+attr(t.id)+'" aria-label="'+(t.custom ? 'Remove' : 'Hide')+' trial: '+escapeHtml(t.name)+'">&times;</button>'+
      '</div>'+
      '<div class="trial-what">'+escapeHtml(t.what)+'</div>'+
      (best!==null ? '<div class="trial-record">RECORD <b>'+escapeHtml(valueText(t, best))+'</b></div>' : '')+
      barsHtml(t, results)+
      '<div class="trial-meta">'+(last ?
        'Last: '+escapeHtml(valueText(t, last.value))+' · '+escapeHtml(shortDay(last.date))+
          (goal!==null ? ' · Next goal: '+escapeHtml(valueText(t, goal)) : '') :
        'Not tried yet: your first result is your record.')+'</div>';
    if (app.trialHide===t.id){
      html += '<div class="card-confirm row-confirm"><span class="reset-warning">'+
          (t.custom ? 'Remove this trial and its results? The XP stays.' : 'Hide this trial? Its results stay.')+'</span>'+
        '<button class="confirm-yes" data-trial="hide-yes" data-id="'+attr(t.id)+'">Yes</button>'+
        '<button data-trial="hide-no">Cancel</button></div>';
    }
    html += open ? panelHtml(t) :
      '<div class="vital-btns"><button class="vital-btn'+(due ? ' hot' : '')+'" data-trial="open" data-id="'+attr(t.id)+'">'+(t.timer==='none' ? 'Log' : 'Start')+'</button></div>';
    return html+'</div>';
  }

  // ---------- a trial's panel: timer, counter, result ----------
  function running(t){ var a = app.state.trials.active; return !!a && a.id===t.id; }
  function counter(t){ return app.trialCount && app.trialCount.id===t.id ? num(app.trialCount.n) : 0; }
  function clockNow(t){
    var ms = ST.trialElapsed();
    if (!running(t) || ms===null) return t.timer==='countdown' ? clock(t.seconds) : '0:00';
    if (ms<0) return String(Math.ceil(-ms/1000));
    return t.timer==='countdown' ? clock(Math.ceil((t.seconds*1000-ms)/1000)) : clock(Math.floor(ms/1000));
  }
  function panelHtml(t){
    var id = attr(t.id), on = running(t), reps = t.unit==='reps', km = t.unit==='m', strava = t.id===RUN_TRIAL || km;
    var html = '<div class="trial-panel">';
    if (km){                                // typed in: no timer here, Strava keeps the distance
      html += '<div class="vital-btns"><a class="vital-btn hot trial-strava" href="'+STRAVA_SHORTCUT+'">Start with Strava</a></div>'+
        '<p class="vital-fine trial-hint">Start with Strava opens your “'+SHORTCUT_NAME+'” shortcut (Shortcuts app), '+
          'which starts Strava. Back here, type the distance Strava shows (km) and save it.</p>';
    } else if (t.timer!=='counter'){
      html += '<div class="trial-clock" id="trial-clock" role="timer">'+escapeHtml(clockNow(t))+'</div>'+
        '<div class="vital-btns">'+(on ?
          (t.timer==='stopwatch' ? '<button class="vital-btn hot" data-trial="stop" data-id="'+id+'">Stop</button>' : '')+
          '<button class="vital-btn quiet" data-trial="cancel" data-id="'+id+'">Cancel timer</button>' :
          '<button class="vital-btn hot" data-trial="start" data-id="'+id+'">'+(t.timer==='countdown' ? 'Start '+t.seconds+' s' : 'Start timer')+'</button>'+
          (strava ? '<a class="vital-btn hot trial-strava" href="'+STRAVA_SHORTCUT+'">Run with Strava</a>' : ''))+
        '</div>'+
        (strava && !on ? '<p class="vital-fine trial-hint">Run with Strava opens your “'+SHORTCUT_NAME+'” shortcut (Shortcuts app), '+
          'which starts a Strava run. Back here, type your 1 km time from Strava and save it.</p>' : '');
    }
    if (reps){
      html += '<button class="trial-tap" data-trial="count" data-id="'+id+'" aria-label="One more rep">'+
          '<span class="trial-tap-n">'+counter(t)+'</span><span class="trial-tap-label">TAP</span></button>'+
        '<p class="vital-fine trial-hint">A tap each rep: phone on the floor, touch it with your chin. '+
          '<button class="trial-link" data-trial="count-reset" data-id="'+id+'">Reset</button></p>';
    }
    var typed = draft.id===t.id ? draft.text : (counter(t) ? String(counter(t)) : '');
    html += '<div class="trial-input-row"><label for="trial-value">'+(reps ? 'Reps' : km ? 'Distance (km)' : 'Time (m:ss)')+'</label>'+
      '<input type="text" id="trial-value" data-id="'+id+'" inputmode="'+(reps ? 'numeric' : km ? 'decimal' : 'text')+'" autocomplete="off" enterkeyhint="done" '+
        'placeholder="'+(reps ? '0' : km ? '0.0' : '0:00')+'" value="'+escapeHtml(typed)+'"></div>';
    var asking = app.trialConfirm && app.trialConfirm.id===t.id ? app.trialConfirm : null;
    if (asking){
      var p = ST.trialPreview(t.id, asking.value);
      html += '<div class="trial-confirm"><span>Save <b>'+escapeHtml(valueText(t, p ? p.value : asking.value))+'</b>? '+
          (p && p.record ? '<span class="trial-new">NEW RECORD</span> ' : '')+
          (p && p.xp ? '+'+p.xp+' XP · trains '+escapeHtml(t.stat) : 'No XP: today’s for this trial is earned already')+'</span>'+
        '<div class="vital-btns"><button class="vital-btn hot" data-trial="save-yes" data-id="'+id+'">Yes, save</button>'+
        '<button class="vital-btn quiet" data-trial="save-no" data-id="'+id+'">Cancel</button></div></div>';
    } else {
      html += '<div class="vital-btns"><button class="vital-btn hot" data-trial="save" data-id="'+id+'">Save result</button>'+
        '<button class="vital-btn quiet" data-trial="close" data-id="'+id+'">Close</button></div>';
    }
    html += historyHtml(t);
    return html+'</div>';
  }
  // The latest results, newest first, each removable (a typo).
  function historyHtml(t){
    var results = ST.trialResults(t.id).slice(-5).reverse();
    if (!results.length) return '';
    return '<ul class="trial-history">'+results.map(function(r){
      var asking = app.trialRemove && app.trialRemove.id===t.id && app.trialRemove.t===r.t;
      return '<li><span>'+escapeHtml(shortDay(r.date))+' — '+escapeHtml(valueText(t, r.value))+(r.xp ? ' · +'+num(r.xp)+' XP' : '')+'</span>'+
        (asking ?
          '<span class="card-confirm"><span class="reset-warning">Remove? Its XP stays.</span>'+
            '<button class="confirm-yes" data-trial="remove-yes" data-id="'+attr(t.id)+'" data-t="'+num(r.t)+'">Yes, remove</button>'+
            '<button data-trial="remove-no">Cancel</button></span>' :
          '<button class="remove-btn" data-trial="remove" data-id="'+attr(t.id)+'" data-t="'+num(r.t)+'" aria-label="Remove this result">&times;</button>')+
      '</li>';
    }).join('')+'</ul>';
  }

  // ---------- the whole view ----------
  function html(){
    var list = ST.trialList(), hidden = app.state.trials.hidden;
    var out = '<p class="vital-sub">Test yourself about once a week. A new record: <b>+'+ST.TRIAL_RECORD_XP+' XP</b>; '+
        'any other result: +'+ST.TRIAL_XP+' XP (once a trial a day). A distance: +'+ST.TRIAL_KM_XP+' XP a km '+
        '(at most '+ST.TRIAL_KM_XP_MAX+'), and +'+ST.TRIAL_RECORD_XP+' more for a record. The XP trains the trial’s stat.</p>'+
      '<p class="vital-fine trial-care">Warm up first and start easy. Stop if you feel chest pain, dizziness or short of breath.</p>';
    out += list.length ? list.map(cardHtml).join('') : '<div class="empty-note">No trials shown.</div>';
    if (hidden.length){
      out += '<p class="vital-sub">Hidden: '+hidden.map(function(id){
        var t = ST.trialById(id);
        return t ? escapeHtml(t.name)+' <button class="trial-link" data-trial="show" data-id="'+attr(id)+'">Show</button>' : '';
      }).join(' · ')+'</p>';
    }
    var open = app.trialAddOpen, full = app.state.trials.custom.length>=ST.TRIALS_CUSTOM_MAX;
    out += full ? '' :
      '<button class="add-open-btn" data-trial="add-open" aria-expanded="'+open+'"'+(open ? ' hidden' : '')+'>+ New trial</button>'+
      '<div class="add-row" id="add-trial"'+(open ? '' : ' hidden')+'>'+
        '<input autocomplete="off" enterkeyhint="done" type="text" class="field-full" id="new-trial-name" maxlength="'+ST.TRIAL_NAME_MAX+'" placeholder="Trial name (pull-ups, burpees…)" aria-label="Trial name">'+
        '<select id="new-trial-kind" aria-label="How it is measured">'+Object.keys(ST.TRIAL_KINDS).map(function(k){
          return '<option value="'+k+'">'+escapeHtml(ST.TRIAL_KINDS[k].label)+'</option>';
        }).join('')+'</select>'+
        '<select id="new-trial-stat" aria-label="Stat it trains">'+ST.STAT_KEYS.map(function(k){
          return '<option value="'+k+'">Trains '+k+'</option>';
        }).join('')+'</select>'+
        '<button data-trial="add">Add</button>'+
        '<button class="add-cancel" data-trial="add-close">Cancel</button>'+
      '</div>';
    return out;
  }
  function shown(){
    var tab = el('tab-vitals');
    return !!tab && tab.style.display!=='none' && app.vitalsView==='trials';
  }
  function redraw(focus){
    if (ST.vitals) ST.vitals.render();
    var target = focus && el('tab-vitals').querySelector(focus);
    if (target) target.focus();
  }

  // ---------- the timer ----------
  var loop = null, lastBeep = null, lock = null;
  function stopLoop(){ if (loop!==null){ clearInterval(loop); loop = null; } }
  // Drawn: the clock ticks while a timer runs here, and the screen stays on.
  function drawn(){
    var a = app.state && app.state.trials.active, visible = document.visibilityState!=='hidden';
    if (a && visible && shown()){ if (loop===null) loop = setInterval(step, 200); step(); }
    else stopLoop();
    holdScreen(!!a && visible);
  }
  function step(){
    var a = app.state.trials.active;
    if (!a){ stopLoop(); return; }
    var t = ST.trialById(a.id), ms = ST.trialElapsed(), face = el('trial-clock');
    if (!t){ ST.stopTrial(); stopLoop(); return; }
    if (ms<0){
      var n = Math.ceil(-ms/1000);
      if (lastBeep!==n){ lastBeep = n; sound('tick'); }
    } else {
      if (lastBeep!=='go'){ lastBeep = 'go'; sound('press'); }
      if (t.timer==='countdown' && ms>=t.seconds*1000){ countdownOver(t); return; }
    }
    if (face) face.textContent = clockNow(t);
  }
  // The set time is up: the count (when the counter was used) is asked to be saved.
  function countdownOver(t){
    ST.stopTrial();
    stopLoop();
    holdScreen(false);
    sound('complete');
    var n = counter(t);
    app.trialConfirm = n ? {id:t.id, value:n} : null;
    save(true);
    redraw(n ? '[data-trial="save-yes"]' : '#trial-value');
  }
  // The screen kept awake while a timer runs (Screen Wake Lock, where there is one).
  function holdScreen(on){
    if (on && !lock && navigator.wakeLock && navigator.wakeLock.request){
      lock = 'asking';
      navigator.wakeLock.request('screen').then(function(l){
        lock = l;
        if (l.addEventListener) l.addEventListener('release', function(){ if (lock===l) lock = null; });
      }, function(){ lock = null; });
    } else if (!on && lock && lock!=='asking'){
      lock.release().catch(function(){});
      lock = null;
    }
  }

  // ---------- taps ----------
  function showReward(r){
    ST.render.showXpToast(num(r.xp), r.skillGains);
    if (r.leveled) ST.render.showLevelUp();
    (r.trained || []).forEach(function(stat){ ST.render.showTrained(stat); });
    ST.render.renderHeader();
  }
  function askSave(t){
    var box = el('trial-value'), value = box ? ST.parseTrialValue(t.id, box.value) : null;
    if (value===null){
      if (box) box.focus();
      sound('error');
      return;
    }
    app.trialConfirm = {id:t.id, value:value};
    redraw('[data-trial="save-yes"]');
  }
  var ACTIONS = {
    'open': function(t){
      app.trialOpen = t.id;
      app.trialConfirm = null;
      redraw(t.timer==='counter' ? '[data-trial="count"]' : t.timer==='none' ? '#trial-value' : '[data-trial="start"]');
    },
    'close': function(){
      app.trialOpen = null;
      app.trialConfirm = null;
      redraw();
    },
    'start': function(t){
      lastBeep = null;
      app.trialConfirm = null;
      if (t.unit==='reps') app.trialCount = {id:t.id, n:0};
      ST.startTrial(t.id);
      save(true);
      redraw('[data-trial="cancel"]');
    },
    'stop': function(t){
      var seconds = ST.stopTrial();
      holdScreen(false);
      sound('complete');
      app.trialConfirm = seconds>=1 ? {id:t.id, value:seconds} : null;
      draft = {id:t.id, text:seconds>=1 ? ST.trialValueText(t.id, seconds) : ''};
      save(true);
      redraw(seconds>=1 ? '[data-trial="save-yes"]' : '[data-trial="start"]');
    },
    'cancel': function(){
      ST.stopTrial();
      holdScreen(false);
      save(true);
      redraw('[data-trial="start"]');
    },
    'count': function(t, btn){
      app.trialCount = {id:t.id, n:counter(t)+1};
      sound('step');
      var n = btn.querySelector('.trial-tap-n');
      if (n) n.textContent = app.trialCount.n;           // no redraw: the next tap lands on the same button
      var box = el('trial-value');
      if (box && !(draft.id===t.id && draft.text)) box.value = app.trialCount.n;
    },
    'count-reset': function(t){ app.trialCount = {id:t.id, n:0}; draft = {id:t.id, text:''}; redraw('[data-trial="count"]'); },
    'save': function(t){ askSave(t); },
    'save-no': function(){ app.trialConfirm = null; redraw('#trial-value'); },
    'save-yes': function(t){
      var asking = app.trialConfirm;
      app.trialConfirm = null;
      if (!asking || asking.id!==t.id) return;
      var r = ST.logTrial(t.id, asking.value);
      if (!r) return;
      save(true);                           // saved first: drawing the screen can't lose it
      if (r.record) ST.render.showRecord(t.name, valueText(t, r.entry.value));
      if (r.reward){ sound('complete'); showReward(r.reward); }
      else ST.render.showNotice('Saved — today’s XP for this trial was earned already');
      app.trialOpen = null;
      app.trialCount = null;
      draft = {id:null, text:''};
      redraw();
      ST.render.renderStatus();             // the training under the stats
    },
    'remove': function(t, btn){ app.trialRemove = {id:t.id, t:Number(btn.getAttribute('data-t'))}; redraw('[data-trial="remove-no"]'); },
    'remove-no': function(){ app.trialRemove = null; redraw(); },
    'remove-yes': function(t, btn){
      app.trialRemove = null;
      if (ST.removeTrialResult(t.id, btn.getAttribute('data-t'))) save(true);
      redraw();
    },
    'hide': function(t){ app.trialHide = t.id; redraw('[data-trial="hide-no"]'); },
    'hide-no': function(){ app.trialHide = null; redraw(); },
    'hide-yes': function(t){
      app.trialHide = null;
      if (app.trialOpen===t.id) app.trialOpen = null;
      if (ST.removeTrial(t.id)) save(true);
      redraw();
    },
    'show': function(t){ ST.showTrial(t.id); save(); redraw(); },
    'add-open': function(){ app.trialAddOpen = true; redraw('#new-trial-name'); },
    'add-close': function(){ app.trialAddOpen = false; redraw(); },
    'add': function(){ addTrial(); }
  };
  // Actions that don't need a trial.
  var FREE = {'close':1, 'save-no':1, 'remove-no':1, 'hide-no':1, 'add-open':1, 'add-close':1, 'add':1};
  function addTrial(){
    var name = el('new-trial-name');
    if (!name || !name.value.trim()){ if (name) name.focus(); return; }
    var t = ST.addTrial(name.value, el('new-trial-kind').value, el('new-trial-stat').value);
    if (!t) return;
    app.trialAddOpen = false;
    save(true);
    redraw();
  }
  function onClick(e){
    var btn = e.target.closest && e.target.closest('[data-trial]');
    if (!btn || btn.disabled || !app.state) return;
    var what = btn.getAttribute('data-trial'), run = ACTIONS[what];
    if (!run) return;
    var t = ST.trialById(btn.getAttribute('data-id'));
    if (!t && !FREE[what]) return;
    run(t, btn);
  }
  function onInput(e){
    if (e.target.id==='trial-value') draft = {id:e.target.getAttribute('data-id'), text:e.target.value};
  }
  function onKey(e){
    if (e.key!=='Enter') return;
    if (e.target.id==='trial-value'){
      var t = ST.trialById(e.target.getAttribute('data-id'));
      if (t){ e.preventDefault(); askSave(t); }
    } else if (e.target.id==='new-trial-name'){ e.preventDefault(); addTrial(); }
  }

  function init(){
    document.body.addEventListener('click', onClick);
    document.body.addEventListener('input', onInput);
    document.body.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', function(){
      if (document.visibilityState==='hidden'){ stopLoop(); holdScreen(false); return; }
      if (app.state && shown()) redraw();               // time went by (a set time may be up)
      else holdScreen(!!(app.state && app.state.trials.active));
    });
  }
  // Everything that ticks, stopped (the tests).
  function stop(){ stopLoop(); }

  ST.trials = { init: init, html: html, drawn: drawn, stop: stop, clock: clock };
})(window.StatusTerminal);
