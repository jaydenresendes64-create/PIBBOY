// js/fog.js: the fog's maths, without WebGL — where places are on the
// screen, how big, and the regions' shapes ready to fill.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, FILES } = require('./helpers');

const app = loadApp({ files: FILES.fog });
const ST = app.ST;
const F = ST.fog, P = ST.places;
const near = (a, b, tolerance) => assert.ok(Math.abs(a - b) <= tolerance, a + ' is not ' + b + ' ± ' + tolerance);

test('toScreen: the centre is the middle of the screen, north up', () => {
  const view = F.viewOf(-73.57, 45.5, 12, 375, 520);
  const [x, y] = F.toScreen(view, P.mercX(-73.57), P.mercY(45.5));
  near(x, 187.5, 1e-9); near(y, 260, 1e-9);
  const north = F.toScreen(view, P.mercX(-73.57), P.mercY(45.51));
  assert.ok(north[1] < 260);
  near(view.world, 512 * 4096, 1e-6);
});

test('toScreen: exact at street level (zoom 19), where the world is 268 million pixels wide', () => {
  const view = F.viewOf(-73.5673, 45.5017, 19, 375, 520);
  // A point 10 m east of the centre is 10 m of pixels to the right, to a hundredth of a pixel.
  const east = -73.5673 + 10 / (40075016.686 / 360 * Math.cos(45.5017 * Math.PI / 180));   // Mercator metres
  const [x] = F.toScreen(view, P.mercX(east), P.mercY(45.5017));
  near(x - 187.5, 10 * P.pixelsPerMetre(45.5017, view.world), 0.02);
});

test('circleOnScreen: the radius in real metres, whatever the zoom; off screen is skipped', () => {
  const city = { lat: 45.5, lon: -73.57, radius: 5000 };
  const at12 = F.circleOnScreen(F.viewOf(-73.57, 45.5, 12, 375, 520), city);
  const at13 = F.circleOnScreen(F.viewOf(-73.57, 45.5, 13, 375, 520), city);
  near(at13.r, at12.r * 2, 1e-9);                                     // twice as big one zoom in
  near(at12.r, 5000 * P.pixelsPerMetre(45.5, 512 * 4096), 1e-9);
  const far = F.circleOnScreen(F.viewOf(-73.57, 45.5, 2, 375, 520), city);
  assert.equal(far.r, 3);                                             // still a spark, zoomed far out
  assert.equal(F.circleOnScreen(F.viewOf(2.35, 48.85, 12, 375, 520), city), null);
});

test('regionEdgePx: real metres, between 2 and 28 pixels', () => {
  assert.equal(F.regionEdgePx(F.viewOf(0, 45, 2, 375, 520), 45), 2);
  assert.equal(F.regionEdgePx(F.viewOf(0, 45, 17, 375, 520), 45), 28);
  const mid = F.regionEdgePx(F.viewOf(0, 45, 9, 375, 520), 45);
  near(mid, 2500 * P.pixelsPerMetre(45, 512 * 512), 1e-9);
});

test('latOf: back from the 0-1 world to degrees', () => {
  [-80, -45.5, 0, 12.3, 45.5017, 85].forEach(lat => near(F.latOf(P.mercY(lat)), lat, 1e-9));
});

