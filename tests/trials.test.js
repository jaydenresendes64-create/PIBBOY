// TRIALS (VITALS → TRIALS): tests to repeat about once a week. A record is
// the best result; one result a trial a day is paid (a record 50 XP, else
// 15), and that XP trains the trial's stat; typed times are read as m:ss;
// the player's own trials and hidden built-in ones; every document brought
// back safe; the screen escapes what it shows.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

const app = loadApp();
const ST = app.ST;
const fresh = () => { ST.app.state = ST.defaultState(); return ST.app.state; };
const load = doc => ST.sanitizeImported(JSON.parse(JSON.stringify(doc)));

test('the built-in trials, each with how it is measured and the stat it trains', () => {
  fresh();
  assert.deepEqual(app.plain(ST.trialList()).map(t => [t.id, t.kind, t.unit, t.better, t.timer, t.stat]), [
    ['pushups', 'reps', 'reps', 'more', 'counter', 'STR'],
    ['plank', 'hold', 'seconds', 'more', 'stopwatch', 'END'],
    ['squats', 'timed', 'reps', 'more', 'countdown', 'AGI'],
    ['km', 'fastest', 'seconds', 'less', 'stopwatch', 'END']]);
  assert.equal(ST.trialById('squats').seconds, 60);
  assert.equal(ST.trialById('nope'), null);
});

test('a record pays 50 XP, another result 15, once a trial a day; the XP trains the trial\'s stat', () => {
  const s = fresh();
  app.setNow('2026-10-10T09:00:00');
  assert.deepEqual(app.plain(ST.trialPreview('pushups', 20)), { value: 20, record: true, xp: 50 });
  const first = ST.logTrial('pushups', 20);
  assert.deepEqual([first.record, first.reward.xp, first.entry.xp], [true, 50, 50]);
  const again = ST.logTrial('pushups', 25);                    // same day: kept, a record, unpaid
  assert.deepEqual([again.record, again.reward, again.entry.xp], [true, null, 0]);
  assert.equal(ST.trialBest('pushups'), 25);
  app.setNow('2026-10-17T09:00:00');
  const slower = ST.logTrial('pushups', 22);                   // not a record: 15 XP
  assert.deepEqual([slower.record, slower.reward.xp], [false, 15]);
  assert.equal(s.statTrain.STR, 65);
  assert.deepEqual(app.plain(s.history.map(e => [e.type, e.xp, e.data.record])), [['TRIAL_DONE', 50, 1], ['TRIAL_DONE', 15, 0]]);
  assert.equal(s.history.reduce((sum, e) => sum + e.xp, 0), s.lifetimeXp);
  assert.equal(ST.logTrial('pushups', 0), null);               // not a result
  assert.equal(ST.logTrial('pushups', 'many'), null);
  assert.equal(ST.logTrial('nope', 10), null);
});

test('a time: lower is better, typed as m:ss or seconds, shown as m:ss', () => {
  fresh();
  app.setNow('2026-10-10T09:00:00');
  assert.equal(ST.parseTrialValue('km', '6:42'), 402);
  assert.equal(ST.parseTrialValue('km', '402'), 402);
  assert.equal(ST.parseTrialValue('km', '1:02:05'), 3725);
  assert.equal(ST.parseTrialValue('km', '6:75'), null);
  assert.equal(ST.parseTrialValue('km', 'fast'), null);
  assert.equal(ST.parseTrialValue('pushups', '1:30'), null);   // reps aren't a time
  assert.equal(ST.parseTrialValue('pushups', ' 32 '), 32);
  assert.deepEqual(['km', 'plank', 'pushups'].map(id => ST.trialValueText(id, 3725)), ['1:02:05', '1:02:05', '3725']);
  assert.equal(ST.trialValueText('plank', 45), '0:45');
  ST.logTrial('km', 420);
  app.setNow('2026-10-17T09:00:00');
  assert.equal(ST.logTrial('km', 400).record, true);
  assert.equal(ST.trialBest('km'), 400);
  assert.equal(ST.trialGoal('km'), 388);                       // 3% faster
  ST.logTrial('plank', 60);
  assert.equal(ST.trialGoal('plank'), 65);                     // at least 5 s longer
  ST.logTrial('pushups', 40);
  assert.equal(ST.trialGoal('pushups'), 42);                   // 5% more
  assert.equal(ST.trialGoal('squats'), null);                  // never tried
});

