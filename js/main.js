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

    ST.storage.load().then(function(saved){
      ST.app.state = saved || ST.defaultState();
      ST.events.setup();
      ST.render.switchTab('status');
      ST.render.renderAll();
      if (!saved) ST.storage.saveNow();
      ST.storage.requestPersistence();
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

  document.addEventListener('DOMContentLoaded', boot);

  // Offline use and installing on a phone (see sw.js). Service workers need
  // http(s), so there is none when index.html is opened straight from disk.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('sw.js').catch(function(){});
    });
  }
})(window.StatusTerminal);