test('regionMesh: every ring as a fan, around the middle of the region', async () => {
  await P.loadShapes('CA');
  const shape = P.shapeOf('CAN-630', 'CA');                           // Manitoba
  const mesh = F.regionMesh(shape);
  let expected = 0;
  shape.polygons.forEach(rings => rings.forEach(r => { expected += (r.length / 2 - 2) * 3; }));
  assert.equal(mesh.count, expected);
  assert.equal(mesh.vertices.length, expected * 2);
  near(mesh.anchor[0], (shape.box[0] + shape.box[2]) / 2, 1e-15);
  // Small numbers around the anchor (exact in 32 bits), the box around them all.
  const span = Math.max(shape.box[2] - shape.box[0], shape.box[3] - shape.box[1]);
  mesh.vertices.forEach(v => assert.ok(Math.abs(v) <= span / 2 + 1e-9));
  assert.equal(mesh.box.length, 12);
  // The fans' signed areas add up to the shape's own area.
  let fans = 0;
  for (let i = 0; i < mesh.vertices.length; i += 6) {
    const [ax, ay, bx, by, cx, cy] = mesh.vertices.slice(i, i + 6);
    fans += ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
  }
  let rings = 0;
  shape.polygons.forEach(poly => poly.forEach(r => {
    for (let i = 0; i + 3 < r.length; i += 2) rings += (r[i] * r[i + 3] - r[i + 2] * r[i + 1]) / 2;
  }));
  near(fans, rings, Math.abs(rings) * 1e-5);
});

test('boxOnScreen: a region far away is skipped', async () => {
  await P.loadShapes('CA');
  const box = P.shapeOf('CAN-630', 'CA').box;
  assert.equal(F.boxOnScreen(F.viewOf(-97, 55, 5, 375, 520), box, 28), true);
  assert.equal(F.boxOnScreen(F.viewOf(2.35, 48.85, 5, 375, 520), box, 28), false);
});

// ---------- the clouds ----------
const frac = v => v - Math.floor(v);
test('cloudFrame: the clouds stick to the world while panning, even at street level', () => {
  [3, 11.4, 19].forEach(zoom => {
    const level = Math.floor(zoom);
    const a = F.viewOf(8.54, 47.37, zoom, 375, 520);
    const b = F.viewOf(8.54 + 0.3 / Math.pow(2, zoom), 47.37 - 0.2 / Math.pow(2, zoom), zoom, 375, 520);
    const fa = F.cloudFrame(a, zoom, level, 700), fb = F.cloudFrame(b, zoom, level, 700);
    // One world point: where it falls in the picture, seen from either view.
    const point = [P.mercX(8.541), P.mercY(47.369)];
    const pa = F.toScreen(a, point[0], point[1]), pb = F.toScreen(b, point[0], point[1]);
    const inA = [frac(fa.x + pa[0] * fa.step), frac(fa.y + pa[1] * fa.step)];
    const inB = [frac(fb.x + pb[0] * fb.step), frac(fb.y + pb[1] * fb.step)];
    near(Math.min(Math.abs(inA[0] - inB[0]), 1 - Math.abs(inA[0] - inB[0])), 0, 1e-6);
    near(Math.min(Math.abs(inA[1] - inB[1]), 1 - Math.abs(inA[1] - inB[1])), 0, 1e-6);
    assert.ok(fa.x >= 0 && fa.x < 1 && fa.y >= 0 && fa.y < 1);
  });
});

test('cloudFrame: the clouds grow with the map between two whole zooms, then hand over', () => {
  const at = zoom => F.viewOf(0, 0, zoom, 375, 520);
  near(F.cloudFrame(at(10), 10, 10, 700).step, 1 / 700, 1e-15);            // a picture per 700 px
  near(F.cloudFrame(at(10.5), 10.5, 10, 700).step, 1 / (700 * Math.SQRT2), 1e-15);
  // Just below zoom 11 the upper layer (level 11) is all there is, and it's
  // the same picture as the lower layer once the zoom reaches 11.
  near(F.cloudFade(10.9999999), 1, 1e-6);
  assert.equal(F.cloudFade(11), 0);
  const below = F.cloudFrame(at(11 - 1e-9), 11 - 1e-9, 11, 700), atEleven = F.cloudFrame(at(11), 11, 11, 700);
  near(below.step, atEleven.step, 1e-12);
  near(F.cloudFade(10.5), 0.5, 1e-12);
});

