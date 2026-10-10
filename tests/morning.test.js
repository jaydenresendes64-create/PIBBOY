// The morning path (js/vitals.js): VITALS' cards in the order that matters
// today, the sliders starting from the last check-in, the folded check-in's
// field report and next step, and "Check-in first" (some tabs wait).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

const EVIL = '"><img src=x onerror=alert(1)>';

function app(setup) {
  const a = loadApp({ files: FILES.vitals });
  a.setNow('2026-10-10T08:00:00');
  a.ST.app.state = a.ST.defaultState();
  if (setup) setup(a.ST, a.ST.app.state, a);
  return a;
}
function vitals(a) {
  a.ST.vitals.render();
  a.ST.vitals.stop();
  a.ST.trials.stop();
  return a.elements['tab-vitals'].innerHTML;
}
// A check-in logged on an earlier day.
function logOn(a, day, levels) {
  a.setNow(day + 'T08:00:00');
  Object.keys(levels || {}).forEach(k => a.ST.setVital(k, levels[k]));
  a.ST.logVitals();
  a.setNow('2026-10-10T08:00:00');
}

test('the cards\' order: the check-in first, the urge decoder after a high craving or while a timer runs, the streak the day before a milestone', () => {
  const fresh = app();
  assert.deepEqual(fresh.plain(fresh.ST.vitals.order()), ['checkin', 'streak', 'urge']);

  const craving = app((ST, s, a) => logOn(a, '2026-10-09', { craving: 7 }));
  assert.deepEqual(craving.plain(craving.ST.vitals.order()), ['urge', 'checkin', 'streak']);
  const html = vitals(craving);
  assert.ok(html.indexOf('id="urge-card"') < html.indexOf('Today’s check-in'));
  assert.ok(html.indexOf('Today’s check-in') < html.indexOf('streak-card'));
  craving.ST.setVital('craving', 2);
  craving.ST.logVitals();                                       // today's craving is low: back to normal
  assert.equal(craving.ST.vitals.order()[0], 'checkin');

  const old = app((ST, s, a) => logOn(a, '2026-10-07', { craving: 9 }));     // not yesterday's
  assert.equal(old.ST.vitals.order()[0], 'checkin');
  const timer = app(ST => ST.startUrge('ANGRY'));
  assert.equal(timer.ST.vitals.order()[0], 'urge');

  // Day 7 (6 full days): the 7-day milestone is tomorrow.
  const soon = app(ST => ST.setCleanStart('2026-10-4'));
  assert.deepEqual(soon.plain(soon.ST.vitals.order()), ['streak', 'checkin', 'urge']);
  assert.match(vitals(soon), /^<div class="sub-tabs">[\s\S]*?<\/div><div class="vital-card streak-card">[\s\S]*Day 7\. Tomorrow: \+150 XP\./);
  const day8 = app(ST => ST.setCleanStart('2026-10-3'));
  assert.equal(day8.ST.vitals.order()[0], 'checkin');
  const restart = app(ST => { ST.setCleanStart('2026-10-4'); ST.logLapse(); });
  assert.equal(restart.ST.vitals.order()[0], 'checkin');
});

test('the sliders start from the last check-in, shown above them; 5 without one', () => {
  const none = vitals(app());
  assert.doesNotMatch(none, /Yesterday|Last check-in/);
  assert.match(none, /id="vr-energy" data-key="energy" min="0" max="10" step="1" value="5"/);

  const a = app((ST, s, a) => logOn(a, '2026-10-09', { energy: 4, sleep: 3, craving: 7, mood: 8 }));
  const html = vitals(a);
  assert.match(html, /Yesterday · energy 4 · sleep 3 · craving 7/);
  assert.match(html, /id="vr-mood" data-key="mood" min="0" max="10" step="1" value="8"/);
  a.ST.setVital('energy', 6);                                    // today's entry: the rest from yesterday
  const today = a.ST.vitalsToday(false);
  assert.deepEqual(a.plain([today.energy, today.mood, today.sleep, today.craving, today.pulse, today.radN]), [6, 8, 3, 7, null, 0]);

  const older = app((ST, s, a) => {
    logOn(a, '2026-10-06', { energy: 2 });
    a.setNow('2026-10-08T08:00:00'); ST.setVital('energy', 9);   // moved, never logged: not a check-in
    a.setNow('2026-10-10T08:00:00');
  });
  assert.match(vitals(older), /Last check-in, Oct 6 · energy 2 · sleep 5 · craving 5/);
  assert.equal(older.ST.lastCheckIn().ago, 4);
});

