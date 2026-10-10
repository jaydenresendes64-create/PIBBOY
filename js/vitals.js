/**
 * VITALS — the owner's own design, brought over from their in-Claude
 * version (2026-10-09): the day's check-in (how you feel, 0 to 10; the
 * resting pulse; two counters), the last seven days with their averages,
 * and the urge decoder (name the real need, then a 20-minute timer). And
 * the chem-free streak's card at the top of STATUS (render.js asks for it).
 *
 * The rules and rewards live in js/state.js (logVitals, claimCleanMilestones,
 * urgeWon, trainStat: through award(), recorded in the history); this file
 * draws the VITALS tab and the streak card, and turns their taps into those
 * calls. Its buttons carry data-vital="..." (events.js handles data-action).
 *
 * The urge timer counts from its saved start, so it keeps going when the
 * app is closed; its clock only ticks on screen while the tab shows and the
 * app is in front. When a round ends, the app says so whatever tab is
 * open (a sound, a notice), once a round. A small light on the VITALS tab
 * key shows, from every tab, an urge timer running or over, or today's
 * check-in still to do.
 */
(function(ST){
  'use strict';

  var el = ST.el, clamp = ST.clamp, escapeHtml = ST.escapeHtml, app = ST.app;
  var LABELS = {energy:'Energy', mood:'Mood', hunger:'Hunger', tension:'Tension', sleep:'Sleep', craving:'Craving'};
  var SHORT = {energy:'EN', mood:'MO', hunger:'HU', tension:'TE', sleep:'SL', craving:'CR'};
  // What to do first, for each need (the owner's words).
  var TIPS = {
    HUNGRY: 'Eat a real meal and drink water first. Then see what is left of the urge.',
    ANGRY: 'Walk it off, take a shower, or write down what set it off.',
    LONELY: 'Message or call one person now. Being in a room with people counts.',
    TIRED: 'Lie down for 20 minutes, phone out of reach. Tired reads as craving.',
    NONE: 'Then it is the habit loop firing. Change rooms and let the clock run.'
  };
  var HELP_LINE = 'Support line, 24/7: <a href="tel:18002652626">1-800-265-2626</a>. '+
    'Chest pain with short breath, sweating or nausea: call 911.';

  function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
  function pad2(n){ return (n<10 ? '0' : '')+n; }
  function plural(n, word){ return n+' '+word+(n===1 ? '' : 's'); }
  function sound(name, delay){ if (ST.sfx) ST.sfx.play(name, delay); }
  function save(now){ if (now) ST.storage.saveNow(); else ST.storage.scheduleSave(); }
  // 19:59, for the urge timer.
  function clockText(ms){
    var s = Math.max(0, Math.ceil(ms/1000));
    return pad2(Math.floor(s/60))+':'+pad2(s%60);
  }
  // A saved day ('YYYY-M-D') as a date box wants it ('YYYY-MM-DD'), and back.
  var DAY = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
  function boxDate(day){
    var m = DAY.exec(day || '');
    if (!m) return '';
    return m[1]+'-'+pad2(+m[2])+'-'+pad2(+m[3]);
  }
  function todayBox(){ return boxDate(ST.todayStr()); }
  function shortDay(day){
    var m = DAY.exec(day || '');
    return m ? new Date(+m[1], +m[2]-1, +m[3]).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : '';
  }

  // ---------- the chem-free streak (top of STATUS) ----------
  function streakCardHtml(){
    var c = app.state.chems, day = ST.cleanDay();
    var html = '<div class="vital-card streak-card"><div class="vital-head">Chem-free streak</div>';
    if (day===null || app.streakEdit){
      html += '<p class="vital-sub">Set the first chem-free day of this run.</p>'+
        '<div class="vital-btns">'+
          '<input type="date" class="date-input" id="streak-date" max="'+todayBox()+'" value="'+(boxDate(c.cleanSince) || todayBox())+'" aria-label="First chem-free day">'+
          '<button class="vital-btn hot" data-vital="streak-set">Set</button>'+
          (day!==null ? '<button class="vital-btn quiet" data-vital="streak-edit">Cancel</button>' : '')+
        '</div>';
    } else if (day<=0){
      // A lapse logged today: the next run starts tomorrow.
      html += '<div class="streak-big">RESTART // TOMORROW</div>'+
        '<p class="vital-sub">Stop for today. The '+plural(num(c.totalClean), 'chem-free day')+' behind you still count.</p>'+
        '<div class="vital-btns"><button class="vital-btn hot" data-vital="goto-urge">Urge? Decode it</button>'+
        '<button class="vital-btn quiet" data-vital="streak-edit">Edit start</button></div>';
    } else {
      var done = day-1, next = ST.nextCleanMilestone(), best = num(c.best);
      html += '<div class="streak-big">DAY '+pad2(day)+'</div>';
      if (next){
        var prev = 0;
        ST.CLEAN_MILESTONES.forEach(function(m){ if (m.days<next.days) prev = m.days; });
        html += '<p class="vital-sub">'+plural(done, 'full day')+' done. Next: '+next.days+' days, +'+next.xp+' XP, '+
            (next.days-done)+' to go.'+(best>0 ? ' Best run: '+best+'.' : '')+'</p>'+
          '<div class="streak-bar"><div class="streak-fill" style="width:'+clamp((done-prev)/(next.days-prev)*100, 0, 100)+'%"></div></div>';
      } else {
        html += '<p class="vital-sub">'+done+' full days done. Every milestone cleared.</p>';
      }
      if (app.confirmLapse){
        html += '<p class="vital-sub">Log a lapse today? The count restarts tomorrow. Days already done stay in your total and no XP is lost.</p>'+
          '<div class="vital-btns"><button class="vital-btn warn" data-vital="lapse-yes">Yes, log it</button>'+
          '<button class="vital-btn quiet" data-vital="lapse-no">Cancel</button></div>';
      } else {
        html += '<div class="vital-btns"><button class="vital-btn hot" data-vital="goto-urge">Urge? Decode it</button>'+
          '<button class="vital-btn quiet" data-vital="streak-edit">Edit start</button>'+
          '<button class="vital-btn quiet" data-vital="lapse-ask">Log a lapse</button></div>';
      }
    }
    return html+'</div>';
  }

  // ---------- the urge decoder ----------
  function urgeCardHtml(){
    var a = app.state.urges.active, left = ST.urgeLeft();
    var html = '<div class="vital-card urge-card" id="urge-card"><div class="vital-head">Urge decoder</div>';
    if (!a){
      html += '<p class="urge-tip">Before acting on it, name the real need. Right now I am mostly:</p>'+
        '<div class="urge-grid">'+
          ['HUNGRY','ANGRY','LONELY','TIRED'].map(function(n){
            return '<button class="vital-btn" data-vital="urge-start" data-key="'+n+'">'+n+'</button>';
          }).join('')+
          '<button class="vital-btn quiet wide" data-vital="urge-start" data-key="NONE">None of these</button>'+
        '</div>'+
        '<p class="vital-fine">'+HELP_LINE+'</p>';
    } else if (left>0){
      html += '<p class="urge-tip">'+escapeHtml(TIPS[a.need] || TIPS.NONE)+'</p>'+
        '<div class="urge-clock" id="urge-clock" role="timer" aria-label="Time left">'+clockText(left)+'</div>'+
        '<p class="vital-sub urge-note">'+(num(a.rounds)>1 ? 'Round '+num(a.rounds)+'. ' : '')+'Leave this room. Come back at zero.</p>'+
        '<div class="vital-btns"><button class="vital-btn quiet" data-vital="urge-cancel">Cancel</button></div>'+
        '<p class="vital-fine">'+HELP_LINE+'</p>';
    } else {
      var paid = ST.urgesToday()<ST.URGE_XP_PER_DAY;
      html += '<div class="urge-clock">00:00</div>'+
        '<p class="urge-tip">Twenty minutes down. Did it pass?</p>'+
        '<div class="urge-grid">'+
          '<button class="vital-btn hot" data-vital="urge-won">Rode it out'+
            (paid ? '<span class="btn-sub">+'+ST.URGE_XP+' XP · +1 SURVIVAL</span>' : '')+'</button>'+
          '<button class="vital-btn" data-vital="urge-again">Still strong</button>'+
        '</div>'+
        '<p class="vital-fine">Still strong: run another 20 minutes somewhere else, or call the support line, 24/7: '+
          '<a href="tel:18002652626">1-800-265-2626</a>. Chest pain with short breath, sweating or nausea: call 911.</p>';
    }
    return html+'</div>';
  }

  // ---------- the VITALS tab ----------
  function countRowHtml(key, label, value){
    return '<div class="count-row"><span>'+label+'</span><div class="count-ctl">'+
      '<button class="step-btn" data-vital="rad" data-key="'+key+'" data-dir="-1" aria-label="One less, '+label+'">-</button>'+
      '<span class="count-num">'+num(value)+'</span>'+
      '<button class="step-btn" data-vital="rad" data-key="'+key+'" data-dir="1" aria-label="One more, '+label+'">+</button>'+
    '</div></div>';
  }
  // The average of the numbers given (null left out), one decimal; – for none.
  function average(values){
    values = values.filter(function(v){ return v!==null; });
    if (!values.length) return '–';
    return (values.reduce(function(a, b){ return a+b; }, 0)/values.length).toFixed(1);
  }
  function tableHtml(){
    var rows = ST.lastVitals(7);
    if (!rows.length) return '<div class="empty-note">No entries yet.</div>';
    var keys = ST.VITAL_KEYS;
    var html = '<div class="vt-wrap"><table class="vt"><thead><tr><th scope="col">DAY</th>'+
      keys.map(function(k){ return '<th scope="col"><abbr title="'+LABELS[k]+'">'+SHORT[k]+'</abbr></th>'; }).join('')+
      '<th scope="col">BPM</th><th scope="col">N</th><th scope="col">T</th></tr></thead><tbody>';
    rows.forEach(function(r){
      html += '<tr><td>'+escapeHtml(shortDay(r.date))+'</td>'+
        keys.map(function(k){ return '<td>'+(r.logged ? num(r[k]) : '–')+'</td>'; }).join('')+
        '<td>'+(r.pulse ? num(r.pulse) : '–')+'</td><td>'+num(r.radN)+'</td><td>'+num(r.radT)+'</td></tr>';
    });
    html += '<tr class="avg"><td>AVG</td>'+
      keys.map(function(k){ return '<td>'+average(rows.map(function(r){ return r.logged ? num(r[k]) : null; }))+'</td>'; }).join('')+
      '<td>'+average(rows.map(function(r){ return r.pulse ? num(r.pulse) : null; }))+'</td>'+
      '<td>'+average(rows.map(function(r){ return num(r.radN); }))+'</td>'+
      '<td>'+average(rows.map(function(r){ return num(r.radT); }))+'</td></tr>';
    return html+'</tbody></table></div>';
  }
  // VITALS has two views, like a Pip-Boy tab's sub-tabs: CHECK-IN (the urge
  // decoder, the day's check-in, the last 7 days) and TRIALS (js/trials.js).
  function view(){ return app.vitalsView==='trials' && ST.trials ? 'trials' : 'checkin'; }
  function subTabsHtml(trials){
    if (!ST.trials) return '';
    var due = ST.trialsDue();
    return '<div class="sub-tabs">'+
      '<button class="sub-tab'+(trials ? '' : ' active')+'" data-vital="view" data-key="checkin" aria-pressed="'+!trials+'">CHECK-IN</button>'+
      '<button class="sub-tab'+(trials ? ' active' : '')+'" data-vital="view" data-key="trials" aria-pressed="'+trials+'">TRIALS'+
        (due ? '<span class="sub-count">'+due+' due</span>' : '')+'</button>'+
    '</div>';
  }
  function render(){
    var tab = el('tab-vitals');
    if (!tab || !app.state) return;
    var trials = view()==='trials';
    tab.innerHTML = subTabsHtml(trials)+(trials ? ST.trials.html() : checkInHtml());
    if (trials) ST.trials.drawn();
    syncTicker();
    syncAlarm();
    markTab();
  }
  function checkInHtml(){
    var e = ST.vitalsToday(false);
    var html = urgeCardHtml()+'<div class="panel-title">Today’s check-in</div>';
    ST.VITAL_KEYS.forEach(function(k){
      var v = e ? num(e[k]) : 5;
      html += '<div class="vital-row">'+
        '<label for="vr-'+k+'">'+LABELS[k]+'</label>'+
        '<input type="range" class="vital-range" id="vr-'+k+'" data-key="'+k+'" min="0" max="10" step="1" value="'+v+'">'+
        '<span class="vital-val" id="vv-'+k+'">'+v+'</span>'+
      '</div>';
    });
    html += '<div class="count-row"><label for="pulse-input">Resting pulse, bpm</label>'+
        '<input type="number" class="pulse-input" id="pulse-input" inputmode="numeric" min="'+ST.PULSE_MIN+'" max="'+ST.PULSE_MAX+'" placeholder="--" value="'+(e && e.pulse ? num(e.pulse) : '')+'"></div>'+
      countRowHtml('N', 'RADS // type N', e ? e.radN : 0)+
      countRowHtml('T', 'RADS // type T', e ? e.radT : 0)+
      '<div class="vital-btns">'+
        (e && e.logged
          ? '<button class="vital-btn" disabled>Logged ✓</button><span class="vital-sub inline">Changes save on their own.</span>'
          : '<button class="vital-btn hot" data-vital="vitals-log">Log check-in +'+ST.VITALS_XP+' XP</button>')+
      '</div>'+
      '<p class="vital-fine">0 is none, 10 is maximum. Take the pulse before getting up, counted over 60 seconds. '+
        'The check-in trains Intelligence.</p>'+
      '<div class="panel-title">Last 7 entries</div>'+tableHtml();
    return html;
  }
  function shown(){
    var tab = el('tab-vitals');
    return !!tab && tab.style.display!=='none';
  }
  // The urge card on screen: VITALS open on CHECK-IN.
  function urgeShown(){ return shown() && view()==='checkin'; }
  // Only the urge card, so a pulse being typed stays as it is.
  function redrawUrge(){
    var card = el('urge-card');
    if (!card) return;
    var holder = document.createElement('div');
    holder.innerHTML = urgeCardHtml();
    card.replaceWith(holder.firstChild);
    syncTicker();
    syncAlarm();
    markTab();
  }

  // ---------- the urge timer's clock ----------
  var ticker = null;
  function stopTicker(){ if (ticker!==null){ clearInterval(ticker); ticker = null; } }
  function syncTicker(){
    var running = app.state && app.state.urges.active && ST.urgeLeft()>0;
    if (running && urgeShown() && document.visibilityState!=='hidden'){ if (ticker===null) ticker = setInterval(tick, 1000); }
    else stopTicker();
  }
  function tick(){
    var clock = el('urge-clock'), left = ST.urgeLeft();
    if (left>0){ if (clock) clock.textContent = clockText(left); return; }
    stopTicker();
    urgeOver();
  }

  // ---------- the end of a round, from any tab ----------
  var alarm = null;
  var announced = null;         // the round already announced (its start and number)
  function syncAlarm(){
    clearTimeout(alarm);
    alarm = null;
    var a = app.state && app.state.urges.active;
    if (!a || document.visibilityState==='hidden') return;
    var left = ST.urgeLeft();
    if (left>0) alarm = setTimeout(urgeOver, left+50);
    else announce();              // already drawn at zero: only the sound (and notice), once
  }
  // The round reached zero (the alarm, or the clock on screen): the card
  // shows "Rode it out / Still strong", or on another tab the key's light
  // changes; with a sound and, off VITALS, a notice, once a round.
  function urgeOver(){
    alarm = null;
    var a = app.state && app.state.urges.active;
    if (!a) return;
    if (ST.urgeLeft()>0){ syncAlarm(); return; }
    if (urgeShown()) redrawUrge();    // which announces it
    else { markTab(); announce(); }
  }
  function announce(){
    var a = app.state.urges.active, round = a.start+':'+a.rounds;
    if (announced===round) return;
    announced = round;
    sound('quest');
    if (!urgeShown()) ST.render.showNotice('Urge timer: twenty minutes down. Did it pass? (VITALS)');
  }
  // Everything that ticks, stopped (the app in the background).
  function stop(){
    stopTicker();
    clearTimeout(alarm);
    alarm = null;
  }

  // ---------- the VITALS tab key ----------
  var ALERTS = {urge:'VITALS: urge timer running', over:'VITALS: urge timer over, did it pass?',
    trial:'VITALS: a trial\u2019s timer is running', due:'VITALS: check-in due today'};
  function alertState(){
    var s = app.state;
    if (!s) return '';
    if (s.urges.active) return ST.urgeLeft()>0 ? 'urge' : 'over';
    if (s.trials && s.trials.active) return 'trial';
    var e = ST.vitalsToday(false);
    return e && e.logged ? '' : 'due';
  }
  function markTab(){
    var key = document.querySelector('.tab-btn[data-tab="vitals"]');
    if (!key) return;
    var a = alertState();
    if (a){ key.setAttribute('data-alert', a); key.setAttribute('aria-label', ALERTS[a]); }
    else { key.removeAttribute('data-alert'); key.removeAttribute('aria-label'); }
  }

  // ---------- taps ----------
  function redrawStatus(focus){
    ST.render.renderStatus();
    var btn = focus && el('tab-status').querySelector(focus);
    if (btn) btn.focus();
  }
  // A reward's toasts: its XP and skills, a level-up, the stats it trained.
  function showReward(r){
    ST.render.showXpToast(num(r.xp), r.skillGains);
    if (r.leveled) ST.render.showLevelUp();
    (r.trained || []).forEach(function(stat){ ST.render.showTrained(stat); });
    ST.render.renderHeader();
  }
  function openVitals(){
    ST.render.switchTab('vitals');
    if (ST.mascot) ST.mascot.onTab('vitals');
    render();
  }
  var ACTIONS = {
    'streak-edit': function(){
      app.streakEdit = !app.streakEdit;
      app.confirmLapse = false;
      redrawStatus(app.streakEdit ? '#streak-date' : '[data-vital="streak-edit"]');
    },
    'streak-set': function(){
      var input = el('streak-date');
      if (!input || !ST.setCleanStart(input.value)){ if (input) input.focus(); return; }
      app.streakEdit = false;
      redrawStatus('[data-vital="goto-urge"]');
      save(true);                 // the milestones it reached are paid just after (events.js)
    },
    'lapse-ask': function(){ app.confirmLapse = true; redrawStatus('[data-vital="lapse-no"]'); },
    'lapse-no': function(){ app.confirmLapse = false; redrawStatus('[data-vital="lapse-ask"]'); },
    'lapse-yes': function(){
      app.confirmLapse = false;
      if (ST.logLapse()) save(true);
      redrawStatus('[data-vital="goto-urge"]');
    },
    'goto-urge': function(){
      app.vitalsView = 'checkin';
      openVitals();
      var card = el('urge-card');
      if (card && card.scrollIntoView) card.scrollIntoView({block:'start', behavior:ST.stayStill() ? 'auto' : 'smooth'});
    },
    // CHECK-IN or TRIALS.
    'view': function(btn, key){
      app.vitalsView = key==='trials' ? 'trials' : 'checkin';
      render();
      var pressed = document.querySelector('.sub-tab[data-key="'+app.vitalsView+'"]');
      if (pressed) pressed.focus();
    },
    'urge-start': function(btn, key){
      ST.startUrge(key);
      redrawUrge();
      save(true);
      var cancel = document.querySelector('[data-vital="urge-cancel"]');
      if (cancel) cancel.focus();
    },
    'urge-again': function(){ if (ST.urgeAgain()){ redrawUrge(); save(true); } },
    'urge-cancel': function(){ ST.cancelUrge(); redrawUrge(); save(); },
    'urge-won': function(){
      var r = ST.urgeWon();
      if (!r) return;
      if (r.capped) ST.render.showNotice('Logged — today’s XP for urges is used up');
      else { sound('complete'); showReward(r); }
      redrawUrge();
      ST.render.renderStatus();     // the Lifetime count, the skill
      save(true);
    },
    'rad': function(btn, key){
      ST.stepRads(key, parseInt(btn.getAttribute('data-dir') || '0', 10));
      render();
      save();
    },
    'vitals-log': function(){
      var r = ST.logVitals();
      if (!r) return;
      sound('complete');
      showReward(r);
      render();
      ST.render.renderStatus();
      save(true);
    }
  };
  function onClick(e){
    var btn = e.target.closest && e.target.closest('[data-vital]');
    if (!btn || btn.disabled || !app.state) return;
    var run = ACTIONS[btn.getAttribute('data-vital')];
    if (run) run(btn, btn.getAttribute('data-key'));
  }
  function onInput(e){
    var t = e.target;
    if (!app.state || !t.classList || !t.classList.contains('vital-range')) return;
    var v = ST.setVital(t.getAttribute('data-key'), t.value);
    if (v===null) return;
    var label = el('vv-'+t.getAttribute('data-key'));
    if (label) label.textContent = v;
    save();
  }
  function onChange(e){
    if (!app.state || e.target.id!=='pulse-input') return;
    var kept = ST.setPulse(e.target.value);
    e.target.value = kept===null ? '' : kept;
    save();
  }

  // The tab opened (events.js): drawn fresh, a day may have passed.
  function onTab(name){
    if (name==='vitals') render();
    else stopTicker();
  }
  function init(){
    document.body.addEventListener('click', onClick);
    document.body.addEventListener('input', onInput);
    document.body.addEventListener('change', onChange);
    document.addEventListener('visibilitychange', function(){
      if (document.visibilityState==='hidden'){ stop(); return; }
      if (!app.state) return;
      if (urgeShown() && app.state.urges.active) redrawUrge();     // time went by
      else { syncAlarm(); markTab(); }                        // a round may have ended meanwhile
    });
    syncAlarm();
    markTab();
  }

  ST.vitals = {
    init: init, render: render, onTab: onTab, stop: stop, markTab: markTab, streakCardHtml: streakCardHtml,
    clockText: clockText, boxDate: boxDate, alertState: alertState
  };
})(window.StatusTerminal);
