// A backup of a phone used every way the app allows comes back whole:
// export (JSON) → import (sanitizeImported) gives the same document, and a
// second pass changes nothing. The state is built through the app's own
// functions over two weeks (check-ins, urges with their details and notes,
// trials, streaks, quests, books, perks, the journal, the map), so a field
// a feature writes but the import gate forgets shows up here.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { usedPhone } = require('./helpers');

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
