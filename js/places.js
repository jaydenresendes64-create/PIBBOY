/**
 * Places — the MAP tab's logic, without the map itself (js/map.js draws
 * it): positions on the map, the offline city and region lists, finding
 * places by name, and revealing them (state.map, see js/state.js).
 * Nothing here touches the page, so the tests run it in Node.
 */
(function(ST){
  'use strict';

  var clamp = ST.clamp, foldName = ST.foldName, genId = ST.genId, todayStr = ST.todayStr;
  var app = ST.app;

  var PIN_RADIUS = 500;               // a new pin's circle, in metres
  var PLACES_URL = 'data/places.txt';
  var SHAPES_URL = 'data/regions/';
  var RETRY_MS = 30000;               // a list that didn't load is tried again after this

  // ---------- positions ----------
  // The map is Web Mercator: a point's place on the whole world, from 0 to
  // 1 across (x) and down (y). Times the world's width in pixels at a zoom
  // (256 * 2^zoom), that's its pixel on the map.
  var MAX_LAT = 85.0511287798;
  var EARTH_M = 40075016.686;             // the equator's length, in metres
  function mercX(lon){ return (lon+180)/360; }
  function mercY(lat){
    var s = Math.sin(clamp(lat, -MAX_LAT, MAX_LAT)*Math.PI/180);
    return 0.5 - Math.log((1+s)/(1-s))/(4*Math.PI);
  }
  // How many pixels a metre is at latitude `lat`, on a map `worldPx` wide:
  // the same everywhere at the equator, more towards the poles.
  function pixelsPerMetre(lat, worldPx){
    return worldPx / (EARTH_M*Math.cos(clamp(lat, -MAX_LAT, MAX_LAT)*Math.PI/180));
  }
  // Metres between two points (great circle).
  function distance(lat1, lon1, lat2, lon2){
    var r = Math.PI/180;
    var a = Math.pow(Math.sin((lat2-lat1)*r/2), 2) +
      Math.cos(lat1*r)*Math.cos(lat2*r)*Math.pow(Math.sin((lon2-lon1)*r/2), 2);
    return 2*6371008.8*Math.asin(Math.min(1, Math.sqrt(a)));
  }

  // Inside a ring given as a flat list [lon, lat, lon, lat, ...].
  function inRing(lon, lat, ring){
    var inside = false;
    for (var i=0, j=ring.length-2; i<ring.length; j=i, i+=2){
      var xi = ring[i], yi = ring[i+1], xj = ring[j], yj = ring[j+1];
      if ((yi>lat)!==(yj>lat) && lon < (xj-xi)*(lat-yi)/(yj-yi)+xi) inside = !inside;
    }
    return inside;
  }
  // Inside a region's shape: in one of its polygons, not in that one's holes.
  function inShape(lon, lat, shape){
    var b = shape.lonBox;
    if (lon<b[0] || lon>b[2] || lat<b[1] || lat>b[3]) return false;
    return shape.lonlat.some(function(rings){
      if (!inRing(lon, lat, rings[0])) return false;
      for (var k=1;k<rings.length;k++) if (inRing(lon, lat, rings[k])) return false;
      return true;
    });
  }

  // ---------- the offline lists: countries, regions, cities ----------
  // data/places.txt (made by tools/build-map-data.js, which describes it):
  // read the first time it's needed (a search, marking a region, a bulk
  // list, a pin's country), then kept for the session. sw.js stores it at
  // install, so it's there offline from the first open.
  var db = null, dbPromise = null, dbFailedAt = 0;
  function parsePlaces(text){
    var out = {countries:[], country:{}, regions:[], region:{}, cities:[]};
    var units = [], part = null;
    String(text).split('\n').forEach(function(line){
      line = line.replace(/\r$/, '');
      if (!line) return;
      if (line.charAt(0)==='#'){ part = line.slice(1); return; }
      var f = line.split('\t');
      if (part==='countries'){
        var country = {cc:f[0], name:f[1], key:foldName(f[1])};
        out.countries.push(country);
        out.country[country.cc] = country;
      } else if (part==='groups' || part==='regions'){
        var group = part==='groups';
        var names = [f[2]].concat(!group && f[5] ? f[5].split('|') : []);
        var region = {code:f[0], cc:f[1], name:f[2], type:group ? 'Region' : f[3], isGroup:group,
          group:group ? null : out.region[f[4]] || null, keys:names.map(foldName)};
        out.regions.push(region);
        out.region[region.code] = region;
        if (!group) units.push(region);
      } else if (part==='cities'){
        out.cities.push({name:f[0], key:foldName(f[0]), lat:+f[1], lon:+f[2], cc:f[3],
          region:f[4] ? units[parseInt(f[4], 36)] || null : null, pop:(+f[5]||0)*1000, gid:parseInt(f[6], 36)});
      }
    });
    return out;
  }
  // Resolves with the lists (once loaded, data() has them too).
  function loadPlaces(){
    if (db) return Promise.resolve(db);
    if (!dbPromise){
      if (Date.now()-dbFailedAt < RETRY_MS) return Promise.reject(new Error('Places unavailable'));
      dbPromise = fetch(PLACES_URL).then(function(response){
        if (!response.ok) throw new Error('HTTP '+response.status);
        return response.text();
      }).then(function(text){
        db = parsePlaces(text);
        return db;
      });
      dbPromise.catch(function(){ dbPromise = null; dbFailedAt = Date.now(); });
    }
    return dbPromise;
  }
  function data(){ return db; }
  // Only for the tests: lists read from the file directly.
  function useData(parsed){ db = parsed; dbPromise = null; }

  // A country from what was typed: its name, its code, or a common other
  // name (English or French), whatever the accents and case.
  var COUNTRY_ALIASES = {
    usa:'US', us:'US', unitedstatesofamerica:'US', america:'US', etatsunis:'US',
    uk:'GB', greatbritain:'GB', britain:'GB', england:'GB', scotland:'GB', wales:'GB', northernireland:'GB',
    royaumeuni:'GB', angleterre:'GB', ecosse:'GB',
    holland:'NL', thenetherlands:'NL', paysbas:'NL', czechrepublic:'CZ', russianfederation:'RU', russie:'RU',
    korea:'KR', ivorycoast:'CI', cotedivoire:'CI', uae:'AE', unitedarabemirates:'AE', emiratsarabesunis:'AE',
    burma:'MM', turkiye:'TR', turquie:'TR', vatican:'VA', palestine:'PS', macau:'MO',
    maroc:'MA', algerie:'DZ', tunisie:'TN', egypte:'EG', allemagne:'DE', espagne:'ES', italie:'IT',
    suisse:'CH', belgique:'BE', autriche:'AT', grece:'GR', irlande:'IE', islande:'IS', norvege:'NO',
    suede:'SE', danemark:'DK', finlande:'FI', pologne:'PL', hongrie:'HU', roumanie:'RO', croatie:'HR',
    mexique:'MX', bresil:'BR', argentine:'AR', chili:'CL', perou:'PE', colombie:'CO', japon:'JP',
    chine:'CN', coreedusud:'KR', inde:'IN', thailande:'TH', indonesie:'ID', australie:'AU',
    nouvellezelande:'NZ', afriquedusud:'ZA', senegal:'SN', liban:'LB', jordanie:'JO', arabiesaoudite:'SA'
  };
  function findCountry(text){
    if (!db) return null;
    var raw = String(text||'').trim();
    if (/^[A-Za-z]{2}$/.test(raw) && db.country[raw.toUpperCase()]) return db.country[raw.toUpperCase()];
    var key = foldName(raw);
    if (!key) return null;
    if (COUNTRY_ALIASES[key]) return db.country[COUNTRY_ALIASES[key]] || null;
    return db.countries.filter(function(c){ return c.key===key; })[0] || null;
  }
  function countryName(cc){
    return db && db.country[cc] ? db.country[cc].name : (cc || '');
  }

  // ---------- searching cities ----------
  // Up to `limit` cities for what was typed: the same name first, then names
  // starting with it, then names containing it, biggest first. "Paris, US"
  // (or "Paris, Texas") narrows it to a country (or region).
  function searchCities(query, limit){
    if (!db) return [];
    limit = limit || 8;
    var parts = String(query||'').split(',');
    var key = foldName(parts[0]);
    if (!key) return [];
    var filter = parts.length>1 ? parts.slice(1).join(',') : '';
    var country = filter ? findCountry(filter) : null;
    var regionKey = filter && !country ? foldName(filter) : '';
    var same = [], starting = [], inside = [];
    for (var i=0;i<db.cities.length && same.length<limit;i++){
      var c = db.cities[i];
      if (country && c.cc!==country.cc) continue;
      if (regionKey && !(c.region && inRegionNamed(c, regionKey))) continue;
      var at = c.key.indexOf(key);
      if (at===-1) continue;
      if (c.key===key) same.push(c);
      else if (at===0){ if (starting.length<limit) starting.push(c); }
      else if (inside.length<limit) inside.push(c);
    }
    return same.concat(starting, inside).slice(0, limit);
  }
  function inRegionNamed(city, key){
    var r = city.region;
    return r.keys.indexOf(key)!==-1 || (r.group && r.group.keys.indexOf(key)!==-1);
  }
  // A city's region and country, to tell apart cities of the same name:
  // "Québec, Canada".
  function cityWhere(c){
    return [c.region ? c.region.name : '', countryName(c.cc)].filter(Boolean).join(', ');
  }
  // The circle a listed city gets: about 3 km for a town of 15,000 people,
  // up to 15 km for a city of 3 million or more (by the logarithm of the
  // population), to the nearest half kilometre.
  function cityRadius(pop){
    if (!(pop>0)) return 3000;
    var t = (Math.log(pop)-Math.log(15000)) / (Math.log(3e6)-Math.log(15000));
    return Math.round(clamp(3+12*t, 3, 15)*2)*500;
  }
  // The listed cities nearest to a point, closest first.
  function nearestCities(lat, lon, count){
    if (!db) return [];
    var k = Math.cos(lat*Math.PI/180), best = [];
    db.cities.forEach(function(c){
      var dx = (c.lon-lon)*k, dy = c.lat-lat;
      var dLon = Math.abs(c.lon-lon);
      if (dLon>180) dx = (360-dLon)*k;
      var d = dx*dx+dy*dy;
      if (best.length<count || d<best[best.length-1].d){
        best.push({c:c, d:d});
        best.sort(function(a, b){ return a.d-b.d; });
        if (best.length>count) best.pop();
      }
    });
    return best.map(function(b){ return b.c; });
  }

  // ---------- region shapes (data/regions/XX.json) ----------
  // One file per country, loaded when a region of it is shown or looked up.
  var shapeFiles = {};      // cc -> {promise, byCode} or {failedAt}
  function decodeRing(flat){
    var lonlat = new Float64Array(flat.length), merc = new Float64Array(flat.length);
    var x = 0, y = 0;
    for (var i=0;i<flat.length;i+=2){
      x += flat[i]; y += flat[i+1];
      lonlat[i] = x/1000; lonlat[i+1] = y/1000;
      merc[i] = mercX(x/1000); merc[i+1] = mercY(y/1000);
    }
    return {lonlat:lonlat, merc:merc};
  }
  function makeShape(code, cc){
    return {code:code, cc:cc, polygons:[], lonlat:[], box:[1, 1, 0, 0], lonBox:[180, 90, -180, -90], lat:0};
  }
  function addToShape(shape, box, polygons){
    polygons.forEach(function(poly){
      var rings = poly.map(decodeRing);
      shape.polygons.push(rings.map(function(r){ return r.merc; }));
      shape.lonlat.push(rings.map(function(r){ return r.lonlat; }));
    });
    var lb = shape.lonBox;
    lb[0] = Math.min(lb[0], box[0]); lb[1] = Math.min(lb[1], box[1]);
    lb[2] = Math.max(lb[2], box[2]); lb[3] = Math.max(lb[3], box[3]);
    shape.box = [mercX(lb[0]), mercY(lb[3]), mercX(lb[2]), mercY(lb[1])];
    shape.lat = (lb[1]+lb[3])/2;
  }
  // {code: shape} for every region and group of a country's file.
  function decodeShapes(file){
    var byCode = {};
    var groups = (file.groups||[]).map(function(g){ return byCode[g[0]] = makeShape(g[0], file.cc); });
    (file.regions||[]).forEach(function(r){
      var shape = byCode[r[0]] = makeShape(r[0], file.cc);
      addToShape(shape, r[4], r[5]);
      if (r[3]>=0 && groups[r[3]]) addToShape(groups[r[3]], r[4], r[5]);
    });
    return byCode;
  }
  function loadShapes(cc){
    var entry = shapeFiles[cc];
    if (entry && entry.promise) return entry.promise;
    if (entry && Date.now()-entry.failedAt < RETRY_MS) return Promise.reject(new Error('Shapes unavailable'));
    if (!/^[A-Z]{2}$/.test(cc||'')) return Promise.reject(new Error('No country'));
    entry = shapeFiles[cc] = {byCode:null};
    entry.promise = fetch(SHAPES_URL+cc+'.json').then(function(response){
      if (!response.ok) throw new Error('HTTP '+response.status);
      return response.json();
    }).then(function(file){
      entry.byCode = decodeShapes(file);
      if (ST.map) ST.map.redrawFog();
      return entry.byCode;
    });
    entry.promise.catch(function(){ shapeFiles[cc] = {failedAt:Date.now()}; });
    return entry.promise;
  }
  function shapeOf(code, cc){
    var entry = shapeFiles[cc];
    return entry && entry.byCode ? entry.byCode[code] || null : null;
  }
  // The shapes of the revealed regions that are loaded; the others start
  // loading (the fog is drawn again once they're there).
  function regionShapes(){
    var m = app.state && app.state.map;
    if (!m) return [];
    var out = [];
    m.regions.forEach(function(r){
      var shape = shapeOf(r.code, r.cc);
      if (shape) out.push(shape);
      else loadShapes(r.cc).catch(function(){});
    });
    return out;
  }
  // The region (not a group) of country `cc` a point is in, or null.
  function regionAt(lat, lon, cc){
    return loadShapes(cc).then(function(byCode){
      var found = null;
      Object.keys(byCode).some(function(code){
        if (code.indexOf('-G-')!==-1 || !inShape(lon, lat, byCode[code])) return false;
        found = code;
        return true;
      });
      return found && db ? db.region[found] || null : null;
    });
  }
  // What's at a point: {cc, city, distance, region}. The country and region
  // from the shapes of the countries of the nearest cities; the city when
  // one is close. Without the lists (offline before ever loading them),
  // everything is empty.
  function lookup(lat, lon){
    return loadPlaces().then(function(){
      var near = nearestCities(lat, lon, 12);
      var countries = [];
      near.forEach(function(c){ if (countries.indexOf(c.cc)===-1) countries.push(c.cc); });
      var closest = near[0] || null;
      var d = closest ? distance(lat, lon, closest.lat, closest.lon) : Infinity;
      var info = {cc:'', city:null, distance:d, region:null};
      // The biggest city whose circle the point is in (Montréal rather than
      // one of its boroughs), else the nearest one within 10 km.
      near.forEach(function(c){
        var dc = distance(lat, lon, c.lat, c.lon);
        if (dc<=cityRadius(c.pop) && (!info.city || c.pop>info.city.pop)){ info.city = c; info.distance = dc; }
      });
      if (!info.city && closest && d<=10000) info.city = closest;
      function next(i){
        if (i>=countries.length || i>=4) return info;
        return regionAt(lat, lon, countries[i]).catch(function(){ return null; }).then(function(region){
          if (!region) return next(i+1);
          info.region = region;
          info.cc = region.cc;
          return info;
        });
      }
      return next(0).then(function(result){
        if (!result.cc && closest && d<50000) result.cc = closest.cc;
        return result;
      });
    }, function(){ return {cc:'', city:null, distance:Infinity, region:null}; });
  }

  // ---------- revealing places ----------
  var LISTS = {city:'cities', region:'regions', pin:'pins'};
  function list(kind){ return app.state.map[LISTS[kind]]; }
  function findPlace(kind, id){
    return LISTS[kind] ? list(kind).filter(function(p){ return p.id===id; })[0] || null : null;
  }
  function revealedCity(gid){
    return gid ? app.state.map.cities.filter(function(c){ return c.gid===gid; })[0] || null : null;
  }
  function revealedRegion(code){
    return app.state.map.regions.filter(function(r){ return r.code===code; })[0] || null;
  }
  // A city: from the list ({name, cc, lat, lon, pop, gid}) or placed by
  // hand (no gid). Returns {place, isNew, reward}: reward is null when it's
  // been revealed before (no XP again), isNew false when it's on the map
  // already (nothing added).
  function revealCity(c, radius){
    var existing = revealedCity(c.gid);
    if (existing) return {place:existing, isNew:false, reward:null};
    var place = {id:genId(), name:String(c.name).slice(0, ST.PLACE_NAME_MAX), cc:c.cc||'', lat:c.lat, lon:c.lon,
      radius:clamp(Math.round(radius || cityRadius(c.pop)), ST.CITY_RADIUS_MIN, ST.CITY_RADIUS_MAX),
      date:todayStr(), note:''};
    if (c.gid) place.gid = c.gid;
    app.state.map.cities.push(place);
    return {place:place, isNew:true, reward:ST.discoverPlace(ST.placeKey('city', place), ST.CITY_XP)};
  }
  // A region or group from the lists ({code, cc, name}); like revealCity.
  function revealRegion(r){
    var existing = revealedRegion(r.code);
    if (existing) return {place:existing, isNew:false, reward:null};
    var place = {id:genId(), name:String(r.name).slice(0, ST.PLACE_NAME_MAX), cc:r.cc||'', code:r.code, date:todayStr(), note:''};
    app.state.map.regions.push(place);
    loadShapes(place.cc).catch(function(){});
    return {place:place, isNew:true, reward:ST.discoverPlace(ST.placeKey('region', place), ST.REGION_XP)};
  }
  // A pin: no XP.
  function addPin(lat, lon, name, cc){
    var place = {id:genId(), name:String(name).slice(0, ST.PLACE_NAME_MAX), cc:cc||'', lat:lat, lon:lon,
      radius:PIN_RADIUS, date:todayStr(), note:''};
    app.state.map.pins.push(place);
    return place;
  }
  function removePlace(kind, id){
    if (!findPlace(kind, id)) return false;
    app.state.map[LISTS[kind]] = list(kind).filter(function(p){ return p.id!==id; });
    return true;
  }
  // The header's counters. Countries: every one a revealed place is in.
  function counts(){
    var m = app.state.map, seen = {};
    m.cities.concat(m.regions, m.pins).forEach(function(p){ if (p.cc) seen[p.cc] = true; });
    return {countries:Object.keys(seen).length, cities:m.cities.length, regions:m.regions.length, pins:m.pins.length};
  }
  function plural(n, one, many){ return n+' '+(n===1 ? one : many); }
  function countsText(c){
    return [plural(c.countries, 'country', 'countries'), plural(c.cities, 'city', 'cities'),
      plural(c.regions, 'region', 'regions'), plural(c.pins, 'pin', 'pins')].join(' · ');
  }

  // ---------- a pasted list (bulk add) ----------
  // One line: "Montréal, Canada", "region: Casablanca-Settat, Morocco",
  // "Springfield, Illinois, USA", "- Paris". Returns {raw, kind: 'city' or
  // 'region', name, hint (a region or state, or ''), country (or null)}, or
  // null for an empty line.
  var REGION_PREFIX = /^(region|région|province|state|état|etat|departement|département)\s*:\s*/i;
  var CITY_PREFIX = /^(city|ville|town)\s*:\s*/i;
  function parseLine(raw){
    var text = String(raw||'').replace(/^\s*(?:[-*•·]+|\d+[.)])\s+/, '').trim();
    var kind = 'city';
    if (REGION_PREFIX.test(text)){ kind = 'region'; text = text.replace(REGION_PREFIX, ''); }
    else if (CITY_PREFIX.test(text)) text = text.replace(CITY_PREFIX, '');
    var parts = text.split(',').map(function(p){ return p.trim(); }).filter(Boolean);
    if (!parts.length) return null;
    var country = parts.length>1 ? findCountry(parts[parts.length-1]) : null;
    var middle = parts.slice(1, country ? -1 : parts.length);
    return {raw:String(raw).trim(), kind:kind, name:parts[0], hint:middle.join(', '), country:country};
  }
  // What a line matches: {status, options, pick, fuzzy}. status: 'found'
  // (one match), 'choose' (several: pick is the one chosen so far, the
  // biggest; with fuzzy, only close names were found and nothing is
  // chosen, pick -1) or 'missing'. Each option: {kind, city or region}.
  var MAX_OPTIONS = 6;
  function matchLine(line){
    var key = foldName(line.name), cc = line.country ? line.country.cc : null;
    var options = [], fuzzy = false;
    if (line.kind==='city'){
      options = cityMatches(key, cc, line.hint);
      if (!options.length) options = regionMatches(key, cc);        // "Île-de-France, France"
    } else {
      options = regionMatches(key, cc);
    }
    if (!options.length){
      fuzzy = true;
      options = line.kind==='city' ? closeSpellings(key, cc).concat(cityStarts(key, cc)) : [];
      if (!options.length) options = closeRegions(line.name, cc);
    }
    options = options.slice(0, MAX_OPTIONS);
    if (!options.length) return {status:'missing', options:[], pick:-1, fuzzy:false};
    if (options.length===1 && !fuzzy) return {status:'found', options:options, pick:0, fuzzy:false};
    return {status:'choose', options:options, pick:fuzzy ? -1 : 0, fuzzy:fuzzy};
  }
  function asCity(c){ return {kind:'city', city:c}; }
  function asRegion(r){ return {kind:'region', region:r}; }
  function cityMatches(key, cc, hint){
    if (!key) return [];
    var found = db.cities.filter(function(c){ return c.key===key && (!cc || c.cc===cc); });
    var hintKey = foldName(hint);
    if (hintKey){
      var narrowed = found.filter(function(c){ return c.region && inRegionNamed(c, hintKey); });
      if (narrowed.length) found = narrowed;
    }
    return found.map(asCity);
  }
  function cityStarts(key, cc){
    if (key.length<3) return [];
    var out = [];
    for (var i=0;i<db.cities.length && out.length<MAX_OPTIONS;i++){
      var c = db.cities[i];
      if (c.key.indexOf(key)===0 && (!cc || c.cc===cc)) out.push(asCity(c));
    }
    return out;
  }
  // Cities spelled almost the same ("Marrakech" for GeoNames' "Marrakesh"):
  // one letter different per 5, the closest first, then the biggest.
  function closeSpellings(key, cc){
    if (key.length<4) return [];
    var most = Math.max(1, Math.floor(key.length/5)), found = [];
    db.cities.forEach(function(c){
      if ((cc && c.cc!==cc) || Math.abs(c.key.length-key.length)>most) return;
      var d = editDistance(key, c.key, most);
      if (d<=most) found.push({c:c, d:d});
    });
    return found.sort(function(a, b){ return a.d-b.d; }).map(function(f){ return asCity(f.c); });
  }
  // Letters to change, add or remove to go from a to b (stops early past `most`).
  function editDistance(a, b, most){
    var prev = [], cur, i, j;
    for (j=0;j<=b.length;j++) prev.push(j);
    for (i=1;i<=a.length;i++){
      cur = [i];
      var low = i;
      for (j=1;j<=b.length;j++){
        cur.push(Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+(a.charAt(i-1)===b.charAt(j-1) ? 0 : 1)));
        low = Math.min(low, cur[j]);
      }
      if (low>most) return most+1;
      prev = cur;
    }
    return prev[b.length];
  }
  function regionMatches(key, cc){
    if (!key) return [];
    return db.regions.filter(function(r){ return r.keys.indexOf(key)!==-1 && (!cc || r.cc===cc); })
      .sort(function(a, b){ return b.isGroup-a.isGroup; }).map(asRegion);
  }
  // Regions sharing a word of 4 letters or more with the name typed:
  // "Casablanca-Settat" finds "Grand Casablanca".
  function words(name){
    return String(name).split(/[^\p{L}\p{N}]+/u).map(foldName).filter(function(w){ return w.length>=4; });
  }
  function closeRegions(name, cc){
    var typed = words(name);
    if (!typed.length) return [];
    return db.regions.filter(function(r){
      if (cc && r.cc!==cc) return false;
      var own = words(r.name);
      return typed.some(function(w){ return own.indexOf(w)!==-1; });
    }).map(asRegion);
  }
  // "Montréal — Québec, Canada", "Grand Casablanca — Region, Morocco".
  function optionWhere(option){
    if (option.kind==='city') return cityWhere(option.city);
    var r = option.region;
    return [r.type || 'Region', countryName(r.cc)].filter(Boolean).join(', ');
  }
  function optionName(option){ return option.kind==='city' ? option.city.name : option.region.name; }
  // Every line of a pasted list, matched: [{line, match}] (at most MAX_LINES).
  var MAX_LINES = 200;
  function matchList(text){
    return String(text||'').split(/\r?\n/).map(parseLine).filter(Boolean).slice(0, MAX_LINES).map(function(line){
      return {line:line, match:matchLine(line)};
    });
  }
  // Reveals every chosen option at once: [{kind, city or region}]. Returns
  // the results (revealCity/revealRegion), for one banner and the XP.
  function revealAll(options){
    return options.map(function(o){ return o.kind==='city' ? revealCity(o.city) : revealRegion(o.region); });
  }

  ST.places = {
    MAX_LAT: MAX_LAT,
    PIN_RADIUS: PIN_RADIUS,
    mercX: mercX,
    mercY: mercY,
    pixelsPerMetre: pixelsPerMetre,
    distance: distance,
    inShape: inShape,
    parsePlaces: parsePlaces,
    loadPlaces: loadPlaces,
    data: data,
    useData: useData,
    findCountry: findCountry,
    countryName: countryName,
    searchCities: searchCities,
    cityWhere: cityWhere,
    cityRadius: cityRadius,
    nearestCities: nearestCities,
    decodeShapes: decodeShapes,
    loadShapes: loadShapes,
    shapeOf: shapeOf,
    regionShapes: regionShapes,
    lookup: lookup,
    findPlace: findPlace,
    revealedCity: revealedCity,
    revealedRegion: revealedRegion,
    revealCity: revealCity,
    revealRegion: revealRegion,
    addPin: addPin,
    removePlace: removePlace,
    counts: counts,
    countsText: countsText,
    MAX_LINES: MAX_LINES,
    parseLine: parseLine,
    matchLine: matchLine,
    matchList: matchList,
    optionName: optionName,
    optionWhere: optionWhere,
    revealAll: revealAll
  };
})(window.StatusTerminal);
