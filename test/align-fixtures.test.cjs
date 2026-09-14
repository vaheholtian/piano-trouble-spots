'use strict';
/* Shape validation for the rung-1 alignment fixtures under test/fixtures/align/ (D-21, ANLZ-03).
   Runs with no align.js present -- every expected block was hand-derived from
   docs/analysis-rules.md, never pasted from a program's output (D-21 prohibition). This file
   only checks that each fixture is well-formed and internally consistent with the contract's
   shapes and gap-key/reason vocabularies; it does not run any alignment.
*/
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../src/score-model.js');
const M = globalThis.ScoreModel;

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'align');
const STATUSES = new Set(['played', 'wrong', 'missed', 'unassessed']);
const REASONS = new Set(['not-reached', 'restarted', 'ambiguous', 'tempo-changed']);
const TUNABLE_KEYS = new Set(['chordWindowMs', 'markGraceBeats', 'restartPrefixSlots', 'lateEntryProbeTokens', 'reachClock', 'weights']);
const GAP_RE = /^(before|within):\d+$/;
const RULE_RE = /^D-\d\d$/;

const fixtureNames = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json')).sort();

test('at least twelve rung-1 fixtures are committed under test/fixtures/align/', () => {
  assert.ok(fixtureNames.length >= 12, 'expected at least 12 fixture files, found ' + fixtureNames.length);
});

