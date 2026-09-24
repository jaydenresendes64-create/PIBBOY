// The MAP tab's vector map: bounds to show places, where tiles come from,
// the offline "grid" tile, the Pip-Boy style (data/map-style.json) and what
// sw.js keeps for offline use.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp, FILES, ROOT } = require('./helpers');

const app = loadApp({ files: FILES.places });
const ST = app.ST;
const P = ST.places;
const near = (a, b, tolerance) => assert.ok(Math.abs(a - b) <= tolerance, a + ' is not ' + b + ' ± ' + tolerance);
const fresh = () => { ST.app.state = ST.defaultState(); return ST.app.state; };
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('boundsAround: a square of real metres around a point', () => {
  const [[w, s], [e, n]] = P.boundsAround(45.5, -73.57, 10000);
  near(P.distance(s, -73.57, n, -73.57), 10000, 5);           // 10 km north to south
  near(P.distance(45.5, w, 45.5, e), 10000, 30);              // 10 km west to east
  const [[w2], [e2]] = P.boundsAround(0, 179.99, 10000);      // kept on the map at the date line
  assert.ok(w2 < 179.99 && e2 === 180);
  const [[, s3], [, n3]] = P.boundsAround(89.9, 0, 10000);
  assert.ok(s3 < n3 && n3 <= P.MAX_LAT);
});

test('placesBounds: every circle and loaded region, or null', async () => {
  const s = fresh();
  assert.equal(P.placesBounds(), null);
  s.map.cities.push({ id: 'a', name: 'Montréal', cc: 'CA', lat: 45.5, lon: -73.57, radius: 14000, date: null, note: '' });
  s.map.pins.push({ id: 'b', name: 'Café', cc: 'FR', lat: 48.85, lon: 2.35, radius: 500, date: null, note: '' });
  let [[w, south], [e, n]] = P.placesBounds();
  assert.ok(w < -73.57 && e > 2.35 && south < 45.5 && n > 48.85);
  near(P.distance(45.5, w, 45.5, -73.57), 14000, 50);          // the circle's whole radius is in
  s.map.regions.push({ id: 'c', name: 'Manitoba', cc: 'CA', code: 'CAN-630', date: null, note: '' });
  await P.loadShapes('CA');
  [[w, south], [e, n]] = P.placesBounds();
  assert.ok(south < 49 && n >= 60);                            // Manitoba: 49° to 60° north
});

test('tileUrl: omt:// tiles come from OpenFreeMap, nothing else does', () => {
  assert.equal(P.tileUrl('omt://planet/14/4823/5863'), 'https://tiles.openfreemap.org/planet/latest/14/4823/5863.pbf');
  assert.equal(P.tileUrl('omt://planet/0/0/0'), 'https://tiles.openfreemap.org/planet/latest/0/0/0.pbf');
  ['omt://planet/15/0/0', 'omt://planet/2/4/0', 'omt://planet/2/0/4', 'omt://planet/1/0', 'https://evil.example/1/0/0',
    'omt://planet/1/0/0/../x', 'omt://other/1/0/0', '', null].forEach(url => assert.equal(P.tileUrl(url), null, String(url)));
});

// A minimal reader for what noDataTile() writes (protobuf varints and fields).
function readMessage(bytes) {
  const out = []; let i = 0;
  const varint = () => { let n = 0, shift = 1, b; do { b = bytes[i++]; n += (b & 127) * shift; shift *= 128; } while (b & 128); return n; };
  while (i < bytes.length) {
    const key = varint(), tag = key >> 3, type = key & 7;
    if (type === 0) out.push({ tag, value: varint() });
    else if (type === 2) { const len = varint(); out.push({ tag, bytes: bytes.slice(i, i + len) }); i += len; }
    else throw new Error('unexpected wire type ' + type);
  }
  return out;
}
test('noDataTile: a vector tile with one square covering the tile, in the "nodata" layer', () => {
  const tile = readMessage(new Uint8Array(P.noDataTile()));
  assert.deepEqual(tile.map(f => f.tag), [3]);                         // one layer
  const layer = readMessage(tile[0].bytes);
  const get = tag => layer.filter(f => f.tag === tag);
  assert.equal(Buffer.from(get(1)[0].bytes).toString(), 'nodata');
  assert.equal(get(5)[0].value, 4096);                                 // extent
  assert.equal(get(15)[0].value, 2);                                   // version
  const feature = readMessage(get(2)[0].bytes);
  assert.equal(feature.find(f => f.tag === 3).value, 3);               // a polygon
  const g = readMessage(Uint8Array.from([34, ...[feature.find(f => f.tag === 4).bytes.length], ...feature.find(f => f.tag === 4).bytes]))[0].bytes;
  // Decode the geometry: move to, line to x3, close; the square's corners.
  const nums = []; for (let i = 0; i < g.length;) { let n = 0, s = 1, b; do { b = g[i++]; n += (b & 127) * s; s *= 128; } while (b & 128); nums.push(n); }
  const unzig = n => (n % 2 ? -(n + 1) / 2 : n / 2);
  assert.equal(nums[0], 9); assert.equal(nums[3], 26); assert.equal(nums[10], 15);
  let x = 0, y = 0; const corners = [];
  [[1, 2], [4, 5], [6, 7], [8, 9]].forEach(([a, b]) => { x += unzig(nums[a]); y += unzig(nums[b]); corners.push([x, y]); });
  assert.deepEqual(corners, [[-64, -64], [4160, -64], [4160, 4160], [-64, 4160]]);
  let area = 0;                                                        // clockwise on screen: an outer ring
  corners.forEach((c, k) => { const d = corners[(k + 1) % 4]; area += c[0] * d[1] - d[0] * c[1]; });
  assert.ok(area > 0);
});

