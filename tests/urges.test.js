// The urge decoder's record (2026-10-22): while the timer runs, how strong
// the urge is, what set it off and what's being done about it (the
// player's own list of ways); every urge logged with how it ended (ridden
// out, or given in to: no XP, nothing taken away); one line after it; the
// patterns its own log shows (counted, never a cause), and the way most
// often ridden out with suggested. Old saves and backups read as before;
// what's typed stays inert on screen.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

const app = loadApp({ files: FILES.vitals });              // the state and the insights
const ST = app.ST;
const fresh = () => { ST.app.state = ST.defaultState(); return ST.app.state; };
const load = doc => ST.sanitizeImported(JSON.parse(JSON.stringify(doc)));
const sumXp = s => s.history.reduce((sum, e) => sum + e.xp, 0);
// An urge from start to end, `minutes` after `at`.
function urge(need, details, end, at) {
  app.setNow(at);
  ST.startUrge(need);
  Object.keys(details || {}).forEach(k => [].concat(details[k]).forEach(v => ST.setUrgeDetail(k, v)));
  app.setNow(app.context.Date.now() + ST.URGE_MS);
  return end === 'lapsed' ? ST.urgeLapsed() : ST.urgeWon();
}

test('while the timer runs: how strong (0-10), what set it off (one, tapped again to clear), the ways being used (on and off)', () => {
  const s = fresh();
  app.setNow('2026-10-22T21:00:00');
  assert.equal(ST.setUrgeDetail('intensity', 5), null);                  // none running
  ST.startUrge('TIRED');
  assert.deepEqual(app.plain(s.urges.active), { start: app.context.Date.now(), need: 'TIRED', rounds: 1, intensity: 0, trigger: '', copes: [] });
  ST.setUrgeDetail('intensity', '7');
  assert.equal(s.urges.active.intensity, 7);
  ST.setUrgeDetail('intensity', 99); assert.equal(s.urges.active.intensity, 10);
  ST.setUrgeDetail('intensity', -3); assert.equal(s.urges.active.intensity, 0);
  assert.equal(ST.setUrgeDetail('intensity', 'lots'), null);
  ST.setUrgeDetail('trigger', 'STRESS');
  assert.equal(s.urges.active.trigger, 'STRESS');
  ST.setUrgeDetail('trigger', 'BOREDOM'); assert.equal(s.urges.active.trigger, 'BOREDOM');
  ST.setUrgeDetail('trigger', 'BOREDOM'); assert.equal(s.urges.active.trigger, '');
  assert.equal(ST.setUrgeDetail('trigger', 'LUCK'), null);
  ST.setUrgeDetail('cope', 'walk'); ST.setUrgeDetail('cope', 'water');
  assert.deepEqual(app.plain(s.urges.active.copes), ['walk', 'water']);
  ST.setUrgeDetail('cope', 'walk');
  assert.deepEqual(app.plain(s.urges.active.copes), ['water']);
  assert.equal(ST.setUrgeDetail('cope', 'nope'), null);                  // not one of the player's ways
  assert.equal(ST.setUrgeDetail('colour', 'red'), null);
});

test('every urge is logged with how it ended: ridden out (paid, 3 a day) or given in to (logged, no XP, not counted against the cap)', () => {
  const s = fresh();
  const lapsed = urge('LONELY', { intensity: 8, trigger: 'ALONE', cope: 'call' }, 'lapsed', '2026-10-22T23:10:00');
  assert.deepEqual(app.plain(lapsed), { date: '2026-10-22', need: 'LONELY', rounds: 1, outcome: 'lapsed', intensity: 8, trigger: 'ALONE',
    copes: ['call'], note: '', hour: 23, t: app.context.Date.now() });
  assert.equal(s.urges.active, null);
  assert.equal(s.lifetimeXp, 0);                                           // nothing paid, nothing taken
  assert.equal(ST.urgesToday(), 0);
  app.setNow('2026-10-22T23:40:00');
  ST.startUrge('ANGRY');
  assert.ok(ST.urgeLapsed(), 'given in to before zero too');
  for (let i = 0; i < 4; i++) urge('TIRED', {}, 'won', '2026-10-22T1' + i + ':00:00');
  assert.equal(ST.urgesToday(), 4);
  assert.equal(s.history.filter(e => e.type === 'URGE_RESISTED').length, 3, 'the cap counts urges ridden out, not lapses');
  assert.deepEqual(app.plain(s.urges.log.map(u => u.outcome)), ['lapsed', 'lapsed', 'won', 'won', 'won', 'won']);
  assert.equal(ST.urgeLapsed(), null);                                   // none running
  assert.equal(sumXp(s), s.lifetimeXp);
});

