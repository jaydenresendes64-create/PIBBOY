/**
 * Service worker — lets the app open without a connection, which (with
 * manifest.webmanifest) also makes it installable on a phone.
 *
 * Network first: while online, every request goes to the network exactly as
 * it would without this file, so a new version pushed to GitHub Pages shows
 * up just as it would without it. Each response is copied into the cache on
 * the way through, and the cached copy is only used when the network fails.
 * So this file doesn't need to change when the app does; bump CACHE only to
 * throw the old copies away.
 */
'use strict';

var CACHE_PREFIX = 'status-terminal-';
var CACHE = CACHE_PREFIX + 'v1';

// Cached at install, so the app opens offline after the first visit.
var APP_SHELL = [
  './',
  'index.html',
  'css/terminal.css',
  'js/state.js', 'js/storage.js', 'js/ai.js', 'js/render.js', 'js/events.js', 'js/main.js',
  'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'
];
// Google Fonts, cached as the page uses them so the terminal fonts work offline too.
var FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
// The optional AI function must always reach the server.
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

self.addEventListener('fetch', function(event){
  var request = event.request;
  if (request.method!=='GET') return;
  var url = new URL(request.url);
  var handled = url.origin===self.location.origin
    ? request.url.indexOf(API_URL)!==0
    : FONT_HOSTS.indexOf(url.hostname)!==-1;
  if (!handled) return;

  event.respondWith(
    fetch(request).then(function(response){
      // Fonts' stylesheet is cross-origin without CORS, so it comes back opaque.
      if (response.status===200 || response.type==='opaque'){
        var copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(function(cache){ return cache.put(request, copy); }));
      }
      return response;
    }).catch(function(){
      var navigating = request.mode==='navigate';
      return caches.open(CACHE).then(function(cache){
        return cache.match(request, {ignoreSearch:navigating}).then(function(cached){
          return cached || (navigating ? cache.match('index.html') : undefined);
        });
      }).then(function(response){
        return response || Response.error();
      });
    })
  );
});
