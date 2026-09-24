// sanitizeImported(): the gate every backup, loaded copy and other-window
// copy goes through. A good document comes back identical; a hostile one
// comes back harmless; something that isn't a state document is refused.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers');

const app = loadApp();
const ST = app.ST;
const sanitize = doc => app.plain(ST.sanitizeImported(JSON.parse(JSON.stringify(doc))));
const SAFE_ID = /^[A-Za-z0-9_-]{1,40}$/;

// A state using every field the app writes today.
function fullState() {
  const s = app.plain(ST.defaultState());
  Object.assign(s, { level: 9, xp: 1234, xpToNext: 4200, lifetimeXp: 98765, lifetimeLogEntries: 250, unspentSpecialPoints: 2 });
  s.stats = { STR: 10, END: 0, CHA: 4, INT: 5, AGI: 2 };
  s.skills.CONCENTRATION = 100; s.skills.KNOWLEDGE = 0;
  s.quests.mains.push({ id: 'xstreak1', questName: 'Iron Will', title: 'Train daily', progressType: 'streak', progress: 0, xp: 800,
    completed: false, skillGains: [{ skill: 'SURVIVAL', amount: 3 }], bonus: [], streakTarget: 30, streakDays: 12, lastCheckIn: '2026-9-23' });
  s.quests.mains.push({ id: 'xdone', questName: '', title: 'Old', progressType: 'percent', progress: 100, xp: 50, completed: true, skillGains: [], bonus: [] });
  s.quests.side[0].done = true;
  s.quests.side.push({ id: 'xlong', questName: 'Q'.repeat(60), name: 'objective '.repeat(80), xp: 500, done: false });
  s.quests.daily[1].lastDate = '2026-9-24';
  s.inventory.push({ id: 'xitem', name: 'item '.repeat(200), category: 'AID' });
  s.finances.holdings = [{ id: 'xh', label: 'A wallet label much longer than sixty characters, to be sure nothing is cut', amount: -12.345, rateToCAD: 0.0071 }];
  s.log = [];
  for (let i = 0; i < 200; i++) s.log.push({ date: 'Sep 24, 2026', text: 'entry ' + i + ' ' + 'x'.repeat(i === 0 ? 20000 : 10), xp: 33, reason: 'Physical activity + Learning / studying' });
  return s;
}

test('a full current state comes back identical (export -> import)', () => {
  const s = fullState();
  assert.deepEqual(sanitize(s), s);
});

test('sanitizing is idempotent', () => {
  const once = sanitize(fullState());
  assert.deepEqual(sanitize(once), once);
});

test('refuses what is not a state document', () => {
  for (const bad of [null, undefined, 42, 'text', [], [1, 2], {}, { stats: {} }, { quests: {} }, { stats: 'x', quests: {} }, { stats: {}, quests: 'x' }]) {
    assert.equal(ST.sanitizeImported(bad), null, JSON.stringify(bad));
  }
});

test('HTML in text fields is kept as plain text (render escapes it)', () => {
  const s = fullState();
  const html = '<img src=x onerror="alert(1)">';
  s.quests.side[1].questName = html; s.quests.side[1].name = html;
  s.inventory[0].name = html; s.finances.holdings[0].label = html; s.log[0].text = html;
  const out = sanitize(s);
  assert.equal(out.quests.side[1].questName, html);
  assert.equal(out.inventory[0].name, html);
  assert.equal(out.finances.holdings[0].label, html);
  assert.equal(out.log[0].text, html);
});

