// items3d.js: every ITEMS category has a 3D model that builds with the
// bundled Three.js, is made of lines only, and fits the same size.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const { loadApp, ROOT } = require('./helpers');

const bundle = () => import(pathToFileURL(path.join(ROOT, 'vendor/three/three.pibboy.min.js')).href);

test('every inventory category has a model', () => {
  const { ST } = loadApp({ files: ['js/state.js', 'js/items3d.js'] });
  assert.deepEqual(Array.from(ST.items3d.CATEGORIES).sort(), Array.from(ST.CATS).sort());
});

test('each model builds from lines only and fits a sphere of radius 1', async () => {
  const T = await bundle();
  const { ST } = loadApp({ files: ['js/state.js', 'js/items3d.js'] });
  ST.items3d.CATEGORIES.forEach(cat => {
    const model = ST.items3d.buildModel(T, cat);
    let lines = 0, points = 0, other = 0;
    model.traverse(o => {
      if (o.isLineSegments) { lines++; points += o.geometry.attributes.position.count; }
      else if (o.isMesh) other++;
    });
    assert.ok(lines >= 1 && points >= 24, `${cat}: ${lines} line sets, ${points} points`);
    assert.equal(other, 0, `${cat} has no solid faces`);
    const r = new T.Box3().setFromObject(model).getBoundingSphere(new T.Sphere()).radius;
    assert.ok(r > 0.6 && r <= 1.01, `${cat} size: radius ${r.toFixed(3)}`);
  });
  assert.equal(ST.items3d.buildModel(T, 'NOPE'), null);
});
