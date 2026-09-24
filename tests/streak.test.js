// Streak main quests and daily dates across days: one check-in a day, a
// missed day resets the streak, the target completes the quest once, and
// midnight, month/year ends, daylight saving and clock changes behave.
'use strict';

// A time zone with daylight saving, so the DST cases below are real ones.
// (Each test file runs in its own process: this only affects this file.)
process.env.TZ = 'America/Toronto';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers');

const app = loadApp();
const ST = app.ST;
const at = (y, mo, d, h, mi) => app.setNow(new Date(y, mo - 1, d, h || 12, mi || 0));
const quest = (fields) => Object.assign({ progressType: 'streak', streakTarget: 7, streakDays: 0, lastCheckIn: null, completed: false }, fields);

test('todayStr is the local calendar day, YYYY-M-D', () => {
  at(2026, 9, 4, 0, 1);
  assert.equal(ST.todayStr(), '2026-9-4');
  at(2026, 12, 31, 23, 59);
  assert.equal(ST.todayStr(), '2026-12-31');
});

test('one check-in per day', () => {
  at(2026, 9, 24, 8);
  const q = quest();
  assert.equal(ST.streakCheckIn(q), true);
  assert.deepEqual([q.streakDays, q.lastCheckIn], [1, '2026-9-24']);
  at(2026, 9, 24, 23, 59);
  assert.equal(ST.checkedInToday(q), true);
  assert.equal(ST.streakCheckIn(q), false);
  assert.equal(q.streakDays, 1);
});

test('days in a row add up, across midnight', () => {
  const q = quest();
  at(2026, 9, 24, 23, 58); ST.streakCheckIn(q);
  at(2026, 9, 25, 0, 1);
  assert.equal(ST.checkedInToday(q), false);
  assert.equal(ST.currentStreak(q), 1);
  ST.streakCheckIn(q);
  assert.equal(q.streakDays, 2);
});

test('a missed day resets the streak as soon as the app is opened', () => {
  const q = quest({ streakDays: 5, lastCheckIn: '2026-9-20' });
  at(2026, 9, 21); assert.equal(ST.currentStreak(q), 5);   // yesterday: still going
  at(2026, 9, 22); assert.equal(ST.currentStreak(q), 0);   // a day missed: 0, before any check-in
  ST.streakCheckIn(q);
  assert.equal(q.streakDays, 1);                           // starts again at 1
});

test('reaching the target: reported once, completion rewards once', () => {
  ST.app.state = ST.defaultState();
  const q = quest({ streakTarget: 3, xp: 900, skillGains: [{ skill: 'SURVIVAL', amount: 4 }] });
  const results = [];
  for (let day = 1; day <= 3; day++) {
    at(2026, 10, day);
    const r = ST.streakCheckIn(q);
    results.push(r);
    if (r === 'target') ST.completeMain(q);
    results.push(ST.streakCheckIn(q));                     // a second tap the same day
  }
  assert.deepEqual(results, [true, false, true, false, 'target', false]);
  assert.equal(q.completed, true);
  assert.equal(ST.app.state.lifetimeXp, 900);
  assert.equal(ST.app.state.skills.SURVIVAL, 27);
  at(2026, 10, 4);
  assert.equal(ST.streakCheckIn(q), false);                // completed: no more check-ins
  at(2026, 10, 20);
  assert.equal(ST.currentStreak(q), 3);                    // keeps the streak it finished with
});

test('month and year boundaries count as consecutive days', () => {
  for (const [prev, now] of [['2026-2-28', [2026, 3, 1]], ['2028-2-29', [2028, 3, 1]], ['2026-4-30', [2026, 5, 1]], ['2026-12-31', [2027, 1, 1]]]) {
    at(...now, 0, 5);
    assert.equal(ST.currentStreak(quest({ streakDays: 4, lastCheckIn: prev })), 4, prev);
  }
  at(2028, 3, 1);
  assert.equal(ST.currentStreak(quest({ streakDays: 4, lastCheckIn: '2028-2-28' })), 0, 'leap day missed');
});

test('daylight saving changes do not break or stretch a streak', () => {
  // Spring forward: 2026-03-08 is 23 hours long in Toronto.
  at(2026, 3, 9, 0, 30);
  assert.equal(ST.currentStreak(quest({ streakDays: 3, lastCheckIn: '2026-3-8' })), 3);
  assert.equal(ST.checkedInToday(quest({ lastCheckIn: '2026-3-8' })), false);
  // Fall back: 2026-11-01 is 25 hours long.
  at(2026, 11, 2, 23, 59);
  assert.equal(ST.currentStreak(quest({ streakDays: 3, lastCheckIn: '2026-11-1' })), 3);
  at(2026, 11, 3, 0, 0);
  assert.equal(ST.currentStreak(quest({ streakDays: 3, lastCheckIn: '2026-11-1' })), 0);
});

test('time zone: a check-in dated tomorrow still counts as today', () => {
  at(2026, 9, 24, 20);
  const q = quest({ streakDays: 4, lastCheckIn: '2026-9-25' }); // checked in abroad, a day ahead
  assert.equal(ST.checkedInToday(q), true);
  assert.equal(ST.streakCheckIn(q), false);
  assert.equal(ST.currentStreak(q), 4);
  at(2026, 9, 26);
  ST.streakCheckIn(q);
  assert.equal(q.streakDays, 5);
});

test('clock that was wrong: a check-in dated far ahead does not lock the quest', () => {
  at(2026, 9, 24);
  const q = quest({ streakDays: 2, lastCheckIn: '2027-9-24' });  // saved while the clock was a year ahead
  assert.equal(ST.checkedInToday(q), false);
  assert.equal(ST.streakCheckIn(q), true);
  assert.deepEqual([q.streakDays, q.lastCheckIn], [3, '2026-9-24']);
});

test('no date, or a malformed one, means never checked in', () => {
  at(2026, 9, 24);
  for (const d of [null, undefined, '', 'yesterday', '24/09/2026']) {
    const q = quest({ streakDays: 3, lastCheckIn: d });
    assert.equal(ST.checkedInToday(q), false, String(d));
    assert.equal(ST.currentStreak(q), 0, String(d));
  }
});

test('daily quests: a date loaded as YYYY-MM-DD matches today', () => {
  at(2026, 9, 4);
  const s = app.plain(ST.defaultState());
  s.quests.daily[0].lastDate = '2026-09-04';
  const loaded = ST.sanitizeImported(s);
  assert.equal(loaded.quests.daily[0].lastDate, ST.todayStr());
});

test('daily quests: done once a day, and the date going back (flying west) does not open them again', () => {
  at(2026, 9, 24, 23);
  const q = { id: 'd1', xp: 20, lastDate: null };
  assert.equal(ST.dailyDoneToday(q), false);
  q.lastDate = ST.todayStr();
  assert.equal(ST.dailyDoneToday(q), true);
  at(2026, 9, 23, 21);                                  // landed west: the calendar is a day behind
  assert.equal(ST.dailyDoneToday(q), true);
  at(2026, 9, 25, 0, 1);                                // the next day opens it again
  assert.equal(ST.dailyDoneToday(q), false);
  at(2026, 9, 24);
  assert.equal(ST.dailyDoneToday({ lastDate: '2027-9-24' }), false);   // a clock that was a year ahead locks nothing
});
