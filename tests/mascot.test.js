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
const PARTS = ['mp-leg-back', 'mp-shin-back', 'mp-leg-front', 'mp-shin-front', 'mp-arm', 'mp-torso', 'mp-head', 'mp-blink'];
const rule = cls => (css.match(new RegExp('\\.' + cls + '\\{([^}]*)\\}')) || [null, ''])[1];

// The inside of `@keyframes name{ ... }` (braces counted, one line or several).
const keyframes = name => {
  const start = css.indexOf('@keyframes ' + name + '{');
  if (start < 0) return null;
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', start) + 1, i);
  }
  return null;
};

// The size of a PNG: [width, height].
const pngSize = f => { const png = fs.readFileSync(path.join(ROOT, f)); assert.equal(png.toString('ascii', 1, 4), 'PNG'); return [png.readUInt32BE(16), png.readUInt32BE(20)]; };

test('the parts sheet: one picture-sized cell per part', () => {
  const [pw, ph] = pngSize('images/mascot.png');
  assert.ok(pw % 144 === 0 && ph === 204 * pw / 144, 'the picture is a whole multiple of 144x204: ' + pw + 'x' + ph);
  assert.ok(pw >= 288, 'big enough to stay sharp on a phone (3 device pixels per CSS pixel)');
  const [w, h] = pngSize('images/mascot-parts.png');
  assert.equal(w, PARTS.length * pw, 'width');
  assert.equal(h, ph, 'height');
  assert.match(rule('mp'), new RegExp('background:url\\(\\.\\./images/mascot-parts\\.png\\) no-repeat; background-size:' + PARTS.length * 100 + '% 100%;'));
});

test('the page stacks the parts back to front, each lower leg inside its leg, the blink inside the head', () => {
  const at = PARTS.map(cls => html.indexOf('class="mp ' + cls + '"'));
  at.forEach((i, n) => assert.ok(i > 0, PARTS[n] + ' in the page'));
  assert.deepEqual(at.slice().sort((a, b) => a - b), at);
  assert.match(html, /<span class="mp mp-head"><span class="mp mp-blink"><\/span><\/span>/);
  assert.match(html, /<span class="mp mp-leg-back"><span class="mp mp-shin-back"><\/span><\/span>/);
  assert.match(html, /<span class="mp mp-leg-front"><span class="mp mp-shin-front"><\/span><\/span>/);
  assert.match(html, /<div class="mascot" id="mascot" aria-hidden="true">/);
});

test('each layer shows its own cell and turns around the joint the tool cut it for', () => {
  PARTS.forEach((cls, i) => {
    const pos = rule(cls).match(/background-position:([\d.]+)%? 0;/);
    assert.ok(pos, cls + ' shows a cell');
    assert.ok(Math.abs(pos[1] - i / (PARTS.length - 1) * 100) < 0.001, cls + ' shows cell ' + i + ': ' + pos[1]);
  });
  const joints = tool.match(/JOINTS = \{([^}]*)\}/)[1];
  const found = [...joints.matchAll(/'(mp-[\w-]+)': \(([\d.]+), ([\d.]+)\)/g)];
  assert.equal(found.length, 6, 'head, arm, two hips, two knees');
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

test('smooth, cartoon moves: no jumps between poses, each starts and ends at rest', () => {
  const rules = [...css.matchAll(/\.mascot-move\[data-move="[\w-]+"\][^{]*\{ animation:(\w+) ([\d.]+)s ([^;]+);/g)];
  assert.ok(rules.length >= 20, 'moves and their parts: ' + rules.length);
  rules.forEach(([, name, , timing]) => {
    assert.ok(!/steps/.test(timing), name + ' moves smoothly, not in steps');
    const frames = keyframes(name);
    assert.ok(frames, name + ' has keyframes');
    const keys = [...frames.matchAll(/([\d.]+)%\{ transform:([^;]+);/g)];
    assert.ok(!/steps/.test(frames), name + ': no steps inside');
    const first = keys[0], last = keys[keys.length - 1];
    assert.equal(first[1], '0', name + ' starts at 0%');
    assert.equal(last[1], '100', name + ' ends at 100%');
    [first[2], last[2]].forEach(t => assert.match(t, /^(translate\(0,0\) scale\(1,1\) rotate\(0deg\)|rotate\(0deg\)|translateY\(0px\))$/, name + ' at rest: ' + t));
  });
  // the blink stays instant: a crossfade between open and shut eyes would look ghostly
  assert.match(rule('mp-blink'), /animation:mascotBlink 5\.3s steps\(1,end\) infinite;/);
});

test('walking bends both knees, the boot going back', () => {
  ['front', 'back'].forEach(side => {
    const anim = css.match(new RegExp('data-move="walk-left"\\] \\.mp-shin-' + side + '[^{]*\\{ animation:(\\w+) '));
    assert.ok(anim, side + ' knee moves in the walk');
    const frames = css.match(new RegExp('@keyframes ' + anim[1] + '\\{(.*)\\}'))[1];
    const angles = [...frames.matchAll(/rotate\((-?[\d.]+)deg\)/g)].map(m => +m[1]);
    assert.ok(Math.min(...angles) <= -30 && Math.max(...angles) <= 0, side + ' knee: ' + angles.join(','));
  });
});

test('a decoration: never takes a tap, stops with Reduce Motion', () => {
  assert.match(css, /\.mascot\{[^}]*pointer-events:none/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\s*\*, \*::before, \*::after\{ animation:none !important;/);
  assert.match(js, /stayStill\(\) \|\| hidden\(\)/);
});
