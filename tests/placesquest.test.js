// Places quests (2026-10-22, HANDOFF §8 step 0, "reveal 5 cities in
// Morocco"): a main quest whose bar follows the cities and regions on the
// MAP, anywhere or in one country; at its target the reward waits for the
// Complete tap, once, like a caps quest.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

const city = (id, cc) => ({ id, name: id, cc, lat: 31.6, lon: -8, radius: 5000, date: '2026-10-20', note: '' });
const region = (id, cc) => ({ id, name: id, cc, code: cc + '-01', date: '2026-10-20', note: '' });
const quest = extra => Object.assign({ id: 'pq', questName: 'Atlas', title: 'Reveal 3 places in Morocco', progressType: 'places',
  placesTarget: 3, placesCc: 'MA', progress: 0, xp: 600, completed: false, skillGains: [], bonus: [] }, extra);

test('saved and read back: target 1-999, a known country or anywhere; anything else is made safe', () => {
  const app = loadApp();
  const ST = app.ST;
  const s = app.plain(ST.defaultState());
  s.quests.mains = [quest(), quest({ id: 'a', placesTarget: '12', placesCc: '' }),
    quest({ id: 'b', placesTarget: 1e9, placesCc: '"><b>' }), quest({ id: 'c', placesTarget: 'lots', placesCc: 'XX' }),
    quest({ id: 'd', progressType: 'teleport' })];
  const back = app.plain(ST.sanitizeImported(JSON.parse(JSON.stringify(s))));
  const m = back.quests.mains;
  assert.deepEqual(m.map(q => [q.progressType, q.placesTarget, q.placesCc]), [
    ['places', 3, 'MA'], ['places', 12, ''], ['places', ST.PLACES_TARGET_MAX, ''], ['places', 5, ''], ['percent', 3, 'MA']]);
  assert.deepEqual(app.plain(ST.sanitizeImported(back)), back);
});

test('the bar follows the MAP (in its country), the reward waits for Complete and comes once; a place removed later changes nothing done', () => {
  const { ST } = loadApp();
  const s = ST.app.state = ST.defaultState();
  const q = quest();
  s.quests.mains.push(q);
  s.map.cities.push(city('Marrakesh', 'MA'), city('Paris', 'FR'));
  assert.equal(ST.syncPlacesQuests(), true);
  assert.deepEqual([ST.placesCount(q), q.progress, ST.mainReady(q)], [1, 33, false]);
  assert.equal(ST.syncPlacesQuests(), false);                          // nothing moved
  s.map.cities.push(city('Fes', 'MA'));
  s.map.regions.push(region('Souss', 'MA'));
  ST.syncPlacesQuests();
  assert.deepEqual([q.progress, ST.mainReady(q)], [100, true]);
  const before = s.lifetimeXp;
  assert.ok(ST.completeMain(q));
  assert.equal(s.lifetimeXp, before + 600);
  assert.equal(ST.completeMain(q), null);
  s.map.cities = []; s.map.regions = [];
  assert.equal(ST.syncPlacesQuests(), false);                          // completed: left alone
  const anywhere = quest({ id: 'pw', placesCc: '', placesTarget: 2 });
  s.quests.mains.push(anywhere);
  s.map.cities.push(city('Paris', 'FR'));
  assert.equal(ST.placesProgress(anywhere), 50);
});

test('QUESTS: the bar says how many, where, and that it follows the MAP; the form offers the type', () => {
  const app = loadApp({ files: FILES.events });
  const ST = app.ST;
  const s = ST.app.state = ST.defaultState();
  s.quests.mains.push(quest());
  s.map.cities.push(city('Fes', 'MA'), city('Paris', 'FR'));
  ST.syncPlacesQuests();
  ST.render.renderQuests();
  const html = app.elements['tab-quests'].innerHTML;
  assert.match(html, /<span class="streak-days">1 \/ 3 PLACES<\/span><div class="streak-bar"><div class="streak-fill" style="width:33%"><\/div><\/div><span class="progress-pct">33%<\/span>/);
  assert.match(html, /<span>Follows your MAP, in Morocco ·<\/span>/);
  assert.match(html, /data-action="main-complete" data-id="pq" hidden/);
  assert.match(html, /<option value="places">Places to reveal<\/option>/);
  assert.match(html, /<select id="new-main-cc" aria-label="Where"><option value="">anywhere<\/option><option value="AF">Afghanistan<\/option>/);
  assert.match(html, /<option value="MA">Morocco<\/option>/);
});
