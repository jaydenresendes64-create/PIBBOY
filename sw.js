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
 * Google Fonts: cache first, refreshed in the background. The page waits
 * for the fonts' stylesheet before it starts, so once cached it never waits
 * for the network again; the font files themselves never change.
 *
 * The optional AI function (api/) is never cached.
 */
'use strict';

var CACHE_PREFIX = 'status-terminal-';
var CACHE = CACHE_PREFIX + 'v4';

// Cached at install, so the app opens offline after the first visit.
var APP_SHELL = [
  './',
  'index.html',
  'css/terminal.css',
  'js/state.js', 'js/storage.js', 'js/ai.js', 'js/render.js', 'js/mascot.js', 'js/crt.js', 'js/events.js', 'js/main.js',
  'images/mascot.png',
  'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'
];
var FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
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
        return key.indexOf(CACHE_PREFIX)===0 && key!==CACHE;
      }).map(function(key){ return caches.delete(key); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

// Stores a copy of a good response. Fonts' files come back as CORS
// responses; an opaque one is kept too, in case the stylesheet is loaded
// without CORS.
function keep(event, request, response){
  if (response.status===200 || response.type==='opaque'){
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

// Google Fonts: the cached copy at once when there is one (refreshed in the
// background), else the network.
function cacheFirst(event){
  var request = event.request;
  var network = fetch(request).then(function(response){ return keep(event, request, response); });
  return fromCache(request).then(function(cached){
    if (cached){
      event.waitUntil(network.catch(function(){}));
      return cached;
    }
    return network;
  });
}

self.addEventListener('fetch', function(event){
  var request = event.request;
  if (request.method!=='GET') return;
  var url = new URL(request.url);
  if (url.origin===self.location.origin){
    if (request.url.indexOf(API_URL)===0) return;      // never cached
    event.respondWith(networkFirst(event));
  } else if (FONT_HOSTS.indexOf(url.hostname)!==-1){
    event.respondWith(cacheFirst(event));
  }
});
