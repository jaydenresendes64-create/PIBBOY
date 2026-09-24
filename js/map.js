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
 */
(function(ST){
  'use strict';

  var el = ST.el;

  var TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  var ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
  var WORLD = [[-60, -170], [75, 175]];
  var PLACE_ZOOM = 11;

  var L = null;                 // Leaflet, once loaded
  var map = null;
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
    L.tileLayer(TILES, {
      subdomains: 'abcd', maxZoom: 20, maxNativeZoom: 20, noWrap: true,
      crossOrigin: true,            // so sw.js can keep a copy for offline use
      detectRetina: false
    }).addTo(map);
    map.fitBounds(WORLD);
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

  ST.map = { show: show, PLACE_ZOOM: PLACE_ZOOM };
})(window.StatusTerminal);
