// VITALS, the chem-free streak, the urge decoder and stat training (the
// owner's own design, brought over from their in-Claude version): every
// reward once, through award() and the history; nothing farmed by editing
// a date; every document brought back safe; the old page's backup added
// without touching anything else.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

const app = loadApp();
const ST = app.ST;
const fresh = () => { ST.app.state = ST.defaultState(); return ST.app.state; };
const types = s => Array.from(s.history, e => e.type);
const sumXp = s => s.history.reduce((sum, e) => sum + e.xp, 0);
const load = doc => ST.sanitizeImported(JSON.parse(JSON.stringify(doc)));

// ---------- training ----------
test('a daily tagged with a stat trains it: every 300 XP is one point, recorded', () => {
  const s = fresh();
  app.setNow('2026-10-09T12:00:00');
  const d = s.quests.daily[0];                       // Move your body: 20 XP
  d.stat = 'STR';
  let raised = [];
  for (let i = 0; i < 15; i++) {
    d.lastDate = '2020-1-1';
    raised = raised.concat(Array.from(ST.completeDaily(d).trained));
  }
  assert.deepEqual(raised, ['STR']);                  // 15 x 20 = 300
  assert.equal(s.stats.STR, 5);
  assert.equal(s.statTrain.STR, 0);
  assert.ok(types(s).includes('SPECIAL_TRAINED'));
  assert.deepEqual(app.plain(s.history.find(e => e.type === 'SPECIAL_TRAINED').data), { stat: 'STR', value: 5 });
  assert.equal(sumXp(s), s.lifetimeXp);
  // an untagged daily trains nothing and says nothing about it
  assert.equal('trained' in ST.completeDaily(s.quests.daily[1]), false);
});

test('training: a big amount gives several points, a stat at 10 keeps its training full', () => {
  const s = fresh();
  assert.deepEqual(Array.from(ST.trainStat('END', 650)), ['END', 'END']);
  assert.deepEqual([s.stats.END, s.statTrain.END], [5, 50]);
  s.stats.AGI = 10;
  assert.deepEqual(Array.from(ST.trainStat('AGI', 900)), []);
  assert.deepEqual([s.stats.AGI, s.statTrain.AGI], [10, ST.TRAIN_PER_POINT]);
  const before = JSON.stringify(s);
  ST.trainStat('LCK', 500); ST.trainStat('STR', -5); ST.trainStat('STR', 'x');
  assert.equal(JSON.stringify(s), before);
});

// ---------- VITALS ----------
test('the check-in: paid once a day (15 XP, trains INT); levels, pulse and counters within limits', () => {
  const s = fresh();
  app.setNow('2026-10-09T08:00:00');
  assert.equal(ST.vitalsToday(false), null);          // nothing until the first change
  assert.equal(ST.setVital('mood', '8'), 8);
  assert.equal(ST.setVital('sleep', 14), 10);
  assert.equal(ST.setVital('craving', -2), 0);
  assert.equal(ST.setVital('mood', ''), null);        // empty: nothing changes
  assert.equal(ST.setVital('luck', 5), null);
  assert.equal(ST.setPulse('61'), 61);
  assert.equal(ST.setPulse('500'), null);
  assert.equal(ST.setPulse(''), null);
  assert.equal(ST.stepRads('N', 1), 1);
  assert.equal(ST.stepRads('T', -1), 0);
  const r = ST.logVitals();
  assert.deepEqual([r.xp, Array.from(r.trained)], [15, []]);
  assert.equal(ST.logVitals(), null);                 // once a day
  assert.equal(s.statTrain.INT, 15);
  ST.setVital('energy', 2);                           // after the check-in: kept, unpaid
  const e = app.plain(ST.vitalsToday(false));
  assert.deepEqual(e, { date: '2026-10-9', logged: true, energy: 2, mood: 8, hunger: 5, tension: 5, sleep: 10, craving: 0,
    pulse: null, radN: 1, radT: 0 });
  assert.deepEqual(app.plain(types(s)), ['VITALS_CHECKIN']);
  app.setNow('2026-10-10T08:00:00');                  // a new day: a new entry, a new check-in
  assert.equal(ST.vitalsToday(false), null);
  assert.equal(ST.logVitals().xp, 15);
  assert.deepEqual(Array.from(ST.lastVitals(7), v => v.date), ['2026-10-10', '2026-10-9']);
});

