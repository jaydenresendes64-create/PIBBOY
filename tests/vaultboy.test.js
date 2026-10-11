// The Vault Boy walking on the level gauge (in 3D: a top he walks on and a
// front face): from level 1, his outfit follows the level (the original one
// for 1-4, then 05 / 10 / 20 / 30 / 50, kept from 50 on); amber parts that
// each move, like the old mascot (tools/vaultboy-parts.py), and a walk loop
// where his boots stay planted (tools/vaultboy-moves.py); he keeps right of
// the name, subtitle and level, so he never covers them.
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

test('the outfit for each level: the original Vault Boy for 1-4, a new outfit at 5, 10, 20, 30 and 50, never past 50', () => {
  const R = loadApp({ files: FILES.render }).ST.render;
  const tier = n => R.walkerTier(n);
  assert.deepEqual([0, 1, 2, 4].map(tier), Array(4).fill('00'));
  assert.deepEqual([5, 7, 9].map(tier), Array(3).fill('05'));
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
  assert.deepEqual(set, ['data-tier=00']);
  at(2); at(4);
  assert.deepEqual(set, ['data-tier=00']);                       // the same tier: untouched
  at(5);                                                         // level 5: the first new outfit
  assert.deepEqual(set, ['data-tier=00', 'data-tier=05']);
  [9, 15, 25, 35, 55, 80].forEach(at);
  assert.deepEqual(set, ['data-tier=00', 'data-tier=05', 'data-tier=10', 'data-tier=20', 'data-tier=30', 'data-tier=50']);
});

