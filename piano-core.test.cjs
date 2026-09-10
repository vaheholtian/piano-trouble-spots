const {test} = require('node:test');
const assert = require('node:assert/strict');
require('./piano-core.js');
const C = globalThis.PianoCore;
const settings = {startBar: 1, measures: 4, track: 'all', attackTolerance: 80, lengthTolerance: 80};
function song(pitches = [60, 62, 64, 65], spacing = .5) {
  return {name: 'Practice', nBars: Math.ceil(pitches.length / 4), notes: pitches.map((pitch, i) =>
    ({pitch, on: i * spacing, off: i * spacing + .4, bar: Math.floor(i / 4) + 1, beat: i % 4 + 1, track: 0, channel: 0}))};
}
const play = notes => notes.map(n => ({pitch: n.pitch, channel: 0, on: n.on, off: n.off}));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .00001, actual + ' should equal ' + expected);
const take = (s, notes, config = settings) => ({at: '2026-09-10T12:00:00.000Z', settings: config, notes, analysis: C.analyze(s, config, notes)});
const bytes = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
function midi(tracks) {
  const data = Buffer.from([77, 84, 104, 100, 0, 0, 0, 6, 0, tracks.length > 1 ? 1 : 0, 0, tracks.length, 1, 224,
    ...tracks.flatMap(t => [77, 84, 114, 107, ...bytes(t.length), ...t])]);
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}
const ending = [0, 255, 47, 0];
const quarterNote = [0, 144, 60, 80, 131, 96, 128, 60, 0, ...ending];

