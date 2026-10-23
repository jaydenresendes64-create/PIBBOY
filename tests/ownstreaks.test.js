// The player's own streaks (VITALS, under the chem-free one): a name they
// type, kept in their data only; the same milestones and XP as the
// chem-free streak, each once a run, through award() and the history; a
// lapse or a removal asked first, nothing taken back; never on the RobCo
// boot or in the field report; every document brought back safe.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

const NOW = '2026-10-13T12:00:00';
const EVIL = '"><img src=x onerror=alert(1)>';

function app(now) {
  const a = loadApp({ files: FILES.vitals });
  a.setNow(now || NOW);
  a.ST.app.state = a.ST.defaultState();
  return a;
}
const load = (a, doc) => a.ST.sanitizeImported(JSON.parse(JSON.stringify(doc)));
const sumXp = s => s.history.reduce((sum, e) => sum + e.xp, 0);

test('a save from before them has none, and nothing else changes; a save with one comes back identical', () => {
  const a = app(), ST = a.ST;
  const old = load(a, { stats: { STR: 4 }, quests: {}, chems: { cleanSince: '2026-09-20', best: 3, totalClean: 9, claimed: [7], lapses: [] } });
  assert.deepEqual(a.plain(old.streaks), []);
  assert.deepEqual(a.plain(old.chems), { cleanSince: '2026-9-20', best: 3, totalClean: 9, claimed: [7], lapses: [] });
  assert.deepEqual(a.plain(load(a, { stats: { STR: 4 }, quests: {}, streaks: 'nope' }).streaks), []);

  const s = ST.app.state;
  const x = ST.addStreak('Focus', '2026-09-01');
  ST.claimCleanMilestones();
  ST.logLapse(x.id);
  const back = load(a, s);
  assert.equal(JSON.stringify(back), JSON.stringify(s));
  assert.equal(JSON.stringify(load(a, back)), JSON.stringify(back));      // idempotent
});

test('starting one: a name (cut at 24 letters) and a first day up to today; no name, a future day or an 11th: refused', () => {
  const a = app(), ST = a.ST, s = ST.app.state;
  const x = ST.addStreak('  Focus  ', '2026-10-06');
  assert.deepEqual(a.plain(x), { id: x.id, name: 'Focus', cleanSince: '2026-10-6', best: 0, totalClean: 0, claimed: [], lapses: [] });
  assert.match(x.id, /^[A-Za-z0-9_-]{1,40}$/);
  assert.equal(ST.cleanDay(x.id), 8);
  assert.equal(ST.addStreak('Today').cleanSince, '2026-10-13');           // no date: from today
  assert.equal(ST.addStreak('x'.repeat(40)).name.length, ST.STREAK_NAME_MAX);
  assert.equal(ST.addStreak('   '), null);
  assert.equal(ST.addStreak('Later', '2026-10-14'), null);
  assert.equal(ST.addStreak('Bad', 'soon'), null);
  while (s.streaks.length < ST.STREAKS_MAX) ST.addStreak('More');
  assert.equal(ST.addStreak('One too many'), null);
  assert.equal(s.streaks.length, ST.STREAKS_MAX);
});

