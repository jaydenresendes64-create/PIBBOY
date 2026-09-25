// Perks (js/state.js): a point per level-up, a chart whose ranks need a
// stat, and each perk's effect on the reward it changes.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers');

const app = loadApp();
const ST = app.ST;
const fresh = () => { ST.app.state = ST.defaultState(); return ST.app.state; };
const load = doc => app.plain(ST.sanitizeImported(JSON.parse(JSON.stringify(doc))));

test('a save from before perks gets a point per level gained since the start; a new player none', () => {
  const doc = app.plain(ST.defaultState());
  delete doc.perks; delete doc.unspentPerkPoints;
  doc.level = 7;
  const s = load(doc);
  assert.deepEqual(s.perks, {});
  assert.equal(s.unspentPerkPoints, 5);
  assert.equal(load(s).unspentPerkPoints, 5);                 // once: kept as it is afterwards
  assert.equal(fresh().unspentPerkPoints, 0);
});

test('each level-up gives a perk point, with its S.P.E.C.I.A.L. point', () => {
  const s = fresh();
  ST.gainXp(1000 + 1400);                                     // two levels
  assert.deepEqual([s.level, s.unspentSpecialPoints, s.unspentPerkPoints], [4, 2, 2]);
});

test('taking a perk: a point, the stat high enough, one rank at a time, up to its ranks', () => {
  const s = fresh();                                          // STR 4, END 3, CHA 4, INT 5, AGI 2
  assert.equal(ST.takePerk('wanderer'), 0);                   // no point
  s.unspentPerkPoints = 5;
  assert.equal(ST.perkOpen('quickhands'), false);             // AGI 2 < 3
  assert.equal(ST.takePerk('quickhands'), 0);
  assert.equal(ST.takePerk('wanderer'), 1);                   // END 3
  assert.equal(ST.perkOpen('wanderer'), false);               // rank 2 needs END 4
  s.stats.END = 5;
  assert.equal(ST.takePerk('wanderer'), 2);
  assert.equal(ST.takePerk('wanderer'), 3);
  assert.equal(ST.takePerk('wanderer'), 0);                   // max rank
  assert.equal(ST.takePerk('nope'), 0);
  assert.deepEqual([s.perks.wanderer, s.unspentPerkPoints], [3, 2]);
});

test('perk effects: each changes its own reward, nothing without the perk', () => {
  const s = fresh();
  const route = { name: 'Toronto → Ottawa', km: 450 };
  assert.equal(ST.rewardRoute(route).xp, 0);                  // recorded, but no XP without Wanderer
  assert.equal(ST.rewardCheckIn(s.quests.mains[0]).xp, 0);
  assert.equal(ST.withPerks('JOURNAL_ENTRY', 30).xp, 30);
  s.perks = { wanderer: 2, ironwill: 1, comprehension: 2, cartographer: 1, barter: 1, habit: 3, quickhands: 2, scholar: 1 };
  assert.equal(ST.rewardRoute(route).xp, 50);
  assert.equal(ST.rewardCheckIn(s.quests.mains[0]).xp, 10);
  assert.equal(ST.withPerks('JOURNAL_ENTRY', 30).xp, 42);    // +40%
  assert.equal(ST.acceptJournal({ text: 'Gym', xp: 30, reason: 'Physical activity', skillGains: [] }).xp, 42);
  assert.equal(s.log[s.log.length - 1].xp, 42);              // the journal line says what it gave
  assert.equal(ST.discoverPlace('c:1', ST.CITY_XP).xp, 63);   // 50 +25%, rounded
  assert.equal(ST.completeDaily(s.quests.daily[0]).xp, 35);   // 20 + 15
  assert.equal(ST.completeBonus(s.quests.mains[0].bonus[0]).xp, 750);   // 500 +50%
  s.inventory.push({ id: 'xs', name: 'Mic', category: 'SELL', price: 100 });
  assert.equal(ST.sellItem('xs', 100).xp, ST.SALE_XP * 2);
  assert.equal(s.log[s.log.length - 1].xp, ST.SALE_XP * 2);  // the journal line says the same
  const side = ST.completeSide(s.quests.side[0]);             // KNOWLEDGE +3, Scholar +1
  assert.deepEqual(app.plain(side.skillGains), [{ skill: 'KNOWLEDGE', amount: 4 }]);
  assert.equal(s.skills.KNOWLEDGE, 14);
  assert.deepEqual(app.plain(s.quests.side[0].skillGains), [{ skill: 'KNOWLEDGE', amount: 3 }]);   // the quest itself unchanged
});

test('the perk table: its texts follow its numbers; a perk only touches its own event type', () => {
  fresh();
  const perk = id => ST.perkById(id);
  assert.equal(perk('wanderer').effect(2), 'Each new route: +50 XP');
  assert.equal(perk('barter').effect(1), 'Selling an item: 2× the XP');
  assert.equal(perk('barter').effect(2), 'Selling an item: 3× the XP');
  assert.equal(perk('scholar').effect(2), 'Every skill gain from a quest: +2');
  assert.equal(perk('comprehension').effect(1), 'Journal entries (Analyze): +20% XP');
  ST.app.state.perks = { scholar: 2, cartographer: 2 };
  assert.deepEqual(app.plain(ST.withPerks('QUEST_COMPLETED', 100, [{ skill: 'MUSIC', amount: 3 }, { skill: 'SPEECH', amount: -1 }])),
    { xp: 100, gains: [{ skill: 'MUSIC', amount: 5 }, { skill: 'SPEECH', amount: -1 }] });   // only positive gains grow
  assert.deepEqual(app.plain(ST.withPerks('JOURNAL_ENTRY', 20, [{ skill: 'MUSIC', amount: 3 }])),
    { xp: 20, gains: [{ skill: 'MUSIC', amount: 3 }] });       // Scholar: quests only
  assert.equal(ST.withPerks('PLACE_DISCOVERED', 100).xp, 150);
  ST.PERKS.forEach(p => assert.ok(ST.EVENT_TYPES.includes(p.on), p.id + ' reacts to a real event type'));
});

test('sanitize: only the chart\'s perks, at whole ranks within their ranks', () => {
  const s = app.plain(ST.defaultState());
  s.perks = { wanderer: '2', scholar: 9, nope: 1, barter: 0, habit: -1, '__proto__': 3, cartographer: 'x' };
  s.unspentPerkPoints = '3.4';
  const out = load(s);
  assert.deepEqual(out.perks, { wanderer: 2, scholar: 2 });
  assert.equal(out.unspentPerkPoints, 3);
  s.perks = 'lots';
  assert.deepEqual(load(s).perks, {});
});
