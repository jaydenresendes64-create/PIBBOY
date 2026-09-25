/**
 * Routes (MAP tab) — the roads of a trip between cities close to each other
 * (Toronto → Ottawa → Montréal): the fog clears along the road, and the map
 * draws it as an amber dotted line. Nothing is linked by itself: the player
 * picks the stops, in the order travelled, from their cities and pins (the
 * nearest first) or by tapping them on the map.
 *
 * The road is traced once, when the route is added, by OSRM's free public
 * server (router.project-osrm.org: OpenStreetMap roads, for reasonable
 * non-commercial use, at most one request a second); only the stops'
 * positions are sent. The road is then kept in the save (state.map.routes,
 * an encoded polyline, see js/state.js), so it shows offline and is never
 * asked for again. It's simplified first (SIMPLIFY_M), which keeps a trip of
 * a few hundred km to a few thousand characters.
 *
 * js/map.js shows this file's cards under the map (like js/bulk.js) and
 * passes it taps and typing; js/fog.js clears the fog along fogItems().
 * The helpers at the top don't touch the page, so the tests run them in Node.
 */
(function(ST){
  'use strict';

  var el = ST.el, escapeHtml = ST.escapeHtml, attr = ST.escapeHtml, clamp = ST.clamp;
  var app = ST.app, P = ST.places;

  var ROUTER = 'https://router.project-osrm.org/route/v1/driving/';
  var TRACE_MS = 20000;               // give up on the road service after this
  var MIN_GAP_MS = 1100;              // at most one request a second (the server's rule)
  var SIMPLIFY_M = 40;                // the road kept to 40 m: invisible under a corridor 3 km wide

  // ---------- the road ----------
  // Fewer points, the same road: Douglas-Peucker, keeping every point more
  // than `metres` off the line between the ones kept around it. `points`:
  // [lat, lon, ...]; so is the result.
  function simplify(points, metres){
    var n = points.length/2;
    if (n<3) return points.slice();
    var lat0 = points[0]*Math.PI/180, k = 6371008.8*Math.PI/180;
    var xs = new Float64Array(n), ys = new Float64Array(n);
    for (var i=0;i<n;i++){ xs[i] = points[i*2+1]*k*Math.cos(lat0); ys[i] = points[i*2]*k; }
    var keep = new Uint8Array(n), stack = [0, n-1];
    keep[0] = keep[n-1] = 1;
    while (stack.length){
      var last = stack.pop(), first = stack.pop();
      var ax = xs[first], ay = ys[first], dx = xs[last]-ax, dy = ys[last]-ay, len2 = dx*dx+dy*dy;
      var far = -1, farD = metres*metres;
      for (var j=first+1;j<last;j++){
        var t = len2>0 ? clamp(((xs[j]-ax)*dx+(ys[j]-ay)*dy)/len2, 0, 1) : 0;
        var ex = xs[j]-ax-t*dx, ey = ys[j]-ay-t*dy, d = ex*ex+ey*ey;
        if (d>farD){ farD = d; far = j; }
      }
      if (far>=0){ keep[far] = 1; stack.push(first, far, far, last); }
    }
    var out = [];
    for (var m=0;m<n;m++) if (keep[m]) out.push(points[m*2], points[m*2+1]);
    return out;
  }
  // The request for a trip's road: "lon,lat;lon,lat;..." (OSRM's order).
  function requestUrl(stops){
    return ROUTER+stops.map(function(s){ return (+s.lon).toFixed(5)+','+(+s.lat).toFixed(5); }).join(';')+
      '?overview=full&geometries=polyline&steps=false&alternatives=false';
  }
  // The road service's answer → {path, km}; throws 'noroad' when there's no
  // road between the stops (a sea), 'bad' for anything unexpected.
  function fromAnswer(json){
    if (json && (json.code==='NoRoute' || json.code==='NoSegment')) throw new Error('noroad');
    var r = json && json.code==='Ok' && json.routes && json.routes[0];
    var points = r && ST.decodePath(r.geometry);
    if (!points || points.length<4) throw new Error('bad');
    return {path: ST.encodePath(simplify(points, SIMPLIFY_M)), km: Math.round((Number(r.distance)||0)/100)/10};
  }
  var lastAsked = 0;
  function trace(stops){
    var wait = Math.max(0, lastAsked+MIN_GAP_MS-Date.now());
    return new Promise(function(resolve){ setTimeout(resolve, wait); }).then(function(){
      lastAsked = Date.now();
      var abort = typeof AbortController==='function' ? new AbortController() : null;
      var timer = setTimeout(function(){ if (abort) abort.abort(); }, TRACE_MS);
      return fetch(requestUrl(stops), {signal: abort ? abort.signal : undefined, credentials: 'omit'}).then(function(response){
        return response.json().catch(function(){ throw new Error(response.ok ? 'bad' : 'offline'); });
      }, function(){ throw new Error('offline'); }).then(function(json){
        clearTimeout(timer);
        return fromAnswer(json);
      }, function(err){ clearTimeout(timer); throw err; });
    });
  }

  // "Toronto → Ottawa → Montréal".
  function defaultName(stops){
    return stops.map(function(s){ return s.name; }).join(' → ').slice(0, ST.ROUTE_NAME_MAX);
  }
  // A route's road, ready for the fog and the map (worked out once per
  // road): its points on the 0-1 world (merc) and in degrees, the length
  // travelled up to each point (for the fog clearing along it), its box.
  var geometries = {};
  function geometry(route){
    var g = geometries[route.path];
    if (g) return g;
    var pts = ST.decodePath(route.path) || [];
    var n = pts.length/2, merc = new Float64Array(n*2), cum = new Float64Array(n);
    var box = [1, 1, 0, 0], lonBox = [180, 90, -180, -90];
    for (var i=0;i<n;i++){
      var lat = pts[i*2], lon = pts[i*2+1], x = P.mercX(lon), y = P.mercY(lat);
      merc[i*2] = x; merc[i*2+1] = y;
      if (i) cum[i] = cum[i-1]+Math.sqrt(Math.pow(x-merc[i*2-2], 2)+Math.pow(y-merc[i*2-1], 2));
      box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)];
      lonBox = [Math.min(lonBox[0], lon), Math.min(lonBox[1], lat), Math.max(lonBox[2], lon), Math.max(lonBox[3], lat)];
    }
    g = geometries[route.path] = {isRoute: true, points: pts, merc: merc, cum: cum, box: box, lonBox: lonBox,
      lat: (lonBox[1]+lonBox[3])/2};
    return g;
  }
  // What the fog clears: every route's road.
  function fogItems(){
    var m = app.state && app.state.map;
    return m ? m.routes.map(function(r){ return {key: 't:'+r.id, route: geometry(r)}; }) : [];
  }
  // For "All my places": each route's box [[west, south], [east, north]].
  function boxes(){
    return app.state.map.routes.map(function(r){
      var b = geometry(r).lonBox;
      return [[b[0], b[1]], [b[2], b[3]]];
    });
  }
  // The places a stop can be: the cities and pins on the map, the nearest
  // to the last stop first (a road trip goes to a neighbour), else by name.
  // The last stop itself isn't offered again.
  function candidates(stops){
    var m = app.state.map, last = stops[stops.length-1] || null;
    var list = m.cities.concat(m.pins).map(function(p){ return {name: p.name, lat: p.lat, lon: p.lon}; })
      .filter(function(p){ return !last || p.lat!==last.lat || p.lon!==last.lon; });
    if (!last) return list.sort(function(a, b){ return a.name.localeCompare(b.name); });
    list.forEach(function(p){ p.km = P.distance(last.lat, last.lon, p.lat, p.lon)/1000; });
    return list.sort(function(a, b){ return a.km-b.km; });
  }
  function find(id){ return app.state.map.routes.filter(function(r){ return r.id===id; })[0] || null; }
  function addRoute(stops, traced){
    var route = {id: ST.genId(), name: defaultName(stops), stops: stops.map(function(s){ return {name: s.name, lat: s.lat, lon: s.lon}; }),
      path: traced.path, km: traced.km, date: ST.todayStr(), note: ''};
    app.state.map.routes.push(route);
    return route;
  }
  function removeRoute(id){
    var before = app.state.map.routes.length;
    app.state.map.routes = app.state.map.routes.filter(function(r){ return r.id!==id; });
    return app.state.map.routes.length<before;
  }
  function kmText(km){ return (km>=100 ? Math.round(km) : Math.round(km*10)/10).toLocaleString('en-US')+' km'; }

  // ---------- on the map: the dotted line ----------
  var map = null, selected = null;
  var LINE = '#ffd27a';
  function lines(){
    var m = app.state && app.state.map;
    return {type: 'FeatureCollection', features: (m ? m.routes : []).map(function(r){
      var pts = geometry(r).points, coords = [];
      for (var i=0;i<pts.length;i+=2) coords.push([pts[i+1], pts[i]]);
      return {type: 'Feature', properties: {id: r.id}, geometry: {type: 'LineString', coordinates: coords}};
    })};
  }
  // Called by js/map.js once the map has loaded, before the fog (so the
  // line is under it, where the road is cleared anyway).
  function attach(m){
    map = m;
    map.addSource('routes', {type: 'geojson', data: lines()});
    function width(k){ return ['interpolate', ['linear'], ['zoom'], 4, 1.2*k, 10, 2.2*k, 15, 4*k]; }
    map.addLayer({id: 'routes-line', type: 'line', source: 'routes', layout: {'line-join': 'round'},
      paint: {'line-color': LINE, 'line-width': width(1), 'line-dasharray': [2, 1.6], 'line-opacity': 0.9}});
    // The open route: a soft glow under its dots.
    map.addLayer({id: 'routes-selected', type: 'line', source: 'routes', filter: ['==', ['get', 'id'], ''],
      layout: {'line-join': 'round', 'line-cap': 'round'},
      paint: {'line-color': LINE, 'line-width': width(2.5), 'line-blur': 2, 'line-opacity': 0.45}}, 'routes-line');
    // An invisible wide line, so a tap near the road opens the route.
    map.addLayer({id: 'routes-hit', type: 'line', source: 'routes',
      paint: {'line-color': LINE, 'line-width': 22, 'line-opacity': 0}});
    map.on('click', 'routes-hit', function(e){
      var p = ST.map.currentPanel();
      if (ST.map.isPlacing() || (p && p.kind==='route-new') || !e.features || !e.features[0]) return;
      openRoute(e.features[0].properties.id);
    });
    select(selected);
  }
  function sync(){
    var source = map && map.getSource('routes');
    if (source) source.setData(lines());
  }
  function select(id){
    selected = id || null;
    if (map && map.getLayer('routes-selected')) map.setFilter('routes-selected', ['==', ['get', 'id'], selected || '']);
  }

  // ---------- the cards ----------
  function panel(){
    var p = ST.map.currentPanel();
    return p && (p.kind==='route-new' || p.kind==='route') ? p : null;
  }
  function redraw(){ ST.map.renderPanel(); }
  function newHtml(p){
    var html = '<div class="place-card route-card"><div class="place-card-title">Add a route</div>'+
      '<div class="place-meta">The cities you drove between, in order: pick them below or tap them on the map. '+
      'The road between them is traced once (OSRM, online).</div>';
    if (p.stops.length){
      html += '<div class="route-stops">'+p.stops.map(function(s, i){
        return '<div class="route-stop"><span class="route-stop-n">'+(i+1)+'.</span><span class="route-stop-name">'+escapeHtml(s.name)+'</span>'+
          '<button class="bulk-link" data-map="route-stop-remove" data-i="'+i+'" aria-label="Remove stop: '+attr(s.name)+'">&times;</button></div>';
      }).join('')+'</div>';
    }
    var options = candidates(p.stops);
    if (!options.length && !p.stops.length){
      html += '<div class="place-meta">Reveal some cities first: search one above.</div>';
    } else if (p.stops.length<ST.ROUTE_STOPS_MAX){
      html += '<select id="route-add-stop" aria-label="Add a stop"'+(options.length ? '' : ' disabled')+'>'+
        '<option value="">'+(p.stops.length ? 'Next stop…' : 'First city…')+'</option>'+
        options.map(function(o, i){
          return '<option value="'+i+'">'+escapeHtml(o.name+(o.km!==undefined ? ' · '+kmText(o.km) : ''))+'</option>';
        }).join('')+
      '</select>';
    }
    if (p.error) html += '<div class="place-meta reset-warning">'+escapeHtml(p.error)+'</div>';
    return html+'<div class="place-buttons">'+
      '<button class="place-go" data-map="route-trace"'+(p.stops.length<2 || p.tracing ? ' disabled' : '')+'>'+
        (p.tracing ? 'Tracing the road…' : 'Trace the road')+'</button>'+
      '<button data-map="close">Cancel</button></div></div>';
  }
  function routeHtml(p){
    var r = find(p.id);
    if (!r) return '';
    var html = '<div class="place-card route-card">'+
      '<div class="place-card-head"><span class="badge">ROUTE</span>'+
        '<input type="text" id="route-name" class="place-name" maxlength="'+ST.ROUTE_NAME_MAX+'" value="'+escapeHtml(r.name)+'" aria-label="Name"></div>'+
      '<div class="place-meta">'+escapeHtml([kmText(r.km), r.stops.length+' stops', r.date ? 'added '+dateText(r.date) : ''].filter(Boolean).join(' · '))+'</div>'+
      '<div class="place-meta">'+escapeHtml(r.stops.map(function(s){ return s.name; }).join(' → '))+'</div>'+
      '<textarea id="route-note" class="place-note" rows="2" maxlength="'+ST.PLACE_NOTE_MAX+'" placeholder="Note (optional)" aria-label="Note">'+escapeHtml(r.note||'')+'</textarea>';
    if (p.confirm){
      html += '<div class="card-confirm"><span class="reset-warning">Remove this route?</span>'+
        '<button class="confirm-yes" data-map="route-remove-yes">Yes, remove</button>'+
        '<button data-map="route-remove-no">Cancel</button></div>';
    } else {
      html += '<div class="place-buttons"><button class="place-remove" data-map="route-remove">Remove</button>'+
        '<button data-map="close">Done</button></div>';
    }
    return html+'</div>';
  }
  function html(p){ return p.kind==='route-new' ? newHtml(p) : routeHtml(p); }
  function dateText(date){
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date || '');
    return m ? new Date(+m[1], +m[2]-1, +m[3]).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) : '';
  }
  // The Routes list under the map.
  function listHtml(){
    var list = app.state.map.routes;
    var out = '<div class="panel-title">Routes <span class="panel-count">'+list.length+'</span></div>';
    if (!list.length) return out+'<div class="empty-note">No routes yet: Add a route.</div>';
    return out+'<div class="place-list">'+list.slice().reverse().map(function(r){
      return '<button class="place-row'+(selected===r.id ? ' selected' : '')+'" data-map="route-open" data-id="'+attr(r.id)+'">'+
        '<span class="place-row-name">'+escapeHtml(r.name)+'</span>'+
        '<span class="place-row-meta">'+escapeHtml(kmText(r.km))+'</span></button>';
    }).join('')+'</div>';
  }

  // ---------- steps ----------
  function openNew(){
    ST.map.openPanel({kind: 'route-new', stops: [], tracing: false, error: ''});
    select(null);
  }
  function addStop(stop){
    var p = panel();
    if (!p || p.kind!=='route-new' || p.tracing || p.stops.length>=ST.ROUTE_STOPS_MAX) return false;
    var last = p.stops[p.stops.length-1];
    if (last && last.lat===stop.lat && last.lon===stop.lon) return true;
    p.stops.push({name: stop.name, lat: stop.lat, lon: stop.lon});
    p.error = '';
    redraw();
    if (ST.sfx) ST.sfx.play('mapSelect');
    return true;
  }
  // A tap on a city or pin on the map while adding a route: the next stop.
  function takeStop(place){ return addStop(place); }
  function traceNew(){
    var p = panel();
    if (!p || p.kind!=='route-new' || p.tracing || p.stops.length<2) return;
    p.tracing = true;
    p.error = '';
    redraw();
    trace(p.stops).then(function(traced){
      if (panel()!==p) return;
      var route = addRoute(p.stops, traced);
      ST.map.changed();
      ST.render.showDiscovered(route.name);
      openRoute(route.id);
    }, function(err){
      if (panel()!==p) return;
      p.tracing = false;
      p.error = err && err.message==='noroad' ? 'No road found between these stops (a sea between them?).'
        : err && err.message==='offline' ? 'Couldn’t reach the road service. Try again once online.'
        : 'The road couldn’t be traced. Try again in a moment.';
      redraw();
    });
  }
  // Opens a route's card, highlights it, and shows the whole road.
  function openRoute(id){
    var r = find(id);
    if (!r) return;
    if (ST.sfx) ST.sfx.play('mapSelect');
    ST.map.openPanel({kind: 'route', id: id, confirm: false});
    select(id);
    ST.map.renderLists();
    var b = geometry(r).lonBox;
    ST.map.focusBox([[b[0], b[1]], [b[2], b[3]]]);
  }
  function removeOpen(){
    var p = panel();
    if (!p || p.kind!=='route') return;
    removeRoute(p.id);
    select(null);
    ST.map.closePanel();
    ST.map.changed();
  }

  // ---------- taps and typing (passed on by js/map.js) ----------
  function onAction(action, btn){
    var p = panel();
    if (action==='route-new') openNew();
    else if (action==='route-open') openRoute(btn.getAttribute('data-id'));
    else if (!p) return;
    else if (action==='route-stop-remove'){ p.stops.splice(+btn.getAttribute('data-i'), 1); p.error = ''; redraw(); }
    else if (action==='route-trace') traceNew();
    else if (action==='route-remove'){ p.confirm = true; redraw(); }
    else if (action==='route-remove-no'){ p.confirm = false; redraw(); }
    else if (action==='route-remove-yes') removeOpen();
  }
  // Returns true when the box was this file's.
  function onInput(target){
    var p = panel(), r = p && p.kind==='route' ? find(p.id) : null;
    if (target.id==='route-name' && r){
      var name = target.value.trim().slice(0, ST.ROUTE_NAME_MAX);
      if (name && name!==r.name){ r.name = name; ST.map.renderLists(); ST.storage.scheduleSave(); }
      return true;
    }
    if (target.id==='route-note' && r){
      r.note = target.value.slice(0, ST.PLACE_NOTE_MAX);
      ST.storage.scheduleSave();
      return true;
    }
    return false;
  }
  function onChange(target){
    var p = panel();
    if (target.id==='route-add-stop' && p && p.kind==='route-new'){
      var o = candidates(p.stops)[+target.value];
      if (target.value!=='' && o) addStop(o);
      var box = el('route-add-stop');
      if (box) box.focus();
      return true;
    }
    if (target.id==='route-name'){
      var r = p && p.kind==='route' ? find(p.id) : null;
      if (r) target.value = r.name;               // emptied: the name stays as it was
      return true;
    }
    return false;
  }
  // The panel closed (Done, Cancel, another card): no route highlighted.
  function closed(){ select(null); }

  ST.routes = {
    SIMPLIFY_M: SIMPLIFY_M,
    simplify: simplify, requestUrl: requestUrl, fromAnswer: fromAnswer, trace: trace,
    defaultName: defaultName, geometry: geometry, fogItems: fogItems, boxes: boxes, candidates: candidates,
    find: find, addRoute: addRoute, removeRoute: removeRoute, kmText: kmText,
    // for js/map.js
    attach: attach, sync: sync, html: html, listHtml: listHtml, onAction: onAction, onInput: onInput,
    onChange: onChange, takeStop: takeStop, closed: closed
  };
})(window.StatusTerminal);
