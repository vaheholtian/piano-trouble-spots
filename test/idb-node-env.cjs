'use strict';
/* Minimal IndexedDB global shim so src/storage.js's `idb.openDB(...)` calls run under
   node:test with no browser. Mirrors test/osmd-node-env.cjs's descriptor-preserving
   Object.defineProperty install/restore shape, applied to `indexedDB`, `IDBKeyRange`, and
   the `idb` global storage.js reads (the UMD build's shape in the browser; the real `idb`
   npm package's named exports here, same `openDB`/`deleteDB`/`wrap`/`unwrap` surface). */
const fakeIndexedDB = require('fake-indexeddb');
const { IDBFactory, IDBKeyRange } = fakeIndexedDB;
const idb = require('idb');

// idb's wrap() does `instanceof IDBRequest`/`IDBCursor`/etc checks, so every IndexedDB
// constructor fake-indexeddb exports must be installed too, not just IDBFactory/IDBKeyRange.
const CONSTRUCTOR_KEYS = [
  'IDBCursor',
  'IDBCursorWithValue',
  'IDBDatabase',
  'IDBIndex',
  'IDBObjectStore',
  'IDBOpenDBRequest',
  'IDBRequest',
  'IDBTransaction',
  'IDBVersionChangeEvent',
];
const GLOBAL_KEYS = ['indexedDB', 'IDBKeyRange', 'idb', ...CONSTRUCTOR_KEYS];

function installIdbNodeEnv() {
  const saved = new Map();
  for (const key of GLOBAL_KEYS) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }

  function defineGlobal(key, value) {
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
      enumerable: true,
    });
  }

  function setGlobals(indexedDBInstance) {
    defineGlobal('indexedDB', indexedDBInstance);
    defineGlobal('IDBKeyRange', IDBKeyRange);
    defineGlobal('idb', idb);
    for (const key of CONSTRUCTOR_KEYS) {
      defineGlobal(key, fakeIndexedDB[key]);
    }
  }

  setGlobals(new IDBFactory());

  function fresh() {
    setGlobals(new IDBFactory());
  }

  function restore() {
    for (const key of GLOBAL_KEYS) {
      const descriptor = saved.get(key);
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        delete globalThis[key];
      }
    }
  }

  return { restore, fresh };
}

module.exports = { installIdbNodeEnv };
