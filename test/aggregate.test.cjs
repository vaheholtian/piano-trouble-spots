'use strict';
/* Hand-built PassResult folds for src/aggregate.js -- docs/analysis-rules.md sections 7 and 8
   are the source of truth. Header pattern follows test/pass-segmenter.test.cjs.
*/
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../src/score-model.js');
require('../src/align.js');
require('../src/aggregate.js');
const Aggregate = globalThis.Aggregate;
const Align = globalThis.Align;

const RUNG1_MODEL = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'align', 'rung1-clean.json'), 'utf8')).scoreModel;

const IDS = {
  C4: 'm1-s1-v1-b0_1-p60',
  D4: 'm1-s1-v1-b1_1-p62',
  E4: 'm1-s1-v1-b2_1-p64',
  F4: 'm1-s1-v1-b3_1-p65',
  G4: 'm1-s1-v1-b4_1-p67',
};

const SLOTS = Align.buildSlots(RUNG1_MODEL).map((s) => ({ index: s.index, noteIds: s.noteIds, expectedTime: s.onset.beats * 500 + 1000, reached: true }));

function noteName(midi) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

// A clean, fully-played baseline PassResult (all five notes played, no extras).
function cleanResult(overrides) {
  const notes = {};
  for (const id of Object.values(IDS)) notes[id] = { status: 'played', playedSeq: 0, deviationMs: 0 };
  return {
    analysisVersion: 1,
    passOrdinal: 1,
    attempt: true,
    originIndex: 0,
    originTime: 1000,
    bpm: 120,
    endTime: 3400,
    entryLag: 0,
    totalCost: 0,
    wholeReason: null,
    slots: SLOTS.map((s) => ({ ...s })),
    notes,
    extras: [],
    ambiguousPlayed: [],
    ...(overrides || {}),
  };
}

function reasonResult(noteId, status, extra) {
  const result = cleanResult();
  result.notes[noteId] = { status, ...(extra || {}) };
  return result;
}

// ---- foldSession basics -------------------------------------------------------------------------

test('foldSession(model, []) gives empty tempoGroups; viewForTempoGroup gives every note untested', () => {
  const aggregate = Aggregate.foldSession(RUNG1_MODEL, []);
  assert.deepEqual(aggregate.tempoGroups, []);
  const view = Aggregate.viewForTempoGroup(RUNG1_MODEL, aggregate, 120);
  for (const id of Object.values(IDS)) assert.equal(view.noteKinds[id], 'untested');
});

test('a zero-note result lands in nonAttempts, not in any group (D-14)', () => {
  const zeroNote = { ...cleanResult(), attempt: false, notes: {} };
  const aggregate = Aggregate.foldSession(RUNG1_MODEL, [zeroNote]);
  assert.equal(aggregate.nonAttempts, 1);
  assert.equal(aggregate.tempoGroups.length, 0);
});

test('bpm 120, 120, 100 give two groups ordered [120, 100] with attempts 2 and 1', () => {
  const results = [cleanResult({ bpm: 120 }), cleanResult({ bpm: 120 }), cleanResult({ bpm: 100 })];
  const aggregate = Aggregate.foldSession(RUNG1_MODEL, results);
  assert.deepEqual(aggregate.tempoGroups.map((g) => g.bpm), [120, 100]);
  assert.equal(aggregate.tempoGroups[0].attempts, 2);
  assert.equal(aggregate.tempoGroups[1].attempts, 1);
});

test('bpm 120 and 121 give two groups', () => {
  const results = [cleanResult({ bpm: 120 }), cleanResult({ bpm: 121 })];
  const aggregate = Aggregate.foldSession(RUNG1_MODEL, results);
  assert.equal(aggregate.tempoGroups.length, 2);
});

test('wholeReason tempo-changed lands in tempoChanged and in no group', () => {
  const result = cleanResult({ wholeReason: 'tempo-changed' });
  const aggregate = Aggregate.foldSession(RUNG1_MODEL, [result]);
  assert.equal(aggregate.tempoChanged, 1);
  assert.equal(aggregate.tempoGroups.length, 0);
});

test('a null-bpm result is ungrouped', () => {
  const result = cleanResult({ bpm: null });
  const aggregate = Aggregate.foldSession(RUNG1_MODEL, [result]);
  assert.equal(aggregate.ungrouped, 1);
  assert.equal(aggregate.tempoGroups.length, 0);
});

