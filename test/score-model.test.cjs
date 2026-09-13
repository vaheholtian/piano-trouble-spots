const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { installOsmdNodeEnv, loadSheet, readFixture } = require('./osmd-node-env.cjs');

const env = installOsmdNodeEnv();
require('../src/score-model.js');
const M = globalThis.ScoreModel;

after(() => env.restore());

test('rung 1 (right hand C D E F G) produces the exact expected note list', async () => {
  const sheet = await loadSheet(readFixture('fixtures/01-right-hand.musicxml'));
  const model = M.extract(sheet);

  const expectedNotes = [
    { id: 'm1-s1-v1-b0_1-p60', measure: 1, staff: 1, voice: 1, onset: { num: 0, den: 1, beats: 0 }, duration: { num: 1, den: 1, beats: 1 }, pitch: { name: 'C4', midi: 60 }, tiedNoteCount: 1 },
    { id: 'm1-s1-v1-b1_1-p62', measure: 1, staff: 1, voice: 1, onset: { num: 1, den: 1, beats: 1 }, duration: { num: 1, den: 1, beats: 1 }, pitch: { name: 'D4', midi: 62 }, tiedNoteCount: 1 },
    { id: 'm1-s1-v1-b2_1-p64', measure: 1, staff: 1, voice: 1, onset: { num: 2, den: 1, beats: 2 }, duration: { num: 1, den: 1, beats: 1 }, pitch: { name: 'E4', midi: 64 }, tiedNoteCount: 1 },
    { id: 'm1-s1-v1-b3_1-p65', measure: 1, staff: 1, voice: 1, onset: { num: 3, den: 1, beats: 3 }, duration: { num: 1, den: 1, beats: 1 }, pitch: { name: 'F4', midi: 65 }, tiedNoteCount: 1 },
    { id: 'm1-s1-v1-b4_1-p67', measure: 1, staff: 1, voice: 1, onset: { num: 4, den: 1, beats: 4 }, duration: { num: 1, den: 1, beats: 1 }, pitch: { name: 'G4', midi: 67 }, tiedNoteCount: 1 },
  ];
  assert.deepEqual(model.notes, expectedNotes);

  assert.deepEqual(model.measures, [
    { number: 1, start: { num: 0, den: 1, beats: 0 }, length: { num: 5, den: 1, beats: 5 }, timeSignature: { beats: 5, beatType: 4 } },
  ]);
  assert.equal(model.schemaVersion, 1);
});

test('the model is plain JSON data', async () => {
  const sheet = await loadSheet(readFixture('fixtures/01-right-hand.musicxml'));
  const model = M.extract(sheet);
  assert.deepEqual(JSON.parse(JSON.stringify(model)), model);
});

test('middle C pins the MIDI offset and the octave constant', async () => {
  const sheet = await loadSheet(readFixture('fixtures/01-right-hand.musicxml'));
  const model = M.extract(sheet);
  assert.equal(model.notes[0].pitch.midi, 60);
  assert.equal(model.notes[0].pitch.name, 'C4');
  const OSMD = require('opensheetmusicdisplay/build/opensheetmusicdisplay.min.js');
  assert.equal(3, OSMD.Pitch.OctaveXmlDifference);
});

test('extracting the same file twice yields identical ids', async () => {
  const content = readFixture('fixtures/01-right-hand.musicxml');
  const sheet1 = await loadSheet(content);
  const sheet2 = await loadSheet(content);
  const ids1 = M.extract(sheet1).notes.map((n) => n.id);
  const ids2 = M.extract(sheet2).notes.map((n) => n.id);
  assert.deepEqual(ids1, ids2);
  assert.equal(new Set(ids1).size, ids1.length);
});

test('onNote hook receives each model note with its OSMD source note in canonical order', async () => {
  const sheet = await loadSheet(readFixture('fixtures/01-right-hand.musicxml'));
  const calls = [];
  const model = M.extract(sheet, { onNote: (modelNote, osmdNote) => calls.push([modelNote, osmdNote]) });
  assert.equal(calls.length, 5);
  calls.forEach(([modelNote, osmdNote], i) => {
    assert.equal(modelNote.id, model.notes[i].id);
    assert.equal(osmdNote.halfTone + 12, model.notes[i].pitch.midi);
  });
});

function rowsOf(model) {
  return model.notes.map((n) => [
    n.measure,
    n.onset.num + '/' + n.onset.den,
    n.staff,
    n.voice,
    n.pitch.name,
    n.pitch.midi,
    n.duration.num + '/' + n.duration.den,
  ]);
}

