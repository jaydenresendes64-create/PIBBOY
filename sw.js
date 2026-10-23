/**
 * Service worker — opens the app at once, online or not (which, with
 * manifest.webmanifest, also makes it installable on a phone).
 *
 * The app's own files (APP_SHELL): cache first. A version is the set of
 * those files, named by VERSION (a hash of them, written by
 * tools/stamp-sw.js; tests/sw.test.js checks it). Installing a version
 * downloads all of them, past the browser's own cache, into its own cache
 * (CACHE); if one can't be downloaded the install fails and the version
 * before stays in use, whole. Every open is then served from that cache,
 * without waiting for the network, so the files of one version are never
 * mixed with another's. A file missing from it (a big one skipped at
 * install, HEAVY) comes from the network and is kept.
 *
 * Updates: the browser checks sw.js on every open (and js/main.js asks again
 * when the app comes back to the screen). A new VERSION means a new sw.js:
 * it installs in the background and waits. The page puts it in when the app
 * goes to the background (its changes saved first): it asks for
 * SKIP_WAITING, this worker takes over and the page reloads, so the next
 * look at the app is the new version. Data never goes through here: an
 * older version that still runs can't write over newer data (storage.js).
 *
 * Other files of the app's site (the region shapes, data/regions/) are kept
 * in DATA_CACHE across versions: shown from there, refreshed in the
 * background. The optional AI function (api/) is never cached.
 *
 * The MAP tab: MapLibre (vendor/maplibre/), the map's style
 * (data/map-style.json, whose labels use the app's own fonts) and the city
 * and region list (data/places.txt) are part of APP_SHELL, so the map and
 * city search work offline from the first open. The map's data (vector
 * tiles, from OpenFreeMap) are kept in their own cache as they're seen, at
 * most TILE_MAX of them (the oldest go first), so the places already looked
 * at still show offline. Only tiles actually shown are kept, never fetched
 * ahead (OpenFreeMap's terms forbid bulk downloads). A kept tile older than
 * TILE_REFRESH_MS is shown, then fetched again in the background. Offline, a
 * tile never seen fails, and the map draws its faint grid there (js/map.js).
 */
'use strict';

var CACHE_PREFIX = 'status-terminal-';
var VERSION = '496bc9766101';                       // node tools/stamp-sw.js
var CACHE = CACHE_PREFIX + VERSION;
var DATA_CACHE = CACHE_PREFIX + 'data';             // kept across versions
var TILE_CACHE = CACHE_PREFIX + 'vector-tiles';     // kept across versions
var TILE_HOST = 'tiles.openfreemap.org';
var TILE_MAX = 800;                                 // about 50 MB at most
var TILE_REFRESH_MS = 30*864e5;                     // OpenFreeMap's data changes every week
var KEPT_AT = 'x-kept-at';

// One version of the app: cached at install, so it opens offline after the first visit.
var APP_SHELL = [
  './',
  'index.html',
  'css/terminal.css',
  'js/errors.js', 'js/state.js', 'js/storage.js', 'js/ai.js', 'js/places.js', 'js/sfx.js', 'js/sfx-custom.js', 'js/weather.js', 'js/boot.js', 'js/render.js', 'js/items3d.js', 'js/mascot.js', 'js/crt.js', 'js/tilt.js', 'js/fog.js', 'js/map.js', 'js/bulk.js', 'js/routes.js', 'js/radar.js', 'js/holotapes.js', 'js/insight.js', 'js/vitals.js', 'js/trials.js', 'js/events.js', 'js/main.js',
  'vendor/maplibre/maplibre-gl.mjs', 'vendor/maplibre/maplibre-gl-shared.mjs', 'vendor/maplibre/maplibre-gl-worker.mjs', 'vendor/maplibre/maplibre-gl.css',
  'vendor/three/three.pibboy.min.js',
  'data/map-style.json', 'data/places.txt',
  'images/mascot-parts.png',
  'images/vaultboy/walk-lvl05.png',
  'images/vaultboy/parts-lvl05.png', 'images/vaultboy/parts-lvl10.png', 'images/vaultboy/parts-lvl20.png', 'images/vaultboy/parts-lvl30.png', 'images/vaultboy/parts-lvl50.png',
  'fonts/vt323.woff2', 'fonts/ibm-plex-mono.woff2',
  'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'
];
var SHELL = {};
APP_SHELL.forEach(function(file){ SHELL[new URL(file, self.location).href] = true; });
var INDEX = new URL('index.html', self.location).href;
var API_URL = new URL('api/', self.location).href;

