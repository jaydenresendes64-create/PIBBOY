// storage.js: two copies (IndexedDB + localStorage), the newest readable
// one wins, unreadable saved data stops the app instead of being replaced,
// and one window never overwrites a newer save from another.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, sharedStorage, settle, FILES } = require('./helpers');

const LS_KEY = 'status_terminal_state_v1';
const LS_AT = 'status_terminal_saved_at_v1';
const idbRecord = shared => shared.idb.record('status_terminal', 'docs', 'state/player');
const openWindow = (shared, options) => loadApp(Object.assign({ files: FILES.storage, shared }, options));

// A window that loaded and is running, like main.js leaves it.
async function running(shared, options) {
  const w = openWindow(shared, options);
  const events = { failed: 0, adopted: [] };
  w.ST.storage.onSaveFailed(() => { events.failed++; });
  w.ST.storage.onExternalChange((state, lost) => { w.ST.app.state = state; events.adopted.push({ lost, state: w.plain(state) }); });
  const saved = await w.ST.storage.load();
  w.ST.app.state = saved || w.ST.defaultState();
  w.events = events;
  return w;
}
function withItem(state, name) {
  state.inventory.push({ id: 'x' + name.replace(/\W/g, ''), name, category: 'MISC' });
  return state;
}

test('first run: nothing saved anywhere -> null', async () => {
  const w = openWindow(sharedStorage());
  assert.equal(await w.ST.storage.load(), null);
});

test('a save writes the same copy to both stores; load reads it back', async () => {
  const shared = sharedStorage();
  const w = await running(shared);
  withItem(w.ST.app.state, 'Lamp');
  assert.equal(await w.ST.storage.saveNow(), 'saved');
  const rec = idbRecord(shared);
  assert.equal(String(rec.savedAt), shared.items.get(LS_AT));
  assert.deepEqual(rec.data, JSON.parse(shared.items.get(LS_KEY)));
  const again = openWindow(shared);
  assert.deepEqual(again.plain(await again.ST.storage.load()), w.plain(w.ST.app.state));
});

test('the newer copy wins, whichever store holds it', async () => {
  const shared = sharedStorage();
  const w = await running(shared);
  const older = withItem(w.plain(w.ST.app.state), 'Old');
  const newer = withItem(w.plain(w.ST.app.state), 'New');
  shared.idb.put('status_terminal', 'docs', { id: 'state/player', savedAt: 200, data: newer });
  shared.items.set(LS_KEY, JSON.stringify(older)); shared.items.set(LS_AT, '100');
  let s = await openWindow(shared).ST.storage.load();
  assert.equal(s.inventory.slice(-1)[0].name, 'New');
  shared.items.set(LS_AT, '300');
  s = await openWindow(shared).ST.storage.load();
  assert.equal(s.inventory.slice(-1)[0].name, 'Old');
});

test('a half-written localStorage copy falls back to IndexedDB', async () => {
  const shared = sharedStorage();
  const w = await running(shared);
  withItem(w.ST.app.state, 'Safe');
  await w.ST.storage.saveNow();
  shared.items.set(LS_KEY, '{"level":3,"stats":{');
  shared.items.set(LS_AT, String(Date.now() + 1e9));
  const s = await openWindow(shared).ST.storage.load();
  assert.equal(s.inventory.slice(-1)[0].name, 'Safe');
});

test('a corrupted IndexedDB copy falls back to localStorage', async () => {
  const shared = sharedStorage();
  const w = await running(shared);
  withItem(w.ST.app.state, 'Safe');
  await w.ST.storage.saveNow();
  shared.idb.put('status_terminal', 'docs', { id: 'state/player', savedAt: Date.now() + 1e9, data: 'garbage' });
  const s = await openWindow(shared).ST.storage.load();
  assert.equal(s.inventory.slice(-1)[0].name, 'Safe');
});

test('both copies unreadable: load fails, and nothing is written afterwards', async () => {
  const shared = sharedStorage();
  shared.idb.put('status_terminal', 'docs', { id: 'state/player', savedAt: 5, data: { not: 'a state' } });
  shared.items.set(LS_KEY, 'not json');
  const w = openWindow(shared);
  await assert.rejects(w.ST.storage.load());
  w.ST.app.state = w.ST.defaultState();           // even if something tried to save
  assert.equal(await w.ST.storage.saveNow(), 'failed');
  w.ST.storage.scheduleSave(); w.ST.storage.flush();
  await settle();
  assert.equal(shared.items.get(LS_KEY), 'not json');
  assert.deepEqual(idbRecord(shared).data, { not: 'a state' });
});

