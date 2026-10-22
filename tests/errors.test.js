// js/errors.js (2026-10-23): what goes wrong is kept on this device (the
// latest 20), said once a session, and shown in Settings → About with a way
// to copy or clear the list; another site's script error is left out.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

function app() {
  const a = loadApp({ files: ['js/errors.js'].concat(FILES.events) });
  a.ST.app.state = a.ST.defaultState();
  const on = {};
  a.context.document.body.addEventListener = (type, fn) => { on[type] = fn; };
  a.ST.events.setup();
  a.notices = [];
  a.ST.render.showNotice = text => a.notices.push(text);
  a.tap = id => on.click({ target: { id, closest: () => null } });
  a.fire = (type, event) => a.shared.windows[a.shared.windows.length - 1].dispatch(type, event);
  return a;
}

test('an error or a failed promise is kept with where it came from; one notice a session; the latest 20 only', () => {
  const a = app();
  a.setNow('2026-10-23T09:12:00');
  a.fire('error', { message: 'TypeError: x is undefined', filename: 'https://x.test/PIBBOY/js/render.js', lineno: 120, target: a.context });
  a.fire('unhandledrejection', { reason: { name: 'TypeError', message: 'Failed to fetch' } });
  a.fire('error', { message: 'Script error.', filename: '', lineno: 0, target: a.context });   // another site's: nothing to read
  const l = a.plain(a.ST.errors.list());
  assert.deepEqual(l.map(e => [e.message, e.where]), [['TypeError: x is undefined', 'render.js:120'], ['TypeError: Failed to fetch', 'promise']]);
  assert.deepEqual(a.notices, ['Something went wrong. Your data is safe: details in Settings → About.']);
  for (let i = 0; i < 25; i++) a.ST.errors.record('E' + i, 'test');
  assert.equal(a.ST.errors.list().length, 20);
  assert.equal(a.ST.errors.list()[19].message, 'E24');
  assert.equal(a.notices.length, 1);
  assert.match(a.ST.errors.text(), /^2026-10-23T\d\d:\d\d:00\.000Z  E5  \(test\)$/m);
});

test('Settings → About: "none", then the count and the latest, with Copy and Clear', async () => {
  const a = app();
  a.context.document.getElementById('settings').hidden = true;
  a.tap('settings-btn');
  assert.equal(a.elements['error-log'].textContent, 'Errors: none');
  assert.equal(a.elements['errors-copy-btn'].hidden, true);
  a.setNow('2026-10-23T09:12:00');
  a.ST.errors.record('TypeError: x is undefined', 'render.js:120');
  assert.equal(a.elements['error-log'].textContent, 'Errors: 1 · last Oct 23 at 09:12 — TypeError: x is undefined');
  assert.equal(a.elements['errors-copy-btn'].hidden, false);
  let copied = null;
  a.context.navigator.clipboard = { writeText: t => { copied = t; return Promise.resolve(); } };
  a.tap('errors-copy-btn'); await a.settle();
  assert.match(copied, /TypeError: x is undefined  \(render\.js:120\)/);
  assert.equal(a.notices.pop(), 'Error list copied');
  a.tap('errors-clear-btn');
  assert.equal(a.elements['error-log'].textContent, 'Errors: none');
  assert.equal(a.ST.errors.list().length, 0);
});