test('due: never tried, or no result for 7 days', () => {
  fresh();
  app.setNow('2026-10-10T09:00:00');
  assert.equal(ST.trialsDue(), 4);
  ST.logTrial('plank', 50);
  assert.equal(ST.trialDue('plank'), false);
  app.setNow('2026-10-16T09:00:00');
  assert.equal(ST.trialDue('plank'), false);
  app.setNow('2026-10-17T09:00:00');
  assert.equal(ST.trialDue('plank'), true);
});

test('the timer: a 3-2-1, then the seconds it ran; one at a time', () => {
  const s = fresh();
  app.setNow('2026-10-10T09:00:00');
  assert.equal(ST.trialElapsed(), null);
  ST.startTrial('plank');
  assert.equal(ST.trialElapsed(), -3000);
  app.setNow('2026-10-10T09:01:35');                           // 92 s after the 3-2-1
  assert.equal(ST.stopTrial(), 92);
  assert.equal(s.trials.active, null);
  ST.startTrial('km');
  assert.equal(ST.stopTrial(), 0);                             // stopped during the 3-2-1
  assert.equal(ST.startTrial('nope'), null);
});

test('the player\'s own trials, built-in ones hidden, and results removed: what they paid stays', () => {
  const s = fresh();
  app.setNow('2026-10-10T09:00:00');
  const mine = ST.addTrial('  Pull-ups  ', 'reps', 'STR');
  assert.deepEqual([mine.name, mine.kind, mine.stat, mine.custom, mine.what], ['Pull-ups', 'reps', 'STR', true, 'Most reps in one set']);
  assert.equal(ST.addTrial('', 'reps', 'STR'), null);
  assert.equal(ST.addTrial('Odd', 'juggling', 'LCK').kind, 'reps');
  ST.logTrial(mine.id, 8);
  assert.equal(ST.removeTrial('squats'), true);                // hidden, results kept
  assert.deepEqual(app.plain(ST.trialList().map(t => t.id)).slice(0, 3), ['pushups', 'plank', 'km']);
  ST.showTrial('squats');
  assert.equal(ST.trialList().length, 6);
  ST.logTrial('plank', 70);
  const t = s.trials.log.find(r => r.id === 'plank').t;
  assert.equal(ST.removeTrialResult('plank', t), true);
  assert.equal(ST.trialBest('plank'), null);
  assert.equal(ST.removeTrial(mine.id), true);                 // the player's own: gone with its results
  assert.equal(s.trials.log.some(r => r.id === mine.id), false);
  assert.equal(s.lifetimeXp, 100);                             // 8 pull-ups and the plank: their XP stays
  for (let i = 0; i < 20; i++) ST.addTrial('T' + i, 'hold', 'END');
  assert.equal(s.trials.custom.length, 12);                    // at most 12 of one's own
});

test('documents: a save from before TRIALS, a current one identical, junk dropped or brought within limits', () => {
  const old = load({ stats: { STR: 4 }, quests: {} });
  assert.deepEqual(app.plain(old.trials), { custom: [], hidden: [], log: [], active: null });
  const s = fresh();
  app.setNow('2026-10-10T09:00:00');
  ST.logTrial('pushups', 30);
  const mine = ST.addTrial('Burpees', 'timed', 'AGI');
  ST.logTrial(mine.id, 21);
  ST.removeTrial('km');
  ST.startTrial('plank');
  assert.equal(JSON.stringify(load(s)), JSON.stringify(s));
  const junk = load({ stats: {}, quests: {}, trials: {
    custom: [{ id: 'pushups', name: 'Clash', kind: 'reps', stat: 'STR' }, { id: '"><x', name: '', kind: 'nope', stat: 'LCK' }],
    hidden: ['plank', 'nope', 'plank'],
    log: [{ id: 'pushups', date: '2026-10-09', value: '25', xp: -5, t: 'x' }, { id: 'ghost', date: '2026-10-09', value: 5 },
      { id: 'km', date: 'bad', value: 300 }, { id: 'plank', date: '2026-10-09', value: 999999 }, { id: 'pushups', date: '2026-10-09', value: 0 }],
    active: { id: 'ghost', start: 5 } } });
  assert.equal(junk.trials.custom.length, 1);                  // a built-in id can't be taken
  assert.notEqual(junk.trials.custom[0].id, '"><x');
  assert.deepEqual(app.plain(junk.trials.custom.map(c => [c.name, c.kind, c.stat])), [['Trial', 'reps', 'END']]);
  assert.deepEqual(app.plain(junk.trials.hidden), ['plank']);
  assert.deepEqual(app.plain(junk.trials.log), [{ id: 'pushups', date: '2026-10-9', value: 25, xp: 0, t: 0 },
    { id: 'plank', date: '2026-10-9', value: 86400, xp: 0, t: 0 }]);
  assert.equal(junk.trials.active, null);
});