test('one line after an urge: trimmed, at most 140 characters, only on the urge it is about', () => {
  const s = fresh();
  const e = urge('HUNGRY', {}, 'won', '2026-10-22T12:00:00').entry;
  assert.equal(ST.noteUrge(e.t, '   Ate   first,\n then it   faded   ').note, 'Ate first, then it faded');
  assert.equal(ST.noteUrge(e.t, 'x'.repeat(500)).note.length, ST.URGE_NOTE_MAX);
  assert.equal(ST.noteUrge(12345, 'lost'), null);
  assert.equal(ST.noteUrge(0, 'old'), null);                             // urges logged before had no t
  assert.equal(s.urges.log.length, 1);
});

test('the player\'s own ways: added (a name not there yet, at most 12), removed (logged urges keep it, unnamed)', () => {
  const s = fresh();
  assert.deepEqual(app.plain(s.urges.copes.map(c => c.id)), ['walk', 'water', 'call', 'eat', 'shower', 'move']);
  const mine = ST.addCope('  Breathe   4-7-8  ');
  assert.equal(mine.name, 'Breathe 4-7-8');
  assert.equal(ST.addCope('breathe 4-7-8'), null);                       // already there
  assert.equal(ST.addCope('   '), null);
  assert.equal(ST.addCope('x'.repeat(80)).name.length, ST.COPE_NAME_MAX);
  while (s.urges.copes.length < ST.COPES_MAX) ST.addCope('Way ' + s.urges.copes.length);
  assert.equal(ST.addCope('One too many'), null);
  app.setNow('2026-10-22T12:00:00');
  ST.startUrge('NONE');
  ST.setUrgeDetail('cope', mine.id);
  assert.equal(ST.removeCope(mine.id), true);
  assert.deepEqual(app.plain(s.urges.active.copes), []);
  assert.equal(ST.removeCope(mine.id), false);
  assert.equal(ST.copeById(mine.id), null);
});

test('documents: an old log reads as ridden out; hostile details dropped or brought within limits; a current one comes back identical', () => {
  const s = fresh();
  urge('TIRED', { intensity: 6, trigger: 'HABIT', cope: ['walk', 'shower'] }, 'won', '2026-10-22T22:00:00');
  urge('ANGRY', { intensity: 9 }, 'lapsed', '2026-10-22T23:00:00');
  ST.noteUrge(s.urges.log[1].t, 'Argument, then straight to it');
  ST.addCope('Music');
  app.setNow('2026-10-22T23:30:00');
  ST.startUrge('LONELY'); ST.setUrgeDetail('cope', 'call');
  assert.equal(JSON.stringify(load(s)), JSON.stringify(s));
  const junk = load({ stats: {}, quests: {}, urges: {
    active: { start: 5, need: 'LONELY', intensity: 'x', trigger: '<b>', copes: ['call', 'ghost', 'call', '"><x'] },
    log: [{ date: '2026-10-20', need: 'TIRED', rounds: 2, outcome: 'nope', intensity: 42, trigger: 'LUCK', copes: 'walk', note: '<img src=x>', hour: 31, t: -9 },
      { date: '2026-10-21', need: 'ANGRY', outcome: 'lapsed', intensity: '4', hour: '7', copes: ['walk', 'walk', 5] }],
    copes: [{ id: 'walk', name: '  Walk  ' }, { id: 'walk', name: 'Twice' }, { id: '"><x', name: 'Odd id' }, { id: 'n', name: 'walk' }, { id: 'e', name: '' }, 'x'] } });
  assert.deepEqual(app.plain(junk.urges.copes.map(c => c.name)), ['Walk', 'Odd id']);
  assert.notEqual(junk.urges.copes[1].id, '"><x');
  assert.deepEqual(app.plain(junk.urges.active), { start: 5, need: 'LONELY', rounds: 1, intensity: 0, trigger: '', copes: [] });   // 'call' isn't on this list
  assert.deepEqual(app.plain(junk.urges.log), [
    { date: '2026-10-20', need: 'TIRED', rounds: 2, intensity: 10, trigger: '', copes: [], outcome: 'won', note: '<img src=x>', hour: -1, t: 0 },
    { date: '2026-10-21', need: 'ANGRY', rounds: 1, intensity: 4, trigger: '', copes: ['walk'], outcome: 'lapsed', note: '', hour: 7, t: 0 }]);
  const none = load({ stats: {}, quests: {}, urges: { log: [], copes: [] } });
  assert.deepEqual(app.plain(none.urges.copes), [], 'an emptied list stays empty');
});

