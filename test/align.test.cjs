'use strict';
/* Fixture-driven and hand-built tests for src/align.js -- the interpretation contract
   (docs/analysis-rules.md) is the source of truth every assertion below cites. Header pattern
   follows test/pass-segmenter.test.cjs: require the pure modules, pull their globals, no jsdom.
*/
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../src/score-model.js');
require('../src/align.js');
const ScoreModel = globalThis.ScoreModel;
const Align = globalThis.Align;

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'align');

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name + '.json'), 'utf8'));
}

function note(seq, midi, timeStamp, extra) {
  return { seq, type: 'noteon', note: midi, velocity: 80, timeStamp, marker: false, ...(extra || {}) };
}

// ---- Fixture-driven tests --------------------------------------------------------------------

const fixtureNames = fs
  .readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();

test('at least twelve rung-1 fixtures are available to align.test.cjs', () => {
  assert.ok(fixtureNames.length >= 12, 'expected at least 12 fixtures, found ' + fixtureNames.length);
});

for (const name of fixtureNames) {
  test('fixture ' + name + ' (' + loadFixture(name).rule + '): Align.alignPass matches expected', () => {
    const f = loadFixture(name);
    const passSnapshot = JSON.parse(JSON.stringify(f.pass));
    const result = Align.alignPass(f.scoreModel, f.pass, f.clicks, f.tunables || undefined);

    // Inputs never mutated.
    assert.deepEqual(f.pass, passSnapshot, 'pass is not mutated by alignPass');

    assert.equal(result.attempt, f.expected.attempt, 'attempt');
    assert.equal(result.originIndex, f.expected.originIndex, 'originIndex');
    assert.equal(result.bpm, f.expected.bpm, 'bpm');
    assert.equal(result.wholeReason, f.expected.wholeReason, 'wholeReason');
    if (Object.prototype.hasOwnProperty.call(f.expected, 'entryLag')) {
      assert.equal(result.entryLag, f.expected.entryLag, 'entryLag');
    } else {
      assert.equal(result.entryLag, 0, 'entryLag defaults to 0');
    }

    // Exact verdict coverage (review 03-01 MEDIUM round 3): no note escapes comparison by
    // being left out of either side.
    const resultKeys = Object.keys(result.notes).sort();
    const expectedKeys = Object.keys(f.expected.notes).sort();
    assert.deepEqual(resultKeys, expectedKeys, 'result.notes keys equal f.expected.notes keys exactly');

    for (const noteId of expectedKeys) {
      const expectedVerdict = f.expected.notes[noteId];
      const actualVerdict = result.notes[noteId];
      assert.equal(actualVerdict.status, expectedVerdict.status, noteId + ' status');
      if (expectedVerdict.status === 'wrong') {
        assert.equal(actualVerdict.playedPitch, expectedVerdict.playedPitch, noteId + ' playedPitch');
      }
      if (expectedVerdict.status === 'unassessed') {
        assert.equal(actualVerdict.reason, expectedVerdict.reason, noteId + ' reason');
      }
    }

    // Fixture files record extras as { gap, pitch } (the shape's own documented subset); the
    // full PassResult additionally carries seq/timeStamp -- project down before comparing.
    const projectedExtras = result.extras.map((e) => ({ gap: e.gap, pitch: e.pitch }));
    assert.deepEqual(projectedExtras, f.expected.extras, 'extras (gap + pitch, in seq order)');

    // PassResult is plain JSON and survives a round trip.
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result, 'PassResult survives JSON round trip');
  });
}

// ---- Per-note deviationMs (named fixtures) ---------------------------------------------------

test('rung1-late-first-note: C4 deviationMs is 200', () => {
  const f = loadFixture('rung1-late-first-note');
  const result = Align.alignPass(f.scoreModel, f.pass, f.clicks);
  assert.equal(result.notes['m1-s1-v1-b0_1-p60'].deviationMs, 200);
});

test('rung1-correction: E4 deviationMs is 100', () => {
  const f = loadFixture('rung1-correction');
  const result = Align.alignPass(f.scoreModel, f.pass, f.clicks);
  assert.equal(result.notes['m1-s1-v1-b2_1-p64'].deviationMs, 100);
});

test('rung1-whole-beat-late: every note deviationMs is 500', () => {
  const f = loadFixture('rung1-whole-beat-late');
  const result = Align.alignPass(f.scoreModel, f.pass, f.clicks);
  for (const id of Object.keys(f.expected.notes)) {
    assert.equal(result.notes[id].deviationMs, 500, id + ' deviationMs');
  }
});

// ---- Worked totalCost numbers (integer thousandths, ANLZ-01 precision probe) ------------------

