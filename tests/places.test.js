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

// ---------- the lists (data/places.txt) and revealing places ----------
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');
const DB = P.parsePlaces(fs.readFileSync(path.join(ROOT, 'data/places.txt'), 'utf8'));
P.useData(DB);
const fresh = () => { ST.app.state = ST.defaultState(); return ST.app.state; };

test('the lists: countries, regions and groups, 15,000+ cities', () => {
  assert.ok(DB.countries.length > 240);
  assert.equal(DB.country.CA.name, 'Canada');
  assert.ok(DB.cities.length > 30000);
  assert.equal(DB.region['CAN-683'].name, 'Québec');
  assert.equal(DB.region['FRA-G-ile-de-france'].isGroup, true);
  const paris = DB.cities.find(c => c.name === 'Paris' && c.cc === 'FR');
  assert.equal(paris.region.group.name, 'Île-de-France');
  // Every code the lists use is one sanitizeImported accepts.
  DB.regions.forEach(r => { assert.match(r.code, ST.REGION_CODE); assert.ok(ST.COUNTRY_CODES.includes(r.cc), r.cc); });
  DB.countries.forEach(c => assert.ok(ST.COUNTRY_CODES.includes(c.cc), c.cc));
  DB.cities.forEach(c => { assert.ok(c.gid > 0); assert.ok(Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180); });
});

test('searchCities: same name first, biggest first, accents and case ignored', () => {
  const r = P.searchCities('montreal');
  assert.equal(r[0].name, 'Montréal');
  assert.equal(r[0].cc, 'CA');
  assert.equal(P.cityWhere(r[0]), 'Québec, Canada');
  const paris = P.searchCities('PARIS');
  assert.equal(paris[0].cc, 'FR');
  assert.ok(paris.some(c => c.cc === 'US'));
  assert.deepEqual(app.plain(P.searchCities('paris, texas').map(c => c.cc)), ['US']);
  assert.ok(P.searchCities('paris, usa').every(c => c.cc === 'US'));
  assert.equal(P.searchCities('').length, 0);
  assert.equal(P.searchCities('zzqqxx').length, 0);
  assert.ok(P.searchCities('san', 5).length === 5);
});

test('findCountry: names, codes and common other names', () => {
  assert.equal(P.findCountry('Canada').cc, 'CA');
  assert.equal(P.findCountry('ma').cc, 'MA');
  assert.equal(P.findCountry('Maroc').cc, 'MA');
  assert.equal(P.findCountry('USA').cc, 'US');
  assert.equal(P.findCountry('États-Unis').cc, 'US');
  assert.equal(P.findCountry('England').cc, 'GB');
  assert.equal(P.findCountry('Atlantis'), null);
});

test('cityRadius: 3 km for a town up to 15 km for a big city', () => {
  assert.equal(P.cityRadius(15000), 3000);
  assert.equal(P.cityRadius(5e6), 15000);
  assert.equal(P.cityRadius(0), 3000);
  const r = P.cityRadius(300000);
  assert.ok(r > 3000 && r < 15000 && r % 500 === 0);
});

test('revealCity: added once, 50 XP the first time only', () => {
  const s = fresh();
  const montreal = P.searchCities('Montréal')[0];
  const first = P.revealCity(montreal);
  assert.equal(first.isNew, true);
  assert.equal(first.reward.xp, ST.CITY_XP);
  assert.deepEqual(Object.keys(first.place).sort(), ['cc', 'date', 'gid', 'id', 'lat', 'lon', 'name', 'note', 'radius']);
  assert.equal(first.place.radius, P.cityRadius(montreal.pop));
  assert.equal(P.revealCity(montreal).isNew, false);         // already there
  assert.equal(s.map.cities.length, 1);
  P.removePlace('city', first.place.id);
  const again = P.revealCity(montreal);
  assert.equal(again.isNew, true);
  assert.equal(again.reward, null);                           // no XP twice
  assert.equal(s.xp, ST.CITY_XP);
  // What it saved passes sanitizeImported unchanged.
  assert.deepEqual(app.plain(ST.sanitizeImported(app.plain(s)).map), app.plain(s.map));
});

test('revealRegion and pins: 100 XP once per region, pins give none', () => {
  const s = fresh();
  const first = P.revealRegion(DB.region['CAN-683']);
  assert.equal(first.reward.xp, ST.REGION_XP);
  assert.equal(P.revealRegion(DB.region['CAN-683']).isNew, false);
  const pin = P.addPin(45.5, -73.57, 'Café', 'CA');
  assert.equal(pin.radius, P.PIN_RADIUS);
  assert.equal(s.xp, ST.REGION_XP);
  P.revealCity({ name: 'Nowhere', cc: 'FR', lat: 1, lon: 2 }, 4000);    // placed by hand
  assert.deepEqual(app.plain(P.counts()), { countries: 2, cities: 1, regions: 1, pins: 1 });
  assert.equal(P.countsText(P.counts()), '2 countries · 1 city · 1 region · 1 pin');
  assert.deepEqual(app.plain(ST.sanitizeImported(app.plain(s)).map), app.plain(s.map));
});

