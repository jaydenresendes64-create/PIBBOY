// The MAP tab's saved places (state.map): checking them like the rest of a
// backup, and the XP a new city or region gives, once per place.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers');

const app = loadApp();
const ST = app.ST;
const sanitize = doc => app.plain(ST.sanitizeImported(JSON.parse(JSON.stringify(doc))));
const fresh = () => { ST.app.state = ST.defaultState(); return ST.app.state; };

function withMap(map) {
  const s = app.plain(ST.defaultState());
  s.map = Object.assign({ cities: [], regions: [], pins: [], discovered: [] }, map);
  return s;
}
const MONTREAL = { id: 'xc1', name: 'Montréal', cc: 'CA', lat: 45.509, lon: -73.588, radius: 14000, date: '2026-9-24', note: '', gid: 6077243 };
const QUEBEC = { id: 'xr1', name: 'Québec', cc: 'CA', code: 'CAN-683', date: '2026-9-24', note: 'Home' };
const PIN = { id: 'xp1', name: 'Café', cc: 'CA', lat: 45.5, lon: -73.57, radius: 500, date: '2026-9-24', note: 'Best espresso' };

test('a full map comes back identical (export -> import)', () => {
  const s = withMap({
    cities: [MONTREAL, { id: 'xc2', name: 'Hand-placed', cc: '', lat: -12.5, lon: 179.99, radius: 3000, date: '2026-9-1', note: 'x' }],
    regions: [QUEBEC, { id: 'xr2', name: 'Île-de-France', cc: 'FR', code: 'FRA-G-ile-de-france', date: '2026-9-2', note: '' },
      { id: 'xr3', name: 'Gaza', cc: 'PS', code: 'GAZ-X00', date: null, note: '' },
      { id: 'xr4', name: 'Casablanca-Settat', cc: 'MA', code: 'MA-06', date: '2026-9-3', note: '' }],
    pins: [PIN],
    discovered: ['c:6077243', 'r:CAN-683', 'c::handplaced']
  });
  assert.deepEqual(sanitize(s), s);
  assert.deepEqual(sanitize(sanitize(s)), s);
});

test('places without a usable position are dropped', () => {
  const bad = [{ lat: 91 }, { lat: -91 }, { lon: 181 }, { lon: -180.5 }, { lat: 'north' }, { lat: null }, { lon: Infinity }];
  const s = sanitize(withMap({
    cities: bad.map((b, i) => Object.assign({}, MONTREAL, { gid: 100 + i }, b)).concat([MONTREAL]),
    pins: bad.map(b => Object.assign({}, PIN, b)).concat([PIN])
  }));
  assert.deepEqual(s.map.cities, [MONTREAL]);
  assert.deepEqual(s.map.pins, [PIN]);
});

test('unknown region codes are dropped, unknown countries become ""', () => {
  const codes = ['', 'CAN', 'can-683', 'CAN-683"><img>', 'CAN-G-Île', 'CANADA-1', 'ma-06', 'MA-', 'MA-0600', 'M-06', null, 42];
  const s = sanitize(withMap({
    regions: codes.map(code => Object.assign({}, QUEBEC, { code })).concat([Object.assign({}, QUEBEC, { cc: 'ZZ' })]),
    cities: [Object.assign({}, MONTREAL, { cc: 'ca' })],
    pins: [Object.assign({}, PIN, { cc: '<b>' })]
  }));
  assert.deepEqual(s.map.regions.map(r => [r.code, r.cc]), [['CAN-683', '']]);
  assert.equal(s.map.cities[0].cc, '');
  assert.equal(s.map.pins[0].cc, '');
});

test('radii, names, notes, dates and ids are brought within their limits', () => {
  const s = sanitize(withMap({
    cities: [Object.assign({}, MONTREAL, { radius: 5, name: '  ', note: null, date: '2026-09-04', gid: -3, id: '"><x' })],
    pins: [Object.assign({}, PIN, { radius: 999999, name: 'N'.repeat(300), note: 'n'.repeat(900), date: 'yesterday' }),
      Object.assign({}, PIN, { id: 'xp2', radius: 'wide' })]
  }));
  const c = s.map.cities[0];
  assert.equal(c.radius, ST.CITY_RADIUS_MIN);
  assert.equal(c.name, 'Unnamed place');
  assert.equal(c.note, '');
  assert.equal(c.date, '2026-9-4');
  assert.equal('gid' in c, false);
  assert.match(c.id, /^[A-Za-z0-9_-]{1,40}$/);
  const [p, p2] = s.map.pins;
  assert.equal(p.radius, ST.PIN_RADIUS_MAX);
  assert.equal(p.name.length, ST.PLACE_NAME_MAX);
  assert.equal(p.note.length, ST.PLACE_NOTE_MAX);
  assert.equal(p.date, null);
  assert.equal(p2.radius, ST.PIN_RADIUS_MIN);
});

