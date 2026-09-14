'use strict';
const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
require('../src/metronome.js');
const Mt = globalThis.Metronome;

const fourFour = () => ({ beats: 4 });

test('exposes the scheduling constants the plan pins', () => {
  assert.equal(Mt.SCHEDULE_AHEAD_S, 0.1);
  assert.equal(Mt.LOOKAHEAD_MS, 25);
  assert.equal(Mt.FIRST_CLICK_DELAY_S, 0.1);
  assert.equal(Mt.MIN_BPM, 20);
  assert.equal(Mt.MAX_BPM, 300);
});

test('advance schedules exactly one click strictly inside the horizon and advances the cursor without mutating the input', () => {
  const cursor = { nextClickTime: 1.0, bar: 1, beat: 1, bpm: 120 };
  const result = Mt.advance(cursor, 1.3, fourFour);
  assert.deepEqual(result.clicks, [{ audioTime: 1.0, bar: 1, beat: 1, bpm: 120, accent: true }]);
  assert.deepEqual(result.cursor, { nextClickTime: 1.5, bar: 1, beat: 2, bpm: 120 });
  assert.deepEqual(cursor, { nextClickTime: 1.0, bar: 1, beat: 1, bpm: 120 });
});

test('advance schedules every click up to (not including) the horizon, crossing a bar line', () => {
  const cursor = { nextClickTime: 1.5, bar: 1, beat: 2, bpm: 120 };
  const result = Mt.advance(cursor, 3.05, fourFour);
  assert.deepEqual(result.clicks, [
    { audioTime: 1.5, bar: 1, beat: 2, bpm: 120, accent: false },
    { audioTime: 2.0, bar: 1, beat: 3, bpm: 120, accent: false },
    { audioTime: 2.5, bar: 1, beat: 4, bpm: 120, accent: false },
    { audioTime: 3.0, bar: 2, beat: 1, bpm: 120, accent: true },
  ]);
});

test('advance at or before the horizon returns zero clicks and a cursor deep-equal to the input', () => {
  const cursor = { nextClickTime: 1.0, bar: 1, beat: 1, bpm: 120 };
  const atHorizon = Mt.advance(cursor, 1.0, fourFour);
  assert.deepEqual(atHorizon.clicks, []);
  assert.deepEqual(atHorizon.cursor, cursor);
  const beforeHorizon = Mt.advance(cursor, 0.5, fourFour);
  assert.deepEqual(beforeHorizon.clicks, []);
  assert.deepEqual(beforeHorizon.cursor, cursor);
});

test('advance cycles per-bar time signatures', () => {
  const timeSignatureFor = (bar) => (bar === 1 ? { beats: 3 } : { beats: 4 });
  const cursor = { nextClickTime: 0, bar: 1, beat: 1, bpm: 60 };
  const result = Mt.advance(cursor, 4.5, timeSignatureFor);
  const beats = result.clicks.map((c) => [c.bar, c.beat]);
  assert.deepEqual(beats, [[1, 1], [1, 2], [1, 3], [2, 1], [2, 2]]);
});

test('a BPM change between calls neither doubles nor drops the next click', () => {
  const cursor = { nextClickTime: 0, bar: 1, beat: 1, bpm: 60 };
  const first = Mt.advance(cursor, 1.5, fourFour);
  assert.deepEqual(first.clicks.map((c) => c.audioTime), [0, 1]);
  assert.deepEqual(first.clicks.map((c) => c.bpm), [60, 60]);

  const bumped = { ...first.cursor, bpm: 120 };
  const second = Mt.advance(bumped, 3.05, fourFour);
  assert.deepEqual(second.clicks.map((c) => c.audioTime), [2, 2.5, 3]);
  assert.deepEqual(second.clicks.map((c) => c.bpm), [120, 120, 120]);
});

test('isValidBpm accepts only integers within the 20..300 range', () => {
  assert.equal(Mt.isValidBpm(20), true);
  assert.equal(Mt.isValidBpm(300), true);
  assert.equal(Mt.isValidBpm(19), false);
  assert.equal(Mt.isValidBpm(301), false);
  assert.equal(Mt.isValidBpm(100.5), false);
  assert.equal(Mt.isValidBpm(NaN), false);
  assert.equal(Mt.isValidBpm(''), false);
});

test('create() schedules clicks on the AudioContext clock, not the timer\'s own firing time', () => {
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    const calls = [];
    function fakeNode() {
      return {
        connect() {
          return this;
        },
        frequency: { value: 0 },
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        start() {},
        stop() {},
      };
    }
    const ctx = {
      currentTime: 0,
      baseLatency: 0.01,
      destination: {},
      createOscillator: fakeNode,
      createGain: fakeNode,
    };
    const metronome = Mt.create(ctx, { timeSignatureFor: fourFour, onClick: (click) => calls.push(click) });

    metronome.start(120);
    // The very first synchronous tick sees a horizon exactly equal to the first click's
    // scheduled time (both FIRST_CLICK_DELAY_S and SCHEDULE_AHEAD_S are 0.1s) -- strict
    // less-than means it is not caught here, only on a later tick (CAPT-03 adjacency edge).
    assert.deepEqual(calls, []);

    ctx.currentTime = 0.55;
    mock.timers.tick(25);
    assert.deepEqual(calls, [
      { audioTime: 0.1, bar: 1, beat: 1, bpm: 120, accent: true },
      { audioTime: 0.6, bar: 1, beat: 2, bpm: 120, accent: false },
    ]);

    metronome.stop();
    ctx.currentTime = 5;
    mock.timers.tick(25);
    assert.equal(calls.length, 2);
  } finally {
    mock.timers.reset();
  }
});