test('rung1-wrong-e totalCost is 3000', () => {
  const f = loadFixture('rung1-wrong-e');
  const result = Align.alignPass(f.scoreModel, f.pass, f.clicks);
  assert.equal(result.totalCost, 3000);
  assert.equal(Number.isInteger(result.totalCost), true);
});

test('rung1-correction totalCost is 3680', () => {
  const f = loadFixture('rung1-correction');
  const result = Align.alignPass(f.scoreModel, f.pass, f.clicks);
  assert.equal(result.totalCost, 3680);
});

test('rung1-shifted-start totalCost is 15000', () => {
  const f = loadFixture('rung1-shifted-start');
  const result = Align.alignPass(f.scoreModel, f.pass, f.clicks);
  assert.equal(result.totalCost, 15000);
});

test('the correction clone with E at 2300 gives 5040, E played, extra F4 at before:2', () => {
  const f = loadFixture('rung1-correction');
  const pass = {
    ordinal: 1,
    startSeq: 0,
    startTimeStamp: 900,
    endSeq: 5,
    endTimeStamp: 3400,
    noteCount: 6,
    eventCount: 0,
    notes: [
      note(0, 60, 1000),
      note(1, 62, 1500),
      note(2, 65, 1900),
      note(3, 64, 2300),
      note(4, 65, 2500),
      note(5, 67, 3000),
    ],
  };
  const result = Align.alignPass(f.scoreModel, pass, f.clicks);
  assert.equal(result.totalCost, 5040);
  assert.equal(result.notes['m1-s1-v1-b2_1-p64'].status, 'played');
  assert.deepEqual(result.extras, [{ seq: 2, pitch: 65, timeStamp: 1900, gap: 'before:2' }]);
});

test('the chronological crossover C D F F E G with E at 2600 gives 6680', () => {
  const f = loadFixture('rung1-clean');
  const pass = {
    ordinal: 1,
    startSeq: 0,
    startTimeStamp: 900,
    endSeq: 5,
    endTimeStamp: 3400,
    noteCount: 6,
    eventCount: 0,
    notes: [
      note(0, 60, 1000),
      note(1, 62, 1500),
      note(2, 65, 1900),
      note(3, 65, 2500),
      note(4, 64, 2600),
      note(5, 67, 3000),
    ],
  };
  const result = Align.alignPass(f.scoreModel, pass, f.clicks);
  assert.equal(result.totalCost, 6680);
  assert.equal(result.notes['m1-s1-v1-b2_1-p64'].status, 'wrong');
  assert.equal(result.notes['m1-s1-v1-b2_1-p64'].playedPitch, 65);
  assert.equal(result.notes['m1-s1-v1-b3_1-p65'].status, 'played');
  assert.deepEqual(result.extras, [{ seq: 4, pitch: 64, timeStamp: 2600, gap: 'before:4' }]);
});

// ---- Decreasing timestamps (review 03-01 HIGH round 3) -----------------------------------------

test('tokenizePlayed: seq-ordered 64@2000 then 65@1940 gives two tokens', () => {
  const tokens = Align.tokenizePlayed([note(0, 64, 2000), note(1, 65, 1940)], 50);
  assert.equal(tokens.length, 2);
});

test('tokenizePlayed: seq-ordered 64@2000 then 65@1960 gives one token with onsetTime 2000', () => {
  const tokens = Align.tokenizePlayed([note(0, 64, 2000), note(1, 65, 1960)], 50);
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].onsetTime, 2000);
});

test('alignPass with F at 1940 (seq 3) on rung 1: all played, F deviationMs -560, totalCost 3808', () => {
  const f = loadFixture('rung1-clean');
  const pass = {
    ordinal: 1,
    startSeq: 0,
    startTimeStamp: 900,
    endSeq: 4,
    endTimeStamp: 3400,
    noteCount: 5,
    eventCount: 0,
    notes: [note(0, 60, 1000), note(1, 62, 1500), note(2, 64, 2000), note(3, 65, 1940), note(4, 67, 3000)],
  };
  const snapshot = JSON.parse(JSON.stringify(pass));
  const result = Align.alignPass(f.scoreModel, pass, f.clicks);
  assert.deepEqual(pass, snapshot, 'raw pass unchanged after alignment');
  for (const id of Object.keys(f.expected.notes)) {
    assert.equal(result.notes[id].status, 'played', id + ' status');
  }
  assert.equal(result.notes['m1-s1-v1-b3_1-p65'].deviationMs, -560);
  assert.equal(result.totalCost, 3808);
  assert.deepEqual(pass.notes.map((n) => n.seq), [0, 1, 2, 3, 4], 'pass.notes keeps its seq order');
});

