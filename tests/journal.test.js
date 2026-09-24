// The offline journal rules (js/ai.js): whole words or phrases, accents and
// case ignored, English and French, and a proposal is XP + skills only.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers');

const app = loadApp();
const ai = app.ST.ai;
const skills = text => app.plain(ai.localHeuristic(text).skillGains.map(g => g.skill));

test('English examples', () => {
  assert.deepEqual(skills('Went to the gym, then read a book.'), ['SURVIVAL', 'KNOWLEDGE']);
  assert.deepEqual(skills('Called my mom and cooked dinner'), ['SPEECH', 'COOKING']);
  assert.deepEqual(skills('Practiced guitar for an hour'), ['MUSIC']);
  assert.deepEqual(skills('Did a 25 minute pomodoro with my phone off'), ['CONCENTRATION']);
  assert.deepEqual(skills('Paid off a debt and updated my budget'), ['FINANCE']);
  assert.deepEqual(skills('Sent two job applications'), ['BUSINESS']);
});

test('French examples, with and without accents', () => {
  assert.deepEqual(skills("J'ai étudié à la bibliothèque puis j'ai couru 5 km"), ['SURVIVAL', 'KNOWLEDGE']);
  assert.deepEqual(skills("J'AI ETUDIE A LA BIBLIOTHEQUE"), ['KNOWLEDGE']);
  assert.deepEqual(skills('Soirée avec les potes, on a fait à manger'), ['SPEECH', 'COOKING']);
  assert.deepEqual(skills('Je suis allé à la salle ce matin'), ['SURVIVAL']);
  assert.deepEqual(skills("J'ai médité sans mon téléphone"), ['CONCENTRATION']);
  assert.deepEqual(skills('Travaillé sur mon projet'), ['BUSINESS']);
  assert.deepEqual(skills('Une belle œuvre, une vraie leçon'), ['KNOWLEDGE']);   // œ and ç handled
});

test('whole words only, never a fragment', () => {
  assert.deepEqual(skills('I examined the report'), []);          // "ami" is inside "examined"
  assert.deepEqual(skills('Carbon footprint'), []);               // "run" isn't matched inside words
  assert.deepEqual(skills("Mon ami m'a appelé"), ['SPEECH']);
});

test('the longest phrase wins, and non-activities are ignored', () => {
  assert.deepEqual(skills('I worked out this morning'), ['SURVIVAL']);         // not BUSINESS
  assert.deepEqual(skills('We ran out of milk'), []);
  assert.deepEqual(skills('It all worked out in the end'), []);
  assert.deepEqual(skills('Course à pied au parc'), ['SURVIVAL']);            // not KNOWLEDGE's "course"
  assert.deepEqual(skills('Called it a day early'), []);
});

test('XP: 8 for any entry, plus each activity once, at most 100', () => {
  assert.equal(ai.localHeuristic('Nothing special today').xp, 8);
  assert.equal(ai.localHeuristic('gym gym gym gym').xp, 28);                    // counted once
  const all = ai.localHeuristic('gym, study, focus, friends, cook, guitar, budget, work');
  assert.equal(all.xp, 100);
  assert.equal(all.skillGains.length, 2);                                      // at most 2 skill gains
  assert.equal(all.reason, 'Physical activity + Learning / studying');         // the first 2 reasons
  assert.equal(ai.localHeuristic('Nothing special today').reason, 'Logged your day');
});

test('empty and very long entries', () => {
  assert.deepEqual(app.plain(ai.localHeuristic('')), { xp: 8, reason: 'Logged your day', skillGains: [] });
  assert.deepEqual(app.plain(ai.localHeuristic('   \n  ')), { xp: 8, reason: 'Logged your day', skillGains: [] });
  const long = 'blah '.repeat(50000) + 'went for a run';
  assert.deepEqual(skills(long), ['SURVIVAL']);
});

test('an AI proposal is only XP and real skills (never S.P.E.C.I.A.L.)', () => {
  const p = app.plain(ai.sanitizeProposal({
    xp: 9999, reason: 'x'.repeat(200), extra: 'dropped',
    skillGains: [{ skill: 'STR', amount: 3 }, { skill: 'MUSIC', amount: 50 }, { skill: 'COOKING', amount: 'a' }, { skill: 'SPEECH', amount: 1 }]
  }));
  assert.deepEqual(p, { xp: 150, reason: 'x'.repeat(80), skillGains: [{ skill: 'MUSIC', amount: 5 }, { skill: 'COOKING', amount: 1 }] });
  assert.deepEqual(app.plain(ai.sanitizeProposal(null)), { xp: 10, reason: 'Logged activity', skillGains: [] });
});