// ---------- the chem-free streak ----------
test('the streak: day 1 on the start date, milestones paid once, never twice by editing the start', () => {
  const s = fresh();
  app.setNow('2026-10-09T12:00:00');
  assert.equal(ST.cleanDay(), null);
  assert.equal(ST.setCleanStart('2026-10-10'), false);      // not in the future
  assert.equal(ST.setCleanStart('nonsense'), false);
  assert.equal(ST.setCleanStart('2026-10-09'), true);       // the date box's format
  assert.deepEqual([ST.cleanDay(), ST.cleanFullDays()], [1, 0]);
  assert.deepEqual(app.plain(ST.claimCleanMilestones()), []);
  ST.setCleanStart('2026-09-24');                           // corrected: 15 full days
  assert.deepEqual(app.plain(ST.claimCleanMilestones()).map(m => [m.days, m.xp]), [[7, 150], [14, 300]]);
  assert.deepEqual(app.plain(ST.claimCleanMilestones()), []);
  ST.setCleanStart('2026-10-05');                           // moved back and forth: nothing paid again
  ST.setCleanStart('2026-09-24');
  assert.deepEqual(app.plain(ST.claimCleanMilestones()), []);
  assert.deepEqual(app.plain(ST.nextCleanMilestone()), { days: 30, xp: 600 });
  assert.deepEqual(app.plain(types(s)), ['CLEAN_MILESTONE', 'CLEAN_MILESTONE']);
  assert.equal(sumXp(s), 450);
});

test('a lapse keeps the days done, restarts tomorrow, and the next run earns its milestones again', () => {
  const s = fresh();
  app.setNow('2026-10-09T12:00:00');
  assert.equal(ST.logLapse(), false);                       // no run started
  ST.setCleanStart('2026-09-24');
  ST.claimCleanMilestones();
  assert.equal(ST.logLapse(), true);
  assert.deepEqual(app.plain(s.chems), { cleanSince: '2026-10-10', best: 15, totalClean: 15, claimed: [], lapses: ['2026-10-9'] });
  assert.deepEqual([ST.cleanDay(), ST.cleanFullDays(), ST.cleanTotal(), ST.cleanBest()], [0, 0, 15, 15]);
  ST.logLapse();                                            // a second tap the same day changes nothing
  assert.deepEqual(app.plain(s.chems.lapses), ['2026-10-9']);
  assert.equal(s.chems.totalClean, 15);
  assert.equal(s.lifetimeXp, 450);                          // nothing taken back
  app.setNow('2026-10-17T12:00:00');                        // day 8 of the new run
  assert.deepEqual([ST.cleanDay(), ST.cleanTotal()], [8, 22]);
  assert.deepEqual(app.plain(ST.claimCleanMilestones()).map(m => m.days), [7]);
});

// ---------- the urge decoder ----------
test('urges: paid only once the 20 minutes are over, 3 times a day at most, always logged', () => {
  const s = fresh();
  app.setNow('2026-10-09T12:00:00');
  assert.equal(ST.urgeWon(), null);                         // none running
  ST.startUrge('LONELY');
  assert.equal(ST.urgeLeft(), ST.URGE_MS);
  assert.equal(ST.urgeWon(), null);                         // not before zero
  app.setNow('2026-10-09T12:10:00');
  assert.equal(ST.urgeLeft(), 10 * 60 * 1000);
  app.setNow('2026-10-09T12:20:00');
  assert.equal(ST.urgeLeft(), 0);
  assert.equal(ST.urgeAgain(), true);                       // still strong: another round
  assert.deepEqual([s.urges.active.rounds, ST.urgeLeft()], [2, ST.URGE_MS]);
  app.setNow('2026-10-09T12:40:00');
  const won = app.plain(ST.urgeWon());
  assert.deepEqual([won.xp, won.leveled, won.skillGains], [40, false, [{ skill: 'SURVIVAL', amount: 1 }]]);
  assert.deepEqual(won.entry, { date: '2026-10-9', need: 'LONELY', rounds: 2, outcome: 'won', intensity: 0, trigger: '', copes: [], note: '',
    hour: 12, t: app.context.Date.now() });
  assert.equal(s.urges.active, null);
  for (let i = 0; i < 3; i++) { ST.startUrge('ANGRY'); app.setNow(app.context.Date.now() + ST.URGE_MS); ST.urgeWon(); }
  assert.equal(s.urges.log.length, 4);
  assert.equal(s.history.filter(e => e.type === 'URGE_RESISTED').length, 3);
  assert.equal(app.plain(s.urges.log[3]).need, 'ANGRY');
  ST.startUrge('whatever');
  assert.equal(s.urges.active.need, 'NONE');
  ST.cancelUrge();
  assert.equal(s.urges.active, null);
  assert.equal(sumXp(s), s.lifetimeXp);
});

