// XP, level-ups, skill and S.P.E.C.I.A.L. limits, main quest rewards, and
// the journal log's cap.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers');

const app = loadApp();
const ST = app.ST;
const fresh = () => { ST.app.state = ST.defaultState(); return ST.app.state; };

test('gainXp: below the next level', () => {
  const s = fresh();
  assert.equal(ST.gainXp(300), false);
  assert.equal(s.xp, 300);
  assert.equal(s.level, 2);
  assert.equal(s.lifetimeXp, 300);
  assert.equal(s.unspentSpecialPoints, 0);
});

test('gainXp: exactly the next level', () => {
  const s = fresh();
  assert.equal(ST.gainXp(1000), true);
  assert.deepEqual([s.level, s.xp, s.xpToNext, s.unspentSpecialPoints], [3, 0, 1400, 1]);
});

test('gainXp: one big reward gives several level-ups, one point each', () => {
  const s = fresh();
  // 1000 (to 3) + 1400 (to 4) + 1800 (to 5) = 4200, 800 left over toward 2200
  assert.equal(ST.gainXp(5000), true);
  assert.deepEqual([s.level, s.xp, s.xpToNext, s.unspentSpecialPoints, s.lifetimeXp], [5, 800, 2200, 3, 5000]);
});

test('gainXp: ignores missing, negative and non-numeric amounts', () => {
  const s = fresh();
  for (const bad of [undefined, null, NaN, -500, 0, 'abc', Infinity, {}]) assert.equal(ST.gainXp(bad), false);
  assert.deepEqual([s.xp, s.lifetimeXp, s.level], [0, 0, 2]);
  ST.gainXp('40');                                  // a numeric string still counts
  assert.equal(s.xp, 40);
});

test('grantSkill: stays within 0-100, only real skills', () => {
  const s = fresh();
  s.skills.MUSIC = 98;
  ST.grantSkill('MUSIC', 5);
  assert.equal(s.skills.MUSIC, 100);
  s.skills.COOKING = 1;
  ST.grantSkill('COOKING', -3);
  assert.equal(s.skills.COOKING, 0);
  ST.grantSkill('KNOWLEDGE', 2);
  assert.equal(s.skills.KNOWLEDGE, 12);
  const before = JSON.stringify(s);
  ST.grantSkill('STR', 1);                          // a S.P.E.C.I.A.L. key isn't a skill
  ST.grantSkill('SCIENCE', 1);                      // the old skill name
  ST.grantSkill('SPEECH', NaN);
  ST.grantSkill('SPEECH', 'lots');
  assert.equal(JSON.stringify(s), before);
});

test('grantStat: stays within 0-10, only S.P.E.C.I.A.L. keys', () => {
  const s = fresh();
  s.stats.AGI = 10;
  ST.grantStat('AGI', 1);
  assert.equal(s.stats.AGI, 10);
  ST.grantStat('END', 1);
  assert.equal(s.stats.END, 4);
  ST.grantStat('END', -9);
  assert.equal(s.stats.END, 0);
  const before = JSON.stringify(s);
  ST.grantStat('MUSIC', 1);
  ST.grantStat('LCK', 1);
  assert.equal(JSON.stringify(s), before);
});

test('level-ups only add unspent points; stats never change by themselves', () => {
  const s = fresh();
  const stats = JSON.stringify(s.stats);
  ST.gainXp(100000);
  assert.ok(s.unspentSpecialPoints > 0);
  assert.equal(JSON.stringify(s.stats), stats);
});

test('completeMain: XP and skill gains once', () => {
  const s = fresh();
  const m = s.quests.mains[0];                     // 1000 XP, FINANCE +8, BUSINESS +2
  const reward = ST.completeMain(m);
  assert.deepEqual(app.plain(reward), { xp: 1000, leveled: true });
  assert.equal(m.completed, true);
  assert.deepEqual([s.skills.FINANCE, s.skills.BUSINESS, s.lifetimeXp], [25, 7, 1000]);
  assert.equal(ST.completeMain(m), null);          // a second time: nothing
  assert.deepEqual([s.skills.FINANCE, s.skills.BUSINESS, s.lifetimeXp], [25, 7, 1000]);
});

test('completeMain: a quest without XP or gains', () => {
  const s = fresh();
  const reward = ST.completeMain({ completed: false });
  assert.deepEqual(app.plain(reward), { xp: 0, leveled: false });
  assert.equal(s.lifetimeXp, 0);
});

