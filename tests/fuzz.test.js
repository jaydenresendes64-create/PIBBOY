// A damaged backup never breaks the app. A phone used every way
// (helpers.usedPhone) is exported, then damaged at 1 to 5 random places:
// a field given junk (the wrong type, a huge or negative number, HTML, a
// list where an object belongs...) or removed. 400 rounds, from a fixed
// seed, so a failure comes back the same each run; FUZZ_ROUNDS and
// FUZZ_SEED run more or others (20,000 over 4 seeds passed, 2026-10-23):
//   FUZZ_ROUNDS=5000 FUZZ_SEED=2 node --test tests/fuzz.test.js
// Each time the import gate (sanitizeImported) mustn't throw; what it
// gives must come back the same through a second pass; and every screen
// (VITALS' check-in and trials too) must draw it with no NaN, "undefined"
// or "[object Object]" showing.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { usedPhone } = require('./helpers');

const ROUNDS = Number(process.env.FUZZ_ROUNDS) || 400;
const SEED = Number(process.env.FUZZ_SEED) || 20261023;
const JUNK = [null, true, false, 0, -1, 2.5, -1e21, 1e21, '', 'x', '-3', '1e999', '2026-13-45',
  '<img src=x onerror=alert(1)>', [], [1, 'a', null], {}, { a: 1 }, 'REMOVE'];

// mulberry32: small, seeded, the same numbers on every machine
function random(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Every place in the document a value sits: [path, ...].
function places(doc, path, out) {
  if (doc && typeof doc === 'object') {
    Object.keys(doc).forEach(k => { out.push(path.concat(k)); places(doc[k], path.concat(k), out); });
  }
  return out;
}
function damage(doc, rand) {
  const all = places(doc, [], []), done = [];
  for (let n = 1 + Math.floor(rand() * 5); n > 0; n--) {
    const path = all[Math.floor(rand() * all.length)], junk = JUNK[Math.floor(rand() * JUNK.length)];
    let parent = doc;
    for (let i = 0; i < path.length - 1 && parent && typeof parent === 'object'; i++) parent = parent[path[i]];
    if (!parent || typeof parent !== 'object') continue;
    const key = path[path.length - 1];
    if (junk === 'REMOVE') delete parent[key]; else parent[key] = JSON.parse(JSON.stringify(junk));
    done.push(path.join('.') + ' = ' + JSON.stringify(junk));
  }
  return done;
}

test('a backup damaged at random places: imported without throwing, stable, and drawn with no NaN or undefined', () => {
  const { app, ST, s } = usedPhone();
  const backup = JSON.stringify(s);
  const rand = random(SEED);
  const screens = ['tab-status', 'tab-quests', 'tab-items', 'tab-log', 'tab-vitals'];
  let kept = 0;
  for (let round = 0; round < ROUNDS; round++) {
    const doc = JSON.parse(backup);
    const what = damage(doc, rand);
    const where = 'seed ' + SEED + ' round ' + round + ': ' + what.join(', ');
    let out;
    assert.doesNotThrow(() => { out = ST.sanitizeImported(doc); }, where);
    if (!out) continue;                                       // not a state document any more: refused
    kept++;
    const once = app.plain(out);
    assert.deepEqual(app.plain(ST.sanitizeImported(JSON.parse(JSON.stringify(out)))), once, 'a second pass changes it, ' + where);
    ST.app.state = out;
    ST.app.vitalsView = round % 2 ? 'trials' : 'checkin';
    assert.doesNotThrow(() => { ST.render.renderAll(); ST.vitals.render(); ST.vitals.stop(); ST.trials.stop(); }, where);
    const html = screens.map(id => (app.elements[id] ? app.elements[id].innerHTML : '')).join('\n');
    const bad = /NaN|undefined|\[object Object\]/.exec(html);
    assert.equal(bad && html.slice(Math.max(0, bad.index - 80), bad.index + 40), null, where);
  }
  assert.ok(kept > ROUNDS * 0.9, 'most damaged backups are still a state document: ' + kept);
});
