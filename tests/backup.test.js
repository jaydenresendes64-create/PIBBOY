// A backup about to replace everything (Settings → Import): what it holds,
// next to what's on this phone, before the question; a warning when it's
// older or would lose what only this phone has (2026-10-22: "validate
// imported backups before replacing anything"). Nothing changes until
// "Yes, replace"; a file that isn't a backup changes nothing.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

function used(ST, app, day, checkins) {
  app.setNow(day + 'T09:00:00');
  for (let i = 0; i < checkins; i++) {
    app.setNow(new Date(new Date(day + 'T09:00:00').getTime() + i * 864e5));
    ST.setVital('sleep', 6); ST.logVitals();
  }
}

test('a summary of a state: level, XP, what it holds, when it was last used', () => {
  const app = loadApp({ files: FILES.vitals });
  const ST = app.ST;
  ST.app.state = ST.defaultState();
  assert.deepEqual(app.plain(ST.stateSummary(ST.app.state)), { level: ST.defaultState().level, lifetimeXp: 0, checkins: 0, urges: 0, questsDone: 0, journal: 0, places: 0, last: null });
  used(ST, app, '2026-10-20', 3);
  const s = app.plain(ST.stateSummary(ST.app.state));
  assert.deepEqual([s.checkins, s.lifetimeXp], [3, 45]);
  assert.equal(s.last, new Date('2026-10-22T09:00:00').getTime());       // the latest reward
});

test('an older backup: the loss counted (XP, check-ins), only what this phone has more of', () => {
  const app = loadApp({ files: FILES.vitals });
  const ST = app.ST;
  ST.app.state = ST.defaultState();
  used(ST, app, '2026-10-10', 2);
  const backup = JSON.parse(JSON.stringify(ST.app.state));
  used(ST, app, '2026-10-15', 4);
  const c = app.plain(ST.compareBackup(ST.app.state, ST.sanitizeImported(backup)));
  assert.equal(c.older, true);
  assert.deepEqual(c.lose, { xp: 60, checkins: 4, urges: 0, journal: 0, places: 0 });
  const back = app.plain(ST.compareBackup(ST.sanitizeImported(backup), ST.app.state));
  assert.equal(back.older, false);                                        // a newer backup over older data
  assert.deepEqual(back.lose, { xp: 0, checkins: 0, urges: 0, journal: 0, places: 0 });
  const fresh = app.plain(ST.compareBackup(ST.defaultState(), ST.app.state));
  assert.equal(fresh.older, false);                                       // a phone never used: nothing to lose
});

test('Import: the backup next to this phone, the warning, then the question; nothing replaced before "Yes"', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = loadApp({ files: FILES.events });
  const ST = app.ST;
  ST.app.state = ST.defaultState();
  used(ST, app, '2026-10-10', 1);
  const old = JSON.parse(JSON.stringify(ST.app.state));
  used(ST, app, '2026-10-15', 2);
  let change = null;
  app.context.document.body.addEventListener = (type, fn) => { if (type === 'change') change = fn; };
  ST.events.setup();
  const files = [];
  ST.storage.readJsonFile = file => Promise.resolve(files.shift());
  const pick = raw => { files.push(raw); change({ target: { id: 'import-file', files: [{}], value: 'x', classList: { contains: () => false } } }); };

  const before = JSON.stringify(ST.app.state);
  pick(old);
  await app.settle();
  const html = app.elements['reset-confirm-area'].innerHTML;
  assert.match(html, /This backup: level 2 · 15 XP · 1 check-ins · 0 urges · last used Oct 10, 2026/);
  assert.match(html, /On this phone: level 2 · 45 XP · 3 check-ins · 0 urges · last used Oct 16, 2026/);
  assert.match(html, /This backup is older than what’s on this phone\. Replacing loses 30 XP, 2 check-ins\. Export a backup of this phone first/);
  assert.match(html, /Replace all data with this backup\?<\/span><button id="import-confirm-btn">Yes, replace<\/button>/);
  assert.equal(JSON.stringify(ST.app.state), before, 'nothing replaced yet');

  pick({ hello: 'world' });
  await app.settle();
  assert.match(app.elements['reset-confirm-area'].innerHTML, /That file isn’t a Status Terminal backup\./);
  assert.equal(JSON.stringify(ST.app.state), before);
});
