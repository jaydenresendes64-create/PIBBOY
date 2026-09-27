// ITEMS → BOOKS (js/state.js readBook): a book finished is kept in the list
// and paid once, when added: BOOK_XP and at most one skill gain (+1 to +5),
// through award() (so it's in the history); saves from before have none.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers');

const app = loadApp({ now: '2026-09-26T12:00:00' });
const ST = app.ST;
const fresh = () => { ST.app.state = ST.defaultState(); return ST.app.state; };
const load = doc => app.plain(ST.sanitizeImported(JSON.parse(JSON.stringify(doc))));

test('a book read: its XP and its one skill, once, in the list and the history', () => {
  const s = fresh();
  const finance = s.skills.FINANCE, xp = s.lifetimeXp;
  const r = ST.readBook('  The Psychology of Money  ', ' Morgan Housel ', 'FINANCE', 4);
  assert.equal(r.xp, ST.BOOK_XP);
  assert.deepEqual(app.plain(r.skillGains), [{ skill: 'FINANCE', amount: 4 }]);
  assert.equal(s.skills.FINANCE, finance + 4);
  assert.equal(s.lifetimeXp, xp + 50);
  assert.deepEqual(app.plain(s.books), [{ id: r.book.id, title: 'The Psychology of Money', author: 'Morgan Housel',
    date: '2026-9-26', skillGains: [{ skill: 'FINANCE', amount: 4 }] }]);
  const last = s.history[s.history.length - 1];
  assert.deepEqual([last.type, last.xp, last.data.name], ['BOOK_READ', 50, 'The Psychology of Money']);
});

test('a book: no title, nothing; no skill, XP only; the points stay within +1 to +5', () => {
  const s = fresh();
  const before = app.plain(s.skills);
  assert.equal(ST.readBook('   ', '', 'MUSIC', 3), null);
  assert.equal(s.books.length, 0);
  assert.deepEqual(app.plain(ST.readBook('Dune', '', '', 5).skillGains), []);
  assert.deepEqual(app.plain(s.skills), before);
  assert.equal(ST.readBook('Big', '', 'MUSIC', 99).skillGains[0].amount, 5);
  assert.equal(ST.readBook('Small', '', 'MUSIC', -3).skillGains[0].amount, 1);
  assert.equal(ST.readBook('Not a number', '', 'MUSIC', 'x').skillGains[0].amount, 1);
  assert.deepEqual(app.plain(ST.readBook('Wrong skill', '', 'LUCK', 3).skillGains), []);
  assert.equal(s.lifetimeXp, 5 * ST.BOOK_XP);
});

test('sanitize: books are kept, cleaned; older saves start with none', () => {
  const s = app.plain(ST.defaultState());
  s.books = [
    { id: 'b1', title: ' Sapiens ', author: 'Harari', date: '2026-09-01', skillGains: [{ skill: 'KNOWLEDGE', amount: 3 }] },
    { id: '<bad>', title: '', author: 42, date: 'yesterday', skillGains: [{ skill: 'LUCK', amount: 3 }] },
    { id: 'b3', title: 'x'.repeat(300), skillGains: [{ skill: 'MUSIC', amount: 9.6 }, { skill: 'SPEECH', amount: 2 }] },
    'not a book', null
  ];
  const out = load(s).books;
  assert.equal(out.length, 3);
  assert.deepEqual(out[0], { id: 'b1', title: 'Sapiens', author: 'Harari', date: '2026-9-1', skillGains: [{ skill: 'KNOWLEDGE', amount: 3 }] });
  assert.equal(out[1].title, 'Untitled');
  assert.equal(out[1].author, '42');
  assert.equal(out[1].date, null);
  assert.deepEqual(out[1].skillGains, []);
  assert.match(out[1].id, /^[A-Za-z0-9_-]+$/);
  assert.equal(out[2].title.length, ST.BOOK_TITLE_MAX);
  assert.deepEqual(out[2].skillGains, [{ skill: 'MUSIC', amount: 5 }]);   // one gain, +5 at most
  delete s.books;
  assert.deepEqual(load(s).books, []);
  const migrated = ST.migrate({ stats: {}, quests: {} });
  assert.deepEqual(app.plain(migrated.books), []);
});

test('Bookworm, found at 5 books, takes Road Warrior\'s place on the shelf', () => {
  const s = fresh();
  assert.equal(ST.BOBBLEHEADS.length, 16);
  assert.ok(ST.BOBBLEHEADS.some(b => b.id === 'bookworm'));
  assert.ok(!ST.BOBBLEHEADS.some(b => b.id === 'roadwarrior'));
  for (let i = 0; i < 4; i++) ST.readBook('Book ' + i, '', 'KNOWLEDGE', 1);
  assert.equal(ST.findBobbleheads(), null);
  ST.readBook('Book 4', '', 'KNOWLEDGE', 1);
  assert.deepEqual(Array.from(ST.findBobbleheads().found, b => b.id), ['bookworm']);
  assert.equal(s.bobbleheads.bookworm, '2026-9-26');
});