test('his stretch of the gauge starts right of the text as high as he is; short, his steps shrink; long, his walk sits in its middle', () => {
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
  const span = css.match(/\.vaultboy\{ --vb-span:([\d.]+); \}/)[1], walkLen = 100 * span;   // his walk, in px
  a.context.getComputedStyle = el => ({ getPropertyValue: k => (el === walk && k === '--vb-span' ? ' ' + span : '') });
  const frame = 100 * 308 / 420;
  ST.render.placeWalker();
  // 10px right of the subtitle (222): from 216; the line at y 10-40 is above him. Room: 358 - his frame - 216.
  const room = 358 - frame - 216;
  assert.ok(room > walkLen, 'his walk fits on a 390px-wide screen');
  assert.deepEqual(vars, { '--vb-swing': '1.000', '--vb-from': Math.round(216 + (room - walkLen) / 2) + 'px', '--vb-len': Math.round(walkLen) + 'px' });
  barWidth = 320;                                                // shorter: his steps shrink to fit, so his boots still don't slide
  ST.render.placeWalker();
  assert.deepEqual(vars, { '--vb-swing': ((320 - frame - 216) / walkLen).toFixed(3), '--vb-from': '216px', '--vb-len': Math.round(320 - frame - 216) + 'px' });
  barWidth = 488;                                                // a wide screen: the last 150px, his walk in their middle
  ST.render.placeWalker();
  const wide = { '--vb-swing': '1.000', '--vb-from': Math.round(488 - frame - 150 + (150 - walkLen) / 2) + 'px', '--vb-len': Math.round(walkLen) + 'px' };
  assert.deepEqual(vars, wide);
  delete a.context.getComputedStyle;                             // no css read: about the same walk (render.js WALK_SPAN)
  ST.render.placeWalker();
  assert.equal(vars['--vb-swing'], '1.000');
  assert.ok(Math.abs(parseFloat(vars['--vb-len']) - walkLen) <= 1 && Math.abs(parseFloat(vars['--vb-from']) - parseFloat(wide['--vb-from'])) <= 1);
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
  assert.match(html, /<div class="xp-bar-outer">[\s\S]*?<\/div><\/div>\s*<\/div>\s*<!--[\s\S]*?-->\s*<div class="vaultboy" id="vaultboy-walk" aria-hidden="true" hidden>\s*<div class="vb-track"><div class="vb-move"><div class="vb-body"><div class="vb-breathe">/);
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
  assert.match(walker, /--vb-feet:0\.9786;/);                      // the front boot's sole: 411 of the 420px frame
  assert.match(walker, /--vb-lane:3px;/);
  assert.match(walker, /margin-top:calc\(-14px - var\(--vb-lane\) - var\(--vb-h\) \* var\(--vb-feet\)\);/);   // boots on the gauge's top
  assert.ok(Math.abs(411 / 420 - 0.9786) < 0.0001);
  assert.match(css, /@media \(max-width:359px\)\{\s*\.vaultboy\{ --vb-h:84px; \}/);
  assert.match(css, /\.mascot\{ display:none; \}/);
  // every element of the walk: one loop of the same length
  const loops = [...css.matchAll(/\.(vb-[\w-]+)\{ animation:(vb\w+) ([\d.]+)s linear infinite; \}/g)];
  assert.deepEqual(loops.map(m => m[1]).sort(), ['vb-arm', 'vb-body', 'vb-head', 'vb-leg-back', 'vb-leg-front', 'vb-move', 'vb-shin-back', 'vb-shin-front', 'vb-track']);
  assert.equal(new Set(loops.map(m => m[3])).size, 1);
  loops.forEach(m => assert.match(css, new RegExp('@keyframes ' + m[2] + '\\{')));
  assert.match(css, /@keyframes vbMove\{[\s\S]*?scale\(0\.15,0\.95\)[\s\S]*?scale\(-0\.15,0\.95\)/);   // the card spin
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\s*\.vb-track\{ transform:translateX\(calc\(var\(--vb-len, 0px\) \/ 2\)\); \}/);
});

test('levels 1-4: the original Vault Boy, with the old mascot\'s own parts, joints and feet, as tall as the outfits', () => {
  assert.match(css, /\.vaultboy\[data-tier="00"\] \.vb\{ background-image:url\(\.\.\/images\/mascot-parts\.png\); \}/);
  assert.match(css, /\.vaultboy\[data-tier="00"\]\{ --vb-h:117px; --vb-ratio:0\.70588; --vb-feet:0\.9632; \}/);   // his front sole: 393 of 408
  assert.match(css, /\.vaultboy\[data-tier="00"\] \.vb-move, \.vaultboy\[data-tier="00"\] \.vb-body, \.vaultboy\[data-tier="00"\] \.vb-breathe\{ transform-origin:52% 96\.3%; \}/);
  ['leg-back', 'shin-back', 'leg-front', 'shin-front', 'arm', 'head'].forEach(part => {
    const old = rule('.mp-' + part).match(/transform-origin:([\d.]+% [\d.]+%);/)[1];
    assert.match(css, new RegExp('\\.vaultboy\\[data-tier="00"\\] \\.vb-' + part + '\\{ transform-origin:' + old.replace(/\./g, '\\.') + '; \\}'), part + ' turns where the old mascot\'s did');
  });
  // the same visible height: the old figure fills 340/408 of its frame, the new ones 406/420 of theirs
  assert.ok(Math.abs(117 * 340 / 408 - 100 * 406 / 420) < 1.5);
});

// The walk as the page plays it: the css keyframes with their easings, the
// nesting (.vb-track > .vb-move > .vb-body > a leg > its shin), the joints
// from the css; the soles from tools/vaultboy-moves.py. Where his boots are,
// on a 100px frame, every millisecond (Reduce Motion aside, full steps).
function bezier(x1, y1, x2, y2) {
  const at = (a, b, s) => 3 * a * s * (1 - s) * (1 - s) + 3 * b * s * s * (1 - s) + s * s * s;
  return u => { let lo = 0, hi = 1; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (at(x1, x2, m) < u) lo = m; else hi = m; } return at(y1, y2, (lo + hi) / 2); };
}
function keyframes(name) {
  const from = css.indexOf('@keyframes ' + name + '{') + name.length + 12;
  let depth = 1, i = from;
  for (; depth; i++) depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0;
  return [...css.slice(from, i - 1).matchAll(/([\d.]+)%\{ transform:([^;]*);(?: animation-timing-function:([^;]*);)? \}/g)].map(k => ({
    at: k[1] / 100,
    nums: [...k[2].replace(/var\(--vb-swing, 1\)/g, '').matchAll(/-?[\d.]+(?=deg|px|\)|,)/g)].map(Number),
    ease: k[3] && k[3] !== 'linear' ? bezier(...k[3].match(/cubic-bezier\(([^)]*)\)/)[1].split(',').map(Number)) : u => u,
  }));
}
function valueAt(kf, t) {
  const next = kf.findIndex(k => k.at > t), i = next < 0 ? kf.length - 2 : Math.max(0, next - 1), a = kf[i], b = kf[i + 1];
  const p = a.ease(Math.min(1, (t - a.at) / (b.at - a.at)));
  return a.nums.map((v, n) => v + (b.nums[n] - v) * p);
}
const turned = (p, c, deg) => { const r = deg * Math.PI / 180, dx = p[0] - c[0], dy = p[1] - c[1]; return [c[0] + dx * Math.cos(r) - dy * Math.sin(r), c[1] + dx * Math.sin(r) + dy * Math.cos(r)]; };
function bootsWalking(old) {
  const tool = read('tools/vaultboy-moves.py');
  const rig = tool.slice(tool.indexOf(old ? "('Old', dict(" : "('', dict("));
  const H = +rig.match(/H=(\d+)/)[1];
  const sole = { F: rig.match(/soleF=\(([\d.]+), ([\d.]+)\)/).slice(1).map(Number), B: rig.match(/soleB=\(([\d.]+), ([\d.]+)\)/).slice(1).map(Number) };
  const tier = old ? '.vaultboy[data-tier="00"]' : '.vaultboy';
  const W = H * rule(tier).match(/--vb-ratio:([\d.]+);/)[1];
  assert.equal(+rule(tier).match(/--vb-feet:([\d.]+);/)[1], +(sole.F[1] / H).toFixed(4), 'his front sole is where the css stands him');
  const origin = sel => { const o = rule(sel).match(/transform-origin:([\d.]+)% ([\d.]+)%;/); return [o[1] / 100 * W, o[2] / 100 * H]; };
  const part = cls => origin(old ? '.vaultboy[data-tier="00"] .' + cls : '.' + cls);
  const hip = { F: part('vb-leg-front'), B: part('vb-leg-back') }, knee = { F: part('vb-shin-front'), B: part('vb-shin-back') };
  const O = origin(old ? '.vaultboy[data-tier="00"] .vb-move, .vaultboy[data-tier="00"] .vb-body, .vaultboy[data-tier="00"] .vb-breathe' : '.vb-move, .vb-body, .vb-breathe');
  const own = name => keyframes(name + (old ? 'Old' : ''));        // each rig its own legs, track and body
  const kf = { track: own('vbTrack'), body: own('vbBody'), move: keyframes('vbMove'), LegF: own('vbLegF'), ShinF: own('vbShinF'), LegB: own('vbLegB'), ShinB: own('vbShinB') };
  const px = v => v / H * 100, out = [];
  for (let ms = 0; ms <= 11000; ms++) {
    const t = ms / 11000, [x] = valueAt(kf.track, t), [y] = valueAt(kf.body, t), [, ty, sx, sy, rot] = valueAt(kf.move, t);
    const boot = { hop: ty !== 0, track: x };
    for (const s of ['F', 'B']) {
      const p = turned(turned(sole[s], knee[s], valueAt(kf['Shin' + s], t)[0]), hip[s], valueAt(kf['Leg' + s], t)[0]);
      const q = turned([p[0] - O[0], p[1] + y * H - O[1]], [0, 0], rot);
      boot[s] = { x: px(x * H + O[0] + sx * q[0]), up: px(sole[s][1] - (O[1] + sy * q[1])) };   // up: above its lane
    }
    out.push(boot);
  }
  return out;
}

