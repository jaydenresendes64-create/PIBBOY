// The last 7 days next to the 7 before (2026-10-22: "meaningful progress
// summaries"): from what's recorded only, on STATUS and in the RobCo boot.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

function week(files) {
  const app = loadApp({ files });
  const ST = app.ST;
  ST.app.state = ST.defaultState();
  const at = day => app.setNow(day + 'T10:00:00');
  // the 7 before: one check-in, a daily
  at('2026-10-10'); ST.setVital('sleep', 6); ST.logVitals(); ST.completeDaily(ST.app.state.quests.daily[0]);
  // the last 7 days (to Oct 22): two check-ins, an urge each way, a trial (a record), a side quest
  at('2026-10-17'); ST.setVital('sleep', 6); ST.logVitals();
  at('2026-10-21'); ST.setVital('sleep', 6); ST.logVitals();
  ST.startUrge('TIRED'); app.setNow(app.context.Date.now() + ST.URGE_MS); ST.urgeWon();
  ST.startUrge('ANGRY'); ST.urgeLapsed();
  ST.logTrial('pushups', 20);
  ST.completeSide(ST.app.state.quests.side[0]);
  at('2026-10-22');
  return { app, ST };
}

test('the last 7 days and the 7 before, counted from the history and the logs', () => {
  const { app, ST } = week(FILES.vitals);
  assert.deepEqual(app.plain(ST.weekSummary()), {
    week: { xp: 15 + 15 + 40 + 50 + 150, checkins: 2, urgesWon: 1, urgesLapsed: 1, dailies: 0, trials: 1, records: 1, quests: 1 },
    before: { xp: 15 + 20, checkins: 1, urgesWon: 0, urgesLapsed: 0, dailies: 1, trials: 0, records: 0, quests: 0 } });
  app.setNow('2026-11-30T10:00:00');
  assert.deepEqual(app.plain(ST.weekSummary()).week, { xp: 0, checkins: 0, urgesWon: 0, urgesLapsed: 0, dailies: 0, trials: 0, records: 0, quests: 0 });
});

test('STATUS shows it (nothing when both weeks are empty); the RobCo boot has a line', () => {
  const { app, ST } = week(FILES.vitals);
  ST.render.renderStatus();
  const html = app.elements['tab-status'].innerHTML;
  assert.match(html, /<div class="panel-title">Last 7 days<\/div>/);
  assert.match(html, />\+270<\/div><div class="stats-label">XP \(the 7 before: \+35\)</);
  assert.match(html, />2\/7<\/div><div class="stats-label">Check-ins \(the 7 before: 1\)</);
  assert.match(html, />1<\/div><div class="stats-label">Urges ridden out · 1 given in to</);
  assert.match(html, />1<\/div><div class="stats-label">Trials logged · 1 record</);
  ST.app.state = ST.defaultState();
  ST.render.renderStatus();
  assert.doesNotMatch(app.elements['tab-status'].innerHTML, /Last 7 days/);
  const boot = week(FILES.boot);
  assert.match(boot.ST.boot.lines(boot.ST.app.state, null).join('\n'), /LAST 7 DAYS\.+ \+270 XP · 2 CHECK-INS · 1 URGE RIDDEN OUT\n/);
});