// ---------- documents ----------
test('the in-Claude version\'s backup: its dates read, junk dropped or brought within limits', () => {
  const s = load({
    stats: { STR: 5, END: 4, CHA: 4, INT: 6, AGI: 2 }, quests: { daily: [{ id: 'v2a', name: 'Walk', xp: 20, stat: 'END' }, { id: 'v2x', name: 'X', xp: 5, stat: 'LCK' }] },
    statTrain: { STR: 120, END: 9999, CHA: 'x', LCK: 50 },
    chems: { cleanSince: '2026-09-20', best: '12', totalClean: -4, claimed: [7, 14, 8, '30'], lapses: ['2026-09-19', 'bad', '2026-09-19'] },
    vitals: [{ date: '2026-10-08', logged: true, energy: 6, mood: 70, pulse: 62, radN: 3, radT: 400 },
      { date: 'yesterday', logged: true }, { date: '2026-10-08', logged: false, energy: 1, pulse: '15' }],
    urges: { active: { start: 'x', need: 'LONELY' }, log: [{ date: '2026-10-01', need: 'BORED', rounds: 0 }, { date: '' }] }
  });
  assert.deepEqual(app.plain(s.statTrain), { STR: 120, END: ST.TRAIN_PER_POINT, CHA: 0, INT: 0, AGI: 0 });
  assert.deepEqual(app.plain(s.quests.daily).map(d => [d.id, d.stat]), [['v2a', 'END'], ['v2x', undefined]]);
  assert.deepEqual(app.plain(s.chems), { cleanSince: '2026-9-20', best: 12, totalClean: 0, claimed: [7, 14, 30], lapses: ['2026-9-19'] });
  assert.deepEqual(app.plain(s.vitals), [{ date: '2026-10-8', logged: false, energy: 1, mood: 5, hunger: 5, tension: 5, sleep: 5, craving: 5,
    pulse: null, radN: 0, radT: 0 }]);                      // one entry a day: the later one
  assert.deepEqual(app.plain(s.urges), { active: null, log: [{ date: '2026-10-1', need: 'NONE', rounds: 1, outcome: 'won', intensity: 0,
    trigger: '', copes: [], note: '', hour: -1, t: 0 }], copes: app.plain(ST.defaultState().urges.copes) });   // logged then: ridden out
});

test('a save from before VITALS gets none of it yet, and a current one comes back identical', () => {
  const old = load({ stats: { STR: 4 }, quests: {}, chems: [], urges: 'x' });
  assert.deepEqual(app.plain(old.vitals), []);
  assert.deepEqual(app.plain(old.chems), { cleanSince: null, best: 0, totalClean: 0, claimed: [], lapses: [] });
  assert.deepEqual(app.plain(old.urges), { active: null, log: [], copes: app.plain(ST.defaultState().urges.copes) });
  assert.deepEqual(app.plain(old.statTrain), { STR: 0, END: 0, CHA: 0, INT: 0, AGI: 0 });
  const s = fresh();
  app.setNow('2026-10-09T12:00:00');
  s.quests.daily[0].stat = 'CHA';
  ST.setVital('mood', 7); ST.setPulse(58); ST.logVitals();
  ST.setCleanStart('2026-09-01'); ST.claimCleanMilestones();
  ST.startUrge('TIRED');
  const back = load(s);
  assert.equal(JSON.stringify(back), JSON.stringify(s));
  assert.equal(JSON.stringify(load(back)), JSON.stringify(back));     // idempotent
});