test('region shapes: decoded, and a point is found in its region', async () => {
  const byCode = await P.loadShapes('CA');
  const quebec = byCode['CAN-683'];
  assert.ok(P.inShape(-73.588, 45.509, quebec));             // Montréal
  assert.ok(!P.inShape(-79.38, 43.65, quebec));              // Toronto
  assert.ok(P.inShape(-79.38, 43.65, byCode['CAN-682']));    // Ontario
  const fr = await P.loadShapes('FR');
  assert.ok(P.inShape(2.352, 48.857, fr['FRA-G-ile-de-france']));   // a group holds its members' shapes
  assert.ok(quebec.box[0] < P.mercX(-73.588) && quebec.box[2] > P.mercX(-73.588));
});

test('lookup: the country, region and nearby city of a point', async () => {
  const here = await P.lookup(45.52, -73.58);
  assert.equal(here.cc, 'CA');
  assert.equal(here.region.code, 'CAN-683');
  assert.equal(here.city.name, 'Montréal');
  const casablanca = await P.lookup(33.59, -7.62);
  assert.equal(casablanca.cc, 'MA');
  assert.equal(casablanca.city.name, 'Casablanca');
  const sea = await P.lookup(0, -30);
  assert.equal(sea.cc, '');
  assert.equal(sea.city, null);
  assert.equal(sea.region, null);
});

// ---------- bulk add ----------
test('parseLine: kinds, countries, hints, bullets', () => {
  const l = x => app.plain(P.parseLine(x));
  assert.deepEqual(Object.assign(l('Montréal, Canada'), { country: undefined }),
    { raw: 'Montréal, Canada', kind: 'city', name: 'Montréal', hint: '', country: undefined });
  assert.equal(l('Montréal, Canada').country.cc, 'CA');
  const r = l('region: Casablanca-Settat, Morocco');
  assert.deepEqual([r.kind, r.name, r.country.cc], ['region', 'Casablanca-Settat', 'MA']);
  assert.equal(l('Région : Québec').kind, 'region');
  const s = l('Springfield, Illinois, USA');
  assert.deepEqual([s.name, s.hint, s.country.cc], ['Springfield', 'Illinois', 'US']);
  assert.deepEqual([l('Springfield, Illinois').hint, l('Springfield, Illinois').country], ['Illinois', null]);
  assert.equal(l('- Paris').name, 'Paris');
  assert.equal(l('3. Lyon').name, 'Lyon');
  assert.equal(l('   '), null);
  assert.equal(l(', ,'), null);
});

test('matchLine: found, ambiguous (biggest first), close names, not found', () => {
  const m = x => P.matchLine(P.parseLine(x));
  const montreal = m('Montréal, Canada');
  assert.equal(montreal.status, 'found');
  assert.equal(montreal.options[0].city.gid, 6077243);
  const paris = m('Paris');
  assert.equal(paris.status, 'choose');
  assert.equal(paris.pick, 0);
  assert.equal(paris.options[0].city.cc, 'FR');
  assert.equal(m('Paris, France').status, 'found');
  const springfield = m('Springfield, Illinois');
  assert.equal(springfield.status, 'found');
  assert.equal(P.cityWhere(springfield.options[0].city), 'Illinois, United States');
  const quebec = m('region: quebec');
  assert.equal(quebec.status, 'found');
  assert.equal(quebec.options[0].region.code, 'CAN-683');
  // Natural Earth still has Morocco's old regions: close names to choose from, none chosen.
  const casa = m('region: Casablanca-Settat, Morocco');
  assert.equal(casa.status, 'choose');
  assert.equal(casa.fuzzy, true);
  assert.equal(casa.pick, -1);
  assert.ok(casa.options.some(o => o.region.name === 'Grand Casablanca'));
  assert.equal(m('Île-de-France, France').options[0].region.code, 'FRA-G-ile-de-france');
  const marrakech = m('Marrakech, Morocco');                      // GeoNames writes Marrakesh
  assert.equal(marrakech.status, 'choose');
  assert.equal(marrakech.options[0].city.name, 'Marrakesh');
  assert.equal(m('Atlantis, Greece').status, 'missing');
  assert.equal(m('Qqqqzzz').status, 'missing');
});

test('matchList + revealAll: one pass, XP once per new place, nothing twice', () => {
  const s = fresh();
  const list = P.matchList('Montréal, Canada\n\nregion: Québec, Canada\nLaval, Canada\nMontréal\n');
  assert.equal(list.length, 4);
  const chosen = list.filter(x => x.match.pick >= 0).map(x => x.match.options[x.match.pick]);
  const results = P.revealAll(chosen);
  assert.equal(results.filter(r => r.isNew).length, 3);            // the second Montréal is already there
  assert.equal(s.xp, 2 * ST.CITY_XP + ST.REGION_XP);
  assert.equal(P.matchList('x\n'.repeat(500)).length, P.MAX_LINES);
});