test('four results (wrong F4, wrong F4, missed, not-reached) give the documented E4 counts', () => {
  const results = [
    reasonResult(IDS.E4, 'wrong', { playedPitch: 65, playedSeq: 0, deviationMs: 0 }),
    reasonResult(IDS.E4, 'wrong', { playedPitch: 65, playedSeq: 0, deviationMs: 0 }),
    reasonResult(IDS.E4, 'missed'),
    reasonResult(IDS.E4, 'unassessed', { reason: 'not-reached' }),
  ];
  const aggregate = Aggregate.foldSession(RUNG1_MODEL, results);
  const counts = aggregate.tempoGroups[0].notes[IDS.E4];
  assert.equal(counts.wrong, 2);
  assert.equal(counts.missed, 1);
  assert.equal(counts.assessed, 3);
  assert.deepEqual(counts.unassessed, { 'not-reached': 1, restarted: 0, ambiguous: 0 });
  assert.deepEqual(counts.wrongPitches, { 65: 2 });
});

test('a before:2 extra in two of three assessed passes gives passesWithExtra 2, totalExtras 2, assessedPasses 3, unassessedPasses 0', () => {
  const withExtra = () => cleanResult({ extras: [{ seq: 2, pitch: 65, timeStamp: 1900, gap: 'before:2' }] });
  const results = [withExtra(), withExtra(), cleanResult()];
  const aggregate = Aggregate.foldSession(RUNG1_MODEL, results);
  const gap = aggregate.tempoGroups[0].gaps['before:2'];
  assert.equal(gap.passesWithExtra, 2);
  assert.equal(gap.totalExtras, 2);
  assert.equal(gap.assessedPasses, 3);
  assert.equal(gap.unassessedPasses, 0);
});

// ---- Gap invariant (review 03-01 HIGH round 1, MEDIUM round 2) -----------------------------------

function messyResult() {
  const result = cleanResult();
  result.notes[IDS.E4] = { status: 'unassessed', reason: 'ambiguous' };
  result.ambiguousPlayed = [
    { seq: 3, pitch: 64, timeStamp: 1900, gap: 'before:2' },
    { seq: 4, pitch: 64, timeStamp: 2100, gap: 'before:3' },
  ];
  result.extras = [
    { seq: 5, pitch: 69, timeStamp: 2200, gap: 'before:3' },
    { seq: 6, pitch: 71, timeStamp: 2280, gap: 'before:3' },
    { seq: 7, pitch: 69, timeStamp: 2360, gap: 'before:3' },
    { seq: 8, pitch: 71, timeStamp: 2440, gap: 'before:3' },
  ];
  return result;
}

test('gap invariant: before:3 assessed with lowerBound; before:2 unassessed (no certain extra, ambiguous beside it)', () => {
  const aggregate = Aggregate.foldSession(RUNG1_MODEL, [messyResult()]);
  const gaps = aggregate.tempoGroups[0].gaps;
  assert.equal(gaps['before:3'].assessedPasses, 1);
  assert.equal(gaps['before:3'].passesWithExtra, 1);
  assert.equal(gaps['before:3'].totalExtras, 4);
  assert.equal(gaps['before:3'].lowerBoundPasses, 1);

  assert.equal(gaps['before:2'].assessedPasses, 0);
  assert.equal(gaps['before:2'].unassessedPasses, 1);

  assert.equal(gaps['within:2'].unassessedPasses, 1);

  assert.equal(gaps['before:4'].assessedPasses, 1);
  assert.equal(gaps['before:4'].lowerBoundPasses, 0);
});

test('a clean result folded with the messy one keeps before:2 at assessedPasses 1 of 2 passes', () => {
  const aggregate = Aggregate.foldSession(RUNG1_MODEL, [messyResult(), cleanResult()]);
  const gap = aggregate.tempoGroups[0].gaps['before:2'];
  assert.equal(gap.assessedPasses, 1);
  assert.equal(gap.unassessedPasses, 1);
});

