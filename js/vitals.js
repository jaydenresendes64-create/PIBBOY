/**
 * VITALS — the owner's own design, brought over from their in-Claude
 * version (2026-10-09): the day's check-in (how you feel, 0 to 10; the
 * resting pulse; two counters), the last seven days with their averages,
 * the urge decoder (name the real need, then a 20-minute timer) and the
 * chem-free streak's card.
 *
 * The morning path (2026-10-10): the app opens here. The three cards come
 * in the order that matters today (order()): the urge decoder first while
 * its timer runs or after a high craving, the streak first the day before
 * a milestone, else the check-in (then the streak, in sight under the
 * field report, then the urge decoder). The sliders start from the last
 * check-in. Once logged, the check-in folds into one line, a field report
 * (fieldReport(), from the state) and the next step (nextStep(): a trial
 * due, else the daily quest left longest). Until it's logged, QUESTS,
 * ITEMS, MAP and LOG wait (Settings: Check-in first).
 *
 * Under the chem-free streak, the player's own streaks (state.streaks: a
 * name they type, same milestones): a card each, "+ New streak" or its
 * form (app.ownForm), a lapse or a removal asked first (app.ownConfirm).
 *
 * The words of the readings and of the urge decoder's messages come from
 * js/insight.js (readings(), urgeMessages(), urgeReflection(), resetLine(),
 * urgeHint()); "Another angle" walks down the messages (app.urgeAngle).
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
  // What 0 and 10 mean on each level (insight.js LINES reads them the same
  // way: low sleep, energy, mood; high hunger, tension, craving).
  var SCALE = {energy:['drained', 'full'], mood:['very low', 'great'], hunger:['not hungry', 'starving'],
    tension:['relaxed', 'very tense'], sleep:['awful night', 'great'], craving:['none', 'overwhelming']};
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
  // A line of js/insight.js with its tag ("TREND //"), or '' for none.
  function insightLine(m, cls){
    return m ? '<p class="'+cls+'"><span class="field-tag">'+escapeHtml(m.style || m.tag)+' //</span> '+escapeHtml(m.text)+'</p>' : '';
  }
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

  // ---------- the chem-free streak ----------
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
        (ST.insight ? insightLine(ST.insight.resetLine(), 'vital-sub reading') : '')+
        '<div class="vital-btns"><button class="vital-btn hot" data-vital="goto-urge">Urge? Decode it</button>'+
        '<button class="vital-btn quiet" data-vital="streak-edit">Edit start</button></div>';
    } else {
      html += runHtml(null);
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
  // A run under way (`id`: one of the player's own streaks, null: the
  // chem-free one): its day, tomorrow's milestone, the next one and the bar.
  function runHtml(id){
    var c = ST.streakById(id), day = ST.cleanDay(id), done = day-1, next = ST.nextCleanMilestone(id), best = num(c.best);
    var html = '<div class="streak-big">DAY '+pad2(day)+'</div>';
    var soon = milestoneTomorrow(id);
    if (soon) html += '<p class="vital-sub streak-soon">Day '+day+'. Tomorrow: +'+soon.xp+' XP.</p>';
    if (next){
      var prev = 0;
      ST.CLEAN_MILESTONES.forEach(function(m){ if (m.days<next.days) prev = m.days; });
      html += '<p class="vital-sub">'+plural(done, 'full day')+' done. Next: '+next.days+' days, +'+next.xp+' XP, '+
          (next.days-done)+' to go.'+(best>0 ? ' Best run: '+best+'.' : '')+'</p>'+
        '<div class="streak-bar"><div class="streak-fill" style="width:'+clamp((done-prev)/(next.days-prev)*100, 0, 100)+'%"></div></div>';
    } else {
      html += '<p class="vital-sub">'+done+' full days done. Every milestone cleared.</p>';
    }
    return html;
  }

  // ---------- the player's own streaks ----------
  // One of them by id, never the chem-free one.
  function own(id){ return id ? ST.streakById(id) : null; }
  function asking(id, what){ return !!app.ownConfirm && app.ownConfirm.id===id && app.ownConfirm.what===what; }
  function ownKey(x){ return ' data-key="'+escapeHtml(x.id)+'"'; }
  // A card each, then "+ New streak" (or the form for one).
  function ownStreaksHtml(){
    var list = app.state.streaks || [];
    var html = list.map(function(x){ return app.ownForm===x.id ? ownFormHtml(x) : ownCardHtml(x); }).join('');
    if (app.ownForm==='new') html += ownFormHtml(null);
    else if (list.length<ST.STREAKS_MAX) html += '<div class="vital-btns own-add"><button class="vital-btn quiet" data-vital="own-new">+ New streak</button></div>';
    return html;
  }
  function ownCardHtml(x){
    var day = ST.cleanDay(x.id), k = ownKey(x);
    var html = '<div class="vital-card streak-card own-streak"><div class="vital-head">'+escapeHtml(x.name)+'</div>';
    if (day===null){
      html += '<p class="vital-sub">Set the first day of this run.</p>'+
        '<div class="vital-btns"><button class="vital-btn hot" data-vital="own-edit"'+k+'>Edit</button></div>';
    } else if (day<=0){
      html += '<div class="streak-big">RESTART // TOMORROW</div>'+
        '<p class="vital-sub">Stop for today. The '+plural(num(x.totalClean), 'day')+' behind you still count.</p>'+
        (ST.insight ? insightLine(ST.insight.resetLine({best:ST.cleanBest(x.id)}, 2), 'vital-sub reading') : '')+
        '<div class="vital-btns"><button class="vital-btn hot" data-vital="goto-urge">Urge? Decode it</button>'+
        '<button class="vital-btn quiet" data-vital="own-edit"'+k+'>Edit</button></div>';
    } else {
      html += runHtml(x.id);
      if (asking(x.id, 'lapse')){
        html += '<p class="vital-sub">Log a lapse today? The count restarts tomorrow. Days already done stay in your total and no XP is lost.</p>'+
          '<div class="vital-btns"><button class="vital-btn warn" data-vital="own-lapse-yes"'+k+'>Yes, log it</button>'+
          '<button class="vital-btn quiet" data-vital="own-lapse-no"'+k+'>Cancel</button></div>';
      } else {
        html += '<div class="vital-btns"><button class="vital-btn hot" data-vital="goto-urge">Urge? Decode it</button>'+
          '<button class="vital-btn quiet" data-vital="own-edit"'+k+'>Edit</button>'+
          '<button class="vital-btn quiet" data-vital="own-lapse-ask"'+k+'>Log a lapse</button></div>';
      }
    }
    return html+'</div>';
  }
  // A new streak's form (x null), or one's own: its name, its first day; Remove asked first.
  function ownFormHtml(x){
    var k = x ? ownKey(x) : '';
    var html = '<div class="vital-card streak-card own-streak"><div class="vital-head">'+(x ? escapeHtml(x.name) : 'New streak')+'</div>'+
      (x ? '' : '<p class="vital-sub">A name only you will see, and the first day of the run.</p>')+
      '<div class="vital-btns">'+
        '<input type="text" class="date-input name-input" id="own-name" maxlength="'+ST.STREAK_NAME_MAX+'" autocomplete="off" placeholder="Name" aria-label="Streak name" value="'+(x ? escapeHtml(x.name) : '')+'">'+
        '<input type="date" class="date-input" id="own-date" max="'+todayBox()+'" value="'+(boxDate(x && x.cleanSince) || todayBox())+'" aria-label="First day of the run">'+
      '</div>';
    if (x && asking(x.id, 'remove')){
      return html+'<p class="vital-sub">Remove '+escapeHtml(x.name)+'? Its count is gone for good. The XP it gave stays.</p>'+
        '<div class="vital-btns"><button class="vital-btn warn" data-vital="own-remove-yes"'+k+'>Yes, remove it</button>'+
        '<button class="vital-btn quiet" data-vital="own-remove-no"'+k+'>Keep it</button></div></div>';
    }
    return html+'<div class="vital-btns"><button class="vital-btn hot" data-vital="own-save"'+k+'>'+(x ? 'Save' : 'Start')+'</button>'+
      '<button class="vital-btn quiet" data-vital="own-cancel"'+k+'>Cancel</button>'+
      (x ? '<button class="vital-btn quiet" data-vital="own-remove-ask"'+k+'>Remove</button>' : '')+'</div></div>';
  }

  // ---------- the urge decoder ----------
  var OUTCOME_WORDS = {won:'ridden out', lapsed:'given in to'};
  var LATE_MS = 60*60*1000;           // over for an hour: the card says when the round started
  function attr(v){ return escapeHtml(String(v)); }
  // What's noted about the running urge (all of it optional, to fill the
  // wait): how strong, what set it off, what's being done about it, from
  // the player's own list (+ Mine adds one; Edit shows their ×).
  function urgeDetailsHtml(a){
    var copes = app.state.urges.copes || [], on = a.copes || [], editing = app.urgeCopeEdit, v = num(a.intensity);
    return '<div class="urge-details">'+
      '<div class="vital-row"><label for="urge-intensity">How strong</label>'+
        '<input type="range" class="urge-range" id="urge-intensity" min="0" max="10" step="1" value="'+v+'">'+
        '<span class="vital-val" id="urge-intensity-val">'+(v ? v : '–')+'</span></div>'+
      '<p class="urge-ask">What set it off?</p><div class="urge-chips">'+
        ST.URGE_TRIGGERS.map(function(t){
          return '<button class="chip" data-vital="urge-trigger" data-key="'+t+'" aria-pressed="'+(a.trigger===t)+'">'+escapeHtml(ST.URGE_TRIGGER_LABELS[t])+'</button>';
        }).join('')+'</div>'+
      '<p class="urge-ask">What I’m doing about it:</p><div class="urge-chips">'+
        copes.map(function(c){
          return editing
            ? '<button class="chip removable" data-vital="cope-remove" data-key="'+attr(c.id)+'" aria-label="Remove: '+attr(c.name)+'">'+escapeHtml(c.name)+' ×</button>'
            : '<button class="chip" data-vital="urge-cope" data-key="'+attr(c.id)+'" aria-pressed="'+(on.indexOf(c.id)!==-1)+'">'+escapeHtml(c.name)+'</button>';
        }).join('')+
        (!editing && copes.length<ST.COPES_MAX ? '<button class="chip add" data-vital="cope-add-open" aria-expanded="'+!!app.urgeCopeAdd+'">+ Mine</button>' : '')+
        (copes.length ? '<button class="chip quiet" data-vital="cope-edit">'+(editing ? 'Done' : 'Edit')+'</button>' : '')+
      '</div>'+
      (app.urgeCopeAdd && !editing ? '<div class="vital-btns cope-add"><input type="text" class="date-input name-input" id="cope-name" maxlength="'+ST.COPE_NAME_MAX+'" '+
          'autocomplete="off" placeholder="A way that works for you" aria-label="A new way to ride out an urge">'+
        '<button class="vital-btn" data-vital="cope-add">Add</button><button class="vital-btn quiet" data-vital="cope-add-close">Cancel</button></div>' : '')+
    '</div>';
  }
  // Just after an urge is logged: one line for next time (optional).
  function urgeNoteHtml(){
    var log = app.state.urges.log, entry = null, i;
    for (i=log.length-1;i>=0 && !entry;i--) if (log[i].t && log[i].t===app.urgeNote) entry = log[i];
    if (!entry) return '';
    var ask = ST.insight ? ST.insight.urgeReflection({need:entry.need, rounds:entry.rounds, seed:Math.floor(entry.t/60000)}) : null;
    return '<div class="urge-reflect">'+
      '<p class="urge-tip">'+(entry.outcome==='won' ? 'Ridden out. ' : 'Logged. It’s information, not a verdict. ')+'One line for next time? (optional)</p>'+
      '<div class="vital-btns"><input type="text" class="date-input name-input" id="urge-note" maxlength="'+ST.URGE_NOTE_MAX+'" autocomplete="off" '+
        'placeholder="'+attr(ask ? ask.text : 'What helped? What set it off?')+'" aria-label="A note about this urge">'+
      '<button class="vital-btn" data-vital="urge-note-save">Save</button><button class="vital-btn quiet" data-vital="urge-note-skip">Skip</button></div>'+
      (entry.outcome==='lapsed' && app.urgeUndo && app.urgeUndo.t===entry.t ?
        '<div class="vital-btns"><button class="vital-btn quiet" data-vital="urge-undo">Tapped by mistake? Undo</button></div>' : '')+
    '</div>';
  }
  // The decoder's last urges, newest first (unfolded on a tap).
  function urgeHistoryHtml(){
    var log = app.state.urges.log;
    if (!log.length) return '';
    var html = '<div class="vital-btns"><button class="vital-btn quiet" data-vital="urge-history" aria-expanded="'+!!app.urgeHistory+'">'+
      (app.urgeHistory ? 'Hide' : 'Last urges')+' ('+log.length+')</button></div>';
    if (!app.urgeHistory) return html;
    return html+'<ul class="urge-history">'+log.slice(-8).reverse().map(function(u){
      var cope = (u.copes || []).map(ST.copeById).filter(Boolean).map(function(c){ return c.name; }).join(', ');
      var bits = [shortDay(u.date)+(u.hour>=0 ? ' '+pad2(u.hour)+'h' : ''), u.need, u.intensity ? u.intensity+'/10' : '',
        u.trigger ? String(ST.URGE_TRIGGER_LABELS[u.trigger] || '').toLowerCase() : '', OUTCOME_WORDS[u.outcome]+(u.rounds>1 ? ' ('+u.rounds+' rounds)' : ''), cope];
      return '<li class="'+(u.outcome==='lapsed' ? 'lapsed' : '')+'">'+escapeHtml(bits.filter(Boolean).join(' · '))+
        (u.note ? '<span class="urge-history-note">“'+escapeHtml(u.note)+'”</span>' : '')+'</li>';
    }).join('')+'</ul>';
  }
  function urgeCardHtml(){
    var a = app.state.urges.active, left = ST.urgeLeft();
    var html = '<div class="vital-card urge-card" id="urge-card"><div class="vital-head">Urge decoder</div>';
    if (!a){
      var patterns = ST.insight ? ST.insight.urgePatterns() : [];
      html += (app.urgeNote ? urgeNoteHtml() : '')+
        (ST.insight ? insightLine(ST.insight.urgeHint(), 'vital-sub reading') : '')+
        '<p class="urge-tip">Before acting on it, name the real need. Right now I am mostly:</p>'+
        '<div class="urge-grid">'+
          ['HUNGRY','ANGRY','LONELY','TIRED'].map(function(n){
            return '<button class="vital-btn" data-vital="urge-start" data-key="'+n+'">'+n+'</button>';
          }).join('')+
          '<button class="vital-btn quiet wide" data-vital="urge-start" data-key="NONE">None of these</button>'+
        '</div>'+
        (ST.urgesToday()>0 ? '<p class="vital-sub">Ridden out today: '+ST.urgesToday()+' · SURVIVAL '+num(app.state.skills.SURVIVAL)+'</p>' : '')+
        (patterns.length ? '<div class="urge-patterns">'+patterns.map(function(m){ return insightLine(m, 'vital-sub reading'); }).join('')+'</div>' : '')+
        urgeHistoryHtml()+
        '<p class="vital-fine">'+HELP_LINE+'</p>';
    } else if (left>0){
      var said = ST.insight ? ST.insight.urgeMessages() : [];
      html += '<p class="urge-tip">'+escapeHtml(TIPS[a.need] || TIPS.NONE)+'</p>'+
        '<div class="urge-clock" id="urge-clock" role="timer" aria-label="Time left">'+clockText(left)+'</div>'+
        '<p class="vital-sub urge-note">'+(num(a.rounds)>1 ? 'Round '+num(a.rounds)+'. ' : '')+'Leave this room. Come back at zero.</p>'+
        (said.length ? '<div class="urge-angle" aria-live="polite">'+insightLine(said[num(app.urgeAngle) % said.length], 'urge-said')+'</div>' : '')+
        '<div class="vital-btns">'+(said.length>1 ? '<button class="vital-btn" data-vital="urge-angle">Another angle</button>' : '')+
          '<button class="vital-btn quiet" data-vital="urge-lapse">I gave in</button>'+
          '<button class="vital-btn quiet" data-vital="urge-cancel">Cancel</button></div>'+
        urgeDetailsHtml(a)+
        '<p class="vital-fine">'+HELP_LINE+'</p>';
    } else {
      var paid = ST.urgePays(), started = new Date(num(a.start));
      html += '<div class="urge-clock">00:00</div>'+
        '<p class="urge-tip">Twenty minutes down. Did it pass?</p>'+
        // Back long after zero: when it was, which is when it's logged.
        (Date.now()-num(a.start)-ST.URGE_MS>LATE_MS ? '<p class="vital-sub urge-when">This round started '+escapeHtml(shortDay(ST.dayStr(started)))+' at '+
          pad2(started.getHours())+':'+pad2(started.getMinutes())+'; it’s logged then.</p>' : '')+
        (ST.insight ? insightLine(ST.insight.urgeReflection(), 'vital-sub reading') : '')+
        '<div class="urge-grid">'+
          '<button class="vital-btn hot" data-vital="urge-won">Rode it out'+
            (paid ? '<span class="btn-sub">+'+ST.URGE_XP+' XP · +1 SURVIVAL</span>' : '')+'</button>'+
          '<button class="vital-btn" data-vital="urge-again">Still strong</button>'+
          '<button class="vital-btn quiet wide" data-vital="urge-lapse">I gave in</button>'+
        '</div>'+
        urgeDetailsHtml(a)+
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
  // The day's two counters, a tap on + each time, any time of the day:
  // on the check-in card, folded or not.
  function countsHtml(e){
    return countRowHtml('N', 'RADS // type N', e ? e.radN : 0)+
      countRowHtml('T', 'RADS // type T', e ? e.radT : 0)+
      '<p class="vital-fine count-hint">Tap + each time, any time of the day. It saves on its own.</p>';
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
  var shownDay = null;          // the VITALS day on screen (it starts at 4:00, ST.vitalsDayStr)
  function render(){
    var tab = el('tab-vitals');
    if (!tab || !app.state) return;
    shownDay = ST.vitalsDayStr();
    var trials = view()==='trials';
    tab.innerHTML = subTabsHtml(trials)+(trials ? ST.trials.html() : checkInViewHtml());
    if (trials) ST.trials.drawn();
    syncTicker();
    syncAlarm();
    markTab();
  }

  // ---------- the morning ----------
  var CRAVING_HIGH = 6;
  var BRIEF = ['energy', 'sleep', 'craving'];       // the levels in the one-line summaries
  // A craving at 6 or more: today's check-in's, or else yesterday's.
  function cravingHigh(){
    var e = ST.vitalsToday(false), last = ST.lastCheckIn();
    if (e && e.logged) return num(e.craving)>=CRAVING_HIGH;
    return !!last && last.ago===1 && num(last.craving)>=CRAVING_HIGH;
  }
  // A streak's next milestone when it's reached tomorrow, else null (`id`:
  // one of the player's own, none: the chem-free one).
  function milestoneTomorrow(id){
    var day = ST.cleanDay(id), next = ST.nextCleanMilestone(id);
    return day!==null && day>0 && next && next.days-ST.cleanFullDays(id)===1 ? next : null;
  }
  function anyMilestoneTomorrow(){
    return !!milestoneTomorrow() || (app.state.streaks || []).some(function(x){ return !!milestoneTomorrow(x.id); });
  }
  // The CHECK-IN view's three cards, the one that matters most today first:
  // the urge decoder (a timer, or a high craving), the streaks (a milestone
  // tomorrow, on any of them), else the check-in; the others after it in their usual order
  // (check-in, streak, urge). They're always all there.
  function order(){
    var first = app.state.urges.active || cravingHigh() ? 'urge' : anyMilestoneTomorrow() ? 'streak' : 'checkin';
    return [first].concat(['checkin', 'streak', 'urge'].filter(function(b){ return b!==first; }));
  }
  // "INT 4 · TRAIN 150/300", as on STATUS ("INT 10 · MAX" at 10).
  function trainText(stat){
    var v = num(app.state.stats[stat]);
    return stat+' '+v+' · '+(v>=10 ? 'MAX' : 'TRAIN '+num(app.state.statTrain[stat])+'/'+ST.TRAIN_PER_POINT);
  }
  function briefText(e){
    return BRIEF.map(function(k){ return LABELS[k].toLowerCase()+' '+num(e[k]); }).join(' · ');
  }
  // What the logged check-in says (js/insight.js readings(): STATUS, TREND,
  // PRIORITY and ACTION, PATTERN), each line only when the data says it.
  // A craving to watch gets a way to the decoder, on the same screen.
  function readingsHtml(){
    var list = ST.insight ? ST.insight.readings() : [];
    if (!list.length) return '';
    return '<div class="readings">'+list.map(function(r){
      var line = insightLine(r, 'reading');
      return r.tag==='ACTION' && r.key==='craving'
        ? line.replace(/<\/p>$/, ' <button class="vital-btn quiet inline-go" data-vital="goto-urge">Decoder</button></p>') : line;
    }).join('')+'</div>';
  }
  // Where the day stands, in one line, once the check-in is logged: the
  // training, the dailies and trials left, the chem-free day.
  function fieldReport(){
    var s = app.state, out = [];
    out.push(trainText('INT')+'.');
    var daily = s.quests.daily, left = daily.filter(function(d){ return !ST.dailyDoneToday(d); }).length;
    if (daily.length) out.push(left ? left+' dail'+(left===1 ? 'y' : 'ies')+' left.' : 'Dailies done.');
    var due = ST.trialsDue ? ST.trialsDue() : 0;
    if (due) out.push(plural(due, 'trial')+' due.');
    var day = ST.cleanDay();
    if (day!==null){
      var next = ST.nextCleanMilestone();
      out.push(day<=0 ? 'Chem-free restarts tomorrow.' :
        'Chem-free day '+day+(next ? ' ('+(next.days-ST.cleanFullDays())+' to '+next.days+')' : '')+'.');
    }
    return out.join(' ');
  }
  // What to do next: a trial due (the first on the list), else the daily
  // quest left longest (not done today); null for none.
  function nextStep(){
    var t = ST.trialList ? ST.trialList().filter(function(x){ return ST.trialDue(x.id); })[0] : null;
    if (t) return {kind:'trial', id:t.id, name:t.name};
    var left = app.state.quests.daily.filter(function(d){ return !ST.dailyDoneToday(d); });
    if (!left.length) return null;
    function age(d){ var n = ST.daysSince(d.lastDate); return n===null ? Infinity : n; }
    var d = left.reduce(function(a, b){ return age(b)>age(a) ? b : a; });
    return {kind:'daily', id:d.id, name:d.name || d.questName};
  }

  // ---------- the CHECK-IN view ----------
  function checkInViewHtml(){
    var cards = {urge:urgeCardHtml, streak:function(){ return streakCardHtml()+ownStreaksHtml(); }, checkin:checkInCardHtml};
    return order().map(function(c){ return cards[c](); }).join('')+
      '<div class="panel-title">Last 7 entries</div>'+tableHtml();
  }
  function checkInCardHtml(){
    var e = ST.vitalsToday(false), last = ST.lastCheckIn();
    var html = '<div class="panel-title">Today’s check-in</div>';
    if (e && e.logged && !app.vitalsEdit){
      var step = nextStep();
      return html+'<div class="checkin-done">'+
        '<div class="checkin-line">CHECK-IN · DONE ✓ · '+briefText(e)+'</div>'+
        countsHtml(e)+
        readingsHtml()+
        '<p class="field-report"><span class="field-tag">FIELD REPORT //</span> '+escapeHtml(fieldReport())+'</p>'+
        (step ? '<div class="next-step"><span class="next-text">NEXT: '+escapeHtml(step.name)+
            ' <span class="next-kind">'+(step.kind==='trial' ? 'trial due' : 'daily')+'</span></span>'+
            '<button class="vital-btn hot" data-vital="go" data-key="'+step.kind+'" data-id="'+escapeHtml(step.id)+'">Go</button></div>' : '')+
        '<div class="vital-btns"><button class="vital-btn quiet" data-vital="checkin-edit">Edit check-in</button></div>'+
      '</div>';
    }
    if (last) html += '<p class="vital-sub yesterday">'+(last.ago===1 ? 'Yesterday' : 'Last check-in, '+escapeHtml(shortDay(last.date)))+
      ' · '+briefText(last)+'</p>';
    ST.VITAL_KEYS.forEach(function(k){
      var v = e ? num(e[k]) : last ? clamp(Math.round(num(last[k])), 0, 10) : 5;
      html += '<div class="vital-row">'+
        '<label for="vr-'+k+'">'+LABELS[k]+'</label>'+
        '<input type="range" class="vital-range" id="vr-'+k+'" data-key="'+k+'" min="0" max="10" step="1" value="'+v+'" aria-describedby="vs-'+k+'">'+
        '<span class="vital-val" id="vv-'+k+'">'+v+'</span>'+
        '<span class="vital-scale" id="vs-'+k+'"><span>0 '+SCALE[k][0]+'</span><span>'+SCALE[k][1]+' 10</span></span>'+
      '</div>';
    });
    html += '<div class="count-row"><label for="pulse-input">Resting pulse, bpm</label>'+
        '<input type="number" class="pulse-input" id="pulse-input" inputmode="numeric" min="'+ST.PULSE_MIN+'" max="'+ST.PULSE_MAX+'" placeholder="--" value="'+(e && e.pulse ? num(e.pulse) : '')+'"></div>'+
      countsHtml(e)+
      '<div class="vital-btns">'+
        (e && e.logged
          ? '<button class="vital-btn" data-vital="checkin-fold">Done ✓</button><span class="vital-sub inline">Changes save on their own.</span>'
          : '<button class="vital-btn hot" data-vital="vitals-log">Log check-in +'+ST.VITALS_XP+' XP</button>')+
      '</div>'+
      '<p class="vital-sub train-line">Trains '+trainText('INT')+'</p>'+
      '<p class="vital-fine">Each level is how you are now; Sleep is how last night went. Take the pulse before getting up, counted over 60 seconds.</p>';
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
    document.querySelectorAll('.tab-btn[data-tab]').forEach(function(b){
      var off = locked(b.getAttribute('data-tab'));
      b.classList.toggle('locked', off);
      if (off) b.setAttribute('aria-disabled', 'true');
      else b.removeAttribute('aria-disabled');
    });
    var key = document.querySelector('.tab-btn[data-tab="vitals"]');
    if (!key) return;
    var a = alertState();
    if (a){ key.setAttribute('data-alert', a); key.setAttribute('aria-label', ALERTS[a]); }
    else { key.removeAttribute('data-alert'); key.removeAttribute('aria-label'); }
  }

  // ---------- check-in first ----------
  // Until the day's check-in is logged, QUESTS, ITEMS, MAP and LOG wait:
  // their keys are dimmed and a tap says why (events.js asks locked()).
  // STATUS and VITALS stay open, the urge decoder too. A setting of this
  // device (Settings: Check-in first), on unless turned off; off when the
  // device's storage can't be read (the choice couldn't be changed).
  var LOCK_KEY = 'status_terminal_checkin_first';   // '0': off on this device
  var LOCKED_TABS = ['quests', 'items', 'map', 'log'];
  function lockOn(){ try{ return localStorage.getItem(LOCK_KEY)!=='0'; }catch(e){ return false; } }
  function locked(tab){
    if (LOCKED_TABS.indexOf(tab)===-1 || !app.state || !lockOn()) return false;
    var e = ST.vitalsToday(false);
    return !(e && e.logged);
  }
  function refuse(){
    sound('error');
    ST.render.showNotice('Check-in first: VITALS');
  }
  function showLock(){
    var b = el('checkin-first-btn');
    if (!b) return;
    var on = lockOn();
    b.textContent = 'Check-in first: '+(on ? 'on' : 'off');
    b.setAttribute('aria-pressed', String(on));
  }
  function toggleLock(){
    try{
      if (lockOn()) localStorage.setItem(LOCK_KEY, '0');
      else localStorage.removeItem(LOCK_KEY);
    }catch(e){}
    showLock();
    markTab();
  }

  // ---------- taps ----------
  function refocus(sel){
    var b = el('tab-vitals') && el('tab-vitals').querySelector(sel);
    if (b) b.focus();
  }
  // A new way of riding urges out, from its box: taken on for the running urge too.
  function addCope(){
    var box = el('cope-name');
    if (!box || !box.value.trim()){ if (box) box.focus(); return; }
    var c = ST.addCope(box.value);
    if (!c){ ST.render.showNotice('Already on the list, or the list is full'); box.focus(); return; }
    if (app.state.urges.active) ST.setUrgeDetail('cope', c.id);
    app.urgeCopeAdd = false;
    save(true);
    redrawUrge();
    refocus('[data-vital="urge-cope"][data-key="'+c.id+'"]');
  }
  function redraw(focus){
    render();
    var btn = focus && el('tab-vitals').querySelector(focus);
    if (btn) btn.focus();
  }
  // A reward's toasts: its XP and skills, a level-up, the stats it trained.
  function showReward(r){
    ST.render.showXpToast(num(r.xp), r.skillGains);
    if (r.leveled) ST.render.showLevelUp();
    (r.trained || []).forEach(function(stat){ ST.render.showTrained(stat); });
    ST.render.renderHeader();
  }
  var ACTIONS = {
    'streak-edit': function(){
      app.streakEdit = !app.streakEdit;
      app.confirmLapse = false;
      redraw(app.streakEdit ? '#streak-date' : '[data-vital="streak-edit"]');
    },
    'streak-set': function(){
      var input = el('streak-date');
      if (!input || !ST.setCleanStart(input.value)){ if (input) input.focus(); return; }
      app.streakEdit = false;
      redraw('[data-vital="goto-urge"]');
      save(true);                 // the milestones it reached are paid just after (events.js)
    },
    'lapse-ask': function(){ app.confirmLapse = true; redraw('[data-vital="lapse-no"]'); },
    'lapse-no': function(){ app.confirmLapse = false; redraw('[data-vital="lapse-ask"]'); },
    'lapse-yes': function(){
      app.confirmLapse = false;
      if (ST.logLapse()) save(true);
      redraw('[data-vital="goto-urge"]');
    },
    // The player's own streaks: a new one, one edited (name, first day), a lapse, a removal.
    'own-new': function(){ app.ownForm = 'new'; app.ownConfirm = null; redraw('#own-name'); },
    'own-edit': function(btn, id){ if (!own(id)) return; app.ownForm = id; app.ownConfirm = null; redraw('#own-name'); },
    'own-cancel': function(btn, id){
      app.ownForm = null; app.ownConfirm = null;
      redraw(id ? '[data-vital="own-edit"][data-key="'+id+'"]' : '[data-vital="own-new"]');
    },
    'own-save': function(btn, id){
      var name = el('own-name'), date = el('own-date'), x = own(id);
      if (!name || !date || (id && !x)) return;
      if (!name.value.trim()){ name.focus(); return; }
      if (!x){
        x = ST.addStreak(name.value, date.value);
        if (!x){ date.focus(); return; }
      } else {
        // The first day only when it was changed (after a lapse it's tomorrow, and stays so).
        if (date.value!==boxDate(x.cleanSince) && !ST.setCleanStart(date.value, x.id)){ date.focus(); return; }
        ST.renameStreak(x.id, name.value);
      }
      app.ownForm = null;
      redraw('[data-vital="own-edit"][data-key="'+x.id+'"]');
      save(true);                 // the milestones it reached are paid just after (events.js)
    },
    'own-lapse-ask': function(btn, id){ if (!own(id)) return; app.ownConfirm = {id:id, what:'lapse'}; redraw('[data-vital="own-lapse-no"]'); },
    'own-lapse-no': function(btn, id){ app.ownConfirm = null; redraw('[data-vital="own-lapse-ask"][data-key="'+id+'"]'); },
    'own-lapse-yes': function(btn, id){
      app.ownConfirm = null;
      if (own(id) && ST.logLapse(id)) save(true);
      redraw('[data-vital="own-edit"][data-key="'+id+'"]');
    },
    'own-remove-ask': function(btn, id){ if (!own(id)) return; app.ownConfirm = {id:id, what:'remove'}; redraw('[data-vital="own-remove-no"]'); },
    'own-remove-no': function(){ app.ownConfirm = null; redraw('#own-name'); },
    'own-remove-yes': function(btn, id){
      app.ownConfirm = null; app.ownForm = null;
      if (own(id) && ST.removeStreak(id)) save(true);
      redraw('[data-vital="own-new"]');
    },
    // The streak card's "Urge? Decode it": the decoder, on the same screen.
    'goto-urge': function(){
      if (view()!=='checkin'){ app.vitalsView = 'checkin'; render(); }
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
    // A timer running puts the decoder first (order()): the whole view is drawn again.
    'urge-start': function(btn, key){
      ST.startUrge(key);
      app.urgeAngle = 0;
      redraw('[data-vital="urge-cancel"]');
      var card = el('urge-card');
      if (card && card.scrollIntoView) card.scrollIntoView({block:'start', behavior:'auto'});
      save(true);
    },
    'urge-again': function(){ if (ST.urgeAgain()){ app.urgeAngle = 0; redrawUrge(); save(true); } },
    // The next message of the round (js/insight.js urgeMessages()), none twice until all have shown.
    // Only the message changes, in place: its aria-live box stays, so a screen reader reads it out.
    'urge-angle': function(){
      app.urgeAngle = num(app.urgeAngle) + 1;
      var box = document.querySelector('#urge-card .urge-angle'), said = ST.insight ? ST.insight.urgeMessages() : [];
      if (box && said.length){ box.innerHTML = insightLine(said[app.urgeAngle % said.length], 'urge-said'); return; }
      redrawUrge();
      var b = document.querySelector('[data-vital="urge-angle"]');
      if (b) b.focus();
    },
    'urge-cancel': function(){ ST.cancelUrge(); app.urgeCopeAdd = false; render(); save(); },
    // A reward is saved first: drawing the screen afterwards can't lose it.
    'urge-won': function(){
      var r = ST.urgeWon();
      if (!r) return;
      save(true);
      if (r.capped) ST.render.showNotice('Logged — today’s XP for urges is used up');
      else { sound('complete'); showReward(r); }
      app.urgeNote = r.entry ? r.entry.t : null;
      app.urgeCopeAdd = false;
      redraw('#urge-note');
      ST.render.renderStatus();     // the Lifetime count, the skill
    },
    // Given in to: logged as it was (no XP, nothing taken away), then the note.
    'urge-lapse': function(){
      var e = ST.urgeLapsed();
      if (!e) return;
      save(true);
      app.urgeNote = e.t;
      app.urgeCopeAdd = false;
      redraw('#urge-note');
      ST.render.showNotice('Logged. No XP lost, nothing reset.');
      ST.render.renderStatus();     // the last 7 days
    },
    // What's noted while the timer runs: only the urge card is drawn again.
    'urge-trigger': function(btn, key){
      var a = ST.setUrgeDetail('trigger', key);
      if (!a) return;
      // The trigger just noted: what to do about it shows at once.
      if (a.trigger && ST.insight){
        var i = ST.insight.urgeMessages().map(function(m){ return m.id; }).indexOf('ctx-trigger');
        if (i!==-1) app.urgeAngle = i;
      }
      redrawUrge(); refocus('[data-vital="urge-trigger"][data-key="'+key+'"]'); save();
    },
    'urge-cope': function(btn, key){
      if (!ST.setUrgeDetail('cope', key)) return;
      redrawUrge(); refocus('[data-vital="urge-cope"][data-key="'+key+'"]'); save();
    },
    'cope-add-open': function(){ app.urgeCopeAdd = true; redrawUrge(); refocus('#cope-name'); },
    'cope-add-close': function(){ app.urgeCopeAdd = false; redrawUrge(); refocus('[data-vital="cope-add-open"]'); },
    'cope-add': function(){ addCope(); },
    'cope-edit': function(){ app.urgeCopeEdit = !app.urgeCopeEdit; app.urgeCopeAdd = false; redrawUrge(); refocus('[data-vital="cope-edit"]'); },
    'cope-remove': function(btn, key){
      if (ST.removeCope(key)) save(true);
      if (!(app.state.urges.copes || []).length) app.urgeCopeEdit = false;
      redrawUrge(); refocus('[data-vital="cope-edit"]');
    },
    'urge-note-save': function(){
      var box = el('urge-note');
      if (box && box.value.trim() && ST.noteUrge(app.urgeNote, box.value)) save(true);
      app.urgeNote = null;
      redraw('[data-vital="urge-start"]');
    },
    'urge-note-skip': function(){ app.urgeNote = null; redraw('[data-vital="urge-start"]'); },
    // The lapse taken back: the urge runs again where it was.
    'urge-undo': function(){
      app.urgeNote = null;
      if (ST.undoLapse()){ save(true); ST.render.showNotice('Taken back. The urge is still running.'); }
      redraw('[data-vital="urge-angle"]');
      ST.render.renderStatus();
    },
    'urge-history': function(){ app.urgeHistory = !app.urgeHistory; redrawUrge(); refocus('[data-vital="urge-history"]'); },
    'rad': function(btn, key){
      var dir = parseInt(btn.getAttribute('data-dir') || '0', 10);
      ST.stepRads(key, dir);
      redraw('[data-vital="rad"][data-key="'+key+'"][data-dir="'+dir+'"]');
      save();
    },
    'vitals-log': function(){
      // A new VITALS day began (4:00) since the form was drawn: show the new
      // day's form first, rather than log values the screen didn't show.
      if (newVitalsDay()){
        render();
        ST.render.showNotice('A new day started at 4:00. Check the values, then log.');
        return;
      }
      var r = ST.logVitals();
      if (!r) return;
      save(true);
      sound('complete');
      showReward(r);
      app.vitalsEdit = false;
      redraw('[data-vital="go"], [data-vital="checkin-edit"]');    // folded: the report, the next step
      ST.render.renderStatus();
    },
    // The logged check-in, opened again to change it, and folded back.
    'checkin-edit': function(){ app.vitalsEdit = true; redraw('.vital-range'); },
    'checkin-fold': function(){ app.vitalsEdit = false; redraw('[data-vital="checkin-edit"]'); },
    // The next step: the trial opened on TRIALS, or the QUESTS tab.
    'go': function(btn, key){
      if (key==='trial'){
        app.vitalsView = 'trials';
        app.trialOpen = btn.getAttribute('data-id');
        app.trialConfirm = null;
        redraw('[data-trial="start"], [data-trial="count"]');
        return;
      }
      stopTicker();
      ST.render.switchTab('quests');
      if (ST.mascot) ST.mascot.onTab('quests');
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
    if (app.state && t.id==='urge-intensity'){
      var a = ST.setUrgeDetail('intensity', t.value), shown = el('urge-intensity-val');
      if (a && shown) shown.textContent = a.intensity ? a.intensity : '–';
      save();
      return;
    }
    if (!app.state || !t.classList || !t.classList.contains('vital-range')) return;
    var v = ST.setVital(t.getAttribute('data-key'), t.value);
    if (v===null) return;
    var label = el('vv-'+t.getAttribute('data-key'));
    if (label) label.textContent = v;
    save();
  }
  // Enter in a box: what its button does.
  function onKey(e){
    if (e.key!=='Enter' || !app.state) return;
    if (e.target.id==='cope-name'){ e.preventDefault(); addCope(); }
    else if (e.target.id==='urge-note'){ e.preventDefault(); ACTIONS['urge-note-save'](); }
  }
  function onChange(e){
    if (!app.state || e.target.id!=='pulse-input') return;
    var kept = ST.setPulse(e.target.value);
    e.target.value = kept===null ? '' : kept;
    save();
  }

  // A new VITALS day since the screen was drawn (4:00): drawn again, unless
  // something on it is being typed (the next check does it). main.js asks
  // every minute and when the app comes back.
  function newVitalsDay(){ return shownDay!==null && shownDay!==ST.vitalsDayStr(); }
  function refreshIfNewDay(){
    if (!app.state || !newVitalsDay()) return;
    var typing = document.activeElement;
    if (typing && /^(INPUT|SELECT|TEXTAREA)$/.test(typing.tagName) && typing.closest && typing.closest('#tab-vitals')) return;
    render();
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
    document.body.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', function(){
      if (document.visibilityState==='hidden'){ stop(); return; }
      if (!app.state) return;
      if (urgeShown() && app.state.urges.active) redrawUrge();     // time went by
      else { syncAlarm(); markTab(); }                        // a round may have ended meanwhile
    });
    showLock();
    syncAlarm();
    markTab();
  }

  ST.vitals = {
    init: init, render: render, onTab: onTab, stop: stop, markTab: markTab, refreshIfNewDay: refreshIfNewDay,
    locked: locked, refuse: refuse, toggleLock: toggleLock,
    order: order, fieldReport: fieldReport, nextStep: nextStep, readingsHtml: readingsHtml,
    clockText: clockText, boxDate: boxDate, alertState: alertState
  };
})(window.StatusTerminal);
