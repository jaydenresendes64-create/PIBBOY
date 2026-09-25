/**
 * Radar scanner (MAP tab) — the ◎ button sweeps the map like a Pip-Boy
 * radar. Its blips are real places: the biggest cities in view that MALIK
 * hasn't revealed yet (from the offline city list, data/places.txt). Each
 * lights up as the sweep passes and fades like phosphor; a tap on one says
 * what it is, how far it is from the nearest city on the map, and can
 * reveal it ("I've been there": DISCOVERED and its XP, like a search).
 *
 * Drawn on its own canvas over the map (taps go through it to the map),
 * only while the scanner is on, the map on the screen and the app in front;
 * with Reduce Motion the sweep stays still and the blips simply glow.
 *
 * The helpers at the top don't touch the page, so the tests run them in Node.
 */
(function(ST){
  'use strict';

  var P = ST.places, escapeHtml = ST.escapeHtml;
  var app = ST.app;

  var MAX_BLIPS = 24;               // the biggest undiscovered cities in view
  var PERIOD_S = 3.2;               // one turn of the sweep
  var TRAIL = 0.9;                  // the sweep's glowing trail, in radians
  var FADE_PER_S = 1.3;             // how fast a blip fades after the sweep
  var TAP_PX = 26;                  // a tap this close to a blip picks it
  var PING_GAP_MS = 400;            // at most one ping this often
  var MAX_RATIO = 2;
  var AMBER = '255,176,64';

  // ---------- pure helpers ----------
  // The biggest cities inside `box` ([[west, south], [east, north]]) that
  // aren't on the map yet, at most `limit`, biggest first. `isRevealed` is
  // only asked about a city big enough to make the list (it's the slow part).
  function candidates(cities, box, isRevealed, limit){
    var w = box[0][0], s = box[0][1], e = box[1][0], n = box[1][1], best = [];
    for (var i=0;i<cities.length;i++){
      var c = cities[i];
      if (c.lat<s || c.lat>n || c.lon<w || c.lon>e) continue;
      if (best.length>=limit && c.pop<=best[best.length-1].pop) continue;
      if (isRevealed(c)) continue;
      if (best.length<limit || c.pop>best[best.length-1].pop){
        var at = best.length;
        while (at>0 && best[at-1].pop<c.pop) at--;
        best.splice(at, 0, c);
        if (best.length>limit) best.pop();
      }
    }
    return best;
  }
  // An angle brought into 0..2π.
  function wrap(a){ var t = Math.PI*2; return ((a % t) + t) % t; }
  // How bright a blip is: 1 as the sweep crosses it, fading behind it (the
  // phosphor's afterglow), never quite gone. Angles in radians, screen
  // coordinates (clockwise).
  function glow(sweep, blip){
    var behind = wrap(sweep-blip)/(Math.PI*2)*PERIOD_S;          // seconds since the sweep passed
    return Math.max(0.14, Math.exp(-behind*FADE_PER_S));
  }
  // A city already out of the fog: revealed itself, or inside a revealed
  // city's or pin's circle (Montréal's boroughs), or a revealed region
  // whose shape is loaded.
  function covered(c){
    var m = app.state.map;
    if (c.gid && P.revealedCity(c.gid)) return true;
    var places = m.cities.concat(m.pins);
    for (var i=0;i<places.length;i++){
      if (P.distance(c.lat, c.lon, places[i].lat, places[i].lon) <= places[i].radius) return true;
    }
    return m.regions.some(function(r){
      var shape = P.shapeOf(r.code, r.cc);
      return !!shape && P.inShape(c.lon, c.lat, shape);
    });
  }
  // The nearest place on the map to a city: {name, km}, or null.
  function nearestKnown(c){
    var m = app.state.map, best = null;
    m.cities.concat(m.pins).forEach(function(p){
      var km = P.distance(c.lat, c.lon, p.lat, p.lon)/1000;
      if (!best || km<best.km) best = {name:p.name, km:km};
    });
    return best;
  }
  function popText(pop){
    return pop>=1e6 ? (Math.round(pop/1e5)/10)+' million' : Math.round(pop/1000).toLocaleString('en-US')+',000';
  }

  // ---------- the scanner ----------
  var map = null, canvas = null, ctx2d = null;
  var on = false, blips = [], frame = null, onScreen = true, lastPing = 0, lastSweep = null, stillAngle = -Math.PI/4;

  // Called by js/map.js once the map has loaded.
  function attach(m){
    map = m;
    canvas = document.getElementById('map-radar');
    if (!canvas) return;
    ctx2d = canvas.getContext('2d');
    map.on('moveend', function(){ if (on) findBlips(); });
    map.on('resize', fit);
    map.on('click', onMapClick);
    if (typeof IntersectionObserver==='function'){
      new IntersectionObserver(function(entries){
        onScreen = entries[entries.length-1].isIntersecting;
        run();
      }).observe(canvas);
    }
    document.addEventListener('visibilitychange', run);
    showButton();
  }
  function toggle(){
    if (!map) return;
    on = !on;
    showButton();
    if (!on){ blips = []; run(); clear(); closeCard(); return; }
    if (ST.sfx) ST.sfx.play('ping');
    P.loadPlaces().then(function(){ if (on) findBlips(); }, function(){
      on = false;
      showButton();
      if (ST.render) ST.render.showNotice('Scanner offline: the city list couldn’t load');
    });
    fit();
    run();
  }
  function showButton(){
    var btn = document.querySelector('[data-map="radar"]');
    if (btn){ btn.classList.toggle('active', on); btn.setAttribute('aria-pressed', String(on)); }
    if (canvas) canvas.hidden = !on;
  }
  function findBlips(){
    var db = P.data();
    if (!db || !map) return;
    var b = map.getBounds();
    var box = [[b.getWest(), b.getSouth()], [b.getEast(), b.getNorth()]];
    blips = candidates(db.cities, box, covered, MAX_BLIPS).map(function(c){
      return {city:c, x:0, y:0, angle:0, glow:0.14};
    });
  }
  // The canvas at the map's size (sharp on retina screens).
  function fit(){
    if (!canvas || !map) return;
    var box = map.getContainer(), ratio = Math.min(MAX_RATIO, window.devicePixelRatio || 1);
    var w = box.clientWidth, h = box.clientHeight;
    if (canvas.width!==Math.round(w*ratio) || canvas.height!==Math.round(h*ratio)){
      canvas.width = Math.round(w*ratio);
      canvas.height = Math.round(h*ratio);
    }
    ctx2d.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  function running(){ return on && onScreen && document.visibilityState!=='hidden'; }
  function run(){
    if (running() && frame===null){ lastSweep = null; frame = requestAnimationFrame(draw); }
    else if (!running() && frame!==null){ cancelAnimationFrame(frame); frame = null; }
  }
  function clear(){ if (ctx2d && canvas) ctx2d.clearRect(0, 0, canvas.width, canvas.height); }

  function draw(now){
    frame = null;
    if (!running()) return;
    var box = map.getContainer(), w = box.clientWidth, h = box.clientHeight;
    var cx = w/2, cy = h/2, reach = Math.sqrt(cx*cx+cy*cy);
    var still = ST.stayStill();
    var sweep = still ? stillAngle : wrap(now/1000/PERIOD_S*Math.PI*2 - Math.PI/2);
    var g = ctx2d;
    g.clearRect(0, 0, w, h);
    // Range rings and the cross.
    g.strokeStyle = 'rgba('+AMBER+',0.16)';
    g.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach(function(k){ g.beginPath(); g.arc(cx, cy, Math.min(cx, cy)*k*1.3, 0, Math.PI*2); g.stroke(); });
    g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx, h); g.moveTo(0, cy); g.lineTo(w, cy); g.stroke();
    // The sweep: a fading trail of thin wedges behind a bright line.
    if (!still){
      var slices = 18;
      for (var i=0;i<slices;i++){
        var a0 = sweep - TRAIL*(i+1)/slices, a1 = sweep - TRAIL*i/slices;
        g.fillStyle = 'rgba('+AMBER+','+(0.13*(1-i/slices)).toFixed(3)+')';
        g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, reach, a0, a1); g.closePath(); g.fill();
      }
      g.strokeStyle = 'rgba('+AMBER+',0.75)';
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx+Math.cos(sweep)*reach, cy+Math.sin(sweep)*reach); g.stroke();
    }
    // The blips, where their cities are now. A name shows only where it
    // doesn't cover another (the biggest cities come first, so they win).
    var pinged = false, labels = [];
    g.font = '15px VT323, monospace';
    g.textBaseline = 'middle';
    blips.forEach(function(b){
      var p = map.project([b.city.lon, b.city.lat]);
      b.x = p.x; b.y = p.y;
      b.angle = Math.atan2(p.y-cy, p.x-cx);
      b.glow = still ? 0.8 : glow(sweep, b.angle);
      // The sweep just crossed it: a ping (not too often).
      if (!still && lastSweep!==null && wrap(sweep-b.angle) < wrap(sweep-lastSweep)) pinged = true;
      var r = 2.5 + Math.min(3, Math.log(Math.max(1, b.city.pop/15000))/2);
      g.fillStyle = 'rgba('+AMBER+','+(0.25+0.75*b.glow).toFixed(3)+')';
      g.shadowColor = 'rgba('+AMBER+',0.9)';
      g.shadowBlur = 10*b.glow;
      g.beginPath(); g.arc(b.x, b.y, r, 0, Math.PI*2); g.fill();
      g.shadowBlur = 0;
      if (b.glow>0.45){
        var name = b.city.name.toUpperCase();
        var box = {x:b.x+r+5, y:b.y-8, w:g.measureText(name).width, h:16};
        if (!labels.some(function(o){ return box.x<o.x+o.w && o.x<box.x+box.w && box.y<o.y+o.h && o.y<box.y+box.h; })){
          labels.push(box);
          g.fillStyle = 'rgba('+AMBER+','+(b.glow*0.95).toFixed(3)+')';
          g.fillText(name, box.x, b.y);
        }
      }
    });
    // What the scanner found, in its corner.
    g.fillStyle = 'rgba('+AMBER+',0.85)';
    g.font = '15px VT323, monospace';
    g.textBaseline = 'bottom';
    g.fillText(P.data() ? 'SCANNER: '+blips.length+' UNDISCOVERED IN RANGE' : 'SCANNING…', 10, h-24);
    if (pinged && now-lastPing>PING_GAP_MS && ST.sfx){ lastPing = now; ST.sfx.play('ping'); }
    lastSweep = sweep;
    frame = requestAnimationFrame(draw);
  }

  // ---------- a blip tapped ----------
  function onMapClick(e){
    if (!on || ST.map.isPlacing()) return;
    var hit = null, best = TAP_PX;
    blips.forEach(function(b){
      var d = Math.sqrt(Math.pow(b.x-e.point.x, 2)+Math.pow(b.y-e.point.y, 2));
      if (d<best){ best = d; hit = b; }
    });
    if (!hit) return;
    if (ST.sfx) ST.sfx.play('mapSelect');
    ST.map.openPanel({kind:'radar', city:hit.city});
  }
  function panel(){
    var p = ST.map.currentPanel();
    return p && p.kind==='radar' ? p : null;
  }
  function html(p){
    var c = p.city, near = nearestKnown(c);
    return '<div class="place-card radar-card"><div class="place-card-title">Undiscovered location</div>'+
      '<div class="place-card-head"><span class="badge">BLIP</span><span class="radar-name">'+escapeHtml(c.name)+'</span></div>'+
      '<div class="place-meta">'+escapeHtml([P.cityWhere(c), 'about '+popText(c.pop)+' people'].filter(Boolean).join(' · '))+'</div>'+
      (near ? '<div class="place-meta">'+escapeHtml(ST.routes ? ST.routes.kmText(near.km) : Math.round(near.km)+' km')+' from '+escapeHtml(near.name)+'</div>' : '')+
      '<div class="place-buttons">'+
        '<button class="place-go" data-map="radar-reveal">I’ve been there: reveal it</button>'+
        '<button data-map="close">Close</button>'+
      '</div></div>';
  }
  function reveal(){
    var p = panel();
    if (!p) return;
    var result = P.revealCity(p.city);
    ST.map.closePanel();
    ST.map.changed();
    ST.map.celebrate([result]);
    findBlips();
  }
  function closeCard(){ if (panel()) ST.map.closePanel(); }
  function onAction(action){
    if (action==='radar') toggle();
    else if (action==='radar-reveal') reveal();
  }

  ST.radar = {
    MAX_BLIPS: MAX_BLIPS, PERIOD_S: PERIOD_S,
    candidates: candidates, covered: covered, wrap: wrap, glow: glow, nearestKnown: nearestKnown, popText: popText,
    // for js/map.js
    attach: attach, html: html, onAction: onAction, isOn: function(){ return on; },
    refresh: function(){ if (on) findBlips(); }      // a place revealed or removed elsewhere
  };
})(window.StatusTerminal);
