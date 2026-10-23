// The player's numbers always add up, whatever they do and in whatever
// order. 1,200 actions picked at random (from a fixed seed: a failure comes
// back the same; ACTIONS_SEED and ACTIONS_COUNT try others), through the
// app's own functions, with time going by: check-ins, RADS, dailies, side
// and main quests and their bonuses, urges ridden out, given in to or
// dropped, notes, trials, streaks and lapses, books, the journal, sales,
// perks, SPECIAL points, places. After each one:
// - every XP is in the history: lifetime XP grew by exactly the history's
//   new XP (the rule that every reward goes through award());
// - the level, the XP in it and the next threshold are what that lifetime
//   XP gives from the start (+400 a level);
// - skills stay 0-100, SPECIAL 1-10, points never below 0;
// - no number anywhere in the state is NaN or Infinity;
// and every 25 actions the import gate takes the state back unchanged
// (what the app saves is always what it would accept).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES, seededRandom } = require('./helpers');

const COUNT = Number(process.env.ACTIONS_COUNT) || 1200;
const SEED = Number(process.env.ACTIONS_SEED) || 20261023;

function badNumbers(value, path, out) {
  if (typeof value === 'number' && !isFinite(value)) out.push(path);
  else if (value && typeof value === 'object') Object.keys(value).forEach(k => badNumbers(value[k], path + '.' + k, out));
  return out;
}

test('random actions: XP, levels, skills and points always add up, and the state stays import-clean', () => {
  const app = loadApp({ files: FILES.vitals, now: '2026-10-01T08:00:00' });
  const ST = app.ST;
  const s = ST.app.state = ST.defaultState();
  const rand = seededRandom(SEED);
  const pick = list => list[Math.floor(rand() * list.length)];
  const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
  let clock = new Date('2026-10-01T08:00:00').getTime();
  const later = ms => { clock += ms; app.setNow(clock); };
  const start = { level: s.level, xp: s.xp, xpToNext: s.xpToNext, lifetime: s.lifetimeXp || 0 };
  const historyXp = () => s.history.reduce((sum, e) => sum + e.xp, 0);
  const history0 = historyXp();
  let books = 0, places = 0, items = 0;

  const ACTIONS = {
    time: () => later(int(1, 30) * 3600e3),
    checkin: () => { ST.setVital(pick(ST.VITAL_KEYS), int(0, 10)); if (rand() < 0.5) ST.setPulse(int(40, 120)); if (rand() < 0.7) ST.logVitals(); },
    rads: () => ST.stepRads(pick(['N', 'T']), pick([1, 1, -1])),
    daily: () => ST.completeDaily(pick(s.quests.daily)),
    side: () => s.quests.side.length && ST.completeSide(pick(s.quests.side)),
    main: () => s.quests.mains.length && ST.completeMain(pick(s.quests.mains)),
    bonus: () => { const m = pick(s.quests.mains); if (m && m.bonus && m.bonus.length) ST.completeBonus(pick(m.bonus), m); },
    urge: () => {
      ST.startUrge(pick(ST.URGE_NEEDS));
      if (rand() < 0.7) ST.setUrgeDetail('intensity', int(0, 10));
      if (rand() < 0.5) ST.setUrgeDetail('trigger', pick(ST.URGE_TRIGGERS));
      const r = rand();
      if (r < 0.15) return ST.cancelUrge();
      later(r < 0.4 ? int(1, 60) * 1000 : ST.URGE_MS + 1000);
      const out = r < 0.6 ? ST.urgeLapsed() : ST.urgeWon();
      const e = out && (out.entry || out);
      if (e && e.t && rand() < 0.5) ST.noteUrge(e.t, 'note');
      if (rand() < 0.2) ST.cancelUrge();
    },
    trial: () => ST.logTrial(pick(['pushups', 'plank', 'squats', 'km', 'distance']), pick([int(1, 80), int(10, 600), rand() * 20])),
    streak: () => {
      if (s.streaks.length < 3 && rand() < 0.5) ST.addStreak('Focus', ST.todayStr());
      else if (s.streaks.length) ST.logLapse(pick(s.streaks).id);
    },
    clean: () => ST.setCleanStart(ST.todayStr()),
    book: () => ST.readBook('Book ' + (++books), 'Author', pick(ST.SKILL_KEYS), int(1, 3)),
    journal: () => ST.addLogEntry({ date: ST.todayDisplay(), text: 'A day', xp: 0, reason: '' }),
    sell: () => { const id = 'it' + (++items); s.inventory.push({ id, name: 'Thing', category: 'SELL', price: 10 }); ST.sellItem(id, int(1, 200)); },
    perk: () => { if (s.unspentPerkPoints > 0) { const open = ST.PERKS.filter(p => ST.perkOpen(p.id)); if (open.length) ST.takePerk(pick(open).id); } },
    special: () => ST.spendSpecialPoint(pick(ST.STAT_KEYS)),
    place: () => ST.discoverPlace('c:' + (++places), int(10, 100), { name: 'Place ' + places })
  };
  const names = Object.keys(ACTIONS);
  const done = [];
  for (let i = 0; i < COUNT; i++) {
    const name = pick(names);
    done.push(name);
    const where = 'seed ' + SEED + ', action ' + i + ' (' + name + '), last: ' + done.slice(-6).join(' ');
    assert.doesNotThrow(() => ACTIONS[name](), where);
    if (s.history.length < 2000) {                             // HISTORY_MAX: older events drop out after
      assert.equal(s.lifetimeXp - start.lifetime, historyXp() - history0, 'XP outside the history, ' + where);
    }
    let x = start.xp + (s.lifetimeXp - start.lifetime), level = start.level, next = start.xpToNext;
    while (x >= next) { x -= next; level++; next += 400; }
    assert.deepEqual({ level: s.level, xp: s.xp, xpToNext: s.xpToNext }, { level, xp: x, xpToNext: next }, where);
    ST.SKILL_KEYS.forEach(k => assert.ok(s.skills[k] >= 0 && s.skills[k] <= 100, k + ' ' + s.skills[k] + ', ' + where));
    ST.STAT_KEYS.forEach(k => assert.ok(s.stats[k] >= 1 && s.stats[k] <= 10, k + ' ' + s.stats[k] + ', ' + where));
    assert.ok(s.unspentPerkPoints >= 0 && s.unspentSpecialPoints >= 0, where);
    assert.deepEqual(badNumbers(app.plain(s), 's', []), [], where);
    if (i % 25 === 24) {
      const doc = app.plain(s);
      assert.deepEqual(app.plain(ST.sanitizeImported(JSON.parse(JSON.stringify(doc)))), doc, 'the import gate changes it, ' + where);
    }
  }
  // what the run covered, so it can't pass by doing nothing
  assert.ok(s.level > start.level + 2, 'levels gained: ' + (s.level - start.level));
  assert.ok(s.urges.log.length > 20 && s.vitals.length > 20 && s.trials.log.length > 20 && s.history.length > 300);
});
