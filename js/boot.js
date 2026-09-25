/**
 * RobCo boot — after "TAP TO POWER ON", the terminal types its startup
 * letter by letter, like a RobCo termlink: the logon, then MALIK's real
 * status (level, quests, today's dailies, rads, the weather outside), then
 * the app. Once a day (the first power-on of the day), about 2.5 seconds;
 * a tap shows it all at once, a second tap (or the end) opens the app.
 * Only with the power-on screen on (the footer's Power-on link), and never
 * with Reduce Motion.
 *
 * lines() builds the text from the state and doesn't touch the page, so the
 * tests run it in Node.
 */
(function(ST){
  'use strict';

  var SHOWN_KEY = 'status_terminal_boot_day';   // the day it last played, on this device
  var TICK_MS = 16, CHARS_PER_TICK = 5;   // typing speed: about 300 letters a second
  var LINE_PAUSE_MS = 40;           // a short wait at the end of each line...
  var SLOW_PAUSE_MS = 320;          // ...and a longer one after a line ending in "..."
  var HOLD_MS = 1100;               // the finished screen stays this long
  var FADE_MS = 450;
  var WAIT_STATE_MS = 4000;         // how long to wait for the saved data to load
  var WAIT_WEATHER_MS = 1200;

  function dots(label, width){ var s = label; while (s.length<width) s += '.'; return s+' '; }
  function pad2(n){ return (n<10 ? '0' : '')+n; }
  // The boot's lines, from the state (and the weather, or null).
  function lines(state, weather){
    var mains = state.quests.mains.filter(function(m){ return !m.completed; });
    var side = state.quests.side.filter(function(q){ return !q.done; }).length;
    var daily = state.quests.daily, dailyDone = daily.filter(function(d){ return ST.dailyDoneToday(d); }).length;
    var out = [
      'ROBCO INDUSTRIES (TM) TERMLINK PROTOCOL',
      'PIP-OS V7.1.0.8 — PIBBOY 3000',
      '========================================',
      '> LOGON MALIK',
      'PASSWORD: ********',
      'ACCESS GRANTED...',
      '',
      dots('USER', 14)+'MALIK',
      dots('LEVEL', 14)+pad2(state.level)+'  ('+ST.commas(state.xp)+' / '+ST.commas(state.xpToNext)+' XP)',
      dots('QUESTS', 14)+mains.length+' MAIN · '+side+' SIDE · DAILY '+dailyDone+'/'+daily.length+' TODAY'
    ];
    // A streak quest under way: where it stands.
    mains.filter(function(m){ return m.progressType==='streak'; }).forEach(function(m){
      out.push('  '+(m.questName || m.title).toUpperCase()+': DAY '+ST.currentStreak(m)+' / '+m.streakTarget);
    });
    if ((state.unspentSpecialPoints||0)>0) out.push(dots('S.P.E.C.I.A.L.', 14)+state.unspentSpecialPoints+' POINT'+(state.unspentSpecialPoints>1 ? 'S' : '')+' TO ASSIGN');
    var days = ST.backupDays(), rads = ST.rads();
    out.push(dots('RADS', 14)+rads+'  ('+(days===null ? 'NO BACKUP YET' : 'LAST BACKUP '+(days<=0 ? 'TODAY' : days+' DAY'+(days>1 ? 'S' : '')+' AGO'))+')');
    if (ST.backupDue()) out.push('>> RADAWAY ADVISED: TAP THE RAD METER');
    out.push(dots('WEATHER', 14)+ST.weather.line(weather));
    if (weather) out.push('>> '+ST.weather.describe(weather.code, weather.isDay).alert);
    out.push('', 'WELCOME BACK, MALIK.');
    return out;
  }

  // ---------- once a day ----------
  function shownToday(){ try{ return localStorage.getItem(SHOWN_KEY)===ST.todayStr(); }catch(e){ return true; } }
  function markShown(){ try{ localStorage.setItem(SHOWN_KEY, ST.todayStr()); }catch(e){} }

  // ---------- on the screen ----------
  var box = null, timer = null, done = false;
  // Called by js/sfx.js once the tube has lit up after "TAP TO POWER ON".
  function afterPowerOn(){
    if (box || ST.stayStill() || shownToday()) return;
    var waited = 0;
    (function whenLoaded(){
      if (!ST.app.state){
        waited += 100;
        if (waited < WAIT_STATE_MS) setTimeout(whenLoaded, 100);
        return;
      }
      markShown();
      var weather = ST.weather ? ST.weather.get() : Promise.resolve(null);
      var late = new Promise(function(resolve){ setTimeout(function(){ resolve(ST.weather ? ST.weather.current() : null); }, WAIT_WEATHER_MS); });
      Promise.race([weather, late]).then(function(w){ play(lines(ST.app.state, w)); });
    })();
  }
  function play(text){
    box = document.createElement('div');
    box.className = 'robco';
    box.setAttribute('role', 'button');
    box.setAttribute('aria-label', 'Startup screen: tap to skip');
    var pre = document.createElement('pre');
    pre.className = 'robco-text';
    var cursor = document.createElement('span');
    cursor.className = 'robco-cursor';
    cursor.textContent = '█';
    box.appendChild(pre);
    box.appendChild(cursor);
    box.addEventListener('click', skip);
    document.body.appendChild(box);
    done = false;
    var all = text.join('\n'), i = 0, typed = document.createTextNode('');
    pre.appendChild(typed);
    pre.appendChild(cursor);
    // A few letters at a time, stopping at the end of a line for its pause.
    function next(){
      if (i>=all.length){ finish(); return; }
      var chunk = '', wait = TICK_MS;
      while (i<all.length && chunk.length<CHARS_PER_TICK){
        var ch = all.charAt(i++);
        chunk += ch;
        if (ch==='\n'){
          wait = /\.\.\.$/.test(typed.data+chunk.slice(0, -1)) ? SLOW_PAUSE_MS : LINE_PAUSE_MS;
          if (ST.sfx) ST.sfx.play('key');
          break;
        }
      }
      typed.data += chunk;
      timer = setTimeout(next, wait);
    }
    function finish(){
      done = true;
      typed.data = all;
      timer = setTimeout(close, HOLD_MS);
    }
    // First tap: everything at once; second tap: the app.
    function skip(){
      clearTimeout(timer);
      if (!done) finish();
      else close();
    }
    next();
  }
  function close(){
    clearTimeout(timer);
    if (!box) return;
    var leaving = box;
    box = null;
    leaving.classList.add('robco-out');
    setTimeout(function(){ leaving.remove(); }, FADE_MS);
  }

  ST.boot = { lines: lines, afterPowerOn: afterPowerOn };
})(window.StatusTerminal);
