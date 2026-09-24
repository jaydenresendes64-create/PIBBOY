// js/places.js: the MAP tab's logic (positions, the city and region lists,
// finding places by name, revealing them).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

const app = loadApp({ files: FILES.places });
const ST = app.ST;
const P = ST.places;
const near = (a, b, tolerance) => assert.ok(Math.abs(a - b) <= tolerance, a + ' is not ' + b + ' ± ' + tolerance);

test('positions: Web Mercator from 0 to 1 across the world', () => {
  assert.equal(P.mercX(-180), 0);
  assert.equal(P.mercX(0), 0.5);
  assert.equal(P.mercX(180), 1);
  near(P.mercY(0), 0.5, 1e-12);
  near(P.mercY(P.MAX_LAT), 0, 1e-9);
  near(P.mercY(-P.MAX_LAT), 1, 1e-9);
  assert.equal(P.mercY(90), P.mercY(89.9999));             // the poles are kept on the map
  assert.ok(P.mercY(45.5) < 0.5);                          // north is up
});

test('sizes in real metres: pixels per metre by zoom and latitude', () => {
  const zoom10 = 256 * 1024;
  near(P.pixelsPerMetre(0, zoom10), 1 / 152.874, 1e-5);   // the known 152.87 m per pixel at zoom 10
  near(P.pixelsPerMetre(60, zoom10), 2 * P.pixelsPerMetre(0, zoom10), 1e-9);   // twice as big at 60°
  near(P.pixelsPerMetre(45, zoom10 * 2), 2 * P.pixelsPerMetre(45, zoom10), 1e-12);
});

test('distance: great-circle metres', () => {
  near(P.distance(45.509, -73.588, 45.509, -73.588), 0, 1e-6);
  near(P.distance(45.509, -73.588, 48.857, 2.352), 5510e3, 15e3);       // Montréal - Paris
  near(P.distance(0, 179.9, 0, -179.9), 22.2e3, 0.2e3);                 // across the date line
});
