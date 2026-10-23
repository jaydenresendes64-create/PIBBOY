// sw.js, the service worker: the app opens from its cache at once (cache
// first), one whole version at a time, named by a hash of its files; a new
// version waits for the page's SKIP_WAITING; the region shapes are kept
// across versions. Runs sw.js with a fake network and a fake cache storage
// (its timers 100 times faster).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT } = require('./helpers');
const { shellVersion, stampedVersion } = require('../tools/stamp-sw');

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

// net: {down, delay (real ms), broken: [files that fail], active: a version already runs}.
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
  const calls = { skipWaiting: 0, fetched: [] };
  const counted = req => { calls.fetched.push(typeof req === 'string' ? req : req.url); return fetch(req); };
  const context = vm.createContext({
    self: { location: new URL('sw.js', BASE), addEventListener: (type, fn) => { handlers[type] = fn; },
      registration: { active: net.active ? {} : null },
      skipWaiting: () => { calls.skipWaiting++; return Promise.resolve(); }, clients: { claim: () => Promise.resolve() } },
    caches, fetch: counted, Request: FakeRequest, Response, Headers, URL,
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
  function activate() {
    let done;
    handlers.activate({ waitUntil: p => { done = p; } });
    return done;
  }
  const message = (data, ports) => handlers.message({ data, ports });
  return { cache, get, install, activate, message, net, calls, caches, context };
}
async function keep(sw, file, text) { (await sw.cache()).put(file, new Response(text)); }

test('the version is a hash of the app\'s files: sw.js changes exactly when one of them does', () => {
  assert.equal(stampedVersion(), shellVersion(), 'run: node tools/stamp-sw.js');
  const sw = loadSw({});
  assert.equal(sw.context.CACHE, 'status-terminal-' + shellVersion());
});

test('install: every app file cached past the browser cache; a big one that fails is skipped; an app file that fails stops it', async () => {
  const ok = loadSw({ broken: ['vendor/three/three.pibboy.min.js'] });
  await ok.install();
  const cache = await ok.cache();
  assert.equal(await cache.text('index.html'), 'net index.html');
  assert.equal(await cache.text('js/state.js'), 'net js/state.js');
  assert.equal(await cache.text('vendor/three/three.pibboy.min.js'), null);
  const bad = loadSw({ broken: ['js/state.js'] });
  await assert.rejects(bad.install());                                  // the version before stays, whole
});

test('cache first: a kept app file is served at once, without the network (offline, slow or online)', async () => {
  for (const net of [{ down: true }, { delay: 100 }, {}]) {
    const sw = loadSw(net);
    await keep(sw, 'js/render.js', 'kept render');
    const started = Date.now();
    assert.equal(await (await sw.get('js/render.js?v=2').answer).text(), 'kept render');
    assert.ok(Date.now() - started < 50);
    assert.deepEqual(sw.calls.fetched, [], 'no network asked');
  }
});

test('any page of the app opens the kept index.html, whatever its address', async () => {
  const sw = loadSw({ down: true });
  await keep(sw, 'index.html', 'kept index');
  assert.equal(await (await sw.get('./?from=home', 'navigate').answer).text(), 'kept index');
  assert.equal(await (await sw.get('index.html', 'navigate').answer).text(), 'kept index');
});

test('an app file the install skipped: the network, then kept; offline, an error (never another version\'s copy)', async () => {
  const sw = loadSw({});
  const req = sw.get('vendor/three/three.pibboy.min.js');
  assert.equal(await (await req.answer).text(), 'net vendor/three/three.pibboy.min.js');
  await req.done();
  assert.equal(await (await sw.cache()).text('vendor/three/three.pibboy.min.js'), 'net vendor/three/three.pibboy.min.js');
  const off = loadSw({ down: true });
  assert.equal((await off.get('js/state.js').answer).type, 'error');
});

test('region shapes: the network the first time, then the kept copy at once, refreshed in the background, kept across versions', async () => {
  const sw = loadSw({});
  const first = sw.get('data/regions/MA.json');
  assert.equal(await (await first.answer).text(), 'net data/regions/MA.json');
  await first.done();
  const data = await sw.caches.open('status-terminal-data');
  await data.put('data/regions/MA.json', new Response('kept MA'));
  sw.net.delay = 100;
  const again = sw.get('data/regions/MA.json');
  const started = Date.now();
  assert.equal(await (await again.answer).text(), 'kept MA');
  assert.ok(Date.now() - started < 50);
  await again.done();
  assert.equal(await data.text('data/regions/MA.json'), 'net data/regions/MA.json');
  assert.equal(await (await sw.cache()).text('data/regions/MA.json'), null, 'not in a version\'s cache');
});

test('activate: older versions go; the region shapes and map tiles stay', async () => {
  const sw = loadSw({});
  for (const name of ['status-terminal-v37', 'status-terminal-0123456789ab', 'status-terminal-data', 'status-terminal-vector-tiles', 'other-app']) await sw.caches.open(name);
  await sw.cache();
  await sw.activate();
  assert.deepEqual((await sw.caches.keys()).sort(), ['other-app', sw.context.CACHE, 'status-terminal-data', 'status-terminal-vector-tiles'].sort());
});

test('the first version takes over at once; a later one waits for the page\'s SKIP_WAITING', async () => {
  const first = loadSw({});
  await first.install();
  assert.equal(first.calls.skipWaiting, 1);
  const later = loadSw({ active: true });
  await later.install();
  assert.equal(later.calls.skipWaiting, 0);
  later.message({ type: 'other' });
  assert.equal(later.calls.skipWaiting, 0);
  later.message({ type: 'SKIP_WAITING' });
  assert.equal(later.calls.skipWaiting, 1);
});

test('asked which version it is (Settings → About), it answers on the port it was given', () => {
  const sw = loadSw({ active: true });
  const answers = [];
  sw.message({ type: 'VERSION' }, [{ postMessage: m => answers.push(m) }]);
  assert.deepEqual(JSON.parse(JSON.stringify(answers)), [{ version: sw.context.VERSION }]);
  assert.match(sw.context.VERSION, /^[0-9a-f]{12}$/);
  sw.message({ type: 'VERSION' });                                      // no port: nothing to answer on
  assert.equal(sw.calls.skipWaiting, 0, 'asking never puts a version in');
});

test('the AI function and other sites\' files are left to the browser (never cached here)', async () => {
  const sw = loadSw({});
  assert.equal(await sw.get('api/analyze').answer, undefined);          // no respondWith: straight to the network
  assert.equal(await sw.get('https://api.open-meteo.com/v1/forecast').answer, undefined);
  assert.deepEqual(sw.calls.fetched, []);
});
