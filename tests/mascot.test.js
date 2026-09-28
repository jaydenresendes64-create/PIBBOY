// The mascot, cut into parts that each move (like Vault Boy in a Fallout 4
// Pip-Boy): the sheet made by tools/mascot-parts.py, the layers in the page,
// the joints in the CSS and every move js/mascot.js can play must agree.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('index.html'), css = read('css/terminal.css'), js = read('js/mascot.js'), tool = read('tools/mascot-parts.py');
// Layers from back to front, and the sheet's cell each shows.
const PARTS = ['mp-leg-back', 'mp-leg-front', 'mp-arm', 'mp-torso', 'mp-head', 'mp-blink'];
const rule = cls => (css.match(new RegExp('\\.' + cls + '\\{([^}]*)\\}')) || [null, ''])[1];

test('the parts sheet: one picture-sized cell per part', () => {
  const png = fs.readFileSync(path.join(ROOT, 'images/mascot-parts.png'));
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.equal(png.readUInt32BE(16), PARTS.length * 144, 'width');
  assert.equal(png.readUInt32BE(20), 204, 'height');
  assert.match(rule('mp'), /background:url\(\.\.\/images\/mascot-parts\.png\) no-repeat; background-size:600% 100%;/);
});

test('the page stacks the parts back to front, the blink inside the head', () => {
  const at = PARTS.map(cls => html.indexOf('class="mp ' + cls + '"'));
  at.forEach((i, n) => assert.ok(i > 0, PARTS[n] + ' in the page'));
  assert.deepEqual(at.slice().sort((a, b) => a - b), at);
  assert.match(html, /<span class="mp mp-head"><span class="mp mp-blink"><\/span><\/span>/);
  assert.match(html, /<div class="mascot" id="mascot" aria-hidden="true">/);
});

test('each layer shows its own cell and turns around the joint the tool cut it for', () => {
  PARTS.forEach((cls, i) => {
    const pos = i === 0 ? '0' : Math.round(i / (PARTS.length - 1) * 100) + '%';
    assert.match(rule(cls), new RegExp('background-position:' + pos + ' 0;'), cls);
  });
  const joints = tool.match(/JOINTS = \{([^}]*)\}/)[1];
  const found = [...joints.matchAll(/'(mp-[\w-]+)': \((\d+), (\d+)\)/g)];
  assert.equal(found.length, 4);
  found.forEach(([, cls, x, y]) => {
    const origin = rule(cls).match(/transform-origin:([\d.]+)% ([\d.]+)%;/);
    assert.ok(origin, cls + ' has a joint');
    assert.ok(Math.abs(origin[1] - x / 144 * 100) < 0.01 && Math.abs(origin[2] - y / 204 * 100) < 0.01, cls + ' joint matches the tool');
  });
});

test('every move has a whole-figure animation (its end plans the next walk)', () => {
  const moves = new Set([...js.matchAll(/'(walk-left|walk-right|thumbs|nod|stroll|hop|scout|write)'/g)].map(m => m[1]));
  const gestures = js.match(/GESTURES = \{([^}]*)\}/)[1];
  [...gestures.matchAll(/:'([\w-]+)'/g)].forEach(m => moves.add(m[1]));
  assert.ok(moves.size >= 8, [...moves].join(','));
  moves.forEach(move => {
    const whole = css.match(new RegExp('\\.mascot-move\\[data-move="' + move + '"\\]\\{ animation:(\\w+) ([\\d.]+)s'));
    assert.ok(whole, move + ' moves the whole figure');
    assert.ok(css.includes('@keyframes ' + whole[1] + '{'), whole[1] + ' exists');
    // Its parts' moves last as long, so they finish together.
    const parts = [...css.matchAll(new RegExp('data-move="' + move + '"\\] \\.[\\w-]+[^{]*\\{ animation:(\\w+) ([\\d.]+)s', 'g'))];
    assert.ok(parts.length >= 2, move + ' moves some parts');
    parts.forEach(p => {
      assert.equal(p[2], whole[2], p[1] + ' lasts as long as ' + whole[1]);
      assert.ok(css.includes('@keyframes ' + p[1] + '{'), p[1] + ' exists');
    });
  });
});

test('a decoration: never takes a tap, stops with Reduce Motion', () => {
  assert.match(css, /\.mascot\{[^}]*pointer-events:none/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\s*\*, \*::before, \*::after\{ animation:none !important;/);
  assert.match(js, /stayStill\(\) \|\| hidden\(\)/);
});