test('a no-origin result with two extras at before:0 gives assessedPasses 0, unassessedPasses 1, passesWithExtra 0', () => {
  const noOrigin = cleanResult({ originIndex: null, originTime: null });
  noOrigin.slots = noOrigin.slots.map((s) => ({ ...s, expectedTime: null, reached: false }));
  for (const id of Object.values(IDS)) noOrigin.notes[id] = { status: 'unassessed', reason: 'not-reached' };
  noOrigin.extras = [
    { seq: 0, pitch: 60, timeStamp: 900, gap: 'before:0' },
    { seq: 1, pitch: 61, timeStamp: 910, gap: 'before:0' },
  ];
  const aggregate = Aggregate.foldSession(RUNG1_MODEL, [noOrigin]);
  const gap = aggregate.tempoGroups[0].gaps['before:0'];
  assert.equal(gap.assessedPasses, 0);
  assert.equal(gap.unassessedPasses, 1);
  assert.equal(gap.passesWithExtra, 0);
});

test('a restarted result counts unassessedPasses 1 for every gap', () => {
  const restarted = cleanResult({ wholeReason: 'restarted' });
  const aggregate = Aggregate.foldSession(RUNG1_MODEL, [restarted]);
  const gaps = aggregate.tempoGroups[0].gaps;
  for (const gap of Object.values(gaps)) {
    assert.equal(gap.unassessedPasses, 1);
  }
});

test('folding every fixture PassResult never yields lowerBoundPasses > passesWithExtra or passesWithExtra > assessedPasses', () => {
  const fixturesDir = path.join(__dirname, 'fixtures', 'align');
  const files = fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));
  const results = files.map((f) => {
    const fx = JSON.parse(fs.readFileSync(path.join(fixturesDir, f), 'utf8'));
    return Align.alignPass(fx.scoreModel, fx.pass, fx.clicks, fx.tunables || undefined);
  });
  const aggregate = Aggregate.foldSession(RUNG1_MODEL, results);
  for (const group of aggregate.tempoGroups) {
    for (const gap of Object.values(group.gaps)) {
      assert.ok(gap.lowerBoundPasses <= gap.passesWithExtra, 'lowerBoundPasses <= passesWithExtra');
      assert.ok(gap.passesWithExtra <= gap.assessedPasses, 'passesWithExtra <= assessedPasses');
    }
  }
});

// ---- gapAssessment on the messy result directly --------------------------------------------------

test('Aggregate.gapAssessment on the messy result', () => {
  const result = messyResult();
  const before3 = Aggregate.gapAssessment(result, 'before:3');
  assert.equal(before3.baseAssessable, true);
  assert.equal(before3.ambiguityAdjacent, true);
  assert.deepEqual(before3.extras.map((e) => e.pitch), [69, 71, 69, 71]);

  const before2 = Aggregate.gapAssessment(result, 'before:2');
  assert.equal(before2.baseAssessable, true);
  assert.equal(before2.ambiguityAdjacent, true);
  assert.deepEqual(before2.extras, []);

  const before4 = Aggregate.gapAssessment(result, 'before:4');
  assert.equal(before4.ambiguityAdjacent, false);
});

// ---- colourFor (D-18) -----------------------------------------------------------------------------

test('colourFor: wrong 2 / missed 1 -> wrong; wrong 1 / missed 1 -> wrong (tie); wrong 0 / missed 2 -> missed; clean; untested', () => {
  assert.equal(Aggregate.colourFor({ wrong: 2, missed: 1, assessed: 3 }), 'wrong');
  assert.equal(Aggregate.colourFor({ wrong: 1, missed: 1, assessed: 2 }), 'wrong');
  assert.equal(Aggregate.colourFor({ wrong: 0, missed: 2, assessed: 2 }), 'missed');
  assert.equal(Aggregate.colourFor({ wrong: 0, missed: 0, assessed: 3 }), 'clean');
  assert.equal(Aggregate.colourFor({ wrong: 0, missed: 0, assessed: 0 }), 'untested');
});

// ---- describeNote session sentences ----------------------------------------------------------------