test('strings where numbers belong become numbers', () => {
  const s = fullState();
  const evil = '"><script>alert(1)</script>';
  Object.assign(s, { level: evil, xp: evil, xpToNext: evil, lifetimeXp: evil, lifetimeLogEntries: evil, unspentSpecialPoints: evil });
  s.stats.STR = evil; s.skills.MUSIC = '55';
  s.quests.mains[0].xp = evil; s.quests.mains[0].progress = evil; s.quests.mains[0].bonus[0].xp = evil;
  s.quests.mains[1].streakTarget = evil; s.quests.mains[1].streakDays = evil;
  s.quests.mains[0].skillGains[0].amount = evil;
  s.quests.side[1].xp = evil; s.quests.daily[0].xp = evil;
  s.finances.holdings[0].amount = evil; s.finances.holdings[0].rateToCAD = evil;
  s.log[5].xp = evil;
  const out = sanitize(s);
  const numbers = [out.level, out.xp, out.xpToNext, out.lifetimeXp, out.lifetimeLogEntries, out.unspentSpecialPoints,
    out.stats.STR, out.skills.MUSIC, out.quests.mains[0].xp, out.quests.mains[0].progress, out.quests.mains[0].bonus[0].xp,
    out.quests.mains[1].streakTarget, out.quests.mains[1].streakDays, out.quests.mains[0].skillGains[0].amount,
    out.quests.side[1].xp, out.quests.daily[0].xp, out.finances.holdings[0].amount, out.finances.holdings[0].rateToCAD, out.log[5].xp];
  numbers.forEach((n, i) => assert.ok(typeof n === 'number' && isFinite(n), 'field ' + i + ': ' + n));
  assert.equal(out.skills.MUSIC, 55);
  assert.equal(out.level, 1);
  assert.equal(out.xpToNext, 1000);
  assert.equal(out.lifetimeLogEntries, 200);            // at least the entries it has
  assert.equal(out.finances.holdings[0].rateToCAD, 1);
});

test('ids that could break out of an HTML attribute are replaced', () => {
  const s = fullState();
  const evil = 'a" onclick="alert(1)';
  s.quests.mains[0].id = evil; s.quests.mains[0].bonus[0].id = evil;
  s.quests.side[0].id = evil; s.quests.daily[0].id = { toString: 1 }; s.inventory[0].id = 123; s.finances.holdings[0].id = 'x'.repeat(41);
  const out = sanitize(s);
  [out.quests.mains[0].id, out.quests.mains[0].bonus[0].id, out.quests.side[0].id, out.quests.daily[0].id, out.inventory[0].id, out.finances.holdings[0].id]
    .forEach(id => assert.match(id, SAFE_ID));
  assert.equal(out.quests.side[1].id, 's2');              // good ids stay
});

test('values are brought back within their limits', () => {
  const s = fullState();
  s.stats = { STR: 99, END: -5, CHA: 4.6, INT: 5, AGI: 2 };
  s.skills.SPEECH = 250; s.skills.COOKING = -1;
  s.quests.mains[0].progress = 180;
  s.quests.mains[1].streakTarget = 99999; s.quests.mains[1].streakDays = 5e6;
  s.quests.mains[0].progressType = 'something';
  s.xp = -50; s.unspentSpecialPoints = -2;
  const out = sanitize(s);
  assert.deepEqual(out.stats, { STR: 10, END: 0, CHA: 5, INT: 5, AGI: 2 });
  assert.equal(out.skills.SPEECH, 100);
  assert.equal(out.skills.COOKING, 0);
  assert.equal(out.quests.mains[0].progress, 100);
  assert.equal(out.quests.mains[0].progressType, 'percent');
  assert.equal(out.quests.mains[1].streakTarget, ST.STREAK_MAX_DAYS);
  assert.equal(out.quests.mains[1].streakDays, ST.STREAK_MAX_DAYS);
  assert.equal(out.xp, 0);
  assert.equal(out.unspentSpecialPoints, 0);
});

test('quest names are trimmed and cut at QUEST_NAME_MAX like their box; main objectives at 60', () => {
  const s = fullState();
  s.quests.side[1].questName = '  ' + 'N'.repeat(100);
  s.quests.mains[0].title = 'T'.repeat(100);
  const out = sanitize(s);
  assert.equal(out.quests.side[1].questName, 'N'.repeat(ST.QUEST_NAME_MAX - 2));
  assert.equal(out.quests.mains[0].title.length, 60);
});

