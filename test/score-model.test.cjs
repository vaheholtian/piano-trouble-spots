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

test('the jsdom shim installs globals with defineProperty and restores the previous descriptors', () => {
  assert.equal(Object.getOwnPropertyDescriptor(globalThis, 'navigator').value, env.dom.window.navigator);
  const nested = installOsmdNodeEnv();
  assert.equal(globalThis.document, nested.dom.window.document);
  nested.restore();
  assert.equal(globalThis.document, env.dom.window.document);
  assert.equal(globalThis.navigator, env.dom.window.navigator);
});
