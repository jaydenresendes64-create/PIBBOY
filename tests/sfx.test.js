// sfx.js: when scroll and slider ticks play, the device settings, and that
// the app is unaffected where there's no audio at all (like here in Node).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers');

const load = () => loadApp({ files: ['js/state.js', 'js/sfx.js'] });

test('scroll ticks: one per 56 px, never closer than 66 ms', () => {
  const tick = load().ST.sfx.makeTicker(56, 66);
  assert.equal(tick(30, 0), false);          // not far enough yet
  assert.equal(tick(30, 10), true);          // 60 px in total
  assert.equal(tick(56, 20), false);         // far enough, but too soon
  assert.equal(tick(56, 200), true);
  assert.equal(tick(-56, 400), true);        // scrolling up counts too
  assert.equal(tick(NaN, 600), false);       // a bad reading is ignored
});

test('slider ticks: which tenth of the range it is in', () => {
  const bucket = load().ST.sfx.sliderBucket;
  assert.equal(bucket(0, 0, 100), 0);
  assert.equal(bucket(9, 0, 100), 0);
  assert.equal(bucket(10, 0, 100), 1);
  assert.equal(bucket(100, 0, 100), 10);
  assert.equal(bucket(3, 1, 7), 3);          // (3-1)/6 = 0.33
  assert.equal(bucket(50, '', ''), 5);       // no min/max given: 0..100
  assert.equal(bucket(5, 5, 5), 0);          // empty range
  assert.equal(bucket('x', 0, 100), 0);
});

test('without audio, playing a sound does nothing and throws nothing', () => {
  const { ST } = load();
  ST.sfx.init();
  ['boot', 'tick', 'press', 'tab', 'complete', 'levelUp', 'quest', 'discover', 'sold', 'error', 'nope']
    .forEach(name => assert.doesNotThrow(() => ST.sfx.play(name, 0.1)));
});

test('sound and power-on settings are kept on this device, on by default', () => {
  const app = load();
  const { ST } = app;
  ST.sfx.init();
  assert.equal(app.elements['sound-btn'].textContent, 'Sound: on');
  assert.equal(app.elements['power-btn'].textContent, 'Power-on: on');

  ST.sfx.toggleSound();
  ST.sfx.togglePowerScreen();
  assert.equal(app.localStorage.getItem('status_terminal_sound'), '0');
  assert.equal(app.localStorage.getItem('status_terminal_power_on'), '0');
  assert.equal(app.elements['sound-btn'].textContent, 'Sound: off');

  // Another open of the app on this device reads the same choice.
  const again = loadApp({ files: ['js/state.js', 'js/sfx.js'], shared: app.shared });
  again.ST.sfx.init();
  assert.equal(again.elements['sound-btn'].textContent, 'Sound: off');
  assert.equal(again.elements['power-btn'].textContent, 'Power-on: off');

  ST.sfx.toggleSound();
  assert.equal(app.localStorage.getItem('status_terminal_sound'), null);   // back to the default
});