test('he really walks on the gauge: a boot always stands on it and doesn\'t slide, none sinks into it, the other lifts as it swings', () => {
  [false, true].forEach(old => {
    const who = old ? 'the original Vault Boy' : 'the outfits';
    const boots = bootsWalking(old);
    let lifted = 0;
    boots.forEach((b, ms) => {
      if (b.hop) return;                                         // his little hops: both boots up, on purpose
      ['F', 'B'].forEach(s => assert.ok(b[s].up > -0.1, who + ': the ' + s + ' boot sinks ' + (-b[s].up).toFixed(2) + 'px into the gauge at ' + ms + 'ms'));
      lifted = Math.max(lifted, b.F.up, b.B.up);
      const later = boots[ms + 10];
      if (!later || later.hop) return;
      // the boot that stands: on its lane, and in 10ms it hasn't moved along the gauge
      const off = ['F', 'B'].map(s => Math.max(Math.abs(b[s].up), Math.abs(later[s].x - b[s].x)));
      assert.ok(Math.min(...off) < 0.25, who + ': no boot stands still on the gauge at ' + ms + 'ms (' + off.map(v => v.toFixed(2)) + 'px)');
    });
    assert.ok(lifted > 3, who + ': the swinging boot lifts ' + lifted.toFixed(1) + 'px');
    // out and back: along the gauge, never a step back (0.1px: the keyframes are rounded), then back to
    // where he started; as far as --vb-span says
    const track = boots.map(b => b.track), peak = track.indexOf(Math.max(...track));
    let most = 0, least = track[peak];
    track.forEach((v, ms) => {
      if (ms <= peak) { most = Math.max(most, v); assert.ok(v > most - 0.001, who + ': a step back at ' + ms + 'ms'); }
      else { least = Math.min(least, v); assert.ok(v < least + 0.001, who + ': a step back at ' + ms + 'ms'); }
    });
    assert.equal(track[0], 0); assert.equal(track[track.length - 1], 0);
    const span = +css.match(old ? /\.vaultboy\[data-tier="00"\]\{ --vb-span:([\d.]+); \}/ : /\.vaultboy\{ --vb-span:([\d.]+); \}/)[1];
    assert.ok(Math.abs(track[peak] - span) < 0.001, who + ': --vb-span ' + span + ', walks ' + track[peak].toFixed(4));
  });
});

