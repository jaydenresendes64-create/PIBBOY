/**
 * Test helpers: load the app's plain scripts into a Node vm context with a
 * minimal fake browser, so they run exactly as written (no build step, no
 * dependencies).
 *
 *   const app = loadApp();                         // state.js + ai.js
 *   const app = loadApp({files: FILES.storage});   // + storage.js
 *   const app = loadApp({files: FILES.places});    // state.js + places.js (the MAP tab's logic)
 *   const app = loadApp({files: FILES.fog});       // + fog.js (the fog's maths; no WebGL needed)
 *   const app = loadApp({files: FILES.vitals});    // + render.js, insight.js, vitals.js and trials.js (VITALS, TRIALS, the streak card)
 *   app.ST          the window.StatusTerminal namespace
 *   app.setNow(d)   moves the clock (new Date(), Date.now()) to date `d`
 *
 * Several windows (tabs) can share storage: pass the same `shared` object
 * (from sharedStorage()) to each loadApp() call. localStorage writes then
 * fire `storage` events in the other windows, as in a browser.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = {
  logic: ['js/state.js', 'js/ai.js'],
  places: ['js/state.js', 'js/places.js'],
  fog: ['js/state.js', 'js/places.js', 'js/fog.js'],
  routes: ['js/state.js', 'js/places.js', 'js/fog.js', 'js/routes.js'],
  boot: ['js/state.js', 'js/weather.js', 'js/boot.js'],
  radar: ['js/state.js', 'js/places.js', 'js/fog.js', 'js/radar.js'],
  holotapes: ['js/state.js', 'js/holotapes.js'],
  storage: ['js/state.js', 'js/storage.js'],
  render: ['js/state.js', 'js/storage.js', 'js/ai.js', 'js/render.js'],
  vitals: ['js/state.js', 'js/storage.js', 'js/ai.js', 'js/render.js', 'js/insight.js', 'js/vitals.js', 'js/trials.js'],
  events: ['js/state.js', 'js/storage.js', 'js/ai.js', 'js/render.js', 'js/events.js']
};

// ---------- fake localStorage, shared between windows ----------
function sharedStorage() {
  // silent: true stops `storage` events, like a window that missed one.
  return { items: new Map(), windows: [], idb: fakeIndexedDB(), silent: false };
}
function localStorageFor(shared, win) {
  const fire = key => shared.windows.forEach(w => { if (w !== win && !shared.silent) w.dispatch('storage', { key }); });
  return {
    broken: false,              // true: every call throws, like disabled storage
    full: false,                // true: setItem throws, like a full quota
    getItem(key) { this.check(); return shared.items.has(key) ? shared.items.get(key) : null; },
    setItem(key, value) {
      this.check();
      if (this.full) throw new Error('QuotaExceededError');
      shared.items.set(key, String(value));
      fire(key);
    },
    removeItem(key) { this.check(); shared.items.delete(key); fire(key); },
    check() { if (this.broken) throw new Error('SecurityError'); }
  };
}

// ---------- fake IndexedDB ----------
// Just what storage.js uses. Transactions run one at a time, in the order
// they were created (like readwrite transactions on one store), and an
// aborted transaction writes nothing.
function fakeIndexedDB() {
  const databases = {};
  let queue = Promise.resolve();
  const later = fn => setImmediate(fn);
  const copy = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const idb = {
    hang: false,          // open() never answers (the iOS Safari bug)
    failOpen: false,      // open() fires onerror
    failPut: false,       // put() throws
    open(name, version) {
      const req = {};
      if (idb.hang) return req;
      later(() => {
        if (idb.failOpen) { req.error = new Error('UnknownError'); if (req.onerror) req.onerror(); return; }
        const isNew = !databases[name];
        const db = databases[name] || (databases[name] = { version, stores: {} });
        req.result = connection(db);
        if (isNew && req.onupgradeneeded) req.onupgradeneeded();
        if (req.onsuccess) req.onsuccess();
      });
      return req;
    },
    // Test access to what is stored: idb.record('status_terminal', 'docs', 'state/player')
    record(dbName, store, key) {
      const db = databases[dbName];
      return db && db.stores[store] ? copy(db.stores[store].data.get(key)) : undefined;
    },
    put(dbName, store, value) {
      const db = databases[dbName] || (databases[dbName] = { version: 1, stores: {} });
      const s = db.stores[store] || (db.stores[store] = { keyPath: 'id', data: new Map() });
      s.data.set(value[s.keyPath], copy(value));
    }
  };
  function connection(db) {
    return {
      objectStoreNames: { contains: n => n in db.stores },
      createObjectStore(n, opts) { db.stores[n] = { keyPath: opts.keyPath, data: new Map() }; },
      transaction(storeName) { return transaction(db.stores[storeName]); },
      close() {}
    };
  }
  function transaction(store) {
    const tx = { error: null };
    const ops = [], writes = [];
    let aborted = false;
    tx.abort = () => { aborted = true; };
    tx.objectStore = () => ({
      get(key) {
        const req = {};
        ops.push(() => { req.result = copy(store.data.get(key)); if (req.onsuccess) req.onsuccess(); });
        return req;
      },
      put(value) {
        if (idb.failPut) throw new Error('QuotaExceededError');
        const req = {};
        ops.push(() => { writes.push(copy(value)); if (req.onsuccess) req.onsuccess(); });
        return req;
      }
    });
    queue = queue.then(() => new Promise(done => {
      later(function step() {
        if (aborted) { if (tx.onabort) tx.onabort(); return done(); }
        const op = ops.shift();
        if (op) {
          try { op(); } catch (e) { aborted = true; tx.error = e; }
          return later(step);
        }
        writes.forEach(v => store.data.set(v[store.keyPath], v));
        if (tx.oncomplete) tx.oncomplete();
        done();
      });
    }));
    return tx;
  }
  return idb;
}

// ---------- fake DOM (only what render.js touches) ----------
function fakeElement(id) {
  return {
    id, innerHTML: '', textContent: '', value: '', hidden: false, disabled: false, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    contains() { return true; },
    appendChild(child) { return child; },
    addEventListener() {},
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    focus() {}, remove() {}
  };
}

// ---------- the window ----------
function loadApp(options) {
  options = options || {};
  const files = options.files || FILES.logic;
  const shared = options.shared || sharedStorage();
  const clock = { now: options.now ? new Date(options.now).getTime() : Date.now() };
  const listeners = {};
  const elements = {};

  const win = {
    dispatch(type, event) { (listeners[type] || []).forEach(fn => fn(event)); }
  };
  shared.windows.push(win);

  const context = {
    console, setImmediate, queueMicrotask, btoa, atob,
    // Looked up at each call, so node:test's mock timers apply here too.
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: id => clearTimeout(id),
    setInterval: (...args) => setInterval(...args),
    clearInterval: id => clearInterval(id),
    __clock: clock,
    location: { protocol: 'https:', hostname: 'jaydenresendes64-create.github.io' },
    navigator: {},
    indexedDB: options.indexedDB === null ? undefined : shared.idb,
    localStorage: localStorageFor(shared, win),
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    // The app's own files (data/...), read from the repository.
    fetch: url => new Promise(resolve => {
      fs.readFile(path.join(ROOT, String(url)), 'utf8', (err, text) => resolve({
        ok: !err, status: err ? 404 : 200,
        text: () => Promise.resolve(text),
        json: () => Promise.resolve(JSON.parse(text))
      }));
    }),
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    document: {
      getElementById: id => elements[id] || (elements[id] = fakeElement(id)),
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener() {},
      createElement: tag => fakeElement(tag),
      body: fakeElement('body'),
      activeElement: null
    }
  };
  context.window = context;
  vm.createContext(context);
  // A clock the tests can move: new Date() and Date.now() read __clock.now.
  vm.runInContext(`(function(){
    var RealDate = Date;
    class FakeDate extends RealDate {
      constructor(...args){ if (args.length===0) super(__clock.now); else super(...args); }
      static now(){ return __clock.now; }
    }
    globalThis.Date = FakeDate;
  })();`, context);
  files.forEach(file => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
  });

  return {
    ST: context.StatusTerminal,
    context,
    shared,
    elements,
    localStorage: context.localStorage,
    setNow(date) { clock.now = new Date(date).getTime(); },
    // A copy made of plain objects of this realm, for assert.deepStrictEqual.
    plain: value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value))),
    // Waits until every pending fake IndexedDB step has run.
    settle

  };
}

async function settle() {
  for (let i = 0; i < 100; i++) await new Promise(resolve => setImmediate(resolve));
}

// ---------- random numbers that come back the same ----------
// mulberry32: small and seeded, the same numbers on every machine, so a test
// that plays at random fails the same way each run (tests/fuzz, tests/actions).
function seededRandom(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- a phone used every way ----------
// Built through the app's own functions over two weeks (check-ins, urges with
// their details and notes, trials, streaks, quests, books, perks, the journal,
// the map): tests/roundtrip.test.js and tests/fuzz.test.js start from it.
function usedPhone() {
  const app = loadApp({ files: FILES.vitals });
  const ST = app.ST;
  const s = ST.app.state = ST.defaultState();
  const day = (d, h) => app.setNow('2026-10-' + String(d).padStart(2, '0') + 'T' + String(h || 9).padStart(2, '0') + ':00:00');
  day(8);
  ST.setCleanStart('2026-10-01');
  const own = ST.addStreak('Focus', '2026-10-05');
  ST.addTrial('Wall sit', 'hold', 'END');
  ST.addCope('Music');
  for (let d = 8; d <= 21; d++) {
    day(d, 8);
    ST.setVital('sleep', d % 10); ST.setVital('craving', (d * 3) % 11); ST.setPulse(55 + d % 7); ST.stepRads('N', 1);
    if (d % 3) ST.logVitals();
    ST.completeDaily(s.quests.daily[d % 3]);
    if (d % 2) {
      day(d, 21);
      ST.startUrge(ST.URGE_NEEDS[d % 5]);
      ST.setUrgeDetail('intensity', d % 11); ST.setUrgeDetail('trigger', ST.URGE_TRIGGERS[d % 8]); ST.setUrgeDetail('cope', 'walk');
      app.setNow(app.context.Date.now() + ST.URGE_MS);
      const e = d % 4 === 1 ? ST.urgeLapsed() : ST.urgeWon().entry;
      ST.noteUrge(e.t, 'note ' + d);
    }
  }
  day(15); ST.logTrial('pushups', 25); ST.logTrial('plank', 90);
  day(20); ST.logTrial('pushups', 30);
  day(16); ST.logLapse(own.id);
  day(21, 10);
  ST.startUrge('TIRED'); ST.setUrgeDetail('trigger', 'HABIT');               // one still running
  ST.completeSide(s.quests.side[0]);
  ST.readBook('Dune', 'Frank Herbert', 'KNOWLEDGE', 1);
  ST.addLogEntry({ date: 'Oct 21, 2026', text: 'A good day', xp: 25, reason: 'Learning / studying' });
  if (s.unspentPerkPoints > 0) ST.takePerk(ST.PERKS.filter(p => ST.perkOpen(p.id))[0].id);
  s.map.cities.push({ id: 'c1', name: 'Montréal', cc: 'CA', lat: 45.5, lon: -73.57, radius: 9000, date: '2026-10-1', note: '', gid: 6077243 });
  s.map.pins.push({ id: 'p1', name: 'Cabin', cc: 'CA', lat: 46.1, lon: -74.6, radius: 500, date: '2026-10-3', note: 'by the lake' });
  s.map.regions.push({ id: 'r1', name: 'Québec', cc: 'CA', code: 'CA-QC', date: '2026-10-2', note: '' });
  s.map.routes.push({ id: 'rt1', name: 'To Ottawa', stops: [{ name: 'Montréal', lat: 45.5, lon: -73.57 }, { name: 'Ottawa', lat: 45.42, lon: -75.7 }],
    path: ST.encodePath([45.5, -73.57, 45.47, -74.2, 45.44, -74.9, 45.42, -75.7]), km: 199, date: '2026-10-4', note: '' });
  ST.discoverPlace('c:6077243', 50, { name: 'Montréal' });
  return { app, ST, s };
}

module.exports = { loadApp, sharedStorage, fakeIndexedDB, settle, usedPhone, seededRandom, FILES, ROOT };
