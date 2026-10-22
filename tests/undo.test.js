// Settings → Undo last replace (2026-10-22): before a reset, an import or
// adding from the old terminal changes the whole state, the state as it was
// is kept (storage.keepPrevious); Settings says when and what it holds, asks,
// and puts it back, keeping what was there in its place (the undo can be
// undone). A copy written by a newer version is never put back.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

function app3() {
  const app = loadApp({ files: FILES.events });
  const ST = app.ST;
  ST.app.state = ST.defaultState();
  for (let d = 20; d <= 22; d++) { app.setNow('2026-10-' + d + 'T09:00:00'); ST.setVital('sleep', 6); ST.logVitals(); }
  app.setNow('2026-10-22T14:05:00');
  const on = {};
  app.context.document.body.addEventListener = (type, fn) => { on[type] = fn; };
  ST.events.setup();
  app.context.document.getElementById('settings').hidden = true;
  const tap = id => on.click({ target: { id, closest: () => null } });
  return { app, ST, on, tap };
}

test('a reset keeps what was there: Settings offers it back, asks, puts it back; the undo can be undone', async () => {
  const { app, ST, tap } = app3();
  const before = app.plain(ST.app.state);
  tap('settings-btn'); await app.settle();
  assert.equal(app.elements['undo-btn'].hidden, true);                  // nothing replaced yet
  tap('reset-btn'); tap('reset-confirm-btn'); await app.settle();
  assert.equal(ST.app.state.lifetimeXp, 0);
  app.context.document.getElementById('settings').hidden = true;
  tap('settings-btn'); await app.settle();
  assert.equal(app.elements['undo-btn'].hidden, false);
  assert.equal(app.elements['undo-note'].textContent, 'From before the reset, Oct 22 at 14:05: level 2 · 45 XP · 3 check-ins.');
  tap('undo-btn');
  assert.match(app.elements['reset-confirm-area'].innerHTML, /Put back the data from before the reset\? What’s here now is kept, to undo this\.<\/span><button id="undo-confirm-btn">Yes, put it back<\/button>/);
  tap('undo-confirm-btn'); await app.settle();
  assert.deepEqual(app.plain(ST.app.state), before);
  app.context.document.getElementById('settings').hidden = true;
  tap('settings-btn'); await app.settle();
  assert.match(app.elements['undo-note'].textContent, /^From before the last undo, .*: level 2 · 0 XP · 0 check-ins\.$/);
  tap('undo-btn'); tap('undo-confirm-btn'); await app.settle();
  assert.equal(ST.app.state.lifetimeXp, 0);                            // back to the reset state
  const saved = await loadApp({ files: FILES.storage, shared: app.shared }).ST.storage.load();
  assert.equal(saved.lifetimeXp, 0, 'each step saved');
});

test('an import keeps what was there; a kept copy from a newer version is never offered', async () => {
  const { app, ST, on, tap } = app3();
  const mine = app.plain(ST.app.state);
  const backup = app.plain(ST.defaultState());
  ST.storage.readJsonFile = () => Promise.resolve(backup);
  on.change({ target: { id: 'import-file', files: [{}], value: 'x', classList: { contains: () => false } } });
  await app.settle();
  tap('import-confirm-btn'); await app.settle();
  const kept = await ST.storage.readPrevious();
  assert.equal(kept.reason, 'import');
  assert.deepEqual(app.plain(kept.state), mine);
  app.shared.idb.put('status_terminal', 'docs', { id: 'state/previous', savedAt: 1, schema: ST.DATA_SCHEMA + 1, reason: 'import', data: mine });
  assert.equal(await ST.storage.readPrevious(), null);
  tap('settings-btn'); await app.settle();
  assert.equal(app.elements['undo-btn'].hidden, true);
});