test('logged: the check-in folds into one line, a field report from the state and the next step', () => {
  const a = app((ST, s) => {
    ST.setCleanStart('2026-9-30');                               // day 11: 10 full days, 4 to 14
    s.quests.daily[0].lastDate = '2026-10-10';                   // 1 of 3 dailies done
    ST.setVital('sleep', 2); ST.setVital('craving', 6);
    ST.logVitals();
  });
  const report = a.ST.vitals.fieldReport();
  assert.equal(report, 'Sleep low. Craving high. INT 5 · TRAIN 15/300. 2 dailies left. 4 trials due. Chem-free day 11 (4 to 14).');
  const html = vitals(a);
  assert.match(html, /CHECK-IN · DONE ✓ · energy 5 · sleep 2 · craving 6/);
  assert.match(html, /FIELD REPORT \/\/<\/span> Sleep low\. Craving high\./);
  assert.match(html, /NEXT: Push-ups <span class="next-kind">trial due<\/span><\/span><button class="vital-btn hot" data-vital="go" data-key="trial" data-id="pushups">Go<\/button>/);
  assert.doesNotMatch(html, /class="vital-range"/);              // folded
  a.ST.app.vitalsEdit = true;                                    // Edit check-in: the sliders again
  assert.match(vitals(a), /class="vital-range"[\s\S]*data-vital="checkin-fold">Done ✓/);

  // Steady, everything done, no run started: a short report.
  const calm = app((ST, s) => {
    s.quests.daily.forEach(d => { d.lastDate = '2026-10-10'; });
    ST.TRIALS.forEach(t => ST.logTrial(t.id, 10));
    ST.logVitals();
  });
  assert.equal(calm.ST.vitals.fieldReport(), 'INT 5 · TRAIN 15/300. Dailies done.');
  assert.equal(calm.ST.vitals.nextStep(), null);
  assert.doesNotMatch(vitals(calm), /NEXT:/);
});

test('the day\'s two counters stay on the folded check-in: a tap on + any time of the day, still logged', () => {
  const a = app(ST => { ST.logVitals(); ST.stepRads('N', 1); ST.stepRads('N', 1); ST.stepRads('T', 1); });
  const html = vitals(a);
  assert.match(html, /CHECK-IN · DONE ✓[\s\S]*?<span>RADS \/\/ type N<\/span>[\s\S]*?<span class="count-num">2<\/span><button class="step-btn" data-vital="rad" data-key="N" data-dir="1"/);
  assert.match(html, /<span>RADS \/\/ type T<\/span>[\s\S]*?<span class="count-num">1<\/span>/);
  assert.match(html, /Tap \+ each time, any time of the day\. It saves on its own\./);
  assert.doesNotMatch(html, /class="vital-range"/);               // still folded
  a.setNow('2026-10-10T22:30:00');                               // the evening: one more
  a.ST.stepRads('N', 1);
  const e = a.ST.vitalsToday(false);
  assert.deepEqual([e.radN, e.radT, e.logged], [3, 1, true]);
  a.setNow('2026-10-11T07:00:00');                               // a new day starts from 0
  a.ST.stepRads('T', 1);
  assert.deepEqual([a.ST.vitalsToday(false).radN, a.ST.vitalsToday(false).radT], [0, 1]);
});

test('the next step: a trial due, else the daily quest left longest', () => {
  const a = app((ST, s) => {
    ST.TRIALS.forEach(t => ST.logTrial(t.id, 10));               // no trial due
    s.quests.daily[0].lastDate = '2026-10-9';
    s.quests.daily[1].lastDate = '2026-10-2';                    // left longest
    s.quests.daily[2].lastDate = '2026-10-10';                   // done today
  });
  assert.deepEqual(a.plain(a.ST.vitals.nextStep()), { kind: 'daily', id: 'd2', name: 'Learn or study something' });
  a.ST.app.state.quests.daily[0].lastDate = null;                // never done: first
  assert.equal(a.ST.vitals.nextStep().id, 'd1');
  a.setNow('2026-10-18T08:00:00');                               // a week on: the trials are due again
  assert.deepEqual(a.plain(a.ST.vitals.nextStep()), { kind: 'trial', id: 'pushups', name: 'Push-ups' });
});