test('IndexedDB errors on open: localStorage copy used; none -> load fails (not a fresh start)', async () => {
  const shared = sharedStorage();
  const w = await running(shared);
  withItem(w.ST.app.state, 'Kept');
  await w.ST.storage.saveNow();
  shared.idb.failOpen = true;
  const s = await openWindow(shared).ST.storage.load();
  assert.equal(s.inventory.slice(-1)[0].name, 'Kept');
  shared.items.clear();                            // only IndexedDB had it (older app versions)
  await assert.rejects(openWindow(shared).ST.storage.load());
});

test('IndexedDB never answers (iOS bug): after a retry, localStorage copy or a clear failure', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const shared = sharedStorage();
  shared.idb.put('status_terminal', 'docs', { id: 'state/player', savedAt: 10, data: withItem(openWindow(sharedStorage()).ST.defaultState(), 'Real') });
  shared.idb.hang = true;
  const w = openWindow(shared);
  let settled = null;
  w.ST.storage.load().then(() => { settled = 'loaded'; }, () => { settled = 'failed'; });
  for (let i = 0; i < 3; i++) { await settle(); t.mock.timers.tick(4000); }
  await settle();
  assert.equal(settled, 'failed');                 // never a fresh start over the real data
  shared.items.set(LS_KEY, JSON.stringify(withItem(w.ST.defaultState(), 'Mirror'))); shared.items.set(LS_AT, '10');
  const w2 = openWindow(shared);
  let loaded = null;
  w2.ST.storage.load().then(s => { loaded = s; });
  for (let i = 0; i < 3; i++) { await settle(); t.mock.timers.tick(4000); }
  await settle();
  assert.equal(loaded.inventory.slice(-1)[0].name, 'Mirror');
});

test('the original single-file save (localStorage only, no stamp) is loaded and migrated', async () => {
  const shared = sharedStorage();
  shared.items.set(LS_KEY, JSON.stringify({
    level: 4, xp: 10, xpToNext: 1800, stats: { STR: 5, END: 3, CHA: 4, INT: 5, AGI: 2 },
    skills: { SCIENCE: 30, SPEECH: 1, SURVIVAL: 1, COOKING: 1, FINANCE: 1, MUSIC: 1, BUSINESS: 1 },
    quests: { main: { title: 'Old main', progress: 20, xp: 1000, completed: false, skillGains: [], bonus: [] }, side: [], daily: [] },
    inventory: [], finances: { holdings: [] }, log: []
  }));
  const s = await openWindow(shared).ST.storage.load();
  assert.equal(s.level, 4);
  assert.equal(s.quests.mains[0].title, 'Old main');
  assert.equal(s.skills.CONCENTRATION, 30);
});

test('storage unavailable everywhere: runs from defaults, a save reports failure', async () => {
  const shared = sharedStorage();
  const w = openWindow(shared, { indexedDB: null });
  w.localStorage.broken = true;
  assert.equal(await w.ST.storage.load(), null);
  let failed = 0;
  w.ST.storage.onSaveFailed(() => failed++);
  w.ST.app.state = w.ST.defaultState();
  assert.equal(await w.ST.storage.saveNow(), 'failed');
  assert.equal(failed, 1);
});

test('one store failing is not a failed save', async () => {
  const shared = sharedStorage();
  const w = await running(shared);
  w.localStorage.full = true;
  assert.equal(await w.ST.storage.saveNow(), 'saved');
  w.localStorage.full = false;
  shared.idb.failPut = true;
  assert.equal(await w.ST.storage.saveNow(), 'saved');
  w.localStorage.full = true;
  assert.equal(await w.ST.storage.saveNow(), 'failed');
  assert.equal(w.events.failed, 1);
});

test('stamps always increase, even when the clock is moved back', async () => {
  const shared = sharedStorage();
  const w = await running(shared, { now: '2026-09-24T12:00:00Z' });
  await w.ST.storage.saveNow();
  const first = idbRecord(shared).savedAt;
  w.setNow('2026-09-20T12:00:00Z');                // clock moved back 4 days
  withItem(w.ST.app.state, 'After');
  await w.ST.storage.saveNow();
  assert.ok(idbRecord(shared).savedAt > first);
  const s = await openWindow(shared).ST.storage.load();
  assert.equal(s.inventory.slice(-1)[0].name, 'After');
});

test('closing right after a change: flush writes localStorage at once', async () => {
  const shared = sharedStorage();
  const w = await running(shared);
  withItem(w.ST.app.state, 'Last second');
  w.ST.storage.scheduleSave();                     // would wait 500 ms
  w.ST.storage.flush();                            // the page is going away
  assert.match(shared.items.get(LS_KEY), /Last second/);
});