// ---------- the screen ----------
const EVIL = '"><img src=x onerror=alert(1)>';
function screen(setup) {
  const a = loadApp({ files: FILES.vitals });
  a.setNow('2026-10-10T09:00:00');
  a.ST.app.state = a.ST.defaultState();
  a.ST.app.vitalsView = 'trials';
  setup(a.ST, a.ST.app.state, a);
  a.ST.vitals.render();
  a.ST.vitals.stop();
  a.ST.trials.stop();
  return a.elements['tab-vitals'].innerHTML;
}

test('TRIALS: the sub-tabs, a card per trial, the record and the next goal, the panel and its question', () => {
  const empty = screen(() => {});
  assert.match(empty, /data-key="trials" aria-pressed="true">TRIALS<span class="sub-count">4 due<\/span>/);
  assert.equal((empty.match(/class="trial-card"/g) || []).length, 4);
  assert.match(empty, /Not tried yet: your first result is your record\./);
  assert.match(empty, /data-trial="add-open"/);
  const done = screen(ST => {
    ST.logTrial('plank', 91);
    ST.app.trialOpen = 'plank';
    ST.app.trialConfirm = { id: 'plank', value: 100 };
  });
  assert.match(done, /RECORD <b>1:31<\/b>/);
  assert.match(done, /Last: 1:31 · Oct 10 · Next goal: 1:36/);
  assert.match(done, /id="trial-clock" role="timer">0:00</);
  assert.match(done, /Save <b>1:40<\/b>\? <span class="trial-new">NEW RECORD<\/span> No XP: today’s for this trial is earned already/);
  assert.match(done, /<ul class="trial-history"><li><span>Oct 10 — 1:31 · \+50 XP<\/span>/);
  const counter = screen(ST => { ST.app.trialOpen = 'pushups'; ST.app.trialCount = { id: 'pushups', n: 7 }; });
  assert.match(counter, /data-trial="count" data-id="pushups" aria-label="One more rep"><span class="trial-tap-n">7<\/span>/);
  assert.match(counter, /id="trial-value" data-id="pushups" inputmode="numeric" autocomplete="off" placeholder="0" value="7"/);
  const squats = screen((ST, s, a) => { ST.app.trialOpen = 'squats'; ST.startTrial('squats'); a.setNow('2026-10-10T09:00:13'); });
  assert.match(squats, /role="timer">0:50</);                // 10 s into the 60
});

test('a hostile name or value stays inert on the TRIALS screen', () => {
  const html = screen((ST, s) => {
    const mine = ST.addTrial(EVIL, 'hold', 'STR');
    s.trials.log.push({ id: mine.id, date: '2026-10-9', value: EVIL, xp: EVIL, t: EVIL });
    ST.app.trialOpen = mine.id;
    ST.app.trialHide = mine.id;
  });
  assert.doesNotMatch(html, /<img/);   // escaped text only: no real tag
  assert.match(html, /&quot;&gt;&lt;img/);
});

test('the clock\'s format', () => {
  const a = loadApp({ files: FILES.vitals });
  assert.deepEqual([0, 9, 60, 92, 600].map(a.ST.trials.clock), ['0:00', '0:09', '1:00', '1:32', '10:00']);
});

test('the 1 km trial: a button that opens the "PIBBOY Run" shortcut (a Strava run), not on the other trials', () => {
  const km = screen(ST => { ST.app.trialOpen = 'km'; });
  assert.match(km, /<a class="vital-btn hot trial-strava" href="shortcuts:\/\/run-shortcut\?name=PIBBOY%20Run">Run with Strava<\/a>/);
  assert.match(km, /opens your “PIBBOY Run” shortcut \(Shortcuts app\), which starts a Strava run\. Back here, type your 1 km time/);
  const running = screen(ST => { ST.app.trialOpen = 'km'; ST.startTrial('km'); });
  assert.doesNotMatch(running, /trial-strava/);                  // the stopwatch is running: Stop and Cancel only
  const plank = screen(ST => { ST.app.trialOpen = 'plank'; });
  assert.doesNotMatch(plank, /trial-strava|shortcuts:/);
});
