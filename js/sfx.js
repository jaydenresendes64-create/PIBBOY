/**
 * Sounds — original effects in the spirit of the Fallout Pip-Boy, all made
 * in code with the Web Audio API: no audio files, nothing copied from a game.
 * Everything goes through one "old speaker" chain (a narrow band, a little
 * saturation, a compressor), so the sounds come out mechanical and lo-fi
 * rather than like phone notifications.
 *
 *   boot      relay click → rising whine → tube "thunk" → crackle into a hum
 *   tick      a dry knob detent: scrolling a list, the progress slider
 *   press     any button's click
 *   tab       a heavier clunk with a burst of static
 *   complete  two-tone blip: a quest, bonus, daily or streak check
 *   levelUp   rising arpeggio with a static tail
 *   quest     a main quest completed: arpeggio into a held chord
 *   discover  a radar ping with an echo: a new place on the MAP
 *   sold      bottle caps clinking
 *   error     low double buzz
 *
 * Browsers only allow sound after a tap: the audio starts on the first one,
 * and anything asked before that is simply skipped. While the app is in the
 * background the audio is suspended.
 *
 * Power-on screen: when the app opens, a black screen says "TAP TO POWER ON";
 * the tap plays boot while the screen lights up like a tube (css/terminal.css).
 *
 * Two footer links, kept on this device only (localStorage, not in the saved
 * data): "Sound: on/off" (on by default) and "Power-on: on/off" (on by
 * default; off opens the app directly, and boot plays on the first tap).
 */
