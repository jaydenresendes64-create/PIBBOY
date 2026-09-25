/**
 * 3D tilt — the screen's layers follow the phone's motion (DeviceOrientation),
 * or lightly the mouse on a computer, smoothed with requestAnimationFrame.
 *
 * The decorative layers (the glass with its vignette and frame edge, the
 * scanlines, the mascot) turn by at most MAX_TURN_DEG. Everything you tap
 * (#screen) only shifts, by at most MAX_SHIFT_PX, and never turns, so a tap
 * lands where it's aimed.
 *
 * Off by default. The footer link "3D tilt: off/on" switches it, and the
 * choice is kept on this device only (localStorage, not in the saved data).
 * On iPhone, motion needs a permission that can only be asked from a tap:
 * the link's tap asks it; after the app is reopened, if iOS wants to ask
 * again, the first tap anywhere does. With prefers-reduced-motion, or while
 * the app is in the background, it stops completely (no listener, no frame).
 *
 * While a finger (or the mouse button) is down on the MAP, the layers hold
 * still (hold()), so a drag or a pinch there stays exactly under the finger.
 */
(function(ST){
  'use strict';

  var PREF_KEY = 'status_terminal_tilt';        // '1': on, on this device
  var MAX_SHIFT_PX = 4;
  var MAX_TURN_DEG = 3;
  var GLARE_SHIFT_PX = 14;      // how far the glass's reflection slides at full tilt
  var PHONE_RANGE_DEG = 20;     // turning the phone this far gives the full effect
  var MOUSE_SCALE = 0.5;        // the mouse only gives half of it
  var REST_FOLLOW = 0.01;       // how fast the resting position follows the phone
  var EASE = 0.12;              // share of the way covered each 60th of a second

  var on = false;               // the player's choice
  var running = false;          // listening and moving (on, visible, motion allowed)
  var held = false;             // a gesture on the map is under way: stay put
  var target = {x:0, y:0};      // where the layers are heading, -1..1
  var current = {x:0, y:0};
  var rest = null;              // how the phone is held when still
  var frame = null;
  var lastTime = 0;
  var screenLayer = null, glass = [], glare = null, mascot = null, button = null;
  var motion = ST.motion, stayStill = ST.stayStill;      // the phone's Reduce Motion setting
  function hidden(){ return document.visibilityState==='hidden'; }
  function clamp(v){ return Math.max(-1, Math.min(1, v)); }

  function readChoice(){ try{ return localStorage.getItem(PREF_KEY)==='1'; }catch(e){ return false; } }
  function keepChoice(){
    try{
      if (on) localStorage.setItem(PREF_KEY, '1');
      else localStorage.removeItem(PREF_KEY);
    }catch(e){}
  }
  function showChoice(){
    if (!button) return;
    button.textContent = '3D tilt: '+(on ? 'on' : 'off');
    button.setAttribute('aria-pressed', String(on));
  }

  // ---------- moving the layers ----------
  // Whole device pixels, so the text never sits between two and blurs.
  function px(v){
    var ratio = window.devicePixelRatio || 1;
    return Math.round(v*ratio)/ratio;
  }
  function apply(){
    var shift = 'translate3d('+px(current.x*MAX_SHIFT_PX)+'px,'+px(current.y*MAX_SHIFT_PX)+'px,0)';
    var turn = 'perspective(800px) rotateX('+(-current.y*MAX_TURN_DEG).toFixed(3)+'deg) rotateY('+(current.x*MAX_TURN_DEG).toFixed(3)+'deg)';
    screenLayer.style.transform = shift;
    glass.forEach(function(layer){ layer.style.transform = turn; });
    // The reflection on the glass slides the other way, a little, so the
    // glass looks like it has depth (css: .crt-glare).
    if (glare){
      glare.style.setProperty('--glare-x', (-current.x*GLARE_SHIFT_PX).toFixed(1)+'px');
      glare.style.setProperty('--glare-y', (-current.y*GLARE_SHIFT_PX).toFixed(1)+'px');
    }
    // The mascot stays beside the name (it shifts with the page) and turns.
    if (mascot) mascot.style.transform = shift+' '+turn;
  }
  function clear(){
    screenLayer.style.transform = '';
    glass.forEach(function(layer){ layer.style.transform = ''; });
    if (glare){ glare.style.removeProperty('--glare-x'); glare.style.removeProperty('--glare-y'); }
    if (mascot) mascot.style.transform = '';
  }
  // One frame: a step towards the target. Stops once it's there; the next
  // motion starts it again.
  function step(time){
    frame = null;
    var k = 1 - Math.pow(1-EASE, lastTime ? Math.min(time-lastTime, 100)/16.7 : 1);
    lastTime = time;
    current.x += (target.x-current.x)*k;
    current.y += (target.y-current.y)*k;
    if (Math.abs(target.x-current.x)<0.002 && Math.abs(target.y-current.y)<0.002){
      current.x = target.x; current.y = target.y;
      lastTime = 0;
    } else {
      frame = requestAnimationFrame(step);
    }
    apply();
  }
  function aim(x, y){
    if (held) return;
    target.x = clamp(x); target.y = clamp(y);
    if (frame===null) frame = requestAnimationFrame(step);
  }

  // ---------- input ----------
  function screenAngle(){
    var o = window.screen && window.screen.orientation;
    return o && typeof o.angle==='number' ? o.angle : (Number(window.orientation)||0);
  }
  function onOrientation(e){
    if (typeof e.beta!=='number' || typeof e.gamma!=='number') return;
    var angle = screenAngle(), x, y;
    if (angle===90){ x = e.beta; y = -e.gamma; }
    else if (angle===270 || angle===-90){ x = -e.beta; y = e.gamma; }
    else if (angle===180){ x = -e.gamma; y = -e.beta; }
    else { x = e.gamma; y = e.beta; }
    // However the phone is held, that becomes the centre after a moment.
    if (!rest) rest = {x:x, y:y};
    rest.x += (x-rest.x)*REST_FOLLOW;
    rest.y += (y-rest.y)*REST_FOLLOW;
    aim((x-rest.x)/PHONE_RANGE_DEG, (y-rest.y)/PHONE_RANGE_DEG);
  }
  function onPointerMove(e){
    if (e.pointerType!=='mouse') return;
    aim((e.clientX/window.innerWidth*2-1)*MOUSE_SCALE, (e.clientY/window.innerHeight*2-1)*MOUSE_SCALE);
  }
  function onMouseOut(e){ if (!e.relatedTarget) aim(0, 0); }      // left the window

  function start(){
    if (running || !on || stayStill() || hidden()) return;
    running = true;
    rest = null;
    window.addEventListener('deviceorientation', onOrientation);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('mouseout', onMouseOut);
  }
  function stop(){
    if (!running) return;
    running = false;
    window.removeEventListener('deviceorientation', onOrientation);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('mouseout', onMouseOut);
    if (frame!==null) cancelAnimationFrame(frame);
    frame = null;
    lastTime = 0;
    target.x = target.y = current.x = current.y = 0;
    clear();
  }
  // Reduced motion switched on, or the app sent to the background: stop.
  // Back again: start from the centre.
  function onChange(){
    if (on && !stayStill() && !hidden()) start();
    else stop();
  }

  // ---------- iPhone motion permission ----------
  function askable(){
    return !!(window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission==='function');
  }
  // Resolves true when motion is allowed. Only a tap can make iOS ask, and
  // only when this is called right in the tap (not after a promise).
  function ask(){
    try{
      return Promise.resolve(window.DeviceOrientationEvent.requestPermission()).then(function(answer){
        return answer==='granted';
      }, function(){ return false; });
    }catch(e){ return Promise.resolve(false); }
  }
  function refused(){
    on = false;
    keepChoice();
    showChoice();
    stop();
    if (ST.render) ST.render.showNotice('3D tilt off: motion access not allowed');
  }
  // After reopening the app with tilt on: iOS may want to ask again, which
  // only a tap can do. The first tap anywhere asks (not the link itself,
  // whose tap switches tilt off).
  function askOnFirstTap(e){
    document.removeEventListener('click', askOnFirstTap, true);
    if (!on || (e.target.closest && e.target.closest('#tilt-btn'))) return;
    ask().then(function(ok){ if (!ok && on) refused(); });
  }

  // The footer link. The permission request is made right in the tap, as
  // iOS requires.
  function toggle(){
    document.removeEventListener('click', askOnFirstTap, true);
    on = !on;
    keepChoice();
    showChoice();
    if (!on){ stop(); return; }
    if (askable()) ask().then(function(ok){ if (!ok && on) refused(); });
    start();
  }

  function init(){
    screenLayer = document.getElementById('screen');
    button = document.getElementById('tilt-btn');
    if (!screenLayer) return;
    glass = [document.getElementById('crt'), document.querySelector('.scan-overlay')].filter(Boolean);
    mascot = document.getElementById('mascot');
    glare = document.querySelector('.crt-glare');
    on = readChoice();
    showChoice();
    if (motion){
      if (motion.addEventListener) motion.addEventListener('change', onChange);
      else if (motion.addListener) motion.addListener(onChange);
    }
    document.addEventListener('visibilitychange', onChange);
    if (on && askable()){
      ask().then(function(ok){
        if (!ok && on) document.addEventListener('click', askOnFirstTap, true);
      });
    }
    start();
  }

  // The map (js/map.js): true while a gesture is on it. The layers stop where
  // they are, and follow the motion again once it's over.
  function hold(value){
    held = !!value;
    if (held){
      if (frame!==null) cancelAnimationFrame(frame);
      frame = null;
      lastTime = 0;
      target.x = current.x; target.y = current.y;
    }
  }

  ST.tilt = { init: init, toggle: toggle, hold: hold };
})(window.StatusTerminal);
