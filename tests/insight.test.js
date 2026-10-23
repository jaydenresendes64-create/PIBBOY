// What VITALS has to say (js/insight.js): the check-in's readings (STATUS,
// TREND, PRIORITY and ACTION, PATTERN) from the logged check-ins only, and
// the urge decoder's messages, from what's known (the need, the round,
// today's check-in, the urges before, the streak, the hour), each once a
// round; the reflection at zero, the reset after a lapse. Words only: the
// state, the rewards and the history never change for them.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

const EVIL = '"><img src=x onerror=alert(1)>';
const NOW = '2026-10-10T08:00:00';

function app(setup, now) {
  const a = loadApp({ files: FILES.vitals });
  a.setNow(now || NOW);
  a.ST.app.state = a.ST.defaultState();
  if (setup) setup(a.ST, a.ST.app.state, a);
  return a;
}
// The day `n` days before 2026-10-10, as saved.
function day(n) {
  const d = new Date(2026, 9, 10 - n);
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
// A logged check-in `n` days ago (5 everywhere unless said).
function entry(n, levels) {
  return Object.assign({ date: day(n), logged: true, energy: 5, mood: 5, hunger: 5, tension: 5, sleep: 5, craving: 5, pulse: null, radN: 0, radT: 0 }, levels || {});
}
// Today's check-in, logged with these levels.
function logToday(ST, levels) {
  Object.keys(levels || {}).forEach(k => ST.setVital(k, levels[k]));
  ST.logVitals();
}
function readings(a) { return a.plain(a.ST.insight.readings()); }
function tags(list) { return list.map(r => r.tag); }
function vitals(a) {
  a.ST.vitals.render();
  a.ST.vitals.stop();
  a.ST.trials.stop();
  return a.elements['tab-vitals'].innerHTML;
}

test('readings: none before the check-in is logged; the first one, without history, says only what today shows', () => {
  const before = app((ST, s) => { s.vitals = [entry(1, { sleep: 2, craving: 8 })]; ST.setVital('sleep', 2); });
  assert.deepEqual(readings(before), [], 'today not logged: its levels are only yesterday\'s, carried over');

  const first = app(ST => logToday(ST, { sleep: 1, craving: 7 }));
  const r = readings(first);
  assert.deepEqual(tags(r), ['STATUS', 'PRIORITY', 'ACTION'], 'no TREND or PATTERN without earlier check-ins');
  assert.match(r[0].text, /^Sleep 1, [^.]+\. Craving 7, [^.]+\.$/);
  assert.equal(r[1].id, 'priority-sleep');                       // further past its line than craving
  assert.match(r[1].text, /^Sleep, at 1/);
  const even = app(ST => logToday(ST, { sleep: 2, craving: 7 }));
  assert.equal(readings(even)[1].id, 'priority-craving', 'as far past their lines: craving first');

  const calm = app(ST => logToday(ST, {}));
  assert.deepEqual(tags(readings(calm)), ['STATUS']);
  assert.match(readings(calm)[0].text, /^No(thing)? (level )?past its line today\.$/);
});

test('TREND: a level going one way three check-ins running, else today against the average, else the change since the last one', () => {
  const run = app((ST, s) => { s.vitals = [entry(2, { sleep: 7 }), entry(1, { sleep: 5 })]; logToday(ST, { sleep: 3 }); });
  const trend = readings(run).find(r => r.tag === 'TREND');
  assert.equal(trend.id, 'trend-run-sleep');
  assert.match(trend.text, /Sleep[: ].*7 → 5 → 3/);
  assert.match(trend.text, /down/);

  const avg = app((ST, s) => {
    s.vitals = [6, 5, 4, 3].map(n => entry(n, { mood: 3 })).concat([entry(2, { mood: 7 })]);
    logToday(ST, { mood: 7 });
  });
  const t2 = readings(avg).find(r => r.tag === 'TREND');
  assert.equal(t2.id, 'trend-avg-mood');
  assert.match(t2.text, /Mood 7.*(average of 3\.8|averaged 3\.8)/);
  // The highest in a while: STATUS says so already, TREND doesn't say it again against the average.
  const top = app((ST, s) => { s.vitals = [6, 5, 4, 3, 2].map(n => entry(n, { mood: 4 })); logToday(ST, { mood: 8 }); });
  assert.match(readings(top)[0].text, /^Mood 8, the highest in 6 check-ins\.$/);
  assert.notEqual(readings(top).find(r => r.tag === 'TREND').id, 'trend-avg-mood');

  const since = app((ST, s) => { s.vitals = [entry(1, { energy: 4 })]; logToday(ST, { energy: 7 }); });
  const t3 = readings(since).find(r => r.tag === 'TREND');
  assert.equal(t3.id, 'trend-last-energy');
  assert.match(t3.text, /Energy .*7.*4 yesterday|Energy up to 7, from 4 yesterday/);

  const far = app((ST, s) => { s.vitals = [entry(8, { energy: 2 })]; logToday(ST, { energy: 7 }); });
  assert.notEqual(readings(far).find(r => r.tag === 'TREND').id, 'trend-last-energy', 'a check-in 8 days back isn\'t "the last one"');
});

test('TREND: how regularly, the first check-in after a gap, and urges ridden out this week against last', () => {
  const regular = app((ST, s) => { s.vitals = [6, 5, 3, 2, 1].map(n => entry(n)); logToday(ST, {}); });
  assert.match(readings(regular).find(r => r.tag === 'TREND').text, /6 (of the last 7 days|check-ins in the last 7 days)/);

  const back = app((ST, s) => { s.vitals = [entry(5)]; logToday(ST, {}); });
  assert.match(readings(back).find(r => r.tag === 'TREND').text, /(First check-in in|Back after) 5 days/);

  const urges = app((ST, s) => {
    s.urges.log = [day(1), day(2), day(3), day(9)].map(d => ({ date: d, need: 'TIRED', rounds: 1 }));
    logToday(ST, {});
  });
  assert.match(readings(urges).find(r => r.tag === 'TREND').text, /3 urges ridden out in the last 7 days, 1 the week before|Urges ridden out: 3 this week, 1 last week/);
});

test('PATTERN: a link said as a link, only when today fits it and both sides have enough check-ins', () => {
  // Low sleep (4 or less) came with higher craving: 3 days 8, 4 days 3.
  const history = [entry(7, { sleep: 3, craving: 8 }), entry(6, { sleep: 7, craving: 3 }), entry(5, { sleep: 2, craving: 8 }),
    entry(4, { sleep: 6, craving: 3 }), entry(3, { sleep: 7, craving: 3 }), entry(2, { sleep: 4, craving: 8 }), entry(1, { sleep: 8, craving: 3 })];
  const low = app((ST, s) => { s.vitals = history.slice(); logToday(ST, { sleep: 3, craving: 5 }); });
  const p = readings(low).find(r => r.tag === 'PATTERN');
  assert.ok(p, 'today is a low-sleep day');
  assert.equal(p.id, 'pattern-sleep');
  assert.match(p.text, /sleep at 4 or less/);
  assert.match(p.text, /not a (proof|cause)/, 'never said as a cause');
  assert.match(p.text, /\b4\b[\s\S]*7\.3|7\.3[\s\S]*\b4\b/);           // 4 low-sleep days (today too), craving 7.3 on average

  const rested = app((ST, s) => { s.vitals = history.slice(); logToday(ST, { sleep: 8 }); });
  assert.equal(readings(rested).find(r => r.tag === 'PATTERN'), undefined, 'today isn\'t one of those days');

  const thin = app((ST, s) => { s.vitals = history.slice(0, 3); logToday(ST, { sleep: 3 }); });
  assert.equal(readings(thin).find(r => r.tag === 'PATTERN'), undefined, 'too few check-ins on one side');

  const none = app((ST, s) => { s.vitals = history.map(e => Object.assign({}, e, { craving: 4 })); logToday(ST, { sleep: 3, craving: 4 }); });
  assert.equal(readings(none).find(r => r.tag === 'PATTERN'), undefined, 'no difference, no pattern');
});

test('the same situation is worded differently from one day to the next, with the same facts', () => {
  const texts = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'].map(d => {
    const a = app(ST => logToday(ST, { sleep: 2 }), d + 'T08:00:00');
    return readings(a).map(r => r.text);
  });
  texts.forEach(list => { assert.match(list[0], /^Sleep 2, /); assert.match(list[1], /^Sleep, at 2/); });
  assert.ok(new Set(texts.map(l => l.join('|'))).size >= 2, 'not the same words every day');
  for (let i = 1; i < texts.length; i++) assert.notEqual(texts[i].join('|'), texts[i - 1].join('|'), 'two days running worded alike');
});