test('booleans must really be true', () => {
  const s = fullState();
  s.quests.mains[0].completed = 'yes'; s.quests.side[1].done = 1; s.quests.mains[0].bonus[1].done = 'true';
  const out = sanitize(s);
  assert.equal(out.quests.mains[0].completed, false);
  assert.equal(out.quests.side[1].done, false);
  assert.equal(out.quests.mains[0].bonus[1].done, false);
});

test('dates: zero-padded days become YYYY-M-D, anything else is dropped', () => {
  const s = fullState();
  s.quests.daily[0].lastDate = '2026-09-04';
  s.quests.daily[1].lastDate = '<b>today</b>';
  s.quests.daily[2].lastDate = 20260924;
  s.quests.mains[1].lastCheckIn = '2026-01-05T10:00:00Z';
  const out = sanitize(s);
  assert.equal(out.quests.daily[0].lastDate, '2026-9-4');
  assert.equal(out.quests.daily[1].lastDate, null);
  assert.equal(out.quests.daily[2].lastDate, null);
  assert.equal(out.quests.mains[1].lastCheckIn, null);
});

test('unknown categories, skills in gains, and junk list entries', () => {
  const s = fullState();
  s.inventory.push({ id: 'xz', name: 'Hat', category: '<script>' }, null, 'string', [1], 7);
  s.quests.mains[0].skillGains.push({ skill: 'STR', amount: 5 }, { skill: '<img>', amount: 1 }, null);
  s.quests.side.push(null, 'x');
  const out = sanitize(s);
  assert.equal(out.inventory.slice(-1)[0].category, 'MISC');
  assert.equal(out.inventory.length, s.inventory.length - 4);
  assert.deepEqual(out.quests.mains[0].skillGains.map(g => g.skill), ['FINANCE', 'BUSINESS']);   // no S.P.E.C.I.A.L., no junk
  assert.equal(out.quests.side.length, 5);
});

test('log: only the latest 200 kept, lifetime counter counts all of them', () => {
  const s = fullState();
  s.log = [];
  for (let i = 0; i < 260; i++) s.log.push({ date: 'd', text: 't' + i, xp: 1, reason: 'r' });
  s.lifetimeLogEntries = 0;
  const out = sanitize(s);
  assert.equal(out.log.length, 200);
  assert.equal(out.log[0].text, 't60');
  assert.equal(out.lifetimeLogEntries, 260);
});

test('the input document is not trusted to be a plain tree of the right types', () => {
  const s = fullState();
  s.quests.mains = 'not a list';
  s.quests.side = { 0: 'x' };
  s.inventory = null;
  s.finances = 'broke';
  s.log = 5;
  const out = sanitize(s);
  assert.ok(Array.isArray(out.quests.mains) && Array.isArray(out.quests.side));
  assert.deepEqual(out.inventory.map(i => i.name), ['Phone', 'Keys']);   // null counts as missing: the defaults
  assert.deepEqual(out.finances.holdings, []);
  assert.deepEqual(out.log, []);
});

test('a "__proto__" key can\'t change what an imported object inherits', () => {
  const raw = JSON.parse(JSON.stringify(fullState()));
  const text = JSON.stringify(raw)
    .replace('"id":"s1"', '"__proto__":{"polluted":"yes","questName":"<b>x</b>"},"id":"s1"')
    .replace('"level":9', '"__proto__":{"polluted":"yes"},"level":9');
  const hostile = JSON.parse(text);
  hostile.quests.main = JSON.parse('{"__proto__":{"polluted":"yes"},"title":"t"}');
  delete hostile.quests.mains;
  const out = ST.sanitizeImported(hostile);
  assert.equal(out.polluted, undefined);
  assert.equal(out.quests.side[0].polluted, undefined);
  assert.equal(out.quests.mains[0].polluted, undefined);
  assert.equal(({}).polluted, undefined);
});
