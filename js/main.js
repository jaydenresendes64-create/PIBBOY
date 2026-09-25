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
    if (ST.mascot) ST.mascot.init('status');     // decoration: the app runs without it
    if (ST.crt) ST.crt.init();                    // decoration too
    if (ST.tilt) ST.tilt.init();
    if (ST.sfx) ST.sfx.init();                    // sounds: decoration as well

    ST.storage.load().then(function(saved){
      ST.app.state = saved || ST.defaultState();
      ST.events.setup();
      ST.render.switchTab('status');
      ST.render.renderAll();
      // Caps quests whose target the wallet already reaches complete now.
      if (ST.events.syncCaps()){ ST.render.renderQuests(); ST.storage.scheduleSave(); }
      if (!saved) ST.storage.saveNow();
      ST.storage.requestPersistence();
      remindBackup();
    }, function(){
      ST.render.switchTab('status');
      ST.render.showLoadError();
    });

    ST.ai.probe().then(function(on){
      ST.app.aiAvailable = on;
      ST.render.updateAiIndicator();
    });

    // Don't lose the last half-second of changes when the tab is closed,
    // refreshed or sent to the background.
    function leaving(){
      if (!ST.app.state) return;
      ST.events.commitEdits();
      ST.storage.flush();
    }
    document.addEventListener('visibilitychange', function(){
      if (document.visibilityState==='hidden') leaving();
      else ST.render.refreshIfNewDay();
    });
    window.addEventListener('pagehide', leaving);
    // A new day opens daily quests and streak check-ins again, even when the
    // app was left open overnight or comes back from the browser's page cache.
    window.addEventListener('pageshow', ST.render.refreshIfNewDay);
    setInterval(ST.render.refreshIfNewDay, 60000);
  }

  // Everything lives on this phone: when a backup is due (ST.backupDue), a
  // notice says so, at most once a day. The footer's line always shows it.
  var REMINDED_KEY = 'status_terminal_backup_reminded';
  function remindBackup(){
    if (!ST.backupDue()) return;
    var today = ST.todayStr();
    try{
      if (localStorage.getItem(REMINDED_KEY)===today) return;
      localStorage.setItem(REMINDED_KEY, today);
    }catch(e){ return; }
    var d = ST.backupDays();
    setTimeout(function(){
      ST.render.showNotice((d===null ? 'No backup yet' : 'Last backup '+d+' days ago')+' — Export backup, at the bottom');
    }, 1500);
  }

  document.addEventListener('DOMContentLoaded', boot);

  // Offline use and installing on a phone (see sw.js). Service workers need
  // http(s), so there is none when index.html is opened straight from disk.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('sw.js').catch(function(){});
    });
  }
})(window.StatusTerminal);
