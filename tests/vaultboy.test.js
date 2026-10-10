// The Vault Boy walking on the level bar: his picture follows the level
// (none below 5, then lvl05 / 10 / 20 / 30 / 50, kept from 50 on), set only
// when the tier changes; the old corner mascot no longer shows.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp, FILES, ROOT } = require('./helpers');

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const pngSize = f => { const png = fs.readFileSync(path.join(ROOT, f)); assert.equal(png.toString('ascii', 1, 4), 'PNG'); return [png.readUInt32BE(16), png.readUInt32BE(20)]; };
const TIERS = ['05', '10', '20', '30', '50'];

test('the picture for each level: none below 5, a new one at 5, 10, 20, 30 and 50, never past 50', () => {
  const R = loadApp({ files: FILES.render }).ST.render;
  const pic = n => R.walkerSprite(n);
  assert.deepEqual([0, 1, 4].map(pic), [null, null, null]);
  assert.deepEqual([5, 7, 9].map(pic), Array(3).fill('images/vaultboy/lvl05.png'));
  assert.deepEqual([10, 15, 19].map(pic), Array(3).fill('images/vaultboy/lvl10.png'));
  assert.deepEqual([20, 25, 29].map(pic), Array(3).fill('images/vaultboy/lvl20.png'));
  assert.deepEqual([30, 35, 40, 49].map(pic), Array(4).fill('images/vaultboy/lvl30.png'));
  assert.deepEqual([50, 55, 60, 70, 80, 999].map(pic), Array(6).fill('images/vaultboy/lvl50.png'));
});

test('renderHeader shows him from level 5 and changes the picture only with the tier', () => {
  const a = loadApp({ files: FILES.render });
  const ST = a.ST;
  ST.app.state = ST.defaultState();
  const walk = a.context.document.getElementById('vaultboy-walk'), img = a.context.document.getElementById('vaultboy');
  walk.hidden = true;                                            // as in the page
  const at = level => { ST.app.state.level = level; ST.render.renderHeader(); return [walk.hidden, img.src]; };

  assert.deepEqual(at(4), [true, undefined]);                    // no picture at all
  assert.deepEqual(at(7), [false, 'images/vaultboy/lvl05.png']);
  img.src = 'kept';                                              // the same tier: the picture isn't touched
  assert.deepEqual(at(9), [false, 'kept']);
  assert.deepEqual(at(15), [false, 'images/vaultboy/lvl10.png']);
  assert.deepEqual(at(25), [false, 'images/vaultboy/lvl20.png']);
  assert.deepEqual(at(35), [false, 'images/vaultboy/lvl30.png']);
  assert.deepEqual(at(55), [false, 'images/vaultboy/lvl50.png']);
  img.src = 'kept';
  assert.deepEqual(at(80), [false, 'kept']);                    // still lvl50 at 80
  assert.deepEqual(at(1), [true, 'kept']);                      // back under 5 (a reset): hidden
});

test('the five pictures: one frame, the 770:1050 shape, sharp at 140px on a phone; precached', () => {
  TIERS.forEach(t => {
    const [w, h] = pngSize('images/vaultboy/lvl' + t + '.png');
    assert.equal(w * 1050, h * 770, 'lvl' + t + ': ' + w + 'x' + h);
    assert.ok(h >= 140 * 3, 'lvl' + t + ': 3 device pixels per CSS pixel');
  });
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'images/vaultboy')).sort(), TIERS.map(t => 'lvl' + t + '.png'));
  const sw = read('sw.js');
  TIERS.forEach(t => assert.match(sw, new RegExp("'images/vaultboy/lvl" + t + "\\.png'")));
});

test('the page: one picture right after the level bar, hidden to screen readers, taps going through; the old mascot hidden', () => {
  const html = read('index.html'), css = read('css/terminal.css');
  assert.match(html, /<div class="level-block">[\s\S]*?<div class="xp-bar-outer">[\s\S]*?<\/div><\/div>\s*<!--[\s\S]*?-->\s*<div class="vaultboy" id="vaultboy-walk" aria-hidden="true" hidden>\s*<div class="vaultboy-step"><div class="vaultboy-flip"><img id="vaultboy" class="vaultboy-img" alt="" aria-hidden="true" draggable="false"><\/div><\/div>/);
  assert.equal((html.match(/<img /g) || []).length, 1);
  assert.match(css, /\.mascot\{ display:none; \}/);
  const walker = css.match(/\.vaultboy\{([^}]*)\}/)[1];
  assert.match(walker, /--vb-h:140px;/);
  assert.match(walker, /position:absolute;/);
  assert.match(walker, /pointer-events:none;/);
  assert.match(css, /@media \(max-width:359px\)\{\s*\.vaultboy\{ --vb-h:110px; \}/);
  assert.match(css, /\.vaultboy-step\{[^}]*animation:vaultboyWalk 6s ease-in-out infinite alternate;/);
  assert.match(css, /\.vaultboy-flip\{[^}]*transform-origin:50% 98%;[^}]*animation:vaultboyTurn 12s step-end infinite;/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\s*\.vaultboy-step\{ animation:none; transform:translateX\(calc\(50% - var\(--vb-w\) \/ 2\)\); \}/);
  assert.doesNotMatch(read('js/render.js'), /lvl(40|60|70)/);
});
