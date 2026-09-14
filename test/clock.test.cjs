'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../src/clock.js');
const K = globalThis.Clock;

test('toAudioContextTime converts a page-clock time into the AudioContext domain via the paired sample', () => {
  const pair = { performanceNow: 1000, audioContextTime: 2.5 };
  assert.equal(K.toAudioContextTime(1250, pair), 2.75);
  assert.ok(Math.abs(K.toAudioContextTime(999, pair) - 2.499) < 1e-9);
});

test('toPageTime is the inverse conversion, back into the performance.now() domain', () => {
  const pair = { performanceNow: 1000, audioContextTime: 2.5 };
  assert.equal(K.toPageTime(2.75, pair), 1250);
});

test('offsetMs is the signed millisecond gap between a page-clock time and an expected click time', () => {
  const pair = { performanceNow: 1000, audioContextTime: 2.5 };
  assert.ok(Math.abs(K.offsetMs(1250, 2.70, pair) - 50) < 1e-9);
  assert.ok(Math.abs(K.offsetMs(1250, 2.80, pair) - -50) < 1e-9);
});

test('nearestClick picks the closest click time and reports its signed offset', () => {
  assert.deepEqual(K.nearestClick(2.74, [2.5, 2.75, 3.0]), { index: 1, clickTime: 2.75, offsetMs: -10 });
});

test('nearestClick breaks an exact tie in favor of the earlier click', () => {
  const result = K.nearestClick(2.625, [2.5, 2.75]);
  assert.equal(result.index, 0);
});

test('nearestClick returns null for an empty list of click times', () => {
  assert.equal(K.nearestClick(1, []), null);
});

test('median of an empty array is null', () => {
  assert.equal(K.median([]), null);
});

test('median of a single value is that value', () => {
  assert.equal(K.median([7]), 7);
});

test('median of an odd-length array is the middle sorted value', () => {
  assert.equal(K.median([3, 1, 2]), 2);
});

test('median of an even-length array is the mean of the two middle sorted values', () => {
  assert.equal(K.median([4, 1, 3, 2]), 2.5);
});

test('median does not mutate its input array', () => {
  const values = [4, 1, 3, 2];
  K.median(values);
  assert.deepEqual(values, [4, 1, 3, 2]);
});

test('samplePair round-trips through JSON unchanged', () => {
  const pair = K.samplePair(1, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(pair)), pair);
});
