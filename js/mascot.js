/**
 * Mascot — the amber figure in the top-right corner (images/mascot.png).
 * How he moves lives in css/terminal.css: few poses, steps() timing, like
 * Vault Boy in a Pip-Boy. This file only picks when: a short walk every
 * 10-20 s, and one gesture when the tab changes. He never takes a tap
 * (pointer-events:none), and with prefers-reduced-motion he stays still.
 */
(function(ST){
  'use strict';

  var WALK_MIN_MS = 10000, WALK_MAX_MS = 20000;
  var GESTURES = {status:'nod', quests:'stroll', items:'hop', log:'write'};

  var mover = null;             // .mascot-move: its data-move attribute plays a move
  var walkTimer = null;
  var currentTab = null;
  var motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function stayStill(){ return !!(motion && motion.matches); }

  // Plays one move from css/terminal.css (data-move="..."), cutting short
  // whatever he was doing. The next walk is planned once it's over.
  function play(move){
    clearTimeout(walkTimer);
    if (!mover || stayStill()) return;
    mover.removeAttribute('data-move');
    void mover.offsetWidth;     // restarts the animation, even for the same move twice
    mover.setAttribute('data-move', move);
  }
  function planWalk(){
    clearTimeout(walkTimer);
    if (!mover || stayStill()) return;
    walkTimer = setTimeout(function(){
      play(Math.random()<0.5 ? 'walk-left' : 'walk-right');
    }, WALK_MIN_MS + Math.random()*(WALK_MAX_MS-WALK_MIN_MS));
  }
  function onMoveEnd(e){
    if (e.target!==mover) return;     // not the breathing, which never ends
    mover.removeAttribute('data-move');
    planWalk();
  }
  function onMotionChange(){
    if (stayStill()){
      clearTimeout(walkTimer);
      if (mover) mover.removeAttribute('data-move');
    } else {
      planWalk();
    }
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
      if (motion.addEventListener) motion.addEventListener('change', onMotionChange);
      else if (motion.addListener) motion.addListener(onMotionChange);
    }
    planWalk();
  }

  ST.mascot = { init: init, onTab: onTab };
})(window.StatusTerminal);
