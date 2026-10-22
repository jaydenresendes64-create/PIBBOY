// Performance rules, so the app stays light on the phone (2026-10-22, the
// owner: "optimise mon application comme un pro"): what loops moves only
// transform and opacity (the GPU does those alone; anything else is redone
// by the processor 60 times a second: the walk's strip, as a moving
// background, took a quarter of a phone's processor), and the fonts are
// asked for at once.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const css = read('css/terminal.css');

// Each @keyframes' animated properties.
function keyframes() {
  const out = {};
  for (const m of css.matchAll(/@keyframes ([\w-]+)\{/g)) {
    let i = css.indexOf('{', m.index), depth = 0, j = i;
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}' && --depth === 0) break;
    }
    const body = css.slice(i + 1, j).replace(/\([^)]*\)/g, '');
    out[m[1]] = new Set([...body.matchAll(/([a-z-]+)\s*:/g)].map(p => p[1]).filter(p => p !== 'animation-timing-function'));
  }
  return out;
}

test('every animation that loops moves only transform and opacity: the GPU plays it, the processor stays free', () => {
  const kf = keyframes();
  const looping = new Set();
  for (const m of css.matchAll(/animation(?:-name)?:([^;}]*)/g)) {
    m[1].split(',').forEach(part => {
      const name = part.trim().split(/\s+/)[0];
      if (kf[name] && (/infinite/.test(part) || /animation-name/.test(m[0]))) looping.add(name);
    });
  }
  assert.ok(looping.has('vbStrip05') && looping.has('vbWalk05') && looping.has('vbTrack00'), 'the Vault Boy\'s loops are checked');
  for (const name of looping) {
    const other = [...kf[name]].filter(p => p !== 'transform' && p !== 'opacity');
    assert.deepEqual(other, [], name + ' animates ' + other.join(', '));
  }
});

test('the gauge and the rad meter fill by a transform, never by their width', () => {
  assert.doesNotMatch(css, /transition:\s*width/, 'a width transition lays the page out again at each frame');
  assert.match(read('js/render.js'), /el\('hdr-xp-fill'\)\.style\.transform = 'scaleX\('/);
  assert.match(read('js/render.js'), /el\('rad-fill'\)\.style\.transform = 'scaleX\('/);
});

test('the fonts are asked for with the page, not after the stylesheet', () => {
  const html = read('index.html');
  const fonts = [...css.matchAll(/@font-face\{[^}]*src:url\(\.\.\/(fonts\/[\w-]+\.woff2)\)/g)].map(m => m[1]);
  assert.equal(fonts.length, 2);
  fonts.forEach(f => assert.match(html, new RegExp('<link rel="preload" href="' + f.replace('.', '\\.') + '" as="font" type="font/woff2" crossorigin>'), f));
  assert.ok(html.indexOf('rel="preload"') < html.indexOf('rel="stylesheet"'), 'before the stylesheet');
  const sw = read('sw.js');
  fonts.forEach(f => assert.match(sw, new RegExp("'" + f.replace('.', '\\.') + "'"), f + ' cached for offline'));
});
