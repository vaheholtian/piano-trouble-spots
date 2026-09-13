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

const EXPECTED_TIE = [
  [1, '0/1', 1, 1, 'C4', 60, '4/1'],
  [2, '0/1', 1, 1, 'E4', 64, '2/1'],
  [2, '2/1', 1, 1, 'G4', 67, '6/1'],
  [4, '0/1', 1, 1, 'A4', 69, '8/1'],
];

test('a tied pair collapses to one note with the combined duration, within a bar and across a barline', async () => {
  const sheet = await loadSheet(readFixture('test/fixtures/tie.musicxml'));
  const model = M.extract(sheet);
  assert.deepEqual(rowsOf(model), EXPECTED_TIE);
  assert.deepEqual(model.notes.map((n) => n.tiedNoteCount), [2, 1, 2, 3]);
  assert.equal(model.notes.length, 4);
  const writtenNoteheads = (readFixture('test/fixtures/tie.musicxml').match(/<pitch>/g) || []).length;
  assert.equal(writtenNoteheads, 8);
  assert.deepEqual(model.notes.map((n) => n.id), [
    'm1-s1-v1-b0_1-p60',
    'm2-s1-v1-b0_1-p64',
    'm2-s1-v1-b2_1-p67',
    'm4-s1-v1-b0_1-p69',
  ]);
  assert.deepEqual(model.measures, [
    { number: 1, start: { num: 0, den: 1, beats: 0 }, length: { num: 4, den: 1, beats: 4 }, timeSignature: { beats: 4, beatType: 4 } },
    { number: 2, start: { num: 4, den: 1, beats: 4 }, length: { num: 4, den: 1, beats: 4 }, timeSignature: { beats: 4, beatType: 4 } },
    { number: 3, start: { num: 8, den: 1, beats: 8 }, length: { num: 4, den: 1, beats: 4 }, timeSignature: { beats: 4, beatType: 4 } },
    { number: 4, start: { num: 12, den: 1, beats: 12 }, length: { num: 4, den: 1, beats: 4 }, timeSignature: { beats: 4, beatType: 4 } },
    { number: 5, start: { num: 16, den: 1, beats: 16 }, length: { num: 4, den: 1, beats: 4 }, timeSignature: { beats: 4, beatType: 4 } },
  ]);
});

test('a three-segment tie chain folds into one onset with the total duration', async () => {
  const sheet = await loadSheet(readFixture('test/fixtures/tie.musicxml'));
  const model = M.extract(sheet);
  const a4 = model.notes.find((n) => n.pitch.name === 'A4');
  assert.deepEqual(a4.onset, { num: 0, den: 1, beats: 0 });
  assert.deepEqual(a4.duration, { num: 8, den: 1, beats: 8 });
  assert.equal(a4.tiedNoteCount, 3); // three-segment chain: tiedNoteCount: 3
  assert.equal(model.notes.filter((n) => n.measure === 5).length, 0);
  assert.equal(model.notes.filter((n) => n.measure === 4).length, 1);
});

test('toQuarterBeats is exact for every note value in the ladder', () => {
  const OSMD = require('opensheetmusicdisplay/build/opensheetmusicdisplay.min.js');
  const { Fraction } = OSMD;
  assert.deepEqual(M.toQuarterBeats(new Fraction(0, 1, 1)), { num: 4, den: 1, beats: 4 }); // whole
  assert.deepEqual(M.toQuarterBeats(new Fraction(1, 2)), { num: 2, den: 1, beats: 2 }); // half
  assert.deepEqual(M.toQuarterBeats(new Fraction(1, 4)), { num: 1, den: 1, beats: 1 }); // quarter
  assert.deepEqual(M.toQuarterBeats(new Fraction(1, 8)), { num: 1, den: 2, beats: 0.5 }); // eighth
  assert.deepEqual(M.toQuarterBeats(new Fraction(3, 8)), { num: 3, den: 2, beats: 1.5 }); // dotted quarter
  assert.deepEqual(M.toQuarterBeats(new Fraction(3, 16)), { num: 3, den: 4, beats: 0.75 }); // dotted eighth
  assert.deepEqual(M.toQuarterBeats(new Fraction(12, 8)), { num: 6, den: 1, beats: 6 }); // unreduced whole-note fraction
  assert.deepEqual(M.addRationals({ num: 1, den: 2, beats: 0.5 }, { num: 1, den: 3, beats: 0.333 }), { num: 5, den: 6, beats: 5 / 6 });
  assert.equal(M.compareRationals({ num: 1, den: 2 }, { num: 2, den: 4 }), 0);
  assert.ok(M.compareRationals({ num: 5, den: 2 }, { num: 3, den: 1 }) < 0);
});

test('a rest-only file yields no notes but still lists its measure', async () => {
  const restOnlyXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><rest measure="yes"/><duration>8</duration><voice>1</voice><staff>1</staff></note>
      <backup><duration>8</duration></backup>
      <note><rest measure="yes"/><duration>8</duration><voice>5</voice><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;
  const sheet = await loadSheet(restOnlyXml);
  const model = M.extract(sheet);
  assert.deepEqual(model.notes, []);
  assert.equal(model.measures.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(model)), model);
});

test('a chord that repeats a pitch is rejected, not silently merged', async () => {
  const dupXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>
      <note><chord/><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>6</duration><voice>1</voice></note>
    </measure>
  </part>
</score-partwise>`;
  const sheet = await loadSheet(dupXml);
  assert.throws(() => M.extract(sheet), /Duplicate note id m1-s1-v1-b0_1-p60/);
});

test('extract has no DOM dependency', async () => {
  const sheet = await loadSheet(readFixture('fixtures/01-right-hand.musicxml'));
  const keys = ['document', 'window', 'navigator'];
  const saved = new Map();
  for (const key of keys) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  try {
    for (const key of keys) {
      delete globalThis[key];
    }
    const model = M.extract(sheet);
    assert.equal(model.notes.length, 5);
  } finally {
    for (const key of keys) {
      const descriptor = saved.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    }
  }
});

test('TieTypes is never consulted', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'score-model.js'), 'utf8');
  assert.equal(source.includes('TieTypes'), false);
});

test('the jsdom shim installs globals with defineProperty and restores the previous descriptors', () => {
  assert.equal(Object.getOwnPropertyDescriptor(globalThis, 'navigator').value, env.dom.window.navigator);
  const nested = installOsmdNodeEnv();
  assert.equal(globalThis.document, nested.dom.window.document);
  nested.restore();
  assert.equal(globalThis.document, env.dom.window.document);
  assert.equal(globalThis.navigator, env.dom.window.navigator);
});