test('check-in first: QUESTS, ITEMS, MAP and LOG wait for the day\'s check-in; STATUS and VITALS never; a setting turns it off', () => {
  const a = app();
  const V = a.ST.vitals;
  assert.deepEqual(['status', 'vitals', 'quests', 'items', 'map', 'log'].map(tab => V.locked(tab)), [false, false, true, true, true, true]);
  a.ST.logVitals();
  assert.equal(V.locked('quests'), false);
  a.setNow('2026-10-11T07:00:00');                               // a new day: waiting again
  assert.equal(V.locked('map'), true);
  V.toggleLock();                                                // Settings: Check-in first: off
  assert.equal(a.localStorage.getItem('status_terminal_checkin_first'), '0');
  assert.equal(V.locked('map'), false);
  V.toggleLock();
  assert.equal(V.locked('map'), true);
  a.localStorage.broken = true;                                  // storage unreadable: never locked
  assert.equal(V.locked('map'), false);
});

test('a tap on a waiting tab doesn\'t open it: a notice says why; once checked in it opens', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const a = loadApp({ files: FILES.events.concat(['js/vitals.js', 'js/trials.js']) });
  a.setNow('2026-10-10T08:00:00');
  const ST = a.ST;
  ST.app.state = ST.defaultState();
  let click = null;
  a.context.document.body.addEventListener = (type, fn) => { if (type === 'click') click = fn; };
  ST.events.setup();
  const opened = [], notices = [];
  ST.render.switchTab = name => opened.push(name);
  ST.render.showNotice = text => notices.push(text);
  const tapTab = name => click({ target: { id: '', closest: sel => (sel === '[data-tab]' ? { getAttribute: () => name } : null) } });

  tapTab('quests');
  tapTab('status');
  assert.deepEqual(opened, ['status']);
  assert.deepEqual(notices, ['Check-in first: VITALS']);
  ST.logVitals();
  tapTab('quests');
  assert.deepEqual(opened, ['status', 'quests']);
});

test('a hostile daily name stays inert in the next step', () => {
  const a = app((ST, s) => {
    ST.TRIALS.forEach(t => ST.logTrial(t.id, 10));
    s.quests.daily = [{ id: 'd1', questName: EVIL, name: EVIL, xp: 10, lastDate: null }];
    ST.logVitals();
  });
  const html = vitals(a);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /NEXT: &quot;&gt;&lt;img/);
});

test('a reward is saved before the screen is drawn: a drawing error can\'t lose the check-in, an urge or a trial', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const a = app();
  const ST = a.ST, clicks = [];
  a.context.document.body.addEventListener = (type, fn) => { if (type === 'click') clicks.push(fn); };
  ST.vitals.init();
  ST.trials.init();
  const saved = [];
  ST.storage.saveNow = () => { saved.push(JSON.parse(JSON.stringify(ST.app.state))); return Promise.resolve('ok'); };
  ST.render.renderStatus = () => { throw new Error('drawing failed'); };
  const tap = attrs => clicks.forEach(fn => fn({ target: { closest: sel => (sel.slice(1, -1) in attrs ? { disabled: false, getAttribute: k => attrs[k] || null } : null) } }));

  assert.throws(() => tap({ 'data-vital': 'vitals-log' }), /drawing failed/);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].vitals[0].logged, true);
  assert.equal(saved[0].lifetimeXp, 15);

  ST.startUrge('TIRED');
  a.setNow('2026-10-10T08:20:00');
  assert.throws(() => tap({ 'data-vital': 'urge-won' }), /drawing failed/);
  assert.equal(saved.length, 2);
  assert.equal(saved[1].urges.log.length, 1);

  ST.app.trialConfirm = { id: 'pushups', value: 20 };
  assert.throws(() => tap({ 'data-trial': 'save-yes', 'data-id': 'pushups' }), /drawing failed/);
  assert.equal(saved.length, 3);
  assert.deepEqual(saved[2].trials.log.map(r => [r.id, r.value]), [['pushups', 20]]);
  ST.vitals.stop(); ST.trials.stop();
});
