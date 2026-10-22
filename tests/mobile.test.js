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
