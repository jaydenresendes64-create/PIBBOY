// Settings (index.html #settings): every control the app looks for by its
// id is there, once, inside the panel; the old footer is gone; each switch
// has what its row shows ([ ON ] / [ OFF ]).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css/terminal.css'), 'utf8');
const panel = html.slice(html.indexOf('<div class="settings" id="settings" hidden>'));

test('every setting the scripts look for is in the panel, once', () => {
  assert.ok(panel.length < html.length, 'the settings panel is in the page');
  ['tilt-btn', 'sound-btn', 'power-btn', 'sounds-btn', 'export-btn', 'import-btn', 'reset-btn',
    'reset-confirm-area', 'backup-age', 'ai-indicator', 'settings-close'].forEach(id => {
    assert.equal(html.split('id="' + id + '"').length - 1, 1, id + ' once in the page');
    assert.ok(panel.includes('id="' + id + '"'), id + ' in the settings');
  });
  assert.match(html, /<span class="topbar-right">.*id="settings-btn"[^>]*aria-haspopup="dialog"/);
  assert.doesNotMatch(html + css, /footer-row|footer-actions/);
  assert.match(panel, /Open-Meteo\.com/);                      // the weather's credit (CC BY)
});

test('what a backup and a reset leave out is said where it matters', () => {
  assert.match(panel, /Holotapes and custom sounds stay on this device only/);
  assert.match(panel, /id="reset-btn">Reset progress</);
  const events = fs.readFileSync(path.join(ROOT, 'js/events.js'), 'utf8');
  const holotapes = fs.readFileSync(path.join(ROOT, 'js/holotapes.js'), 'utf8');
  assert.match(events, /Erase all progress\? Holotapes and custom sounds stay on this device\./);
  assert.match(holotapes, /Kept on this device only, not in backups \(RadAway\)/);
});

test('each switch shows its label and [ ON ] / [ OFF ] from aria-pressed', () => {
  const toggles = panel.match(/<button class="set-toggle"[^>]*>/g);
  assert.equal(toggles.length, 3);
  toggles.forEach(t => {
    assert.match(t, /data-label="[^"]+"/);
    assert.match(t, /aria-pressed="(true|false)"/);
  });
  assert.match(css, /\.set-toggle::before\{ content:attr\(data-label\)/);
  assert.match(css, /\.set-toggle\[aria-pressed="true"\]::after\{ content:'\[ ON \]'/);
  assert.match(css, /\.settings\{[^}]*z-index:900/);             // under the toasts (1000)
});
