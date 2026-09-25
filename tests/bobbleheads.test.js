// Bobbleheads (js/state.js): found once each, as soon as a real milestone
// is reached, with their XP; kept in saves and backups.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers');

const app = loadApp();
const ST = app.ST;
const fresh = () => { ST.app.state = ST.defaultState(); return ST.app.state; };
const ids = found => (found ? Array.from(found.found, b => b.id) : []);
const city = (i, cc) => ({ id: 'c' + i, name: 'City ' + i, cc: cc || 'CA', lat: 45, lon: -73 + i / 10, radius: 3000, date: null, note: '' });

test('a new player has found none; each milestone finds its own, once, with its XP', () => {
  const s = fresh();
  assert.equal(ST.findBobbleheads(), null);
  s.level = 5;
  const first = ST.findBobbleheads();
  assert.deepEqual(ids(first), ['vault']);
  assert.equal(first.xp, ST.BOBBLEHEAD_XP);
  assert.equal(s.bobbleheads.vault, ST.todayStr());
  assert.equal(ST.findBobbleheads(), null);                  // never twice
  s.level = 2;                                                // even if it no longer holds
  assert.equal(ST.findBobbleheads(), null);
  assert.equal(s.bobbleheads.vault, ST.todayStr());
});

test('several at once (a save that already earned them): one result, their XP together', () => {
  const s = fresh();
  s.level = 12;
  s.lastBackup = ST.todayStr();
  s.skills.MUSIC = 50;
  s.perks = { wanderer: 1, barter: 1, habit: 2 };
  const found = ST.findBobbleheads();
  assert.deepEqual(ids(found), ['vault', 'veteran', 'specialist', 'perks', 'radfree']);
  assert.equal(found.xp, 5 * ST.BOBBLEHEAD_XP);
});

test('the quest, item, map and journal milestones', () => {
  const s = fresh();
  s.quests.mains.push({ id: 'm2', questName: 'A Higher Calling', title: 'Pray', progressType: 'streak', streakTarget: 7, streakDays: 7,
    lastCheckIn: null, progress: 100, xp: 700, completed: true, skillGains: [], bonus: [] });
  s.quests.mains[0].completed = true;                         // the caps goal
  s.inventory.push({ id: 'xs', name: 'Mic', category: 'SELL', price: 100 });
  ST.sellItem('xs', 100);
  for (let i = 0; i < 10; i++) s.quests.side.push({ id: 'xd' + i, questName: '', name: 'q', xp: 5, done: true, skillGains: [] });
  s.lifetimeDailies = 30;
  s.map.cities = Array.from({ length: 10 }, (_, i) => city(i));
  s.map.pins = ['FR', 'MA', 'US', 'MX'].map((cc, i) => Object.assign(city(20 + i, cc), { radius: 500 }));
  s.map.routes = [{ id: 'r1', name: 'Trip', stops: [], path: '', km: 649, date: null, note: '' },
    { id: 'r2', name: 'Trip 2', stops: [], path: '', km: 351, date: null, note: '' }];
  s.lifetimeLogEntries = 25;
  assert.deepEqual(ids(ST.findBobbleheads()).sort(),
    ['capitalist', 'devotion', 'errands', 'explorer', 'globetrotter', 'merchant', 'roadwarrior', 'routine', 'scribe'].sort());
});

test('daily quests are counted for their bobblehead', () => {
  const s = fresh();
  ST.completeDaily(s.quests.daily[0]);
  ST.completeDaily(s.quests.daily[1]);
  ST.completeDaily(s.quests.daily[1]);                        // not twice the same day
  assert.equal(s.lifetimeDailies, 2);
});

test('sanitize: only known bobbleheads, each with a real date; older saves start with none', () => {
  const s = app.plain(ST.defaultState());
  s.bobbleheads = { vault: '2026-09-25', veteran: 'yesterday', nope: '2026-9-1', '__proto__': '2026-9-1' };
  s.lifetimeDailies = '12.2';
  const out = app.plain(ST.sanitizeImported(JSON.parse(JSON.stringify(s))));
  assert.deepEqual(out.bobbleheads, { vault: '2026-9-25' });
  assert.equal(out.lifetimeDailies, 12);
  delete s.bobbleheads; delete s.lifetimeDailies;
  const old = app.plain(ST.sanitizeImported(JSON.parse(JSON.stringify(s))));
  assert.deepEqual([old.bobbleheads, old.lifetimeDailies], [{}, 0]);
});