// ---------- the style ----------
const style = JSON.parse(read('data/map-style.json'));
const OPENMAPTILES = ['water', 'waterway', 'landcover', 'landuse', 'mountain_peak', 'park', 'boundary', 'aeroway', 'transportation',
  'building', 'water_name', 'transportation_name', 'place', 'housenumber', 'poi', 'aerodrome_label'];

test('style: one OpenFreeMap source through omt://, no key, credit shown', () => {
  assert.equal(style.version, 8);
  assert.deepEqual(Object.keys(style.sources), ['omt']);
  const src = style.sources.omt;
  assert.equal(src.type, 'vector');
  assert.deepEqual(src.tiles, ['omt://planet/{z}/{x}/{y}']);
  assert.equal(src.maxzoom, 14);
  assert.match(src.attribution, /OpenMapTiles/);
  assert.match(src.attribution, /OpenStreetMap/);
  assert.equal(style.glyphs, undefined);                               // labels use the app's own fonts
  assert.equal(style.sprite, undefined);
  assert.doesNotMatch(JSON.stringify(style), /key=|api_key|access_token/);
});

test('style: labels in the app\'s two fonts, whose files exist', () => {
  const faces = style['font-faces'];
  assert.deepEqual(Object.keys(faces).sort(), ['IBM Plex Mono', 'VT323']);
  Object.values(faces).forEach(list => list.forEach(face => {
    assert.ok(fs.existsSync(path.join(ROOT, face.url)), face.url);
    assert.ok(face['unicode-range'].length > 0);
  }));
  const symbols = style.layers.filter(l => l.type === 'symbol');
  assert.ok(symbols.length >= 10);
  symbols.forEach(l => {
    assert.equal(l.layout['text-font'].length, 1, l.id);
    assert.ok(faces[l.layout['text-font'][0]], l.id + ' uses an undeclared font');
  });
});

test('style: every layer reads a real OpenMapTiles layer (or the offline grid)', () => {
  const ids = new Set();
  style.layers.forEach(l => {
    assert.ok(!ids.has(l.id), 'two layers called ' + l.id);
    ids.add(l.id);
    if (l.type === 'background') return;
    assert.equal(l.source, 'omt', l.id);
    assert.ok(OPENMAPTILES.includes(l['source-layer']) || (l.id === 'nodata-grid' && l['source-layer'] === 'nodata'), l.id);
  });
  assert.equal(style.layers[0].type, 'background');
  assert.equal(style.layers[1].id, 'nodata-grid');                     // right above the background
  ['road-motorway', 'road-primary', 'road-minor', 'building-outline', 'water', 'label-road-minor', 'label-poi',
    'label-transit', 'label-housenumber', 'railway', 'label-city'].forEach(id => assert.ok(ids.has(id), id));
});

// Every colour, in any expression: amber hues on near-black, never another colour.
function colours(value, out) {
  if (typeof value === 'string' && /^(#|rgba?\()/.test(value)) out.push(value);
  else if (value && typeof value === 'object') Object.values(value).forEach(v => colours(v, out));
  return out;
}
function hsl(colour) {
  let r, g, b;
  if (colour[0] === '#') [r, g, b] = [1, 3, 5].map(i => parseInt(colour.slice(i, i + 2), 16));
  else [r, g, b] = colour.match(/[\d.]+/g).map(Number);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 510;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: d / 255, l };
}
test('style: amber on near-black', () => {
  const all = colours(style.layers, []);
  assert.ok(all.length > 30);
  all.forEach(c => {
    const { h, l } = hsl(c);
    assert.ok(h >= 20 && h <= 45, c + ' is not amber');
    assert.ok(l < 0.75, c + ' is too bright');
  });
  assert.ok(hsl(style.layers[0].paint['background-color']).l < 0.03);
  // Major roads brighter and thicker than minor ones.
  const layer = id => style.layers.find(l => l.id === id);
  assert.ok(hsl(layer('road-motorway').paint['line-color']).l > hsl(layer('road-minor').paint['line-color']).l);
  const widthAt = (id, z) => { const w = layer(id).paint['line-width']; const i = w.indexOf(z, 3); return w[i + 1]; };
  assert.ok(widthAt('road-motorway', 18) > widthAt('road-minor', 18));
});

// ---------- offline ----------
test('sw.js: every app file it keeps exists, including MapLibre, the style and the fog', () => {
  const sw = read('sw.js');
  const shell = eval(sw.match(/var APP_SHELL = (\[[\s\S]*?\]);/)[1]);
  shell.filter(f => f !== './').forEach(f => assert.ok(fs.existsSync(path.join(ROOT, f)), f + ' is missing'));
  ['vendor/maplibre/maplibre-gl.mjs', 'vendor/maplibre/maplibre-gl-shared.mjs', 'vendor/maplibre/maplibre-gl-worker.mjs',
    'vendor/maplibre/maplibre-gl.css', 'data/map-style.json', 'js/fog.js', 'fonts/vt323.woff2', 'fonts/ibm-plex-mono.woff2'].forEach(f => assert.ok(shell.includes(f), f));
  // Every script of the page is kept.
  [...read('index.html').matchAll(/<script defer src="([^"]+)">/g)].forEach(m => assert.ok(shell.includes(m[1]), m[1]));
  assert.match(sw, /var TILE_HOST = 'tiles\.openfreemap\.org';/);
  assert.doesNotMatch(sw, /leaflet|cartocdn/i);
});

test('index.html: the map may only reach OpenFreeMap', () => {
  const csp = read('index.html').match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /connect-src 'self' https:\/\/tiles\.openfreemap\.org;/);
  assert.match(csp, /script-src 'self' file:;/);                      // the map's worker is a file of the app
  assert.doesNotMatch(csp, /cartocdn|unsafe-eval/);
});
