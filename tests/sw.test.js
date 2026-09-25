// sw.js, the service worker: the app's files come from the network, or from
// the kept copy when the network is down or too slow; a big file that can't
// be downloaded doesn't stop the install. Runs sw.js with a fake network and
// a fake cache storage (its timers 100 times faster).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT } = require('./helpers');

const BASE = 'https://example.test/PIBBOY/';
const SPEED = 100;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

class FakeRequest {
  constructor(input, init = {}) {
    const from = input instanceof FakeRequest ? input : null;
    this.url = from ? from.url : new URL(input, BASE).href;
    this.mode = init.mode || (from ? from.mode : 'cors');
    this.method = 'GET';
  }
}
function keyOf(req, ignoreSearch) {
  const url = new URL(typeof req === 'string' ? req : req.url, BASE);
  if (ignoreSearch) url.search = '';
  return url.href;
}
class FakeCache {
  constructor(fetch) { this.map = new Map(); this.fetch = fetch; }
  match(req, opts = {}) {
    const want = keyOf(req, opts.ignoreSearch);
    for (const [k, res] of this.map) if (keyOf(k, opts.ignoreSearch) === want) return Promise.resolve(res.clone());
    return Promise.resolve(undefined);
  }
  put(req, res) { const k = keyOf(req); this.map.delete(k); this.map.set(k, res); return Promise.resolve(); }
  add(req) {
    return this.fetch(req).then(res => { if (!res.ok) throw new TypeError('bad answer'); return this.put(req, res); });
  }
  addAll(reqs) {
    return Promise.all(reqs.map(r => this.fetch(r))).then(all => {
      if (all.some(res => !res.ok)) throw new TypeError('bad answer');
      all.forEach((res, i) => this.put(reqs[i], res));
    });
  }
  keys() { return Promise.resolve([...this.map.keys()].map(u => new FakeRequest(u))); }
  delete(req) { return Promise.resolve(this.map.delete(keyOf(req))); }
  text(file) { const res = this.map.get(keyOf(file)); return res ? res.clone().text() : Promise.resolve(null); }
}

// net: {down, delay (real ms), broken: [files that fail]}.
function loadSw(net) {
  const fetch = req => {
    const url = typeof req === 'string' ? req : req.url;
    if (net.down || (net.broken || []).some(f => url.endsWith(f))) return Promise.reject(new TypeError('Failed to fetch'));
    const answer = () => new Response('net ' + url.slice(BASE.length), { status: 200 });
    return net.delay ? wait(net.delay).then(answer) : Promise.resolve(answer());
  };
  const stores = new Map();
  const caches = {
    open: name => { if (!stores.has(name)) stores.set(name, new FakeCache(fetch)); return Promise.resolve(stores.get(name)); },
    keys: () => Promise.resolve([...stores.keys()]),
    delete: name => Promise.resolve(stores.delete(name))
  };
  const handlers = {};
  const context = vm.createContext({
    self: { location: new URL('sw.js', BASE), addEventListener: (type, fn) => { handlers[type] = fn; },
      skipWaiting: () => Promise.resolve(), clients: { claim: () => Promise.resolve() } },
    caches, fetch, Request: FakeRequest, Response, Headers, URL,
    setTimeout: (fn, ms) => setTimeout(fn, ms / SPEED)
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), context);
  const cache = () => caches.open(context.CACHE);
  // A page's request: its answer, and everything sw.js does afterwards.
  function get(file, mode) {
    let answer;
    const pending = [];
    handlers.fetch({ request: new FakeRequest(file, { mode }), respondWith: p => { answer = p; }, waitUntil: p => pending.push(p) });
    return { answer: Promise.resolve(answer), done: () => Promise.all(pending) };
  }
  function install() {
    let done;
    handlers.install({ waitUntil: p => { done = p; } });
    return done;
  }
  return { cache, get, install, net };
}
async function keep(sw, file, text) { (await sw.cache()).put(file, new Response(text)); }

test('online: the network copy, kept for next time', async () => {
  const sw = loadSw({});
  const req = sw.get('js/state.js');
  assert.equal(await (await req.answer).text(), 'net js/state.js');
  await req.done();
  assert.equal(await (await sw.cache()).text('js/state.js'), 'net js/state.js');
});

test('offline: the kept copy; a page opened offline falls back to index.html', async () => {
  const sw = loadSw({ down: true });
  await keep(sw, 'js/state.js', 'kept state');
  await keep(sw, 'index.html', 'kept index');
  assert.equal(await (await sw.get('js/state.js').answer).text(), 'kept state');
  assert.equal(await (await sw.get('./?from=home', 'navigate').answer).text(), 'kept index');
  assert.equal((await sw.get('js/never-kept.js').answer).type, 'error');
});

test('slow network: the kept copy after NET_MS, and the fresh one is kept for the next open', async () => {
  const sw = loadSw({ delay: 100 });                    // 10 s at the real speed
  await keep(sw, 'js/render.js', 'kept render');
  const req = sw.get('js/render.js');
  const started = Date.now();
  assert.equal(await (await req.answer).text(), 'kept render');
  assert.ok(Date.now() - started < 90, 'answered before the network');
  await wait(120);
  await req.done();
  assert.equal(await (await sw.cache()).text('js/render.js'), 'net js/render.js');
});

test('slow network and nothing kept yet: it waits for the network', async () => {
  const sw = loadSw({ delay: 60 });
  assert.equal(await (await sw.get('js/map.js').answer).text(), 'net js/map.js');
});

test('install: a big file that fails is skipped; an app file that fails stops the install', async () => {
  const ok = loadSw({ broken: ['vendor/three/three.pibboy.min.js'] });
  await ok.install();
  assert.equal(await (await ok.cache()).text('index.html'), 'net index.html');
  assert.equal(await (await ok.cache()).text('vendor/three/three.pibboy.min.js'), null);

  const bad = loadSw({ broken: ['js/state.js'] });
  await assert.rejects(bad.install());
});
