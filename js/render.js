/**
 * Rendering — builds each tab's HTML from ST.app.state. Nothing here changes
 * the state document; user actions live in events.js.
 */
(function(ST){
  'use strict';

  var el = ST.el, clamp = ST.clamp, commas = ST.commas, money = ST.money, escapeHtml = ST.escapeHtml, todayStr = ST.todayStr;
  var STAT_KEYS = ST.STAT_KEYS, STAT_LABELS = ST.STAT_LABELS, SKILL_KEYS = ST.SKILL_KEYS, CATS = ST.CATS, CAD_PER_CAP = ST.CAD_PER_CAP;
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
      '<div class="stepper">'+
        '<button class="step-btn" data-action="stat" data-key="'+key+'" data-dir="-1" aria-label="Decrease '+STAT_LABELS[key]+'">-</button>'+
        '<button class="step-btn" data-action="stat" data-key="'+key+'" data-dir="1" aria-label="Increase '+STAT_LABELS[key]+'">+</button>'+
      '</div>'+
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
    if (pts>0){
      html += '<div class="assign-banner">'+
        '<div class="assign-label">&#9733; '+pts+' SPECIAL point'+(pts>1?'s':'')+' to assign</div>'+
        '<div class="assign-buttons">'+
          STAT_KEYS.map(function(k){ return '<button class="assign-btn" data-action="special-assign" data-key="'+k+'">'+STAT_LABELS[k]+'</button>'; }).join('')+
        '</div>'+
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

  function renderQuests(){
    var state = app.state;
    var m = state.quests.main;
    var bonus = m.bonus || [];
    var html = '<div class="panel-title">Main Quest</div>'+
      '<div class="main-quest-card">'+
        '<input type="text" class="main-title-input" id="main-title-input" value="'+escapeHtml(m.title)+'">'+
        '<div class="progress-row">'+
          '<input type="range" min="0" max="100" value="'+m.progress+'" id="main-progress-input">'+
          '<span class="progress-pct">'+m.progress+'%</span>'+
        '</div>'+
        '<div class="main-xp-note">'+(m.completed?'Completed — ':'On completion: ')+'+'+(m.xp||0)+' XP</div>';
    if (bonus.length){
      html += '<div class="bonus-label">Bonus objectives</div><div class="bonus-list">';
      bonus.forEach(function(b){
        html += '<div class="bonus-item'+(b.done?' done':'')+'">'+
          '<button class="complete-btn'+(b.done?' done':'')+'" data-action="bonus-toggle" data-id="'+b.id+'" '+(b.done?'disabled':'')+' aria-label="Toggle">'+(b.done?'&#10003;':'&#9675;')+'</button>'+
          '<span class="quest-name">'+escapeHtml(b.name)+'</span>'+
          '<span class="quest-xp">+'+(b.xp||0)+' XP</span>'+
        '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    html += '<div class="panel-title">Side Quests</div>';
    var active = state.quests.side.filter(function(q){ return !q.done; });
    if (active.length===0){
      html += '<div class="empty-note">No side quests yet — add one below.</div>';
    } else {
      html += '<div class="quest-list">';
      active.forEach(function(q){
        html += '<div class="quest-item">'+
          '<button class="complete-btn" data-action="quest-complete" data-id="'+q.id+'" aria-label="Complete">&#10003;</button>'+
          '<span class="quest-name">'+escapeHtml(q.name)+'</span>'+
          '<span class="quest-xp">+'+q.xp+' XP</span>'+
          '<button class="remove-btn" data-action="quest-remove" data-id="'+q.id+'" aria-label="Remove">&times;</button>'+
        '</div>';
      });
      html += '</div>';
    }
    html += '<div class="add-row">'+
      '<input type="text" id="new-quest-name" placeholder="New side quest...">'+
      '<input type="number" id="new-quest-xp" value="100" min="5" max="500">'+
      '<button id="add-quest-btn">Add</button>'+
    '</div>';

    html += '<div class="panel-title">Daily Quests</div><div class="quest-list">';
    var today = todayStr();
    state.quests.daily.forEach(function(q){
      var doneToday = q.lastDate===today;
      html += '<div class="quest-item">'+
        '<button class="complete-btn'+(doneToday?' done':'')+'" data-action="daily-toggle" data-id="'+q.id+'" '+(doneToday?'disabled':'')+' aria-label="Mark done">'+(doneToday?'&#10003;':'&#9675;')+'</button>'+
        '<span class="quest-name">'+escapeHtml(q.name)+'</span>'+
        '<span class="quest-xp">+'+q.xp+' XP</span>'+
        '<button class="remove-btn" data-action="daily-remove" data-id="'+q.id+'" aria-label="Remove">&times;</button>'+
      '</div>';
    });
    html += '</div><div class="add-row">'+
      '<input type="text" id="new-daily-name" placeholder="New daily habit...">'+
      '<input type="number" id="new-daily-xp" value="15" min="5" max="100">'+
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
  }
  function showXpToast(amount){ toast('xp-toast', '+'+amount+' XP', 1400); }
  function showLevelUp(){ toast('levelup-banner', 'LEVEL UP — '+app.state.level, 2200); }
  function showSaveWarning(){ toast('xp-toast save-warning', 'Not saved — storage unavailable', 2600); }

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
    updateAiIndicator: updateAiIndicator,
    renderAll: renderAll,
    showXpToast: showXpToast,
    showLevelUp: showLevelUp,
    showSaveWarning: showSaveWarning,
    switchTab: switchTab
  };
})(window.StatusTerminal);