test('makeReveals: what is there at first is simply there; new places clear in, removed ones fog over', () => {
  const r = F.makeReveals();
  const circle = { lat: 1, lon: 2, radius: 3000 }, other = { lat: 5, lon: 6, radius: 500 };
  let s = r.update([{ key: 'c:a', item: circle }], 0, false);
  assert.deepEqual(app.plain(s.list.map(x => x.value)), [1]);
  assert.equal(s.moving, false);
  // A new place: from nothing to fully clear over REVEAL_MS, easing out.
  s = r.update([{ key: 'c:a', item: circle }, { key: 'p:b', item: other }], 1000, false);
  assert.equal(s.list[1].value, 0);
  assert.equal(s.moving, true);
  s = r.update([{ key: 'c:a', item: circle }, { key: 'p:b', item: other }], 1000 + F.REVEAL_MS / 2, false);
  assert.ok(s.list[1].value > 0.5 && s.list[1].value < 1);             // past halfway at half time
  s = r.update([{ key: 'c:a', item: circle }, { key: 'p:b', item: other }], 1000 + F.REVEAL_MS, false);
  assert.equal(s.list[1].value, 1);
  assert.equal(s.moving, false);
  // Removed: still drawn (its last circle) while it fogs over, then gone.
  s = r.update([{ key: 'p:b', item: other }], 5000, false);
  assert.equal(s.list.length, 2);
  assert.equal(s.list[0].item, circle);
  s = r.update([{ key: 'p:b', item: other }], 5000 + F.REMOVE_MS / 2, false);
  assert.ok(s.list[0].value > 0 && s.list[0].value < 0.5);
  s = r.update([{ key: 'p:b', item: other }], 5000 + F.REMOVE_MS, false);
  assert.equal(s.list.length, 1);
  assert.equal(s.list[0].item, other);
  // Added back while fogging over: it clears again from where it was.
  r.update([], 9000, false);
  const mid = r.update([], 9000 + F.REMOVE_MS / 4, false).list[0].value;
  s = r.update([{ key: 'p:b', item: other }], 9000 + F.REMOVE_MS / 4, false);
  near(s.list[0].value, mid, 1e-9);
});

test('makeReveals: a region waits for its shape; reduced motion shows changes at once', () => {
  const r = F.makeReveals();
  r.update([{ key: 'r:X', item: null }], 0, false);                 // there at first, shape loading
  let s = r.update([{ key: 'r:X', item: null }], 100, false);
  assert.equal(s.list.length, 0);
  const shape = { box: [0, 0, 1, 1] };
  s = r.update([{ key: 'r:X', item: shape }], 200, false);
  assert.equal(s.list.length, 1);
  assert.equal(s.list[0].item, shape);
  assert.equal(s.list[0].value, 1);                                   // no animation: it was already revealed
  const still = F.makeReveals();
  still.update([], 0, true);
  s = still.update([{ key: 'c:new', item: { lat: 0, lon: 0, radius: 1 } }], 10, true);
  assert.equal(s.list[0].value, 1);
  assert.equal(s.moving, false);
  s = still.update([], 20, true);
  assert.equal(s.list.length, 0);
});

test('makeQuality: slow frames lower the fog resolution, a long quick run raises it again', () => {
  const q = F.makeQuality();
  assert.equal(q.scale(), F.QUALITY[0]);
  for (let i = 0; i < 44; i++) q.sample(16.7);
  for (let i = 0; i < 45; i++) q.sample(28);                          // under 50 frames a second
  assert.equal(q.scale(), F.QUALITY[1]);
  for (let i = 0; i < 200; i++) q.sample(40);
  assert.equal(q.scale(), F.QUALITY[F.QUALITY.length - 1]);            // never below the lowest
  let frames = 0;
  while (q.level() === F.QUALITY.length - 1 && frames < 10000) { q.sample(16.7); frames++; }
  assert.ok(frames > 240, 'waited only ' + frames + ' frames');         // longer after each step down
  assert.equal(q.level(), F.QUALITY.length - 2);
  const fine = F.makeQuality();
  for (let i = 0; i < 1000; i++) fine.sample(16.7);                    // 60 a second: stays sharp
  assert.equal(fine.scale(), 1);
});
