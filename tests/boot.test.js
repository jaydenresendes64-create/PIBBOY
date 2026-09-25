// The weather read the Pip-Boy way (js/weather.js) and the RobCo boot's
// lines (js/boot.js), built from the real state.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

const app = loadApp({ files: FILES.boot });
const ST = app.ST;
const W = ST.weather;
const fresh = () => { ST.app.state = ST.defaultState(); return ST.app.state; };

test('weather: every WMO code group has its reading; rain is a rad-storm', () => {
  assert.equal(W.describe(0, true).text, 'CLEAR');
  assert.equal(W.describe(0, false).icon, '☾');                    // a moon at night
  assert.match(W.describe(63, true).alert, /RAD-STORM INCOMING/);
  assert.match(W.describe(95, true).alert, /SEVERE RAD-STORM/);
  assert.match(W.describe(73, true).alert, /NUCLEAR WINTER/);
  assert.match(W.describe(45, true).alert, /FERAL GHOULS/);
  assert.equal(W.describe(42, true).text, 'UNKNOWN');
  for (const code of [0, 1, 2, 3, 45, 48, 51, 55, 61, 65, 71, 75, 80, 82, 85, 95, 99]) {
    assert.notEqual(W.describe(code, true).text, 'UNKNOWN', 'code ' + code);
  }
});

test('weather: Open-Meteo\'s answer read, and anything else refused', () => {
  const w = W.fromAnswer({ current: { temperature_2m: 13.6, weather_code: 61, is_day: 1 } }, 1000);
  assert.deepEqual(app.plain(w), { temp: 14, code: 61, isDay: true, at: 1000 });
  assert.equal(W.short(w), '☂︎ 14°C');
  assert.equal(W.line(w), 'MONTRÉAL 14°C, RAIN');
  assert.equal(W.line(null), 'NO SIGNAL');
  assert.equal(W.fromAnswer({ current: { temperature_2m: 'hot', weather_code: 61 } }), null);
  assert.equal(W.fromAnswer(null), null);
  assert.match(W.requestUrl(), /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=45\.5017&longitude=-73\.5673&current=temperature_2m,weather_code,is_day/);
});

test('boot: the logon, then MALIK\'s real status, the rads and the weather', () => {
  const s = fresh();
  s.level = 7; s.xp = 450; s.xpToNext = 3000;
  s.quests.daily[0].lastDate = ST.todayStr();
  s.quests.mains.push({ id: 'm2', questName: 'A Higher Calling', title: 'Pray 7 days', progressType: 'streak', streakTarget: 7,
    streakDays: 3, lastCheckIn: ST.todayStr(), progress: 0, xp: 700, completed: false, skillGains: [], bonus: [] });
  const text = ST.boot.lines(s, { temp: 14, code: 61, isDay: true, at: 0 }).join('\n');
  assert.match(text, /^ROBCO INDUSTRIES \(TM\) TERMLINK PROTOCOL/);
  assert.match(text, /LEVEL\.+ 07 {2}\(450 \/ 3,000 XP\)/);
  assert.match(text, /QUESTS\.+ 2 MAIN · 4 SIDE · DAILY 1\/3 TODAY/);
  assert.match(text, /\n {2}A HIGHER CALLING: DAY 3 \/ 7\n/);
  assert.match(text, /RADS\.+ 0 {2}\(NO BACKUP YET\)/);                   // a new player: nothing to lose yet
  assert.match(text, /WEATHER\.+ MONTRÉAL 14°C, RAIN\n>> RAD-STORM INCOMING — SEEK SHELTER/);
  assert.match(text, /WELCOME BACK, MALIK\.$/);
  assert.doesNotMatch(text, /RADAWAY ADVISED|S\.P\.E\.C\.I\.A\.L\./);
});

test('boot: level-up points, a backup due, and no weather', () => {
  const s = fresh();
  s.unspentSpecialPoints = 2;
  s.lifetimeXp = 100;                                                     // progress, never backed up
  const text = ST.boot.lines(s, null).join('\n');
  assert.match(text, /S\.P\.E\.C\.I\.A\.L\.+ 2 POINTS TO ASSIGN/);
  assert.match(text, /RADS\.+ 1000 {2}\(NO BACKUP YET\)\n>> RADAWAY ADVISED: TAP THE RAD METER/);
  assert.match(text, /WEATHER\.+ NO SIGNAL\n\nWELCOME/);
});
