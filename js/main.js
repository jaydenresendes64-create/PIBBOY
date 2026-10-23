/**
 * Boot — load the saved state, then render and start listening for input.
 * Input is only wired up after the load finishes, so nothing the user does
 * can be overwritten by a save arriving late. When saved data exists but
 * can't be read, the app stops there with a message: nothing is shown,
 * changed or saved (see storage.js).
 */
(function(ST){
  'use strict';

  function boot(){
    ST.storage.onSaveFailed(ST.render.showSaveWarning);
    ST.storage.onExternalChange(ST.events.adoptState);
    ST.storage.onNewerVersion(ST.render.showNewerVersion);
    if (ST.mascot) ST.mascot.init('vitals');     // decoration: the app runs without it
    if (ST.crt) ST.crt.init();                    // decoration too
    if (ST.tilt) ST.tilt.init();
    if (ST.sfx) ST.sfx.init();                    // sounds: decoration as well
    if (ST.weather) ST.weather.init();            // the topbar's weather (decoration)

    ST.storage.load().then(function(saved){
      ST.app.state = saved || ST.defaultState();
      ST.events.setup();
      if (ST.vitals) ST.vitals.init();            // VITALS and the chem-free streak's taps
      if (ST.trials) ST.trials.init();            // VITALS → TRIALS
      // The app opens on VITALS: the day's check-in, then what to do today.
      ST.render.switchTab(ST.vitals ? 'vitals' : 'status');
      ST.render.renderAll();
      if (ST.holotapes) ST.holotapes.init();      // the LOG tab's recordings (on this device)
      // Caps quests' bars follow the wallet (at their target, their Complete button shows).
      if (ST.events.syncCaps()){ ST.render.renderQuests(); ST.storage.scheduleSave(); }
      if (!saved) ST.storage.saveNow();
      ST.storage.requestPersistence();
      remindBackup();
      afterBoot(ST.events.checkBobbleheads);      // the ones this save already earned
    }, function(){
      ST.render.switchTab('status');
      ST.render.showLoadError();
    });

    ST.ai.probe().then(function(on){
      ST.app.aiAvailable = on;
      ST.render.updateAiIndicator();
    });

    document.addEventListener('visibilitychange', function(){
      if (document.visibilityState==='hidden') leaving();
      else newDay();
    });
    window.addEventListener('pagehide', leaving);
    // A new day opens daily quests and streak check-ins again, even when the
    // app was left open overnight or comes back from the browser's page cache;
    // the chem-free streak's count goes up, maybe to a milestone.
    window.addEventListener('pageshow', newDay);
    setInterval(newDay, 60000);
  }
  // Don't lose the last half-second of changes when the tab is closed,
  // refreshed or sent to the background (or before an update reloads it).
  function leaving(){
    if (!ST.app.state) return;
    ST.events.commitEdits();
    ST.storage.flush();
  }
  function newDay(){
    ST.render.refreshIfNewDay();
    if (ST.vitals) ST.vitals.refreshIfNewDay();   // VITALS' day starts at 4:00
    if (ST.app.state) ST.events.checkBobbleheads();
  }

  // Runs `fn` once the app is on show: after the power-on screen and the
  // RobCo boot, so its banners aren't hidden under them.
  function afterBoot(fn){
    var waited = 0;
    (function check(){
      var covered = document.getElementById('power-on') || document.querySelector('.robco');
      if (covered && waited<60000){ waited += 400; setTimeout(check, 400); return; }
      setTimeout(fn, 600);
    })();
  }

  // Everything lives on this phone: when a backup is due (ST.backupDue), a
  // notice says so, at most once a day. Settings and the rad meter always show it.
  var REMINDED_KEY = 'status_terminal_backup_reminded';
  function remindBackup(){
    if (!ST.backupDue()) return;
    var today = ST.todayStr();
    try{
      if (localStorage.getItem(REMINDED_KEY)===today) return;
      localStorage.setItem(REMINDED_KEY, today);
    }catch(e){ return; }
    var d = ST.backupDays();
    afterBoot(function(){
      if (ST.sfx) ST.sfx.play('geiger');
      ST.render.showNotice('☢ '+ST.rads()+' RADS — '+(d===null ? 'no backup yet' : 'last backup '+d+' days ago')+
        '. Tap the rad meter for RadAway');
    });
  }

  // The topbar's ONLINE, as it really is: OFFLINE with no signal (the app
  // still works; only the map's new tiles, routes and weather need it).
  function showNetwork(){
    var on = navigator.onLine!==false;
    var text = document.getElementById('net-text'), box = document.getElementById('net-status');
    if (text) text.textContent = on ? 'ONLINE' : 'OFFLINE';
    if (box) box.classList.toggle('offline', !on);
  }
  window.addEventListener('online', showNetwork);
  window.addEventListener('offline', showNetwork);
  document.addEventListener('DOMContentLoaded', showNetwork);

  document.addEventListener('DOMContentLoaded', boot);

  // An iPhone shows a control's pressed look (:active: a tab's key going
  // down, the trial counter) only when the page listens for touches. This
  // listener does nothing, and is passive: it never holds up scrolling.
  document.addEventListener('touchstart', function(){}, {passive:true});
  // A slider's filled part follows its knob (ST.rangeFill drew where it was).
  document.addEventListener('input', function(e){
    var t = e.target;
    if (t && t.type==='range') t.style.setProperty('--p', ST.rangeShare(t.value, t.min, t.max));
  }, true);

  // ---------- opening at once, and updates (sw.js) ----------
  // The app opens from its cache. A new version downloads whole in the
  // background and waits; it's put in when the app goes to the background,
  // its changes saved first (leaving()), and the page reloads on it, so old
  // and new files never run together. Waiting already when the app opens,
  // it's put in at once unless the app was touched. Back on screen after
  // UPDATE_CHECK_MS, the app asks for a new version again (a phone keeps a
  // Home Screen app running for days without reopening it).
  var UPDATE_CHECK_MS = 30*60*1000;
  var registration = null, touched = false;
  function watchUpdates(reg){
    if (!reg) return;                                  // service workers blocked
    var sw = navigator.serviceWorker, controlled = !!sw.controller, reloading = false, checked = Date.now();
    registration = reg;
    sw.addEventListener('controllerchange', function(){
      if (!controlled){ controlled = true; return; }       // the first version: nothing to swap
      if (reloading) return;
      reloading = true;
      leaving();
      location.reload();
    });
    document.addEventListener('visibilitychange', function(){
      if (document.visibilityState==='hidden'){ putIn(); return; }
      if (Date.now()-checked>UPDATE_CHECK_MS){ checked = Date.now(); reg.update().catch(function(){}); }
    });
    if (!touched) putIn();
    function putIn(){
      if (!reg.waiting || !controlled) return;
      leaving();
      reg.waiting.postMessage({type:'SKIP_WAITING'});
    }
  }
  ['pointerdown', 'keydown'].forEach(function(type){
    document.addEventListener(type, function(){ touched = true; }, {capture:true, once:true});
  });
  // "Reopen" (a newer version saved the data, storage.js): that version,
  // fetched if it isn't here yet, rather than this one again from the cache.
  ST.reopen = function(){
    var reg = registration;
    if (!reg){ location.reload(); return; }
    var ready = reg.waiting ? Promise.resolve() : reg.update().then(function(){ return installed(reg); });
    ready.then(function(){
      if (reg.waiting && navigator.serviceWorker.controller) reg.waiting.postMessage({type:'SKIP_WAITING'});
      else location.reload();
    }, function(){ location.reload(); });
  };
  // Resolves once a version being downloaded is installed (or isn't), 20 s at most.
  function installed(reg){
    return new Promise(function(resolve){
      var w = reg.installing;
      if (!w){ resolve(); return; }
      var timer = setTimeout(resolve, 20000);
      w.addEventListener('statechange', function(){
        if (w.state!=='installing'){ clearTimeout(timer); resolve(); }
      });
    });
  }
  // Service workers need http(s), so there is none when index.html is
  // opened straight from disk.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('sw.js').then(watchUpdates).catch(function(){});
    });
  }
})(window.StatusTerminal);
