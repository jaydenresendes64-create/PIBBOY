// Holotapes (js/holotapes.js): the recording format picked, durations and
// file names, records read back safely; and the count kept in the state
// for the Archivist bobblehead.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadApp, FILES } = require('./helpers');

const app = loadApp({ files: FILES.holotapes });
const ST = app.ST;
const H = ST.holotapes;

test('the format: the first one this browser records (an iPhone: audio/mp4), else its own', () => {
  assert.equal(H.pickMime(t => t === 'audio/mp4'), 'audio/mp4');
  assert.equal(H.pickMime(t => t.indexOf('webm') !== -1), 'audio/webm;codecs=opus');
  assert.equal(H.pickMime(() => false), '');
  assert.equal(H.pickMime(() => { throw new Error('no'); }), '');
  assert.equal(H.extFor('audio/mp4'), '.m4a');
  assert.equal(H.extFor('audio/webm;codecs=opus'), '.webm');
  assert.equal(H.extFor('audio/ogg'), '.ogg');
});

test('durations and names', () => {
  assert.equal(H.durationText(7.4), '0:07');
  assert.equal(H.durationText(92), '1:32');
  assert.equal(H.durationText(-3), '0:00');
  assert.equal(H.durationText('x'), '0:00');
  assert.equal(H.tapeTitle(3), 'Holotape #3');
});

test('a record read back from the device is checked', () => {
  const vmBuffer = vm.runInContext('new ArrayBuffer(8)', app.context);   // an ArrayBuffer of the app's own realm
  const ok = H.checkRecord({ id: 'x1', title: 'Day one', date: '2026-9-25', at: 5, seconds: 12.5, mime: 'audio/mp4', audio: vmBuffer });
  assert.equal(ok.title, 'Day one');
  assert.equal(ok.seconds, 12.5);
  assert.equal(H.checkRecord({ id: 'x2', title: 'No audio' }), null);
  assert.equal(H.checkRecord({ id: 7, audio: vmBuffer }), null);
  assert.equal(H.checkRecord(null), null);
  assert.equal(H.checkRecord({ id: 'x3', title: 'T'.repeat(200), audio: vmBuffer, seconds: -1 }).title.length, 80);
});

test('the state counts holotapes (older saves: 0), and five find the Archivist', () => {
  ST.app.state = ST.defaultState();
  const s = app.plain(ST.defaultState());
  delete s.lifetimeHolotapes;
  assert.equal(ST.sanitizeImported(JSON.parse(JSON.stringify(s))).lifetimeHolotapes, 0);
  s.lifetimeHolotapes = '4.6';
  assert.equal(ST.sanitizeImported(JSON.parse(JSON.stringify(s))).lifetimeHolotapes, 5);
  ST.app.state.lifetimeHolotapes = 5;
  const found = ST.findBobbleheads();
  assert.ok(Array.from(found.found, b => b.id).includes('archivist'));
});