(function(ST){
  'use strict';

  var SOUND_KEY = 'status_terminal_sound';        // '0': sound off on this device
  var POWER_KEY = 'status_terminal_power_on';     // '0': no power-on screen
  var MASTER_VOLUME = 0.55;
  var TICK_STEP_PX = 56;        // one tick per this much scrolling (about a list row)
  var TICK_MIN_GAP_MS = 66;     // at most about 15 ticks a second
  var POWER_ON_MS = 700;        // the tube lighting up (css: crtPowerOn)

  var ctx = null, output = null, noise = null;
  var unlocked = false;
  var soundOn = true, powerScreen = true;
  var booted = false;           // the boot sound has played this session
  var lastScrollY = 0;
  var scrollTick = makeTicker(TICK_STEP_PX, TICK_MIN_GAP_MS);
  var sliderBuckets = new WeakMap();

  // ---------- device preferences ----------
  function readPref(key){ try{ return localStorage.getItem(key)!=='0'; }catch(e){ return true; } }
  function keepPref(key, value){
    try{
      if (value) localStorage.removeItem(key);
      else localStorage.setItem(key, '0');
    }catch(e){}
  }

  // ---------- pure helpers (tested in tests/sfx.test.js) ----------
  // Scroll ticks: feed it each scroll's distance; returns true when a tick is
  // due (every `step` px, never closer together than `gap` ms).
  function makeTicker(step, gap){
    var travelled = 0, last = -Infinity;
    return function(distance, now){
      travelled += Math.abs(distance) || 0;
      if (travelled < step) return false;
      travelled %= step;
      if (now-last < gap) return false;
      last = now;
      return true;
    };
  }
  // Which tenth of its range a slider is in (0..10).
  function sliderBucket(value, min, max){
    var span = (Number(max)||100) - (Number(min)||0);
    if (!(span > 0)) return 0;
    var share = ((Number(value)||0) - (Number(min)||0)) / span;
    return Math.max(0, Math.min(10, Math.floor(share*10 + 1e-9)));
  }

  // ---------- the audio chain ----------
  function audioClass(){ return window.AudioContext || window.webkitAudioContext || null; }
  function softClip(){
    var n = 1024, curve = new Float32Array(n), k = 1.6;
    for (var i=0; i<n; i++){ var x = i*2/n - 1; curve[i] = Math.tanh(k*x)/Math.tanh(k); }
    return curve;
  }
  function start(){
    if (ctx) return ctx;
    var AC = audioClass();
    if (!AC) return null;
    try{ ctx = new AC(); }catch(e){ return null; }
    var master = ctx.createGain();
    master.gain.value = MASTER_VOLUME;
    var lowCut = ctx.createBiquadFilter();
    lowCut.type = 'highpass'; lowCut.frequency.value = 90;
    var highCut = ctx.createBiquadFilter();
    highCut.type = 'lowpass'; highCut.frequency.value = 5200; highCut.Q.value = 0.5;
    var grit = ctx.createWaveShaper();
    grit.curve = softClip(); grit.oversample = '2x';
    var limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -18; limiter.ratio.value = 4;
    master.connect(lowCut); lowCut.connect(highCut); highCut.connect(grit); grit.connect(limiter); limiter.connect(ctx.destination);
    output = master;
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var data = noise.getChannelData(0);
    for (var i=0; i<data.length; i++) data[i] = Math.random()*2 - 1;
    return ctx;
  }
  // Called in a tap (capture phase, before the app handles it): creates or
  // resumes the audio, which browsers only allow there.
  function unlock(){
    if (!start()) return;
    if (ctx.state==='suspended' && document.visibilityState!=='hidden') ctx.resume().catch(function(){});
    if (!unlocked){
      unlocked = true;
      try{   // iOS starts the audio only once something played during a tap
        var silent = ctx.createBufferSource();
        silent.buffer = ctx.createBuffer(1, 1, 22050);
        silent.connect(ctx.destination);
        silent.start(0);
      }catch(e){}
    }
  }

  // ---------- building blocks ----------
  // A gain envelope: quick attack, exponential fade to silence at t+dur.
  function envelope(t, dur, volume, attack){
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(volume, t + (attack || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(output);
    return g;
  }
  function tone(type, from, to, t, dur, volume, attack){
    var osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to && to!==from) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    osc.connect(envelope(t, dur, volume, attack));
    osc.start(t);
    osc.stop(t + dur + 0.02);
    return osc;
  }
  function hiss(t, dur, volume, filterType, freq, q, attack){
    var src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    var filter = ctx.createBiquadFilter();
    filter.type = filterType; filter.frequency.value = freq; filter.Q.value = q || 0.8;
    src.connect(filter);
    filter.connect(envelope(t, dur, volume, attack));
    src.start(t, Math.random()*0.5);
    src.stop(t + dur + 0.02);
    return filter;
  }
  // Static: a run of tiny random pops, thinning out.
  function crackle(t, dur, volume){
    var pops = Math.round(dur*55);
    for (var i=0; i<pops; i++){
      var at = t + Math.random()*dur;
      var fade = 1 - (at-t)/dur;
      hiss(at, 0.006 + Math.random()*0.012, volume*(0.35 + Math.random()*0.65)*fade, 'bandpass', 1800 + Math.random()*3200, 1.2, 0.001);
    }
  }
  function vary(value, amount){ return value * (1 + (Math.random()*2 - 1)*amount); }

  // ---------- the sounds ----------
  var SOUNDS = {
    boot: function(t){
      hiss(t, 0.03, 0.55, 'bandpass', 1800, 1.5, 0.001);             // relay click
      tone('sine', 95, 60, t, 0.08, 0.4);
      tone('sawtooth', 70, 1500, t+0.06, 0.95, 0.045, 0.5);             // rising whine
      tone('triangle', 140, 3000, t+0.06, 0.95, 0.05, 0.5);
      tone('sine', 85, 38, t+0.98, 0.3, 0.6, 0.002);                    // tube thunk
      hiss(t+0.98, 0.07, 0.45, 'lowpass', 500, 0.7, 0.001);
      crackle(t+1.0, 0.55, 0.22);                                        // static settling
      tone('sine', 60, 60, t+1.02, 1.3, 0.05, 0.08);                     // mains hum
      tone('sine', 120, 120, t+1.02, 1.1, 0.025, 0.08);
    },
    tick: function(t){
      hiss(t, 0.014, 0.22, 'highpass', 2600, 0.7, 0.001);
      tone('square', vary(1750, 0.04), null, t, 0.012, 0.035, 0.001);
    },
    press: function(t){
      hiss(t, 0.028, 0.3, 'bandpass', vary(1400, 0.06), 1.2, 0.001);
      tone('sine', 230, 140, t, 0.05, 0.22, 0.002);
    },
    tab: function(t){
      tone('sine', 160, 62, t, 0.13, 0.5, 0.002);                         // clunk
      hiss(t, 0.05, 0.4, 'bandpass', 900, 1.1, 0.001);                    // latch
      hiss(t+0.035, 0.16, 0.13, 'bandpass', 3200, 0.6, 0.004);           // static burst
      crackle(t+0.03, 0.14, 0.12);
    },
    complete: function(t){
      tone('square', 880, null, t, 0.075, 0.11);
      tone('square', 1318.5, null, t+0.085, 0.12, 0.11);
      tone('triangle', 1318.5, null, t+0.085, 0.12, 0.05);
    },
    levelUp: function(t){
      [523.25, 659.25, 783.99].forEach(function(f, i){ tone('square', f, null, t + i*0.1, 0.12, 0.1); });
      var top = tone('square', 1046.5, null, t+0.3, 0.5, 0.1);
      var wobble = ctx.createOscillator(), depth = ctx.createGain();
      wobble.frequency.value = 6; depth.gain.value = 9;
      wobble.connect(depth); depth.connect(top.frequency);
      wobble.start(t+0.3); wobble.stop(t+0.82);
      tone('triangle', 261.63, null, t, 0.8, 0.08, 0.02);
      crackle(t+0.35, 0.35, 0.08);
    },
    quest: function(t){
      hiss(t, 0.025, 0.4, 'bandpass', 1600, 1.4, 0.001);
      [392, 523.25, 659.25].forEach(function(f, i){ tone('square', f, null, t+0.04 + i*0.11, 0.13, 0.1); });
      [523.25, 659.25, 783.99].forEach(function(f){ tone('triangle', f, null, t+0.37, 0.9, 0.075, 0.03); });
      tone('square', 1046.5, null, t+0.37, 0.55, 0.05, 0.02);
      crackle(t+0.4, 0.5, 0.07);
    },
    discover: function(t){
      tone('sine', 320, 980, t, 0.22, 0.06, 0.02);                        // sweep in
      var ping = tone('sine', 1250, null, t+0.2, 0.55, 0.2, 0.002);
      var echo = ctx.createDelay(1), feedback = ctx.createGain(), wet = ctx.createGain();
      echo.delayTime.value = 0.19; feedback.gain.value = 0.38; wet.gain.value = 0.5;
      ping.connect(echo); echo.connect(feedback); feedback.connect(echo); echo.connect(wet);
      wet.gain.setValueAtTime(0.5, t+0.2);
      wet.gain.exponentialRampToValueAtTime(0.0001, t+1.4);
      wet.connect(output);
      tone('sine', 1875, null, t+0.2, 0.3, 0.05, 0.002);
    },
    sold: function(t){
      [[2350, 3520], [2780, 4150]].forEach(function(pair, i){           // two caps clinking
        var at = t + i*0.075;
        tone('triangle', pair[0], null, at, 0.09, 0.12, 0.001);
        tone('sine', pair[1], null, at, 0.07, 0.07, 0.001);
        hiss(at, 0.018, 0.15, 'highpass', 5000, 0.7, 0.001);
      });
      tone('triangle', 2100, null, t+0.2, 0.16, 0.06, 0.001);
    },
    error: function(t){
      tone('square', 110, null, t, 0.1, 0.16, 0.004);
      tone('square', 104, null, t+0.14, 0.13, 0.16, 0.004);
    }
  };

  // Plays a sound now (or after `delay` seconds). Skipped when sound is off,
  // before the first tap, or while the app is in the background.
  function play(name, delay){
    if (!soundOn || !unlocked || !ctx || !SOUNDS[name]) return;
    if (document.visibilityState==='hidden' || ctx.state==='closed') return;
    if (ctx.state==='suspended') ctx.resume().catch(function(){});
    try{ SOUNDS[name](ctx.currentTime + 0.01 + (delay || 0)); }catch(e){}
  }

  // ---------- automatic sounds ----------
  // Any button's click, except the ones with a sound of their own: tabs
  // (render.switchTab plays tab) and check buttons (render.playCheck plays
  // complete).
  function onClickCapture(e){
    unlock();
    if (!booted){ booted = true; if (!powerScreen) play('boot'); }
    var target = e.target && e.target.closest ? e.target.closest('button, [role="button"]') : null;
    if (!target || target.disabled) return;
    if (target.closest('[data-tab]') || target.classList.contains('complete-btn') || target.id==='power-on') return;
    play('press');
  }
  function onScroll(){
    var y = window.scrollY || window.pageYOffset || 0;
    var distance = y - lastScrollY;
    lastScrollY = y;
    if (scrollTick(distance, Date.now())) play('tick');
  }
  function onInput(e){
    var el = e.target;
    if (!el || el.type!=='range') return;
    var bucket = sliderBucket(el.value, el.min, el.max);
    if (sliderBuckets.has(el) && sliderBuckets.get(el)!==bucket) play('tick');
    sliderBuckets.set(el, bucket);
  }
  function onVisibility(){
    if (!ctx) return;
    if (document.visibilityState==='hidden') ctx.suspend().catch(function(){});
    else if (unlocked) ctx.resume().catch(function(){});
  }

  // ---------- power-on screen ----------
  var screenEl = null;
  function showPowerScreen(){
    screenEl = document.createElement('div');
    screenEl.id = 'power-on';
    screenEl.className = 'power-on';
    screenEl.setAttribute('role', 'button');
    screenEl.setAttribute('tabindex', '0');
    screenEl.setAttribute('aria-label', 'Tap to power on');
    screenEl.innerHTML = '<span class="power-on-text">TAP TO POWER ON<span class="power-on-cursor">_</span></span>';
    screenEl.addEventListener('click', powerOn);
    screenEl.addEventListener('keydown', function(e){
      if (e.key==='Enter' || e.key===' '){ e.preventDefault(); powerOn(); }
    });
    document.body.appendChild(screenEl);
    screenEl.focus();
  }
  function powerOn(){
    if (!screenEl) return;
    unlock();
    booted = true;
    play('boot');
    screenEl.remove();
    screenEl = null;
    var frame = document.querySelector('.frame');
    if (!frame) return;
    frame.classList.add('crt-power-on');
    setTimeout(function(){ frame.classList.remove('crt-power-on'); }, POWER_ON_MS + 50);
  }

  // ---------- footer links ----------
  function showChoices(){
    var s = document.getElementById('sound-btn');
    if (s){ s.textContent = 'Sound: '+(soundOn ? 'on' : 'off'); s.setAttribute('aria-pressed', String(soundOn)); }
    var p = document.getElementById('power-btn');
    if (p){ p.textContent = 'Power-on: '+(powerScreen ? 'on' : 'off'); p.setAttribute('aria-pressed', String(powerScreen)); }
  }
  function toggleSound(){
    soundOn = !soundOn;
    keepPref(SOUND_KEY, soundOn);
    showChoices();
    if (soundOn){ unlock(); play('press'); }
  }
  function togglePowerScreen(){
    powerScreen = !powerScreen;
    keepPref(POWER_KEY, powerScreen);
    showChoices();
  }

  function init(){
    soundOn = readPref(SOUND_KEY);
    powerScreen = readPref(POWER_KEY);
    showChoices();
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('keydown', unlock, true);
    window.addEventListener('scroll', onScroll, {passive:true});
    document.addEventListener('input', onInput, true);
    document.addEventListener('visibilitychange', onVisibility);
    lastScrollY = window.scrollY || 0;
  }

  // The power-on screen goes up as soon as this script runs (the page is
  // parsed by then), before the app draws anything behind it.
  if (document.body && readPref(POWER_KEY)) showPowerScreen();

  ST.sfx = {
    init: init,
    play: play,
    toggleSound: toggleSound,
    togglePowerScreen: togglePowerScreen,
    makeTicker: makeTicker,
    sliderBucket: sliderBucket
  };
})(window.StatusTerminal);
