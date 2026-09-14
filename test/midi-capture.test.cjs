const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../src/midi-capture.js');
const M = globalThis.MidiCapture;

test('decode note-on with velocity', () => {
  const record = M.decode({ data: [0x90, 60, 100], timeStamp: 1234.5678 });
  assert.deepEqual(record, { type: 'noteon', channel: 0, note: 60, velocity: 100, timeStamp: 1234.5678, raw: [144, 60, 100] });
});

test('decode note-on with velocity 0 is a noteoff', () => {
  const record = M.decode({ data: [0x90, 60, 0], timeStamp: 10 });
  assert.deepEqual(record, { type: 'noteoff', channel: 0, note: 60, velocity: 0, timeStamp: 10, raw: [144, 60, 0] });
});

test('decode explicit note-off (0x8n)', () => {
  const record = M.decode({ data: [0x80, 60, 64], timeStamp: 20 });
  assert.deepEqual(record, { type: 'noteoff', channel: 0, note: 60, velocity: 64, timeStamp: 20, raw: [128, 60, 64] });
});

test('decode control change (CC64 sustain, stored like any other controller)', () => {
  const record = M.decode({ data: [0xb0, 64, 127], timeStamp: 30 });
  assert.deepEqual(record, { type: 'control', channel: 0, controller: 64, value: 127, timeStamp: 30, raw: [176, 64, 127] });
});

test('decode a different control change number', () => {
  const record = M.decode({ data: [0xb0, 7, 100], timeStamp: 40 });
  assert.deepEqual(record, { type: 'control', channel: 0, controller: 7, value: 100, timeStamp: 40, raw: [176, 7, 100] });
});

test('decode a 2-byte program change as other, never throws', () => {
  const record = M.decode({ data: [0xc0, 5], timeStamp: 50 });
  assert.deepEqual(record, { type: 'other', channel: 0, timeStamp: 50, raw: [192, 5] });
});

test('decode a 1-byte real-time message as other with null channel, never throws', () => {
  const record = M.decode({ data: [0xf8], timeStamp: 60 });
  assert.deepEqual(record, { type: 'other', channel: null, timeStamp: 60, raw: [248] });
});

test('decode an empty data array as other, never throws', () => {
  const record = M.decode({ data: [], timeStamp: 70 });
  assert.deepEqual(record, { type: 'other', channel: null, timeStamp: 70, raw: [] });
});

test('decode never filters channel 10 (percussion) — kept as an ordinary channel 9 record', () => {
  const record = M.decode({ data: [0x99, 36, 100], timeStamp: 80 });
  assert.deepEqual(record, { type: 'noteon', channel: 9, note: 36, velocity: 100, timeStamp: 80, raw: [153, 36, 100] });
});

test('a Uint8Array data payload yields a plain Array raw, and the record round-trips through JSON', () => {
  const record = M.decode({ data: new Uint8Array([0x90, 60, 100]), timeStamp: 90 });
  assert.ok(Array.isArray(record.raw));
  assert.deepEqual(record.raw, [144, 60, 100]);
  assert.deepEqual(JSON.parse(JSON.stringify(record)), record);
});

test('noteName pins: 21 A0, 60 C4, 61 C#4, 107 B7, 108 C8', () => {
  assert.equal(M.noteName(21), 'A0');
  assert.equal(M.noteName(60), 'C4');
  assert.equal(M.noteName(61), 'C#4');
  assert.equal(M.noteName(107), 'B7');
  assert.equal(M.noteName(108), 'C8');
});
