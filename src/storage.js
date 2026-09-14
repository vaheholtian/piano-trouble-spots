/* IndexedDB persistence via the `idb` UMD global (loaded as a classic script in the browser;
   test/idb-node-env.cjs installs the same global in Node). Classic script so index.html opens
   directly from disk (D-13) and node:test can `require()` it for side effects.

   Six object stores created in DB_VERSION 1 (D-17, one-way): pieces, settings, sessions,
   passes, rawEvents, clickTimeline. A later schema version adds an `if (oldVersion < 2) { ... }`
   block below the version-1 block and never touches it (migration function from day one).

   Every write that can reject (quota, generic IDB errors) is wrapped so the error always
   surfaces to the caller — HIST-01: never swallow a storage error. rethrowStorageError()
   turns a QuotaExceededError into a message naming the problem; any other error is rethrown
   with its own message unchanged.

   Record shapes fixed here (D-17):
   - raw event: { id, sessionId, seq, passOrdinal, timeStamp, type, channel, note, velocity,
     controller, value, raw, marker, source } — decode fields present only when decoded;
     `marker` is false for ordinary messages; `source` is 'midi'.
   - session: { id, pieceId, startedAt, startedPerf, endedAt, endedPerf, endReason, bpmAtStart,
     markerKeys, clockPairs, latency, calibration }.
   - piece: { id, fileName, bytes, model, storedAt } — bytes is an ArrayBuffer, id a
     content-hash.
   - settings keys: 'lastPieceId', 'lastMidiInputId'.
   Pass and click record shapes are written by plans 02 and 03; only their stores are created
   here.
*/
'use strict';
globalThis.Storage = (() => {
  const DB_NAME = 'piano-mistakes';
  const DB_VERSION = 1;
  const STORES = {
    pieces: 'pieces',
    settings: 'settings',
    sessions: 'sessions',
    passes: 'passes',
    rawEvents: 'rawEvents',
    clickTimeline: 'clickTimeline',
  };

  function rethrowStorageError(error) {
    if (error && error.name === 'QuotaExceededError') {
      throw new Error('Storage is full: free disk space or export history before continuing (' + error.message + ')');
    }
    throw error;
  }

  async function open() {
    return globalThis.idb.openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore(STORES.pieces, { keyPath: 'id' });
          db.createObjectStore(STORES.settings, { keyPath: 'key' });
          db.createObjectStore(STORES.sessions, { keyPath: 'id', autoIncrement: true })
            .createIndex('byPiece', 'pieceId');
          db.createObjectStore(STORES.passes, { keyPath: 'id', autoIncrement: true })
            .createIndex('bySession', 'sessionId');
          db.createObjectStore(STORES.rawEvents, { keyPath: 'id', autoIncrement: true })
            .createIndex('bySession', 'sessionId');
          db.createObjectStore(STORES.clickTimeline, { keyPath: 'id', autoIncrement: true })
            .createIndex('bySession', 'sessionId');
        }
        // future: if (oldVersion < 2) { ...add a store or index without touching the block above... }
      },
    });
  }

  async function hashBytes(arrayBuffer) {
    const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function putPiece(db, piece) {
    try {
      return await db.put(STORES.pieces, piece);
    } catch (error) {
      rethrowStorageError(error);
    }
  }

  async function getPiece(db, id) {
    return db.get(STORES.pieces, id);
  }

  async function getSetting(db, key) {
    const record = await db.get(STORES.settings, key);
    return record ? record.value : undefined;
  }

  async function putSetting(db, key, value) {
    try {
      return await db.put(STORES.settings, { key, value });
    } catch (error) {
      rethrowStorageError(error);
    }
  }

  async function createSession(db, session) {
    try {
      return await db.add(STORES.sessions, session);
    } catch (error) {
      rethrowStorageError(error);
    }
  }

  async function updateSession(db, id, patch) {
    try {
      const existing = (await db.get(STORES.sessions, id)) || {};
      const merged = { ...existing, ...patch, id };
      await db.put(STORES.sessions, merged);
      return merged;
    } catch (error) {
      rethrowStorageError(error);
    }
  }

  async function getSession(db, id) {
    return db.get(STORES.sessions, id);
  }

  async function listOpenSessions(db) {
    const all = await db.getAll(STORES.sessions);
    return all.filter((s) => s.endedAt === null);
  }

  async function listSessionsForPiece(db, pieceId) {
    return db.getAllFromIndex(STORES.sessions, 'byPiece', pieceId);
  }

  async function appendRawEvent(db, record) {
    try {
      return await db.add(STORES.rawEvents, record);
    } catch (error) {
      rethrowStorageError(error);
    }
  }

  async function updateRawEvent(db, id, patch) {
    try {
      const existing = (await db.get(STORES.rawEvents, id)) || {};
      const merged = { ...existing, ...patch, id };
      await db.put(STORES.rawEvents, merged);
      return merged;
    } catch (error) {
      rethrowStorageError(error);
    }
  }

  async function readRawEvents(db, sessionId) {
    const records = await db.getAllFromIndex(STORES.rawEvents, 'bySession', sessionId);
    return records.slice().sort((a, b) => a.seq - b.seq);
  }

  async function countRawEvents(db, sessionId) {
    return db.countFromIndex(STORES.rawEvents, 'bySession', sessionId);
  }

  async function appendClick(db, record) {
    try {
      return await db.add(STORES.clickTimeline, record);
    } catch (error) {
      rethrowStorageError(error);
    }
  }

  async function readClicks(db, sessionId) {
    const records = await db.getAllFromIndex(STORES.clickTimeline, 'bySession', sessionId);
    return records.slice().sort((a, b) => a.id - b.id);
  }

  async function putPass(db, pass) {
    try {
      return await db.put(STORES.passes, pass);
    } catch (error) {
      rethrowStorageError(error);
    }
  }

  async function readPasses(db, sessionId) {
    const records = await db.getAllFromIndex(STORES.passes, 'bySession', sessionId);
    return records.slice().sort((a, b) => a.ordinal - b.ordinal);
  }

  return {
    DB_NAME,
    DB_VERSION,
    STORES,
    open,
    hashBytes,
    putPiece,
    getPiece,
    getSetting,
    putSetting,
    createSession,
    updateSession,
    getSession,
    listOpenSessions,
    listSessionsForPiece,
    appendRawEvent,
    updateRawEvent,
    readRawEvents,
    countRawEvents,
    appendClick,
    readClicks,
    putPass,
    readPasses,
    rethrowStorageError,
  };
})();

if (typeof module !== 'undefined') module.exports = globalThis.Storage;
