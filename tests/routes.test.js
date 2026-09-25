// Routes (js/routes.js): a road trip's road, as an encoded polyline in the
// save; simplified, read back safely, cleared through the fog along it.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

const app = loadApp({ files: FILES.routes });
const ST = app.ST;
const R = ST.routes;
const near = (a, b, tolerance) => assert.ok(Math.abs(a - b) <= tolerance, a + ' is not ' + b + ' ± ' + tolerance);
const fresh = () => { ST.app.state = ST.defaultState(); return ST.app.state; };
const TORONTO = { name: 'Toronto', lat: 43.70011, lon: -79.4163 };
const OTTAWA = { name: 'Ottawa', lat: 45.41117, lon: -75.69812 };
const MONTREAL = { name: 'Montréal', lat: 45.50884, lon: -73.58781 };
const VANCOUVER = { name: 'Vancouver', lat: 49.24966, lon: -123.11934 };

// A road along a straight line from a to b, a point every ~100 m.
function straightRoad(a, b, count) {
  const pts = [];
  for (let i = 0; i < count; i++) pts.push(a.lat + (b.lat - a.lat) * i / (count - 1), a.lon + (b.lon - a.lon) * i / (count - 1));
  return pts;
}

test('encodePath/decodePath: Google\'s example, and a round trip to 5 decimals', () => {
  const pts = [38.5, -120.2, 40.7, -120.95, 43.252, -126.453];
  assert.equal(ST.encodePath(pts), '_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.deepEqual(Array.from(ST.decodePath('_p~iF~ps|U_ulLnnqC_mqNvxq`@')), pts);
  const road = [45.50884, -73.58781, -33.86785, 151.20732, 0, 0, 89.99999, -179.99999];
  assert.deepEqual(Array.from(ST.decodePath(ST.encodePath(road))), road);
});

test('decodePath: anything that is not a road is refused', () => {
  const good = ST.encodePath([45.5, -73.6, 45.4, -75.7]);
  assert.equal(ST.decodePath(good.slice(0, -1)), null);           // cut short
  assert.equal(ST.decodePath('abc def'), null);                   // a space isn't in the alphabet
  assert.equal(ST.decodePath('<script>'), null);
  assert.equal(ST.decodePath(ST.encodePath([95, 0])), null);       // off the Earth
  assert.equal(ST.decodePath(42), null);
  assert.deepEqual(Array.from(ST.decodePath('')), []);
});

test('simplify: a straight road keeps its ends; a real bend stays', () => {
  const line = straightRoad(TORONTO, OTTAWA, 3000);
  assert.deepEqual(Array.from(R.simplify(line, 40)), [TORONTO.lat, TORONTO.lon, OTTAWA.lat, OTTAWA.lon]);
  // A detour 2 km off the line halfway: kept at 40 m, not at 5 km.
  const bent = straightRoad(TORONTO, OTTAWA, 101);
  bent[100] += 0.018;                                               // point 50, ~2 km north
  assert.equal(R.simplify(bent, 40).length, 10);                   // the ends, and the spike with its two feet
  assert.equal(R.simplify(bent, 5000).length, 4);
  assert.deepEqual(Array.from(R.simplify([1, 2, 3, 4], 40)), [1, 2, 3, 4]);
});

test('requestUrl and fromAnswer: OSRM\'s lon,lat order; no road and odd answers', () => {
  const url = R.requestUrl([TORONTO, OTTAWA]);
  assert.match(url, /^https:\/\/router\.project-osrm\.org\/route\/v1\/driving\/-79\.41630,43\.70011;-75\.69812,45\.41117\?overview=full&geometries=polyline/);
  const geometry = ST.encodePath(straightRoad(TORONTO, OTTAWA, 500));
  const out = R.fromAnswer({ code: 'Ok', routes: [{ geometry, distance: 450321 }] });
  assert.equal(out.km, 450.3);
  assert.deepEqual(Array.from(ST.decodePath(out.path)), [TORONTO.lat, TORONTO.lon, OTTAWA.lat, OTTAWA.lon]);
  assert.throws(() => R.fromAnswer({ code: 'NoRoute', routes: [] }), /noroad/);
  assert.throws(() => R.fromAnswer({ code: 'Ok', routes: [{ geometry: '!!', distance: 1 }] }), /bad/);
  assert.throws(() => R.fromAnswer(null), /bad/);
});

test('adding a route: named after its stops, in the save, removed by id', () => {
  const s = fresh();
  const route = R.addRoute([TORONTO, OTTAWA, MONTREAL], { path: ST.encodePath([TORONTO.lat, TORONTO.lon, MONTREAL.lat, MONTREAL.lon]), km: 649 });
  assert.equal(route.name, 'Toronto → Ottawa → Montréal');
  assert.equal(s.map.routes.length, 1);
  assert.deepEqual(app.plain(route.stops), [TORONTO, OTTAWA, MONTREAL]);
  assert.equal(ST.places.countsText(ST.places.counts()), '0 countries · 0 cities · 0 regions · 0 pins · 1 route');
  // It survives a backup, exactly.
  const back = app.plain(ST.sanitizeImported(JSON.parse(JSON.stringify(s))));
  assert.deepEqual(back.map.routes, app.plain(s.map.routes));
  assert.equal(R.removeRoute(route.id), true);
  assert.equal(R.removeRoute(route.id), false);
  assert.equal(s.map.routes.length, 0);
});

test('stops offered: your cities and pins, the nearest to the last stop first', () => {
  const s = fresh();
  s.map.cities = [VANCOUVER, MONTREAL, TORONTO].map((c, i) => Object.assign({ id: 'c' + i, cc: 'CA', radius: 10000, date: '2026-9-1', note: '' }, c));
  s.map.pins = [Object.assign({ id: 'p1', cc: 'CA', radius: 500, date: '2026-9-1', note: '' }, OTTAWA)];
  assert.deepEqual(R.candidates([]).map(c => c.name), ['Montréal', 'Ottawa', 'Toronto', 'Vancouver']);
  const next = R.candidates([TORONTO]);
  assert.deepEqual(next.map(c => c.name), ['Ottawa', 'Montréal', 'Vancouver']);   // Toronto itself isn't offered again
  near(next[0].km, 353, 5);
  assert.ok(next[2].km > 3000);
});

test('geometry: the road on the 0-1 world, its length so far, its box', () => {
  const g = R.geometry({ path: ST.encodePath([TORONTO.lat, TORONTO.lon, OTTAWA.lat, OTTAWA.lon, MONTREAL.lat, MONTREAL.lon]) });
  assert.equal(g.isRoute, true);
  assert.equal(g.cum.length, 3);
  assert.equal(g.cum[0], 0);
  assert.ok(g.cum[1] > 0 && g.cum[2] > g.cum[1]);
  assert.deepEqual(Array.from(g.lonBox), [TORONTO.lon, TORONTO.lat, MONTREAL.lon, MONTREAL.lat]);
  near(g.merc[0], ST.places.mercX(TORONTO.lon), 1e-12);
});

test('the fog: a corridor 3 km wide along the road, never thinner than 5 pixels', () => {
  const F = ST.fog;
  const g = R.geometry({ path: ST.encodePath(straightRoad(TORONTO, OTTAWA, 50)) });
  const mid = { lat: (TORONTO.lat + OTTAWA.lat) / 2, lon: (TORONTO.lon + OTTAWA.lon) / 2 };
  const close = F.viewOf(mid.lon, mid.lat, 12, 400, 800);
  const s = F.routeOnScreen(close, g, 1);
  near(s.half, F.ROUTE_HALF_M * ST.places.pixelsPerMetre(g.lat, close.world), 1e-9);
  assert.ok(s.segs.length >= 4 && s.segs.length < 50 * 4);          // only the pieces near the screen
  const far = F.viewOf(mid.lon, mid.lat, 3, 400, 800);
  const z = F.routeOnScreen(far, g, 1);
  assert.equal(z.half, F.ROUTE_MIN_PX);
  assert.ok(z.segs.length / 4 <= 25, 'close points merged zoomed out: ' + z.segs.length / 4);   // 49 pieces, under a pixel each
  const elsewhere = F.viewOf(2.35, 48.85, 10, 400, 800);             // Paris
  assert.equal(F.routeOnScreen(elsewhere, g, 1), null);
});

test('the fog: a new route clears from its first stop to its last', () => {
  const F = ST.fog;
  const g = R.geometry({ path: ST.encodePath([TORONTO.lat, TORONTO.lon, OTTAWA.lat, OTTAWA.lon]) });
  const view = F.viewOf(-77.5, 44.5, 5, 800, 800);
  const all = F.routeOnScreen(view, g, 1), half = F.routeOnScreen(view, g, 0.5);
  assert.deepEqual(half.segs.slice(0, 2), all.segs.slice(0, 2));    // starts at Toronto
  near(half.segs[2], (all.segs[0] + all.segs[2]) / 2, 0.5);          // halfway to Ottawa
  near(half.segs[3], (all.segs[1] + all.segs[3]) / 2, 0.5);
  assert.equal(F.routeOnScreen(view, g, 0), null);
  // A route clears in over ROUTE_REVEAL_MS, not the places' REVEAL_MS.
  const reveals = F.makeReveals();
  reveals.update([], 0, false);
  reveals.update([{ key: 't:1', item: g, ms: F.ROUTE_REVEAL_MS }], 0, false);
  const at = reveals.update([{ key: 't:1', item: g, ms: F.ROUTE_REVEAL_MS }], F.REVEAL_MS, false);
  assert.ok(at.moving && at.list[0].value < 1);
});

test('sanitize: a broken road is dropped; names stay text; stops cleaned', () => {
  const s = fresh();
  const path = ST.encodePath([TORONTO.lat, TORONTO.lon, OTTAWA.lat, OTTAWA.lon]);
  s.map.routes = [
    { id: 'r1', name: '<img src=x onerror=alert(1)>', stops: [Object.assign({ extra: 1 }, TORONTO), { name: 'Nowhere', lat: 'x', lon: 5 }, OTTAWA],
      path, km: '450.3', date: '2026-09-24', note: 'n' },
    { id: 'r2', name: 'Broken', stops: [], path: path.slice(0, -1), km: 1, date: null, note: '' },
    { id: 'r3', name: 'One point', stops: [], path: ST.encodePath([1, 2]), km: 1, date: null, note: '' },
    { id: '"><b>', name: '', stops: 'lots', path, km: -4, date: 'x', note: null },
    null, 'route'
  ];
  const out = app.plain(ST.sanitizeImported(JSON.parse(JSON.stringify(s)))).map.routes;
  assert.equal(out.length, 2);
  assert.equal(out[0].name, '<img src=x onerror=alert(1)>');       // kept as text: the page escapes it
  assert.deepEqual(out[0].stops, [TORONTO, OTTAWA]);
  assert.deepEqual([out[0].km, out[0].date], [450.3, '2026-9-24']);
  assert.match(out[1].id, /^[A-Za-z0-9_-]{1,40}$/);
  assert.deepEqual([out[1].name, out[1].stops, out[1].km, out[1].date, out[1].note], ['Route', [], 0, null, '']);
});

test('a save from before routes gets none, and nothing else changes', () => {
  const s = app.plain(ST.defaultState());
  delete s.map.routes;
  const out = app.plain(ST.sanitizeImported(JSON.parse(JSON.stringify(s))));
  assert.deepEqual(out.map.routes, []);
  s.map.routes = [];
  assert.deepEqual(out, s);
});
