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
 * The fog of war is one canvas over the tiles (FogLayer): dark grainy fog
 * everywhere, with the revealed places cut out of it with soft, smoky
 * edges, sized in real metres. It's redrawn (once per frame at most) while
 * the map moves or zooms, at no more than twice the screen's pixels.
 */
(function(ST){
  'use strict';

  var el = ST.el, clamp = ST.clamp;

  var TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  var ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
  var WORLD = [[-60, -170], [75, 175]];
  var PLACE_ZOOM = 11;
  var MAX_PIXEL_RATIO = 2;
  var MIN_HOLE_PX = 3;          // a place still shows as a spark when zoomed far out
  var REGION_EDGE_M = 2500;     // how far a region's smoky edge reaches

  var L = null;                 // Leaflet, once loaded
  var map = null;
  var fog = null;               // the fog layer
  var P = ST.places;
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

  // ---------- the tab ----------
  function frameHtml(){
    return '<div class="map-box" id="map-box">'+
        '<div class="map-view" id="map-view"></div>'+
        '<div class="map-scan" aria-hidden="true"></div>'+
        '<div class="map-status" id="map-status">LOADING MAP…</div>'+
        '<div class="map-tools">'+
          '<button class="map-tool" id="map-recenter" aria-label="Recenter on my latest place" title="Recenter">&#8982;</button>'+
          '<button class="map-tool" id="map-fit" aria-label="Zoom to all my places" title="All my places">&#9974;</button>'+
        '</div>'+
      '</div>';
  }
  function build(){
    if (built) return;
    built = true;
    el('tab-map').innerHTML = frameHtml();
    var box = el('map-box');
    // 3D tilt holds still during a gesture on the map.
    box.addEventListener('pointerdown', function(){ if (ST.tilt) ST.tilt.hold(true); });
    ['pointerup', 'pointercancel'].forEach(function(type){
      document.addEventListener(type, function(){ if (ST.tilt) ST.tilt.hold(false); });
    });
    el('map-recenter').addEventListener('click', recenter);
    el('map-fit').addEventListener('click', fitAll);
  }

  function status(text){
    var s = el('map-status');
    if (!s) return;
    s.textContent = text || '';
    s.hidden = !text;
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
    map.fitBounds(WORLD);
  }
  // Something revealed changed (a place added, resized, removed, a region's
  // shape loaded): the fog again, on the next frame.
  function redrawFog(){
    if (fog) fog.redraw();
  }

  // Opens the tab: loads Leaflet the first time, then makes the map fit its
  // box (it had no size while the tab was hidden).
  function show(){
    build();
    if (map){ map.invalidateSize(); return; }
    status('LOADING MAP…');
    loadLeaflet().then(function(leaflet){
      L = leaflet;
      if (!map) createMap();
      status('');
    }, function(){
      status('MAP UNAVAILABLE — open it once while online');
    });
  }

  // ---------- the two buttons ----------
  function recenter(){
    if (!map) return;
    map.fitBounds(WORLD, {animate: !stayStill()});
  }
  function fitAll(){
    if (!map) return;
    map.fitBounds(WORLD, {animate: !stayStill()});
  }

  ST.map = { show: show, redrawFog: redrawFog, PLACE_ZOOM: PLACE_ZOOM };
})(window.StatusTerminal);
