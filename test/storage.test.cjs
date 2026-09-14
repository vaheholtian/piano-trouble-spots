const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { installIdbNodeEnv } = require('./idb-node-env.cjs');

const env = installIdbNodeEnv();
require('../src/storage.js');
const St = globalThis.Storage;

beforeEach(() => env.fresh());
after(() => env.restore());

test('open() creates exactly the six stores with the bySession and byPiece indexes at version 1', async () => {
  const db = await St.open();
  assert.deepEqual([...db.objectStoreNames].sort(), ['clickTimeline', 'passes', 'pieces', 'rawEvents', 'sessions', 'settings']);
  assert.equal(db.version, 1);

  const tx = db.transaction(['sessions', 'passes', 'rawEvents', 'clickTimeline'], 'readonly');
  assert.deepEqual([...tx.objectStore('sessions').indexNames], ['byPiece']);
  assert.deepEqual([...tx.objectStore('passes').indexNames], ['bySession']);
  assert.deepEqual([...tx.objectStore('rawEvents').indexNames], ['bySession']);
  assert.deepEqual([...tx.objectStore('clickTimeline').indexNames], ['bySession']);
  await tx.done;
});

test('raw events read back in seq order regardless of timeStamp order, deep-equal after a JSON round trip', async () => {
  const db = await St.open();
  const inputs = [
    { sessionId: 1, seq: 0, passOrdinal: 1, timeStamp: 100, type: 'noteon', channel: 0, note: 60, velocity: 100, raw: [144, 60, 100], marker: false, source: 'midi' },
    { sessionId: 1, seq: 1, passOrdinal: 1, timeStamp: 500.25, type: 'noteon', channel: 0, note: 64, velocity: 90, raw: [144, 64, 90], marker: false, source: 'midi' },
    { sessionId: 1, seq: 2, passOrdinal: 1, timeStamp: 500.25, type: 'noteon', channel: 0, note: 67, velocity: 80, raw: [144, 67, 80], marker: false, source: 'midi' },
    { sessionId: 1, seq: 3, passOrdinal: 1, timeStamp: 400, type: 'noteoff', channel: 0, note: 60, velocity: 64, raw: [128, 60, 64], marker: false, source: 'midi' },
  ];
  const ids = [];
  for (const record of inputs) {
    ids.push(await St.appendRawEvent(db, record));
  }
  assert.deepEqual(ids, [1, 2, 3, 4]);

  const readBack = await St.readRawEvents(db, 1);
  const expected = inputs.map((input, i) => ({ ...input, id: ids[i] }));
  assert.deepEqual(JSON.parse(JSON.stringify(readBack)), expected);
  assert.deepEqual(readBack.map((r) => r.seq), [0, 1, 2, 3]);

  assert.deepEqual(await St.readRawEvents(db, 9999), []);
});

test('a note-on and a note-off for the same note with the same timeStamp are two records', async () => {
  const db = await St.open();
  await St.appendRawEvent(db, { sessionId: 2, seq: 0, passOrdinal: 1, timeStamp: 300, type: 'noteon', channel: 0, note: 60, velocity: 100, raw: [144, 60, 100], marker: false, source: 'midi' });
  await St.appendRawEvent(db, { sessionId: 2, seq: 1, passOrdinal: 1, timeStamp: 300, type: 'noteoff', channel: 0, note: 60, velocity: 64, raw: [128, 60, 64], marker: false, source: 'midi' });
  const readBack = await St.readRawEvents(db, 2);
  assert.equal(readBack.length, 2);
  assert.notEqual(readBack[0].id, readBack[1].id);
  assert.equal(await St.countRawEvents(db, 2), 2);
});

test('putPiece then getPiece returns byte-identical bytes and a deep-equal model', async () => {
  const db = await St.open();
  const bytes = new TextEncoder().encode('<score-partwise/>').buffer;
  const model = { schemaVersion: 1, title: 'T', measures: [], notes: [] };
  await St.putPiece(db, { id: 'abc123', fileName: 'test.musicxml', bytes, model, storedAt: '2026-01-01T00:00:00.000Z' });
  const piece = await St.getPiece(db, 'abc123');
  assert.ok(Buffer.from(piece.bytes).equals(Buffer.from(bytes)));
  assert.deepEqual(piece.model, model);
});

