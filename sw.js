/**
 * Service worker — lets the app open without a connection, which (with
 * manifest.webmanifest) also makes it installable on a phone.
 *
 * The app's own files: network first. While online every request goes to
 * GitHub Pages, checked against the server rather than the browser's own
 * 10-minute cache ('no-cache'), so a new version shows up on the next
 * open, with all its files from the same version. Each response is copied
 * into the cache on the way through, and the cached copy is only used when
 * the network fails or takes longer than NET_MS (a weak signal): the app
 * then opens from the cache at once, and the network's answer, when it
 * comes, refreshes the copy for the next open. (Just after an update on a
 * weak signal, that one open may mix old and new files.) So this file
 * doesn't need to change when the app does; bump CACHE only to throw the
 * old copies away. At install, a big file (HEAVY) that can't be downloaded
 * is skipped rather than stopping the install; it's kept on first use.
 *
 * The fonts are the app's own files too (fonts/), so they're there offline
 * from the first visit.
 *
 * The optional AI function (api/) is never cached.
 *
 * The MAP tab: MapLibre (vendor/maplibre/), the map's style
 * (data/map-style.json, whose labels use the app's own fonts) and the city
 * and region list (data/places.txt) are cached at install with the app, so
 * the map and city search work offline from the first open; the region
 * shapes (data/regions/) are cached like the app's files, the first time
 * each is used. The map's data (vector tiles, from OpenFreeMap) are kept in
 * their own cache as they're seen, at most TILE_MAX of them (the oldest go
 * first), so the places already looked at still show offline. Only tiles
 * actually shown are kept, never fetched ahead (OpenFreeMap's terms forbid
 * bulk downloads). A kept tile older than TILE_REFRESH_MS is shown, then
 * fetched again in the background. Offline, a tile never seen fails, and
 * the map draws its faint grid there (js/map.js).
 */
'use strict';

var CACHE_PREFIX = 'status-terminal-';
var CACHE = CACHE_PREFIX + 'v16';
var TILE_CACHE = CACHE_PREFIX + 'vector-tiles';     // kept across versions
var TILE_HOST = 'tiles.openfreemap.org';
var TILE_MAX = 800;                                 // about 50 MB at most
var TILE_REFRESH_MS = 30*864e5;                     // OpenFreeMap's data changes every week
var KEPT_AT = 'x-kept-at';
var NET_MS = 2500;                                  // give up on GitHub Pages and use the cache

// Cached at install, so the app opens offline after the first visit.
var APP_SHELL = [
  './',
  'index.html',
  'css/terminal.css',
  'js/state.js', 'js/storage.js', 'js/ai.js', 'js/places.js', 'js/sfx.js', 'js/sfx-custom.js', 'js/weather.js', 'js/boot.js', 'js/render.js', 'js/items3d.js', 'js/mascot.js', 'js/crt.js', 'js/tilt.js', 'js/fog.js', 'js/map.js', 'js/bulk.js', 'js/routes.js', 'js/radar.js', 'js/holotapes.js', 'js/events.js', 'js/main.js',
  'vendor/maplibre/maplibre-gl.mjs', 'vendor/maplibre/maplibre-gl-shared.mjs', 'vendor/maplibre/maplibre-gl-worker.mjs', 'vendor/maplibre/maplibre-gl.css',
  'vendor/three/three.pibboy.min.js',
  'data/map-style.json', 'data/places.txt',
  'images/mascot.png',
  'fonts/vt323.woff2', 'fonts/ibm-plex-mono.woff2',
  'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'
];
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
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event){
  // Only this app's old caches: every GitHub Pages project of the same
  // account shares one origin, and so one cache storage.
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(key){
        return key.indexOf(CACHE_PREFIX)===0 && key!==CACHE && key!==TILE_CACHE;
      }).map(function(key){ return caches.delete(key); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

// Stores a copy of a good response.
function keep(event, request, response){
  if (response.status===200){
    var copy = response.clone();
    event.waitUntil(caches.open(CACHE).then(function(cache){ return cache.put(request, copy); }));
  }
  return response;
}
function fromCache(request, options){
  return caches.open(CACHE).then(function(cache){ return cache.match(request, options); });
}

// The app's files: the network (past the HTTP cache), else the cached copy;
// a page opened offline falls back to the cached index.html.
function networkFirst(event){
  var request = event.request;
  var navigating = request.mode==='navigate';
  // A navigation request can't be copied with new options: fetch its URL.
  var fresh = navigating
    ? new Request(request.url, {credentials:'same-origin', cache:'no-cache'})
    : new Request(request, {cache:'no-cache'});
  var timedOut = false;
  var clock = new Promise(function(resolve){
    setTimeout(function(){ timedOut = true; resolve(null); }, NET_MS);
  });
  var live = fetch(fresh).then(function(response){
    // A page may not be answered with a redirected response: pass its body on.
    if (navigating && response.redirected){
      response = new Response(response.body, {status:response.status, statusText:response.statusText, headers:response.headers});
    }
    return keep(event, request, response);
  });
  // Offline, the network fails at once: the cached copy, like a slow network.
  var quick = live.catch(function(){ return null; });
  return Promise.race([quick, clock]).then(function(response){
    if (response) return response;
    return fromCache(request, {ignoreSearch:navigating}).then(function(cached){
      if (cached){
        // Network still running: refresh the cache for the next open.
        if (timedOut) event.waitUntil(quick);
        return cached;
      }
      return live.catch(function(){ return navigating ? fromCache('index.html') : undefined; });
    }).then(function(response){
      return response || Response.error();
    });
  });
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
    event.respondWith(networkFirst(event));
  } else if (url.protocol==='https:' && url.hostname===TILE_HOST){
    event.respondWith(tile(event));
  }
});
