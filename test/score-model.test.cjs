const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

const EXPECTED_RUNG_5 = [
  [1, '0/1', 1, 1, 'B4', 71, '3/1'],
  [1, '0/1', 1, 1, 'D5', 74, '3/1'],
  [1, '0/1', 1, 1, 'B5', 83, '3/1'],
  [1, '0/1', 2, 5, 'G2', 43, '1/2'],
  [1, '1/2', 2, 5, 'D3', 50, '1/2'],
  [1, '1/1', 2, 5, 'G3', 55, '1/2'],
  [1, '3/2', 2, 5, 'B3', 59, '1/2'],
  [1, '2/1', 2, 5, 'G3', 55, '1/2'],
  [1, '5/2', 2, 5, 'D3', 50, '1/2'],
  [2, '0/1', 1, 1, 'F#5', 78, '1/1'],
  [2, '0/1', 1, 1, 'D6', 86, '1/1'],
  [2, '0/1', 2, 5, 'G2', 43, '1/2'],
  [2, '1/2', 2, 5, 'D3', 50, '1/2'],
  [2, '1/1', 1, 1, 'E5', 76, '3/2'],
  [2, '1/1', 1, 1, 'C#6', 85, '3/2'],
  [2, '1/1', 2, 5, 'G3', 55, '1/2'],
  [2, '3/2', 2, 5, 'A3', 57, '1/2'],
  [2, '2/1', 2, 5, 'B3', 59, '1/1'],
  [2, '5/2', 1, 1, 'D5', 74, '1/2'],
  [2, '5/2', 1, 1, 'B5', 83, '1/2'],
  [3, '0/1', 1, 1, 'E5', 76, '1/1'],
  [3, '0/1', 1, 1, 'C#6', 85, '1/1'],
  [3, '0/1', 2, 5, 'A2', 45, '1/2'],
  [3, '1/2', 2, 5, 'E3', 52, '1/2'],
  [3, '1/1', 1, 1, 'G5', 79, '3/2'],
  [3, '1/1', 1, 1, 'E6', 88, '3/2'],
  [3, '1/1', 2, 5, 'A3', 57, '1/1'],
  [3, '2/1', 2, 5, 'C#4', 61, '1/2'],
  [3, '2/1', 2, 5, 'E4', 64, '1/2'],
  [3, '5/2', 1, 1, 'F#5', 78, '1/2'],
  [3, '5/2', 1, 1, 'D6', 86, '1/2'],
  [3, '5/2', 2, 5, 'B3', 59, '1/2'],
  [3, '5/2', 2, 5, 'D4', 62, '1/2'],
  [4, '0/1', 1, 1, 'E5', 76, '3/1'],
  [4, '0/1', 1, 1, 'C#6', 85, '3/1'],
  [4, '0/1', 2, 5, 'C#4', 61, '1/2'],
  [4, '1/2', 2, 5, 'B3', 59, '1/2'],
  [4, '1/1', 2, 5, 'A3', 57, '1/2'],
  [4, '3/2', 2, 5, 'B3', 59, '1/2'],
  [4, '2/1', 2, 5, 'C#4', 61, '1/2'],
  [4, '5/2', 2, 5, 'A3', 57, '1/2'],
];

const EXPECTED_RUNG_5_IDS = [
  'm1-s1-v1-b0_1-p71', 'm1-s1-v1-b0_1-p74', 'm1-s1-v1-b0_1-p83', 'm1-s2-v5-b0_1-p43',
  'm1-s2-v5-b1_2-p50', 'm1-s2-v5-b1_1-p55', 'm1-s2-v5-b3_2-p59', 'm1-s2-v5-b2_1-p55',
  'm1-s2-v5-b5_2-p50', 'm2-s1-v1-b0_1-p78', 'm2-s1-v1-b0_1-p86', 'm2-s2-v5-b0_1-p43',
  'm2-s2-v5-b1_2-p50', 'm2-s1-v1-b1_1-p76', 'm2-s1-v1-b1_1-p85', 'm2-s2-v5-b1_1-p55',
  'm2-s2-v5-b3_2-p57', 'm2-s2-v5-b2_1-p59', 'm2-s1-v1-b5_2-p74', 'm2-s1-v1-b5_2-p83',
  'm3-s1-v1-b0_1-p76', 'm3-s1-v1-b0_1-p85', 'm3-s2-v5-b0_1-p45', 'm3-s2-v5-b1_2-p52',
  'm3-s1-v1-b1_1-p79', 'm3-s1-v1-b1_1-p88', 'm3-s2-v5-b1_1-p57', 'm3-s2-v5-b2_1-p61',
  'm3-s2-v5-b2_1-p64', 'm3-s1-v1-b5_2-p78', 'm3-s1-v1-b5_2-p86', 'm3-s2-v5-b5_2-p59',
  'm3-s2-v5-b5_2-p62', 'm4-s1-v1-b0_1-p76', 'm4-s1-v1-b0_1-p85', 'm4-s2-v5-b0_1-p61',
  'm4-s2-v5-b1_2-p59', 'm4-s2-v5-b1_1-p57', 'm4-s2-v5-b3_2-p59', 'm4-s2-v5-b2_1-p61',
  'm4-s2-v5-b5_2-p57',
];

