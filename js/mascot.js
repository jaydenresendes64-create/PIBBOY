/**
 * Mascot — the amber figure in the top-right corner (images/mascot.png).
 * How he moves lives in css/terminal.css: few poses, steps() timing, like
 * Vault Boy in a Pip-Boy. This file only picks when: a short walk every
 * 10-20 s, and one gesture when the tab changes. He never takes a tap
 * (pointer-events:none), with prefers-reduced-motion he stays still, and
 * while the app is in the background nothing is planned or played.
 */
(function(ST){
  'use strict';

  var WALK_MIN_MS = 10000, WALK_MAX_MS = 20000;
  var GESTURES = {status:'nod', quests:'stroll', items:'hop', log:'write'};

  var mover = null;             // .mascot-move: its data-move attribute plays a move
  var walkTimer = null;
  var frame = null;             // the animation frame that starts the next move
  var currentTab = null;
  var motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function stayStill(){ return !!(motion && motion.matches); }
  function hidden(){ return document.visibilityState==='hidden'; }

  function stop(){
    clearTimeout(walkTimer);
    if (frame!==null) cancelAnimationFrame(frame);
    frame = null;
    if (mover) mover.removeAttribute('data-move');
  }
  // Plays one move from css/terminal.css (data-move="..."), cutting short
  // whatever he was doing. The next walk is planned once it's over. The
  // move is set two frames after it's cleared, so the same move can play
  // twice in a row without forcing the page to lay out again right away.
  function play(move){
    stop();
    if (!mover || stayStill() || hidden()) return;
    frame = requestAnimationFrame(function(){
      frame = requestAnimationFrame(function(){
        frame = null;
        mover.setAttribute('data-move', move);
      });
    });
  }
  function planWalk(){
    clearTimeout(walkTimer);
    if (!mover || stayStill() || hidden()) return;
    walkTimer = setTimeout(function(){
      play(Math.random()<0.5 ? 'walk-left' : 'walk-right');
    }, WALK_MIN_MS + Math.random()*(WALK_MAX_MS-WALK_MIN_MS));
  }
  function onMoveEnd(e){
    if (e.target!==mover) return;     // not the breathing, which never ends
    mover.removeAttribute('data-move');
    planWalk();
  }
  // Reduced motion switched on, or the app sent to the background: stop.
  // Back again: plan a walk from scratch.
  function onChange(){
    if (stayStill() || hidden()) stop();
    else planWalk();
  }

  // One short gesture when the tab really changes (not when the open tab is tapped again).
  function onTab(name){
    if (name===currentTab) return;
    currentTab = name;
    if (GESTURES[name]) play(GESTURES[name]);
  }

  function init(tab){
    var root = document.getElementById('mascot');
    mover = root && root.querySelector('.mascot-move');
    if (!mover) return;
    currentTab = tab;
    mover.addEventListener('animationend', onMoveEnd);
    if (motion){
      if (motion.addEventListener) motion.addEventListener('change', onChange);
      else if (motion.addListener) motion.addListener(onChange);
    }
    document.addEventListener('visibilitychange', onChange);
    planWalk();
  }

  ST.mascot = { init: init, onTab: onTab };
})(window.StatusTerminal);