test('hashBytes is deterministic, 64 lowercase hex chars, and differs for different bytes', async () => {
  const bytesA = new TextEncoder().encode('hello').buffer;
  const bytesB = new TextEncoder().encode('world').buffer;
  const hashA1 = await St.hashBytes(bytesA);
  const hashA2 = await St.hashBytes(bytesA);
  const hashB = await St.hashBytes(bytesB);
  assert.equal(hashA1, hashA2);
  assert.notEqual(hashA1, hashB);
  assert.match(hashA1, /^[0-9a-f]{64}$/);
});

test('settings put then get round-trips; a missing key reads undefined', async () => {
  const db = await St.open();
  await St.putSetting(db, 'lastPieceId', 'piece-1');
  assert.equal(await St.getSetting(db, 'lastPieceId'), 'piece-1');
  assert.equal(await St.getSetting(db, 'never-set'), undefined);
});

test('createSession returns 1 for the first session; listOpenSessions lists it; updateSession closes it; listSessionsForPiece finds it', async () => {
  const db = await St.open();
  const session = {
    pieceId: 'piece-1',
    startedAt: '2026-01-01T00:00:00.000Z',
    startedPerf: 0,
    endedAt: null,
    endedPerf: null,
    endReason: null,
    bpmAtStart: null,
    markerKeys: null,
    clockPairs: [],
    latency: null,
    calibration: null,
  };
  const id = await St.createSession(db, session);
  assert.equal(id, 1);

  const open = await St.listOpenSessions(db);
  assert.equal(open.length, 1);
  assert.equal(open[0].id, 1);

  await St.updateSession(db, id, { endedAt: '2026-01-01T00:05:00.000Z', endReason: 'stop' });
  assert.deepEqual(await St.listOpenSessions(db), []);

  const forPiece = await St.listSessionsForPiece(db, 'piece-1');
  assert.equal(forPiece.length, 1);
  assert.equal(forPiece[0].id, 1);
  assert.equal(forPiece[0].endReason, 'stop');
});

test('three appendClick records read back in order', async () => {
  const db = await St.open();
  await St.appendClick(db, { sessionId: 5, audioTime: 0, pageTime: 0, bar: 1, beat: 1, bpm: 100, isAccent: true });
  await St.appendClick(db, { sessionId: 5, audioTime: 0.6, pageTime: 600, bar: 1, beat: 2, bpm: 100, isAccent: false });
  await St.appendClick(db, { sessionId: 5, audioTime: 1.2, pageTime: 1200, bar: 1, beat: 3, bpm: 100, isAccent: false });
  const clicks = await St.readClicks(db, 5);
  assert.deepEqual(clicks.map((c) => c.beat), [1, 2, 3]);
});

test('two putPass records read back by ordinal', async () => {
  const db = await St.open();
  await St.putPass(db, { sessionId: 6, ordinal: 2, startedAt: 't2', endedAt: null, bpm: 100 });
  await St.putPass(db, { sessionId: 6, ordinal: 1, startedAt: 't1', endedAt: 't1end', bpm: 100 });
  const passes = await St.readPasses(db, 6);
  assert.deepEqual(passes.map((p) => p.ordinal), [1, 2]);
});

test('appendRawEvent surfaces a QuotaExceededError with "Storage is full"; a generic error is rethrown unchanged', async () => {
  const quotaError = new Error('quota');
  quotaError.name = 'QuotaExceededError';
  const quotaDb = { add: async () => { throw quotaError; } };
  await assert.rejects(St.appendRawEvent(quotaDb, {}), /Storage is full/);

  const genericError = new Error('disk error');
  const genericDb = { add: async () => { throw genericError; } };
  await assert.rejects(St.appendRawEvent(genericDb, {}), /^Error: disk error$/);
});