test('its milestones: the chem-free ones and their XP, once a run, recorded with its name; the chem-free streak untouched', () => {
  const a = app(), ST = a.ST, s = ST.app.state;
  const x = ST.addStreak('Focus', '2026-09-01');                            // 42 full days done
  const paid = a.plain(ST.claimCleanMilestones());
  assert.deepEqual(paid, [7, 14, 30].map(d => {
    const m = ST.CLEAN_MILESTONES.find(c => c.days === d);
    return { days: d, xp: m.xp, leveled: paid.find(p => p.days === d).leveled, name: 'Focus' };
  }));
  assert.equal(sumXp(s), 150 + 300 + 600);
  assert.equal(sumXp(s), s.lifetimeXp);
  const events = s.history.filter(e => e.type === 'STREAK_MILESTONE');
  assert.deepEqual(a.plain(events.map(e => e.data)), [7, 14, 30].map(d => ({ streak: x.id, name: 'Focus', days: d })));
  assert.deepEqual(a.plain(s.chems), { cleanSince: null, best: 0, totalClean: 0, claimed: [], lapses: [] });
  assert.equal(s.history.some(e => e.type === 'CLEAN_MILESTONE'), false);
  // Nothing twice: again, or after moving the start back and forth.
  assert.deepEqual(a.plain(ST.claimCleanMilestones()), []);
  assert.equal(ST.setCleanStart('2026-10-10', x.id), true);
  ST.claimCleanMilestones();
  assert.equal(ST.setCleanStart('2026-09-01', x.id), true);
  assert.deepEqual(a.plain(ST.claimCleanMilestones()), []);
  assert.equal(ST.setCleanStart('2026-10-14', x.id), false);           // not in the future
  // The chem-free streak pays its own, apart.
  ST.setCleanStart('2026-10-05');
  assert.deepEqual(a.plain(ST.claimCleanMilestones()).map(m => [m.days, m.name]), [[7, undefined]]);
  assert.equal(sumXp(s), s.lifetimeXp);
});

test('a lapse on it: its days kept in its total and best, a new run tomorrow, no XP taken back; chem-free untouched', () => {
  const a = app(), ST = a.ST, s = ST.app.state;
  ST.setCleanStart('2026-09-24');
  const x = ST.addStreak('Focus', '2026-10-01');                            // 12 full days
  ST.claimCleanMilestones();
  const xp = s.lifetimeXp, chems = JSON.stringify(s.chems);
  assert.equal(ST.lapsedToday(), false);
  assert.equal(ST.logLapse(x.id), true);
  assert.deepEqual(a.plain(x), { id: x.id, name: 'Focus', cleanSince: '2026-10-14', best: 12, totalClean: 12, claimed: [], lapses: ['2026-10-13'] });
  assert.equal(ST.cleanDay(x.id), 0);
  assert.equal(ST.cleanTotal(x.id), 12);
  assert.equal(ST.lapsedToday(), true);
  assert.equal(s.lifetimeXp, xp);
  assert.equal(JSON.stringify(s.chems), chems);
  assert.equal(ST.logLapse('nope'), false);
});

test('renamed or removed: the XP its milestones gave and their history stay', () => {
  const a = app(), ST = a.ST, s = ST.app.state;
  const x = ST.addStreak('Focus', '2026-10-01');
  ST.claimCleanMilestones();
  assert.equal(ST.renameStreak(x.id, ' Deep work '), true);
  assert.equal(x.name, 'Deep work');
  assert.equal(ST.renameStreak(x.id, ''), false);
  assert.equal(ST.renameStreak(null, 'chems'), false);                   // never the chem-free one
  const xp = s.lifetimeXp, events = s.history.length;
  assert.equal(ST.removeStreak(x.id), true);
  assert.deepEqual(a.plain(s.streaks), []);
  assert.equal(s.lifetimeXp, xp);
  assert.equal(s.history.length, events);
  assert.equal(ST.removeStreak(x.id), false);
  assert.equal(ST.removeStreak(null), false);
  assert.notEqual(s.chems, null);
});

