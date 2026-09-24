/**
 * MAP tab — a world map at city level (Leaflet, vendor/leaflet/), tinted
 * amber like the rest of the screen.
 *
 * Leaflet is only loaded the first time the tab is opened, so the app starts
 * as fast as before. The map's pictures (tiles) come from CARTO's dark
 * basemap (see README "MAP tab"); when they can't load (offline, never
 * seen) the map stays on a plain dark background and everything else works.
 *
 * Gestures: drag and pinch on a phone, drag and the wheel on a computer.
 * While a finger is on the map, 3D tilt holds still (ST.tilt.hold), so the
 * map stays under it. Nothing runs while the map isn't being moved.
 *
 * The fog of war is one canvas over the tiles (makeFogLayer): dark grainy fog
 * everywhere, with the revealed places cut out of it with soft, smoky
 * edges, sized in real metres. It's redrawn (once per frame at most) while
 * the map moves or zooms, at no more than twice the screen's pixels.
 *
 * Under the map: the place that's open (rename, resize, note, remove), the
 * city search, "I'm here", pins, marking a region, and the lists. Revealing
 * and the XP are in js/places.js; this file changes state.map only through
 * it, apart from a place's name, radius and note typed here.
 */
(function(ST){
  'use strict';

  var el = ST.el, clamp = ST.clamp, escapeHtml = ST.escapeHtml, attr = ST.escapeHtml;
  var app = ST.app;

  var TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  var ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
  var WORLD = [[-60, -170], [75, 175]];
  var MAX_PIXEL_RATIO = 2;
  var MIN_HOLE_PX = 3;          // a place still shows as a spark when zoomed far out
  var REGION_EDGE_M = 2500;     // how far a region's smoky edge reaches

  var L = null;                 // Leaflet, once loaded
  var map = null;
  var fog = null;               // the fog layer
  var markers = null;           // the cities' and pins' marks
  var P = ST.places, R = ST.render;
  var panel = null;             // what's open under the map: {kind:'place', type, id, confirm},
                                // {kind:'region', cc}, {kind:'here', status, lat, lon, info}, or a bulk list
  var placing = null;           // waiting for a tap on the map: {pin:true} or {onPlace}, and its hint text
  var lastPlace = null;         // {type, id}: the place opened or added last (Recenter)
  var pendingFocus = null;      // a place to show once the map exists
  var leafletPromise = null;
  var built = false;            // the tab's frame (map box, buttons) is in the page
  var motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function stayStill(){ return !!(motion && motion.matches); }

  // ---------- loading Leaflet (once) ----------
  // Its stylesheet goes before the app's, so the app's own map styles win.
  function loadLeaflet(){
    if (window.L) return Promise.resolve(window.L);
    if (!leafletPromise){
      leafletPromise = new Promise(function(resolve, reject){
        var css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'vendor/leaflet/leaflet.css';
        var ours = document.querySelector('link[href="css/terminal.css"]');
        document.head.insertBefore(css, ours || null);
        var script = document.createElement('script');
        script.src = 'vendor/leaflet/leaflet.js';
        script.onload = function(){ if (window.L) resolve(window.L); else reject(new Error('Leaflet missing')); };
        script.onerror = function(){ script.remove(); reject(new Error('Leaflet did not load')); };
        document.head.appendChild(script);
      });
      leafletPromise.catch(function(){ leafletPromise = null; });
    }
    return leafletPromise;
  }

  // ---------- the fog ----------
  // A small random number generator, so a place's smoky edge is the same
  // every time it's drawn.
  function seeded(text){
    var h = 2166136261;
    for (var i=0;i<text.length;i++){ h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function(){
      h = (h + 0x6D2B79F5) | 0;
      var t = Math.imul(h ^ (h>>>15), 1 | h);
      t = (t + Math.imul(t ^ (t>>>7), 61 | t)) ^ t;
      return ((t ^ (t>>>14)) >>> 0) / 4294967296;
    };
  }
  // The fog's texture, 256 pixels square, repeated: dark smoke (two sizes
  // of soft noise) with fine grain. It wraps around at its edges.
  var FOG_TILE = 256;
  var fogTexture = null;
  function makeFogTexture(){
    var c = document.createElement('canvas');
    c.width = c.height = FOG_TILE;
    var g = c.getContext('2d');
    var img = g.createImageData(FOG_TILE, FOG_TILE);
    var rand = seeded('fog');
    function lattice(n){
      var v = [];
      for (var i=0;i<n*n;i++) v.push(rand());
      return function(x, y){                    // smooth noise, wrapping at n cells
        var fx = x/FOG_TILE*n, fy = y/FOG_TILE*n;
        var x0 = Math.floor(fx), y0 = Math.floor(fy);
        var tx = fx-x0, ty = fy-y0;
        tx = tx*tx*(3-2*tx); ty = ty*ty*(3-2*ty);
        function at(i, j){ return v[((j%n+n)%n)*n + ((i%n+n)%n)]; }
        var a = at(x0,y0)+(at(x0+1,y0)-at(x0,y0))*tx;
        var b = at(x0,y0+1)+(at(x0+1,y0+1)-at(x0,y0+1))*tx;
        return a+(b-a)*ty;
      };
    }
    var big = lattice(4), small = lattice(16);
    for (var y=0;y<FOG_TILE;y++){
      for (var x=0;x<FOG_TILE;x++){
        var smoke = big(x,y)*0.65 + small(x,y)*0.35;
        var grain = rand();
        var i = (y*FOG_TILE+x)*4;
        img.data[i] = 10 + smoke*26 + grain*14;
        img.data[i+1] = 5 + smoke*13 + grain*7;
        img.data[i+2] = 2 + smoke*4 + grain*3;
        img.data[i+3] = 255*(0.86 + smoke*0.1 + grain*0.04);
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // A soft round hole: fully clear in the middle, fading out to its edge.
  function hole(ctx, x, y, r, strength){
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,'+strength+')');
    g.addColorStop(0.55, 'rgba(0,0,0,'+strength+')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2*Math.PI);
    ctx.fill();
  }
  // A revealed circle, `r` pixels: a big soft hole with smaller puffs
  // around its rim, so the edge looks like smoke rather than a ring.
  function smokyCircle(ctx, x, y, r, id){
    hole(ctx, x, y, r*1.08, 1);
    if (r<8) return;
    var rand = seeded(id);
    for (var k=0;k<7;k++){
      var angle = (k + rand()*0.8)/7*2*Math.PI;
      var d = r*(0.6 + rand()*0.3);
      hole(ctx, x+Math.cos(angle)*d, y+Math.sin(angle)*d, r*(0.3 + rand()*0.2), 0.85);
    }
  }
  // A revealed region: its shape filled, and its edge softened by two wide
  // faint strokes along it. Points closer than a pixel are skipped.
  function regionPath(ctx, rings, W, ox, oy){
    ctx.beginPath();
    rings.forEach(function(ring){
      var lastX = null, lastY = null;
      for (var i=0;i<ring.length;i+=2){
        var px = ring[i]*W-ox, py = ring[i+1]*W-oy;
        if (lastX!==null && Math.abs(px-lastX)<0.7 && Math.abs(py-lastY)<0.7 && i<ring.length-2) continue;
        if (lastX===null) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        lastX = px; lastY = py;
      }
      ctx.closePath();
    });
  }
  function drawRegion(ctx, shape, W, ox, oy, size){
    var b = shape.box;                     // [x0, y0, x1, y1] on the 0-1 world
    var edge = clamp(REGION_EDGE_M*P.pixelsPerMetre((shape.lat||0), W), 2, 28);
    if (b[2]*W-ox < -edge || b[0]*W-ox > size.x+edge || b[3]*W-oy < -edge || b[1]*W-oy > size.y+edge) return;
    ctx.lineJoin = 'round';
    shape.polygons.forEach(function(rings){
      regionPath(ctx, rings, W, ox, oy);
      ctx.fillStyle = '#000';
      ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = edge*2;
      ctx.stroke();
      ctx.lineWidth = edge;
      ctx.stroke();
    });
  }
  // The whole fog, for a canvas `size` wide whose top-left corner is at
  // (ox, oy) on a world W pixels wide.
  function drawFog(ctx, ratio, size, ox, oy, W){
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.globalCompositeOperation = 'copy';
    if (!fogTexture) fogTexture = makeFogTexture();
    ctx.fillStyle = ctx.createPattern(fogTexture, 'repeat');
    // The texture sticks to the world, so the fog moves with the map.
    var tx = ((ox%FOG_TILE)+FOG_TILE)%FOG_TILE, ty = ((oy%FOG_TILE)+FOG_TILE)%FOG_TILE;
    ctx.translate(-tx, -ty);
    ctx.fillRect(0, 0, size.x+FOG_TILE, size.y+FOG_TILE);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    revealedShapes().forEach(function(shape){ drawRegion(ctx, shape, W, ox, oy, size); });
    revealedCircles().forEach(function(c){
      var x = P.mercX(c.lon)*W-ox, y = P.mercY(c.lat)*W-oy;
      var r = Math.max(MIN_HOLE_PX, c.radius*P.pixelsPerMetre(c.lat, W));
      if (x < -r*1.4 || y < -r*1.4 || x > size.x+r*1.4 || y > size.y+r*1.4) return;
      smokyCircle(ctx, x, y, r, c.id);
    });
    ctx.globalCompositeOperation = 'source-over';
  }
  // What the fog opens: every city and pin as a circle...
  function revealedCircles(){
    var m = ST.app.state && ST.app.state.map;
    return m ? m.cities.concat(m.pins) : [];
  }
  // ...and every region whose shape is loaded (js/places.js).
  function revealedShapes(){
    return P.regionShapes ? P.regionShapes() : [];
  }

  // The fog layer: a Leaflet renderer, so the canvas moves and zooms with
  // the map between redraws (and during the zoom animation), with a margin
  // around the view so a drag doesn't show its edge.
  function makeFogLayer(){
    var Fog = L.Renderer.extend({
      options: {padding: 0.2},
      _initContainer: function(){
        this._container = document.createElement('canvas');
        this._container.className = 'map-fog';
        this._ctx = this._container.getContext('2d');
      },
      _destroyContainer: function(){
        if (this._frame) cancelAnimationFrame(this._frame);
        this._frame = null;
        L.DomUtil.remove(this._container);
        this._ctx = null;
      },
      _updatePaths: function(){},
      getEvents: function(){
        var events = L.Renderer.prototype.getEvents.call(this);
        events.move = this.redraw;
        return events;
      },
      // At most once per frame.
      redraw: function(){
        if (this._frame || !this._map) return;
        var self = this;
        this._frame = requestAnimationFrame(function(){
          self._frame = null;
          if (self._map) self._update();
        });
      },
      _update: function(){
        if (this._map._animatingZoom && this._bounds) return;
        L.Renderer.prototype._update.call(this);
        var b = this._bounds, size = b.getSize(), canvas = this._container;
        var ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
        L.DomUtil.setPosition(canvas, b.min);
        var w = Math.round(size.x*ratio), h = Math.round(size.y*ratio);
        if (canvas.width!==w || canvas.height!==h){
          canvas.width = w; canvas.height = h;
          canvas.style.width = size.x+'px'; canvas.style.height = size.y+'px';
        }
        var origin = this._map.getPixelOrigin().add(b.min);
        var W = 256*Math.pow(2, this._map.getZoom());
        drawFog(this._ctx, ratio, size, origin.x, origin.y, W);
      }
    });
    return new Fog({pane: 'fogPane'});
  }
  // Under the tiles: a faint grid that moves with the map, so the fog and
  // the places still read on a plain dark background when there are no
  // tiles (offline, never seen).
  function makeGridLayer(){
    var Grid = L.GridLayer.extend({
      createTile: function(){
        var tile = document.createElement('canvas');
        tile.width = tile.height = 256;
        var g = tile.getContext('2d');
        g.fillStyle = '#170d05';
        g.fillRect(0, 0, 256, 256);
        g.strokeStyle = 'rgba(232,163,61,0.16)';
        g.lineWidth = 1;
        g.beginPath();
        for (var i=0.5;i<256;i+=64){ g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); }
        g.stroke();
        return tile;
      }
    });
    return new Grid({pane: 'gridPane', noWrap: true});
  }


  // ---------- the map ----------
  function createMap(){
    var still = stayStill();
    map = L.map('map-view', {
      zoomControl: false,
      attributionControl: false,
      minZoom: 2, maxZoom: 18,
      worldCopyJump: false,
      maxBounds: [[-85.05, -200], [85.05, 200]], maxBoundsViscosity: 1,
      zoomAnimation: !still, fadeAnimation: !still, markerZoomAnimation: !still, inertia: !still,
      zoomSnap: 0.25, wheelPxPerZoomLevel: 90
    });
    L.control.attribution({prefix: false, position: 'bottomright'}).addAttribution(ATTRIBUTION).addTo(map);
    map.createPane('gridPane').style.zIndex = 150;      // under the tiles (200)
    map.createPane('fogPane').style.zIndex = 350;       // over the tiles, under the places (600)
    makeGridLayer().addTo(map);
    L.tileLayer(TILES, {
      subdomains: 'abcd', maxZoom: 20, maxNativeZoom: 20, noWrap: true,
      crossOrigin: true,            // so sw.js can keep a copy for offline use
      detectRetina: false
    }).addTo(map);
    fog = makeFogLayer().addTo(map);
    markers = L.layerGroup().addTo(map);
    map.on('zoomend', showLabels);
    // A long press (or a right click) drops a pin; so does a tap after
    // "Drop pin". A tap while placing a bulk-list line places it.
    map.on('contextmenu', function(e){ dropPin(e.latlng.lat, e.latlng.lng); });
    map.on('click', function(e){
      if (!placing) return;
      var what = placing;
      placing = null;
      showHint();
      if (what.pin) dropPin(e.latlng.lat, e.latlng.lng);
      else if (what.onPlace) what.onPlace(e.latlng.lat, e.latlng.lng);
    });
    map.fitBounds(WORLD);
    showLabels();
    syncMarkers();
  }
  // Something revealed changed (a place added, resized, removed, a region's
  // shape loaded): the fog again, on the next frame.
  function redrawFog(){
    if (fog) fog.redraw();
  }
  function animate(){ return !stayStill(); }
  function round5(v){ return Math.round(v*1e5)/1e5; }

  // Place names show beside their marks once zoomed in enough.
  function showLabels(){
    var z = map.getZoom(), box = map.getContainer();
    box.classList.toggle('labels-cities', z>=6);
    box.classList.toggle('labels-pins', z>=11);
  }
  // The marks for the cities and pins (regions show by their shape). A tap
  // on one opens it. 44px to tap, a small dot to see.
  function syncMarkers(){
    if (!markers) return;
    markers.clearLayers();
    var m = app.state && app.state.map;
    if (!m) return;
    [['city', m.cities], ['pin', m.pins]].forEach(function(pair){
      pair[1].forEach(function(p){ addMarker(pair[0], p); });
    });
  }
  function addMarker(type, p){
    var selected = isOpen(type, p.id);
    var icon = L.divIcon({
      className: 'map-marker map-marker-'+type+(selected ? ' selected' : ''),
      iconSize: [44, 44], iconAnchor: [22, 22],
      html: '<span class="mk-dot"></span><span class="mk-label">'+escapeHtml(p.name)+'</span>'
    });
    L.marker([p.lat, p.lon], {icon: icon, title: p.name, alt: p.name, zIndexOffset: selected ? 1000 : 0})
      .on('click', function(){ openPlace(type, p.id, false); })
      .addTo(markers);
  }

  // The map shows a place: its circle (or its region's shape) fills the view.
  function focusPlace(type, p){
    if (!map){ pendingFocus = {type:type, place:p}; return; }
    if (type==='region'){
      P.loadShapes(p.cc).then(function(){
        var shape = P.shapeOf(p.code, p.cc);
        if (shape && map) fitBox(shape.lonBox, 13);
      }, function(){});
      return;
    }
    map.flyToBounds(L.latLng(p.lat, p.lon).toBounds(p.radius*2.6), {maxZoom: 16, animate: animate(), duration: 0.8});
  }
  function fitBox(b, maxZoom){
    map.flyToBounds([[b[1], b[0]], [b[3], b[2]]], {maxZoom: maxZoom, padding: [16, 16], animate: animate(), duration: 0.8});
  }
  function scrollToMap(){
    var box = el('map-box');
    if (box && box.scrollIntoView) box.scrollIntoView({block: 'start', behavior: animate() ? 'smooth' : 'auto'});
  }

  // ---------- the tab ----------
  function frameHtml(){
    return '<div class="map-counts" id="map-counts" aria-live="polite"></div>'+
      '<div class="map-box" id="map-box">'+
        '<div class="map-view" id="map-view"></div>'+
        '<div class="map-scan" aria-hidden="true"></div>'+
        '<div class="map-status" id="map-status">LOADING MAP…</div>'+
        '<div class="map-hint" id="map-hint" hidden><span id="map-hint-text"></span>'+
          '<button data-map="place-cancel">Cancel</button></div>'+
        '<div class="map-tools">'+
          '<button class="map-tool" data-map="recenter" aria-label="Recenter on my latest place" title="Recenter">&#8982;</button>'+
          '<button class="map-tool" data-map="fit" aria-label="Zoom to all my places" title="All my places">&#9974;</button>'+
        '</div>'+
      '</div>'+
      '<div id="map-panel"></div>'+
      '<div class="map-search">'+
        '<input type="search" id="map-search" placeholder="Search city…" autocomplete="off" autocapitalize="words" enterkeyhint="search" aria-label="Search city">'+
        '<div class="map-results" id="map-results"></div>'+
      '</div>'+
      '<div class="map-actions">'+
        '<button data-map="here">I’m here</button>'+
        '<button data-map="drop-pin">Drop pin</button>'+
        '<button data-map="region">Mark a region</button>'+
      '</div>'+
      '<div id="map-lists"></div>';
  }
  function build(){
    if (built) return;
    built = true;
    var tab = el('tab-map');
    tab.innerHTML = frameHtml();
    var box = el('map-box');
    // 3D tilt holds still during a gesture on the map.
    box.addEventListener('pointerdown', function(){ if (ST.tilt) ST.tilt.hold(true); });
    ['pointerup', 'pointercancel'].forEach(function(type){
      document.addEventListener(type, function(){ if (ST.tilt) ST.tilt.hold(false); });
    });
    tab.addEventListener('click', onClick);
    tab.addEventListener('input', onInput);
    tab.addEventListener('change', onChange);
    tab.addEventListener('keydown', onKeyDown);
    render();
  }

  function status(text){
    var s = el('map-status');
    if (!s) return;
    s.textContent = text || '';
    s.hidden = !text;
  }
  // Waiting for a tap on the map: what to tap, with Cancel.
  function showHint(){
    var hint = el('map-hint');
    if (!hint) return;
    hint.hidden = !placing;
    el('map-hint-text').textContent = placing ? placing.text : '';
  }

  // ---------- what's shown under the map ----------
  function isOpen(type, id){ return !!(panel && panel.kind==='place' && panel.type===type && panel.id===id); }
  function renderCounts(){
    var counts = el('map-counts');
    if (counts) counts.textContent = P.countsText(P.counts());
  }
  // "1.5 km", "500 m".
  function distanceText(m){
    return m<1000 ? Math.round(m)+' m' : (Math.round(m/100)/10)+' km';
  }
  function dateText(date){
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date || '');
    return m ? new Date(+m[1], +m[2]-1, +m[3]).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}) : '';
  }
  function placeMeta(type, p){
    var parts = [p.cc || '—'];
    if (type!=='region') parts.push(distanceText(p.radius));
    return parts.join(' · ');
  }
  function listHtml(type, title, list, empty){
    var html = '<div class="panel-title">'+title+' <span class="panel-count">'+list.length+'</span></div>';
    if (!list.length) return html+'<div class="empty-note">'+empty+'</div>';
    html += '<div class="place-list">';
    list.slice().reverse().forEach(function(p){
      html += '<button class="place-row'+(isOpen(type, p.id) ? ' selected' : '')+'" data-map="open" data-kind="'+type+'" data-id="'+attr(p.id)+'">'+
        '<span class="place-row-name">'+escapeHtml(p.name)+'</span>'+
        '<span class="place-row-meta">'+escapeHtml(placeMeta(type, p))+'</span>'+
      '</button>';
    });
    return html+'</div>';
  }
  function renderLists(){
    var lists = el('map-lists');
    if (!lists) return;
    var m = app.state.map;
    lists.innerHTML =
      listHtml('city', 'Cities', m.cities, 'No cities yet: search one above.')+
      listHtml('region', 'Regions', m.regions, 'No regions yet: Mark a region.')+
      listHtml('pin', 'Pins', m.pins, 'No pins yet: long-press the map, or Drop pin.');
  }

  // An open place: rename, resize (cities and pins), a note, remove.
  function placeCardHtml(){
    var type = panel.type, p = P.findPlace(type, panel.id);
    var html = '<div class="place-card">'+
      '<div class="place-card-head"><span class="badge">'+{city:'CITY', region:'REGION', pin:'PIN'}[type]+'</span>'+
        '<input type="text" id="place-name" class="place-name" maxlength="'+ST.PLACE_NAME_MAX+'" value="'+escapeHtml(p.name)+'" aria-label="Name"></div>'+
      '<div class="place-meta">'+escapeHtml([P.countryName(p.cc), p.date ? 'revealed '+dateText(p.date) : ''].filter(Boolean).join(' · '))+'</div>';
    if (type!=='region'){
      var min = type==='city' ? ST.CITY_RADIUS_MIN : ST.PIN_RADIUS_MIN, max = type==='city' ? ST.CITY_RADIUS_MAX : ST.PIN_RADIUS_MAX;
      html += '<label class="place-radius"><span>Radius</span>'+
        '<input type="range" id="place-radius" min="'+min+'" max="'+max+'" step="'+(type==='city' ? 500 : 100)+'" value="'+Number(p.radius)+'">'+
        '<span id="place-radius-text">'+distanceText(p.radius)+'</span></label>';
    }
    html += '<textarea id="place-note" class="place-note" rows="2" maxlength="'+ST.PLACE_NOTE_MAX+'" placeholder="Note (optional)" aria-label="Note">'+escapeHtml(p.note||'')+'</textarea>';
    if (panel.confirm){
      html += '<div class="card-confirm">'+
        '<span class="reset-warning">Remove this place?</span>'+
        '<button class="confirm-yes" data-map="remove-yes">Yes, remove</button>'+
        '<button data-map="remove-no">Cancel</button>'+
      '</div>';
    } else {
      html += '<div class="place-buttons">'+
        '<button class="place-remove" data-map="remove">Remove</button>'+
        '<button data-map="close">Done</button>'+
      '</div>';
    }
    return html+'</div>';
  }
  // "Mark a region": a country, then one of its regions.
  function regionCardHtml(){
    var db = P.data();
    var html = '<div class="place-card"><div class="place-card-title">Mark a region</div>';
    if (!db){
      html += '<div class="place-meta">'+(panel.failed ? 'The region list couldn’t load. Try again once online.' : 'Loading the region list…')+'</div>';
    } else {
      var withRegions = {};
      db.regions.forEach(function(r){ withRegions[r.cc] = true; });
      html += '<select id="region-country" aria-label="Country"><option value="">Country…</option>'+
        db.countries.filter(function(c){ return withRegions[c.cc]; })
          .sort(function(a, b){ return a.name.localeCompare(b.name); })
          .map(function(c){ return '<option value="'+attr(c.cc)+'"'+(c.cc===panel.cc ? ' selected' : '')+'>'+escapeHtml(c.name)+'</option>'; }).join('')+
        '</select>';
      var regions = panel.cc ? db.regions.filter(function(r){ return r.cc===panel.cc; }).sort(function(a, b){
        return (b.isGroup-a.isGroup) || a.name.localeCompare(b.name);
      }) : [];
      html += '<select id="region-pick" aria-label="Region"'+(regions.length ? '' : ' disabled')+'>'+
        '<option value="">Region…</option>'+
        regions.map(function(r){
          return '<option value="'+attr(r.code)+'">'+(P.revealedRegion(r.code) ? '✓ ' : '')+escapeHtml(r.name+(r.type ? ' — '+r.type : ''))+'</option>';
        }).join('')+
      '</select>';
    }
    return html+'<div class="place-buttons">'+
      (db ? '<button class="place-go" data-map="region-add">Reveal</button>' : '')+
      '<button data-map="close">Cancel</button></div></div>';
  }
  // "I'm here": where you are, and what to reveal there.
  function hereCardHtml(){
    var html = '<div class="place-card"><div class="place-card-title">You are here</div>';
    if (panel.status!=='found'){
      html += '<div class="place-meta">'+(panel.status==='asking' ? 'Finding where you are…' : 'Looking up this place…')+'</div>';
      return html+'<div class="place-buttons"><button data-map="close">Cancel</button></div></div>';
    }
    var info = panel.info, city = info.city, region = info.region;
    var where = [city ? 'near '+city.name : '', region ? region.name : '', info.cc ? P.countryName(info.cc) : ''].filter(Boolean);
    html += '<div class="place-meta">'+escapeHtml(where.length ? where.join(' · ') : 'No town or region found here')+'</div>'+
      '<div class="here-buttons">';
    if (city){
      html += P.revealedCity(city.gid) ? '<span class="here-done">&#10003; '+escapeHtml(city.name)+'</span>'
        : '<button class="place-go" data-map="here-city">Reveal city: '+escapeHtml(city.name)+'</button>';
    }
    if (region){
      html += P.revealedRegion(region.code) ? '<span class="here-done">&#10003; '+escapeHtml(region.name)+'</span>'
        : '<button class="place-go" data-map="here-region">Reveal region: '+escapeHtml(region.name)+'</button>';
    }
    return html+'<button class="place-go" data-map="here-pin">Drop a pin here</button>'+
      '<button data-map="close">Cancel</button></div></div>';
  }
  function renderPanel(){
    var area = el('map-panel');
    if (!area) return;
    if (panel && panel.kind==='place' && !P.findPlace(panel.type, panel.id)) panel = null;
    if (!panel){ area.innerHTML = ''; return; }
    area.innerHTML = panel.kind==='place' ? placeCardHtml()
      : panel.kind==='region' ? regionCardHtml()
      : panel.kind==='here' ? hereCardHtml()
      : ST.bulk ? ST.bulk.html(panel) : '';
  }
  function closePanel(){
    panel = null;
    placing = null;
    showHint();
    clearHere();
    renderPanel();
    renderLists();
    syncMarkers();
  }
  // Everything under the map, after a change the tab didn't make itself
  // (a backup imported, another window's save, a reset).
  function render(){
    if (!built || !app.state) return;
    renderCounts();
    renderPanel();
    renderLists();
    syncMarkers();
    redrawFog();
  }
  // After a place was added, changed or removed here.
  function changed(){
    renderCounts();
    renderLists();
    syncMarkers();
    redrawFog();
    ST.storage.scheduleSave();
  }

  // ---------- rewards ----------
  // DISCOVERED and the XP for every place revealed for the first time: one
  // banner for all of them. A place that was revealed before gives nothing.
  function celebrate(results){
    var paid = results.filter(function(r){ return r.reward; });
    if (!paid.length){
      var back = results.filter(function(r){ return r.isNew; });
      if (back.length) R.showNotice(back.length===1 ? 'Back on the map: '+back[0].place.name : back.length+' places back on the map');
      else if (results.length) R.showNotice(results.length===1 ? 'Already on the map: '+results[0].place.name : 'Already on the map');
      return;
    }
    var xp = 0, leveled = false;
    paid.forEach(function(r){ xp += r.reward.xp; leveled = leveled || r.reward.leveled; });
    R.showDiscovered(paid.length===1 ? paid[0].place.name : paid.length+' places');
    R.showXpToast(xp);
    if (leveled) R.showLevelUp();
    R.renderHeader();
    R.renderStatus();
  }

  // ---------- opening places ----------
  function openPlace(type, id, fly){
    var p = P.findPlace(type, id);
    if (!p) return;
    placing = null;
    showHint();
    clearHere();
    panel = {kind:'place', type:type, id:id, confirm:false};
    lastPlace = {type:type, id:id};
    renderPanel();
    renderLists();
    syncMarkers();
    if (fly) focusPlace(type, p);
    scrollToMap();
  }
  function removeOpenPlace(){
    if (!panel || panel.kind!=='place') return;
    P.removePlace(panel.type, panel.id);
    if (lastPlace && lastPlace.id===panel.id) lastPlace = null;
    panel = null;
    renderPanel();
    changed();
  }

  // ---------- searching a city ----------
  var results = [];
  function updateResults(){
    var box = el('map-results'), query = el('map-search').value;
    if (!query.trim()){ results = []; box.innerHTML = ''; return; }
    if (!P.data()){
      box.innerHTML = '<div class="empty-note">Loading the city list…</div>';
      P.loadPlaces().then(updateResults, function(){
        box.innerHTML = '<div class="empty-note">The city list couldn’t load. Try again once online.</div>';
      });
      return;
    }
    results = P.searchCities(query, 8);
    box.innerHTML = results.length ? results.map(function(c, i){
      var done = P.revealedCity(c.gid);
      return '<button class="map-result" data-map="pick" data-index="'+i+'">'+
        '<span class="place-row-name">'+(done ? '&#10003; ' : '')+escapeHtml(c.name)+'</span>'+
        '<span class="place-row-meta">'+escapeHtml(P.cityWhere(c))+'</span></button>';
    }).join('') : '<div class="empty-note">No city found. For a smaller place, drop a pin.</div>';
  }
  function pickCity(c){
    var result = P.revealCity(c);
    el('map-search').value = '';
    updateResults();
    changed();
    celebrate([result]);
    openPlace('city', result.place.id, true);
  }

  // ---------- pins ----------
  function dropPin(lat, lon, name){
    placing = null;
    showHint();
    var pin = P.addPin(round5(lat), round5(lon), name || 'Pin '+(app.state.map.pins.length+1), '');
    changed();
    openPlace('pin', pin.id, false);
    var box = el('place-name');
    if (box){ box.focus(); box.select(); }
    // Its country, for the counters (when the lists can be loaded).
    P.lookup(pin.lat, pin.lon).then(function(info){
      var p = P.findPlace('pin', pin.id);
      if (!p || p.cc || !info.cc) return;
      p.cc = info.cc;
      changed();
      var meta = isOpen('pin', p.id) && document.querySelector('#map-panel .place-meta');
      if (meta) meta.textContent = [P.countryName(p.cc), 'revealed '+dateText(p.date)].join(' · ');
    });
  }
  function startPinMode(){
    closePanel();
    placing = {pin:true, text:'Tap the map to drop a pin'};
    showHint();
    scrollToMap();
  }

  // ---------- I'm here ----------
  // Asks for the location once (never followed), then offers the city, the
  // region, or a pin at that spot.
  var hereMark = null;
  function clearHere(){
    if (hereMark){ hereMark.remove(); hereMark = null; }
  }
  function here(){
    if (!navigator.geolocation){ R.showNotice('Location isn’t available here'); return; }
    closePanel();
    var asked = panel = {kind:'here', status:'asking'};
    renderPanel();
    scrollToMap();
    navigator.geolocation.getCurrentPosition(function(pos){
      if (panel!==asked) return;                  // cancelled meanwhile
      asked.status = 'looking';
      asked.lat = pos.coords.latitude;
      asked.lon = pos.coords.longitude;
      renderPanel();
      if (map){
        clearHere();
        hereMark = L.circleMarker([asked.lat, asked.lon], {radius: 7, className: 'map-here', interactive: false}).addTo(map);
        map.flyTo([asked.lat, asked.lon], 12, {animate: animate(), duration: 0.8});
      }
      P.lookup(asked.lat, asked.lon).then(function(info){
        if (panel!==asked) return;
        asked.status = 'found';
        asked.info = info;
        renderPanel();
      });
    }, function(err){
      if (panel!==asked) return;
      closePanel();
      R.showNotice(err && err.code===1 ? 'Location not allowed' : 'Couldn’t find where you are');
    }, {enableHighAccuracy: true, timeout: 20000, maximumAge: 60000});
  }
  function hereReveal(kind){
    var asked = panel, info = asked && asked.info;
    if (!info) return;
    var result = kind==='city' ? P.revealCity(info.city) : P.revealRegion(info.region);
    changed();
    celebrate([result]);
    lastPlace = {type:kind, id:result.place.id};
    renderPanel();
  }

  // ---------- marking a region ----------
  function openRegionPicker(){
    closePanel();
    var m = app.state.map, latest = m.regions[m.regions.length-1] || m.cities[m.cities.length-1] || m.pins[m.pins.length-1];
    var asked = panel = {kind:'region', cc: latest && latest.cc || ''};
    renderPanel();
    if (!P.data()){
      P.loadPlaces().then(function(){ if (panel===asked) renderPanel(); }, function(){
        if (panel!==asked) return;
        asked.failed = true;
        renderPanel();
      });
    }
  }
  function addPickedRegion(){
    var pick = el('region-pick'), db = P.data();
    var region = pick && db && db.region[pick.value];
    if (!region){ if (pick) pick.focus(); return; }
    var result = P.revealRegion(region);
    changed();
    celebrate([result]);
    openPlace('region', result.place.id, true);
  }

  // ---------- the round buttons ----------
  // Recenter: the place opened or added last, else the newest one, else
  // the whole world.
  function newestPlace(){
    if (lastPlace && P.findPlace(lastPlace.type, lastPlace.id)) return lastPlace;
    var m = app.state.map, best = null;
    [['city', m.cities], ['region', m.regions], ['pin', m.pins]].forEach(function(pair){
      pair[1].forEach(function(p){
        var at = /^x[0-9a-z]{8}/.test(p.id) ? parseInt(p.id.slice(1, 9), 36) : 0;
        if (!best || at>=best.at) best = {type:pair[0], id:p.id, at:at};
      });
    });
    return best;
  }
  function recenter(){
    if (!map) return;
    var newest = newestPlace();
    if (newest) focusPlace(newest.type, P.findPlace(newest.type, newest.id));
    else map.flyToBounds(WORLD, {animate: animate()});
  }
  // All my places: every circle, and every region whose shape is loaded.
  function fitAll(){
    if (!map) return;
    var m = app.state.map, bounds = null;
    function add(b){ bounds = bounds ? bounds.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast()); }
    m.cities.concat(m.pins).forEach(function(p){ add(L.latLng(p.lat, p.lon).toBounds(p.radius*2)); });
    m.regions.forEach(function(r){
      var shape = P.shapeOf(r.code, r.cc);
      if (shape) add(L.latLngBounds([shape.lonBox[1], shape.lonBox[0]], [shape.lonBox[3], shape.lonBox[2]]));
    });
    if (bounds) map.flyToBounds(bounds, {maxZoom: 13, padding: [20, 20], animate: animate(), duration: 0.8});
    else map.flyToBounds(WORLD, {animate: animate()});
  }

  // ---------- taps and typing in the tab ----------
  function onClick(e){
    var btn = e.target.closest('[data-map]');
    if (!btn) return;
    var action = btn.getAttribute('data-map');
    if (action==='open') openPlace(btn.getAttribute('data-kind'), btn.getAttribute('data-id'), true);
    else if (action==='close') closePanel();
    else if (action==='remove'){ panel.confirm = true; renderPanel(); focusIn('[data-map="remove-no"]'); }
    else if (action==='remove-no'){ panel.confirm = false; renderPanel(); focusIn('[data-map="remove"]'); }
    else if (action==='remove-yes') removeOpenPlace();
    else if (action==='pick'){ var c = results[+btn.getAttribute('data-index')]; if (c) pickCity(c); }
    else if (action==='recenter') recenter();
    else if (action==='fit') fitAll();
    else if (action==='drop-pin') startPinMode();
    else if (action==='place-cancel'){ placing = null; showHint(); }
    else if (action==='here') here();
    else if (action==='here-city') hereReveal('city');
    else if (action==='here-region') hereReveal('region');
    else if (action==='here-pin'){ var asked = panel; closePanel(); dropPin(asked.lat, asked.lon, 'Here, '+dateText(ST.todayStr())); }
    else if (action==='region') openRegionPicker();
    else if (action==='region-add') addPickedRegion();
    else if (ST.bulk) ST.bulk.onAction(action, btn);
  }
  function focusIn(selector){
    var target = document.querySelector('#map-panel '+selector);
    if (target) target.focus();
  }
  function openedPlace(){
    return panel && panel.kind==='place' ? P.findPlace(panel.type, panel.id) : null;
  }
  function onInput(e){
    var t = e.target, p = openedPlace();
    if (t.id==='map-search') updateResults();
    else if (t.id==='place-name' && p){
      var name = t.value.trim().slice(0, ST.PLACE_NAME_MAX);
      if (name && name!==p.name){ p.name = name; renderLists(); syncMarkers(); ST.storage.scheduleSave(); }
    } else if (t.id==='place-radius' && p){
      p.radius = Number(t.value);
      el('place-radius-text').textContent = distanceText(p.radius);
      redrawFog();
      ST.storage.scheduleSave();
    } else if (t.id==='place-note' && p){
      p.note = t.value.slice(0, ST.PLACE_NOTE_MAX);
      ST.storage.scheduleSave();
    } else if (ST.bulk) ST.bulk.onInput(t);
  }
  function onChange(e){
    var t = e.target, p = openedPlace();
    if (t.id==='place-name' && p) t.value = p.name;          // emptied: the name stays as it was
    else if (t.id==='place-radius' && p) renderLists();
    else if (t.id==='region-country' && panel && panel.kind==='region'){ panel.cc = t.value; renderPanel(); focusIn('#region-pick'); }
  }
  function onKeyDown(e){
    if (e.key!=='Enter') return;
    if (e.target.id==='map-search'){ e.preventDefault(); if (results[0]) pickCity(results[0]); }
    else if (e.target.id==='place-name'){ e.preventDefault(); e.target.blur(); }
  }

  // ---------- opening the tab ----------
  // Loads Leaflet the first time, then makes the map fit its box (it had no
  // size while the tab was hidden).
  function show(){
    build();
    if (map){ map.invalidateSize(); return; }
    status('LOADING MAP…');
    loadLeaflet().then(function(leaflet){
      L = leaflet;
      if (!map) createMap();
      status('');
      if (pendingFocus){ focusPlace(pendingFocus.type, pendingFocus.place); pendingFocus = null; }
    }, function(){
      status('MAP UNAVAILABLE — open it once while online');
    });
  }

  // For js/bulk.js, the "Add several places" list.
  function openPanel(next){ closePanel(); panel = next; renderPanel(); }
  function currentPanel(){ return panel; }
  function placeOnMap(text, onPlace){
    placing = {text: text, onPlace: onPlace};
    showHint();
    scrollToMap();
  }

  ST.map = {
    show: show, render: render, redrawFog: redrawFog,
    // for js/bulk.js
    renderPanel: renderPanel, openPanel: openPanel, closePanel: closePanel, currentPanel: currentPanel,
    placeOnMap: placeOnMap, changed: changed, celebrate: celebrate, openPlace: openPlace
  };
})(window.StatusTerminal);