test('alignPass with F at 1960 (seq 3) on rung 1: E played, F4 missed, extra F4 within:2, totalCost 7000', () => {
  const f = loadFixture('rung1-clean');
  const pass = {
    ordinal: 1,
    startSeq: 0,
    startTimeStamp: 900,
    endSeq: 4,
    endTimeStamp: 3400,
    noteCount: 5,
    eventCount: 0,
    notes: [note(0, 60, 1000), note(1, 62, 1500), note(2, 64, 2000), note(3, 65, 1960), note(4, 67, 3000)],
  };
  const result = Align.alignPass(f.scoreModel, pass, f.clicks);
  assert.equal(result.notes['m1-s1-v1-b2_1-p64'].status, 'played');
  assert.equal(result.notes['m1-s1-v1-b3_1-p65'].status, 'missed');
  assert.deepEqual(result.extras, [{ seq: 3, pitch: 65, timeStamp: 1960, gap: 'within:2' }]);
  assert.equal(result.totalCost, 7000);
});

// ---- Per-event deviation (chord) ---------------------------------------------------------------

test('a two-note slot played 30ms apart gives deviationMs 0 and 30, not 0 and 0', () => {
  const model = {
    schemaVersion: 1,
    title: 'synthetic',
    measures: [{ number: 1, start: ScoreModel.rational(0, 1), length: ScoreModel.rational(4, 1), timeSignature: { beats: 4, beatType: 4 } }],
    notes: [
      { id: 'm1-s1-v1-b0_1-p60', measure: 1, staff: 1, voice: 1, onset: ScoreModel.rational(0, 1), duration: ScoreModel.rational(1, 1), pitch: { name: 'C4', midi: 60 }, tiedNoteCount: 1 },
      { id: 'm1-s1-v1-b0_1-p64', measure: 1, staff: 1, voice: 1, onset: ScoreModel.rational(0, 1), duration: ScoreModel.rational(1, 1), pitch: { name: 'E4', midi: 64 }, tiedNoteCount: 1 },
    ],
  };
  const clicks = [
    { id: 1, sessionId: 1, audioTime: 0.1, pageTime: 1000, bar: 1, beat: 1, bpm: 120, accent: true },
    { id: 2, sessionId: 1, audioTime: 0.6, pageTime: 1500, bar: 1, beat: 2, bpm: 120, accent: false },
    { id: 3, sessionId: 1, audioTime: 1.1, pageTime: 2000, bar: 1, beat: 3, bpm: 120, accent: false },
  ];
  const pass = { ordinal: 1, startSeq: 0, startTimeStamp: 900, endSeq: 1, endTimeStamp: 1500, noteCount: 2, eventCount: 0, notes: [note(0, 60, 1000), note(1, 64, 1030)] };
  const result = Align.alignPass(model, pass, clicks);
  assert.equal(result.notes['m1-s1-v1-b0_1-p60'].deviationMs, 0);
  assert.equal(result.notes['m1-s1-v1-b0_1-p64'].deviationMs, 30);
});

// ---- Grace boundary (D-11) ----------------------------------------------------------------------

test('rung1-early-last-note-style grace boundary: mark 2750 -> G missed, mark 2749 -> G not-reached', () => {
  const f = loadFixture('rung1-not-reached');
  const basePass = { ordinal: 1, startSeq: 0, startTimeStamp: 900, endSeq: 3, noteCount: 4, eventCount: 0, notes: [note(0, 60, 1000), note(1, 62, 1500), note(2, 64, 2000), note(3, 65, 2500)] };

  const passMissed = { ...basePass, endTimeStamp: 2750 };
  const resultMissed = Align.alignPass(f.scoreModel, passMissed, f.clicks);
  assert.equal(resultMissed.notes['m1-s1-v1-b4_1-p67'].status, 'missed');

  const passNotReached = { ...basePass, endTimeStamp: 2749 };
  const resultNotReached = Align.alignPass(f.scoreModel, passNotReached, f.clicks);
  assert.equal(resultNotReached.notes['m1-s1-v1-b4_1-p67'].status, 'unassessed');
  assert.equal(resultNotReached.notes['m1-s1-v1-b4_1-p67'].reason, 'not-reached');
});

// ---- Origin -----------------------------------------------------------------------------------

test('origin after the pass start: 3499 -> originIndex 5; 3501 -> originIndex 10', () => {
  const f = loadFixture('rung1-clean');
  assert.equal(Align.resolveOrigin(f.clicks, 3499), 5);
  assert.equal(Align.resolveOrigin(f.clicks, 3501), 10);
});

test('resolveOrigin returns null when no accented click exists at or after the pass start', () => {
  const f = loadFixture('rung1-clean');
  assert.equal(Align.resolveOrigin(f.clicks, 99999), null);
});

