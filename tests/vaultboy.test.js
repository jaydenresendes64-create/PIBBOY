// The Vault Boy walking on the level bar: from level 1, his outfit follows
// the level (lvl05 for 1-9, then 10 / 20 / 30 / 50, kept from 50 on); amber
// parts that each move, like the old mascot (tools/vaultboy-parts.py), and a
// walk loop (tools/vaultboy-moves.py); he keeps right of the name, subtitle
// and level, so he never covers them.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp, FILES, ROOT } = require('./helpers');

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const pngSize = f => { const png = fs.readFileSync(path.join(ROOT, f)); assert.equal(png.toString('ascii', 1, 4), 'PNG'); return [png.readUInt32BE(16), png.readUInt32BE(20)]; };
const TIERS = ['05', '10', '20', '30', '50'];
const PARTS = ['vb-leg-back', 'vb-shin-back', 'vb-leg-front', 'vb-shin-front', 'vb-arm', 'vb-torso', 'vb-head', 'vb-blink'];
const css = read('css/terminal.css');
const rule = sel => (css.match(new RegExp(sel.replace(/[.[\]="-]/g, m => '\\' + m) + '\\{([^}]*)\\}')) || [null, ''])[1];

test('the outfit for each level: lvl05 from level 1, a new one at 10, 20, 30 and 50, never past 50', () => {
  const R = loadApp({ files: FILES.render }).ST.render;
  const tier = n => R.walkerTier(n);
  assert.deepEqual([1, 2, 4, 5, 9].map(tier), Array(5).fill('05'));
  assert.deepEqual([10, 15, 19].map(tier), Array(3).fill('10'));
  assert.deepEqual([20, 25, 29].map(tier), Array(3).fill('20'));
  assert.deepEqual([30, 35, 40, 49].map(tier), Array(4).fill('30'));
  assert.deepEqual([50, 55, 60, 80, 999].map(tier), Array(5).fill('50'));
});

test('renderHeader shows him from level 1 and changes the outfit only with the tier', () => {
  const a = loadApp({ files: FILES.render });
  const ST = a.ST;
  ST.app.state = ST.defaultState();
  const walk = a.context.document.getElementById('vaultboy-walk');
  walk.hidden = true;                                            // as in the page
  const set = [];
  walk.setAttribute = (k, v) => set.push(k + '=' + v);
  const at = level => { ST.app.state.level = level; ST.render.renderHeader(); return walk.hidden; };
  assert.equal(at(1), false);
  assert.deepEqual(set, ['data-tier=05']);
  at(2); at(9);
  assert.deepEqual(set, ['data-tier=05']);                       // the same tier: untouched
  [15, 25, 35, 55, 80].forEach(at);
  assert.deepEqual(set, ['data-tier=05', 'data-tier=10', 'data-tier=20', 'data-tier=30', 'data-tier=50']);
});

test('his stretch of the bar starts right of the text as high as he is, at most 150px long', () => {
  const a = loadApp({ files: FILES.render });
  const ST = a.ST, doc = a.context.document;
  ST.app.state = ST.defaultState();
  const rect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top });
  const bar = { getBoundingClientRect: () => rect(16, 185, 16 + barWidth, 199) };
  let barWidth = 358;
  const texts = [rect(16, 57, 96, 96), rect(16, 98, 222, 112), rect(16, 155, 42, 170), rect(46, 130, 90, 176), rect(16, 10, 380, 40)];
  doc.querySelector = sel => (sel === '.level-block .xp-bar-outer' ? bar : null);
  doc.querySelectorAll = sel => (/hero-name/.test(sel) ? texts.map(r => ({ r })) : []);
  doc.createRange = () => { let node; return { selectNodeContents: n => { node = n; }, getBoundingClientRect: () => node.r }; };
  const walk = doc.getElementById('vaultboy-walk');
  const vars = {};
  Object.assign(walk, { hidden: false, offsetHeight: 100, style: { setProperty: (k, v) => { vars[k] = v; } } });
  ST.render.placeWalker();
  assert.deepEqual(vars, { '--vb-from': '216px', '--vb-len': '69px' });   // 10px right of the subtitle (222); the line at y 10-40 is above him
  barWidth = 488;                                                // a wide screen: only the last 150px
  ST.render.placeWalker();
  assert.deepEqual(vars, { '--vb-from': '265px', '--vb-len': '150px' });
});

test('the pictures: five amber parts sheets (8 cells of the 308x420 frame) from the five colour pictures; precached', () => {
  TIERS.forEach(t => {
    assert.deepEqual(pngSize('images/vaultboy/lvl' + t + '.png'), [308, 420], 'colour picture lvl' + t);
    assert.deepEqual(pngSize('images/vaultboy/parts-lvl' + t + '.png'), [308 * 8, 420], 'parts lvl' + t);
  });
  const sw = read('sw.js');
  TIERS.forEach(t => assert.match(sw, new RegExp("'images/vaultboy/parts-lvl" + t + "\\.png'")));
  assert.doesNotMatch(sw, /'images\/vaultboy\/lvl\d\d\.png'/);   // the colour ones aren't loaded
});

test('the rig: the parts stacked back to front, each showing its cell and turning around the joint the tool cut it for', () => {
  const html = read('index.html');
  assert.match(html, /<div class="xp-bar-outer">[\s\S]*?<\/div><\/div>\s*<!--[\s\S]*?-->\s*<div class="vaultboy" id="vaultboy-walk" aria-hidden="true" hidden>\s*<div class="vb-track"><div class="vb-move"><div class="vb-body"><div class="vb-breathe">/);
  const at = PARTS.map(cls => html.indexOf('class="vb ' + cls + '"'));
  at.forEach((i, n) => assert.ok(i > 0, PARTS[n] + ' in the page'));
  assert.deepEqual(at.slice().sort((x, y) => x - y), at);
  assert.match(html, /<span class="vb vb-head"><span class="vb vb-blink"><\/span><\/span>/);
  assert.match(rule('.vb'), /background:url\(\.\.\/images\/vaultboy\/parts-lvl05\.png\) no-repeat; background-size:800% 100%;/);
  ['10', '20', '30', '50'].forEach(t => assert.match(css, new RegExp('\\.vaultboy\\[data-tier="' + t + '"\\] \\.vb\\{ background-image:url\\(\\.\\./images/vaultboy/parts-lvl' + t + '\\.png\\); \\}')));
  PARTS.forEach((cls, i) => {
    const pos = rule('.' + cls).match(/background-position:([\d.]+)%? 0;/);
    assert.ok(pos && Math.abs(pos[1] - i / 7 * 100) < 0.001, cls + ' shows cell ' + i);
  });
  const tool = read('tools/vaultboy-parts.py');
  const joints = [...tool.match(/JOINTS = \{([^}]*)\}/)[1].matchAll(/'(vb-[\w-]+)': \(([\d.]+), ([\d.]+)\)/g)];
  assert.equal(joints.length, 6);
  joints.forEach(([, cls, x, y]) => {
    const o = rule('.' + cls).match(/transform-origin:([\d.]+)% ([\d.]+)%;/);
    assert.ok(o, cls + ' has a joint');
    assert.ok(Math.abs(o[1] - x / 308 * 100) < 0.01 && Math.abs(o[2] - y / 420 * 100) < 0.01, cls + ' turns at ' + x + ',' + y);
  });
});

test('size, place, taps, the walk loop and Reduce Motion; the old mascot hidden', () => {
  const walker = rule('.vaultboy');
  assert.match(walker, /--vb-h:100px;/);
  assert.match(walker, /position:absolute;/);
  assert.match(walker, /pointer-events:none;/);
  assert.match(walker, /margin-top:calc\(-14px - var\(--vb-h\) \* 0\.988\);/);   // feet on the bar's top edge
  assert.match(css, /@media \(max-width:359px\)\{\s*\.vaultboy\{ --vb-h:84px; \}/);
  assert.match(css, /\.mascot\{ display:none; \}/);
  // every element of the walk: one loop of the same length
  const loops = [...css.matchAll(/\.(vb-[\w-]+)\{ animation:(vb\w+) ([\d.]+)s linear infinite; \}/g)];
  assert.deepEqual(loops.map(m => m[1]).sort(), ['vb-arm', 'vb-body', 'vb-head', 'vb-leg-back', 'vb-leg-front', 'vb-move', 'vb-shin-back', 'vb-shin-front', 'vb-track']);
  assert.equal(new Set(loops.map(m => m[3])).size, 1);
  loops.forEach(m => assert.match(css, new RegExp('@keyframes ' + m[2] + '\\{')));
  assert.match(css, /@keyframes vbTrack\{[^\n]*var\(--vb-len, 0px\) \* 1\)/);
  assert.match(css, /@keyframes vbMove\{[\s\S]*?scale\(0\.15,0\.95\)[\s\S]*?scale\(-0\.15,0\.95\)/);   // the card spin
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\s*\.vb-track\{ transform:translateX\(calc\(var\(--vb-len, 0px\) \/ 2\)\); \}/);
});
