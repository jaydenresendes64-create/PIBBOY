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
  ['back', 'front'].forEach(side => assert.match(html, new RegExp('<span class="vb vb-leg-' + side + '"><span class="vb-knee"><span class="vb vb-shin-' + side + '"></span></span></span>')));
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

test('he walks toward the hand on his hip, the thumb behind: going right as drawn, going left turned round, so his thumbs-up at each end is for the screen', () => {
  const move = keyframes('vbMove');
  [['vbTrack', 'the outfits'], ['vbTrackOld', 'the original Vault Boy']].forEach(([name, who]) => {
    const track = keyframes(name);
    let right = 0, left = 0;
    for (let ms = 0; ms < 11000; ms += 5) {
      const dx = valueAt(track, (ms + 5) / 11000)[0] - valueAt(track, ms / 11000)[0], sx = valueAt(move, ms / 11000)[2];
      if (Math.abs(dx) < 5e-4) continue;                         // standing (his body settling aside)
      assert.equal(Math.sign(sx), Math.sign(dx), who + ' goes ' + (dx > 0 ? 'right' : 'left') + ' with scale ' + sx + ' at ' + ms + 'ms');
      if (dx > 0) right++; else left++;
    }
    assert.ok(right > 100 && left > 100, who + ': there and back');
  });
  // level 5's drawings: each move along the gauge, the way he faces then
  const drawn = keyframes('vbMoveDrawn'), track = held('vbTrack05').map(k => ({ at: k.at, x: +k.css.match(/\* (-?[\d.]+)\)\);$/)[1] }));
  let moves = 0;
  track.forEach((k, i) => {
    if (!i || k.x === track[i - 1].x) return;
    assert.equal(Math.sign(valueAt(drawn, k.at)[2]), Math.sign(k.x - track[i - 1].x), 'level 5 at ' + (k.at * 11000).toFixed(0) + 'ms');
    moves++;
  });
  assert.ok(moves >= 16, 'level 5: there and back, drawing by drawing');
});