test('patterns, once the log has 3: the way most often ridden out with, the usual trigger and time, the intensity lately, how they ended — counted, never a cause', () => {
  const s = fresh();
  assert.deepEqual(app.plain(ST.insight.urgePatterns()), []);
  urge('TIRED', { intensity: 8, trigger: 'STRESS', cope: 'walk' }, 'won', '2026-10-15T21:00:00');
  urge('TIRED', { intensity: 8, trigger: 'STRESS', cope: 'walk' }, 'won', '2026-10-16T22:00:00');
  urge('ANGRY', { intensity: 9, trigger: 'STRESS', cope: 'water' }, 'lapsed', '2026-10-17T20:00:00');
  urge('TIRED', { intensity: 4, trigger: 'BOREDOM', cope: 'walk' }, 'won', '2026-10-18T21:30:00');
  urge('NONE', { intensity: 5, trigger: 'STRESS', cope: ['walk', 'water'] }, 'lapsed', '2026-10-19T18:00:00');
  urge('TIRED', { intensity: 4, cope: 'shower' }, 'won', '2026-10-20T08:00:00');
  const lines = app.plain(ST.insight.urgePatterns()).map(p => p.style + ' ' + p.text);
  assert.deepEqual(lines, [
    'PATTERN “Walk outside”: ridden out 3 of the 4 times you used it.',
    'PATTERN Most often set off by: stress (4 of 5 noted).',
    'PATTERN Most come in the evening (4 of 6).',
    'PATTERN Intensity lately: 4.3 on average, down from 8.3.']);
  urge('TIRED', {}, 'won', '2026-10-21T08:00:00');
  s.urges.log.forEach(u => { u.trigger = ''; u.copes = []; u.intensity = 0; u.hour = -1; });
  assert.deepEqual(app.plain(ST.insight.urgePatterns()).map(p => p.text), ['5 of the 7 urges decoded here were ridden out.']);
});

test('the way most often ridden out with on this need is suggested first while the timer runs; a lapsed urge isn\'t counted as ridden out', () => {
  fresh();
  urge('TIRED', { cope: 'shower' }, 'won', '2026-10-15T21:00:00');
  urge('TIRED', { cope: 'shower' }, 'won', '2026-10-16T21:00:00');
  urge('TIRED', { cope: 'eat' }, 'lapsed', '2026-10-17T21:00:00');
  app.setNow('2026-10-18T21:00:00');
  ST.startUrge('TIRED');
  const said = app.plain(ST.insight.urgeMessages());
  assert.deepEqual(said[0], { style: 'STRATEGY', id: 'ctx-cope', text: '“Shower”: you rode it out 2 of the 2 times you used it. Worth a go now?' });
  assert.ok(said.some(m => m.text === 'You’ve ridden out “tired” 2 times here. The last one passed in 1 round, 2 days ago.'));
  ST.cancelUrge();
  ST.startUrge('ANGRY');                                                  // no way tried on anger: none on any need 3 times either
  assert.equal(ST.insight.urgeMessages().some(m => m.id === 'ctx-cope'), false);
});

// ---------- the screen ----------
const EVIL = '"><img src=x onerror=alert(1)>';
function vitals(setup) {
  const a = loadApp({ files: FILES.vitals });
  a.setNow('2026-10-22T21:00:00');
  a.ST.app.state = a.ST.defaultState();
  setup(a.ST, a.ST.app.state, a);
  a.ST.vitals.render();
  a.ST.vitals.stop();
  return a.elements['tab-vitals'].innerHTML;
}

