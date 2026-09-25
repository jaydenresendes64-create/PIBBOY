// Caps quests: a main quest whose bar follows the wallet's CAPS and that
// completes itself at its target (state.js: linkCapsQuests, syncCapsQuests).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers');

// A save from before caps quests: main quests on a manual percentage.
function oldSave(ST, mains) {
  const s = JSON.parse(JSON.stringify(ST.defaultState()));
  delete s.capsQuestsLinked;
  s.quests.mains = mains.map((m, i) => Object.assign(
    { id: 'm' + (i + 1), questName: 'Q' + i, progressType: 'percent', progress: 10, xp: 1000, completed: false, skillGains: [], bonus: [] }, m));
  return s;
}

test('an old "Obtain 5 Caps" quest starts following the wallet; others are left alone', () => {
  const { ST } = loadApp();
  const s = ST.sanitizeImported(oldSave(ST, [
    { title: 'Obtain 5 Caps' },
    { title: 'earn 2,5 caps!' },
    { title: 'Obtain 5 Caps', completed: true },
    { title: 'Run a marathon' },
    { title: 'Keep up prayer for 7 days straight!', progressType: 'streak', streakTarget: 7 }
  ]));
  const m = s.quests.mains;
  assert.equal(m[0].progressType, 'caps'); assert.equal(m[0].capsTarget, 5);
  assert.equal(m[1].progressType, 'caps'); assert.equal(m[1].capsTarget, 2.5);
  assert.equal(m[2].progressType, 'percent');        // already completed: untouched
  assert.equal(m[3].progressType, 'percent');
  assert.equal(m[4].progressType, 'streak');
  assert.equal(s.capsQuestsLinked, true);
});

test('linking happens once: a quest set back to a manual percentage stays so', () => {
  const { ST } = loadApp();
  const s = ST.sanitizeImported(oldSave(ST, [{ title: 'Obtain 5 Caps' }]));
  s.quests.mains[0].progressType = 'percent';
  const again = ST.sanitizeImported(JSON.parse(JSON.stringify(s)));
  assert.equal(again.quests.mains[0].progressType, 'percent');
});

test('the bar follows the wallet, and reaching the target completes the quest once', () => {
  const { ST } = loadApp();
  ST.app.state = ST.defaultState();
  const quest = ST.app.state.quests.mains[0];
  assert.equal(quest.progressType, 'caps');          // new players' first main quest
  ST.app.state.finances.holdings = [{ id: 'h1', label: 'CASH', amount: 2500, rateToCAD: 1 }];   // 2.5 caps of 5
  assert.equal(ST.syncCapsQuests().length, 0);
  assert.equal(quest.progress, 50);

  ST.app.state.finances.holdings.push({ id: 'h2', label: 'USD', amount: 2000, rateToCAD: 1.3 });   // + 2.6 caps
  const reached = ST.syncCapsQuests();
  assert.equal(reached.length, 1);
  assert.equal(quest.progress, 100);
  const before = ST.app.state.lifetimeXp;
  assert.ok(ST.completeMain(reached[0]));
  assert.equal(ST.app.state.lifetimeXp, before + 1000);
  assert.equal(ST.completeMain(reached[0]), null);   // never paid twice
  assert.equal(ST.syncCapsQuests().length, 0);        // completed quests aren't reached again

  ST.app.state.finances.holdings = [];                // money spent afterwards: stays completed
  ST.syncCapsQuests();
  assert.equal(quest.completed, true);
  assert.equal(quest.progress, 100);
});

test('a main quest at 100% waits for its Complete button; a streak quest never does', () => {
  const { ST } = loadApp();
  ST.app.state = ST.defaultState();
  const caps = ST.app.state.quests.mains[0];
  const percent = { id: 'm2', progressType: 'percent', progress: 99, xp: 500, completed: false, skillGains: [], bonus: [] };
  const streak = { id: 'm3', progressType: 'streak', progress: 0, streakTarget: 1, streakDays: 1, xp: 100, completed: false, skillGains: [], bonus: [] };
  ST.app.state.quests.mains.push(percent, streak);

  assert.equal(ST.mainReady(percent), false);
  percent.progress = 100;                             // the slider slipped to the end
  assert.equal(ST.mainReady(percent), true);
  assert.equal(percent.completed, false);             // reaching 100% pays nothing by itself
  assert.equal(ST.app.state.lifetimeXp, 0);

  assert.equal(ST.mainReady(caps), false);
  ST.app.state.finances.holdings = [{ id: 'h1', label: 'CASH', amount: 50000, rateToCAD: 1 }];   // a zero too many
  assert.equal(ST.syncCapsQuests().length, 1);
  assert.equal(ST.mainReady(caps), true);
  assert.equal(caps.completed, false);
  ST.app.state.finances.holdings[0].amount = 500;     // fixed before any tap: not ready any more
  ST.syncCapsQuests();
  assert.equal(ST.mainReady(caps), false);
  assert.equal(ST.app.state.lifetimeXp, 0);

  assert.ok(ST.completeMain(percent));                // the tap on Complete
  assert.equal(ST.mainReady(percent), false);         // done: no button any more
  assert.equal(ST.mainReady(streak), false);          // completes with its last check-in instead
  assert.equal(ST.mainReady(null), false);
});

test('a caps quest survives a backup round trip; a broken target falls back to 5', () => {
  const { ST } = loadApp();
  const s = ST.defaultState();
  s.quests.mains[0].capsTarget = 12.5;
  assert.equal(ST.sanitizeImported(JSON.parse(JSON.stringify(s))).quests.mains[0].capsTarget, 12.5);
  s.quests.mains[0].capsTarget = 'lots';
  assert.equal(ST.sanitizeImported(JSON.parse(JSON.stringify(s))).quests.mains[0].capsTarget, 5);
});
