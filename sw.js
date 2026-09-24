/**
 * Service worker — lets the app open without a connection, which (with
 * manifest.webmanifest) also makes it installable on a phone.
 *
 * The app's own files: network first. While online every request goes to
 * GitHub Pages, checked against the server rather than the browser's own
 * 10-minute cache ('no-cache'), so a new version shows up on the next
 * open, with all its files from the same version. Each response is copied
 * into the cache on the way through, and the cached copy is only used when
 * the network fails. So this file doesn't need to change when the app does;
 * bump CACHE only to throw the old copies away.
 *
 * The fonts are the app's own files too (fonts/), so they're there offline
 * from the first visit.
 *
 * The optional AI function (api/) is never cached.
 *
 * The MAP tab's pictures (tiles, from CARTO) are kept in their own cache as
 * they're seen, at most TILE_MAX of them (the oldest go first), so the
 * places already looked at still show offline. Only tiles actually shown are
 * kept, never fetched ahead. The map's data (data/) is cached like the app's
 * files, the first time it's used.
 */
'use strict';

var CACHE_PREFIX = 'status-terminal-';
var CACHE = CACHE_PREFIX + 'v5';
var TILE_CACHE = CACHE_PREFIX + 'tiles';       // kept across versions
var TILE_HOST = /(^|\.)basemaps\.cartocdn\.com$/;
var TILE_MAX = 400;

// Cached at install, so the app opens offline after the first visit.
var APP_SHELL = [
  './',
  'index.html',
  'css/terminal.css',
  'js/state.js', 'js/storage.js', 'js/ai.js', 'js/places.js', 'js/render.js', 'js/mascot.js', 'js/crt.js', 'js/tilt.js', 'js/map.js', 'js/events.js', 'js/main.js',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'images/mascot.png',
  'fonts/vt323.woff2', 'fonts/ibm-plex-mono.woff2',
  'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'
];
var API_URL = new URL('api/', self.location).href;

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE).then(function(cache){
      // 'reload' skips the browser's HTTP cache, so the copies are current.
      return cache.addAll(APP_SHELL.map(function(url){ return new Request(url, {cache:'reload'}); }));
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
  return fetch(fresh).then(function(response){
    // A page may not be answered with a redirected response: pass its body on.
    if (navigating && response.redirected){
      response = new Response(response.body, {status:response.status, statusText:response.statusText, headers:response.headers});
    }
    return keep(event, request, response);
  }).catch(function(){
    return fromCache(request, {ignoreSearch:navigating}).then(function(cached){
      return cached || (navigating ? fromCache('index.html') : undefined);
    }).then(function(response){
      return response || Response.error();
    });
  });
}

// A map tile: the kept copy, else the network (then kept). Only a readable
// (CORS) answer is kept: an opaque one would take far more room. Offline,
// a tile never seen is an empty picture: the map's own dark grid shows
// through, and the page gets no network error for it.
var NO_TILE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';
function emptyTile(){
  var bytes = Uint8Array.from(atob(NO_TILE), function(c){ return c.charCodeAt(0); });
  return new Response(bytes, {status:200, headers:{'Content-Type':'image/png'}});
}
function tile(event){
  var request = event.request;
  return caches.open(TILE_CACHE).then(function(cache){
    return cache.match(request).then(function(cached){
      if (cached) return cached;
      return fetch(request).then(function(response){
        if (response.status===200 && response.type==='cors'){
          var copy = response.clone();
          event.waitUntil(cache.put(request, copy).then(function(){ return trim(cache); }));
        }
        return response;
      });
    });
  }).catch(emptyTile);
}
function trim(cache){
  return cache.keys().then(function(keys){
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
  } else if (url.protocol==='https:' && TILE_HOST.test(url.hostname)){
    event.respondWith(tile(event));
  }
});