// ---------- the old terminal's data ----------
const OLD = {
  level: 7, xp: 300, xpToNext: 3400, lifetimeXp: 9000,
  stats: { STR: 5, END: 4, CHA: 4, INT: 6, AGI: 2 },
  skills: { SCIENCE: 21, SPEECH: 42, SURVIVAL: 25, COOKING: 8, FINANCE: 17, MUSIC: 35, BUSINESS: 5 },
  quests: {
    main: { title: 'Obtain 5 Caps', progress: 0, xp: 1000, completed: false, skillGains: [], bonus: [] },
    side: [{ id: 's1', name: 'Pass the certification', xp: 150, done: false }, { id: 'v2s1', name: 'Visit the Doc', xp: 200, done: false },
      { id: 'xdone', name: 'Old done', xp: 100, done: true }, { id: 'xdup', name: 'build up SAVINGS', xp: 100, done: false }],
    daily: [{ id: 'd1', name: 'Move your body', xp: 20, lastDate: '2026-10-9' },
      { id: 'v2a', name: 'Walk 30+ min', xp: 20, lastDate: '2026-10-9', stat: 'END' }]
  },
  inventory: [{ id: 'i9', name: 'Old item', category: 'MISC' }], finances: { holdings: [{ id: 'f1', label: 'USDT', amount: 855.8, rateToCAD: 1.406 }] },
  log: [{ date: 'Oct 1, 2026', text: 'old', xp: 5, reason: 'x' }],
  statTrain: { STR: 120, END: 260, CHA: 0, INT: 45, AGI: 0 },
  chems: { cleanSince: '2026-09-20', best: 12, totalClean: 30, claimed: [7, 14], lapses: ['2026-09-19'] },
  vitals: [{ date: '2026-10-08', logged: true, energy: 6, mood: 7, hunger: 4, tension: 3, sleep: 8, craving: 2, pulse: 62, radN: 3, radT: 1 }],
  urges: { active: { start: 1, need: 'LONELY', rounds: 1 }, log: [{ date: '2026-10-01', need: 'TIRED', rounds: 2 }] },
  seeds: { v2: true }
};

test('the old page\'s backup: only its VITALS, streak, urges, training and missing quests are added, once', () => {
  const s = fresh();
  app.setNow('2026-10-09T12:00:00');
  s.vitals.push({ date: '2026-10-8', logged: true, energy: 9, mood: 9, hunger: 9, tension: 9, sleep: 9, craving: 9, pulse: null, radN: 0, radT: 0 });
  const keep = JSON.stringify([s.level, s.xp, s.lifetimeXp, s.stats, s.skills, s.inventory, s.finances, s.log, s.quests.mains, s.history]);
  const src = load(OLD);
  const added = app.plain(ST.mergeOld(s, src));
  assert.deepEqual(added, { vitals: 0, streak: true, lapses: 1, urges: 1, dailies: 1, side: 1, training: true });
  assert.equal(JSON.stringify([s.level, s.xp, s.lifetimeXp, s.stats, s.skills, s.inventory, s.finances, s.log, s.quests.mains, s.history]), keep);
  assert.equal(s.vitals[0].mood, 9);                        // this app's own day wins
  assert.deepEqual(app.plain(s.chems), { cleanSince: '2026-9-20', best: 12, totalClean: 30, claimed: [], lapses: ['2026-9-19'] });
  assert.equal(s.urges.active, null);                       // a timer from the other page isn't brought over
  assert.deepEqual(app.plain(s.statTrain), { STR: 120, END: 260, CHA: 0, INT: 45, AGI: 0 });
  const walk = s.quests.daily.find(d => d.id === 'v2a');
  assert.deepEqual([walk.stat, walk.lastDate], ['END', null]);       // ready for today here
  assert.deepEqual(app.plain(s.quests.side.map(q => q.id)), ['s1', 's2', 's3', 's4', 'v2s1']);   // same id or objective: skipped
  assert.deepEqual(app.plain(ST.mergeOld(s, src)), { vitals: 0, streak: false, lapses: 0, urges: 0, dailies: 0, side: 0, training: false });
  // the milestones reached are paid here, now
  assert.deepEqual(app.plain(ST.claimCleanMilestones()).map(m => m.days), [7, 14]);
});

// ---------- the screens ----------
function screens(setup) {
  const a = loadApp({ files: FILES.vitals });
  a.setNow('2026-10-09T12:00:00');
  a.ST.app.state = a.ST.defaultState();
  setup(a.ST, a.ST.app.state, a);
  a.ST.render.renderStatus();
  a.ST.vitals.render();
  a.ST.vitals.stop();                                       // no clock or alarm left ticking
  return { status: a.elements['tab-status'].innerHTML, vitals: a.elements['tab-vitals'].innerHTML };
}
const EVIL = '"><img src=x onerror=alert(1)>';

