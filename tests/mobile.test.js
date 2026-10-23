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

test('two quick taps on a control never zoom the page (touch-action: manipulation)', () => {
  const css = read('css/terminal.css');
  assert.match(css, /^button, a, input, select, textarea, label, \[role="button"\]\{ touch-action:manipulation; \}$/m);
});

test('every field asks for the right keyboard: number fields say which pad, text fields no autofill', () => {
  const missing = [];
  fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).forEach(f => {
    const src = read('js/' + f);
    for (const m of src.matchAll(/<input\b[^>]*/g)) {
      const tag = m[0];
      if (/type="number"/.test(tag) && !/inputmode="(numeric|decimal)"/.test(tag)) missing.push(f + ': ' + tag.slice(0, 60) + ' (no inputmode)');
      if ((/type="text"/.test(tag) || /class="tape-title"/.test(tag)) && !/autocomplete="off"/.test(tag)) missing.push(f + ': ' + tag.slice(0, 60) + ' (autofill)');
    }
  });
  assert.deepEqual(missing, []);
});

test('a field\'s example text is dimmed amber that reads (4.5:1 on the lightest field), not the browser\'s grey', () => {
  const css = read('css/terminal.css');
  assert.match(css, /::placeholder\{ color:var\(--text-dim\); opacity:1; \}/);
  const token = name => /^#([0-9a-f]{6})$/.exec(new RegExp('--' + name + ':(#[0-9a-f]{6});').exec(css)[1])[1];
  const lum = hex => [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  for (const bg of ['bg', 'panel', 'panel-alt']) assert.ok(ratio(token('text-dim'), token(bg)) >= 4.5, bg);
});
