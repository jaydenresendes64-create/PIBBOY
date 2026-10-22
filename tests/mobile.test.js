// Phone rules (2026-10-23, the owner: "travaille non stop sur l'appli comme
// un pro"): an iPhone zooms the whole page into a field whose text is under
// 16px and stays zoomed, so on touch screens every field's text is 16px;
// the page keeps the safe areas (notch, home bar) and lets people zoom.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('on touch screens every text field is 16px (no zoom on focus)', () => {
  const css = read('css/terminal.css');
  const block = /@media \(pointer:coarse\)\{([^}]*\})\s*\}/.exec(css);
  assert.ok(block, 'a (pointer:coarse) block');
  assert.match(block[1], /input:not\(\[type=range\]\)[^{]*, select, textarea\{ font-size:16px !important; \}/);
});

test('the viewport covers the notch and still lets people zoom', () => {
  const meta = /<meta name="viewport" content="([^"]*)">/.exec(read('index.html'))[1];
  assert.match(meta, /viewport-fit=cover/);
  assert.doesNotMatch(meta, /maximum-scale|user-scalable=no/);
  assert.match(read('css/terminal.css'), /env\(safe-area-inset-top/);
});

test('installed on a phone: the manifest (id, standalone, icons) and the page agree on the dark theme colour', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.id, './');
  assert.equal(m.display, 'standalone');
  assert.deepEqual(m.icons.map(i => i.sizes + (i.purpose ? ' ' + i.purpose : '')), ['192x192', '512x512', '512x512 maskable']);
  const theme = /<meta name="theme-color" content="([^"]+)">/.exec(read('index.html'));
  assert.ok(theme, 'a theme-color meta');
  assert.equal(theme[1], m.theme_color);
  assert.equal(m.background_color, m.theme_color);
  assert.match(read('index.html'), /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/);
});
