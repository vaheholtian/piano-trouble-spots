'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../src/pass-segmenter.js');
const PS = globalThis.PassSegmenter;

function ev(seq, type, note, timeStamp, extra) {
  return { seq, type, note, timeStamp, marker: false, ...extra };
}

function marker(seq, timeStamp, extra) {
  return { seq, type: 'marker', source: 'pair', timeStamp, marker: true, raw: [], ...extra };
}

test('three note-ons and no marker give one open pass holding everything', () => {
  const events = [ev(0, 'noteon', 60, 100), ev(1, 'noteon', 62, 200), ev(2, 'noteon', 64, 300)];
  const passes = PS.segment(events, { sessionStartTimeStamp: 1000 });
  assert.equal(passes.length, 1);
  const [p] = passes;
  assert.equal(p.ordinal, 1);
  assert.equal(p.startSeq, 0);
  assert.equal(p.endSeq, 2);
  assert.equal(p.startTimeStamp, 1000);
  assert.equal(p.endTimeStamp, null);
  assert.equal(p.noteCount, 3);
});

test('two marks split three passes with the right boundaries and note counts', () => {
  const events = [
    ev(0, 'noteon', 60, 100),
    ev(1, 'noteon', 62, 200),
    marker(2, 300),
    ev(3, 'noteon', 64, 400),
    marker(4, 500),
    ev(5, 'noteon', 65, 600),
  ];
  const passes = PS.segment(events, { sessionStartTimeStamp: 1000, sessionEndTimeStamp: 700, includeEmptyTrailing: false });
  assert.deepEqual(
    passes.map((p) => [p.ordinal, p.startSeq, p.endSeq, p.startTimeStamp, p.endTimeStamp, p.noteCount]),
    [
      [1, 0, 2, 1000, 300, 2],
      [2, 3, 4, 300, 500, 1],
      [3, 5, 5, 500, 700, 1],
    ]
  );
});

test('a trailing pass with nothing after the last marker is dropped or kept per includeEmptyTrailing', () => {
  const events = [
    ev(0, 'noteon', 60, 100),
    ev(1, 'noteon', 62, 200),
    marker(2, 300),
    ev(3, 'noteon', 64, 400),
    marker(4, 500),
  ];
  const withoutTrailing = PS.segment(events, { sessionStartTimeStamp: 1000, sessionEndTimeStamp: 600, includeEmptyTrailing: false });
  assert.equal(withoutTrailing.length, 2);

  const withTrailing = PS.segment(events, { sessionStartTimeStamp: 1000, sessionEndTimeStamp: 600, includeEmptyTrailing: true });
  assert.equal(withTrailing.length, 3);
  const trailing = withTrailing[2];
  assert.equal(trailing.ordinal, 3);
  assert.equal(trailing.startSeq, 5);
  assert.equal(trailing.endSeq, 4);
  assert.equal(trailing.noteCount, 0);
});

test('two marks with nothing between them keep a 0-note middle pass (no double-mark undo)', () => {
  const events = [ev(0, 'noteon', 60, 100), marker(1, 300), marker(2, 301), ev(3, 'noteon', 62, 400)];
  const passes = PS.segment(events, { sessionStartTimeStamp: 1000, includeEmptyTrailing: false });
  assert.equal(passes.length, 3);
  assert.equal(passes[1].ordinal, 2);
  assert.equal(passes[1].noteCount, 0);
});

test('marker-tagged note-ons, note-offs, controls and other records count in eventCount, never noteCount', () => {
  const events = [
    ev(0, 'noteon', 60, 100),
    ev(1, 'noteon', 107, 200, { marker: true }),
    ev(2, 'noteoff', 107, 210),
    ev(3, 'control', 64, 220, { value: 127 }),
    ev(4, 'other', undefined, 230),
  ];
  const passes = PS.segment(events, { sessionStartTimeStamp: 1000, includeEmptyTrailing: true });
  assert.equal(passes.length, 1);
  const [p] = passes;
  assert.equal(p.noteCount, 1);
  assert.equal(p.eventCount, 4);
});

test('an empty stream yields no passes, or one empty pass when includeEmptyTrailing is set', () => {
  assert.deepEqual(PS.segment([], { sessionStartTimeStamp: 1000, includeEmptyTrailing: false }), []);
  const [p] = PS.segment([], { sessionStartTimeStamp: 1000, includeEmptyTrailing: true });
  assert.equal(p.ordinal, 1);
  assert.equal(p.startSeq, 0);
  assert.equal(p.endSeq, -1);
  assert.equal(p.noteCount, 0);
});

test('events supplied out of seq order are placed by seq; input is untouched; output survives a JSON round trip', () => {
  const events = [ev(2, 'noteon', 64, 300), ev(0, 'noteon', 60, 100), ev(1, 'noteon', 62, 200)];
  const snapshot = JSON.parse(JSON.stringify(events));
  const passes = PS.segment(events, { sessionStartTimeStamp: 1000, includeEmptyTrailing: true });
  assert.deepEqual(events, snapshot);
  assert.deepEqual(passes[0].notes.map((n) => n.note), [60, 62, 64]);
  assert.deepEqual(JSON.parse(JSON.stringify(passes)), passes);
});

test('invariant: every non-marker note in pass N carries passOrdinal N when assigned live', () => {
  const events = [
    ev(0, 'noteon', 60, 100, { passOrdinal: 1 }),
    ev(1, 'noteon', 62, 200, { passOrdinal: 1 }),
    marker(2, 300, { passOrdinal: 1 }),
    ev(3, 'noteon', 64, 400, { passOrdinal: 2 }),
  ];
  const passes = PS.segment(events, { sessionStartTimeStamp: 1000, includeEmptyTrailing: true });
  passes.forEach((pass) => {
    pass.notes.forEach((note) => {
      assert.equal(note.passOrdinal, pass.ordinal);
    });
  });
});
