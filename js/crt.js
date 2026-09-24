/**
 * CRT — the tube's glass over the screen (.crt in index.html). Its darker
 * edges and inner shadow are plain CSS (css/terminal.css); this file only
 * plays the rare brightness flicker: once every 20-40 s, under 150 ms. With
 * prefers-reduced-motion there is none, and while the app is in the
 * background nothing is planned or played.
 */
(function(ST){
  'use strict';

  var FLICKER_MIN_MS = 20000, FLICKER_MAX_MS = 40000;

  var glass = null;
  var timer = null;
  var motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function stayStill(){ return !!(motion && motion.matches); }
  function hidden(){ return document.visibilityState==='hidden'; }

  function stop(){
    clearTimeout(timer);
    if (glass) glass.removeAttribute('data-flicker');
  }
  // The next flicker, 20-40 s from now. The animation (css/terminal.css)
  // ends on its own; animationend clears it and plans the next one.
  function plan(){
    stop();
    if (!glass || stayStill() || hidden()) return;
    timer = setTimeout(function(){
      if (!stayStill() && !hidden()) glass.setAttribute('data-flicker', '');
    }, FLICKER_MIN_MS + Math.random()*(FLICKER_MAX_MS-FLICKER_MIN_MS));
  }
  function onFlickerEnd(){
    glass.removeAttribute('data-flicker');
    plan();
  }
  // Reduced motion switched on, or the app sent to the background: stop.
  // Back again: plan from scratch.
  function onChange(){
    if (stayStill() || hidden()) stop();
    else plan();
  }

  function init(){
    glass = document.getElementById('crt');
    if (!glass) return;
    glass.addEventListener('animationend', onFlickerEnd);
    if (motion){
      if (motion.addEventListener) motion.addEventListener('change', onChange);
      else if (motion.addListener) motion.addListener(onChange);
    }
    document.addEventListener('visibilitychange', onChange);
    plan();
  }

  ST.crt = { init: init };
})(window.StatusTerminal);