test('a bent knee folds into a V: each shin\'s box hides its corner above the knee line, where the thigh is, and never his boot', () => {
  assert.match(rule('.vb-knee'), /position:absolute; inset:0;/);
  const tool = read('tools/vaultboy-moves.py');
  [false, true].forEach(old => {
    const who = old ? 'the original Vault Boy' : 'the outfits', pre = old ? '.vaultboy[data-tier="00"] ' : '';
    const rig = tool.slice(tool.indexOf(old ? "('Old', dict(" : "('', dict("));
    const H = +rig.match(/H=(\d+)/)[1], W = +rig.match(/W=(\d+)/)[1];
    const origin = sel => { const o = rule(sel).match(/transform-origin:([\d.]+)% ([\d.]+)%;/); return [o[1] / 100 * W, o[2] / 100 * H]; };
    [['F', 'front'], ['B', 'back']].forEach(([s, side]) => {
      const hip = origin(pre + '.vb-leg-' + side), knee = origin(pre + '.vb-shin-' + side);
      const L = Math.hypot(knee[0] - hip[0], knee[1] - hip[1]), u = [(knee[0] - hip[0]) / L, (knee[1] - hip[1]) / L];
      const at = p => [(p[0] - knee[0]) * u[0] + (p[1] - knee[1]) * u[1], (p[0] - knee[0]) * -u[1] + (p[1] - knee[1]) * u[0]];   // [along the leg, across]
      const poly = rule(pre + '.vb-leg-' + side + ' > .vb-knee').match(/clip-path:polygon\(evenodd, -100% -100%, 200% -100%, 200% 200%, -100% 200%, -100% -100%, ([^)]*)\);/);
      assert.ok(poly, who + ' ' + side + ': a knee box');
      const box = poly[1].split(', ').map(pt => pt.split(' ').map(parseFloat)).map(([x, y]) => at([x / 100 * W, y / 100 * H]));
      assert.equal(box.length, 5);
      [0, 3].forEach(i => assert.ok(Math.abs(box[i][0]) < 0.05, who + ' ' + side + ': the box starts on the knee line'));
      [1, 2].forEach(i => assert.ok(Math.abs(box[i][0] + L) < 0.05, who + ' ' + side + ': up to the hip'));
      const [lo, hi] = [Math.min(box[0][1], box[3][1]), Math.max(box[0][1], box[3][1])];
      assert.ok(hi - lo > 40 && hi - lo < 60, who + ' ' + side + ': as wide as the thigh at the knee');
      // as he walks: where the boot's sole is in the thigh's own frame (the shin turned at the knee)
      const sole = rig.match(new RegExp('sole' + s + '=\\(([\\d.]+), ([\\d.]+)\\)')).slice(1).map(Number);
      const shin = keyframes('vbShin' + s + (old ? 'Old' : ''));
      let deepest = 0;
      for (let ms = 0; ms <= 11000; ms += 2) {
        const deg = valueAt(shin, ms / 11000)[0];
        deepest = Math.max(deepest, Math.abs(deg));
        const [a, c] = at(turned(sole, knee, deg));
        assert.ok(!(a <= 0 && a >= -L && c >= lo && c <= hi), who + ' ' + side + ': the knee box would hide the boot at ' + ms + 'ms');
      }
      assert.ok(deepest > 45, who + ' ' + side + ': the knee bends ' + deepest.toFixed(0) + ' degrees');
    });
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

// Keyframes whose values hold until the next (tools/vaultboy-moves.py held_css): [{ at (0-1), css }].
function held(name) {
  const from = css.indexOf('@keyframes ' + name + '{');
  assert.ok(from >= 0, name + ' in the css');
  const body = css.slice(from, css.indexOf('\n', from));
  return [...body.matchAll(/([\d.]+)%\{ ([^{}]*?) animation-timing-function:steps\(1, end\); \}/g)].map(m => ({ at: m[1] / 100, css: m[2] }));
}
const heldAt = (kf, t) => kf.filter(k => k.at <= t + 1e-9).pop();

test('level 5 walks with its drawings: in the walker, hidden until he walks, the parts hidden while he does', () => {
  const walkData = JSON.parse(read('tools/vaultboy-walk.json'))['05'];
  assert.equal(walkData.frames, 8);
  assert.deepEqual(pngSize('images/vaultboy/walk-lvl05.png'), [walkData.width * 8, 420]);
  assert.match(read('sw.js'), /'images\/vaultboy\/walk-lvl05\.png'/);
  const html = read('index.html');
  assert.match(html, /<div class="vb-body"><div class="vb-breathe">[\s\S]*?<\/div><span class="vb-walk"><\/span><\/div><\/div><\/div>/);   // inside .vb-move: it turns with him
  assert.match(rule('.vb-walk'), /opacity:0;/);                   // shown only by its animation: not with Reduce Motion
  const t = '.vaultboy[data-tier="05"]';
  assert.match(rule(t + ' .vb-track'), /animation-name:vbTrack05;/);
  assert.match(rule(t + ' .vb-move'), /animation-name:vbMoveDrawn;/);
  assert.match(rule(t + ' .vb-arm'), /animation-name:vbArmDrawn;/);
  assert.match(rule(t + ' .vb-head'), /animation-name:vbHeadDrawn;/);
  assert.match(rule(t + ' .vb-body'), /animation:none;/);
  assert.match(rule(t + ' .vb-breathe'), /animation:mascotBreathe 4\.2s ease-in-out infinite, vbParts05 11s linear infinite;/);
  const walk = rule(t + ' .vb-walk');
  assert.match(walk, /background-image:url\(\.\.\/images\/vaultboy\/walk-lvl05\.png\); animation:vbWalk05 11s linear infinite;/);
  assert.ok(Math.abs(parseFloat(walk.match(/width:([\d.]+)%/)[1]) - walkData.width / 308 * 100) < 0.01, 'his frame as wide as the drawings');
  assert.match(css, /\.vaultboy\[data-tier="05"\] \.vb-leg-front, [^{]*\.vb-shin-back\{ animation:none; \}/);
  ['10', '20', '30', '50', '00'].forEach(other => assert.doesNotMatch(css, new RegExp('\\.vaultboy\\[data-tier="' + other + '"\\] \\.vb-walk'), 'no drawings yet for ' + other));
});

test('the drawn walk: the drawings in order, one at a time, the parts exactly when they aren\'t; he moves on at each drawing, never back, as far as --vb-span', () => {
  const walkData = JSON.parse(read('tools/vaultboy-walk.json'))['05'];
  const shows = held('vbWalk05'), parts = held('vbParts05');
  const track = held('vbTrack05').map(k => ({ at: k.at, x: +k.css.match(/\* (-?[\d.]+)\)\);$/)[1] }));
  const span = +rule('.vaultboy[data-tier="05"]').match(/--vb-span:([\d.]+);/)[1];
  let walks = 0, seen = [], lastFrame = null, out = true, most = 0, least = span;
  for (let ms = 0; ms <= 11000; ms++) {
    const t = ms / 11000, s = heldAt(shows, t).css, p = heldAt(parts, t).css, x = heldAt(track, t).x;
    const shown = /opacity:1;/.test(s);
    assert.equal(/opacity:1;/.test(p), !shown, 'the parts or the drawings, never both or neither (' + ms + 'ms)');
    if (shown) {
      const pos = s.match(/background-position:(\S+) 0;/)[1];
      const frame = pos === '0' ? 0 : Math.round(parseFloat(pos) / 100 * 7);
      if (lastFrame === null) { walks++; seen = []; }
      if (frame !== lastFrame) {
        if (lastFrame !== null) assert.equal(frame, (lastFrame + 1) % 8, 'the drawings in order (' + ms + 'ms)');
        seen.push(frame);
      }
      lastFrame = frame;
      if (out) { assert.ok(x >= most - 1e-9, 'never a step back (' + ms + 'ms)'); most = x; }
      else { assert.ok(x <= least + 1e-9, 'never a step back (' + ms + 'ms)'); least = x; }
    } else if (lastFrame !== null) {
      assert.deepEqual(seen, [0, 1, 2, 3, 4, 5, 6, 7, 0], 'two steps and the landing');
      lastFrame = null;
      out = !out;
    }
  }
  assert.equal(walks, 2, 'there and back');
  assert.equal(heldAt(track, 0).x, 0); assert.equal(heldAt(track, 1).x, 0);
  assert.ok(Math.abs(Math.max(...track.map(k => k.x)) - span) < 1e-9);
  assert.ok(Math.abs(span - walkData.position[8] / 420) < 0.001, 'two steps of the drawings, as measured');
  assert.ok(span * 100 < 69, 'his drawn walk fits a 390px-wide screen');
});
