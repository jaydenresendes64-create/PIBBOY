// The MAP's lists of cities, regions and pins: the latest 10 of each, newest
// first, then "10 more (N older)"; the place open in the panel shows
// wherever it is in the list. A bulk list or a year of travel would
// otherwise make each list hundreds of rows long.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers');

const FILES_MAP = ['js/state.js', 'js/storage.js', 'js/places.js', 'js/fog.js', 'js/routes.js', 'js/bulk.js', 'js/map.js'];

function mapWith(cities) {
  const a = loadApp({ files: FILES_MAP });
  const ST = a.ST;
  ST.app.state = ST.defaultState();
  for (let i = 0; i < cities; i++) ST.app.state.map.cities.push({ id: 'c' + i, name: 'City ' + i, cc: 'CA', lat: 45, lon: -73, radius: 9000, date: '2026-10-1', note: '' });
  const lists = () => { ST.map.renderLists(); return a.elements['map-lists'].innerHTML; };
  const names = html => [...html.matchAll(/data-kind="city" data-id="(c\d+)"/g)].map(m => m[1]);
  return { a, ST, lists, names };
}

test('the latest 10 places, newest first, then how many more', () => {
  const { lists, names } = mapWith(25);
  const html = lists();
  assert.match(html, /Cities <span class="panel-count">25<\/span>/);
  assert.deepEqual(names(html), ['c24', 'c23', 'c22', 'c21', 'c20', 'c19', 'c18', 'c17', 'c16', 'c15']);
  assert.match(html, /<button class="place-more" data-map="list-more" data-kind="city" data-shown="10">10 more \(15 older\)<\/button><\/div>/);
});

test('ten or fewer: all of them, no "more"', () => {
  const { lists, names } = mapWith(10);
  const html = lists();
  assert.equal(names(html).length, 10);
  assert.doesNotMatch(html, /place-more/);
});

test('the place open in the panel shows even when it is older than the ten', () => {
  const { ST, lists, names } = mapWith(25);
  ST.map.openPanel({ kind: 'place', type: 'city', id: 'c3' });
  const html = lists();
  assert.equal(names(html).length, 22);                       // c24 down to c3
  assert.match(html, /class="place-row selected" data-map="open" data-kind="city" data-id="c3"/);
  assert.match(html, /data-shown="22">3 more \(3 older\)<\/button>/);
});
