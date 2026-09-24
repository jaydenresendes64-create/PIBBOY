#!/usr/bin/env node
/**
 * Builds the MAP tab's offline data (data/) from free sources. Run it again
 * only to refresh the data; the app never runs it.
 *
 *   node tools/build-map-data.js <admin1.geojson> <cities15000.txt> <countryInfo.txt> <MAR-ADM1.geojson>
 *
 * Sources (download them first, see README "Map data"):
 * - Natural Earth 1:10m "Admin 1 – States, Provinces" (public domain):
 *   ne_10m_admin_1_states_provinces.geojson, from the natural-earth-vector
 *   repository (tag v5.1.2 was used).
 * - GeoNames (CC BY 4.0): cities15000.txt (every place of 15,000 people or
 *   more) and countryInfo.txt, from download.geonames.org/export/dump/.
 * - geoBoundaries (ODbL 1.0, from OpenStreetMap): Morocco's 12 regions,
 *   geoBoundaries-MAR-ADM1.geojson (gbOpen release). Natural Earth still has
 *   Morocco's 16 regions from before 2015, so these replace them.
 *
 * Writes:
 * - data/places.txt       every country, region and city, as text: what the
 *                         app searches (city search, regions, bulk add)
 * - data/regions/XX.json  one file per country (XX = its ISO code): the shape
 *                         of each of its regions, simplified, to draw them
 *
 * No dependencies: plain Node (20 or newer).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'data');
const SIMPLIFY_DEG = 0.004;      // Douglas-Peucker tolerance: about 400 m
const GRID = 1000;               // coordinates kept to 1/1000 of a degree (about 100 m)
const MIN_RING_AREA = 2e-5;      // square degrees: rings smaller than about 0.2 km² are dropped

// Countries whose Natural Earth units are small (departments, provinces)
// and grouped into their real regions by its `region` field: those groups can
// be marked too. Elsewhere that field holds areas nearly the size of the
// country ("US West"), so it's not used.
const GROUP_COUNTRIES = ['BE', 'ES', 'FR', 'IT', 'PH'];

// Natural Earth units without an ISO code, given to the country they're in
// (or administered from), so they count for that country.
const NO_ISO = { SOL: 'SO', CYN: 'CY', ESB: 'CY', WSB: 'CY', USG: 'CU', KAS: 'IN', KAB: 'KZ', IOA: 'AU', CSI: 'AU', CLP: 'FR' };

// Countries whose regions come from geoBoundaries instead of Natural Earth
// (the file given on the command line), with other names each region is
// known by (French, older spellings) to find it by.
const GEOBOUNDARIES = {
  MA: {
    'MA-01': ['Tanger-Tétouan-Al Hoceïma'], 'MA-03': ['Fès-Meknès'], 'MA-04': ['Rabat-Salé-Kénitra'],
    'MA-07': ['Marrakesh-Safi'], 'MA-11': ['Laâyoune-Sakia El Hamra'], 'MA-12': ['Dakhla-Oued Eddahab']
  }
};

function main(args) {
  if (args.length !== 4) {
    console.error('Usage: node tools/build-map-data.js <admin1.geojson> <cities15000.txt> <countryInfo.txt> <MAR-ADM1.geojson>');
    process.exit(1);
  }
  const countries = readCountries(args[2]);
  const regions = readRegions(args[0], countries)
    .filter(r => !GEOBOUNDARIES[r.cc])
    .concat(readGeoBoundaries(args[3], 'MA'));
  const cities = readCities(args[1], countries);
  assignRegions(cities, regions);
  const groups = makeGroups(regions);
  writeShapes(regions, groups, countries);
  writePlaces(countries, regions, groups, cities);
}

// ---------- countries ----------
// countryInfo.txt: ISO, ISO3, ISO-Numeric, fips, Country, ... (tab separated, # comments)
function readCountries(file) {
  const names = {};
  fs.readFileSync(file, 'utf8').split('\n').forEach(line => {
    if (!line || line[0] === '#') return;
    const f = line.split('\t');
    if (/^[A-Z]{2}$/.test(f[0])) names[f[0]] = f[4];
  });
  return names;
}

// ---------- regions ----------
function readRegions(file, countries) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = [];
  doc.features.forEach(feature => {
    const p = feature.properties;
    let cc = /^[A-Z]{2}$/.test(p.iso_a2) ? p.iso_a2 : NO_ISO[p.adm0_a3];
    if (!cc || !countries[cc]) return;               // no country (Spratly Is.)
    // Most codes look like CAN-683; a few like GAZ+00? become GAZ-X00.
    const code = String(p.adm1_code).replace(/^([A-Z]{3})\+(\d+)\?$/, '$1-X$2');
    if (!/^[A-Z]{3}-X?\d+$/.test(code)) throw new Error('Unexpected adm1_code ' + p.adm1_code);
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    const kept = keptPolygons(polygons);
    const alt = [p.name_en, p.gn_name, p.woe_name].concat(String(p.name_alt || '').split('|'))
      .filter(n => n && n !== p.name);
    out.push({
      cc, code, name: clean(p.name || p.name_en || p.gn_name || p.admin), type: clean(p.type_en || ''),
      group: clean(p.region || ''), alt: [...new Set(alt.map(clean))],
      original: polygons, polygons: kept
    });
  });
  return out;
}
function clean(s) { return String(s).replace(/\s+/g, ' ').trim(); }
// A shape's polygons, simplified like readRegions' (the biggest one always kept).
function keptPolygons(polygons) {
  const big = ring => ring.length >= 4 && Math.abs(area(ring)) >= MIN_RING_AREA;
  const kept = polygons.map(poly => poly.map(ring => simplify(ring)))
    .filter(poly => big(poly[0]))
    .map(poly => [poly[0]].concat(poly.slice(1).filter(big)));
  if (!kept.length) {
    const all = polygons.map(poly => poly[0]).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
    kept.push([simplify(all[0], 0).slice()]);
  }
  return kept;
}

// A geoBoundaries ADM1 file (one country): each region by its ISO 3166-2
// code (MA-06), which is also its code in the app.
function readGeoBoundaries(file, cc) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const alt = GEOBOUNDARIES[cc];
  return doc.features.map(feature => {
    const p = feature.properties;
    if (!/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(p.shapeISO) || p.shapeISO.slice(0, 2) !== cc) throw new Error('Unexpected shapeISO ' + p.shapeISO);
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    return {
      cc, code: p.shapeISO, name: clean(p.shapeName), type: 'Region', group: '',
      alt: (alt[p.shapeISO] || []).map(clean), original: polygons, polygons: keptPolygons(polygons)
    };
  });
}

// Douglas-Peucker on one ring, on degrees, then rounded to the grid.
function simplify(ring, tolerance) {
  tolerance = tolerance === undefined ? SIMPLIFY_DEG : tolerance;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0, index = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segmentDistance(ring[i], ring[a], ring[b]);
      if (d > max) { max = d; index = i; }
    }
    if (index !== -1 && max > tolerance) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  const out = [];
  ring.forEach((pt, i) => {
    if (!keep[i]) return;
    const q = [Math.round(pt[0] * GRID), Math.round(pt[1] * GRID)];
    const last = out[out.length - 1];
    if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q);
  });
  return out.map(q => [q[0] / GRID, q[1] / GRID]);
}
function segmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  let t = len ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1];
  return Math.sqrt(x * x + y * y);
}
function area(ring) {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return s / 2;
}
function bbox(polygons) {
  const b = [180, 90, -180, -90];
  polygons.forEach(poly => poly[0].forEach(pt => {
    b[0] = Math.min(b[0], pt[0]); b[1] = Math.min(b[1], pt[1]);
    b[2] = Math.max(b[2], pt[0]); b[3] = Math.max(b[3], pt[1]);
  }));
  return b;
}
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPolygons(x, y, polygons) {
  return polygons.some(poly => inRing(x, y, poly[0]) && !poly.slice(1).some(hole => inRing(x, y, hole)));
}

// A group's code: its country's three letters, G, and its name in plain letters.
function groupCode(a3, name) {
  const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return a3 + '-G-' + (slug || 'x').slice(0, 40);
}

// Groups: Natural Earth's `region` field gathers some countries' units
// (France's departments into its regions...), in GROUP_COUNTRIES only, and
// only groups of more than one unit. Each region then knows its group
// (r.groupEntry). Returns the groups, sorted by country then name.
function makeGroups(regions) {
  const byCountry = {};
  regions.forEach(r => { (byCountry[r.cc] = byCountry[r.cc] || []).push(r); });
  const out = [];
  const codes = new Set();
  GROUP_COUNTRIES.forEach(cc => {
    const list = byCountry[cc];
    const count = {};
    list.forEach(r => { if (r.group) count[r.group] = (count[r.group] || 0) + 1; });
    const names = Object.keys(count).filter(g => count[g] > 1).sort((a, b) => a.localeCompare(b));
    names.forEach(name => {
      const group = { cc, code: groupCode(list[0].code.slice(0, 3), name), name };
      if (codes.has(group.code)) throw new Error('Duplicate group ' + group.code);
      codes.add(group.code);
      list.forEach(r => { if (r.group === name) r.groupEntry = group; });
      out.push(group);
    });
  });
  return out;
}

// data/regions/XX.json: {v, cc, groups: [[code, name]], regions: [[code, name,
// type, group number or -1, [west, south, east, north], polygons]]}. A polygon
// is a list of rings (the outline, then its holes); a ring is a flat list of
// whole numbers (1/1000 degree): longitude, latitude, then each next point as
// the difference from the one before.
function writeShapes(regions, groups, countries) {
  const dir = path.join(OUT, 'regions');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const byCountry = {};
  regions.forEach(r => { (byCountry[r.cc] = byCountry[r.cc] || []).push(r); });
  Object.keys(byCountry).sort().forEach(cc => {
    const own = groups.filter(g => g.cc === cc);
    const file = {
      v: 1, cc,
      // Shapes from geoBoundaries stay under their licence (ODbL asks it of a file made from them).
      ...(GEOBOUNDARIES[cc] ? { source: 'geoBoundaries gbOpen, © OpenStreetMap contributors, ODbL 1.0 (opendatacommons.org/licenses/odbl/1-0/)' } : {}),
      groups: own.map(g => [g.code, g.name]),
      regions: byCountry[cc].sort((a, b) => a.code.localeCompare(b.code)).map(r => [
        r.code, r.name, r.type, r.groupEntry ? own.indexOf(r.groupEntry) : -1,
        bbox(r.polygons).map(v => Math.round(v * GRID) / GRID),
        r.polygons.map(poly => poly.map(encodeRing))
      ])
    };
    fs.writeFileSync(path.join(dir, cc + '.json'), JSON.stringify(file));
  });
}
function encodeRing(ring) {
  const out = [];
  let px = 0, py = 0;
  ring.forEach(pt => {
    const x = Math.round(pt[0] * GRID), y = Math.round(pt[1] * GRID);
    out.push(x - px, y - py);
    px = x; py = y;
  });
  return out;
}

// ---------- cities ----------
// cities15000.txt columns: geonameid, name, asciiname, alternatenames, latitude,
// longitude, feature class, feature code, country code, cc2, admin1, admin2,
// admin3, admin4, population, ...
function readCities(file, countries) {
  const out = [];
  fs.readFileSync(file, 'utf8').split('\n').forEach(line => {
    if (!line) return;
    const f = line.split('\t');
    const cc = f[8];
    if (!countries[cc]) return;
    out.push({ gid: +f[0], name: clean(f[1]), lat: +f[4], lon: +f[5], cc, pop: +f[14] || 0 });
  });
  return out;
}
// The region each city is in: the one containing it (on the full-detail
// shapes), else, for a city on the coast just outside them, the nearest one.
function assignRegions(cities, regions) {
  const byCountry = {};
  regions.forEach(r => {
    r.fullBox = bbox(r.original);
    (byCountry[r.cc] = byCountry[r.cc] || []).push(r);
  });
  cities.forEach(c => {
    const list = byCountry[c.cc] || [];
    c.region = list.find(r => c.lon >= r.fullBox[0] && c.lon <= r.fullBox[2] && c.lat >= r.fullBox[1] && c.lat <= r.fullBox[3] &&
      inPolygons(c.lon, c.lat, r.original)) || null;
    if (!c.region && list.length) {
      let best = Infinity;
      list.forEach(r => r.polygons.forEach(poly => poly[0].forEach(pt => {
        const d = (pt[0] - c.lon) ** 2 + (pt[1] - c.lat) ** 2;
        if (d < best) { best = d; c.region = r; }
      })));
      if (best > 0.25) c.region = null;              // more than about 50 km away
    }
  });
}
// data/places.txt: tab separated, in four parts, each after its # line:
//   #countries  code, name
//   #groups     code, country, name
//   #regions    code, country, name, type, group code or empty, other names (| between them)
//   #cities     name, latitude, longitude, country, region number (base 36: its
//               place in #regions, from 0) or empty, population in thousands,
//               GeoNames id (base 36). Biggest cities first.
function writePlaces(countries, regions, groups, cities) {
  const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const lines = ['#PIBBOY places 1: cities from GeoNames cities15000 (CC BY 4.0, geonames.org), regions from Natural Earth (public domain) ' +
    'and, for Morocco, geoBoundaries (ODbL 1.0, © OpenStreetMap contributors)'];
  lines.push('#countries');
  Object.keys(countries).sort().forEach(cc => lines.push(cc + '\t' + countries[cc]));
  lines.push('#groups');
  groups.forEach(g => lines.push([g.code, g.cc, g.name].join('\t')));
  lines.push('#regions');
  const sorted = regions.slice().sort((a, b) => a.code.localeCompare(b.code));
  sorted.forEach(r => {
    const seen = new Set([norm(r.name)]);
    const alt = r.alt.filter(a => { const k = norm(a); if (!k || seen.has(k) || /[\t|]/.test(a)) return false; seen.add(k); return true; });
    lines.push([r.code, r.cc, r.name, r.type, r.groupEntry ? r.groupEntry.code : '', alt.join('|')].join('\t'));
  });
  const number = new Map(sorted.map((r, i) => [r, i]));
  lines.push('#cities');
  cities.sort((a, b) => b.pop - a.pop || a.gid - b.gid).forEach(c => {
    if (/[\t\n]/.test(c.name)) return;
    lines.push([c.name, short(c.lat), short(c.lon), c.cc, c.region ? number.get(c.region).toString(36) : '',
      Math.round(c.pop / 1000), c.gid.toString(36)].join('\t'));
  });
  fs.writeFileSync(path.join(OUT, 'places.txt'), lines.join('\n') + '\n');
}
// 45.500 -> 45.5
function short(v) { return String(+v.toFixed(3)); }

main(process.argv.slice(2));
