/**
 * User actions — every change to the state document happens here, followed
 * by the matching re-render and a (debounced) save.
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
  function showXp(amount, leveled){
    R.showXpToast(Number(amount)||0);
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
  function addSideQuest(){
    var q = readNewQuest('new-quest');
    if (!q) return;
    var xp = clamp(parseInt(el('new-quest-xp').value,10)||100,5,500);
    app.state.quests.side.push({id:genId(),questName:q.questName,name:q.objective,xp:xp,done:false});
    R.clearTyped('new-quest-');
    renderQuests(); scheduleSave();
  }
  function addDailyQuest(){
    var q = readNewQuest('new-daily');
    if (!q) return;
    var xp = clamp(parseInt(el('new-daily-xp').value,10)||15,5,100);
    app.state.quests.daily.push({id:genId(),questName:q.questName,name:q.objective,xp:xp,lastDate:null});
    R.clearTyped('new-daily-');
    renderQuests(); scheduleSave();
  }
  function addMainQuest(){
    var q = readNewQuest('new-main');
    if (!q) return;
    var xp = clamp(parseInt(el('new-main-xp').value,10)||1000,10,5000);
    var quest = {id:genId(), questName:q.questName, title:q.objective.slice(0,60),
      progressType:'percent', progress:0, xp:xp, completed:false, skillGains:[], bonus:[]};
    if (el('new-main-type').value==='streak'){
      quest.progressType = 'streak';
      quest.streakTarget = clamp(parseInt(el('new-main-days').value,10)||7, 1, ST.STREAK_MAX_DAYS);
      quest.streakDays = 0;
      quest.lastCheckIn = null;
    }
    app.state.quests.mains.push(quest);
    R.clearTyped('new-main-');
    renderQuests(); scheduleSave();
  }
  function findMain(id){
    return app.state.quests.mains.filter(function(x){ return x.id===id; })[0] || null;
  }
  // Grants a main quest's XP and skill gains, once (ST.completeMain).
  function completeMainQuest(m){
    var reward = ST.completeMain(m);
    if (!reward) return;
    R.showQuestCompleted(m.questName || m.title);
    showXp(reward.xp, reward.leveled);
    renderStatus();
  }
  // A streak quest's check-in, once a day; reaching the target completes it.
  function checkIn(m){
    var result = ST.streakCheckIn(m);
    if (result==='target') completeMainQuest(m);
    return !!result;
  }
  function addInventoryItem(){
    var name = el('new-item-name').value.trim();
    if (!name) return;
    var cat = el('new-item-cat').value;
    app.state.inventory.push({id:genId(),name:name,category:cat});
    R.clearTyped('new-item-');
    renderInventory(); scheduleSave();
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
    renderInventory(); scheduleSave();
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
  function exportData(){
    ST.storage.exportFile(app.state);
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
      el('reset-confirm-area').innerHTML = '<span class="reset-warning">That file isn’t a Status Terminal backup.</span>';
    });
  }
  function confirmImport(){
    if (!pendingImport) return;
    app.state = pendingImport;
    app.pendingProposal = null;
    app.confirmRemoveMain = null;
    app.confirmSpecial = null;
    pendingImport = null;
    el('reset-confirm-area').innerHTML = '';
    renderAll();
    ST.storage.saveNow();
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
    app.state = ST.defaultState();
    app.pendingProposal = null;
    app.confirmRemoveMain = null;
    app.confirmSpecial = null;
    el('reset-confirm-area').innerHTML = '';
    renderAll();
    ST.storage.saveNow();
  }

  // ---------- other windows / leaving ----------
  // Another window saved newer data (storage.js): show it instead. `lost`:
  // a change made here wasn't saved, since it would have overwritten it.
  function adoptState(state, lost){
    app.state = state;
    app.confirmRemoveMain = null;
    app.confirmSpecial = null;
    renderAll();
    if (lost) R.showConflictWarning();
  }
  // Before the page is hidden or closed: a quest name still being typed is
  // saved like a tap elsewhere would. (Objectives and rates are in the state
  // as they're typed.)
  function commitEdits(){
    if (app.finishRename) app.finishRename();
  }

  // ---------- events ----------
  function setupEvents(){
    document.body.addEventListener('click', function(e){
      var tabBtn = e.target.closest('[data-tab]');
      if (tabBtn){
        var tab = tabBtn.getAttribute('data-tab');
        R.switchTab(tab);
        if (ST.mascot) ST.mascot.onTab(tab);
        return;
      }

      var state = app.state;
      var actionBtn = e.target.closest('[data-action]');
      if (actionBtn){
        if (checkPlaying && actionBtn.closest('#tab-quests')) return;
        var action = actionBtn.getAttribute('data-action');
        var key = actionBtn.getAttribute('data-key');
        var id = actionBtn.getAttribute('data-id');
        var dir = parseInt(actionBtn.getAttribute('data-dir')||'0',10);
        if (action==='special-assign'){
          if ((state.unspentSpecialPoints||0)>0 && ST.STAT_KEYS.indexOf(key)!==-1 && state.stats[key]<10){
            app.confirmSpecial = key;
            renderStatus();
            focusStatus('[data-action="special-no"]');
          }
        } else if (action==='special-yes'){
          var statKey = app.confirmSpecial;
          app.confirmSpecial = null;
          if (statKey && (state.unspentSpecialPoints||0)>0 && state.stats[statKey]<10){
            grantStat(statKey, 1);
            state.unspentSpecialPoints -= 1;
            scheduleSave();
          }
          renderStatus();
          focusStatus('[data-action="special-assign"][data-key="'+statKey+'"]');
        } else if (action==='special-no'){
          var askedKey = app.confirmSpecial;
          app.confirmSpecial = null;
          renderStatus();
          focusStatus('[data-action="special-assign"][data-key="'+askedKey+'"]');
        } else if (action==='skill'){
          grantSkill(key, dir);
          renderStatus(); scheduleSave();
        } else if (action==='quest-complete'){
          var q = state.quests.side.filter(function(x){return x.id===id;})[0];
          if (q && !q.done){ q.done=true; addXp(q.xp); afterCheck(actionBtn); }
        } else if (action==='quest-remove'){
          state.quests.side = state.quests.side.filter(function(x){return x.id!==id;});
          renderQuests(); scheduleSave();
        } else if (action==='daily-toggle'){
          var d = state.quests.daily.filter(function(x){return x.id===id;})[0];
          if (d && d.lastDate!==todayStr()){ d.lastDate=todayStr(); addXp(d.xp); afterCheck(actionBtn); }
        } else if (action==='daily-remove'){
          state.quests.daily = state.quests.daily.filter(function(x){return x.id!==id;});
          renderQuests(); scheduleSave();
        } else if (action==='inv-remove'){
          state.inventory = state.inventory.filter(function(x){return x.id!==id;});
          renderInventory(); scheduleSave();
        } else if (action==='wallet-remove'){
          state.finances.holdings = state.finances.holdings.filter(function(x){return x.id!==id;});
          renderInventory(); scheduleSave();
        } else if (action==='bonus-toggle'){
          var owner = findMain(actionBtn.getAttribute('data-quest'));
          var b = owner && (owner.bonus||[]).filter(function(x){return x.id===id;})[0];
          if (b && !b.done){ b.done = true; addXp(b.xp||0); afterCheck(actionBtn); }
        } else if (action==='main-checkin'){
          var sq = findMain(id);
          if (sq && checkIn(sq)) afterCheck(actionBtn);
        } else if (action==='main-remove'){
          app.confirmRemoveMain = id;
          renderQuests();
          var cancel = document.querySelector('[data-action="main-remove-no"]');
          if (cancel) cancel.focus();
        } else if (action==='main-remove-yes'){
          state.quests.mains = state.quests.mains.filter(function(x){return x.id!==id;});
          app.confirmRemoveMain = null;
          renderQuests(); scheduleSave();
        } else if (action==='main-remove-no'){
          app.confirmRemoveMain = null;
          renderQuests();
        } else if (action==='rename'){
          startRename(actionBtn);
        }
        return;
      }

      if (e.target.closest('#wallet-toggle-btn')){ app.walletExpanded = !app.walletExpanded; renderInventory(); return; }

      if (e.target.id==='add-main-btn') addMainQuest();
      else if (e.target.id==='add-quest-btn') addSideQuest();
      else if (e.target.id==='add-daily-btn') addDailyQuest();
      else if (e.target.id==='add-item-btn') addInventoryItem();
      else if (e.target.id==='add-wallet-btn') addHolding();
      else if (e.target.id==='analyze-btn') analyzeEntry();
      else if (e.target.id==='accept-proposal-btn') acceptProposal();
      else if (e.target.id==='reject-proposal-btn') rejectProposal();
      else if (e.target.id==='export-btn') exportData();
      else if (e.target.id==='import-btn') el('import-file').click();
      else if (e.target.id==='import-confirm-btn') confirmImport();
      else if (e.target.id==='import-cancel-btn') cancelImport();
      else if (e.target.id==='reset-btn') showResetConfirm();
      else if (e.target.id==='reset-confirm-btn') doReset();
      else if (e.target.id==='reset-cancel-btn') el('reset-confirm-area').innerHTML='';
    });

    // A main quest's objective and a holding's rate go into the state as
    // they're typed, so closing the app mid-edit keeps them; leaving the box
    // puts back what is stored when what was typed isn't valid.
    document.body.addEventListener('change', function(e){
      if (e.target.classList.contains('main-title-input')){
        var mq = findMain(e.target.getAttribute('data-id'));
        if (mq) e.target.value = mq.title;       // emptied: the objective stays as it was
      } else if (e.target.id==='new-main-type'){
        el('new-main-days-field').hidden = e.target.value!=='streak';
      } else if (e.target.classList.contains('rate-input')){
        renderInventory();          // the CAD values and total, with the rate kept
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
          scheduleSave();
        }
      } else if (e.target.classList.contains('main-progress-input')){
        var m = findMain(e.target.getAttribute('data-id'));
        if (!m) return;
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
      else if (e.target.id==='new-item-name') addInventoryItem();
      else if (e.target.id==='new-wallet-label' || e.target.id==='new-wallet-amount') addHolding();
    });
  }

  ST.events = { setup: setupEvents, adoptState: adoptState, commitEdits: commitEdits };
})(window.StatusTerminal);
