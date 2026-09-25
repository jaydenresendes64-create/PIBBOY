// migrate(): every earlier save/backup format comes up to the current shape
// with nothing lost. Each format below is what that version of the app
// wrote (see the git history of js/state.js).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers');

const app = loadApp();
const ST = app.ST;
const load = doc => app.plain(ST.sanitizeImported(JSON.parse(JSON.stringify(doc))));

// The original single-file version (and the in-Claude version's backups):
// one main quest as `quests.main` with no id, the SCIENCE skill, no
// lifetime counters, no quest names.
const V1_SINGLE_FILE = {
  level: 3, xp: 250, xpToNext: 1400, unspentSpecialPoints: 1,
  stats: { STR: 6, END: 3, CHA: 4, INT: 5, AGI: 2 },
  skills: { SCIENCE: 33, SPEECH: 42, SURVIVAL: 23, COOKING: 8, FINANCE: 17, MUSIC: 35, BUSINESS: 5 },
  quests: {
    main: { title: 'BUILD THE LIFE I WANT', progress: 55, xp: 1000, completed: false,
      skillGains: [{ skill: 'FINANCE', amount: 8 }, { skill: 'SCIENCE', amount: 2 }],
      bonus: [{ id: 'b1', name: 'Find a job', xp: 500, done: true }, { id: 'b2', name: 'Launch a project', xp: 500, done: false }] },
    side: [{ id: 's1', name: 'Pass the PSSAC / CIZR certification', xp: 150, done: false },
      { id: 'x1abc', name: 'Done one', xp: 100, done: true }],
    daily: [{ id: 'd1', name: 'Move your body', xp: 20, lastDate: '2026-9-23' }]
  },
  inventory: [{ id: 'i1', name: 'Phone', category: 'MISC' }],
  finances: { holdings: [{ id: 'f1', label: 'USDT', amount: 855.8, rateToCAD: 1.406 }, { id: 'f2', label: 'CASH', amount: 160, rateToCAD: 1 }] },
  log: [{ date: 'Sep 1, 2026', text: 'Old entry', xp: 30, reason: 'Logged your day' }]
};

test('original single-file save: main quest, SCIENCE, counters, names', () => {
  const s = load(V1_SINGLE_FILE);
  assert.equal(s.quests.main, undefined);
  assert.equal(s.quests.mains.length, 1);
  const m = s.quests.mains[0];
  assert.equal(m.id, 'm1');
  assert.equal(m.questName, '');                      // no name, not the default quest's
  assert.equal(m.title, 'BUILD THE LIFE I WANT');
  assert.equal(m.progressType, 'percent');
  assert.equal(m.progress, 55);
  assert.equal(m.xp, 1000);
  assert.equal(m.completed, false);
  assert.deepEqual(m.bonus.map(b => [b.id, b.done]), [['b1', true], ['b2', false]]);
  assert.deepEqual(m.skillGains, [{ skill: 'FINANCE', amount: 8 }, { skill: 'CONCENTRATION', amount: 2 }]);

  assert.equal(s.skills.CONCENTRATION, 33);            // SCIENCE's value
  assert.equal(s.skills.KNOWLEDGE, 0);                 // new skill starts at 0, not the default
  assert.equal('SCIENCE' in s.skills, false);
  assert.equal(s.skills.SPEECH, 42);

  assert.deepEqual(s.stats, V1_SINGLE_FILE.stats);
  assert.equal(s.level, 3);
  assert.equal(s.xp, 250);
  assert.equal(s.xpToNext, 1400);
  assert.equal(s.unspentSpecialPoints, 1);
  assert.equal(s.lifetimeXp, 0);
  assert.equal(s.lifetimeLogEntries, 1);               // counted from the log it still has

  assert.deepEqual(s.quests.side.map(q => [q.id, q.name, q.done, q.questName]),
    [['s1', 'Pass the PSSAC / CIZR certification', false, ''], ['x1abc', 'Done one', true, '']]);
  assert.equal(s.quests.daily[0].lastDate, '2026-9-23');
  assert.deepEqual(s.inventory, V1_SINGLE_FILE.inventory);
  assert.deepEqual(s.finances, V1_SINGLE_FILE.finances);
  assert.deepEqual(s.log, V1_SINGLE_FILE.log);
});

test('first multi-file version: lifetimeXp, quests.main without a name', () => {
  const doc = JSON.parse(JSON.stringify(V1_SINGLE_FILE));
  doc.lifetimeXp = 4200;
  const s = load(doc);
  assert.equal(s.lifetimeXp, 4200);
  assert.equal(s.quests.mains[0].questName, '');
});

test('lifetimeLogEntries kept when the log was already capped', () => {
  const doc = JSON.parse(JSON.stringify(V1_SINGLE_FILE));
  doc.lifetimeLogEntries = 350;
  assert.equal(load(doc).lifetimeLogEntries, 350);
});

test('quest-names version: quests.main with a name', () => {
  const doc = JSON.parse(JSON.stringify(V1_SINGLE_FILE));
  doc.quests.main.questName = 'Caps on the Line';
  doc.quests.side[0].questName = 'Paper Trail';
  const s = load(doc);
  assert.equal(s.quests.mains[0].questName, 'Caps on the Line');
  assert.equal(s.quests.side[0].questName, 'Paper Trail');
});

test('several-main-quests version: mains without progressType', () => {
  const doc = JSON.parse(JSON.stringify(V1_SINGLE_FILE));
  const main = doc.quests.main;
  delete doc.quests.main;
  doc.quests.mains = [Object.assign({ id: 'm1', questName: 'One' }, main),
    { id: 'xk2', questName: 'Two', title: 'Second', progress: 100, xp: 300, completed: true, skillGains: [], bonus: [] }];
  const s = load(doc);
  assert.deepEqual(s.quests.mains.map(m => [m.id, m.questName, m.progressType, m.progress, m.completed]),
    [['m1', 'One', 'percent', 55, false], ['xk2', 'Two', 'percent', 100, true]]);
});

