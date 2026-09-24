/**
 * Test helpers: load the app's plain scripts into a Node vm context with a
 * minimal fake browser, so they run exactly as written (no build step, no
 * dependencies).
 *
 *   const app = loadApp();                         // state.js + ai.js
 *   const app = loadApp({files: FILES.storage});   // + storage.js
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
  storage: ['js/state.js', 'js/storage.js'],
  render: ['js/state.js', 'js/storage.js', 'js/ai.js', 'js/render.js']
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
    console, setImmediate, queueMicrotask,
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

module.exports = { loadApp, sharedStorage, fakeIndexedDB, settle, FILES, ROOT };
