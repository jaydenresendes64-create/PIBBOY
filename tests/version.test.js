// Settings → About says which version of the app runs (the service worker's
// VERSION, a hash of the app's files) and whether a newer one is ready: an
// update comes in when the app goes to the background, so the owner can see
// whether the new version is in yet.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

function app(appVersion) {
  const a = loadApp({ files: FILES.events });
  a.ST.app.state = a.ST.defaultState();
  if (appVersion !== undefined) a.ST.appVersion = appVersion;
  const on = {};
  a.context.document.body.addEventListener = (type, fn) => { on[type] = fn; };
  a.ST.events.setup();
  a.context.document.getElementById('settings').hidden = true;
  a.open = async () => { a.context.document.getElementById('settings').hidden = true; on.click({ target: { id: 'settings-btn', closest: () => null } }); await a.settle(); return a.elements['app-version'].textContent; };
  return a;
}

test('the version that runs, and a newer one waiting', async () => {
  let answer = { version: 'e61ca5c6b2ac', waiting: false };
  const a = app(() => Promise.resolve(answer));
  assert.equal(await a.open(), 'Version e61ca5c6b2ac');
  answer = { version: 'e61ca5c6b2ac', waiting: true };
  assert.equal(await a.open(), 'Version e61ca5c6b2ac · a newer one is ready: it comes in when you leave the app');
});

test('no service worker (opened from a file, blocked, first visit): said so', async () => {
  assert.equal(await app(() => Promise.resolve(null)).open(), 'Version: no offline copy');
  assert.equal(await app().open(), 'Version: no offline copy');             // main.js not loaded
});

test('the copied error list starts with the version and the browser', async () => {
  const a = loadApp({ files: ['js/errors.js'].concat(FILES.events) });
  a.ST.app.state = a.ST.defaultState();
  a.ST.appVersion = () => Promise.resolve({ version: 'e61ca5c6b2ac', waiting: false });
  a.context.navigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';
  const on = {};
  a.context.document.body.addEventListener = (type, fn) => { on[type] = fn; };
  a.ST.events.setup();
  a.ST.render.showNotice = () => {};
  a.context.document.getElementById('settings').hidden = true;
  const tap = id => on.click({ target: { id, closest: () => null } });
  tap('settings-btn'); await a.settle();
  a.ST.errors.record('TypeError: x is undefined', 'render.js:120');
  let copied = null;
  a.context.navigator.clipboard = { writeText: t => { copied = t; return Promise.resolve(); } };
  tap('errors-copy-btn');
  assert.equal(copied.split('\n')[0], 'PIBBOY version e61ca5c6b2ac');
  assert.equal(copied.split('\n')[1], 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
  assert.match(copied.split('\n')[2], /TypeError: x is undefined  \(render\.js:120\)$/);
});