test('streak version (still SCIENCE): streak fields kept', () => {
  const doc = JSON.parse(JSON.stringify(V1_SINGLE_FILE));
  delete doc.quests.main;
  doc.quests.mains = [{ id: 'm9', questName: 'Iron Will', title: 'Train daily', progressType: 'streak', progress: 0, xp: 800,
    completed: false, skillGains: [{ skill: 'SCIENCE', amount: 1 }], bonus: [], streakTarget: 10, streakDays: 4, lastCheckIn: '2026-9-23' }];
  const m = load(doc).quests.mains[0];
  assert.equal(m.progressType, 'streak');
  assert.equal(m.streakTarget, 10);
  assert.equal(m.streakDays, 4);
  assert.equal(m.lastCheckIn, '2026-9-23');
  assert.deepEqual(m.skillGains, [{ skill: 'CONCENTRATION', amount: 1 }]);
});

test('side quests from before skill gains: the first four get theirs, others none, nothing paid', () => {
  const doc = JSON.parse(JSON.stringify(V1_SINGLE_FILE));
  doc.quests.side.push({ id: 's2', name: 'Build up savings', xp: 100, done: true },
    { id: 's3', name: 'Get back into consistent training', xp: 100, done: false },
    { id: 's4', name: 'Push the music project forward', xp: 100, done: false });
  const s = load(doc);
  const gain = skill => [{ skill, amount: 3 }];
  assert.deepEqual(s.quests.side.map(q => [q.id, q.done, q.skillGains]), [
    ['s1', false, gain('KNOWLEDGE')], ['x1abc', true, []], ['s2', true, gain('FINANCE')],
    ['s3', false, gain('SURVIVAL')], ['s4', false, gain('MUSIC')]]);
  assert.deepEqual([s.skills.KNOWLEDGE, s.skills.FINANCE, s.skills.SURVIVAL, s.skills.MUSIC], [0, 17, 23, 35]);
  assert.equal('skillGains' in s.quests.daily[0], false);          // daily quests: XP only

  // Once: a side quest that has its list keeps it as it is.
  s.quests.side[0].skillGains = [];
  assert.deepEqual(load(s).quests.side[0].skillGains, []);
});

test('current version passes through unchanged', () => {
  const current = app.plain(ST.defaultState());
  current.quests.mains[0].progress = 30;
  current.lifetimeXp = 12;
  assert.deepEqual(load(current), current);
});

test('SCIENCE next to CONCENTRATION: CONCENTRATION wins, SCIENCE goes', () => {
  const doc = JSON.parse(JSON.stringify(V1_SINGLE_FILE));
  doc.skills.CONCENTRATION = 50;
  doc.skills.KNOWLEDGE = 12;
  const s = load(doc);
  assert.equal(s.skills.CONCENTRATION, 50);
  assert.equal(s.skills.KNOWLEDGE, 12);
  assert.equal('SCIENCE' in s.skills, false);
});

test('a save missing whole parts gets the defaults for them', () => {
  const s = load({ stats: { STR: 7 }, quests: {} });
  assert.equal(s.stats.STR, 7);
  assert.equal(s.stats.END, 3);                          // default
  assert.equal(s.quests.side.length, 4);                 // default side quests
  assert.equal(s.skills.KNOWLEDGE, 10);                  // a save with no skills at all: defaults
});

test('migrate() is idempotent and ignores non-objects', () => {
  const once = ST.migrate(JSON.parse(JSON.stringify(V1_SINGLE_FILE)));
  const twice = ST.migrate(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(app.plain(twice), app.plain(once));
  assert.equal(ST.migrate(null), null);
  assert.equal(ST.migrate('text'), 'text');
});

test('WEAPONS items move to MISC, nothing disappears', () => {
  const doc = JSON.parse(JSON.stringify(V1_SINGLE_FILE));
  doc.inventory = [{ id: 'w1', name: 'Pocket knife', category: 'WEAPONS' }, { id: 'i1', name: 'Phone', category: 'MISC' },
    { id: 'w2', name: 'Bat', category: 'WEAPONS' }];
  const s = load(doc);
  assert.deepEqual(s.inventory, [{ id: 'w1', name: 'Pocket knife', category: 'MISC' }, { id: 'i1', name: 'Phone', category: 'MISC' },
    { id: 'w2', name: 'Bat', category: 'MISC' }]);
  assert.equal(ST.CATS.includes('WEAPONS'), false);
  assert.equal(ST.CATS[0], 'SELL');
});

test('saves from before the MAP tab: an empty map, everything else as it was', () => {
  const before = load(V1_SINGLE_FILE);
  assert.deepEqual(before.map, { cities: [], regions: [], pins: [], routes: [], discovered: [] });
  // The THINGS TO SELL version (the last one without a map), exactly as it saved.
  const doc = app.plain(ST.defaultState());
  delete doc.map;
  doc.inventory.push({ id: 'xsell', name: 'Old bike', category: 'SELL', price: 80 });
  const s = load(doc);
  assert.deepEqual(s.map, { cities: [], regions: [], pins: [], routes: [], discovered: [] });
  delete s.map;
  assert.deepEqual(s, doc);
});

test('a map that is not an object, or with missing lists, is made empty', () => {
  for (const map of [null, 'x', 7, [], { cities: 'x' }]) {
    const doc = app.plain(ST.defaultState());
    doc.map = map;
    assert.deepEqual(load(doc).map, { cities: [], regions: [], pins: [], routes: [], discovered: [] });
  }
});
