/**
 * Rendering — builds each tab's HTML from ST.app.state. Nothing here changes
 * the state document; user actions live in events.js.
 */
(function(ST){
  'use strict';

  var el = ST.el, clamp = ST.clamp, commas = ST.commas, money = ST.money, escapeHtml = ST.escapeHtml, todayStr = ST.todayStr;
  var STAT_KEYS = ST.STAT_KEYS, STAT_LABELS = ST.STAT_LABELS, SKILL_KEYS = ST.SKILL_KEYS, CATS = ST.CATS, CAD_PER_CAP = ST.CAD_PER_CAP,
      QUEST_NAME_MAX = ST.QUEST_NAME_MAX;
  var app = ST.app;

  function renderHeader(){
    var state = app.state;
    el('hdr-date').textContent = new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'});
    el('hdr-level').textContent = (state.level<10?'0':'')+state.level;
    var pct = clamp((state.xp/state.xpToNext)*100,0,100);
    el('hdr-xp-fill').style.width = pct+'%';
    el('hdr-xp-text').textContent = commas(state.xp)+' / '+commas(state.xpToNext)+' XP';
  }

  function statRowHtml(key){
    var value = app.state.stats[key];
    var segs='';
    for (var i=1;i<=10;i++){ segs += '<span class="seg'+(i<=value?' filled':'')+'"></span>'; }
    return '<div class="stat-row">'+
      '<div class="stat-label">'+STAT_LABELS[key]+'</div>'+
      '<div class="seg-bar">'+segs+'</div>'+
      '<div class="stat-value">'+value+'</div>'+
    '</div>';
  }

  function skillRowHtml(key){
    var value = app.state.skills[key];
    var pct = clamp(value,0,100);
    return '<div class="skill-row">'+
      '<div class="skill-label">'+key+'</div>'+
      '<div class="skill-bar"><div class="skill-fill" style="width:'+pct+'%"></div></div>'+
      '<div class="skill-value">'+value+'</div>'+
      '<div class="stepper">'+
        '<button class="step-btn" data-action="skill" data-key="'+key+'" data-dir="-1" aria-label="Decrease '+key+'">-</button>'+
        '<button class="step-btn" data-action="skill" data-key="'+key+'" data-dir="1" aria-label="Increase '+key+'">+</button>'+
      '</div>'+
    '</div>';
  }

  function renderStatus(){
    var state = app.state;
    var pts = state.unspentSpecialPoints||0;
    var html = '';
    // Level-up points are the only way S.P.E.C.I.A.L. goes up. Tapping a
    // stat asks first, inside the banner; only "Yes" spends the point.
    if (pts>0){
      var asking = app.confirmSpecial;
      html += '<div class="assign-banner">'+
        '<div class="assign-label">&#9733; '+pts+' SPECIAL point'+(pts>1?'s':'')+' to assign</div>'+
        (asking ?
          '<div class="assign-buttons">'+
            '<span class="assign-question">Add 1 point to '+STAT_LABELS[asking]+'?</span>'+
            '<button class="assign-btn" data-action="special-yes">Yes</button>'+
            '<button class="assign-btn assign-cancel" data-action="special-no">Cancel</button>'+
          '</div>' :
          '<div class="assign-buttons">'+
            STAT_KEYS.map(function(k){
              var maxed = state.stats[k]>=10;
              return '<button class="assign-btn" data-action="special-assign" data-key="'+k+'"'+(maxed?' disabled':'')+'>'+STAT_LABELS[k]+'</button>';
            }).join('')+
          '</div>')+
      '</div>';
    }
    html += '<div class="panel-title">S.P.E.C.I.A.L.</div>';
    STAT_KEYS.forEach(function(k){ html += statRowHtml(k); });
    html += '<div class="panel-title">Skills</div>';
    SKILL_KEYS.forEach(function(k){ html += skillRowHtml(k); });
    html += '<div class="panel-title">Lifetime</div><div class="stats-grid">'+
      '<div class="stats-cell"><div class="stats-num">'+commas(state.lifetimeXp||0)+'</div><div class="stats-label">Total XP earned</div></div>'+
      '<div class="stats-cell"><div class="stats-num">'+state.quests.side.filter(function(q){return q.done;}).length+'</div><div class="stats-label">Side quests done</div></div>'+
      '<div class="stats-cell"><div class="stats-num">'+commas(ST.logEntryCount())+'</div><div class="stats-label">Log entries</div></div>'+
    '</div>';
    el('tab-status').innerHTML = html;
  }

  // A quest's name, which is tapped to rename it. A quest without one (saved
  // before quest names existed) gets a small "+ name" link in its place.
  function questTitleHtml(kind, q){
    var ref = ' data-action="rename" data-kind="'+kind+'"'+(q.id ? ' data-id="'+q.id+'"' : '');
    return q.questName
      ? '<button class="quest-title"'+ref+' title="Rename">'+escapeHtml(q.questName)+'</button>'
      : '<button class="add-name"'+ref+'>+ name</button>';
  }
  // Side and daily quests: the name on top, the objective under it.
  function questTextHtml(kind, q){
    return '<div class="quest-text'+(q.questName?' has-name':'')+'">'+
      questTitleHtml(kind, q)+
      '<span class="quest-name">'+escapeHtml(q.name)+'</span>'+
    '</div>';
  }
  // Puts a quest's name (or its "+ name" link) back where its rename box was
  // and returns it. Only that spot changes, so the tap that ended the rename
  // still lands on whatever it was aimed at.
  function swapQuestTitle(input, kind, q){
    if (!input.parentNode) return null;
    var box = input.closest('.quest-text, .main-quest-card');
    var holder = document.createElement('div');
    holder.innerHTML = questTitleHtml(kind, q);
    var btn = holder.firstChild;
    input.replaceWith(btn);
    if (box) box.classList.toggle('has-name', !!q.questName);
    return btn;
  }

  // A streak quest's progress: "Day 3 / 7", and a check-in button usable once a day.
  function streakRowHtml(m){
    var days = ST.currentStreak(m);
    var done = m.completed || ST.checkedInToday(m);
    return '<div class="streak-row">'+
      '<button class="complete-btn'+(done?' done':'')+'" data-action="main-checkin" data-id="'+m.id+'" '+(done?'disabled':'')+' aria-label="Check in for today">'+(done?'&#10003;':'&#9675;')+'</button>'+
      '<span class="streak-days">Day '+days+' / '+m.streakTarget+'</span>'+
      '<div class="streak-bar"><div class="streak-fill" style="width:'+clamp(days/m.streakTarget*100,0,100)+'%"></div></div>'+
    '</div>';
  }
  function streakNote(m){
    if (ST.checkedInToday(m)) return 'Checked in today';
    if (m.streakDays>0 && ST.currentStreak(m)===0) return 'Missed a day, streak reset';
    return 'Check in once a day';
  }

  function mainQuestHtml(m){
    var bonus = m.bonus || [];
    var streak = m.progressType==='streak';
    var html = '<div class="main-quest-card'+(m.questName?' has-name':'')+(m.completed?' completed':'')+'">'+
      '<div class="main-quest-head">'+
        questTitleHtml('main', m)+
        (m.completed ? '<span class="badge">Completed</span>' : '')+
        '<button class="remove-btn" data-action="main-remove" data-id="'+m.id+'" aria-label="Remove main quest">&times;</button>'+
      '</div>'+
      '<input type="text" class="main-title-input" data-id="'+m.id+'" maxlength="60" value="'+escapeHtml(m.title)+'" aria-label="Objective">'+
      (streak ? streakRowHtml(m) :
        '<div class="progress-row">'+
          '<input type="range" min="0" max="100" value="'+m.progress+'" class="main-progress-input" data-id="'+m.id+'" aria-label="Progress">'+
          '<span class="progress-pct">'+m.progress+'%</span>'+
        '</div>')+
      '<div class="main-xp-note">'+(streak && !m.completed ? '<span>'+streakNote(m)+' ·</span> ' : '')+
        '<span>'+(m.completed?'Completed — ':'On completion: ')+'+'+(m.xp||0)+' XP</span></div>';
    if (bonus.length){
      html += '<div class="bonus-label">Bonus objectives</div><div class="bonus-list">';
      bonus.forEach(function(b){
        html += '<div class="bonus-item'+(b.done?' done':'')+'">'+
          '<button class="complete-btn'+(b.done?' done':'')+'" data-action="bonus-toggle" data-quest="'+m.id+'" data-id="'+b.id+'" '+(b.done?'disabled':'')+' aria-label="Toggle">'+(b.done?'&#10003;':'&#9675;')+'</button>'+
          '<span class="quest-name">'+escapeHtml(b.name)+'</span>'+
          '<span class="quest-xp">+'+(b.xp||0)+' XP</span>'+
        '</div>';
      });
      html += '</div>';
    }
    // Removing a main quest asks first, like Reset.
    if (app.confirmRemoveMain===m.id){
      html += '<div class="card-confirm">'+
        '<span class="reset-warning">Remove this quest?</span>'+
        '<button class="confirm-yes" data-action="main-remove-yes" data-id="'+m.id+'">Yes, remove</button>'+
        '<button data-action="main-remove-no">Cancel</button>'+
      '</div>';
    }
    return html+'</div>';
  }

  var questsDay = null;       // the date the quests were last drawn for
  function renderQuests(){
    // Rebuilding the list would drop a rename still in progress: save it first.
    if (app.finishRename) app.finishRename();
    var state = app.state;
    questsDay = todayStr();
    var html = '<div class="panel-title">Main Quests</div>';
    if (state.quests.mains.length===0){
      html += '<div class="empty-note">No main quests yet — add one below.</div>';
    }
    state.quests.mains.forEach(function(m){ html += mainQuestHtml(m); });
    html += '<div class="add-row">'+
      '<input type="text" class="field-full" id="new-main-questname" placeholder="Quest name" maxlength="'+QUEST_NAME_MAX+'" required aria-label="Quest name">'+
      '<input type="text" id="new-main-objective" placeholder="Objective..." maxlength="60" required aria-label="Objective">'+
      '<input type="number" id="new-main-xp" value="1000" min="10" max="5000" aria-label="XP reward">'+
      '<select id="new-main-type" aria-label="Progress type">'+
        '<option value="percent">Percentage</option>'+
        '<option value="streak">Day streak</option>'+
      '</select>'+
      '<label class="days-field" id="new-main-days-field" hidden>'+
        '<input type="number" id="new-main-days" value="7" min="1" max="'+ST.STREAK_MAX_DAYS+'" aria-label="Target days"><span>days</span>'+
      '</label>'+
      '<button id="add-main-btn">Add</button>'+
    '</div>';

    html += '<div class="panel-title">Side Quests</div>';
    var active = state.quests.side.filter(function(q){ return !q.done; });
    if (active.length===0){
      html += '<div class="empty-note">No side quests yet — add one below.</div>';
    } else {
      html += '<div class="quest-list">';
      active.forEach(function(q){
        html += '<div class="quest-item">'+
          '<button class="complete-btn" data-action="quest-complete" data-id="'+q.id+'" aria-label="Complete">&#10003;</button>'+
          questTextHtml('side', q)+
          '<span class="quest-xp">+'+q.xp+' XP</span>'+
          '<button class="remove-btn" data-action="quest-remove" data-id="'+q.id+'" aria-label="Remove">&times;</button>'+
        '</div>';
      });
      html += '</div>';
    }
    html += '<div class="add-row">'+
      '<input type="text" class="field-full" id="new-quest-questname" placeholder="Quest name" maxlength="'+QUEST_NAME_MAX+'" required aria-label="Quest name">'+
      '<input type="text" class="field-objective" id="new-quest-objective" placeholder="Objective..." required aria-label="Objective">'+
      '<input type="number" id="new-quest-xp" value="100" min="5" max="500" aria-label="XP reward">'+
      '<button id="add-quest-btn">Add</button>'+
    '</div>';

    html += '<div class="panel-title">Daily Quests</div><div class="quest-list">';
    var today = todayStr();
    state.quests.daily.forEach(function(q){
      var doneToday = q.lastDate===today;
      html += '<div class="quest-item">'+
        '<button class="complete-btn'+(doneToday?' done':'')+'" data-action="daily-toggle" data-id="'+q.id+'" '+(doneToday?'disabled':'')+' aria-label="Mark done">'+(doneToday?'&#10003;':'&#9675;')+'</button>'+
        questTextHtml('daily', q)+
        '<span class="quest-xp">+'+q.xp+' XP</span>'+
        '<button class="remove-btn" data-action="daily-remove" data-id="'+q.id+'" aria-label="Remove">&times;</button>'+
      '</div>';
    });
    html += '</div><div class="add-row">'+
      '<input type="text" class="field-full" id="new-daily-questname" placeholder="Quest name" maxlength="'+QUEST_NAME_MAX+'" required aria-label="Quest name">'+
      '<input type="text" class="field-objective" id="new-daily-objective" placeholder="Daily habit..." required aria-label="Objective">'+
      '<input type="number" id="new-daily-xp" value="15" min="5" max="100" aria-label="XP reward">'+
      '<button id="add-daily-btn">Add</button>'+
    '</div>';

    el('tab-quests').innerHTML = html;
  }

  function renderWallet(){
    var state = app.state;
    var html = '<div class="wallet-card">'+
      '<button class="wallet-toggle" id="wallet-toggle-btn">'+
        '<span class="wallet-caps">'+ST.capsValue().toFixed(2)+' CAPS</span>'+
        '<span class="wallet-chevron">'+(app.walletExpanded?'▴':'▾')+'</span>'+
      '</button>';
    if (app.walletExpanded){
      html += '<div class="wallet-detail">';
      if (state.finances.holdings.length===0){
        html += '<div class="empty-note">No holdings yet.</div>';
      } else {
        state.finances.holdings.forEach(function(h){
          var rate = Number(h.rateToCAD)||1;
          var cad = (Number(h.amount)||0)*rate;
          html += '<div class="wallet-row">'+
            '<div class="wallet-row-main">'+
              '<span class="wallet-label">'+escapeHtml(h.label)+'</span>'+
              '<span class="wallet-cad">$'+money(cad)+'</span>'+
              '<button class="remove-btn" data-action="wallet-remove" data-id="'+h.id+'" aria-label="Remove">&times;</button>'+
            '</div>'+
            '<div class="wallet-row-sub">'+money(h.amount)+' &times; <input type="number" class="rate-input" data-id="'+h.id+'" value="'+rate+'" step="0.001" aria-label="Rate to CAD"> CAD</div>'+
          '</div>';
        });
        html += '<div class="wallet-total-row"><span>Total</span><span>$'+money(ST.totalHoldingsCAD())+'</span></div>';
      }
      html += '<div class="add-row">'+
        '<input type="text" id="new-wallet-label" placeholder="Label (e.g. USDT)">'+
        '<input type="number" id="new-wallet-amount" placeholder="Amount">'+
        '<input type="number" id="new-wallet-rate" placeholder="Rate to CAD" step="0.001" value="1">'+
        '<button id="add-wallet-btn">Add</button>'+
      '</div>';
      html += '<div class="wallet-rate">'+commas(CAD_PER_CAP)+' CAD = 1 Cap &mdash; rates are set by you, updated manually</div>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function renderInventory(){
    var state = app.state;
    var html = renderWallet();
    CATS.forEach(function(cat){
      var items = state.inventory.filter(function(i){ return i.category===cat; });
      html += '<div class="panel-title">'+cat+'</div>';
      if (items.length===0){
        html += '<div class="empty-note">Nothing here yet.</div>';
      } else {
        html += '<div class="inv-list">';
        items.forEach(function(i){
          html += '<div class="inv-item"><span>'+escapeHtml(i.name)+'</span>'+
            '<button class="remove-btn" data-action="inv-remove" data-id="'+i.id+'" aria-label="Remove">&times;</button></div>';
        });
        html += '</div>';
      }
    });
    html += '<div class="add-row">'+
      '<input type="text" id="new-item-name" placeholder="Item name...">'+
      '<select id="new-item-cat">'+CATS.map(function(c){ return '<option value="'+c+'">'+c+'</option>'; }).join('')+'</select>'+
      '<button id="add-item-btn">Add</button>'+
    '</div>';
    el('tab-items').innerHTML = html;
  }

  function renderLog(){
    var state = app.state;
    var html = '<div class="panel-title">Log an entry</div>'+
      '<textarea id="log-input" rows="4" placeholder="What did you do today?"></textarea>'+
      '<button id="analyze-btn">Analyze</button>'+
      '<div id="proposal-area"></div>'+
      '<div class="panel-title">History</div><div class="log-history">';
    if (state.log.length===0){
      html += '<div class="empty-note">No entries yet.</div>';
    } else {
      state.log.slice().reverse().slice(0,30).forEach(function(entry){
        html += '<div class="log-entry">'+
          '<div class="log-date">'+escapeHtml(entry.date)+'</div>'+
          '<div class="log-text">'+escapeHtml(entry.text)+'</div>'+
          '<div class="log-xp">+'+entry.xp+' XP — '+escapeHtml(entry.reason||'')+'</div>'+
        '</div>';
      });
    }
    html += '</div>';
    el('tab-log').innerHTML = html;
  }

  function renderProposal(source){
    var p = app.pendingProposal;
    var lines = '<div class="proposal-line">+'+p.xp+' XP</div>'+
      '<div class="proposal-reason">'+escapeHtml(p.reason)+'</div>';
    p.skillGains.forEach(function(g){ lines += '<div class="proposal-sub">+'+g.amount+' '+g.skill+'</div>'; });
    var badge = source==='ai' ? '<span class="badge">AI</span>' : '<span class="badge dim">Offline rules</span>';
    el('proposal-area').innerHTML =
      '<div class="proposal-card">'+
        '<div class="proposal-head">Proposal'+badge+'</div>'+
        lines+
        '<div class="proposal-actions">'+
          '<button id="accept-proposal-btn">Accept</button>'+
          '<button id="reject-proposal-btn">Reject</button>'+
        '</div>'+
      '</div>';
  }

  // Daily quests and streak check-ins open again at midnight. When the date
  // has changed since the quests were drawn (the app stayed open, or came
  // back from the background), draw them again; not while something is being
  // typed there, the next check does it.
  function refreshIfNewDay(){
    if (!app.state || questsDay===todayStr()) return;
    var typing = document.activeElement;
    if (typing && /^(INPUT|SELECT|TEXTAREA)$/.test(typing.tagName) && typing.closest('#tab-quests')) return;
    renderHeader();
    renderQuests();
  }

  function updateAiIndicator(){
    var e = el('ai-indicator');
    if (!e) return;
    e.textContent = 'AI analysis: '+(app.aiAvailable?'on':'offline rules');
  }

  function renderAll(){
    renderHeader();
    renderStatus();
    renderQuests();
    renderInventory();
    renderLog();
    updateAiIndicator();
  }

  // ---------- toasts ----------
  function toast(className, text, ms){
    var t = document.createElement('div');
    t.className = className;
    t.textContent = text;
    el('toast-layer').appendChild(t);
    setTimeout(function(){ t.remove(); }, ms);
    return t;
  }
  function showXpToast(amount){ toast('xp-toast', '+'+amount+' XP', 1400); }
  function showLevelUp(){ toast('levelup-banner', 'LEVEL UP — '+app.state.level, 2200); }
  // The name in its own box: when the banner needs two lines, it breaks
  // after the dash rather than inside the name.
  function showQuestCompleted(name){
    var questName = document.createElement('span');
    questName.textContent = name;
    toast('levelup-banner quest-banner', 'QUEST COMPLETED — ', 3200).appendChild(questName);
  }
  function showSaveWarning(){ toast('xp-toast save-warning', 'Not saved — storage unavailable', 2600); }

  // ---------- check animation ----------
  var CHECK_ANIMATION_MS = 500;
  function reducedMotion(){
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  // A tapped check button pops and fills in amber with a glow, and its row
  // flashes like a terminal redraw; `then` runs once that is over. With
  // reduced motion there is no animation and `then` runs right away.
  function playCheck(btn, then){
    if (reducedMotion()){ then(); return; }
    var row = btn.closest('.quest-item, .bonus-item, .streak-row');
    btn.innerHTML = '&#10003;';
    btn.classList.add('check-pop');
    if (row) row.classList.add('row-flash');
    setTimeout(then, CHECK_ANIMATION_MS);
  }

  // ---------- tabs ----------
  function switchTab(name){
    ['status','quests','items','log'].forEach(function(t){
      el('tab-'+t).style.display = (t===name)?'block':'none';
    });
    document.querySelectorAll('[data-tab]').forEach(function(b){
      b.classList.toggle('active', b.getAttribute('data-tab')===name);
    });
  }

  ST.render = {
    renderHeader: renderHeader,
    renderStatus: renderStatus,
    renderQuests: renderQuests,
    renderInventory: renderInventory,
    renderLog: renderLog,
    renderProposal: renderProposal,
    swapQuestTitle: swapQuestTitle,
    refreshIfNewDay: refreshIfNewDay,
    updateAiIndicator: updateAiIndicator,
    renderAll: renderAll,
    showXpToast: showXpToast,
    showLevelUp: showLevelUp,
    showQuestCompleted: showQuestCompleted,
    showSaveWarning: showSaveWarning,
    playCheck: playCheck,
    switchTab: switchTab
  };
})(window.StatusTerminal);
