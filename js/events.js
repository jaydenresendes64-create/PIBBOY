/**
 * User actions — every change to the state document happens here, followed
 * by the matching re-render and a (debounced) save. The MAP tab's are in
 * js/map.js (with js/places.js).
 */
(function(ST){
  'use strict';

  var el = ST.el, clamp = ST.clamp, genId = ST.genId, todayStr = ST.todayStr, todayDisplay = ST.todayDisplay;
  var grantSkill = ST.grantSkill, grantStat = ST.grantStat;
  var app = ST.app;
  var R = ST.render;
  var renderHeader = R.renderHeader, renderStatus = R.renderStatus, renderQuests = R.renderQuests,
      renderInventory = R.renderInventory, renderLog = R.renderLog, renderProposal = R.renderProposal,
      updateAiIndicator = R.updateAiIndicator, renderAll = R.renderAll;
  var scheduleSave = ST.storage.scheduleSave;

  var pendingImport = null;
  var checkPlaying = false;     // a check button's animation is running

  function addXp(amount){
    showXp(amount, ST.gainXp(amount));
  }
  function showXp(amount, leveled, skillGains){
    R.showXpToast(Number(amount)||0, skillGains);
    if (leveled) R.showLevelUp();
    renderHeader();
  }
  // After a check button (side quest, daily quest, bonus objective, streak
  // check-in) changed the state: save right away, but redraw only once the
  // button's animation is over. Taps in the quest list wait until then.
  function afterCheck(btn){
    ST.storage.saveNow();
    checkPlaying = true;
    R.playCheck(btn, function(){
      checkPlaying = false;
      renderStatus();
      renderQuests();
    });
  }

  // After the STATUS tab is redrawn, puts the keyboard focus back on the
  // matching button (when there still is one).
  function focusStatus(selector){
    var btn = el('tab-status').querySelector(selector);
    if (btn && !btn.disabled) btn.focus();
  }

  // ---------- quest / inventory actions ----------
  // The quest name and objective typed in an add row. Both are required: the
  // first empty box gets the cursor and nothing is added.
  function readNewQuest(prefix){
    var nameInput = el(prefix+'-questname');
    var objectiveInput = el(prefix+'-objective');
    var questName = nameInput.value.trim().slice(0, ST.QUEST_NAME_MAX);
    var objective = objectiveInput.value.trim();
    if (!questName){ nameInput.focus(); return null; }
    if (!objective){ objectiveInput.focus(); return null; }
    return {questName:questName, objective:objective};
  }
  // A whole number typed in a box, kept within min-max: an empty box (or
  // one that isn't a number) gives `fallback`, 0 gives the minimum.
  function readWhole(id, fallback, min, max){
    var n = parseInt(el(id).value, 10);
    return clamp(isNaN(n) ? fallback : n, min, max);
  }
  function addSideQuest(){
    var q = readNewQuest('new-quest');
    if (!q) return;
    var xp = readWhole('new-quest-xp', 100, 5, 500);
    var skill = el('new-quest-skill').value;
    var gains = ST.SKILL_KEYS.indexOf(skill)!==-1 ? [{skill:skill, amount:ST.SIDE_SKILL_GAIN}] : [];
    app.state.quests.side.push({id:genId(),questName:q.questName,name:q.objective,xp:xp,done:false,skillGains:gains});
    R.clearTyped('new-quest-');
    renderQuests(); scheduleSave();
  }
  function addDailyQuest(){
    var q = readNewQuest('new-daily');
    if (!q) return;
    var xp = readWhole('new-daily-xp', 15, 5, 100);
    app.state.quests.daily.push({id:genId(),questName:q.questName,name:q.objective,xp:xp,lastDate:null});
    R.clearTyped('new-daily-');
    renderQuests(); scheduleSave();
  }
  function addMainQuest(){
    var q = readNewQuest('new-main');
    if (!q) return;
    var xp = readWhole('new-main-xp', 1000, 10, 5000);
    var quest = {id:genId(), questName:q.questName, title:q.objective.slice(0,60),
      progressType:'percent', progress:0, xp:xp, completed:false, skillGains:[], bonus:[]};
    if (el('new-main-type').value==='streak'){
      quest.progressType = 'streak';
      quest.streakTarget = readWhole('new-main-days', 7, 1, ST.STREAK_MAX_DAYS);
      quest.streakDays = 0;
      quest.lastCheckIn = null;
    } else if (el('new-main-type').value==='caps'){
      var target = Number(el('new-main-caps').value);
      quest.progressType = 'caps';
      quest.capsTarget = isFinite(target) && target>0 ? clamp(target, 0.01, 1e6) : 5;
    }
    app.state.quests.mains.push(quest);
    R.clearTyped('new-main-');
    syncCaps();
    renderQuests(); scheduleSave();
  }
  // Caps quests follow the wallet: after any change to it (a row added,
  // removed or re-rated, a sale), their bars move and the ones that reached
  // their target are completed, with their reward, once.
  function syncCaps(){
    var reached = ST.syncCapsQuests();
    reached.forEach(completeMainQuest);
    return reached.length;
  }
  function walletChanged(){
    syncCaps();
    renderQuests();
  }
  function findMain(id){
    return app.state.quests.mains.filter(function(x){ return x.id===id; })[0] || null;
  }
  // Grants a main quest's XP and skill gains, once (ST.completeMain).
  function completeMainQuest(m){
    var reward = ST.completeMain(m);
    if (!reward) return;
    R.showQuestCompleted(m.questName || m.title);
    showXp(reward.xp, reward.leveled, reward.skillGains);
    renderStatus();
  }
  // A streak quest's check-in, once a day; reaching the target completes it.
  function checkIn(m){
    var result = ST.streakCheckIn(m);
    if (result==='target') completeMainQuest(m);
    return !!result;
  }
  // A price typed in a box: a number of 0 or more, null when the box is
  // empty, undefined when what's in it isn't a price.
  function readPrice(input){
    var text = input.value.trim();
    if (!text) return null;
    var price = Number(text);
    return isFinite(price) && price>=0 ? price : undefined;
  }
  function addInventoryItem(){
    var name = el('new-item-name').value.trim();
    if (!name) return;
    var cat = el('new-item-cat').value;
    var item = {id:genId(),name:name,category:cat};
    if (cat==='SELL'){
      var priceInput = el('new-item-price');
      var price = readPrice(priceInput);
      if (price===undefined){ priceInput.focus(); return; }
      if (price!==null) item.price = price;
    }
    app.state.inventory.push(item);
    R.clearTyped('new-item-');
    renderInventory(); scheduleSave();
  }
  function findItem(id){
    return app.state.inventory.filter(function(x){ return x.id===id; })[0] || null;
  }
  // "Sold for $X? Yes": the amount in the question's box, which starts at
  // the asking price and can be changed. An empty or wrong amount keeps the
  // question open with the cursor in the box.
  function confirmSale(id){
    var input = el('sell-amount-'+id);
    var amount = input ? readPrice(input) : undefined;
    if (amount===undefined || amount===null){ if (input) input.focus(); return; }
    var sale = ST.sellItem(id, amount);
    app.confirmSell = null;
    if (sale){
      R.showSold(sale.name);
      showXp(ST.SALE_XP, sale.leveled);
      renderStatus(); renderLog();
      walletChanged();
      scheduleSave();
    }
    renderInventory();
  }
  function addHolding(){
    var labelInput = el('new-wallet-label');
    var amountInput = el('new-wallet-amount');
    var rateInput = el('new-wallet-rate');
    var label = labelInput.value.trim();
    var amountText = amountInput.value.trim();
    var amount = Number(amountText);
    var rate = Number(rateInput.value);
    if (!label) return;
    // Number('') is 0, so an empty amount used to add a row worth nothing.
    if (!amountText || !isFinite(amount)){ amountInput.focus(); return; }
    if (!isFinite(rate) || rate<=0) rate = 1;
    app.state.finances.holdings.push({id:genId(), label:label, amount:amount, rateToCAD:rate});
    R.clearTyped('new-wallet-');
    renderInventory(); walletChanged(); scheduleSave();
  }

  // ---------- removing, after "Yes, remove" ----------
  var REMOVE_REDRAW = {side:'quests', daily:'quests', item:'items', wallet:'items'};
  function redraw(kind){
    if (REMOVE_REDRAW[kind]==='quests') renderQuests(); else renderInventory();
  }
  // Asks "Remove this ...?" under the row (render.js), with the focus on
  // Cancel. One row question at a time (a sale's included).
  function askRemove(kind, id){
    app.confirmRemove = {kind:kind, id:id};
    app.confirmSell = null;
    app.confirmMove = null;
    redraw(kind);
    var cancel = document.querySelector('[data-action="remove-no"]');
    if (cancel) cancel.focus();
  }
  function remove(kind, id){
    var state = app.state;
    var keep = function(x){ return x.id!==id; };
    if (kind==='side') state.quests.side = state.quests.side.filter(keep);
    else if (kind==='daily') state.quests.daily = state.quests.daily.filter(keep);
    else if (kind==='item') state.inventory = state.inventory.filter(keep);
    else if (kind==='wallet') state.finances.holdings = state.finances.holdings.filter(keep);
    else return;
    app.confirmRemove = null;
    redraw(kind);
    if (kind==='wallet') walletChanged();
    scheduleSave();
  }

  // ---------- quest names ----------
  function findQuest(kind, id){
    var quests = app.state.quests;
    if (kind==='main') return findMain(id);
    var list = kind==='side' ? quests.side : kind==='daily' ? quests.daily : [];
    return list.filter(function(x){ return x.id===id; })[0] || null;
  }
  // Turns a quest's name (or its "+ name" link) into a text box. Enter or
  // tapping elsewhere saves it, Escape cancels; saving an empty box removes
  // the name.
  function startRename(btn){
    var kind = btn.getAttribute('data-kind');
    var quest = findQuest(kind, btn.getAttribute('data-id'));
    if (!quest) return;
    if (app.finishRename) app.finishRename();
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'quest-title-input';
    input.maxLength = ST.QUEST_NAME_MAX;
    input.placeholder = 'Quest name';
    input.setAttribute('aria-label', 'Quest name');
    input.value = quest.questName || '';

    var open = true;
    function finish(save, refocus){
      if (!open) return;
      open = false;
      app.finishRename = null;
      document.removeEventListener('pointerdown', onPointerDown, true);
      // Not when the quest is no longer in the state (another window's
      // newer save replaced it): that would save nothing.
      if (save && findQuest(kind, quest.id)===quest){
        var name = input.value.trim().slice(0, ST.QUEST_NAME_MAX);
        if (name!==(quest.questName||'')){ quest.questName = name; scheduleSave(); }
      }
      var back = R.swapQuestTitle(input, kind, quest);
      if (refocus && back) back.focus();
    }
    function commit(){ finish(true, false); }
    // Tapping a plain part of the page doesn't always take the focus away
    // from the box (iOS), so any tap outside it counts.
    function onPointerDown(e){ if (e.target!==input) commit(); }

    input.addEventListener('keydown', function(e){
      if (e.key==='Enter'){ e.preventDefault(); finish(true, true); }
      else if (e.key==='Escape'){ e.preventDefault(); finish(false, true); }
    });
    input.addEventListener('blur', commit);
    document.addEventListener('pointerdown', onPointerDown, true);
    app.finishRename = commit;
    btn.replaceWith(input);
    input.focus();
    input.select();
  }

  // ---------- log analysis ----------
  function acceptProposal(){
    if (!app.pendingProposal) return;
    var p = app.pendingProposal;
    addXp(p.xp);
    p.skillGains.forEach(function(g){ grantSkill(g.skill, g.amount); });
    ST.addLogEntry({date:todayDisplay(), text:p.text, xp:p.xp, reason:p.reason});
    app.pendingProposal = null;
    renderStatus(); renderLog();
    scheduleSave();
  }
  function rejectProposal(){
    app.pendingProposal = null;
    var area = el('proposal-area');
    if (area) area.innerHTML = '';
  }
  function analyzeEntry(){
    var input = el('log-input');
    var text = input.value.trim();
    if (!text) return;
    var btn = el('analyze-btn');
    btn.disabled = true;
    el('proposal-area').innerHTML = '<div class="thinking">Thinking...</div>';

    function handleResult(result, source){
      app.pendingProposal = {text:text, xp:result.xp, reason:result.reason, skillGains:result.skillGains};
      renderProposal(source);
      btn.disabled = false;
      input.value = '';
    }

    if (app.aiAvailable){
      ST.ai.analyze(text).then(function(data){
        handleResult(ST.ai.sanitizeProposal(data), 'ai');
      }).catch(function(err){
        if (ST.ai.isPermanentError(err)){ app.aiAvailable=false; updateAiIndicator(); }
        handleResult(ST.ai.localHeuristic(text), 'offline');
      });
    } else {
      handleResult(ST.ai.localHeuristic(text), 'offline');
    }
  }

  // ---------- export / import / reset ----------
  // The file handed over (not cancelled): today is the last backup, and the
  // rads drain (the RadAway).
  function exportData(){
    ST.storage.exportFile(app.state).then(function(done){
      if (!done) return;
      var hadRads = ST.rads()>0;
      app.state.lastBackup = todayStr();
      R.renderBackup();
      R.showRadAway(hadRads);
      scheduleSave();
    });
  }
  // Every question left open under a row or in a banner is dropped (the
  // data under it changed as a whole).
  function clearQuestions(){
    app.confirmRemoveMain = null;
    app.confirmSell = null;
    app.confirmRemove = null;
    app.confirmMove = null;
    app.confirmSpecial = null;
  }
  // A whole new state (a backup, a reset): drawn, caps quests brought up to
  // date with its wallet, and saved.
  function replaceState(state){
    app.state = state;
    app.pendingProposal = null;
    clearQuestions();
    el('reset-confirm-area').innerHTML = '';
    renderAll();
    if (syncCaps()) renderQuests();
    ST.storage.saveNow();
  }
  function importBackup(file){
    ST.storage.readJsonFile(file).then(function(raw){
      var imported = ST.sanitizeImported(raw);
      if (!imported) throw new Error('Not a Status Terminal backup');
      pendingImport = imported;
      el('reset-confirm-area').innerHTML =
        '<span class="reset-warning">Replace all data with this backup?</span>'+
        '<button id="import-confirm-btn">Yes, replace</button>'+
        '<button id="import-cancel-btn">Cancel</button>';
    }).catch(function(){
      pendingImport = null;
      if (ST.sfx) ST.sfx.play('error');
      el('reset-confirm-area').innerHTML = '<span class="reset-warning">That file isn’t a Status Terminal backup.</span>';
    });
  }
  function confirmImport(){
    if (!pendingImport) return;
    var imported = pendingImport;
    pendingImport = null;
    replaceState(imported);
  }
  function cancelImport(){
    pendingImport = null;
    el('reset-confirm-area').innerHTML = '';
  }
  function showResetConfirm(){
    pendingImport = null;
    el('reset-confirm-area').innerHTML =
      '<span class="reset-warning">Erase all data?</span>'+
      '<button id="reset-confirm-btn">Yes, erase</button>'+
      '<button id="reset-cancel-btn">Cancel</button>';
  }
  function doReset(){
    replaceState(ST.defaultState());
  }

  // ---------- other windows / leaving ----------
  // Another window saved newer data (storage.js): show it instead. `lost`:
  // a change made here wasn't saved, since it would have overwritten it.
  function adoptState(state, lost){
    app.state = state;
    clearQuestions();
    renderAll();
    if (syncCaps()){ renderQuests(); scheduleSave(); }
    if (lost) R.showConflictWarning();
  }
  // Before the page is hidden or closed: a quest name still being typed is
  // saved like a tap elsewhere would. (Objectives and rates are in the state
  // as they're typed.)
  function commitEdits(){
    if (app.finishRename) app.finishRename();
  }

  // ---------- taps ----------
  // What a button with data-action does, by that action: run(button, id, key)
  // with its data-id and data-key. One row question at a time: opening one
  // (remove, sell, move) closes the others.
  function reward(btn, result){
    if (!result) return;
    showXp(result.xp, result.leveled, result.skillGains);
    afterCheck(btn);
  }
  var ACTIONS = {
    // S.P.E.C.I.A.L.: a level-up point, only after "Yes".
    'special-assign': function(btn, id, key){
      var s = app.state;
      if (!((s.unspentSpecialPoints||0)>0 && ST.STAT_KEYS.indexOf(key)!==-1 && s.stats[key]<10)) return;
      app.confirmSpecial = key;
      renderStatus();
      focusStatus('[data-action="special-no"]');
    },
    'special-yes': function(){
      var s = app.state, key = app.confirmSpecial;
      app.confirmSpecial = null;
      if (key && (s.unspentSpecialPoints||0)>0 && s.stats[key]<10){
        grantStat(key, 1);
        s.unspentSpecialPoints -= 1;
        scheduleSave();
      }
      renderStatus();
      focusStatus('[data-action="special-assign"][data-key="'+key+'"]');
    },
    'special-no': function(){
      var key = app.confirmSpecial;
      app.confirmSpecial = null;
      renderStatus();
      focusStatus('[data-action="special-assign"][data-key="'+key+'"]');
    },
    'skill': function(btn, id, key){
      grantSkill(key, parseInt(btn.getAttribute('data-dir')||'0', 10));
      renderStatus(); scheduleSave();
    },
    // Quests: every reward through state.js, once (completeSide/Daily/Bonus).
    'quest-complete': function(btn, id){
      var q = findQuest('side', id);
      reward(btn, q && ST.completeSide(q));
    },
    'daily-toggle': function(btn, id){
      var d = findQuest('daily', id);
      reward(btn, d && ST.completeDaily(d));
    },
    'bonus-toggle': function(btn, id){
      var owner = findMain(btn.getAttribute('data-quest'));
      var b = owner && (owner.bonus||[]).filter(function(x){ return x.id===id; })[0];
      reward(btn, b && ST.completeBonus(b));
    },
    'main-checkin': function(btn, id){
      var m = findMain(id);
      if (m && checkIn(m)) afterCheck(btn);
    },
    'main-remove': function(btn, id){
      app.confirmRemoveMain = id;
      renderQuests();
      var cancel = document.querySelector('[data-action="main-remove-no"]');
      if (cancel) cancel.focus();
    },
    'main-remove-yes': function(btn, id){
      app.state.quests.mains = app.state.quests.mains.filter(function(x){ return x.id!==id; });
      app.confirmRemoveMain = null;
      renderQuests(); scheduleSave();
    },
    'main-remove-no': function(){
      app.confirmRemoveMain = null;
      renderQuests();
    },
    'rename': function(btn){ startRename(btn); },
    // Removing a row: asks first, under it.
    'quest-remove': function(btn, id){ askRemove('side', id); },
    'daily-remove': function(btn, id){ askRemove('daily', id); },
    'inv-remove': function(btn, id){ askRemove('item', id); },
    'wallet-remove': function(btn, id){ askRemove('wallet', id); },
    'remove-yes': function(btn, id){ remove(btn.getAttribute('data-kind'), id); },
    'remove-no': function(btn){
      app.confirmRemove = null;
      redraw(btn.getAttribute('data-kind'));
    },
    // Items: move to another category, sell.
    'inv-move': function(btn, id){
      app.confirmMove = app.confirmMove===id ? null : id;
      app.confirmRemove = null;
      app.confirmSell = null;
      renderInventory();
      var firstChoice = document.querySelector('[data-action="move-to"]');
      if (firstChoice) firstChoice.focus();
    },
    'move-to': function(btn, id, key){
      app.confirmMove = null;
      if (ST.moveItem(id, key)) scheduleSave();
      renderInventory();
    },
    'move-no': function(){
      app.confirmMove = null;
      renderInventory();
    },
    'sell': function(btn, id){
      app.confirmSell = id;
      app.confirmRemove = null;
      app.confirmMove = null;
      renderInventory();
      var amountBox = el('sell-amount-'+id);
      if (amountBox) amountBox.focus();
    },
    'sell-yes': function(btn, id){ confirmSale(id); },
    // The header's rad meter: a backup (RadAway).
    'radaway': function(){ exportData(); },
    'sell-no': function(){
      app.confirmSell = null;
      renderInventory();
    }
  };
  // Buttons known by their id.
  var BUTTONS = {
    'add-main-btn': addMainQuest,
    'add-quest-btn': addSideQuest,
    'add-daily-btn': addDailyQuest,
    'add-item-btn': addInventoryItem,
    'add-wallet-btn': addHolding,
    'analyze-btn': analyzeEntry,
    'accept-proposal-btn': acceptProposal,
    'reject-proposal-btn': rejectProposal,
    'tilt-btn': function(){ if (ST.tilt) ST.tilt.toggle(); },
    'sound-btn': function(){ if (ST.sfx) ST.sfx.toggleSound(); },
    'power-btn': function(){ if (ST.sfx) ST.sfx.togglePowerScreen(); },
    'sounds-btn': function(){ if (ST.sfxCustom) ST.sfxCustom.open(); },
    'export-btn': exportData,
    'import-btn': function(){ el('import-file').click(); },
    'import-confirm-btn': confirmImport,
    'import-cancel-btn': cancelImport,
    'reset-btn': showResetConfirm,
    'reset-confirm-btn': doReset,
    'reset-cancel-btn': function(){ el('reset-confirm-area').innerHTML = ''; }
  };
  function onClick(e){
    var tabBtn = e.target.closest('[data-tab]');
    if (tabBtn){
      var tab = tabBtn.getAttribute('data-tab');
      R.switchTab(tab);
      if (tab==='map' && ST.map) ST.map.show();
      if (ST.mascot) ST.mascot.onTab(tab);
      return;
    }
    var actionBtn = e.target.closest('[data-action]');
    if (actionBtn){
      // Taps in the quest list wait for a check's animation to end.
      if (checkPlaying && actionBtn.closest('#tab-quests')) return;
      var run = ACTIONS[actionBtn.getAttribute('data-action')];
      if (run) run(actionBtn, actionBtn.getAttribute('data-id'), actionBtn.getAttribute('data-key'));
      return;
    }
    if (e.target.closest('#wallet-toggle-btn')){ app.walletExpanded = !app.walletExpanded; renderInventory(); return; }
    var button = Object.prototype.hasOwnProperty.call(BUTTONS, e.target.id) ? BUTTONS[e.target.id] : null;
    if (button) button();
  }

  // ---------- events ----------
  function setupEvents(){
    document.body.addEventListener('click', onClick);

    // A main quest's objective and a holding's rate go into the state as
    // they're typed, so closing the app mid-edit keeps them; leaving the box
    // puts back what is stored when what was typed isn't valid.
    document.body.addEventListener('change', function(e){
      if (e.target.classList.contains('main-title-input')){
        var mq = findMain(e.target.getAttribute('data-id'));
        if (mq) e.target.value = mq.title;       // emptied: the objective stays as it was
      } else if (e.target.id==='new-main-type'){
        el('new-main-days-field').hidden = e.target.value!=='streak';
        el('new-main-caps-field').hidden = e.target.value!=='caps';
      } else if (e.target.id==='new-item-cat'){
        el('new-item-price').hidden = e.target.value!=='SELL';
      } else if (e.target.classList.contains('rate-input')){
        renderInventory();          // the CAD values and total, with the rate kept
      } else if (e.target.classList.contains('price-input')){
        // Only a wrong price needs redrawing (the stored one put back): a
        // redraw here would replace the row under a tap on its Sold button.
        if (readPrice(e.target)===undefined) renderInventory();
      } else if (e.target.id==='import-file'){
        var file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (file) importBackup(file);
      }
    });
    document.body.addEventListener('input', function(e){
      var state = app.state;
      if (e.target.classList.contains('main-title-input')){
        var mq = findMain(e.target.getAttribute('data-id'));
        var title = e.target.value.trim().slice(0,60);
        if (mq && title && title!==mq.title){ mq.title = title; scheduleSave(); }
      } else if (e.target.classList.contains('rate-input')){
        var hid = e.target.getAttribute('data-id');
        var h = state.finances.holdings.filter(function(x){return x.id===hid;})[0];
        var newRate = Number(e.target.value);
        if (h && e.target.value.trim() && isFinite(newRate) && newRate>0 && newRate!==h.rateToCAD){
          h.rateToCAD = newRate;
          walletChanged();
          scheduleSave();
        }
      } else if (e.target.classList.contains('price-input')){
        var item = findItem(e.target.getAttribute('data-id'));
        var price = readPrice(e.target);
        if (!item || price===undefined) return;
        if (price===null){ if ('price' in item){ delete item.price; scheduleSave(); } }
        else if (price!==item.price){ item.price = price; scheduleSave(); }
      } else if (e.target.classList.contains('main-progress-input')){
        var m = findMain(e.target.getAttribute('data-id'));
        if (!m) return;
        // A completed quest's slider is locked (render.js disables it).
        if (m.completed){ e.target.value = m.progress; return; }
        m.progress = parseInt(e.target.value,10);
        if (m.progress>=100 && !m.completed){
          completeMainQuest(m);
          renderQuests();
        } else {
          var pctEl = e.target.parentNode.querySelector('.progress-pct');
          if (pctEl) pctEl.textContent = m.progress+'%';
        }
        scheduleSave();
      }
    });
    document.body.addEventListener('keydown', function(e){
      if (e.key!=='Enter') return;
      var targetId = e.target.id || '';
      if (targetId.indexOf('new-main-')===0) addMainQuest();
      else if (targetId.indexOf('new-quest-')===0) addSideQuest();
      else if (targetId.indexOf('new-daily-')===0) addDailyQuest();
      else if (e.target.id==='new-item-name' || e.target.id==='new-item-price') addInventoryItem();
      else if (e.target.classList.contains('sell-amount')) confirmSale(e.target.getAttribute('data-id'));
      else if (/^new-wallet-(label|amount|rate)$/.test(e.target.id)) addHolding();
    });
  }

  ST.events = { setup: setupEvents, adoptState: adoptState, commitEdits: commitEdits, syncCaps: syncCaps };
})(window.StatusTerminal);