test('a document with damaged or hostile streaks: brought within limits, unique ids, nothing unsafe on screen', () => {
  const a = app(), ST = a.ST;
  const many = Array.from({ length: 14 }, (_, i) => ({ id: 'm' + i, name: 'S' + i, cleanSince: '2026-10-01' }));
  const s = load(a, {
    stats: { STR: 4 }, quests: {},
    streaks: [{ id: 'ok1', name: EVIL + EVIL, cleanSince: '2026-09-20', best: '3', totalClean: -1, claimed: [7, 8, '14', 99], lapses: ['bad', '2026-09-01', '2026-09-01'] },
      { id: 'ok1', name: 'dup' }, { id: '../x', name: '', cleanSince: 'whenever' }, 'junk', null, [1]].concat(many)
  });
  assert.equal(s.streaks.length, ST.STREAKS_MAX);
  assert.equal(new Set(s.streaks.map(x => x.id)).size, s.streaks.length);
  assert.deepEqual(a.plain(s.streaks[0]), { id: 'ok1', name: (EVIL + EVIL).slice(0, ST.STREAK_NAME_MAX), cleanSince: '2026-9-20', best: 3, totalClean: 0,
    claimed: [7, 14], lapses: ['2026-9-1'] });
  assert.equal(s.streaks[1].name, 'Streak');
  assert.notEqual(s.streaks[1].id, '../x');
  assert.equal(s.streaks[1].cleanSince, null);
  ST.app.state = s;
  ST.vitals.render(); ST.vitals.stop(); ST.trials.stop();
  const html = a.elements['tab-vitals'].innerHTML;
  assert.doesNotMatch(html, /<img|onerror=alert\(1\)>|NaN|undefined/);
  assert.match(html, /<div class="vital-head">&quot;&gt;&lt;img src=x onerror=ale<\/div>/);   // cut at 24 letters, escaped
  assert.match(html, /<div class="vital-head">Streak<\/div><p class="vital-sub">Set the first day of this run\.<\/p>/);
  assert.doesNotMatch(html, /\+ New streak/, 'ten already');
});

// ---------- the screen ----------
function screen(setup) {
  const a = app(), ST = a.ST, clicks = [], keys = [];
  a.context.document.body.addEventListener = (type, fn) => { if (type === 'click') clicks.push(fn); if (type === 'keydown') keys.push(fn); };
  ST.vitals.init();
  let saves = 0;
  ST.storage.saveNow = () => { saves++; return Promise.resolve('ok'); };
  if (setup) setup(ST, ST.app.state, a);
  const draw = () => { ST.vitals.render(); ST.vitals.stop(); ST.trials.stop(); return a.elements['tab-vitals'].innerHTML; };
  const tap = (vital, key) => {
    const attrs = { 'data-vital': vital, 'data-key': key || null };
    clicks.forEach(fn => fn({ target: { closest: sel => (sel === '[data-vital]' ? { disabled: false, getAttribute: k => attrs[k] || null } : null) } }));
    ST.vitals.stop(); ST.trials.stop();
    return a.elements['tab-vitals'].innerHTML;
  };
  const type = (id, value) => { a.elements[id] = a.elements[id] || a.context.document.getElementById(id); a.elements[id].value = value; };
  // Enter in a box; the page's buttons as drawn (for the one Enter stands for).
  const enter = id => {
    const html = a.elements['tab-vitals'].innerHTML;
    a.context.document.querySelector = sel => {
      const m = /^\[data-vital="([a-z-]+)"\]$/.exec(sel), b = m && new RegExp('data-vital="' + m[1] + '"(?: data-key="([^"]*)")?').exec(html);
      return b ? { getAttribute: k => (k === 'data-key' ? b[1] || null : null) } : null;
    };
    let stopped = false;
    keys.forEach(fn => fn({ key: 'Enter', target: { id }, preventDefault: () => { stopped = true; } }));
    ST.vitals.stop(); ST.trials.stop();
    return stopped;
  };
  return { a, ST, s: ST.app.state, draw, tap, type, enter, saves: () => saves };
}

