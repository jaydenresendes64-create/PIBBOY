// STATUS's skills: tap one to see where its points came from (quests,
// books, the journal, urges ridden out) and what's still to come. The
// rewards' skill points are in the history (award(): data.skills).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

const EVIL = '"><img src=x onerror=alert(1)>';

function app() {
  const a = loadApp({ files: FILES.vitals });
  a.setNow('2026-10-10T12:00:00');
  a.ST.app.state = a.ST.defaultState();
  return a;
}

test('a skill\'s sources: open quests to come; done quests, books, the journal and urges earned; each counted once', () => {
  const a = app(), ST = a.ST, s = ST.app.state;
  assert.deepEqual(a.plain(ST.skillSources('SURVIVAL')), { earned: [], coming: [{ name: 'Back in the Saddle', amount: 3 }] });
  assert.deepEqual(a.plain(ST.skillSources('FINANCE')).coming, [{ name: 'Caps on the Line', amount: 8 }, { name: 'Pennies from Heaven', amount: 3 }]);

  ST.completeSide(s.quests.side[2]);                             // Back in the Saddle: +3 SURVIVAL
  ST.startUrge('TIRED');
  a.setNow('2026-10-10T12:20:00');
  ST.urgeWon();                                                  // +1 SURVIVAL
  ST.readBook('The Road', 'McCarthy', 'SURVIVAL', 2);
  ST.acceptJournal({ text: 'Camped out', xp: 20, reason: 'Outdoors', skillGains: [{ skill: 'SURVIVAL', amount: 1 }, { skill: 'MUSIC', amount: 1 }] });
  assert.deepEqual(a.plain(ST.skillSources('SURVIVAL')), {
    earned: [{ name: 'Back in the Saddle', amount: 3 }, { name: 'The Road', amount: 2 },
      { name: 'Urge ridden out', amount: 1 }, { name: 'Journal', amount: 1 }],
    coming: []
  });
  assert.deepEqual(a.plain(ST.skillSources('MUSIC')).earned, [{ name: 'Journal', amount: 1 }]);

  // A backup keeps the skill points in the history.
  const back = ST.sanitizeImported(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(a.plain(back.history.map(e => e.data.skills).filter(Boolean)), ['SURVIVAL:3', 'SURVIVAL:1', 'SURVIVAL:2', 'SURVIVAL:1,MUSIC:1']);
});

test('STATUS: each skill is a button with its latest source; tapped, its detail; no - / + any more', () => {
  const a = app(), ST = a.ST;
  ST.readBook(EVIL, '', 'KNOWLEDGE', 1);
  ST.app.skillOpen = 'KNOWLEDGE';
  ST.render.renderStatus();
  const html = a.elements['tab-status'].innerHTML;
  assert.equal((html.match(/class="skill-hit" data-action="skill"/g) || []).length, 8);
  assert.doesNotMatch(html, /data-action="skill" data-key="[A-Z]+" data-dir/);
  assert.match(html, /data-key="SURVIVAL" aria-expanded="false">[\s\S]*?<span class="skill-sub">\+3 coming · Back in the Saddle<\/span>/);
  assert.match(html, /data-key="KNOWLEDGE" aria-expanded="true">[\s\S]*?\+3 coming · Paper Trail[\s\S]*?<div class="skill-detail"><div class="skill-detail-title">Earned<\/div><div class="skill-src"><span>&quot;&gt;&lt;img/);
  assert.match(html, /Coming<\/div><div class="skill-src"><span>Paper Trail<\/span><span>\+3<\/span>/);
  assert.doesNotMatch(html, /<img/);
});

test('a tap on a skill opens its detail, a second one closes it; nothing changes the skill', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const a = loadApp({ files: FILES.events });
  const ST = a.ST;
  ST.app.state = ST.defaultState();
  let click = null;
  a.context.document.body.addEventListener = (type, fn) => { if (type === 'click') click = fn; };
  ST.events.setup();
  const btn = { disabled: false, getAttribute: name => ({ 'data-action': 'skill', 'data-key': 'MUSIC' })[name] || null };
  const tap = () => click({ target: { id: '', closest: sel => (sel === '[data-action]' ? btn : null) } });
  const before = ST.app.state.skills.MUSIC;
  tap();
  assert.equal(ST.app.skillOpen, 'MUSIC');
  tap();
  assert.equal(ST.app.skillOpen, null);
  assert.equal(ST.app.state.skills.MUSIC, before);
});