test('the streak card (on VITALS now): set the start, the day and the next milestone, after a lapse, asking first', () => {
  const empty = screens(() => {});
  assert.match(empty.vitals, /Set the first chem-free day of this run\.[\s\S]*id="streak-date" max="2026-10-09" value="2026-10-09"/);
  assert.doesNotMatch(empty.status, /streak-card/);                      // moved off STATUS
  assert.match(empty.status, /Chem-free days, all runs/);                // its total stays there
  const running = screens(ST => { ST.setCleanStart('2026-09-24'); ST.claimCleanMilestones(); }).vitals;
  assert.match(running, /DAY 16<\/div>/);
  assert.match(running, /15 full days done\. Next: 30 days, \+600 XP, 15 to go\./);
  assert.match(running, /data-vital="lapse-ask"/);
  assert.doesNotMatch(running, /Tomorrow:/);
  const asking = screens((ST, s, a) => { ST.setCleanStart('2026-09-24'); a.ST.app.confirmLapse = true; }).vitals;
  assert.match(asking, /Log a lapse today\?[\s\S]*data-vital="lapse-yes"/);
  const restart = screens(ST => { ST.setCleanStart('2026-09-24'); ST.logLapse(); }).vitals;
  assert.match(restart, /RESTART \/\/ TOMORROW[\s\S]*The 15 chem-free days behind you still count\./);
});

test('VITALS: the sliders, the check-in button, the urge decoder\'s steps and the table', () => {
  const empty = screens(() => {}).vitals;
  assert.equal((empty.match(/class="vital-range"/g) || []).length, 6);
  assert.match(empty, /data-vital="vitals-log">Log check-in \+15 XP</);
  assert.match(empty, /data-vital="urge-start" data-key="HUNGRY"/);
  assert.match(empty, /href="tel:18002652626"/);
  assert.match(empty, /No entries yet\./);
  const logged = screens(ST => { ST.setVital('mood', 8); ST.setPulse(61); ST.logVitals(); }).vitals;
  assert.match(logged, /CHECK-IN · DONE ✓ · energy 5 · sleep 5 · craving 5/);
  assert.match(logged, /<td>Oct 9<\/td><td>5<\/td><td>8<\/td>/);
  assert.match(logged, /<tr class="avg"><td>AVG<\/td><td>5\.0<\/td><td>8\.0<\/td>/);
  const running = screens(ST => { ST.startUrge('TIRED'); }).vitals;
  assert.match(running, /Lie down for 20 minutes[\s\S]*id="urge-clock" role="timer" aria-label="Time left">20:00</);
  const zero = screens((ST, s, a) => { ST.startUrge('TIRED'); a.setNow('2026-10-09T12:20:00'); }).vitals;
  assert.match(zero, /data-vital="urge-won">Rode it out<span class="btn-sub">\+40 XP · \+1 SURVIVAL<\/span></);
  assert.match(zero, /data-vital="urge-again">Still strong</);
});

test('hostile values that skipped sanitizeImported stay inert on both screens', () => {
  const html = screens((ST, s) => {
    s.chems.totalClean = EVIL; s.chems.best = EVIL;
    s.vitals = [{ date: EVIL, logged: true, energy: EVIL, mood: 3, hunger: 3, tension: 3, sleep: 3, craving: 3, pulse: EVIL, radN: EVIL, radT: 1 }];
    s.urges = { active: { start: Date.now(), need: EVIL, rounds: EVIL }, log: [] };
    s.statTrain.STR = EVIL;
  });
  const all = html.status + html.vitals;
  assert.doesNotMatch(all, /<img|onerror=/);
  assert.match(html.vitals, /Then it is the habit loop firing/);          // an unknown need: the default tip
});

test('helpers: the clock and the date box\'s format', () => {
  const a = loadApp({ files: FILES.vitals });
  assert.equal(a.ST.vitals.clockText(20 * 60 * 1000), '20:00');
  assert.equal(a.ST.vitals.clockText(61500), '01:02');
  assert.equal(a.ST.vitals.clockText(-5), '00:00');
  assert.equal(a.ST.vitals.boxDate('2026-9-4'), '2026-09-04');
  assert.equal(a.ST.vitals.boxDate('nope'), '');
});

test('the VITALS tab key\'s light: check-in due, an urge timer running, then over; none once checked in', () => {
  const a = loadApp({ files: FILES.vitals });
  const ST2 = a.ST;
  a.setNow('2026-10-09T12:00:00');
  ST2.app.state = ST2.defaultState();
  assert.equal(ST2.vitals.alertState(), 'due');
  ST2.logVitals();
  assert.equal(ST2.vitals.alertState(), '');
  ST2.startUrge('ANGRY');
  assert.equal(ST2.vitals.alertState(), 'urge');
  a.setNow('2026-10-09T12:20:00');
  assert.equal(ST2.vitals.alertState(), 'over');
  ST2.urgeWon();
  assert.equal(ST2.vitals.alertState(), '');
  a.setNow('2026-10-10T08:00:00');                          // a new day: the next check-in
  assert.equal(ST2.vitals.alertState(), 'due');
});