test('addLogEntry: log capped at 200, lifetime counter keeps counting', () => {
  const s = fresh();
  for (let i = 0; i < 250; i++) ST.addLogEntry({ date: 'd', text: 'entry ' + i, xp: 8, reason: 'r' });
  assert.equal(s.log.length, 200);
  assert.equal(s.log[0].text, 'entry 50');
  assert.equal(s.log[199].text, 'entry 249');
  assert.equal(s.lifetimeLogEntries, 250);
  assert.equal(ST.logEntryCount(), 250);
});

test('logEntryCount: a save from before the counter counts the entries it has', () => {
  const s = fresh();
  s.lifetimeLogEntries = 0;
  s.log = [{}, {}, {}];
  assert.equal(ST.logEntryCount(), 3);
  ST.addLogEntry({ date: 'd', text: 't', xp: 1, reason: 'r' });
  assert.equal(s.lifetimeLogEntries, 4);
});

test('wallet: totals, Caps and money never show -0.00', () => {
  const s = fresh();
  s.finances.holdings = [{ amount: 855.8, rateToCAD: 1.406 }, { amount: 160, rateToCAD: 1 }, { amount: 'x', rateToCAD: 'y' }];
  assert.equal(ST.money(ST.totalHoldingsCAD()), '1,363.25');
  assert.equal(ST.capsText(), '1.36');
  s.finances.holdings = [{ amount: -0.001, rateToCAD: 1 }];
  assert.equal(ST.money(ST.totalHoldingsCAD()), '0.00');
  assert.equal(ST.capsText(), '0.00');
  s.finances.holdings = [{ amount: -2500, rateToCAD: 1 }];
  assert.equal(ST.capsText(), '-2.50');
});

test('sellItem: removes the item, adds to CASH, 25 XP and a journal line', () => {
  const s = fresh();
  s.inventory.push({ id: 'g1', name: 'Guitar', category: 'SELL', price: 120 });
  s.finances.holdings = [{ id: 'f1', label: 'USDT', amount: 10, rateToCAD: 1.4 }, { id: 'f2', label: 'Cash', amount: 160.1, rateToCAD: 1 }];
  const sale = ST.sellItem('g1', 110.2);
  assert.deepEqual(app.plain(sale), { name: 'Guitar', amount: 110.2, leveled: false });
  assert.equal(s.inventory.some(i => i.id === 'g1'), false);
  assert.equal(s.finances.holdings[1].amount, 270.3);              // cents, no 270.29999
  assert.equal(s.finances.holdings[0].amount, 10);
  assert.equal(s.xp, ST.SALE_XP);
  assert.equal(s.log.length, 1);
  assert.equal(s.log[0].text, 'Sold Guitar for $110.20');
  assert.equal(s.log[0].xp, 25);
  assert.equal(s.lifetimeLogEntries, 1);
});

test('sellItem: makes a CASH holding at rate 1 when there is none', () => {
  const s = fresh();
  s.inventory.push({ id: 'g1', name: 'Bike', category: 'SELL' });
  ST.sellItem('g1', 1234.5);
  assert.equal(s.finances.holdings.length, 1);
  assert.deepEqual([s.finances.holdings[0].label, s.finances.holdings[0].amount, s.finances.holdings[0].rateToCAD], ['CASH', 1234.5, 1]);
  assert.equal(s.log[0].text, 'Sold Bike for $1,234.50');
});

test('sellItem: a CASH holding at another rate still grows by the amount in CAD', () => {
  const s = fresh();
  s.inventory.push({ id: 'g1', name: 'Lamp', category: 'SELL' });
  s.finances.holdings = [{ id: 'f1', label: 'CASH', amount: 0, rateToCAD: 2 }];
  ST.sellItem('g1', 50);
  assert.equal(ST.totalHoldingsCAD(), 50);
});

test('sellItem: nothing happens for a wrong amount, a missing item or one not for sale', () => {
  const s = fresh();
  s.inventory.push({ id: 'g1', name: 'Guitar', category: 'SELL' });
  for (const bad of [-1, NaN, 'abc', Infinity, undefined]) assert.equal(ST.sellItem('g1', bad), null);
  assert.equal(ST.sellItem('nope', 10), null);
  assert.equal(ST.sellItem('i1', 10), null);                        // Phone is in MISC
  assert.equal(s.inventory.length, 3);
  assert.deepEqual([s.xp, s.log.length, s.finances.holdings.length], [0, 0, 0]);
  assert.ok(ST.sellItem('g1', 0));                                  // given away for $0 is still a sale
});