test('a clean take at the MIDI tempo has zero duration, start, and drift errors', () => {
  const s = song(), a = C.analyze(s, settings, play(s.notes));
  assert.equal(a.observations.length, 4);
  near(a.medianLengthMs, 0); near(a.medianAttackMs, 0); near(a.driftMs, 0);
  assert.equal(a.observations[0].attackMs, null);
});
test('recording offset is removed without altering the reference tempo', () => {
  const s = song(), notes = play(s.notes).map(n => ({...n, on: n.on + 15, off: n.off + 15}));
  const a = C.analyze(s, settings, notes);
  near(a.medianAttackMs, 0); near(a.medianLengthMs, 0);
});
test('short and long holds are measured separately from attack timing', () => {
  const s = song(), notes = play(s.notes); notes[1].off -= .15; notes[2].off += .2;
  const a = C.analyze(s, settings, notes);
  near(a.observations[1].lengthMs, -150); near(a.observations[2].lengthMs, 200);
  near(a.observations[1].attackMs, 0); near(a.observations[2].attackMs, 0);
});
test('a late attack with the right hold length does not produce a false length error', () => {
  const s = song(), notes = play(s.notes); notes[1].on += .15; notes[1].off += .15;
  const a = C.analyze(s, settings, notes);
  near(a.observations[1].attackMs, 150); near(a.observations[1].lengthMs, 0);
});
test('one late key in a chord is assessed individually', () => {
  const s = song([60, 64, 67]); s.notes = s.notes.map(n => ({...n, on: 0, off: .5, beat: 1}));
  const notes = play(s.notes); notes[1].on = .15; notes[1].off = .65; notes.sort((a, b) => a.on - b.on);
  const a = C.analyze(s, settings, notes), late = a.observations.find(o => o.pitch === 64);
  near(late.attackMs, 150); near(late.lengthMs, 0); assert.equal(a.unassessed, 0);
});
test('uniformly slower playing is flagged instead of fitted away', () => {
  const s = song(), notes = play(s.notes).map(n => ({...n, on: n.on * 1.25, off: n.off * 1.25}));
  const a = C.analyze(s, settings, notes);
  near(a.driftMs, 375); near(a.medianLengthMs, 100); assert.ok(a.medianAttackMs > 80);
});
test('rushing produces negative drift against the fixed MIDI timeline', () => {
  const s = song(), notes = play(s.notes).map(n => ({...n, on: n.on * .8, off: n.off * .8}));
  near(C.analyze(s, settings, notes).driftMs, -300);
});
test('an explicit later section cannot be attributed to an earlier identical passage', () => {
  const s = song(Array.from({length: 32}, (_, i) => [60, 62, 64, 65][i % 4]));
  const config = {...settings, startBar: 5};
  const refs = C.sectionNotes(s, config), a = C.analyze(s, config, play(refs));
  assert.equal(refs.length, 16); assert.equal(a.observations[0].bar, 5); assert.equal(a.observations.at(-1).bar, 8);
  assert.equal(a.observations[0].id, 16); near(a.medianLengthMs, 0);
});
test('4 and 8 measure selection is clamped to the end of the file', () => {
  const s = song(Array.from({length: 24}, (_, i) => 60 + i % 5));
  assert.equal(C.sectionNotes(s, settings).length, 16);
  assert.equal(C.sectionNotes(s, {...settings, measures: 8}).length, 24);
  assert.equal(C.sectionNotes(s, {...settings, startBar: 6}).length, 4);
});
test('part selection uses only the chosen track', () => {
  const s = song(); s.notes[1].track = 1;
  const refs = C.sectionNotes(s, {...settings, track: 1});
  assert.equal(refs.length, 1); assert.equal(refs[0].pitch, 62); near(refs[0].on, 0); near(refs[0].off, .4);
});
test('omitting a repeated note does not shift the remaining repeated keys', () => {
  const s = song([60, 60, 60, 60], 1), notes = play(s.notes).filter((_, i) => i !== 1);
  const a = C.analyze(s, settings, notes);
  assert.deepEqual(a.observations.map(o => o.id), [0, 2, 3]);
  assert.equal(a.unassessed, 1); near(a.medianAttackMs, 0);
});
test('a repeated note exactly between two windows is unassessed', () => {
  const s = song([60, 60, 60], 1), notes = play(s.notes); notes[1].on = 1.5; notes[1].off = 1.9;
  const a = C.analyze(s, settings, notes);
  assert.deepEqual(a.observations.map(o => o.id), [0, 2]); assert.equal(a.unusedPlayed, 1);
});
test('multiple attacks in one window are left ambiguous', () => {
  const s = song(), notes = [...play(s.notes), {pitch: 62, channel: 0, on: .65, off: .8}].sort((a, b) => a.on - b.on);
  const a = C.analyze(s, settings, notes);
  assert.equal(a.observations.some(o => o.id === 1), false); assert.equal(a.unassessed, 1);
});
test('wrong pitches do not become duration errors or count as clean samples', () => {
  const s = song(), notes = play(s.notes); notes[1].pitch = 80;
  const a = C.analyze(s, settings, notes);
  assert.equal(a.unassessed, 1); assert.equal(a.unusedPlayed, 1); near(a.medianLengthMs, 0);
});
test('an unrelated opening is rejected instead of searching the song', () => {
  const s = song(), notes = play(s.notes); notes[0].pitch = 80;
  assert.throws(() => C.analyze(s, settings, notes), /first note or chord/);
});
test('a missing key release stays unassessed rather than receiving a fabricated length', () => {
  const s = song(), notes = play(s.notes); notes[2].off = null;
  const a = C.analyze(s, settings, notes), o = a.observations[2];
  assert.equal(o.lengthMs, null); assert.equal(o.actualLength, null); near(o.attackMs, 0); assert.equal(a.unfinished, 1);
});
test('partial takes do not dilute an issue in notes that were not attempted', () => {
  const s = song(), full = play(s.notes); full[3].off -= .2;
  const takes = [take(s, full), ...Array.from({length: 9}, () => take(s, play(s.notes.slice(0, 2))))];
  const sample = C.aggregate(takes).find(o => o.id === 3 && o.metric === 'length');
  assert.equal(sample.attempts, 1); assert.equal(sample.issues, 1);
});
test('duration and attack each have their own opportunity count', () => {
  const s = song(), notes = play(s.notes); notes[1].off = null;
  const samples = C.aggregate([take(s, notes)]);
  assert.equal(samples.some(o => o.id === 1 && o.metric === 'length'), false);
  assert.equal(samples.find(o => o.id === 1 && o.metric === 'attack').attempts, 1);
  assert.equal(samples.some(o => o.id === 0 && o.metric === 'attack'), false);
});
test('a value exactly on the tolerance is not flagged by floating point noise', () => {
  const s = song(), notes = play(s.notes); notes[1].off += .08;
  assert.equal(C.aggregate([take(s, notes)]).find(o => o.id === 1 && o.metric === 'length').issues, 0);
});
test('ordinary MIDI and MIDI with SysEx have identical timing', () => {
  const a = C.parseMidi(midi([quarterNote]));
  const b = C.parseMidi(midi([[0, 240, 3, 126, 0, 247, ...quarterNote]]));
  assert.deepEqual(a, b); near(a.notes[0].off, .5); assert.equal(a.notes[0].bar, 1);
});
test('MIDI tempo changes affect note starts and lengths', () => {
  const events = [0, 144, 60, 80, 131, 96, 255, 81, 3, 15, 66, 64,
    131, 96, 128, 60, 0, 0, 144, 62, 80, 131, 96, 128, 62, 0, ...ending];
  const parsed = C.parseMidi(midi([events]));
  near(parsed.notes[0].off, 1.5); near(parsed.notes[1].on, 1.5); near(parsed.notes[1].off, 2.5);
});
test('note releases on different MIDI channels are kept separate', () => {
  const events = [0, 144, 60, 80, 129, 112, 145, 60, 80, 129, 112, 129, 60, 0,
    129, 112, 128, 60, 0, ...ending];
  const parsed = C.parseMidi(midi([events]));
  near(parsed.notes[0].on, 0); near(parsed.notes[0].off, .75);
  near(parsed.notes[1].on, .25); near(parsed.notes[1].off, .5);
});
test('MIDI running status and velocity-zero releases are parsed', () => {
  const parsed = C.parseMidi(midi([[0, 144, 60, 80, 131, 96, 60, 0, ...ending]]));
  near(parsed.notes[0].off, .5);
});
test('MIDI meter changes set the correct measure and beat', () => {
  const events = [0, 255, 88, 4, 3, 2, 24, 8, 0, 144, 60, 80,
    139, 32, 128, 60, 0, 0, 255, 88, 4, 4, 2, 24, 8,
    0, 144, 62, 80, 131, 96, 128, 62, 0, ...ending];
  const parsed = C.parseMidi(midi([events]));
  assert.equal(parsed.notes[1].bar, 2); assert.equal(parsed.notes[1].beat, 1);
});
test('reference notes with no release are rejected for duration practice', () => {
  assert.throws(() => C.parseMidi(midi([[0, 144, 60, 80, ...ending]])), /no key release/);
});
test('truncated MIDI is rejected', () => {
  assert.throws(() => C.parseMidi(midi([quarterNote]).slice(0, -3)), /Truncated/);
});
test('session round trip preserves raw releases and recomputes analysis', () => {
  const s = song(), notes = play(s.notes); notes[2].off = null;
  const t = take(s, notes); t.analysis = {untrusted: 'should never be rendered'};
  const restored = C.readSession(JSON.stringify({version: 2, song: s, settings, takes: [t]}));
  assert.equal(restored.takes[0].notes[2].off, null);
  assert.equal(restored.takes[0].analysis.unfinished, 1);
  assert.equal(restored.takes[0].analysis.untrusted, undefined);
});
test('malformed and earlier session formats are rejected before application state changes', () => {
  assert.throws(() => C.readSession(JSON.stringify({song: song(), takes: []})), /earlier pitch tracker/);
  assert.throws(() => C.readSession(JSON.stringify({version: 2, song: song(), settings, takes: [{}]})), /Invalid recorded take/);
  assert.throws(() => C.readSession(JSON.stringify({version: 2, song: song(), settings: {...settings, startBar: 0}, takes: []})), /Invalid practice settings/);
});
