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

  // Everything put into the HTML below is escaped text (escapeHtml), an id
  // (attr: escaped too, so it can't leave its attribute) or a number (num:
  // always a plain number). sanitizeImported() already guarantees ids and
  // numbers; this keeps the page safe even for data that skipped it.
  var attr = escapeHtml;
  function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
  // What an icon-only button acts on, for its label: "Remove: Paper Trail".
  function about(name, fallback){ return escapeHtml(name || fallback || ''); }

  // ---------- what was typed ----------
  // Redrawing a tab rebuilds its boxes. What was typed in a box with an id
  // (an add row, the journal entry) is put back, so a tap elsewhere or a
  // save from another window doesn't wipe it. The add row that was just used
  // is the exception: clearTyped() empties it on the next redraw.
  var clearPrefix = null;
  function clearTyped(prefix){ clearPrefix = prefix; }
  function keepTyped(tab, build){
    var typed = [];
    tab.querySelectorAll('input[id], select[id], textarea[id]').forEach(function(box){
      if (box.type==='file' || (clearPrefix && box.id.indexOf(clearPrefix)===0)) return;
      typed.push([box.id, box.value]);
    });
    clearPrefix = null;
    build();
    typed.forEach(function(entry){
      var box = el(entry[0]);
      if (box && tab.contains(box)) box.value = entry[1];
    });
  }

  function renderHeader(){
    var state = app.state;
    el('hdr-date').textContent = new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'});
    el('hdr-level').textContent = (state.level<10?'0':'')+state.level;
    var pct = clamp((state.xp/state.xpToNext)*100,0,100);
    el('hdr-xp-fill').style.width = pct+'%';
    el('hdr-xp-text').textContent = commas(state.xp)+' / '+commas(state.xpToNext)+' XP';
  }

  function statRowHtml(key){
    var value = num(app.state.stats[key]);
    var segs='';
    for (var i=1;i<=10;i++){ segs += '<span class="seg'+(i<=value?' filled':'')+'"></span>'; }
    return '<div class="stat-row">'+
      '<div class="stat-label">'+STAT_LABELS[key]+'</div>'+
      '<div class="seg-bar">'+segs+'</div>'+
      '<div class="stat-value">'+value+'</div>'+
    '</div>';
  }

  function skillRowHtml(key){
    var value = num(app.state.skills[key]);
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
    var pts = num(state.unspentSpecialPoints);
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
    var ref = ' data-action="rename" data-kind="'+kind+'"'+(q.id ? ' data-id="'+attr(q.id)+'"' : '');
    return q.questName
      ? '<button class="quest-title"'+ref+' title="Rename">'+escapeHtml(q.questName)+'</button>'
      : '<button class="add-name"'+ref+' aria-label="Add a quest name">+ name</button>';
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

  // Removing a side or daily quest, an item or a wallet row asks first,
  // under its row, like Reset: kind is 'side', 'daily', 'item' or 'wallet'.
  function removeConfirmHtml(kind, id, question){
    var asking = app.confirmRemove;
    if (!asking || asking.kind!==kind || asking.id!==id) return '';
    return '<div class="card-confirm row-confirm">'+
      '<span class="reset-warning">'+question+'</span>'+
      '<button class="confirm-yes" data-action="remove-yes" data-kind="'+kind+'" data-id="'+attr(id)+'">Yes, remove</button>'+
      '<button data-action="remove-no" data-kind="'+kind+'">Cancel</button>'+
    '</div>';
  }

  // A streak quest's progress: "Day 3 / 7", and a check-in button usable once a day.
  function streakRowHtml(m){
    var days = num(ST.currentStreak(m)), target = num(m.streakTarget);
    var done = m.completed || ST.checkedInToday(m);
    return '<div class="streak-row">'+
      '<button class="complete-btn'+(done?' done':'')+'" data-action="main-checkin" data-id="'+attr(m.id)+'" '+(done?'disabled':'')+' aria-label="Check in for today: '+about(m.questName, m.title)+'">'+(done?'&#10003;':'&#9675;')+'</button>'+
      '<span class="streak-days">Day '+days+' / '+target+'</span>'+
      '<div class="streak-bar"><div class="streak-fill" style="width:'+(target ? clamp(days/target*100,0,100) : 0)+'%"></div></div>'+
    '</div>';
  }
  function streakNote(m){
    if (ST.checkedInToday(m)) return 'Checked in today';
    if (m.streakDays>0 && ST.currentStreak(m)===0) return 'Missed a day, streak reset';
    return 'Check in once a day';
  }

  // A caps quest's progress: the wallet's CAPS against the target, filling
  // on its own (ST.syncCapsQuests keeps m.progress in step).
  function capsRowHtml(m){
    var pct = m.completed ? 100 : num(ST.capsProgress(m));
    var target = Number(num(m.capsTarget).toFixed(2));
    return '<div class="streak-row caps-row">'+
      '<span class="streak-days">'+escapeHtml(ST.capsText())+' / '+target+' CAPS</span>'+
      '<div class="streak-bar"><div class="streak-fill" style="width:'+pct+'%"></div></div>'+
      '<span class="progress-pct">'+pct+'%</span>'+
    '</div>';
  }

  // A side quest's skill gains, under its XP: "+3 KNOWLEDGE".
  function gainsHtml(gains){
    return (gains || []).map(function(g){
      return '<span class="quest-gain">+'+num(g.amount)+' '+escapeHtml(g.skill)+'</span>';
    }).join('');
  }

  function mainQuestHtml(m){
    var bonus = m.bonus || [];
    var streak = m.progressType==='streak';
    var caps = m.progressType==='caps';
    var html = '<div class="main-quest-card'+(m.questName?' has-name':'')+(m.completed?' completed':'')+'">'+
      '<div class="main-quest-head">'+
        questTitleHtml('main', m)+
        (m.completed ? '<span class="badge">Completed</span>' : '')+
        '<button class="remove-btn" data-action="main-remove" data-id="'+attr(m.id)+'" aria-label="Remove main quest: '+about(m.questName, m.title)+'">&times;</button>'+
      '</div>'+
      '<input type="text" class="main-title-input" data-id="'+attr(m.id)+'" maxlength="60" value="'+escapeHtml(m.title)+'" aria-label="Objective">'+
      (streak ? streakRowHtml(m) : caps ? capsRowHtml(m) :
        '<div class="progress-row">'+
          '<input type="range" min="0" max="100" value="'+num(m.progress)+'" class="main-progress-input" data-id="'+attr(m.id)+'" aria-label="Progress"'+(m.completed?' disabled':'')+'>'+
          '<span class="progress-pct">'+num(m.progress)+'%</span>'+
        '</div>')+
      '<div class="main-xp-note">'+(streak && !m.completed ? '<span>'+streakNote(m)+' ·</span> ' : '')+
        (caps && !m.completed ? '<span>Follows your wallet ·</span> ' : '')+
        '<span>'+(m.completed?'Completed — ':'On completion: ')+'+'+num(m.xp)+' XP</span></div>';
    if (bonus.length){
      html += '<div class="bonus-label">Bonus objectives</div><div class="bonus-list">';
      bonus.forEach(function(b){
        html += '<div class="bonus-item'+(b.done?' done':'')+'">'+
          '<button class="complete-btn'+(b.done?' done':'')+'" data-action="bonus-toggle" data-quest="'+attr(m.id)+'" data-id="'+attr(b.id)+'" '+(b.done?'disabled':'')+' aria-label="Complete bonus objective: '+about(b.name)+'">'+(b.done?'&#10003;':'&#9675;')+'</button>'+
          '<span class="quest-name">'+escapeHtml(b.name)+'</span>'+
          '<span class="quest-xp">+'+num(b.xp)+' XP</span>'+
        '</div>';
      });
      html += '</div>';
    }
    // Removing a main quest asks first, like Reset.
    if (app.confirmRemoveMain===m.id){
      html += '<div class="card-confirm">'+
        '<span class="reset-warning">Remove this quest?</span>'+
        '<button class="confirm-yes" data-action="main-remove-yes" data-id="'+attr(m.id)+'">Yes, remove</button>'+
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
        '<option value="caps">Caps goal</option>'+
      '</select>'+
      '<label class="days-field" id="new-main-caps-field" hidden>'+
        '<input type="number" id="new-main-caps" value="5" min="0.01" step="0.01" aria-label="Target caps"><span>caps</span>'+
      '</label>'+
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
          '<button class="complete-btn" data-action="quest-complete" data-id="'+attr(q.id)+'" aria-label="Complete: '+about(q.questName, q.name)+'">&#10003;</button>'+
          questTextHtml('side', q)+
          '<span class="quest-xp">+'+num(q.xp)+' XP'+gainsHtml(q.skillGains)+'</span>'+
          '<button class="remove-btn" data-action="quest-remove" data-id="'+attr(q.id)+'" aria-label="Remove: '+about(q.questName, q.name)+'">&times;</button>'+
        '</div>'+
        removeConfirmHtml('side', q.id, 'Remove this quest?');
      });
      html += '</div>';
    }
    html += '<div class="add-row">'+
      '<input type="text" class="field-full" id="new-quest-questname" placeholder="Quest name" maxlength="'+QUEST_NAME_MAX+'" required aria-label="Quest name">'+
      '<input type="text" class="field-objective" id="new-quest-objective" placeholder="Objective..." required aria-label="Objective">'+
      '<input type="number" id="new-quest-xp" value="100" min="5" max="500" aria-label="XP reward">'+
      '<select id="new-quest-skill" aria-label="Skill it raises">'+
        '<option value="">No skill</option>'+
        ST.SKILL_KEYS.map(function(k){ return '<option value="'+k+'">+'+ST.SIDE_SKILL_GAIN+' '+k+'</option>'; }).join('')+
      '</select>'+
      '<button id="add-quest-btn">Add</button>'+
    '</div>';

    html += '<div class="panel-title">Daily Quests</div><div class="quest-list">';
    state.quests.daily.forEach(function(q){
      var doneToday = ST.dailyDoneToday(q);
      html += '<div class="quest-item">'+
        '<button class="complete-btn'+(doneToday?' done':'')+'" data-action="daily-toggle" data-id="'+attr(q.id)+'" '+(doneToday?'disabled':'')+' aria-label="Mark done today: '+about(q.questName, q.name)+'">'+(doneToday?'&#10003;':'&#9675;')+'</button>'+
        questTextHtml('daily', q)+
        '<span class="quest-xp">+'+num(q.xp)+' XP</span>'+
        '<button class="remove-btn" data-action="daily-remove" data-id="'+attr(q.id)+'" aria-label="Remove: '+about(q.questName, q.name)+'">&times;</button>'+
      '</div>'+
      removeConfirmHtml('daily', q.id, 'Remove this quest?');
    });
    html += '</div><div class="add-row">'+
      '<input type="text" class="field-full" id="new-daily-questname" placeholder="Quest name" maxlength="'+QUEST_NAME_MAX+'" required aria-label="Quest name">'+
      '<input type="text" class="field-objective" id="new-daily-objective" placeholder="Daily habit..." required aria-label="Objective">'+
      '<input type="number" id="new-daily-xp" value="15" min="5" max="100" aria-label="XP reward">'+
      '<button id="add-daily-btn">Add</button>'+
    '</div>';

    var tab = el('tab-quests');
    keepTyped(tab, function(){ tab.innerHTML = html; });
    el('new-main-days-field').hidden = el('new-main-type').value!=='streak';
    el('new-main-caps-field').hidden = el('new-main-type').value!=='caps';
  }

  function renderWallet(){
    var state = app.state;
    var html = '<div class="wallet-card">'+
      '<button class="wallet-toggle" id="wallet-toggle-btn" aria-expanded="'+app.walletExpanded+'">'+
        '<span class="wallet-caps">'+ST.capsText()+' CAPS</span>'+
        '<span class="wallet-chevron" aria-hidden="true">'+(app.walletExpanded?'▴':'▾')+'</span>'+
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
              '<button class="remove-btn" data-action="wallet-remove" data-id="'+attr(h.id)+'" aria-label="Remove: '+about(h.label)+'">&times;</button>'+
            '</div>'+
            '<div class="wallet-row-sub">'+money(h.amount)+' &times; <input type="number" class="rate-input" data-id="'+attr(h.id)+'" value="'+rate+'" step="0.001" aria-label="Rate to CAD: '+about(h.label)+'"> CAD</div>'+
          '</div>'+
          removeConfirmHtml('wallet', h.id, 'Remove this row?');
        });
        html += '<div class="wallet-total-row"><span>Total</span><span>$'+money(ST.totalHoldingsCAD())+'</span></div>';
      }
      html += '<div class="add-row">'+
        '<input type="text" id="new-wallet-label" placeholder="Label (e.g. USDT)" aria-label="Label">'+
        '<input type="number" id="new-wallet-amount" placeholder="Amount" aria-label="Amount">'+
        '<input type="number" id="new-wallet-rate" placeholder="Rate to CAD" step="0.001" value="1" aria-label="Rate to CAD">'+
        '<button id="add-wallet-btn">Add</button>'+
      '</div>';
      html += '<div class="wallet-rate">'+commas(CAD_PER_CAP)+' CAD = 1 Cap &mdash; rates are set by you, updated manually</div>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  // A price box's value: the price as a plain number, or empty.
  function priceValue(v){ return v===undefined || v===null || v==='' ? '' : num(v); }

  // A THINGS TO SELL item: its asking price next to the name (edited in
  // place, like a wallet rate) and a Sold button, which asks "Sold for $X?"
  // below it with the amount still editable.
  // Every item: a small button that opens "Move to:" under its row, with
  // the other categories to pick from.
  function moveBtnHtml(i){
    return '<button class="move-btn" data-action="inv-move" data-id="'+attr(i.id)+'" aria-label="Move to…: '+about(i.name)+'" title="Move to…">&#8644;</button>';
  }
  function moveChoiceHtml(i){
    if (app.confirmMove!==i.id) return '';
    return '<div class="card-confirm row-confirm move-confirm">'+
      '<span class="move-question">Move to:</span>'+
      CATS.filter(function(c){ return c!==i.category; }).map(function(c){
        return '<button class="confirm-ok" data-action="move-to" data-id="'+attr(i.id)+'" data-key="'+c+'">'+ST.catLabel(c)+'</button>';
      }).join('')+
      '<button data-action="move-no">Cancel</button>'+
    '</div>';
  }
  function sellItemHtml(i){
    var html = '<div class="inv-item sell-item"><span>'+escapeHtml(i.name)+'</span>'+
      '<label class="price-field">$<input type="number" class="price-input" data-id="'+attr(i.id)+'" value="'+priceValue(i.price)+'" min="0" step="0.01" inputmode="decimal" placeholder="price" aria-label="Asking price in CAD: '+about(i.name)+'"></label>'+
      '<button class="sell-btn" data-action="sell" data-id="'+attr(i.id)+'" aria-label="Sold: '+about(i.name)+'">Sold</button>'+
      moveBtnHtml(i)+
      '<button class="remove-btn" data-action="inv-remove" data-id="'+attr(i.id)+'" aria-label="Remove: '+about(i.name)+'">&times;</button></div>';
    html += removeConfirmHtml('item', i.id, 'Remove this item?');
    html += moveChoiceHtml(i);
    if (app.confirmSell===i.id){
      html += '<div class="card-confirm row-confirm sell-confirm">'+
        '<label class="sell-question">Sold for $<input type="number" class="sell-amount" id="sell-amount-'+attr(i.id)+'" data-id="'+attr(i.id)+'" value="'+priceValue(i.price)+'" min="0" step="0.01" inputmode="decimal" aria-label="Sold for, in CAD">?</label>'+
        '<button class="confirm-ok" data-action="sell-yes" data-id="'+attr(i.id)+'">Yes</button>'+
        '<button data-action="sell-no">Cancel</button>'+
      '</div>';
    }
    return html;
  }

  function renderInventory(){
    var state = app.state;
    var html = renderWallet();
    CATS.forEach(function(cat){
      var items = state.inventory.filter(function(i){ return i.category===cat; });
      // A turning 3D model beside the title (js/items3d.js), when that category has one.
      var model = ST.items3d && ST.items3d.CATEGORIES.indexOf(cat)!==-1
        ? '<canvas class="item-model" data-model="'+cat+'" aria-hidden="true"></canvas>' : '';
      html += '<div class="panel-title inv-cat">'+ST.catLabel(cat)+model+'</div>';
      if (items.length===0){
        html += '<div class="empty-note">Nothing here yet.</div>';
      } else {
        html += '<div class="inv-list">';
        items.forEach(function(i){
          if (cat==='SELL'){ html += sellItemHtml(i); return; }
          html += '<div class="inv-item"><span>'+escapeHtml(i.name)+'</span>'+
            '<span class="inv-buttons">'+moveBtnHtml(i)+
            '<button class="remove-btn" data-action="inv-remove" data-id="'+attr(i.id)+'" aria-label="Remove: '+about(i.name)+'">&times;</button></span></div>'+
            removeConfirmHtml('item', i.id, 'Remove this item?')+
            moveChoiceHtml(i);
        });
        html += '</div>';
      }
    });
    html += '<div class="add-row">'+
      '<input type="text" id="new-item-name" placeholder="Item name..." aria-label="Item name">'+
      '<select id="new-item-cat" aria-label="Category">'+CATS.map(function(c){ return '<option value="'+c+'">'+ST.catLabel(c)+'</option>'; }).join('')+'</select>'+
      '<input type="number" id="new-item-price" placeholder="Price $" min="0" step="0.01" inputmode="decimal" aria-label="Asking price in CAD (optional)">'+
      '<button id="add-item-btn">Add</button>'+
    '</div>';
    var tab = el('tab-items');
    keepTyped(tab, function(){ tab.innerHTML = html; });
    el('new-item-price').hidden = el('new-item-cat').value!=='SELL';
    if (ST.items3d) ST.items3d.attach(tab);
  }

  function renderLog(){
    var state = app.state;
    var html = '<div class="panel-title">Log an entry</div>'+
      '<textarea id="log-input" rows="4" placeholder="What did you do today?" aria-label="Journal entry"></textarea>'+
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
          '<div class="log-xp">+'+num(entry.xp)+' XP — '+escapeHtml(entry.reason||'')+'</div>'+
        '</div>';
      });
    }
    html += '</div>';
    var tab = el('tab-log');
    keepTyped(tab, function(){ tab.innerHTML = html; });
  }

  function renderProposal(source){
    var p = app.pendingProposal;
    var lines = '<div class="proposal-line">+'+num(p.xp)+' XP</div>'+
      '<div class="proposal-reason">'+escapeHtml(p.reason)+'</div>';
    p.skillGains.forEach(function(g){ lines += '<div class="proposal-sub">+'+num(g.amount)+' '+escapeHtml(g.skill)+'</div>'; });
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
    if (ST.map) ST.map.render();
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
  // Sounds (js/sfx.js) are decoration: the app runs without them.
  function sound(name, delay){ if (ST.sfx) ST.sfx.play(name, delay); }

  // "+150 XP", and a quest's skill gains after it: "+150 XP · +3 KNOWLEDGE".
  function showXpToast(amount, skillGains){
    var gains = (skillGains || []).map(function(g){ return ' · +'+num(g.amount)+' '+g.skill; }).join('');
    if (!gains){ toast('xp-toast', '+'+amount+' XP', 1400); return; }
    toast('xp-toast', '+'+amount+' XP'+gains, 2200).style.animationDuration = '2.2s';   // longer to read
  }
  // After the check's blip, so the two don't sound on top of each other.
  function showLevelUp(){ sound('levelUp', 0.2); toast('levelup-banner', 'LEVEL UP — '+app.state.level, 2200); }
  // The name in its own box: when the banner needs two lines, it breaks
  // after the dash rather than inside the name.
  function showQuestCompleted(name){
    var questName = document.createElement('span');
    questName.textContent = name;
    sound('quest', 0.25);
    toast('levelup-banner quest-banner', 'QUEST COMPLETED — ', 3200).appendChild(questName);
  }
  function showNotice(text){ toast('xp-toast', text, 2600).style.animationDuration = '2.6s'; }
  function showSold(name){
    var itemName = document.createElement('span');
    itemName.textContent = name;
    sound('sold');
    toast('levelup-banner quest-banner', 'SOLD: ', 3200).appendChild(itemName);
  }
  // A city or region revealed for the first time (js/map.js), or several at
  // once: "DISCOVERED: 12 places".
  function showDiscovered(name){
    var placeName = document.createElement('span');
    placeName.textContent = name;
    sound('discover', 0.25);      // after the place's own select sound (js/map.js)
    toast('levelup-banner quest-banner', 'DISCOVERED: ', 3200).appendChild(placeName);
  }
  function showSaveWarning(){ sound('error'); toast('xp-toast save-warning', 'Not saved — storage unavailable', 2600); }
  function showConflictWarning(){
    sound('error');
    toast('xp-toast save-warning', 'Changed in another window — your last change wasn’t saved', 4000).style.animationDuration = '4s';
  }
  // The saved data exists but couldn't be read (storage.js). Nothing is
  // shown or saved, so it stays as it is for the next try.
  function showLoadError(){
    el('tab-status').innerHTML = '<div class="empty-note reset-warning" role="alert">'+
      'Your saved data couldn’t be read, so nothing was loaded or changed. '+
      'Close the app completely and open it again.</div>';
  }

  // ---------- check animation ----------
  var CHECK_ANIMATION_MS = 500;
  function reducedMotion(){
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  // A tapped check button pops and fills in amber with a glow, and its row
  // flashes like a terminal redraw; `then` runs once that is over. With
  // reduced motion there is no animation and `then` runs right away.
  function playCheck(btn, then){
    sound('complete');
    if (reducedMotion()){ then(); return; }
    var row = btn.closest('.quest-item, .bonus-item, .streak-row');
    btn.innerHTML = '&#10003;';
    btn.classList.add('check-pop');
    if (row) row.classList.add('row-flash');
    setTimeout(then, CHECK_ANIMATION_MS);
  }

  // ---------- tabs ----------
  // A panel opened by a tab swings in (tab-enter, css/terminal.css); not the
  // first one at startup, nor the open one tapped again. The animation
  // starts each time a panel goes from hidden to shown.
  var shownTab = null;
  function switchTab(name){
    var swing = shownTab!==null && name!==shownTab;
    if (swing) sound('tab');
    shownTab = name;
    if (ST.items3d) ST.items3d.show(name==='items');
    ['status','quests','items','map','log'].forEach(function(t){
      var panel = el('tab-'+t);
      panel.style.display = (t===name)?'block':'none';
      panel.classList.toggle('tab-enter', swing && t===name);
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
    showNotice: showNotice,
    showSold: showSold,
    showDiscovered: showDiscovered,
    showSaveWarning: showSaveWarning,
    showConflictWarning: showConflictWarning,
    showLoadError: showLoadError,
    clearTyped: clearTyped,
    playCheck: playCheck,
    switchTab: switchTab
  };
})(window.StatusTerminal);