test('describeNote session view reproduces the contract sentences', () => {
  const withMistakes = {
    played: 3,
    wrong: 4,
    missed: 1,
    assessed: 10,
    unassessed: { 'not-reached': 1, restarted: 1, ambiguous: 0 },
    unassessedTotal: 2,
    wrongPitches: { 65: 3, 63: 1 },
  };
  const sentence = Aggregate.describeNote(RUNG1_MODEL, IDS.E4, { kind: 'session', counts: withMistakes }, { noteName });
  assert.equal(
    sentence,
    'E4, bar 1 beat 3: wrong in 4 of 10 assessed passes (played F4 three times, D#4 once); missed in 1 of 10; 2 passes unassessed (1 not reached, 1 restarted)'
  );

  const missedOnly = { played: 1, wrong: 0, missed: 1, assessed: 2, unassessed: { 'not-reached': 0, restarted: 0, ambiguous: 0 }, unassessedTotal: 0, wrongPitches: {} };
  assert.equal(
    Aggregate.describeNote(RUNG1_MODEL, IDS.G4, { kind: 'session', counts: missedOnly }, { noteName }),
    'G4, bar 1 beat 5: missed in 1 of 2 assessed passes'
  );

  const cleanOnly = { played: 3, wrong: 0, missed: 0, assessed: 3, unassessed: { 'not-reached': 0, restarted: 0, ambiguous: 0 }, unassessedTotal: 0, wrongPitches: {} };
  assert.equal(
    Aggregate.describeNote(RUNG1_MODEL, IDS.C4, { kind: 'session', counts: cleanOnly }, { noteName }),
    'C4, bar 1 beat 1: played correctly in all 3 assessed passes'
  );

  const cleanWithUnassessed = { played: 4, wrong: 0, missed: 0, assessed: 4, unassessed: { 'not-reached': 1, restarted: 0, ambiguous: 0 }, unassessedTotal: 1, wrongPitches: {} };
  assert.equal(
    Aggregate.describeNote(RUNG1_MODEL, IDS.F4, { kind: 'session', counts: cleanWithUnassessed }, { noteName }),
    'F4, bar 1 beat 4: played correctly in all 4 assessed passes; 1 pass unassessed (1 not reached)'
  );

  const zeroAssessed = { played: 0, wrong: 0, missed: 0, assessed: 0, unassessed: { 'not-reached': 3, restarted: 0, ambiguous: 0 }, unassessedTotal: 3, wrongPitches: {} };
  assert.equal(
    Aggregate.describeNote(RUNG1_MODEL, IDS.E4, { kind: 'session', counts: zeroAssessed }, { noteName }),
    'E4, bar 1 beat 3: not assessed in any pass (3 not reached)'
  );

  assert.equal(
    Aggregate.describeNote(RUNG1_MODEL, IDS.E4, { kind: 'session', counts: null }, { noteName }),
    'E4, bar 1 beat 3: no passes yet'
  );
});

test('describeNote pass view sentences', () => {
  const wrongResult = reasonResult(IDS.E4, 'wrong', { playedPitch: 65, playedSeq: 0, deviationMs: 0 });
  assert.equal(
    Aggregate.describeNote(RUNG1_MODEL, IDS.E4, { kind: 'pass', result: wrongResult }, { noteName }),
    'E4, bar 1 beat 3: wrong, played F4'
  );
  const missedResult = reasonResult(IDS.E4, 'missed');
  assert.equal(Aggregate.describeNote(RUNG1_MODEL, IDS.E4, { kind: 'pass', result: missedResult }, { noteName }), 'E4, bar 1 beat 3: missed');

  const notReached = reasonResult(IDS.E4, 'unassessed', { reason: 'not-reached' });
  assert.equal(Aggregate.describeNote(RUNG1_MODEL, IDS.E4, { kind: 'pass', result: notReached }, { noteName }), 'E4, bar 1 beat 3: unassessed (not reached)');
  const ambiguous = reasonResult(IDS.E4, 'unassessed', { reason: 'ambiguous' });
  assert.equal(Aggregate.describeNote(RUNG1_MODEL, IDS.E4, { kind: 'pass', result: ambiguous }, { noteName }), 'E4, bar 1 beat 3: unassessed (ambiguous)');
  const tempoChanged = reasonResult(IDS.E4, 'unassessed', { reason: 'tempo-changed' });
  assert.equal(Aggregate.describeNote(RUNG1_MODEL, IDS.E4, { kind: 'pass', result: tempoChanged }, { noteName }), 'E4, bar 1 beat 3: unassessed (tempo changed)');
});

// ---- describeGap sentences --------------------------------------------------------------------------

test('describeGap session view reproduces the contract sentence', () => {
  const gap = { passesWithExtra: 6, totalExtras: 6, assessedPasses: 10, unassessedPasses: 2, lowerBoundPasses: 0, pitches: { 65: 5, 64: 1 } };
  const sentence = Aggregate.describeGap(RUNG1_MODEL, 'before:2', { kind: 'session', gap }, { noteName });
  assert.equal(sentence, 'Extra notes between D4 and E4: in 6 of 10 assessed passes (F4 five times, E4 once); 2 passes unassessed');
});

