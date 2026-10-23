// ITEMS → BOOKS: the latest 10 books, then "10 more (N older)"; a book being
// asked about (Remove?) shows wherever it is in the list.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

function shelf(count) {
  const a = loadApp({ files: FILES.events });
  const ST = a.ST;
  a.setNow('2026-10-10T12:00:00');
  ST.app.state = ST.defaultState();
  for (let i = 0; i < count; i++) ST.readBook('Book ' + i, 'Author', 'KNOWLEDGE', 1);
  let click = null;
  a.context.document.body.addEventListener = (type, fn) => { if (type === 'click') click = fn; };
  ST.events.setup();
  const draw = () => { ST.render.renderInventory(); return a.elements['tab-items'].innerHTML; };
  const titles = html => [...html.matchAll(/<span class="book-title">Book (\d+)<\/span>/g)].map(m => +m[1]);
  const more = html => { const m = /data-action="books-more" data-shown="(\d+)">([^<]*)</.exec(html); return m && { shown: m[1], text: m[2] }; };
  const tap = shown => click({ target: { id: '', closest: sel => (sel === '[data-action]' ? { disabled: false, getAttribute: n => ({ 'data-action': 'books-more', 'data-shown': shown })[n] || null } : null) } });
  return { a, ST, draw, titles, more, tap };
}

test('the latest 10 books, newest first, then "10 more (N older)" down to the first', () => {
  const s = shelf(25);
  let html = s.draw();
  assert.match(html, /Books <span class="panel-count">25<\/span>/);
  assert.deepEqual(s.titles(html), [24, 23, 22, 21, 20, 19, 18, 17, 16, 15]);
  assert.deepEqual(s.more(html), { shown: '10', text: '10 more (15 older)' });
  s.tap('10');
  html = s.a.elements['tab-items'].innerHTML;
  assert.equal(s.titles(html).length, 20);
  assert.deepEqual(s.more(html), { shown: '20', text: '5 more (5 older)' });
  s.tap('20');
  html = s.a.elements['tab-items'].innerHTML;
  assert.equal(s.titles(html).length, 25);
  assert.equal(s.more(html), null);
});

test('ten or fewer: all of them; a book asked about shows even when older than the ten', () => {
  assert.equal(shelf(10).more(shelf(10).draw()), null);
  const s = shelf(25);
  s.ST.app.confirmRemove = { kind: 'book', id: s.ST.app.state.books[2].id };   // Book 2, the 23rd shown
  const html = s.draw();
  assert.equal(s.titles(html).length, 23);
  assert.match(html, /Remove this book\? Its XP and skill points stay\./);
  assert.deepEqual(s.more(html), { shown: '23', text: '2 more (2 older)' });
});
