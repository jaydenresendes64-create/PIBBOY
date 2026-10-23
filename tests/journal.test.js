// LOG: the journal shows its latest 30 entries, newest first, then
// "30 more (N older)": the app keeps the latest 200, and the older ones
// could otherwise only be read in a backup file. Text is escaped.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

function journal(entries) {
  const a = loadApp({ files: FILES.events });
  const ST = a.ST;
  ST.app.state = ST.defaultState();
  for (let i = 0; i < entries; i++) ST.addLogEntry({ date: 'Oct ' + (i % 28 + 1) + ', 2026', text: 'Entry ' + i + (i === 0 ? ' <b>x</b>' : ''), xp: 10, reason: 'Learning / studying' });
  let click = null;
  a.context.document.body.addEventListener = (type, fn) => { if (type === 'click') click = fn; };
  ST.events.setup();
  const draw = () => { ST.render.renderLog(); return a.elements['tab-log'].innerHTML; };
  const texts = html => [...html.matchAll(/<div class="log-text">Entry (\d+)/g)].map(m => +m[1]);
  const more = html => { const m = /data-action="log-more" data-shown="(\d+)"/.exec(html); return m && m[1]; };
  const tap = shown => click({ target: { id: '', closest: sel => (sel === '[data-action]' ? { disabled: false, getAttribute: n => ({ 'data-action': 'log-more', 'data-shown': shown })[n] || null } : null) } });
  return { a, ST, draw, texts, more, tap };
}

test('the latest 30, newest first, then "30 more (N older)"; each tap shows 30 more, down to the first', () => {
  const j = journal(75);
  let html = j.draw();
  assert.deepEqual(j.texts(html), Array.from({ length: 30 }, (_, i) => 74 - i));
  assert.match(html, /<button class="list-more" data-action="log-more" data-shown="30">30 more \(45 older\)<\/button><\/div>/);
  j.tap(j.more(html));
  html = j.a.elements['tab-log'].innerHTML;
  assert.equal(j.texts(html).length, 60);
  assert.match(html, />15 more \(15 older\)<\/button>/);
  j.tap(j.more(html));
  html = j.a.elements['tab-log'].innerHTML;
  assert.deepEqual(j.texts(html), Array.from({ length: 75 }, (_, i) => 74 - i));
  assert.equal(j.more(html), null, 'no button once all show');
  assert.match(html, /Entry 0 &lt;b&gt;x&lt;\/b&gt;/);
});

test('30 or fewer: all of them, no button', () => {
  const j = journal(30);
  const html = j.draw();
  assert.equal(j.texts(html).length, 30);
  assert.equal(j.more(html), null);
});