test('the walk\'s other moves: the legs shorten with --vb-swing, a small turn of the head (its cut never shows), the original Vault Boy his own legs and track', () => {
  ['vbLegF', 'vbShinF', 'vbLegB', 'vbShinB', 'vbLegFOld', 'vbShinFOld', 'vbLegBOld', 'vbShinBOld'].forEach(k => {
    const body = css.slice(css.indexOf('@keyframes ' + k + '{')).split('\n')[0];
    assert.match(body, /rotate\(calc\(var\(--vb-swing, 1\) \* -?[\d.]+deg\)\)/, k);
    assert.doesNotMatch(body, /rotate\(-?[\d.]+deg\)/, k + ': every angle shortens');
  });
  const head = keyframes('vbHead').map(k => k.nums[0]);
  assert.ok(Math.max(...head.map(Math.abs)) <= 5, 'the head turns at most 5 degrees');
  assert.match(css, /\.vaultboy\[data-tier="00"\] \.vb-track\{ animation-name:vbTrackOld; \}/);
  assert.match(css, /\.vaultboy\[data-tier="00"\] \.vb-body\{ animation-name:vbBodyOld; \}/);
  [['leg-front', 'LegF'], ['shin-front', 'ShinF'], ['leg-back', 'LegB'], ['shin-back', 'ShinB']].forEach(([cls, k]) =>
    assert.match(css, new RegExp('\\.vaultboy\\[data-tier="00"\\] \\.vb-' + cls + '\\{ animation-name:vb' + k + 'Old; \\}')));
});

test('the gauge in 3D: a top he walks on, leaning back, under the front face; both show the fill; taps go through the top', () => {
  const html = read('index.html');
  assert.match(html, /<div class="xp-gauge">\s*<div class="xp-top" aria-hidden="true"><div class="xp-top-fill" id="hdr-xp-top"><\/div><\/div>\s*<div class="xp-bar-outer"><div class="xp-bar-fill" id="hdr-xp-fill"><\/div><\/div>\s*<\/div>/);
  const top = rule('.xp-top');
  assert.match(top, /bottom:100%;/);
  assert.match(top, /transform-origin:50% 100%; transform:perspective\(\d+px\) rotateX\(\d+deg\);/);
  assert.match(top, /pointer-events:none;/);
  const a = loadApp({ files: FILES.render });
  a.ST.app.state = a.ST.defaultState();
  a.ST.app.state.xp = 250;
  a.ST.render.renderHeader();
  const fill = a.context.document.getElementById('hdr-xp-fill').style.width;
  assert.ok(/^[\d.]+%$/.test(fill) && fill !== '0%', 'the front face fills: ' + fill);
  assert.equal(a.context.document.getElementById('hdr-xp-top').style.width, fill);
});