test('two windows: each follows the other\'s saves as they happen', async () => {
  const shared = sharedStorage();
  const a = await running(shared), b = await running(shared);
  withItem(a.ST.app.state, 'From A');
  await a.ST.storage.saveNow();
  assert.equal(b.events.adopted.length, 1);
  assert.equal(b.events.adopted[0].lost, false);
  assert.equal(b.ST.app.state.inventory.slice(-1)[0].name, 'From A');
  withItem(b.ST.app.state, 'From B');
  assert.equal(await b.ST.storage.saveNow(), 'saved');   // B now builds on A's save
  const s = await openWindow(shared).ST.storage.load();
  assert.deepEqual(s.inventory.map(i => i.name).slice(-2), ['From A', 'From B']);
});

test('two windows racing: an unsaved change gives way to the newer save, and says so', async () => {
  const shared = sharedStorage();
  const a = await running(shared), b = await running(shared);
  withItem(b.ST.app.state, 'B pending');
  b.ST.storage.scheduleSave();                     // B's change waits for its delay
  withItem(a.ST.app.state, 'A saved');
  await a.ST.storage.saveNow();
  assert.equal(b.events.adopted.length, 1);
  assert.equal(b.events.adopted[0].lost, true);
  b.ST.storage.flush();                            // nothing pending any more
  await settle();
  const s = await openWindow(shared).ST.storage.load();
  assert.ok(s.inventory.some(i => i.name === 'A saved'));
  assert.ok(!s.inventory.some(i => i.name === 'B pending'));
});

test('a window that missed the other\'s save is refused at write time (localStorage check)', async () => {
  const shared = sharedStorage();
  const a = await running(shared), b = await running(shared);
  shared.silent = true;
  withItem(a.ST.app.state, 'A saved');
  await a.ST.storage.saveNow();
  withItem(b.ST.app.state, 'B stale');
  assert.equal(await b.ST.storage.saveNow(), 'conflict');
  assert.equal(b.events.adopted[0].lost, true);
  assert.equal(b.ST.app.state.inventory.slice(-1)[0].name, 'A saved');
  const s = await openWindow(shared).ST.storage.load();
  assert.equal(s.inventory.slice(-1)[0].name, 'A saved');
});

test('the IndexedDB check refuses a stale write when localStorage can\'t tell', async () => {
  const shared = sharedStorage();
  const a = await running(shared), b = await running(shared);
  shared.silent = true;
  b.localStorage.broken = true;                    // B can neither read nor write localStorage
  withItem(a.ST.app.state, 'A saved');
  await a.ST.storage.saveNow();
  withItem(b.ST.app.state, 'B stale');
  assert.equal(await b.ST.storage.saveNow(), 'conflict');
  assert.equal(idbRecord(shared).data.inventory.slice(-1)[0].name, 'A saved');
});

test('after an IndexedDB refusal, the localStorage copy is put back to the newer save', async () => {
  const shared = sharedStorage();
  const a = await running(shared), b = await running(shared);
  shared.silent = true;
  a.localStorage.full = true;                      // A's save only reaches IndexedDB
  withItem(a.ST.app.state, 'A saved');
  await a.ST.storage.saveNow();
  withItem(b.ST.app.state, 'B stale');
  assert.equal(await b.ST.storage.saveNow(), 'conflict');   // B wrote localStorage, then IndexedDB refused
  assert.match(shared.items.get(LS_KEY), /A saved/);
  assert.doesNotMatch(shared.items.get(LS_KEY), /B stale/);
  const s = await openWindow(shared).ST.storage.load();
  assert.equal(s.inventory.slice(-1)[0].name, 'A saved');
});

test('requestPersistence asks once, quietly, only where supported', async () => {
  const w = openWindow(sharedStorage());
  w.ST.storage.requestPersistence();               // no navigator.storage: nothing happens
  let asked = 0;
  w.context.navigator.storage = { persisted: () => Promise.resolve(false), persist: () => { asked++; return Promise.resolve(true); } };
  w.ST.storage.requestPersistence();
  await settle();
  assert.equal(asked, 1);
  w.context.navigator.storage.persisted = () => Promise.resolve(true);
  w.ST.storage.requestPersistence();
  await settle();
  assert.equal(asked, 1);
  w.context.navigator.storage.persist = () => Promise.reject(new Error('denied'));
  w.context.navigator.storage.persisted = () => Promise.resolve(false);
  w.ST.storage.requestPersistence();               // a refusal is ignored
  await settle();
});
