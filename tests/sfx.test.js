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

// ---------- Custom sounds (sfx-custom.js) ----------
const loadCustom = () => loadApp({ files: ['js/state.js', 'js/sfx.js', 'js/sfx-custom.js'] });

// A test recording: quiet hiss, with a beep at each [start, end] (seconds).
function recording(rate, seconds, beeps) {
  const samples = new Float32Array(Math.round(rate * seconds));
  for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * 0.002;
  beeps.forEach(([start, end]) => {
    for (let i = Math.round(start * rate); i < Math.round(end * rate); i++) samples[i] += 0.6 * Math.sin(i / rate * 2 * Math.PI * 880);
  });
  return samples;
}

test('custom sounds: each separate sound in a file is found, with its times', () => {
  const { detectSegments } = loadCustom().ST.sfxCustom;
  const found = detectSegments(recording(8000, 6, [[0.5, 0.8], [2.0, 3.1], [4.5, 4.62]]), 8000);
  assert.equal(found.length, 3);
  [[0.5, 0.8], [2.0, 3.1], [4.5, 4.62]].forEach(([start, end], i) => {
    assert.ok(Math.abs(found[i].start - start) <= 0.04, `sound ${i + 1} starts near ${start}: ${found[i].start}`);
    assert.ok(found[i].end >= end && found[i].end <= end + 0.09, `sound ${i + 1} ends just after ${end}: ${found[i].end}`);
  });
});

test('custom sounds: a short pause inside a sound does not split it; silence finds nothing', () => {
  const { detectSegments } = loadCustom().ST.sfxCustom;
  assert.equal(detectSegments(recording(8000, 3, [[0.5, 0.9], [0.95, 1.3]]), 8000).length, 1);   // 50 ms gap
  assert.equal(detectSegments(new Float32Array(8000 * 2), 8000).length, 0);
  assert.equal(detectSegments(new Float32Array(0), 8000).length, 0);
});

test('custom sounds: a clip is saved as a 16-bit mono WAV', () => {
  const { encodeWav } = loadCustom().ST.sfxCustom;
  const wav = encodeWav(Float32Array.from([0, 1, -1, 0.5, 2]), 22050);
  const view = new DataView(wav);
  const text = (at, n) => String.fromCharCode(...new Uint8Array(wav, at, n));
  assert.equal(wav.byteLength, 44 + 5 * 2);
  assert.equal(text(0, 4), 'RIFF');
  assert.equal(text(8, 4), 'WAVE');
  assert.equal(view.getUint16(22, true), 1);           // mono
  assert.equal(view.getUint32(24, true), 22050);       // sample rate
  assert.equal(view.getUint16(34, true), 16);          // bits
  assert.equal(view.getInt16(46, true), 32767);        // 1.0
  assert.equal(view.getInt16(48, true), -32768);       // -1.0
  assert.equal(view.getInt16(52, true), 32767);        // 2.0 is clipped to 1.0
});

test('custom sounds: a sound pack keeps every clip exactly, and bad packs are refused', () => {
  const { makePack, readPack, encodeWav } = loadCustom().ST.sfxCustom;
  const wav = encodeWav(Float32Array.from([0, 0.25, -0.5, 1]), 48000);
  const pack = makePack([{ slot: 'tab', wav, seconds: 0.25 }, { slot: 'levelUp', wav, seconds: 2 }]);
  const clips = readPack(pack);
  assert.deepEqual(Array.from(clips, c => c.slot), ['tab', 'levelUp']);
  assert.deepEqual([...new Uint8Array(clips[0].wav)], [...new Uint8Array(wav)]);
  assert.equal(clips[1].seconds, 2);
  // Unknown sound names are left out; anything that isn't a pack throws.
  assert.equal(readPack(JSON.stringify({ type: 'pibboy-sounds', version: 1, clips: [{ slot: 'nope', wav: 'AAAA' }] })).length, 0);
  assert.throws(() => readPack('{"type":"something-else","clips":[]}'));
  assert.throws(() => readPack('not json'));
});