test('rung 5 (Yanni, four real bars) produces the exact expected note list', async () => {
  const sheet = await loadSheet(readFixture('fixtures/05-yanni-4-measures.musicxml'));
  const model = M.extract(sheet);
  assert.deepEqual(rowsOf(model), EXPECTED_RUNG_5);
  assert.deepEqual(model.notes.map((n) => n.id), EXPECTED_RUNG_5_IDS);
  assert.deepEqual(model.measures, [
    { number: 1, start: { num: 0, den: 1, beats: 0 }, length: { num: 3, den: 1, beats: 3 }, timeSignature: { beats: 3, beatType: 4 } },
    { number: 2, start: { num: 3, den: 1, beats: 3 }, length: { num: 3, den: 1, beats: 3 }, timeSignature: { beats: 3, beatType: 4 } },
    { number: 3, start: { num: 6, den: 1, beats: 6 }, length: { num: 3, den: 1, beats: 3 }, timeSignature: { beats: 3, beatType: 4 } },
    { number: 4, start: { num: 9, den: 1, beats: 9 }, length: { num: 3, den: 1, beats: 3 }, timeSignature: { beats: 3, beatType: 4 } },
  ]);
  assert.equal(model.notes.length, 41);
  assert.ok(model.notes.every((n) => n.tiedNoteCount === 1));
});

test('rung 5 extracted twice is identical', async () => {
  const content = readFixture('fixtures/05-yanni-4-measures.musicxml');
  const model1 = M.extract(await loadSheet(content));
  const model2 = M.extract(await loadSheet(content));
  assert.deepEqual(model1, model2);
});

test('no untied note extends past its bar', async () => {
  const rungFiles = [
    'fixtures/01-right-hand.musicxml',
    'fixtures/02-left-hand.xml',
    'fixtures/03-both-hands.musicxml',
    'fixtures/04-chords.musicxml',
    'fixtures/05-yanni-4-measures.musicxml',
  ];
  for (const rungFile of rungFiles) {
    const sheet = await loadSheet(readFixture(rungFile));
    const model = M.extract(sheet);
    for (const note of model.notes) {
      const measure = model.measures.find((m) => m.number === note.measure);
      const end = M.addRationals(note.onset, note.duration);
      assert.ok(
        M.compareRationals(end, measure.length) <= 0,
        rungFile + ' note ' + note.id + ' extends past its bar'
      );
    }
  }

  const rung5Sheet = await loadSheet(readFixture('fixtures/05-yanni-4-measures.musicxml'));
  const rung5Model = M.extract(rung5Sheet);
  assert.ok(rung5Model.notes.some((n) => n.onset.num === 5 && n.onset.den === 2));

  const rung1Sheet = await loadSheet(readFixture('fixtures/01-right-hand.musicxml'));
  const rung1Model = M.extract(rung1Sheet);
  assert.ok(rung1Model.notes.some((n) => n.onset.num === 4 && n.onset.den === 1));
});

test('rung 5 .mxl loads through the binary path and matches the .musicxml model', async () => {
  const bytes = fs.readFileSync(path.join(__dirname, '..', 'fixtures', '05-yanni-4-measures.mxl'));
  const file = new File([bytes], '05-yanni-4-measures.mxl');
  const mxlModel = M.extract(await loadSheet(file));
  const xmlModel = M.extract(await loadSheet(readFixture('fixtures/05-yanni-4-measures.musicxml')));
  assert.deepEqual(mxlModel.notes, xmlModel.notes);
  assert.deepEqual(mxlModel.measures, xmlModel.measures);
});

test('rung 1 loaded as a File (the browser handoff) equals rung 1 loaded as text', async () => {
  const bytes = fs.readFileSync(path.join(__dirname, '..', 'fixtures', '01-right-hand.musicxml'));
  const file = new File([bytes], '01-right-hand.musicxml');
  const fileModel = M.extract(await loadSheet(file));
  const textModel = M.extract(await loadSheet(readFixture('fixtures/01-right-hand.musicxml')));
  assert.deepEqual(fileModel, textModel);
});

test('the jsdom shim installs globals with defineProperty and restores the previous descriptors', () => {
  assert.equal(Object.getOwnPropertyDescriptor(globalThis, 'navigator').value, env.dom.window.navigator);
  const nested = installOsmdNodeEnv();
  assert.equal(globalThis.document, nested.dom.window.document);
  nested.restore();
  assert.equal(globalThis.document, env.dom.window.document);
  assert.equal(globalThis.navigator, env.dom.window.navigator);
});
