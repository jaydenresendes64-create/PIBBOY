// events.js: a backup (RadAway) is handed over one at a time. A second tap
// while the share sheet opens would be refused by the phone, and must never
// count as a backup that didn't happen.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

test('a second tap while a backup is being handed over does nothing', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });    // the toasts' and the save's timers
  const app = loadApp({ files: FILES.events });
  const ST = app.ST;
  ST.app.state = ST.defaultState();
  let click = null;
  app.context.document.body.addEventListener = (type, fn) => { if (type === 'click') click = fn; };
  ST.events.setup();
  const shares = [];                                  // each share sheet opened, waiting for an answer
  ST.storage.exportFile = () => new Promise(resolve => shares.push(resolve));
  const tap = id => click({ target: { id, closest: () => null } });

  tap('export-btn');
  tap('export-btn');                                  // the double tap
  assert.equal(shares.length, 1);
  shares[0](false);                                   // cancelled: no backup
  await app.settle();
  assert.equal(ST.app.state.lastBackup, null);

  tap('export-btn');                                  // a new try opens the sheet again
  assert.equal(shares.length, 2);
  shares[1](true);                                    // handed over: the RadAway
  await app.settle();
  assert.equal(ST.app.state.lastBackup, ST.todayStr());
});
