// A backup of a phone used every way the app allows comes back whole:
// export (JSON) → import (sanitizeImported) gives the same document, and a
// second pass changes nothing. The state is built through the app's own
// functions over two weeks (check-ins, urges with their details and notes,
// trials, streaks, quests, books, perks, the journal, the map), so a field
// a feature writes but the import gate forgets shows up here.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

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

test('a phone used every way: the backup comes back identical, and importing it again changes nothing', () => {
  const { app, ST, s } = usedPhone();
  const doc = app.plain(s);
  // what the test filled, so it can't pass on an empty document
  assert.ok(doc.vitals.filter(v => v.logged).length >= 9);
  assert.ok(doc.urges.log.some(u => u.outcome === 'lapsed') && doc.urges.log.some(u => u.note && u.trigger && u.copes.length));
  assert.ok(doc.urges.active && doc.urges.copes.some(c => c.name === 'Music'));
  assert.ok(doc.trials.log.length === 3 && doc.trials.custom.length === 1);
  assert.ok(doc.streaks.length === 1 && doc.chems.cleanSince && doc.history.length > 20);
  assert.ok(doc.books.length === 1 && doc.map.routes.length === 1 && doc.map.discovered.length === 1);
  const back = app.plain(ST.sanitizeImported(JSON.parse(JSON.stringify(s, null, 2))));
  assert.deepEqual(back, doc);
  assert.deepEqual(app.plain(ST.sanitizeImported(JSON.parse(JSON.stringify(back)))), back);
  assert.deepEqual(app.plain(ST.compareBackup(s, back).lose), { xp: 0, checkins: 0, urges: 0, journal: 0, places: 0 });
});