// Heavy files: one failure must not block install (addAll is all-or-nothing).
var HEAVY = {
  'data/places.txt': 1,
  'vendor/maplibre/maplibre-gl.mjs': 1,
  'vendor/maplibre/maplibre-gl-shared.mjs': 1,
  'vendor/maplibre/maplibre-gl-worker.mjs': 1,
  'vendor/maplibre/maplibre-gl.css': 1,
  'vendor/three/three.pibboy.min.js': 1
};

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE).then(function(cache){
      function req(url){ return new Request(url, {cache:'reload'}); }
      // 'reload' skips the browser's HTTP cache, so the copies are current.
      var core = APP_SHELL.filter(function(url){ return !HEAVY[url]; });
      var heavy = APP_SHELL.filter(function(url){ return HEAVY[url]; });
      return cache.addAll(core.map(req)).then(function(){
        return Promise.all(heavy.map(function(url){
          return cache.add(req(url)).catch(function(){});
        }));
      });
    }).then(function(){
      // The first version takes over at once (no page runs another one);
      // a later one waits for the page's SKIP_WAITING.
      if (!self.registration || !self.registration.active) return self.skipWaiting();
    })
  );
});

self.addEventListener('message', function(event){
  if (event.data && event.data.type==='SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', function(event){
  // Only this app's old versions: every GitHub Pages project of the same
  // account shares one origin, and so one cache storage.
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(key){
        return key.indexOf(CACHE_PREFIX)===0 && key!==CACHE && key!==DATA_CACHE && key!==TILE_CACHE;
      }).map(function(key){ return caches.delete(key); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

// Stores a copy of a good response in `name`.
function keep(event, name, request, response){
  if (response && response.status===200){
    var copy = response.clone();
    event.waitUntil(caches.open(name).then(function(cache){ return cache.put(request, copy); }).catch(function(){}));
  }
  return response;
}
function fromCache(name, request){
  return caches.open(name).then(function(cache){ return cache.match(request); });
}
// The network, past the browser's 10-minute HTTP cache.
function fresh(request){
  return fetch(new Request(request.url, {credentials:'same-origin', cache:'no-cache'})).then(function(response){
    // A page may not be answered with a redirected response: pass its body on.
    if (request.mode==='navigate' && response.redirected){
      response = new Response(response.body, {status:response.status, statusText:response.statusText, headers:response.headers});
    }
    return response;
  });
}

// The app's files (`key`: its address without ?query): this version's
// cached copy, at once; the network only for a file the install skipped
// (then kept). Any page of the app opens index.html.
function appFile(event, key){
  var request = event.request;
  return fromCache(CACHE, key).then(function(cached){
    if (cached) return cached;
    return fresh(request).then(function(response){ return keep(event, CACHE, key, response); });
  }).catch(function(){ return Response.error(); });
}

// The site's other files (region shapes): the kept copy at once, refreshed
// in the background; the network the first time.
function dataFile(event){
  var request = event.request;
  return fromCache(DATA_CACHE, request.url).then(function(cached){
    var update = fresh(request).then(function(response){ return keep(event, DATA_CACHE, request.url, response); });
    if (cached){ event.waitUntil(update.catch(function(){})); return cached; }
    return update;
  }).catch(function(){ return Response.error(); });
}

// A map tile: the kept copy, else the network (then kept, with the time it
// was kept). Only a readable (CORS) answer is kept: 200, or 204 for "nothing
// here". Offline, a tile never seen is an empty answer marked X-Tile-Missing
// (js/map.js draws the grid there), not a network error in the console.
function tile(event){
  var request = event.request;
  return caches.open(TILE_CACHE).then(function(cache){
    function fresh(){
      return fetch(request.url, {mode:'cors', credentials:'omit'}).then(function(response){
        if ((response.status===200 || response.status===204) && response.type==='cors'){
          event.waitUntil(response.clone().arrayBuffer().then(function(body){
            var headers = new Headers(response.headers);
            headers.set(KEPT_AT, String(Date.now()));
            var copy = new Response(response.status===204 ? null : body, {status:response.status, statusText:response.statusText, headers:headers});
            return cache.put(request.url, copy).then(function(){ return trim(cache); });
          }).catch(function(){}));
        }
        return response;
      });
    }
    return cache.match(request.url).then(function(cached){
      if (!cached) return fresh();
      if (Date.now()-Number(cached.headers.get(KEPT_AT)||0) > TILE_REFRESH_MS) event.waitUntil(fresh().catch(function(){}));
      return cached;
    });
  }).catch(function(){
    return new Response(null, {status:200, headers:{'X-Tile-Missing':'1'}});
  });
}
function trim(cache){
  return cache.keys().then(function(keys){
    // keys() lists them oldest kept first (put() moves a refreshed one last).
    return Promise.all(keys.slice(0, Math.max(0, keys.length-TILE_MAX)).map(function(key){ return cache.delete(key); }));
  });
}

self.addEventListener('fetch', function(event){
  var request = event.request;
  if (request.method!=='GET') return;
  var url = new URL(request.url);
  if (url.origin===self.location.origin){
    if (request.url.indexOf(API_URL)===0) return;      // never cached
    url.search = '';
    if (request.mode==='navigate') event.respondWith(appFile(event, INDEX));
    else event.respondWith(SHELL[url.href] ? appFile(event, url.href) : dataFile(event));
  } else if (url.protocol==='https:' && url.hostname===TILE_HOST){
    event.respondWith(tile(event));
  }
});