test('the screen: what to note while the timer runs, "I gave in" at any point, the note after, the patterns and the last urges', () => {
  const running = vitals(ST => { ST.startUrge('TIRED'); ST.setUrgeDetail('intensity', 7); ST.setUrgeDetail('trigger', 'HABIT'); ST.setUrgeDetail('cope', 'walk'); });
  assert.match(running, /data-vital="urge-lapse">I gave in<\/button>/);
  assert.match(running, /<label for="urge-intensity">How strong<\/label><input type="range" class="urge-range" id="urge-intensity" min="0" max="10" step="1" value="7"><span class="vital-val" id="urge-intensity-val">7<\/span>/);
  assert.match(running, /data-vital="urge-trigger" data-key="HABIT" aria-pressed="true">Usual time or place</);
  assert.match(running, /data-vital="urge-cope" data-key="walk" aria-pressed="true">Walk outside</);
  assert.match(running, /data-vital="cope-add-open" aria-expanded="false">\+ Mine</);
  const over = vitals((ST, s, a) => { ST.startUrge('TIRED'); a.setNow(a.context.Date.now() + ST.URGE_MS); });
  assert.match(over, /data-vital="urge-won">Rode it out[\s\S]*data-vital="urge-again">Still strong[\s\S]*data-vital="urge-lapse">I gave in/);
  const after = vitals((ST, s, a) => {
    ST.startUrge('TIRED'); a.setNow(a.context.Date.now() + ST.URGE_MS);
    ST.app.urgeNote = ST.urgeLapsed().t;
  });
  assert.match(after, /Logged\. It’s information, not a verdict\. One line for next time\? \(optional\)[\s\S]*id="urge-note" maxlength="140"/);
  const history = vitals((ST, s, a) => {
    for (let i = 0; i < 3; i++) { ST.startUrge('TIRED'); ST.setUrgeDetail('cope', 'walk'); a.setNow(a.context.Date.now() + ST.URGE_MS); ST.urgeWon(); }
    ST.noteUrge(s.urges.log[2].t, 'Walked to the park');
    ST.app.urgeHistory = true;
  });
  assert.match(history, /<div class="urge-patterns"><p class="vital-sub reading"><span class="field-tag">PATTERN \/\/<\/span> “Walk outside”: ridden out 3 of the 3 times you used it\.<\/p>/);
  assert.match(history, /<ul class="urge-history"><li class="">Oct 22 22h · TIRED · ridden out · Walk outside<span class="urge-history-note">“Walked to the park”<\/span><\/li>/);
  assert.match(history, /data-vital="urge-history" aria-expanded="true">Hide \(3\)/);
});

test('STATUS counts the urges ridden out, not the ones given in to', () => {
  const a = loadApp({ files: FILES.vitals });
  a.setNow('2026-10-22T12:00:00');
  a.ST.app.state = a.ST.defaultState();
  for (const end of ['won', 'lapsed', 'won']) {
    a.ST.startUrge('TIRED'); a.setNow(a.context.Date.now() + a.ST.URGE_MS);
    if (end === 'won') a.ST.urgeWon(); else a.ST.urgeLapsed();
  }
  a.ST.render.renderStatus();
  assert.match(a.elements['tab-status'].innerHTML, />2<\/div><div class="[^"]*">Urges ridden out</);
});

test('a hostile way, note or log stays inert on the screen', () => {
  const html = vitals((ST, s, a) => {
    const c = ST.addCope(EVIL.slice(0, 30));
    s.urges.copes.push({ id: '"><b>', name: EVIL });                     // skipped sanitizeImported
    ST.startUrge('TIRED'); ST.setUrgeDetail('cope', c.id); a.setNow(a.context.Date.now() + ST.URGE_MS);
    const e = ST.urgeWon().entry;
    ST.noteUrge(e.t, EVIL);
    s.urges.log.push({ date: '2026-10-22', need: EVIL, rounds: EVIL, outcome: EVIL, intensity: EVIL, trigger: EVIL, copes: [EVIL], note: EVIL, hour: EVIL, t: 1 });
    ST.app.urgeHistory = true;
    ST.app.urgeCopeEdit = true;
  });
  assert.doesNotMatch(html, /<img|<b>/);
  assert.match(html, /&quot;&gt;&lt;img/);
});
