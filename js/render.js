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
    renderBackup();             // the rad meter beside it (first XP without a backup: rads)
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
    html += perksHtml();
    html += '<div class="panel-title">Skills</div>';
    SKILL_KEYS.forEach(function(k){ html += skillRowHtml(k); });
    html += bobbleheadsHtml();
    html += '<div class="panel-title">Lifetime</div><div class="stats-grid">'+
      '<div class="stats-cell"><div class="stats-num">'+commas(state.lifetimeXp||0)+'</div><div class="stats-label">Total XP earned</div></div>'+
      '<div class="stats-cell"><div class="stats-num">'+state.quests.side.filter(function(q){return q.done;}).length+'</div><div class="stats-label">Side quests done</div></div>'+
      '<div class="stats-cell"><div class="stats-num">'+commas(ST.logEntryCount())+'</div><div class="stats-label">Log entries</div></div>'+
    '</div>';
    el('tab-status').innerHTML = html;
  }

  // ---------- perks ----------
  // Each perk's picture: amber line art (24×24), like the Pip-Boy's cards.
  var PERK_ICONS = {
    road: 'M9 21L11 3M15 21L13 3M12 6v2M12 11v2M12 16v2',
    map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15',
    flame: 'M12 22c-4 0-7-3-7-7 0-4 4-6 4-11 3 2 5 5 5 8 1-1 2-2 2-4 2 2 3 4 3 7 0 4-3 7-7 7z',
    cap: 'M12 2l2 2.5h3l.5 3 2.5 2-1.5 2.5 1.5 2.5-2.5 2-.5 3h-3L12 22l-2-2.5H7l-.5-3-2.5-2L5.5 12 4 9.5l2.5-2 .5-3h3zM15 12a3 3 0 1 1-6 0 3 3 0 1 1 6 0',
    book: 'M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1zM12 6v14',
    calendar: 'M4 5h16v16H4zM4 9h16M8 3v4M16 3v4M8 15l3 3 5-6',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM15 12a3 3 0 1 1-6 0 3 3 0 1 1 6 0',
    bolt: 'M13 2L4 14h7l-1 8 9-12h-7z'
  };
  function perkIconHtml(p){
    return '<svg class="perk-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="'+PERK_ICONS[p.icon]+'"/></svg>';
  }
  // ●●○: the ranks taken of a perk.
  function rankDots(p, rank){
    var dots = '';
    for (var i=1;i<=p.ranks;i++) dots += i<=rank ? '●' : '○';
    return '<span class="perk-dots" aria-label="Rank '+rank+' of '+p.ranks+'">'+dots+'</span>';
  }
  // The perks taken, the button to the chart, and the chart when open: a
  // card per perk with what its next rank needs and does. Taking one asks
  // first, on its card.
  function perksHtml(){
    var s = app.state, pts = num(s.unspentPerkPoints);
    var owned = ST.PERKS.filter(function(p){ return ST.perkRank(p.id)>0; });
    var html = '<div class="panel-title">Perks'+(pts>0 ? ' <span class="panel-count">★ '+pts+' to choose</span>' : '')+'</div>';
    html += owned.length ? '<div class="perk-owned">'+owned.map(function(p){
      var rank = ST.perkRank(p.id);
      return '<div class="perk-row">'+perkIconHtml(p)+
        '<span class="perk-row-text"><span class="perk-name">'+escapeHtml(p.name)+'</span>'+rankDots(p, rank)+
        '<span class="perk-effect">'+escapeHtml(p.effect(rank))+'</span></span></div>';
    }).join('')+'</div>' : '<div class="empty-note">No perks yet: each level-up gives a perk point.</div>';
    html += '<button class="perk-chart-btn'+(pts>0 ? ' due' : '')+'" data-action="perk-chart" aria-expanded="'+(app.perkChart ? 'true' : 'false')+'">'+
      (app.perkChart ? 'Close the perk chart' : 'Perk chart'+(pts>0 ? ': choose a perk' : ''))+'</button>';
    if (!app.perkChart) return html;
    return html+'<div class="perk-chart">'+ST.PERKS.map(function(p){
      var rank = ST.perkRank(p.id), maxed = rank>=p.ranks, open = ST.perkOpen(p.id);
      var need = STAT_LABELS[p.stat]+' '+(p.min+rank);
      var html = '<div class="perk-card'+(rank ? ' owned' : '')+(!maxed && !open ? ' locked' : '')+'">'+
        perkIconHtml(p)+
        '<div class="perk-name">'+escapeHtml(p.name)+'</div>'+rankDots(p, rank)+
        '<div class="perk-effect">'+escapeHtml(p.effect(maxed ? rank : rank+1))+'</div>'+
        '<div class="perk-need">'+(maxed ? 'Max rank' : (open ? '' : 'Needs ')+escapeHtml(need))+'</div>';
      if (app.confirmPerk===p.id){
        html += '<div class="perk-confirm"><span>Take '+escapeHtml(p.name)+(p.ranks>1 ? ', rank '+(rank+1) : '')+'?</span>'+
          '<button class="assign-btn" data-action="perk-yes">Yes</button>'+
          '<button class="assign-btn assign-cancel" data-action="perk-no">Cancel</button></div>';
      } else if (pts>0 && open){
        html += '<button class="assign-btn perk-take" data-action="perk-take" data-key="'+p.id+'">Take'+(rank ? ' rank '+(rank+1) : '')+'</button>';
      }
      return html+'</div>';
    }).join('')+'</div>';
  }

  // ---------- bobbleheads ----------
  // The shelf: a trophy per bobblehead, each its own (what it was won for),
  // all on the same little stand. Lit once found, a dim outline until then
  // (its name stays "?"). A tap shows what it is and how it's found; a
  // found one wobbles on its stand. Line art on a 40×48 grid, like the perk
  // icons; `solid` parts are filled.
  var TROPHY_STAND = '<path d="M12 36h16v3H12zM9 39h22l1 6H8zM16 42h8"/>';
  var TROPHIES = {
    // Vault Dweller (level 5): a vault door with a 5 on it.
    vault: '<circle cx="20" cy="19" r="12"/><circle cx="20" cy="19" r="7"/>'+
      '<path d="M20 7V4.5M20 31v2.5M8 19H5.5M32 19h2.5M11.5 10.5l-1.8-1.8M28.5 10.5l1.8-1.8M11.5 27.5l-1.8 1.8M28.5 27.5l1.8 1.8'+
      'M22.5 15.5h-4l-.5 3.3h2a2 2 0 0 1 0 4h-2.5"/>',
    // Wasteland Veteran (level 10): a medal on its ribbon.
    veteran: '<path d="M12.5 3h15l-5 12h-5zM20 3v12"/><circle cx="20" cy="23.5" r="8.5"/>'+
      '<path class="solid" d="M20 18.5L21.18 21.88 24.76 21.95 21.9 24.12 22.94 27.55 20 25.5 17.06 27.55 18.1 24.12 15.24 21.95 18.82 21.88Z"/>',
    // Devotion (a day streak): an eternal flame in its brazier.
    devotion: '<path d="M20 24c-4 0-6-2.5-6-6 0-4 4-5.5 4-11 3 2 5 5 5 8 1-1 1.5-2.5 1.5-4 2 2 2.5 4.5 2.5 7 0 3.5-3 6-7 6z'+
      'M20 24c-1.7 0-2.7-1.1-2.7-2.7 0-1.8 1.7-2.6 1.7-4.8 1.8 1.2 3.7 2.6 3.7 4.8 0 1.6-1.1 2.7-2.7 2.7zM11 25h18l-2.5 6h-13zM20 31v3M16 34h8"/>',
    // Capitalist (a Caps goal): a full money bag.
    capitalist: '<path d="M16 7h8l-2 4.5c5 2.5 9 7.5 9 13 0 4.5-3 7.5-7 7.5h-8c-4 0-7-3-7-7.5 0-5.5 4-10.5 9-13zM17 11.5h6'+
      'M22.5 19.8c-.5-1-1.4-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.9 2.5 2.1-1.1 2-2.5 2c-1.1 0-2-.5-2.5-1.5M20 16.8v1.5M20 26.4v1.5"/>',
    // Merchant (an item sold): the trader's scales.
    merchant: '<circle cx="20" cy="6" r="1.5"/>'+
      '<path d="M20 7.5V33M14 33h12M9 11h22M9 11l-4.5 9M9 11l4.5 9M4 20h10a5 3.5 0 0 1-10 0zM31 11l-4.5 9M31 11l4.5 9M26 20h10a5 3.5 0 0 1-10 0z"/>',
    // Errand Runner (10 side quests): a running boot.
    errands: '<path d="M14 6h7v14c5 1 10.5 3 11.5 7v4H10V10c0-2.5 1.5-4 4-4zM10 27.5h22.5M21 11h-4M21 15h-4M3 13h5M2 18.5h6M4 24h4"/>',
    // Creature of Routine (30 daily quests): an alarm clock.
    routine: '<circle cx="20" cy="20" r="10"/>'+
      '<path d="M9.5 12.5a4.5 4.5 0 0 1 6-6M24.5 6.5a4.5 4.5 0 0 1 6 6M20 14v6l4 2.5M13.5 28l-2.5 3.5M26.5 28l2.5 3.5M20 10V8M18 8h4"/>',
    // Explorer (10 cities): a compass.
    explorer: '<circle cx="20" cy="19" r="13"/>'+
      '<path d="M20 6v2.5M20 32v-2.5M7 19h2.5M33 19h-2.5M20 9.5l3.5 9.5-3.5 9.5-3.5-9.5z"/><path class="solid" d="M20 9.5l3.5 9.5h-7z"/>',
    // Globetrotter (5 countries): a globe on its stand.
    globetrotter: '<circle cx="20" cy="17" r="10"/>'+
      '<path d="M20 7a5 10 0 0 0 0 20a5 10 0 0 0 0-20M10.6 13.5h18.8M10.6 20.5h18.8M11.5 8.5A12 12 0 0 0 28.5 25.5M20 29v3.5M15 32.5h10"/>',
    // Road Warrior (1,000 km of routes): the road to the horizon, the sun setting on it.
    roadwarrior: '<path d="M6 7h28M14.5 7a5.5 5.5 0 0 1 11 0M18 7L8 33M22 7l10 26M20 9.5v3M20 16v4.5M20 24.5v6"/>',
    // Scribe (25 journal entries): a quill in its inkwell.
    scribe: '<path d="M14 25h12v8H14zM16 25v-3h8v3M19.5 23.5C20.5 15 25 8 33 4c-1 7.5-5.5 13.5-12 16.5M19.5 23.5l7-12"/>',
    // Specialist (a skill at 50): an arrow in the bullseye.
    specialist: '<circle cx="18" cy="21" r="11"/><circle cx="18" cy="21" r="6.5"/><circle class="solid" cx="18" cy="21" r="2"/>'+
      '<path d="M18 21L31 8M28 11V6.5M28 11h4.5M31 8V3.5M31 8h4.5"/>',
    // S.P.E.C.I.A.L.ist (a stat at 10): the atom.
    special: '<ellipse cx="20" cy="19" rx="13" ry="5"/><ellipse cx="20" cy="19" rx="13" ry="5" transform="rotate(60 20 19)"/>'+
      '<ellipse cx="20" cy="19" rx="13" ry="5" transform="rotate(-60 20 19)"/><circle class="solid" cx="20" cy="19" r="2.2"/>',
    // Perk Collector (3 perks): a hand of perk cards, a star on the top one.
    perks: '<path d="M9.5 12v18a2 2 0 0 0 2 2h13M12 9.5v18a2 2 0 0 0 2 2h13"/><rect x="14.5" y="6" width="15" height="21" rx="2"/>'+
      '<path class="solid" d="M22 12L23.06 15.04 26.28 15.11 23.71 17.06 24.65 20.14 22 18.3 19.35 20.14 20.29 17.06 17.72 15.11 20.94 15.04Z"/>',
    // Rad-Free (a backup made): a bag of RadAway.
    radfree: '<path d="M13 7h14v18a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4zM17 7V4.5h6V7M20 29v5M20 12.5v8M16 16.5h8"/>',
    // Archivist (5 holotapes): a tape.
    archivist: '<rect x="6" y="11" width="28" height="19" rx="2"/><circle cx="14.5" cy="19" r="2.8"/><circle cx="25.5" cy="19" r="2.8"/>'+
      '<path d="M11 15h18v8H11zM11.5 30l2-4h13l2 4"/>'
  };
  function bobbleSvg(id){
    return '<svg class="bobble-svg" viewBox="0 0 40 48" aria-hidden="true">'+
      '<g class="bobble-top">'+(TROPHIES[id] || '')+'</g>'+TROPHY_STAND+'</svg>';
  }
  function bobbleheadsHtml(){
    var s = app.state, all = ST.BOBBLEHEADS;
    var got = all.filter(function(b){ return s.bobbleheads && s.bobbleheads[b.id]; }).length;
    var html = '<div class="panel-title">Bobbleheads <span class="panel-count">'+got+' / '+all.length+'</span></div><div class="bobble-shelf">';
    all.forEach(function(b){
      var date = s.bobbleheads && s.bobbleheads[b.id];
      html += '<button class="bobble'+(date ? ' found' : '')+(app.bobbleOpen===b.id ? ' open' : '')+'" data-action="bobble" data-key="'+b.id+'" '+
        'aria-label="'+escapeHtml(date ? b.name+': found' : 'Bobblehead not found yet')+'" aria-expanded="'+(app.bobbleOpen===b.id)+'">'+
        bobbleSvg(b.id)+'<span class="bobble-name">'+escapeHtml(date ? b.name : '?')+'</span></button>';
    });
    html += '</div>';
    var open = app.bobbleOpen && all.filter(function(b){ return b.id===app.bobbleOpen; })[0];
    if (open){
      var when = s.bobbleheads && s.bobbleheads[open.id];
      html += '<div class="bobble-detail">'+
        (when ? '<span class="perk-name">'+escapeHtml(open.name)+'</span> — found '+escapeHtml(ST.dateText(when)) : 'Not found yet')+
        '<div class="perk-effect">'+escapeHtml(open.how)+' · +'+ST.BOBBLEHEAD_XP+' XP</div></div>';
    }
    return html;
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
      // At 100% (slider or wallet) the reward waits for this tap (ST.mainReady);
      // it's there, hidden, below that, so the slider can show it as it moves.
      (streak || m.completed ? '' :
        '<button class="main-complete-btn" data-action="main-complete" data-id="'+attr(m.id)+'"'+(ST.mainReady(m) ? '' : ' hidden')+
          ' aria-label="Complete quest: '+about(m.questName, m.title)+'">Complete quest &middot; +'+num(m.xp)+' XP</button>')+
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
      '<div id="holotapes"></div>'+                        // js/holotapes.js draws it
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
    if (ST.holotapes) ST.holotapes.render();
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

  // Settings' backup line: "Last backup: 3 days ago", in the warning
  // colour when it's time for another one (ST.backupDue).
  function renderBackup(){
    var d = ST.backupDays(), due = ST.backupDue();
    var age = d===null ? 'No backup yet' : 'Last backup: '+(d<=0 ? 'today' : d===1 ? 'yesterday' : d+' days ago');
    var e = el('backup-age');
    if (e){ e.textContent = age; e.classList.toggle('due', due); }
    // The rad meter in the header: the same, in rads.
    var meter = el('rad-meter'), rads = ST.rads();
    if (!meter) return;
    el('rad-text').textContent = rads+' RADS';
    el('rad-fill').style.width = (rads/ST.RADS_MAX*100)+'%';
    meter.classList.toggle('due', due);
    meter.classList.toggle('critical', rads>=ST.RADS_MAX);
    meter.setAttribute('aria-label', rads+' rads. '+age+'. Tap for RadAway: back up your data');
  }
  // A backup made: the RadAway (the rads drain), or just saved when there
  // were none.
  function showRadAway(hadRads){
    if (hadRads){ sound('radaway'); toast('levelup-banner quest-banner', 'RADAWAY ADMINISTERED — backup saved', 3200); }
    else showNotice('Backup saved');
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
    renderBackup();
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
  // One or several found by the same change: one banner. A single one shows
  // its trophy above its name.
  function showBobbleheads(found){
    var names = document.createElement('span');
    names.textContent = found.length===1 ? found[0].name : found.length+' ('+found.map(function(b){ return b.name; }).join(', ')+')';
    sound('bobble', 0.15);
    var banner = toast('levelup-banner quest-banner', found.length===1 ? 'BOBBLEHEAD FOUND: ' : 'BOBBLEHEADS FOUND: ', 3600);
    if (found.length===1){
      var trophy = document.createElement('span');
      trophy.className = 'banner-trophy';
      trophy.innerHTML = bobbleSvg(found[0].id);          // the app's own drawing, no user text
      banner.insertBefore(trophy, banner.firstChild);
    }
    banner.appendChild(names);
  }
  function showPerk(name, rank){
    var perkName = document.createElement('span');
    perkName.textContent = name+(rank>1 ? ' (rank '+rank+')' : '');
    sound('perk');
    toast('levelup-banner quest-banner', 'PERK ACQUIRED: ', 3200).appendChild(perkName);
  }
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
  // A tapped check button pops and fills in amber with a glow, and its row
  // flashes like a terminal redraw; `then` runs once that is over. With
  // reduced motion there is no animation and `then` runs right away.
  function playCheck(btn, then){
    sound('complete');
    if (ST.stayStill()){ then(); return; }
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
    renderBackup: renderBackup,
    showRadAway: showRadAway,
    renderAll: renderAll,
    showXpToast: showXpToast,
    showLevelUp: showLevelUp,
    showQuestCompleted: showQuestCompleted,
    showNotice: showNotice,
    showPerk: showPerk,
    showBobbleheads: showBobbleheads,
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
