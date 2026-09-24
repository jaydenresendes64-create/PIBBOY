/**
 * Boot — load the saved state, then render and start listening for input.
 * Input is only wired up after the load finishes, so nothing the user does
 * can be overwritten by a save arriving late (the in-Claude version rendered
 * a local copy first and swapped the database copy in afterwards).
 */
(function(ST){
  'use strict';

  function boot(){
    ST.storage.onSaveFailed(ST.render.showSaveWarning);

    ST.storage.load().then(function(saved){
      ST.app.state = ST.mergeDefaults(saved);
      ST.events.setup();
      ST.render.switchTab('status');
      ST.render.renderAll();
      if (!saved) ST.storage.saveNow();
    });

    ST.ai.probe().then(function(on){
      ST.app.aiAvailable = on;
      ST.render.updateAiIndicator();
    });

    // Don't lose the last half-second of changes when the tab is closed,
    // refreshed or sent to the background.
    document.addEventListener('visibilitychange', function(){
      if (document.visibilityState==='hidden') ST.storage.flush();
    });
    window.addEventListener('pagehide', ST.storage.flush);
  }

  document.addEventListener('DOMContentLoaded', boot);
})(window.StatusTerminal);