const EXPECTED_RUNG_2 = [
  [1, '0/1', 2, 5, 'C3', 48, '1/1'],
  [1, '1/1', 2, 5, 'D3', 50, '1/1'],
  [1, '2/1', 2, 5, 'E3', 52, '1/1'],
  [1, '3/1', 2, 5, 'F3', 53, '1/1'],
  [1, '4/1', 2, 5, 'G3', 55, '1/1'],
];

const EXPECTED_RUNG_3 = [
  [1, '0/1', 1, 1, 'C4', 60, '1/1'],
  [1, '0/1', 2, 5, 'C3', 48, '1/1'],
  [1, '1/1', 1, 1, 'D4', 62, '1/1'],
  [1, '1/1', 2, 5, 'D3', 50, '1/1'],
  [1, '2/1', 1, 1, 'E4', 64, '1/1'],
  [1, '2/1', 2, 5, 'E3', 52, '1/1'],
  [1, '3/1', 1, 1, 'F4', 65, '1/1'],
  [1, '3/1', 2, 5, 'F3', 53, '1/1'],
  [1, '4/1', 1, 1, 'G4', 67, '1/1'],
  [1, '4/1', 2, 5, 'G3', 55, '1/1'],
];

const EXPECTED_RUNG_4 = [
  [1, '0/1', 1, 1, 'C4', 60, '2/1'],
  [1, '0/1', 1, 1, 'E4', 64, '2/1'],
  [1, '0/1', 1, 1, 'G4', 67, '2/1'],
  [1, '0/1', 2, 5, 'C3', 48, '2/1'],
  [1, '2/1', 1, 1, 'F4', 65, '2/1'],
  [1, '2/1', 1, 1, 'A4', 69, '2/1'],
  [1, '2/1', 1, 1, 'C5', 72, '2/1'],
  [1, '2/1', 2, 5, 'F3', 53, '2/1'],
];

test('rung 2 (left hand C D E F G) produces the exact expected note list', async () => {
  const sheet = await loadSheet(readFixture('fixtures/02-left-hand.xml'));
  const model = M.extract(sheet);
  assert.deepEqual(rowsOf(model), EXPECTED_RUNG_2);
  assert.ok(model.notes.every((n) => n.tiedNoteCount === 1));
  assert.equal(new Set(model.notes.map((n) => n.id)).size, model.notes.length);
  assert.deepEqual(model.measures[0].timeSignature, { beats: 5, beatType: 4 });
});

test('rung 3 (both hands) produces the exact expected note list', async () => {
  const sheet = await loadSheet(readFixture('fixtures/03-both-hands.musicxml'));
  const model = M.extract(sheet);
  assert.deepEqual(rowsOf(model), EXPECTED_RUNG_3);
  assert.ok(model.notes.every((n) => n.tiedNoteCount === 1));
  assert.equal(new Set(model.notes.map((n) => n.id)).size, model.notes.length);
  assert.equal(model.notes[0].id, 'm1-s1-v1-b0_1-p60');
  assert.equal(model.notes[1].id, 'm1-s2-v5-b0_1-p48');
  assert.deepEqual(model.measures[0].timeSignature, { beats: 5, beatType: 4 });
});

test('rung 4 (two chords) produces the exact expected note list', async () => {
  const sheet = await loadSheet(readFixture('fixtures/04-chords.musicxml'));
  const model = M.extract(sheet);
  assert.deepEqual(rowsOf(model), EXPECTED_RUNG_4);
  assert.ok(model.notes.every((n) => n.tiedNoteCount === 1));
  assert.equal(new Set(model.notes.map((n) => n.id)).size, model.notes.length);

  const chord1 = model.notes.filter((n) => n.onset.num === 0 && n.onset.den === 1 && n.staff === 1);
  assert.equal(chord1.length, 3);
  assert.ok(chord1.every((n) => n.onset.num === 0 && n.onset.den === 1 && n.onset.beats === 0));
  assert.deepEqual(chord1.map((n) => n.id).sort(), ['m1-s1-v1-b0_1-p60', 'm1-s1-v1-b0_1-p64', 'm1-s1-v1-b0_1-p67']);

  assert.deepEqual(model.measures[0].timeSignature, { beats: 4, beatType: 4 });
});

test('the jsdom shim installs globals with defineProperty and restores the previous descriptors', () => {
  assert.equal(Object.getOwnPropertyDescriptor(globalThis, 'navigator').value, env.dom.window.navigator);
  const nested = installOsmdNodeEnv();
  assert.equal(globalThis.document, nested.dom.window.document);
  nested.restore();
  assert.equal(globalThis.document, env.dom.window.document);
  assert.equal(globalThis.navigator, env.dom.window.navigator);
});
