// render.js: user text is escaped everywhere, and ids and numbers can't
// break out of their HTML attribute, even for data that skipped
// sanitizeImported() (defence in depth).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

const EVIL = '"><img src=x onerror=alert(1)>';
const TABS = ['tab-status', 'tab-quests', 'tab-items', 'tab-log', 'proposal-area'];

function renderEverything(state, proposal) {
  const app = loadApp({ files: FILES.render });
  const ST = app.ST;
  ST.app.state = state(ST);
  ST.app.walletExpanded = true;
  ST.render.renderAll();
  if (proposal) { ST.app.pendingProposal = proposal; ST.render.renderProposal('ai'); }
  return TABS.map(id => (app.elements[id] ? app.elements[id].innerHTML : '')).join('\n');
}
// No tag or event handler the app doesn't write itself can appear. Escaped
// text has no "<" and no '"', so every "<...>" is a real tag and every
// "..." inside one is a whole attribute value.
function assertInert(html) {
  const tags = html.match(/<[^>]*>/g);
  tags.forEach(tag => {
    const attributes = tag.replace(/"[^"]*"/g, '""');
    assert.doesNotMatch(attributes, /^<\/?(img|script|svg|iframe|object|embed)/i, tag);
    assert.doesNotMatch(attributes, /\son[a-z]+\s*=/i, tag);
  });
}

test('user text is escaped in every tab', () => {
  const html = renderEverything(ST => {
    const s = ST.defaultState();
    s.quests.mains[0].questName = EVIL; s.quests.mains[0].title = EVIL; s.quests.mains[0].bonus[0].name = EVIL;
    s.quests.side[0].questName = EVIL; s.quests.side[0].name = EVIL;
    s.quests.daily[0].questName = EVIL; s.quests.daily[0].name = EVIL;
    s.inventory[0].name = EVIL;
    s.inventory.push({ id: 'xs', name: EVIL, category: 'SELL', price: 5 });
    s.finances.holdings = [{ id: 'h1', label: EVIL, amount: 5, rateToCAD: 1 }];
    s.log = [{ date: EVIL, text: EVIL, xp: 5, reason: EVIL }];
    return s;
  }, { text: 'x', xp: 20, reason: EVIL, skillGains: [] });
  assertInert(html);
  assert.ok(html.includes('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'));
});

test('hostile ids and numbers that skipped sanitizeImported stay inert', () => {
  const html = renderEverything(ST => {
    const s = ST.defaultState();
    s.stats.STR = EVIL; s.skills.MUSIC = EVIL; s.unspentSpecialPoints = EVIL;
    const m = s.quests.mains[0];
    m.id = EVIL; m.xp = EVIL; m.progress = EVIL; m.bonus[0].id = EVIL; m.bonus[0].xp = EVIL;
    s.quests.mains.push({ id: EVIL, questName: 'S', title: 'T', progressType: 'streak', streakTarget: EVIL, streakDays: EVIL,
      lastCheckIn: null, xp: EVIL, completed: false, skillGains: [], bonus: [] });
    s.quests.side[0].id = EVIL; s.quests.side[0].xp = EVIL;
    s.quests.daily[0].id = EVIL; s.quests.daily[0].xp = EVIL;
    s.inventory[0].id = EVIL;
    s.inventory.push({ id: EVIL, name: 'n', category: 'SELL', price: EVIL });
    s.finances.holdings = [{ id: EVIL, label: 'L', amount: EVIL, rateToCAD: EVIL }];
    s.log = [{ date: 'd', text: 't', xp: EVIL, reason: 'r' }];
    return s;
  }, { text: 'x', xp: EVIL, reason: 'r', skillGains: [{ skill: EVIL, amount: EVIL }] });
  assertInert(html);
  // An escaped id stays inside its attribute.
  assert.ok(html.includes('data-id="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"'));
});

test('a normal state renders its numbers as before', () => {
  const html = renderEverything(ST => {
    const s = ST.defaultState();
    s.quests.side[0].xp = 150;
    s.finances.holdings = [{ id: 'h1', label: 'USDT', amount: 855.8, rateToCAD: 1.406 }];
    return s;
  });
  assert.ok(html.includes('+150 XP'));
  assert.ok(html.includes('value="1.406"'));
  assert.ok(html.includes('$1,203.25'));
  assert.ok(html.includes('1.20 CAPS'));
  assert.ok(html.includes('data-id="s1"'));
});
