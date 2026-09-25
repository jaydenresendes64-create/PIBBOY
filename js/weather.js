/**
 * Weather — the real weather outside, read the Pip-Boy way: "RAD-STORM
 * INCOMING" when it rains. Shown small in the topbar (a tap reads the
 * alert) and in the RobCo boot (js/boot.js).
 *
 * From Open-Meteo (open-meteo.com): free for non-commercial use, no key and
 * no account, CC BY 4.0 (the footer credits it). Asked for HOME (Montréal)
 * only, never the phone's position, at most once every FRESH_MS; the last
 * answer is kept on this device (localStorage), so it shows at once, and
 * offline the last one known is used. It's decoration: without it, nothing
 * else changes.
 *
 * The helpers at the top don't touch the page, so the tests run them in Node.
 */
(function(ST){
  'use strict';

  var HOME = {name:'MONTRÉAL', lat:45.5017, lon:-73.5673};
  var API = 'https://api.open-meteo.com/v1/forecast';
  var CACHE_KEY = 'status_terminal_weather';
  var FRESH_MS = 30*60*1000;          // asked again after half an hour
  var TIMEOUT_MS = 8000;

  // ---------- reading it ----------
  // A WMO weather code (Open-Meteo's) → {icon, text: the plain weather,
  // alert: the Pip-Boy's reading}. Icons are text symbols (U+FE0E keeps iOS
  // from turning them into colour emoji).
  var KINDS = [
    {codes:[0], icon:'☀︎', night:'☾', text:'CLEAR', alert:'CLEAR SKIES — NO RAD-STORM ACTIVITY'},
    {codes:[1, 2], icon:'☀︎', night:'☾', text:'PARTLY CLOUDY', alert:'SCATTERED CLOUDS — RAD LEVELS NOMINAL'},
    {codes:[3], icon:'☁︎', text:'OVERCAST', alert:'OVERCAST — THE SKY ISN’T GLOWING, FOR NOW'},
    {codes:[45, 48], icon:'≋', text:'FOG', alert:'FOG BANK — WATCH FOR FERAL GHOULS'},
    {codes:[51, 53, 55, 56, 57], icon:'☂︎', text:'DRIZZLE', alert:'LIGHT RAD-RAIN — COVER UP, WANDERER'},
    {codes:[61, 63, 65, 66, 67], icon:'☂︎', text:'RAIN', alert:'RAD-STORM INCOMING — SEEK SHELTER'},
    {codes:[80, 81, 82], icon:'☂︎', text:'SHOWERS', alert:'RAD-SHOWERS IN THE AREA'},
    {codes:[71, 73, 75, 77, 85, 86], icon:'❄︎', text:'SNOW', alert:'NUCLEAR WINTER CONDITIONS'},
    {codes:[95, 96, 99], icon:'ϟ', text:'THUNDERSTORM', alert:'SEVERE RAD-STORM — STAY IN THE VAULT'}
  ];
  function describe(code, isDay){
    var kind = KINDS.filter(function(k){ return k.codes.indexOf(Number(code))!==-1; })[0];
    if (!kind) return {icon:'?', text:'UNKNOWN', alert:'ATMOSPHERIC SENSORS UNCALIBRATED'};
    return {icon:isDay===false && kind.night ? kind.night : kind.icon, text:kind.text, alert:kind.alert};
  }
  // Open-Meteo's answer → {temp (°C, whole), code, isDay, at (when asked)},
  // or null when it isn't one.
  function fromAnswer(json, at){
    var c = json && json.current;
    var temp = c ? Number(c.temperature_2m) : NaN, code = c ? Number(c.weather_code) : NaN;
    if (!isFinite(temp) || !isFinite(code)) return null;
    return {temp:Math.round(temp), code:code, isDay:c.is_day!==0, at:at};
  }
  // "☂︎ 14°C" for the topbar; the full reading for the boot and the tap.
  function short(w){ return w ? describe(w.code, w.isDay).icon+' '+w.temp+'°C' : ''; }
  function line(w){ return w ? HOME.name+' '+w.temp+'°C, '+describe(w.code, w.isDay).text : 'NO SIGNAL'; }

  // ---------- asking for it ----------
  function requestUrl(){
    return API+'?latitude='+HOME.lat+'&longitude='+HOME.lon+'&current=temperature_2m,weather_code,is_day&timezone=auto';
  }
  function cached(){
    try{
      var w = JSON.parse(localStorage.getItem(CACHE_KEY));
      return w && isFinite(w.temp) && isFinite(w.code) && isFinite(w.at) ? w : null;
    }catch(e){ return null; }
  }
  function keep(w){ try{ localStorage.setItem(CACHE_KEY, JSON.stringify(w)); }catch(e){} }
  // Resolves with the weather: the kept one while fresh, else asked (the
  // kept one, however old, when that fails), or null.
  var asking = null;
  function get(){
    var known = cached();
    if (known && Date.now()-known.at < FRESH_MS) return Promise.resolve(known);
    if (asking) return asking;
    if (typeof fetch!=='function' || navigator.onLine===false) return Promise.resolve(known);
    var abort = typeof AbortController==='function' ? new AbortController() : null;
    var timer = setTimeout(function(){ if (abort) abort.abort(); }, TIMEOUT_MS);
    asking = fetch(requestUrl(), {signal:abort ? abort.signal : undefined, credentials:'omit'}).then(function(r){
      return r.ok ? r.json() : null;
    }).then(function(json){
      var w = fromAnswer(json, Date.now());
      if (w) keep(w);
      return w || known;
    }).catch(function(){ return known; }).then(function(w){
      clearTimeout(timer);
      asking = null;
      show(w);
      return w;
    });
    return asking;
  }
  function current(){ return cached(); }

  // ---------- on the screen ----------
  // The topbar's weather; a tap reads the alert.
  function show(w){
    var btn = document.getElementById('weather-btn');
    if (!btn) return;
    btn.hidden = !w;
    if (!w) return;
    var d = describe(w.code, w.isDay);
    btn.textContent = short(w);
    btn.setAttribute('aria-label', 'Weather in Montréal: '+w.temp+'°C, '+d.text.toLowerCase()+'. '+d.alert);
  }
  function tell(){
    var w = cached();
    if (w && ST.render) ST.render.showNotice(line(w)+' — '+describe(w.code, w.isDay).alert);
  }
  function init(){
    show(cached());
    get();
    // Coming back to the app later in the day: fresh weather.
    document.addEventListener('visibilitychange', function(){ if (document.visibilityState==='visible') get(); });
  }

  ST.weather = {
    HOME: HOME, FRESH_MS: FRESH_MS,
    describe: describe, fromAnswer: fromAnswer, short: short, line: line, requestUrl: requestUrl,
    get: get, current: current, init: init, tell: tell
  };
})(window.StatusTerminal);