test('a pass with no origin: every note unassessed not-reached, every played note an extra at before:0', () => {
  const f = loadFixture('rung1-clean');
  const pass = { ordinal: 1, startSeq: 0, startTimeStamp: 99999, endSeq: 0, endTimeStamp: 99999, noteCount: 1, eventCount: 0, notes: [note(0, 60, 99999)] };
  const result = Align.alignPass(f.scoreModel, pass, f.clicks);
  assert.equal(result.originIndex, null);
  for (const id of Object.keys(result.notes)) {
    assert.equal(result.notes[id].status, 'unassessed');
    assert.equal(result.notes[id].reason, 'not-reached');
  }
  assert.deepEqual(result.extras, [{ seq: 0, pitch: 60, timeStamp: 99999, gap: 'before:0' }]);
});

// ---- expectedTime -------------------------------------------------------------------------------

test('Align.expectedTime: fractional onset interpolates between recorded clicks', () => {
  const f = loadFixture('rung1-clean');
  assert.equal(Align.expectedTime(f.clicks, 0, ScoreModel.rational(5, 2)), 2250);
});

test('Align.expectedTime: onset (0,1) returns the origin click itself', () => {
  const f = loadFixture('rung1-clean');
  assert.equal(Align.expectedTime(f.clicks, 0, ScoreModel.rational(0, 1)), 1000);
});

test('Align.expectedTime: an onset beyond the recorded clicks returns null', () => {
  const f = loadFixture('rung1-clean');
  assert.equal(Align.expectedTime(f.clicks, 0, ScoreModel.rational(50, 1)), null);
});

// ---- tokenizePlayed -----------------------------------------------------------------------------

test('tokenizePlayed: two note-ons 50ms apart are one token, 51ms apart are two', () => {
  const within = Align.tokenizePlayed([note(0, 60, 1000), note(1, 62, 1050)], 50);
  assert.equal(within.length, 1);
  const beyond = Align.tokenizePlayed([note(0, 60, 1000), note(1, 62, 1051)], 50);
  assert.equal(beyond.length, 2);
});

test('tokenizePlayed: a re-struck pitch 10ms later stays in the same token as a duplicate', () => {
  const tokens = Align.tokenizePlayed([note(0, 60, 1000), note(1, 60, 1010)], 50);
  assert.equal(tokens.length, 1);
  assert.deepEqual(tokens[0].pitches, [60]);
  assert.equal(tokens[0].duplicates.length, 1);
});

test('rung1-clean cloned with an extra 60@1010 gives C played and one extra C4 at within:0', () => {
  const f = loadFixture('rung1-clean');
  const notes = f.pass.notes.map((n) => ({ ...n }));
  notes.splice(1, 0, note(1, 60, 1010));
  for (let i = 2; i < notes.length; i++) notes[i] = { ...notes[i], seq: i };
  const pass = { ...f.pass, endSeq: 5, notes };
  const result = Align.alignPass(f.scoreModel, pass, f.clicks);
  assert.equal(result.notes['m1-s1-v1-b0_1-p60'].status, 'played');
  assert.equal(result.notes['m1-s1-v1-b0_1-p60'].playedSeq, 0);
  const extrasAtWithin0 = result.extras.filter((e) => e.gap === 'within:0');
  assert.equal(extrasAtWithin0.length, 1);
  assert.equal(extrasAtWithin0[0].pitch, 60);
});

// ---- Immutability, shapes, constants -------------------------------------------------------------

test('Align.ANALYSIS_VERSION is 1', () => {
  assert.equal(Align.ANALYSIS_VERSION, 1);
});

test('Align.REASONS is the fixed D-15 vocabulary in order', () => {
  assert.deepEqual(Align.REASONS, ['not-reached', 'restarted', 'ambiguous', 'tempo-changed']);
});

test('DEFAULT_TUNABLES has the contract\'s values', () => {
  assert.equal(Align.DEFAULT_TUNABLES.weights.lateEntry, 2);
  assert.equal(Align.DEFAULT_TUNABLES.lateEntryProbeTokens, 3);
  assert.equal(Align.DEFAULT_TUNABLES.reachClock, 'origin');
});

test('resolveTunables deep-merges a partial object over the defaults', () => {
  const merged = Align.resolveTunables({ weights: { lateEntry: 13 } });
  assert.equal(merged.weights.lateEntry, 13);
  assert.equal(merged.weights.substitution, 3);
  assert.equal(merged.chordWindowMs, 50);
});

test('resolveTunables(null) returns the defaults', () => {
  assert.equal(Align.resolveTunables(null), Align.DEFAULT_TUNABLES);
});