test('the card: "+ New streak", its form, then its day and next milestone under the chem-free card', () => {
  const v = screen(), ST = v.ST;
  let html = v.draw();
  assert.match(html, /Chem-free streak[\s\S]*<div class="vital-btns own-add"><button class="vital-btn quiet" data-vital="own-new">\+ New streak<\/button><\/div>/);
  html = v.tap('own-new');
  assert.match(html, /<div class="vital-head">New streak<\/div><p class="vital-sub">A name only you will see, and the first day of the run\.<\/p>/);
  assert.match(html, /id="own-name" maxlength="24"[^>]*value=""/);
  assert.match(html, /id="own-date" max="2026-10-13" value="2026-10-13"/);
  assert.match(html, /data-vital="own-save">Start<\/button><button class="vital-btn quiet" data-vital="own-cancel">Cancel<\/button><\/div>/);
  v.type('own-name', ''); v.type('own-date', '2026-10-06');
  v.tap('own-save');
  assert.equal(v.s.streaks.length, 0, 'no name: nothing started');
  v.type('own-name', 'Focus');
  html = v.tap('own-save');
  assert.equal(v.saves(), 1);
  const x = v.s.streaks[0];
  assert.equal(x.name, 'Focus');
  assert.match(html, /<div class="vital-card streak-card own-streak"><div class="vital-head">Focus<\/div><div class="streak-big">DAY 08<\/div>/);
  assert.match(html, /7 full days done\. Next: 14 days, \+300 XP, 7 to go\.<\/p><div class="streak-bar">/);
  assert.match(html, new RegExp('data-vital="own-edit" data-key="' + x.id + '">Edit</button><button class="vital-btn quiet" data-vital="own-lapse-ask" data-key="' + x.id + '">Log a lapse</button>'));
  assert.match(html, /\+ New streak/);
  assert.equal(ST.app.ownForm, null);
});

test('a milestone tomorrow puts the streaks first, with the day before\'s line', () => {
  const v = screen(ST => ST.addStreak('Focus', '2026-10-07'));               // 6 full days: 7 tomorrow
  assert.deepEqual(v.a.plain(v.ST.vitals.order()), ['streak', 'checkin', 'urge']);
  assert.match(v.draw(), /<div class="vital-head">Focus<\/div><div class="streak-big">DAY 07<\/div><p class="vital-sub streak-soon">Day 7\. Tomorrow: \+150 XP\.<\/p>/);
});

test('a lapse is asked first; then it restarts tomorrow, with a way back and no blame', () => {
  let x;
  const v = screen(ST => { x = ST.addStreak('Focus', '2026-10-01'); });
  let html = v.tap('own-lapse-ask', x.id);
  assert.match(html, new RegExp('Log a lapse today\\? The count restarts tomorrow\\. Days already done stay in your total and no XP is lost\\.</p><div class="vital-btns"><button class="vital-btn warn" data-vital="own-lapse-yes" data-key="' + x.id + '">Yes, log it'));
  html = v.tap('own-lapse-no', x.id);
  assert.equal(x.lapses.length, 0);
  assert.doesNotMatch(html, /own-lapse-yes/);
  v.tap('own-lapse-ask', x.id);
  html = v.tap('own-lapse-yes', x.id);
  assert.equal(x.lapses.length, 1);
  assert.equal(v.s.chems.cleanSince, null, 'the chem-free streak isn\'t touched');
  assert.match(html, /<div class="vital-head">Focus<\/div><div class="streak-big">RESTART \/\/ TOMORROW<\/div><p class="vital-sub">Stop for today\. The 12 days behind you still count\.<\/p><p class="vital-sub reading"><span class="field-tag">RESET \/\/<\/span> [^<]+<\/p>/);
  assert.doesNotMatch(html, /fail|weak|should have|shame|disappoint/i);
  // A tap without a streak's id never reaches the chem-free one.
  v.ST.setCleanStart('2026-10-01');
  v.tap('own-lapse-yes');
  assert.equal(v.s.chems.lapses.length, 0);
});

