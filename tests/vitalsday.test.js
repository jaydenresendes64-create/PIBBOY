// VITALS' day runs from 4:00 to 4:00 (js/state.js vitalsDayStr): late at
// night, the counters and the check-in still belong to the evening's day, so
// the next morning's check-in stays the morning's. Dates are stored as before.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

function app(at) {
  const a = loadApp({ files: FILES.vitals });
  a.setNow(at);
  a.ST.app.state = a.ST.defaultState();
  return a;
}

test('the VITALS day starts at 4:00, across months and years', () => {
  const a = app('2026-10-11T03:59:00');
  assert.equal(a.ST.vitalsDayStr(), '2026-10-10');
  a.setNow('2026-10-11T04:00:00');
  assert.equal(a.ST.vitalsDayStr(), '2026-10-11');
  a.setNow('2026-11-01T01:30:00');
  assert.equal(a.ST.vitalsDayStr(), '2026-10-31');
  a.setNow('2027-01-01T02:00:00');
  assert.equal(a.ST.vitalsDayStr(), '2026-12-31');
  assert.equal(a.ST.todayStr(), '2027-1-1');                     // the rest of the app keeps midnight
});

test('late at night: no lock, no second check-in, the counters go to the evening; the morning gets its own check-in', () => {
  const a = app('2026-10-10T08:00:00'), ST = a.ST;
  assert.equal(ST.logVitals().xp, 15);
  a.setNow('2026-10-11T00:30:00');                               // after midnight, before 4:00
  assert.equal(ST.vitals.locked('quests'), false);
  assert.equal(ST.logVitals(), null);                            // still the 10th: done already
  ST.stepRads('N', 1);
  a.setNow('2026-10-11T03:59:00');
  ST.stepRads('N', 1);
  assert.deepEqual(a.plain(ST.app.state.vitals.map(v => [v.date, v.logged, v.radN])), [['2026-10-10', true, 2]]);
  a.setNow('2026-10-11T04:00:00');                               // the new VITALS day
  assert.equal(ST.vitals.locked('quests'), true);
  a.setNow('2026-10-11T08:00:00');
  assert.equal(ST.logVitals().xp, 15);
  assert.deepEqual(a.plain(ST.app.state.vitals.map(v => [v.date, v.logged, v.radN])), [['2026-10-10', true, 2], ['2026-10-11', true, 0]]);
  assert.equal(ST.app.state.lifetimeXp, 30);
});

test('values entered just before midnight and logged just after are the ones logged', () => {
  const a = app('2026-10-10T23:59:00'), ST = a.ST;
  ST.setVital('sleep', 2);
  ST.setVital('craving', 8);
  a.setNow('2026-10-11T00:00:30');
  ST.logVitals();
  assert.deepEqual(a.plain(ST.app.state.vitals.map(v => [v.date, v.logged, v.sleep, v.craving])), [['2026-10-10', true, 2, 8]]);
});

test('the last check-in counts its days from the VITALS day; a later-dated entry isn\'t "the last"', () => {
  const a = app('2026-10-09T08:00:00'), ST = a.ST;
  ST.setVital('craving', 7);
  ST.logVitals();
  a.setNow('2026-10-11T02:00:00');                               // VITALS day: the 10th
  assert.equal(ST.lastCheckIn().ago, 1);                         // the 9th is "yesterday"
  assert.equal(ST.vitals.order()[0], 'urge');                    // yesterday's craving was high
  ST.app.state.vitals.push({ date: '2026-10-11', logged: true, energy: 5, mood: 5, hunger: 5, tension: 5, sleep: 5, craving: 0, pulse: null, radN: 0, radT: 0 });
  assert.equal(ST.lastCheckIn().date, '2026-10-9');              // a tap after midnight before this change: not "the last" yet
  a.setNow('2026-10-11T05:00:00');
  assert.equal(ST.vitalsToday(false).date, '2026-10-11');        // ...and it's today's from 4:00
  assert.equal(ST.lastCheckIn().ago, 2);
});

test('the screen follows the 4:00 change, and a check-in drawn before it isn\'t logged for the new day unseen', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const a = app('2026-10-10T08:00:00'), ST = a.ST;
  ST.logVitals();
  a.setNow('2026-10-11T03:58:00');
  ST.vitals.render();
  assert.match(a.elements['tab-vitals'].innerHTML, /CHECK-IN · DONE/);
  a.setNow('2026-10-11T04:01:00');
  ST.vitals.refreshIfNewDay();                                   // main.js, every minute
  assert.match(a.elements['tab-vitals'].innerHTML, /data-vital="vitals-log">Log check-in/);

  // The form drawn at 3:59 (the 10th, open again with Edit), the tap at 4:01.
  const clicks = [], notices = [];
  a.context.document.body.addEventListener = (type, fn) => { if (type === 'click') clicks.push(fn); };
  ST.vitals.init();
  ST.render.showNotice = text => notices.push(text);
  a.setNow('2026-10-11T03:59:00');
  ST.app.vitalsEdit = true;
  ST.vitals.render();
  a.setNow('2026-10-11T04:01:00');
  const tap = () => clicks.forEach(fn => fn({ target: { closest: sel => (sel === '[data-vital]' ? { disabled: false, getAttribute: k => (k === 'data-vital' ? 'vitals-log' : null) } : null) } }));
  tap();
  assert.equal(ST.vitalsToday(false), null);                     // nothing logged for the 11th yet
  assert.deepEqual(notices, ['A new day started at 4:00. Check the values, then log.']);
  tap();                                                         // the new day's form, seen: now it logs
  assert.equal(ST.vitalsToday(false).logged, true);
  ST.vitals.stop(); ST.trials.stop();
});
