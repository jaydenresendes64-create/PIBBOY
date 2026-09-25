// The history (js/state.js): every reward is an event paid through award()
// and recorded, with the milestones that give no XP; one stream to answer
// "what happened this week", kept safe in saves and backups.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers');

const app = loadApp();
const ST = app.ST;
const fresh = () => { ST.app.state = ST.defaultState(); return ST.app.state; };
const types = s => Array.from(s.history, e => e.type);
const DAY = 864e5;

test('every reward is recorded, with the XP it really gave and what it was', () => {
  const s = fresh();
  app.setNow('2026-09-25T12:00:00');
  ST.completeSide(s.quests.side[0]);                            // Paper Trail: 150 XP
  ST.completeDaily(s.quests.daily[0]);                          // 20 XP
  ST.completeBonus(s.quests.mains[0].bonus[0], s.quests.mains[0]);   // 500 XP
  ST.discoverPlace('c:1', ST.CITY_XP, { kind: 'city', name: 'Montréal', cc: 'CA' });
  s.inventory.push({ id: 'xs', name: 'Mic', category: 'SELL', price: 200 });
  ST.sellItem('xs', 200);
  ST.acceptJournal({ text: 'Played guitar', xp: 25, reason: 'Music practice', skillGains: [{ skill: 'MUSIC', amount: 1 }] });
  ST.completeMain(s.quests.mains[0]);                           // 1000 XP: a level-up
  assert.deepEqual(types(s), ['QUEST_COMPLETED', 'DAILY_DONE', 'BONUS_COMPLETED', 'PLACE_DISCOVERED', 'ITEM_SOLD',
    'JOURNAL_ENTRY', 'QUEST_COMPLETED', 'LEVEL_UP']);
  const [side, , bonus, place, sale, , main, level] = s.history;
  assert.deepEqual(app.plain(side), { t: new Date('2026-09-25T12:00:00').getTime(), type: 'QUEST_COMPLETED', xp: 150,
    data: { kind: 'side', name: 'Paper Trail' } });
  assert.deepEqual(app.plain(bonus.data), { name: 'Find a job', quest: 'Caps on the Line' });
  assert.deepEqual([place.xp, place.data.name], [50, 'Montréal']);
  assert.deepEqual(app.plain(sale.data), { name: 'Mic', amount: 200 });
  assert.equal(main.xp, 1000);
  assert.deepEqual([level.xp, level.data.level], [0, 3]);        // the level-up comes after what caused it
  assert.equal(s.history.reduce((sum, e) => sum + e.xp, 0), s.lifetimeXp);   // the stream adds up
});

test('milestones without XP are recorded too: S.P.E.C.I.A.L., perks, backups, holotapes, check-ins, routes', () => {
  const s = fresh();
  s.unspentSpecialPoints = 1; s.unspentPerkPoints = 1;
  assert.equal(ST.spendSpecialPoint('INT'), true);
  assert.equal(ST.spendSpecialPoint('INT'), false);             // no point left
  assert.equal(ST.takePerk('wanderer'), 1);
  ST.markBackup();
  ST.countHolotape(42.4);
  ST.rewardCheckIn({ questName: 'A Higher Calling', streakDays: 3 });
  ST.rewardRoute({ name: 'Toronto → Ottawa', km: 450 });       // Wanderer 1: 25 XP
  assert.deepEqual(types(s), ['SPECIAL_RAISED', 'PERK_TAKEN', 'BACKUP_MADE', 'HOLOTAPE_RECORDED', 'STREAK_CHECKIN', 'ROUTE_ADDED']);
  assert.deepEqual(app.plain(s.history[0].data), { stat: 'INT', value: 6 });
  assert.deepEqual(app.plain(s.history[1].data), { perk: 'wanderer', name: 'Wanderer', rank: 1 });
  assert.deepEqual(app.plain(s.history[3].data), { seconds: 42 });
  assert.deepEqual([s.history[5].xp, s.history[5].data.km], [25, 450]);
  assert.deepEqual([s.stats.INT, s.unspentSpecialPoints, s.lastBackup, s.lifetimeHolotapes], [6, 0, ST.todayStr(), 1]);
});

test('bobbleheads found are one event each', () => {
  const s = fresh();
  s.level = 10;
  ST.findBobbleheads();
  assert.deepEqual(Array.from(s.history, e => e.data.id), ['vault', 'veteran']);
  assert.ok(s.history.every(e => e.type === 'BOBBLEHEAD_FOUND' && e.xp === ST.BOBBLEHEAD_XP));
});

test('what happened in the last days: the events since then, their XP and counts', () => {
  const s = fresh();
  app.setNow('2026-09-10T09:00:00');
  ST.completeDaily(s.quests.daily[0]);                          // 15 days ago
  app.setNow('2026-09-22T09:00:00');
  ST.completeDaily(s.quests.daily[1]);
  app.setNow('2026-09-25T09:00:00');
  ST.completeDaily(s.quests.daily[2]);
  ST.completeSide(s.quests.side[1]);
  const week = ST.historySummary(7);
  assert.deepEqual(app.plain(week), { xp: 20 + 15 + 100, count: 3, byType: { DAILY_DONE: 2, QUEST_COMPLETED: 1 } });
  assert.equal(ST.recentEvents(30).length, 4);
  assert.equal(ST.recentEvents(1).length, 2);
});

test('the history keeps the latest HISTORY_MAX events', () => {
  const s = fresh();
  for (let i = 0; i < ST.HISTORY_MAX + 5; i++) ST.record('DAILY_DONE', { n: i }, 1);
  assert.equal(s.history.length, ST.HISTORY_MAX);
  assert.equal(s.history[0].data.n, 5);
});

test('sanitize: known types at a real time, plain small data; older saves start empty', () => {
  const s = app.plain(ST.defaultState());
  const t = Date.now();
  s.history = [
    { t, type: 'QUEST_COMPLETED', xp: '150', data: { name: 'Q', extra: { deep: 1 }, list: [1], big: 'x'.repeat(500), n: 3 } },
    { t, type: 'HACKED', xp: 1, data: {} },
    { t: 'soon', type: 'DAILY_DONE', xp: 1, data: {} },
    { t: 0, type: 'DAILY_DONE', xp: 1, data: {} },
    { t, type: 'LEVEL_UP', xp: -5, data: 'level 3' },
    null, 'x'
  ];
  const out = app.plain(ST.sanitizeImported(JSON.parse(JSON.stringify(s)))).history;
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { t, type: 'QUEST_COMPLETED', xp: 150, data: { name: 'Q', big: 'x'.repeat(200), n: 3 } });
  assert.deepEqual(out[1], { t, type: 'LEVEL_UP', xp: 0, data: {} });
  const again = app.plain(ST.sanitizeImported(JSON.parse(JSON.stringify(Object.assign(s, { history: out })))));
  assert.deepEqual(again.history, out);                         // unchanged the second time
  delete s.history;
  assert.deepEqual(app.plain(ST.sanitizeImported(JSON.parse(JSON.stringify(s)))).history, []);
});