test('edit: rename it or move its first day; Remove asks first and keeps the XP', () => {
  let x;
  const v = screen(ST => { x = ST.addStreak('Focus', '2026-10-01'); });
  let html = v.tap('own-edit', x.id);
  assert.match(html, /<div class="vital-head">Focus<\/div><div class="vital-btns"><input type="text" class="date-input name-input" id="own-name"[^>]*value="Focus"><input type="date" class="date-input" id="own-date" max="2026-10-13" value="2026-10-01"/);
  v.type('own-name', 'Focus 2'); v.type('own-date', '2026-10-01');
  html = v.tap('own-save', x.id);
  assert.equal(x.name, 'Focus 2');
  assert.equal(x.cleanSince, '2026-10-1', 'the same day: not set again');
  v.tap('own-edit', x.id);
  v.type('own-name', 'Focus'); v.type('own-date', '2026-10-14');
  v.tap('own-save', x.id);
  assert.deepEqual([x.name, x.cleanSince], ['Focus 2', '2026-10-1'], 'a future day: nothing changed');
  html = v.tap('own-remove-ask', x.id);
  assert.match(html, new RegExp('Remove Focus 2\\? Its count is gone for good\\. The XP it gave stays\\.</p><div class="vital-btns"><button class="vital-btn warn" data-vital="own-remove-yes" data-key="' + x.id + '">Yes, remove it'));
  v.tap('own-remove-no', x.id);
  assert.equal(v.s.streaks.length, 1);
  v.ST.claimCleanMilestones();
  const xp = v.s.lifetimeXp;
  v.tap('own-remove-ask', x.id);
  html = v.tap('own-remove-yes', x.id);
  assert.deepEqual(v.a.plain(v.s.streaks), []);
  assert.equal(v.s.lifetimeXp, xp);
  assert.doesNotMatch(html, /own-streak/);
  assert.match(html, /\+ New streak/);
});

test('never on the RobCo boot, in the field report or on STATUS; on the urge decoder, its WHY line', () => {
  const b = loadApp({ files: FILES.boot });
  b.setNow(NOW);
  b.ST.app.state = b.ST.defaultState();
  b.ST.addStreak('Focus', '2026-10-01');
  b.ST.setCleanStart('2026-09-24');
  const boot = b.ST.boot.lines(b.ST.app.state, null).join('\n');
  assert.match(boot, /CHEM-FREE\.+ DAY 20/);
  assert.doesNotMatch(boot, /Focus|DAY 13/);

  const v = screen(ST => { ST.addStreak('Focus', '2026-10-01'); ST.setVital('sleep', 6); ST.logVitals(); });
  assert.doesNotMatch(v.ST.vitals.fieldReport(), /Focus/);
  v.ST.render.renderStatus();
  assert.doesNotMatch(v.a.elements['tab-status'].innerHTML, /Focus/);
  v.ST.startUrge('NONE');
  const why = v.a.plain(v.ST.insight.urgeMessages()).filter(m => m.style === 'WHY');
  assert.deepEqual(why.map(m => m.text), ['Focus day 13. 2 to the 14-day milestone (+300 XP).']);
});

test('the urge decoder after a lapse on it: the reset line, different from the card\'s', () => {
  let x;
  const v = screen(ST => { x = ST.addStreak('Focus', '2026-10-01'); ST.logLapse(x.id); });
  const html = v.draw();
  const card = /<div class="vital-head">Focus<\/div>[\s\S]*?RESET \/\/<\/span> ([^<]+)<\/p>/.exec(html);
  const decoder = /id="urge-card"><div class="vital-head">Urge decoder<\/div><p class="vital-sub reading"><span class="field-tag">RESET \/\/<\/span> ([^<]+)<\/p>/.exec(html);
  assert.ok(card && decoder);
  assert.notEqual(card[1], decoder[1]);
});

test('Enter in the name box does what Start (or Save) does', () => {
  const v = screen();
  v.draw(); v.tap('own-new');
  v.type('own-name', 'Focus'); v.type('own-date', '2026-10-06');
  assert.equal(v.enter('own-name'), true);
  assert.equal(v.s.streaks.length, 1);
  const x = v.s.streaks[0];
  assert.equal(x.name, 'Focus');
  v.tap('own-edit', x.id);
  v.type('own-name', 'Focus 2'); v.type('own-date', '2026-10-06');
  assert.equal(v.enter('own-name'), true);
  assert.equal(v.s.streaks.length, 1);
  assert.equal(x.name, 'Focus 2');
  assert.doesNotMatch(v.draw(), /id="own-name"/, 'the form closed');
});