test('describeGap messy session fold reads with the ambiguous-nearby qualifier', () => {
  const aggregate = Aggregate.foldSession(RUNG1_MODEL, [messyResult()]);
  const sentence = Aggregate.describeGap(RUNG1_MODEL, 'before:3', { kind: 'session', gap: aggregate.tempoGroups[0].gaps['before:3'] }, { noteName });
  assert.equal(sentence, 'Extra notes between E4 and F4: in 1 of 1 assessed passes (at least A4 twice, B4 twice); 1 pass with ambiguous notes nearby');
});

test('describeGap pass view sentences', () => {
  const result = cleanResult({ extras: [{ seq: 2, pitch: 65, timeStamp: 1900, gap: 'before:2' }] });
  assert.equal(Aggregate.describeGap(RUNG1_MODEL, 'before:2', { kind: 'pass', result }, { noteName }), 'Extra notes between D4 and E4: F4');

  const messyPass = messyResult();
  assert.equal(
    Aggregate.describeGap(RUNG1_MODEL, 'before:3', { kind: 'pass', result: messyPass }, { noteName }),
    'Extra notes between E4 and F4: at least A4, B4, A4, B4 (ambiguous notes nearby)'
  );

  const withoutAmbiguity = messyResult();
  withoutAmbiguity.ambiguousPlayed = [];
  withoutAmbiguity.notes[IDS.E4] = { status: 'played', playedSeq: 3, deviationMs: 0 };
  assert.equal(
    Aggregate.describeGap(RUNG1_MODEL, 'before:3', { kind: 'pass', result: withoutAmbiguity }, { noteName }),
    'Extra notes between E4 and F4: A4, B4, A4, B4'
  );
});

// ---- viewForTempoGroup / viewForPass shapes ------------------------------------------------------

test('viewForTempoGroup gives noteKinds for every model note and a glyph for before:2', () => {
  const withExtra = () => cleanResult({ extras: [{ seq: 2, pitch: 65, timeStamp: 1900, gap: 'before:2' }] });
  const aggregate = Aggregate.foldSession(RUNG1_MODEL, [withExtra(), withExtra()]);
  const view = Aggregate.viewForTempoGroup(RUNG1_MODEL, aggregate, 120);
  assert.equal(Object.keys(view.noteKinds).length, 5);
  assert.deepEqual(view.glyphs['before:2'], { count: 2, text: '+2' });
});

test('viewForPass maps played/wrong/missed/unassessed to clean/wrong/missed/untested with glyph text +', () => {
  const result = cleanResult();
  result.notes[IDS.E4] = { status: 'wrong', playedPitch: 65, playedSeq: 0, deviationMs: 0 };
  result.notes[IDS.F4] = { status: 'missed' };
  result.notes[IDS.G4] = { status: 'unassessed', reason: 'not-reached' };
  result.extras = [{ seq: 2, pitch: 65, timeStamp: 1900, gap: 'before:1' }];
  const view = Aggregate.viewForPass(RUNG1_MODEL, result);
  assert.equal(view.noteKinds[IDS.C4], 'clean');
  assert.equal(view.noteKinds[IDS.E4], 'wrong');
  assert.equal(view.noteKinds[IDS.F4], 'missed');
  assert.equal(view.noteKinds[IDS.G4], 'untested');
  assert.equal(view.glyphs['before:1'].text, '+');
});

// ---- headingFor -------------------------------------------------------------------------------------

test('headingFor: singular and plural pass counts', () => {
  const aggregate1 = Aggregate.foldSession(RUNG1_MODEL, [cleanResult()]);
  assert.equal(Aggregate.headingFor(aggregate1, { kind: 'session', bpm: 120 }, {}), 'This session at 120 BPM - 1 pass');

  const aggregate3 = Aggregate.foldSession(RUNG1_MODEL, [cleanResult(), cleanResult(), cleanResult()]);
  assert.equal(Aggregate.headingFor(aggregate3, { kind: 'session', bpm: 120 }, {}), 'This session at 120 BPM - 3 passes');
});

// ---- wordCount ----------------------------------------------------------------------------------------

test('wordCount: once, twice, N times', () => {
  assert.equal(Aggregate.wordCount(1), 'once');
  assert.equal(Aggregate.wordCount(2), 'twice');
  assert.equal(Aggregate.wordCount(3), 'three times');
});
