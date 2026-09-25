// The MAP's scanner (js/radar.js): its blips are the biggest cities in view
// not yet on the map, lit by the sweep and fading like phosphor.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp, FILES, ROOT } = require('./helpers');

const app = loadApp({ files: FILES.radar });
const ST = app.ST;
const P = ST.places, RD = ST.radar;
const DB = P.parsePlaces(fs.readFileSync(path.join(ROOT, 'data/places.txt'), 'utf8'));
P.useData(DB);
const near = (a, b, tolerance) => assert.ok(Math.abs(a - b) <= tolerance, a + ' is not ' + b + ' ± ' + tolerance);
// Southern Ontario and Québec: Toronto to Québec City.
const BOX = [[-80, 42.5], [-71, 47]];

test('blips: the biggest undiscovered cities in view, biggest first, at most the limit', () => {
  const found = RD.candidates(DB.cities, BOX, () => false, 5);
  assert.deepEqual(Array.from(found, c => c.name), ['Toronto', 'Montréal', 'Ottawa', 'Mississauga', 'Brampton']);
  for (let i = 1; i < found.length; i++) assert.ok(found[i - 1].pop >= found[i].pop);
  assert.ok(found.every(c => c.lon >= -80 && c.lon <= -71 && c.lat >= 42.5 && c.lat <= 47));
});

test('blips: cities already on the map are left out', () => {
  const visited = new Set(['Toronto', 'Montréal']);
  const found = RD.candidates(DB.cities, BOX, c => visited.has(c.name), 3);
  assert.deepEqual(Array.from(found, c => c.name), ['Ottawa', 'Mississauga', 'Brampton']);
  assert.equal(RD.candidates(DB.cities, [[10, -1], [10.001, -0.999]], () => false, 5).length, 0);    // open sea
});

test('the sweep: a blip is brightest as it passes, then fades, never quite out', () => {
  const blip = 1.0;
  near(RD.glow(blip, blip), 1, 1e-9);                          // the sweep on it
  const later = RD.glow(blip + 0.5, blip);                     // the sweep a little past it
  assert.ok(later < 1 && later > 0.14);
  assert.equal(RD.glow(blip - 0.01, blip), 0.14);              // about to be crossed: the dimmest
  assert.ok(RD.glow(blip + 0.2, blip) > RD.glow(blip + 1, blip));
  near(RD.wrap(-Math.PI / 2), Math.PI * 1.5, 1e-12);
  near(RD.wrap(Math.PI * 5), Math.PI, 1e-12);
});

test('a blip\'s card: the nearest place on the map, and its population', () => {
  ST.app.state = ST.defaultState();
  const kingston = DB.cities.find(c => c.name === 'Kingston' && c.cc === 'CA');
  assert.equal(RD.nearestKnown(kingston), null);                // nothing on the map yet
  ST.app.state.map.cities.push({ id: 'c1', name: 'Montréal', cc: 'CA', lat: 45.50884, lon: -73.58781, radius: 14000, date: null, note: '' },
    { id: 'c2', name: 'Toronto', cc: 'CA', lat: 43.70011, lon: -79.4163, radius: 15000, date: null, note: '' });
  const nearest = RD.nearestKnown(kingston);
  assert.equal(nearest.name, 'Toronto');
  near(nearest.km, 230, 30);
  assert.equal(RD.popText(2600000), '2.6 million');
  assert.equal(RD.popText(132485), '132,000');
});

test('a city inside a revealed city\'s circle (a borough) or pin is already out of the fog', () => {
  ST.app.state = ST.defaultState();
  const m = ST.app.state.map;
  const mtl = DB.cities.find(c => c.name === 'Montréal');
  const laval = DB.cities.find(c => c.name === 'Laval' && c.cc === 'CA');
  const ottawa = DB.cities.find(c => c.name === 'Ottawa');
  assert.equal(RD.covered(laval), false);
  m.cities.push({ id: 'c1', name: 'Montréal', cc: 'CA', lat: mtl.lat, lon: mtl.lon, radius: 20000, date: null, note: '', gid: mtl.gid });
  assert.equal(RD.covered(mtl), true);                          // revealed itself
  assert.equal(RD.covered(laval), true);                        // inside its 20 km circle
  assert.equal(RD.covered(ottawa), false);
  m.pins.push({ id: 'p1', name: 'Parliament', cc: 'CA', lat: ottawa.lat, lon: ottawa.lon, radius: 500, date: null, note: '' });
  assert.equal(RD.covered(ottawa), true);
  const found = RD.candidates(DB.cities, BOX, RD.covered, 3);
  assert.ok(!found.some(c => c.name === 'Laval' || c.name === 'Montréal' || c.name === 'Ottawa'));
});