test('readings only read: the state, the XP and the history are the same after them; an edit after logging pays nothing more', () => {
  const a = app((ST, s) => { s.vitals = [entry(2, { sleep: 7 }), entry(1, { sleep: 5 })]; logToday(ST, { sleep: 3, craving: 7 }); });
  const s = a.ST.app.state, before = JSON.stringify(s);
  a.ST.insight.readings(); a.ST.insight.urgeMessages(); a.ST.insight.urgeReflection(); a.ST.insight.resetLine(); a.ST.insight.urgeHint();
  vitals(a);
  assert.equal(JSON.stringify(s), before);
  const xp = s.xp, events = s.history.length;
  a.ST.setVital('craving', 2);                                   // changed after logging
  assert.equal(a.ST.logVitals(), null, 'logged once');
  assert.equal(s.xp, xp); assert.equal(s.history.length, events);
  assert.match(readings(a)[0].text, /^Sleep 3/);
  assert.equal(readings(a).find(r => r.id === 'priority-craving'), undefined, 'the readings follow the edit');
});

test('readings with damaged entries: nothing breaks, nothing unsafe shows', () => {
  const a = app((ST, s) => {
    s.vitals = [{ date: EVIL, logged: true, sleep: EVIL }, { date: day(2), logged: true, sleep: 'x', craving: null },
      { date: day(1), logged: true }];                                // (null or a string: sanitizeImported drops them)
    logToday(ST, { energy: 5, mood: 5, hunger: 5, tension: 5, sleep: 2, craving: 5 });
  });
  assert.doesNotThrow(() => a.ST.insight.readings());
  const html = vitals(a);
  assert.doesNotMatch(html, /<img|onerror=|NaN|undefined/);
  assert.match(html, /STATUS \/\/<\/span> Sleep 2/);
  assert.doesNotMatch(html, /TREND \/\//, 'a level missing yesterday isn\'t a change from 0');
});

test('the folded check-in shows the readings above the field report; a craving to watch gets a way to the decoder', () => {
  const a = app(ST => logToday(ST, { craving: 8 }));
  const html = vitals(a);
  assert.match(html, /<div class="readings"><p class="reading"><span class="field-tag">STATUS \/\/<\/span> Craving 8/);
  assert.match(html, /ACTION \/\/<\/span> [^<]+ <button class="vital-btn quiet inline-go" data-vital="goto-urge">Decoder<\/button><\/p>[\s\S]*FIELD REPORT \/\/<\/span> INT 5/);
});

// ---------- the urge decoder ----------
function urge(setup, now) {
  return app((ST, s, a) => {
    if (setup) setup(ST, s, a);
  }, now);
}
function messages(a) { return a.plain(a.ST.insight.urgeMessages()); }

test('urge messages: the need\'s own and the general ones, styles in turn, each once; never another need\'s', () => {
  const a = urge(ST => ST.startUrge('TIRED'));
  const list = messages(a);
  assert.ok(list.length >= 12, list.length + ' messages');
  assert.equal(new Set(list.map(m => m.text)).size, list.length, 'each once');
  assert.ok(list.some(m => /Lie down\. Phone across the room\./.test(m.text)));
  assert.ok(!list.some(m => /Text someone|Eat first|anger/.test(m.text)), 'no other need\'s lines');
  const styles = new Set(list.map(m => m.style));
  ['DECODER', 'REALITY CHECK', 'DIRECT', 'INNER DIALOGUE', 'STRATEGY'].forEach(st => assert.ok(styles.has(st), st));
  assert.notEqual(list[0].style, list[1].style, 'the styles take turns');
  assert.ok(!list.some(m => m.id.startsWith('ctx-')), 'nothing known: no context line');
});

test('urge messages: what\'s known comes first, asked not assumed; nothing from a check-in not logged', () => {
  const tired = urge(ST => { logToday(ST, { sleep: 2, hunger: 8 }); ST.startUrge('LONELY'); });
  const list = messages(tired);
  assert.deepEqual(list.slice(0, 2).map(m => m.id), ['ctx-sleep', 'ctx-hunger']);
  assert.match(list[0].text, /You logged sleep 2 this morning\. Could tiredness be part of this/);
  assert.match(list[0].text, /\?$/);
  assert.match(list[1].text, /Hunger was 8 at check-in\. Have you eaten since\?/);

  const named = urge(ST => { logToday(ST, { sleep: 2 }); ST.startUrge('TIRED'); });
  assert.ok(!messages(named).some(m => m.id === 'ctx-sleep'), 'tiredness already named');

  const unlogged = urge((ST, s) => { ST.setVital('sleep', 1); ST.startUrge('NONE'); });
  assert.ok(!messages(unlogged).some(m => m.id === 'ctx-sleep'), 'not logged: not today\'s');
});

test('urge messages: the urges ridden out before, a second round, a late hour, the chem-free run', () => {
  const same = urge((ST, s) => {
    s.urges.log = [{ date: day(6), need: 'LONELY', rounds: 1 }, { date: day(3), need: 'LONELY', rounds: 2 }, { date: day(1), need: 'TIRED', rounds: 1 }];
    ST.startUrge('LONELY');
  });
  const m = messages(same).find(x => x.id === 'ctx-same');
  assert.match(m.text, /You’ve ridden out “lonely” 2 times here\. The last one passed in 2 rounds, 3 days ago\./);
  const once = urge((ST, s) => { s.urges.log = [{ date: day(1), need: 'LONELY', rounds: 1 }]; ST.startUrge('LONELY'); });
  assert.match(messages(once).find(x => x.id === 'ctx-same').text, /^You’ve ridden out “lonely” once here\. The last one passed in 1 round, yesterday\.$/);
  const other = urge((ST, s) => { s.urges.log = [{ date: day(1), need: 'TIRED', rounds: 1 }]; ST.startUrge('ANGRY'); });
  assert.match(messages(other).find(x => x.id === 'ctx-total').text, /^1 urge ridden out here so far\./);

  const again = urge((ST, s, a) => { ST.startUrge('HUNGRY'); a.setNow('2026-10-10T08:20:00'); ST.urgeAgain(); });
  assert.match(messages(again).find(x => x.id === 'ctx-round').text, /^Round 2\./);

  const late = urge(ST => ST.startUrge('NONE'), '2026-10-10T23:30:00');
  assert.ok(messages(late).some(x => x.id === 'ctx-late'));
  assert.ok(!messages(urge(ST => ST.startUrge('NONE'))).some(x => x.id === 'ctx-late'), 'not in the morning');

  const run = urge(ST => { ST.setCleanStart(day(10)); ST.startUrge('NONE'); });
  const why = messages(run).find(x => x.style === 'WHY');
  assert.match(why.text, /^Chem-free day 11\. 4 to the 14-day milestone \(\+300 XP\)\./);
  assert.ok(!messages(urge(ST => ST.startUrge('NONE'))).some(x => x.style === 'WHY'), 'no run: no goal made up');
});

test('urge messages start somewhere else each urge; the decoder works with no VITALS data at all', () => {
  const firsts = new Set();
  for (let i = 0; i < 6; i++) {
    const a = urge(ST => ST.startUrge('NONE'), '2026-10-10T08:0' + i + ':00');
    firsts.add(messages(a)[0].text);
  }
  assert.ok(firsts.size >= 3, 'a different first message from one urge to the next');
  const bare = urge((ST, s) => { s.vitals = []; s.urges.log = []; ST.startUrge('ANGRY'); });
  assert.ok(messages(bare).length > 5);
  assert.equal(bare.ST.insight.urgeHint(), null);
});

test('the decoder on screen: the need\'s tip, one message with its style, "Another angle" walks the list and starts over each round', () => {
  const a = urge(ST => ST.startUrge('TIRED'));
  const list = messages(a), ST = a.ST;
  let html = vitals(a);
  assert.match(html, /Lie down for 20 minutes[\s\S]*id="urge-clock"[\s\S]*<div class="urge-angle" aria-live="polite"><p class="urge-said"><span class="field-tag">[A-Z ]+ \/\/<\/span> /);
  assert.ok(html.includes(list[0].text.replace(/“|”/g, m => m)));
  assert.match(html, /data-vital="urge-angle">Another angle<\/button><button class="vital-btn quiet" data-vital="urge-lapse">I gave in<\/button><button class="vital-btn quiet" data-vital="urge-cancel">Cancel/);
  const shown = [];
  for (let i = 0; i < list.length + 1; i++) {
    shown.push(list.find(m => vitals(a).includes('</span> ' + m.text.replace(/&/g, '&amp;') + '</p>')).id);
    ST.app.urgeAngle++;
  }
  assert.equal(new Set(shown.slice(0, list.length)).size, list.length, 'every message once before any comes back');
  assert.equal(shown[list.length], shown[0], 'then from the top');
  // A second round starts from its own first message.
  a.setNow('2026-10-10T08:20:00');
  ST.urgeAgain();
  ST.app.urgeAngle = 0;
  html = vitals(a);
  assert.ok(html.includes('</span> ' + messages(a)[0].text + '</p>'));
});

test('at zero: a question to look back with; after a second round it asks what changed', () => {
  const zero = urge((ST, s, a) => { ST.startUrge('LONELY'); a.setNow('2026-10-10T08:20:00'); });
  const html = vitals(zero);
  assert.match(html, /Twenty minutes down\. Did it pass\?<\/p><p class="vital-sub reading"><span class="field-tag">REFLECTION \/\/<\/span> [^<]*\?[^<]*<\/p>/);   // which question depends on the minute
  const two = urge((ST, s, a) => { ST.startUrge('LONELY'); a.setNow('2026-10-10T08:20:00'); ST.urgeAgain(); a.setNow('2026-10-10T08:40:00'); });
  assert.match(two.ST.insight.urgeReflection().text, /^It took 2 rounds\. What changed between the first and this one\?$/);
});

test('after a lapse: a way back on the streak card and on the decoder, without blame', () => {
  const a = urge((ST, s) => { ST.setCleanStart(day(20)); ST.logLapse(); });
  const html = vitals(a);
  const card = /The 20 chem-free days behind you still count\.<\/p><p class="vital-sub reading"><span class="field-tag">RESET \/\/<\/span> ([^<]+)<\/p>/.exec(html);
  const decoder = /id="urge-card"><div class="vital-head">Urge decoder<\/div><p class="vital-sub reading"><span class="field-tag">RESET \/\/<\/span> ([^<]+)<\/p>/.exec(html);
  assert.ok(card && decoder, 'on both cards');
  assert.match(html, /RESTART \/\/ TOMORROW[\s\S]*The 20 chem-free days/);
  assert.notEqual(card[1], decoder[1], 'not the same line twice on one screen');
  const words = [0, 1, 2, 3, 4, 5].map(n => {
    const b = urge((ST, s) => { ST.setCleanStart(day(20)); ST.logLapse(); }, '2026-10-' + (10 + n) + 'T08:00:00');
    return b.ST.insight.resetLine().text;
  });
  words.forEach(w => assert.doesNotMatch(w, /fail|weak|should have|shame|disappoint/i));
  assert.ok(new Set(words).size >= 3, 'not the same line every time');
});

test('a hostile need, rounds or log that skipped sanitizeImported: the messages stay inert and fall back to the general ones', () => {
  const a = urge((ST, s) => {
    s.urges = { active: { start: Date.now(), need: EVIL, rounds: EVIL }, log: [{ date: EVIL, need: EVIL, rounds: EVIL }] };
  });
  const list = messages(a);
  assert.ok(list.length > 5);
  const html = vitals(a);
  assert.doesNotMatch(html, /<img|onerror=|NaN|undefined/);
  assert.match(html, /class="urge-said"/);
});
