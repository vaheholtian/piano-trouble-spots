'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../src/pass-marker.js');
const PM = globalThis.PassMarker;

function ev(seq, type, note, timeStamp, extra) {
  return { seq, type, note, timeStamp, ...extra };
}

test('a pair within the window hits, either order', () => {
  const forward = PM.createDetector();
  assert.equal(forward.feed(ev(0, 'noteon', 107, 0)), null);
  assert.deepEqual(forward.feed(ev(1, 'noteon', 108, 40)), { timeStamp: 40, seqs: [0, 1], notes: [107, 108] });

  const reversed = PM.createDetector();
  assert.equal(reversed.feed(ev(0, 'noteon', 108, 0)), null);
  assert.deepEqual(reversed.feed(ev(1, 'noteon', 107, 40)), { timeStamp: 40, seqs: [0, 1], notes: [108, 107] });
});

test('exactly 100ms apart is a hit; 100.01ms apart is not, and both stay ordinary', () => {
  const hit = PM.createDetector();
  hit.feed(ev(0, 'noteon', 107, 0));
  assert.deepEqual(hit.feed(ev(1, 'noteon', 108, 100.0)), { timeStamp: 100, seqs: [0, 1], notes: [107, 108] });

  const miss = PM.createDetector();
  miss.feed(ev(0, 'noteon', 107, 0));
  assert.equal(miss.feed(ev(1, 'noteon', 108, 100.01)), null);
});

test('a lone key never hits; the later of two same-key presses is the one that pairs', () => {
  const d = PM.createDetector();
  assert.equal(d.feed(ev(0, 'noteon', 107, 0)), null);
  assert.equal(d.feed(ev(1, 'noteon', 108, 250)), null); // too far from the seq-0 press
  const hit = d.feed(ev(2, 'noteon', 107, 260));
  assert.deepEqual(hit, { timeStamp: 260, seqs: [1, 2], notes: [108, 107] });
});

test('a repeated key replaces the earlier pending press of the same key', () => {
  const d = PM.createDetector();
  d.feed(ev(0, 'noteon', 107, 0));
  d.feed(ev(1, 'noteon', 107, 50));
  const hit = d.feed(ev(2, 'noteon', 108, 90));
  assert.deepEqual(hit, { timeStamp: 90, seqs: [1, 2], notes: [107, 108] });
});

test('note-offs never seed the pending map; controls between the pair do not interfere', () => {
  const noteOffFirst = PM.createDetector();
  noteOffFirst.feed(ev(0, 'noteoff', 107, 0));
  assert.equal(noteOffFirst.feed(ev(1, 'noteon', 108, 10)), null);

  const withSustain = PM.createDetector();
  withSustain.feed(ev(0, 'noteon', 107, 0));
  withSustain.feed(ev(1, 'control', 64, 10, { value: 127 }));
  const hit = withSustain.feed(ev(2, 'noteon', 108, 20));
  assert.deepEqual(hit, { timeStamp: 20, seqs: [0, 2], notes: [107, 108] });
});

test('createDetector accepts a custom key pair and ignores the default keys entirely', () => {
  const d = PM.createDetector({ keys: [21, 22] });
  d.feed(ev(0, 'noteon', 107, 0));
  assert.equal(d.feed(ev(1, 'noteon', 108, 10)), null); // default keys, ignored under a custom pair
  d.feed(ev(2, 'noteon', 21, 100));
  const hit = d.feed(ev(3, 'noteon', 22, 140));
  assert.deepEqual(hit, { timeStamp: 140, seqs: [2, 3], notes: [21, 22] });
});

test('findMarkers returns hits in order over a stream with two well-separated pairs; a hit survives a JSON round trip', () => {
  const events = [
    ev(0, 'noteon', 107, 0),
    ev(1, 'noteon', 108, 40),
    ev(2, 'noteon', 60, 500),
    ev(3, 'noteon', 108, 1000),
    ev(4, 'noteon', 107, 1040),
  ];
  const hits = PM.findMarkers(events);
  assert.equal(hits.length, 2);
  assert.deepEqual(hits[0], { timeStamp: 40, seqs: [0, 1], notes: [107, 108] });
  assert.deepEqual(hits[1], { timeStamp: 1040, seqs: [3, 4], notes: [108, 107] });
  assert.deepEqual(JSON.parse(JSON.stringify(hits[0])), hits[0]);
});

test('DEFAULT_KEYS and WINDOW_MS are the pinned constants', () => {
  assert.deepEqual(PM.DEFAULT_KEYS, [107, 108]);
  assert.equal(PM.WINDOW_MS, 100);
});
