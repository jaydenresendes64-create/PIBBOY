/**
 * MAP tab — a crisp vector map of the world down to street level
 * (MapLibre GL JS, vendor/maplibre/), in its own amber Pip-Boy style
 * (data/map-style.json), under the fog of war (js/fog.js).
 *
 * MapLibre is only loaded the first time the tab is opened, so the app
 * starts as fast as before. The map's data (vector tiles) come from
 * OpenFreeMap (see README "MAP tab"); sw.js keeps the ones already seen for
 * offline use. A tile that can't load (offline, never seen) shows the faint
 * grid instead (places.noDataTile), and everything else still works.
 *
 * Gestures: drag and pinch on a phone, drag and the wheel on a computer;
 * always north up and flat (no rotating, no tilting). A long press (or a
 * right click) drops a pin. While a finger is on the map, 3D tilt holds
 * still (ST.tilt.hold), so the map stays under it. Nothing is drawn while
 * the map is still, hidden, or the app is in the background.
 *
 * Under the map: the place that's open (rename, resize, note, remove), the
 * city search, "I'm here", pins, marking a region, routes (js/routes.js),
 * and the lists. Revealing
 * and the XP are in js/places.js; this file changes state.map only through
 * it, apart from a place's name, radius and note typed here.
 */
(function(ST){
  'use strict';

  var el = ST.el, escapeHtml = ST.escapeHtml, attr = ST.escapeHtml;
  var app = ST.app;

  var MAPLIBRE = 'vendor/maplibre/';
  var STYLE_URL = 'data/map-style.json';
  // Where the map opens, and "Recenter" with no place yet: Montréal, home.
  var HOME = [[-73.95, 45.40], [-73.40, 45.72]];   // [[west, south], [east, north]]
  var MAX_ZOOM = 19;
  var LONG_PRESS_MS = 550, LONG_PRESS_SLOP_PX = 10;

  var ml = null;                // MapLibre, once loaded
  var map = null;
  var fog = null;               // the fog layer (js/fog.js)
  var markers = [];             // the cities' and pins' marks
  var P = ST.places, R = ST.render;
  var panel = null;             // what's open under the map: {kind:'place', type, id, confirm},
                                // {kind:'region', cc}, {kind:'here', status, lat, lon, info}, or a bulk list
  var placing = null;           // waiting for a tap on the map: {pin:true} or {onPlace}, and its hint text
  var lastPlace = null;         // {type, id}: the place opened or added last (Recenter)
  var pendingFocus = null;      // a place to show once the map exists
  var loading = null;           // the promise of MapLibre and the style
  var built = false;            // the tab's frame (map box, buttons) is in the page
  var onScreen = false;         // the map box is on the screen (the tab open, not scrolled away)
  var stayStill = ST.stayStill, dateText = ST.dateText;

  // ---------- loading MapLibre and the style (once) ----------
  // MapLibre's stylesheet goes before the app's, so the app's own map styles
  // win. MapLibre is a module (import()), so the map needs the app served
  // over http(s), like the city list; its worker is the file next to it.
  function load(){
    if (!loading){
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = MAPLIBRE+'maplibre-gl.css';
      document.head.insertBefore(css, document.querySelector('link[href="css/terminal.css"]'));
      loading = Promise.all([
        import(new URL(MAPLIBRE+'maplibre-gl.mjs', document.baseURI).href),
        fetch(STYLE_URL).then(function(response){
          if (!response.ok) throw new Error('HTTP '+response.status);
          return response.json();
        })
      ]).then(function(parts){
        ml = parts[0];
        ml.addProtocol('omt', loadTile);
        return parts[1];
      });
      loading.catch(function(){ loading = null; css.remove(); });
    }
    return loading;
  }
  // The style's font files are the app's own (fonts/), so labels work
  // offline and look like the rest of the screen.
  function withFonts(style){
    var faces = style['font-faces'] || {};
    Object.keys(faces).forEach(function(name){
      faces[name].forEach(function(face){ face.url = new URL(face.url, document.baseURI).href; });
    });
    return style;
  }
  // A tile the style asks for (omt://...): from OpenFreeMap (through sw.js,
  // which keeps a copy). Nothing there: an empty tile. Can't be reached
  // (offline, never seen; sw.js says so with an empty tile marked
  // X-Tile-Missing rather than a network error): the "nodata" tile, drawn
  // as the faint grid.
  function loadTile(params, abort){
    var url = P.tileUrl(params.url);
    if (!url) return Promise.resolve({data: new ArrayBuffer(0)});
    return fetch(url, {signal: abort.signal}).then(function(response){
      if (response.headers.get('X-Tile-Missing')) return {data: P.noDataTile()};
      if (response.status!==200) return {data: new ArrayBuffer(0)};
      return response.arrayBuffer().then(function(data){ return {data: data}; });
    }, function(err){
      if (abort.signal.aborted) throw err;
      return {data: P.noDataTile()};
    });
  }
  // The grid of a tile that couldn't load: 64 CSS pixels a square, drawn
  // at twice the resolution so its lines stay sharp.
  function gridImage(){
    var n = 128, data = new Uint8Array(n*n*4);
    for (var y=0;y<n;y++){
      for (var x=0;x<n;x++){
        var line = x<2 || y<2, i = (y*n+x)*4;
        data[i] = line ? 45 : 23; data[i+1] = line ? 37 : 13; data[i+2] = line ? 14 : 5; data[i+3] = 255;
      }
    }
    return {width: n, height: n, data: data};
  }

  // ---------- the map ----------
  function createMap(style){
    var still = stayStill();
    map = new ml.Map({
      container: 'map-view',
      style: withFonts(style),
      bounds: HOME,
      minZoom: 0, maxZoom: MAX_ZOOM,
      renderWorldCopies: false,
      // North up, flat.
      dragRotate: false, pitchWithRotate: false, touchPitch: false, maxPitch: 0,
      attributionControl: false,
      // Resized by show() and on turning the phone (not while the tab is
      // hidden: squeezed to nothing, MapLibre would keep drawing).
      trackResize: false,
      fadeDuration: still ? 0 : 300,
      cancelPendingTileRequestsWhileZooming: true
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    if (still) map.dragPan.enable({maxSpeed: 0.001});
    map.addControl(new ml.AttributionControl({compact: false, customAttribution: 'Routes: OSRM'}), 'bottom-right');
    map.setMissingStyleImageResolver(function(id){
      if (id==='pipboy-grid' && !map.hasImage(id)) map.addImage(id, gridImage(), {pixelRatio: 2});
    });
    map.on('load', function(){
      status('');
      if (ST.routes) ST.routes.attach(map);      // the routes' lines, under the fog
      fog = ST.fog.createLayer(map, revealed);
      map.addLayer(fog);
      fog.setActive(onScreen);
      if (pendingFocus){ focusPlace(pendingFocus.type, pendingFocus.place); pendingFocus = null; }
    });
    map.on('zoomend', showLabels);
    // A right click (or a long press, which some phones send as one) drops
    // a pin; so does a tap after "Drop pin". A tap while placing a bulk-list
    // line places it.
    map.on('contextmenu', function(e){
      cancelPress();
      pinAt(e.lngLat.lat, e.lngLat.lng);
    });
    map.on('click', function(e){
      var target = e.originalEvent && e.originalEvent.target;
      if (!placing || (target && target.closest && target.closest('.map-marker'))) return;
      var what = placing;
      placing = null;
      showHint();
      if (what.pin) dropPin(e.lngLat.lat, e.lngLat.lng);
      else if (what.onPlace) what.onPlace(e.lngLat.lat, e.lngLat.lng);
    });
    listenLongPress(map.getCanvasContainer());
    showLabels();
    syncMarkers();
  }
  // What the fog opens: every city and pin as a circle, every region by
  // its shape (null until loaded: P.regionShapes() starts loading it, and
  // the fog is drawn again once it's there), and every route's road. Each
  // has its own key, so the fog can clear a new place smoothly and fog over
  // a removed one.
  function revealed(){
    var m = app.state && app.state.map;
    if (!m) return {circles: [], regions: [], routes: []};
    P.regionShapes();
    function circle(prefix){
      return function(p){ return {key: prefix+p.id, lat: p.lat, lon: p.lon, radius: p.radius}; };
    }
    return {
      circles: m.cities.map(circle('c:')).concat(m.pins.map(circle('p:'))),
      regions: m.regions.map(function(r){ return {key: 'r:'+r.code, shape: P.shapeOf(r.code, r.cc)}; }),
      routes: ST.routes ? ST.routes.fogItems() : []
    };
  }
  // Something revealed changed (a place added, resized, removed, a region's
  // shape loaded): the fog again, on the next frame.
  function redrawFog(){
    if (map && fog) map.triggerRepaint();
  }
  function animate(){ return !stayStill(); }
  function round5(v){ return Math.round(v*1e5)/1e5; }

  // A long press drops a pin (iPhones don't send it as a right click). A
  // move, a second finger or lifting the finger first cancels it.
  var press = null, lastPinAt = 0;
  function listenLongPress(box){
    box.addEventListener('touchstart', function(e){
      cancelPress();
      if (e.touches.length!==1 || (e.target.closest && e.target.closest('.map-marker'))) return;
      var t = e.touches[0];
      press = {x: t.clientX, y: t.clientY, timer: setTimeout(function(){
        var rect = box.getBoundingClientRect(), at = map.unproject([press.x-rect.left, press.y-rect.top]);
        press = null;
        pinAt(at.lat, at.lng);
      }, LONG_PRESS_MS)};
    }, {passive: true});
    box.addEventListener('touchmove', function(e){
      var t = e.touches[0];
      if (press && (e.touches.length!==1 || Math.abs(t.clientX-press.x)>LONG_PRESS_SLOP_PX || Math.abs(t.clientY-press.y)>LONG_PRESS_SLOP_PX)) cancelPress();
    }, {passive: true});
    box.addEventListener('touchend', cancelPress);
    box.addEventListener('touchcancel', cancelPress);
    // No browser menu over the map.
    box.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  }
  function cancelPress(){
    if (press){ clearTimeout(press.timer); press = null; }
  }
  // Both a long press and the right click it may also send: one pin.
  function pinAt(lat, lon){
    if (Date.now()-lastPinAt < 1000) return;
    lastPinAt = Date.now();
    dropPin(lat, lon);
  }

  // Place names show beside their marks once zoomed in enough.
  function showLabels(){
    var z = map.getZoom(), box = map.getContainer();
    box.classList.toggle('labels-cities', z>=5);
    box.classList.toggle('labels-pins', z>=10);
  }
  // The marks for the cities and pins (regions show by their shape). A tap
  // on one opens it. 44px to tap, a small dot to see.
  function syncMarkers(){
    if (!map) return;
    markers.forEach(function(mk){ mk.remove(); });
    markers = [];
    var m = app.state && app.state.map;
    if (!m) return;
    [['city', m.cities], ['pin', m.pins]].forEach(function(pair){
      pair[1].forEach(function(p){ addMarker(pair[0], p); });
    });
  }
  function addMarker(type, p){
    var selected = isOpen(type, p.id);
    var mark = document.createElement('div');
    mark.className = 'map-marker map-marker-'+type+(selected ? ' selected' : '');
    mark.setAttribute('role', 'button');
    mark.setAttribute('tabindex', '0');
    mark.setAttribute('aria-label', p.name);
    mark.title = p.name;
    mark.innerHTML = '<span class="mk-dot"></span><span class="mk-label">'+escapeHtml(p.name)+'</span>';
    if (selected) mark.style.zIndex = '1';
    // While a route is being added, a tap on a city or pin makes it the next stop.
    function tap(){ if (!(ST.routes && ST.routes.takeStop(p))) openPlace(type, p.id, false); }
    mark.addEventListener('click', function(e){ e.stopPropagation(); tap(); });
    mark.addEventListener('keydown', function(e){
      if (e.key==='Enter' || e.key===' '){ e.preventDefault(); tap(); }
    });
    markers.push(new ml.Marker({element: mark, anchor: 'center'}).setLngLat([p.lon, p.lat]).addTo(map));
  }

  // The map shows a place: its circle (or its region's shape) fills the view.
  function focusPlace(type, p){
    if (!map || !fog){ pendingFocus = {type:type, place:p}; return; }
    if (type==='region'){
      P.loadShapes(p.cc).then(function(){
        var shape = P.shapeOf(p.code, p.cc);
        if (shape && map) fitBox([[shape.lonBox[0], shape.lonBox[1]], [shape.lonBox[2], shape.lonBox[3]]], 12);
      }, function(){});
      return;
    }
    fitBox(P.boundsAround(p.lat, p.lon, p.radius*2.6), 15, 0);
  }
  function fitBox(box, maxZoom, padding){
    map.fitBounds(box, {maxZoom: maxZoom, padding: padding===undefined ? 16 : padding, animate: animate(), duration: 800});
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
        '<button data-map="bulk">Add several places</button>'+
        '<button class="map-route-btn" data-map="route-new">Add a route (a road trip)</button>'+
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
    watchScreen(box);
    window.addEventListener('resize', function(){ if (map && onScreen) map.resize(); });
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
      listHtml('pin', 'Pins', m.pins, 'No pins yet: long-press the map, or Drop pin.')+
      (ST.routes ? ST.routes.listHtml() : '');
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
    if (panel && panel.kind==='route' && !(ST.routes && ST.routes.find(panel.id))) panel = null;
    if (!panel){ area.innerHTML = ''; return; }
    area.innerHTML = panel.kind==='place' ? placeCardHtml()
      : panel.kind==='region' ? regionCardHtml()
      : panel.kind==='here' ? hereCardHtml()
      : panel.kind.indexOf('route')===0 ? (ST.routes ? ST.routes.html(panel) : '')
      : ST.bulk ? ST.bulk.html(panel) : '';
  }
  function closePanel(){
    panel = null;
    placing = null;
    showHint();
    clearHere();
    if (ST.routes) ST.routes.closed();
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
    if (ST.routes) ST.routes.sync();
    redrawFog();
  }
  // After a place was added, changed or removed here.
  function changed(){
    renderCounts();
    renderLists();
    syncMarkers();
    if (ST.routes) ST.routes.sync();
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
    if (ST.sfx) ST.sfx.play('mapSelect');
    placing = null;
    showHint();
    clearHere();
    if (ST.routes) ST.routes.closed();
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
        var dot = document.createElement('div');
        dot.className = 'map-here';
        hereMark = new ml.Marker({element: dot, anchor: 'center'}).setLngLat([asked.lon, asked.lat]).addTo(map);
        map.flyTo({center: [asked.lon, asked.lat], zoom: 11, animate: animate(), duration: 800});
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
  // Montréal (HOME).
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
    else fitBox(HOME, 14, 0);
  }
  // All my places: every circle, and every region whose shape is loaded.
  function fitAll(){
    if (!map) return;
    var box = P.placesBounds();
    if (box) fitBox(box, 12, 20);
    else fitBox(HOME, 14, 0);
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
    else if (action.indexOf('route')===0){ if (ST.routes) ST.routes.onAction(action, btn); }
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
    } else if (ST.routes && ST.routes.onInput(t)){
      // a route's name or note
    } else if (ST.bulk) ST.bulk.onInput(t);
  }
  function onChange(e){
    var t = e.target, p = openedPlace();
    if (t.id==='place-name' && p) t.value = p.name;          // emptied: the name stays as it was
    else if (t.id==='place-radius' && p) renderLists();
    else if (t.id==='region-country' && panel && panel.kind==='region'){ panel.cc = t.value; renderPanel(); focusIn('#region-pick'); }
    else if (ST.routes && ST.routes.onChange(t)){
      // a stop picked, or a route's name
    } else if (ST.bulk) ST.bulk.onChange(t);
  }
  function onKeyDown(e){
    if (e.key!=='Enter') return;
    if (e.target.id==='map-search'){ e.preventDefault(); if (results[0]) pickCity(results[0]); }
    else if (e.target.id==='place-name'){ e.preventDefault(); e.target.blur(); }
    else if (ST.bulk && ST.bulk.onEnter(e.target)) e.preventDefault();
  }

  // ---------- opening the tab ----------
  // Loads MapLibre and the style the first time, then makes the map fit its
  // box (it had no size while the tab was hidden).
  function show(){
    build();
    if (map){ map.resize(); return; }
    status('LOADING MAP…');
    load().then(function(style){
      if (map) return;
      try{ createMap(style); }
      catch(e){ status('MAP UNAVAILABLE — this browser can’t draw it'); }
    }, function(){
      status(location.protocol==='file:' ? 'MAP UNAVAILABLE — open the app from its web address'
        : 'MAP UNAVAILABLE — open it once while online');
    });
  }
  // The fog only moves while the map is on the screen (the tab open, not
  // scrolled away) and the app in front.
  function watchScreen(box){
    if (typeof IntersectionObserver!=='function'){ onScreen = true; return; }
    new IntersectionObserver(function(entries){
      onScreen = entries[entries.length-1].isIntersecting;
      if (onScreen && map) map.resize();
      if (fog) fog.setActive(onScreen);
    }).observe(box);
  }

  // For js/bulk.js, the "Add several places" list.
  function openPanel(next){ closePanel(); panel = next; renderPanel(); }
  function currentPanel(){ return panel; }
  function placeOnMap(text, onPlace){
    placing = {text: text, onPlace: onPlace};
    showHint();
    scrollToMap();
  }

  // For js/routes.js: show a box [[west, south], [east, north]]; waiting
  // for a tap on the map (then a tap on a route doesn't open it).
  function focusBox(box){
    if (!map){ scrollToMap(); return; }
    fitBox(box, 12, 24);
    scrollToMap();
  }
  function isPlacing(){ return !!placing; }

  ST.map = {
    show: show, render: render, redrawFog: redrawFog,
    // for js/bulk.js and js/routes.js
    renderPanel: renderPanel, openPanel: openPanel, closePanel: closePanel, currentPanel: currentPanel,
    placeOnMap: placeOnMap, changed: changed, celebrate: celebrate, fitAll: fitAll,
    renderLists: renderLists, focusBox: focusBox, isPlacing: isPlacing
  };
})(window.StatusTerminal);