for (const fileName of fixtureNames) {
  const fullPath = path.join(FIXTURES_DIR, fileName);

  test('fixture ' + fileName + ' matches the interpretation contract\'s shapes', () => {
    const raw = fs.readFileSync(fullPath, 'utf8');

    let fixture;
    assert.doesNotThrow(() => {
      fixture = JSON.parse(raw);
    }, 'the file parses as JSON');

    assert.equal(fixture.scoreModel.schemaVersion, 1, 'scoreModel.schemaVersion is 1');

    // Every note id equals ScoreModel.deriveNoteId(...) and ids are unique -- the fixtures
    // test re-derives ids independently of whatever wrote the file, so a wrong id cannot
    // silently drift from the contract.
    const seenIds = new Set();
    for (const note of fixture.scoreModel.notes) {
      const derived = M.deriveNoteId({ measure: note.measure, staff: note.staff, voice: note.voice, onset: note.onset, midi: note.pitch.midi });
      assert.equal(note.id, derived, 'note id ' + note.id + ' equals ScoreModel.deriveNoteId(...) for the same note');
      assert.ok(!seenIds.has(note.id), 'note id ' + note.id + ' is unique within scoreModel.notes');
      seenIds.add(note.id);
    }

    // Clicks are non-empty, sorted by pageTime ascending, each has integer bpm and
    // accent === (beat === 1).
    assert.ok(Array.isArray(fixture.clicks) && fixture.clicks.length > 0, 'clicks is a non-empty array');
    for (let i = 1; i < fixture.clicks.length; i++) {
      assert.ok(fixture.clicks[i].pageTime > fixture.clicks[i - 1].pageTime, 'clicks are sorted by pageTime ascending');
    }
    for (const click of fixture.clicks) {
      assert.ok(Number.isInteger(click.bpm), 'click bpm is an integer');
      assert.equal(click.accent, click.beat === 1, 'click accent equals (beat === 1)');
    }

    // pass.notes are all type 'noteon' with marker false, sorted by seq ascending, and
    // pass.noteCount matches the array length.
    const notes = fixture.pass.notes;
    assert.ok(Array.isArray(notes), 'pass.notes is an array');
    for (let i = 0; i < notes.length; i++) {
      assert.equal(notes[i].type, 'noteon', 'pass.notes[' + i + '].type is noteon');
      assert.equal(notes[i].marker, false, 'pass.notes[' + i + '].marker is false');
      if (i > 0) assert.ok(notes[i].seq > notes[i - 1].seq, 'pass.notes is sorted by seq ascending');
    }
    assert.equal(fixture.pass.noteCount, notes.length, 'pass.noteCount equals pass.notes.length');

    // pass.startTimeStamp is a finite number.
    assert.ok(Number.isFinite(fixture.pass.startTimeStamp), 'pass.startTimeStamp is a finite number');

    // expected.attempt matches whether any note was played (D-14).
    assert.equal(fixture.expected.attempt, notes.length > 0, 'expected.attempt equals (pass.notes.length > 0)');

    // Exact expectation coverage (review 03-01 MEDIUM round 3): for an attempt, the keys of
    // expected.notes are exactly the model's note ids -- none missing, none extra, so no
    // verdict can escape verification by being left out. For a non-attempt, expected.notes
    // is empty.
    const modelIds = fixture.scoreModel.notes.map((n) => n.id).sort();
    const expectedIds = Object.keys(fixture.expected.notes).sort();
    if (fixture.expected.attempt) {
      assert.deepEqual(expectedIds, modelIds, 'expected.notes has exactly the model\'s note ids for an attempt, none missing and none extra');
    } else {
      assert.deepEqual(fixture.expected.notes, {}, 'expected.notes is empty for a non-attempt (none missing, none extra)');
    }

    // Every status is one of played/wrong/missed/unassessed; reason present exactly when
    // status is unassessed and drawn from the D-15 vocabulary; playedPitch present exactly
    // when status is wrong.
    for (const [noteId, verdict] of Object.entries(fixture.expected.notes)) {
      assert.ok(STATUSES.has(verdict.status), 'note ' + noteId + ' has a valid status (' + verdict.status + ')');
      const hasReason = Object.prototype.hasOwnProperty.call(verdict, 'reason');
      assert.equal(hasReason, verdict.status === 'unassessed', 'note ' + noteId + ' carries a reason exactly when unassessed');
      if (hasReason) assert.ok(REASONS.has(verdict.reason), 'note ' + noteId + ' reason (' + verdict.reason + ') is in the D-15 vocabulary');
      const hasPlayedPitch = Object.prototype.hasOwnProperty.call(verdict, 'playedPitch');
      assert.equal(hasPlayedPitch, verdict.status === 'wrong', 'note ' + noteId + ' carries playedPitch exactly when wrong');
    }

    // expected.entryLag, when present, is a non-negative integer.
    if (Object.prototype.hasOwnProperty.call(fixture.expected, 'entryLag')) {
      assert.ok(Number.isInteger(fixture.expected.entryLag) && fixture.expected.entryLag >= 0, 'expected.entryLag, when present, is a non-negative integer');
    }

    // Every extra's gap key matches before:k or within:k.
    for (const extra of fixture.expected.extras) {
      assert.ok(GAP_RE.test(extra.gap), 'extra gap key "' + extra.gap + '" matches before:k or within:k');
    }

    // rule matches D-NN.
    assert.ok(RULE_RE.test(fixture.rule), 'rule "' + fixture.rule + '" matches D-NN');

    // When originIndex is not null and endTimeStamp is a number, the fixture's own click
    // timeline covers the finalization horizon (section 5): the last click's pageTime is at
    // least endTimeStamp + 1.5 local beats.
    if (fixture.expected.originIndex !== null && typeof fixture.pass.endTimeStamp === 'number') {
      const localBeatMs = fixture.clicks[1].pageTime - fixture.clicks[0].pageTime;
      const lastClickPageTime = fixture.clicks[fixture.clicks.length - 1].pageTime;
      const horizon = fixture.pass.endTimeStamp + 1.5 * localBeatMs;
      assert.ok(lastClickPageTime >= horizon, 'the fixture\'s click timeline covers the finalization horizon (last click at or after endTimeStamp + 1.5 local beats), so the fixture is final');
    }

    // tunables is null or a plain object whose top-level keys are among the contract's
    // tunable names, with reachClock (when present) equal to 'origin' or 'reading'.
    if (fixture.tunables !== null) {
      assert.equal(typeof fixture.tunables, 'object', 'tunables is null or a plain object');
      for (const key of Object.keys(fixture.tunables)) {
        assert.ok(TUNABLE_KEYS.has(key), 'tunables key "' + key + '" is one of the contract\'s tunable names');
      }
      if (Object.prototype.hasOwnProperty.call(fixture.tunables, 'reachClock')) {
        assert.ok(fixture.tunables.reachClock === 'origin' || fixture.tunables.reachClock === 'reading', 'tunables.reachClock, when present, is "origin" or "reading"');
      }
    }

    // The whole file is plain JSON data: it survives a JSON round trip unchanged.
    assert.deepEqual(JSON.parse(JSON.stringify(fixture)), fixture, 'the fixture survives JSON.parse(JSON.stringify(x)) unchanged');
  });
}