test('HTML in names and notes stays plain text (the map escapes it when drawn)', () => {
  const evil = '"><img src=x onerror=alert(1)>';
  const s = sanitize(withMap({ pins: [Object.assign({}, PIN, { name: evil, note: evil })] }));
  assert.equal(s.map.pins[0].name, evil);
  assert.equal(s.map.pins[0].note, evil);
});

test('the same city or region twice: the second copy goes', () => {
  const s = sanitize(withMap({
    cities: [MONTREAL, Object.assign({}, MONTREAL, { id: 'xc9', radius: 3000 })],
    regions: [QUEBEC, Object.assign({}, QUEBEC, { id: 'xr9' })],
    pins: [PIN, Object.assign({}, PIN, { id: 'xp9' })]            // two pins at one spot are fine
  }));
  assert.deepEqual(s.map.cities.map(c => c.id), ['xc1']);
  assert.deepEqual(s.map.regions.map(r => r.id), ['xr1']);
  assert.equal(s.map.pins.length, 2);
});

test('discovered: only well-formed keys, each once', () => {
  const s = sanitize(withMap({ discovered: ['c:1', 'c:1', 'r:CAN-683', 'x:1', 'c:', 'c:a b', 7, null, { k: 1 }, 'r:' + 'x'.repeat(200)] }));
  assert.deepEqual(s.map.discovered, ['c:1', 'r:CAN-683']);
});

test('junk entries and "__proto__" keys in the map are harmless', () => {
  const raw = JSON.parse('{"stats":{},"quests":{},"map":{"cities":[null,1,"x",[],' +
    '{"__proto__":{"polluted":1},"id":"xc1","name":"A","cc":"CA","lat":1,"lon":2,"radius":3000,"date":"2026-9-1","note":""}],' +
    '"__proto__":{"polluted":2}}}');
  const s = ST.sanitizeImported(raw);
  assert.equal(s.map.cities.length, 1);
  assert.equal(s.map.cities[0].polluted, undefined);
  assert.equal(s.map.polluted, undefined);
  assert.equal({}.polluted, undefined);
});

test('foldName: accents, case, spaces and punctuation don\'t count', () => {
  assert.equal(ST.foldName('Montréal'), ST.foldName('MONTREAL'));
  assert.equal(ST.foldName('Tanger - Tétouan'), ST.foldName('tanger-tetouan'));
  assert.equal(ST.foldName('København'), 'kobenhavn');
  assert.equal(ST.foldName('Straße'), 'strasse');
  assert.equal(ST.foldName('Île-de-France'), 'iledefrance');
  assert.equal(ST.foldName('東京'), '東京');
  assert.equal(ST.foldName(null), '');
});

test('placeKey: GeoNames id, else country and name; regions by code', () => {
  assert.equal(ST.placeKey('city', MONTREAL), 'c:6077243');
  assert.equal(ST.placeKey('city', { name: 'Saint-Élie', cc: 'CA' }), 'c:CA:saintelie');
  assert.equal(ST.placeKey('region', QUEBEC), 'r:CAN-683');
});

test('discoverPlace: XP once per place, even after removing and adding it back', () => {
  const s = fresh();
  assert.deepEqual(app.plain(ST.discoverPlace('c:6077243', ST.CITY_XP)), { xp: 50, leveled: false });
  assert.equal(s.xp, 50);
  s.map.cities = [];                                         // removed...
  assert.equal(ST.discoverPlace('c:6077243', ST.CITY_XP), null);   // ...and back: nothing
  assert.equal(s.xp, 50);
  assert.deepEqual(app.plain(ST.discoverPlace('r:CAN-683', ST.REGION_XP)), { xp: 100, leveled: false });
  assert.equal(s.xp, 150);
  assert.equal(s.lifetimeXp, 150);
  assert.deepEqual(app.plain(s.map.discovered), ['c:6077243', 'r:CAN-683']);
});
