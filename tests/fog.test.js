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
