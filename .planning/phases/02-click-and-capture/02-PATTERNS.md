# Phase 2: Click and Capture - Pattern Map

**Mapped:** 2026-09-13
**Files analyzed:** 9 (7 new src files + index.html + check-run-path.cjs modifications; plus new tests)
**Analogs found:** 9 / 9 (all role-match or exact within this codebase; RESEARCH.md already supplies concrete Phase-2-shaped code examples used as primary excerpts where no closer local analog exists)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/clock.js` | utility (pure) | transform | `src/score-model.js` | exact (pure IIFE global, `node:test`-able, no DOM) |
| `src/pass-marker.js` | utility (pure) | event-driven/transform | `src/score-model.js` (pure fn style) + `prototype/piano-app.js` (marker/key detection idea, reference only) | role-match |
| `src/pass-segmenter.js` | utility (pure) | transform/batch | `src/score-model.js` (`extract`/`walkNotes` pure transform) | role-match |
| `src/metronome.js` | service (side-effecting, Web Audio) | streaming/event-driven | none in-repo; RESEARCH.md Pattern 1 code example is the analog (no local AudioContext code exists yet) | no local analog — use RESEARCH.md example |
| `src/midi-capture.js` | service (side-effecting, Web MIDI) | event-driven | `prototype/piano-app.js` `onMidi` (reference only, per canonical_refs — do not reuse verbatim) | partial (reference-only per D-04/canonical_refs) |
| `src/storage.js` | service (IndexedDB via `idb` UMD) | CRUD | none in-repo (Phase 1 has no persistence layer); RESEARCH.md Pattern 5 code example is the analog | no local analog — use RESEARCH.md example |
| `src/capture-app.js` | controller/UI (DOM owner) | request-response + event-driven | `src/score-renderer.js` (the `S` state object, `loadPiece(file)`, `toast`/`setStatus` helpers, `$` selector) | exact |
| `index.html` (modified) | config | — | itself, Phase 1 version | exact — extend existing script-tag list |
| `scripts/check-run-path.cjs` (modified) | test/config (static gate) | — | itself, Phase 1 version | exact — extend `EXPECTED_LOCAL_SCRIPTS` |
| `test/clock.test.cjs`, `test/pass-marker.test.cjs`, `test/pass-segmenter.test.cjs` | test | transform | `test/score-model.test.cjs` | exact |
| `test/storage.test.cjs` | test | CRUD | `test/score-model.test.cjs` (node:test structure) + RESEARCH.md `fake-indexeddb` recommendation (no local IndexedDB test exists) | role-match |
| `scripts/check-midi-storage.cjs` (new, likely) | test (CDP headless gate) | event-driven | `scripts/check-svg-map.cjs` | exact |

## Pattern Assignments

### `src/clock.js` (utility, pure/transform)

**Analog:** `src/score-model.js`

**Module shell pattern** (score-model.js lines 45-46, 205-218):
```javascript
'use strict';
globalThis.ScoreModel = (() => {
  const SCHEMA_VERSION = 1;
  // ... pure functions ...
  return { SCHEMA_VERSION, extract, walkNotes, toQuarterBeats, /* ... */ };
})();
```
Copy this exact shape for `Clock`: top `'use strict'`, `globalThis.Clock = (() => { ... return {...}; })()`, and — since `clock.js` must be `require()`-able by `node:test` with zero DOM (per code_context) — add the CommonJS export line RESEARCH.md's own Pattern 2 example already shows:
```javascript
if (typeof module !== 'undefined') module.exports = globalThis.Clock;
```
Note `score-model.js` itself does NOT have this export line and is instead loaded via `require('../src/score-model.js')` + `globalThis.ScoreModel` in tests (see Testing pattern below) — either style is acceptable, but RESEARCH.md's clock.js example already includes the module.exports line, so follow that exact file since it's the concrete Phase 2 code the researcher wrote.

**Core pure-transform pattern** (score-model.js lines 65-86, gcd/rational/compareRationals): small, single-purpose pure functions taking/returning plain numbers or plain objects, no exceptions thrown except real invariant violations — mirror this for `samplePair`/`toAudioContextTime`/`offsetMs`.

**Doc-comment convention** (score-model.js lines 1-44): a top-of-file `/* ... */` block with `@typedef` JSDoc entries for every persisted/exchanged shape, plus a one-line note on why the file is a classic script. Apply the same header to `clock.js`, documenting the `{performanceNowAtSample, audioContextTimeAtSample}` pair shape.

---

### `src/pass-marker.js` (utility, pure, event-driven)

**Analog:** `src/score-model.js` (pure-function style) + `prototype/piano-app.js` lines 152-153 (reference only, per canonical_refs — do not reuse verbatim, note-on/velocity-0 decode idea only)

**Prototype reference — velocity-0-as-note-off decode** (`prototype/piano-app.js` lines 152-153):
```javascript
const [status, pitch, velocity] = event.data, kind = status >> 4, channel = status & 15;
const isOn = kind === 9 && velocity > 0, isOff = kind === 8 || (kind === 9 && velocity === 0);
```
This is the exact bit-shift decode `src/midi-capture.js` should reproduce (not `pass-marker.js`) — flagged here because it's the single most load-bearing prototype excerpt for the whole phase.

**Core pattern to copy:** RESEARCH.md Pattern 4's `findMarkers` function is the concrete Phase 2 shape (pending-map over `{note, timeStamp}` events, ~100ms window, B7+C8 pairing) — use it verbatim as the starting point; it already follows `score-model.js`'s "plain data in, plain data out, IIFE-wrapped global" convention.

**Module shell:** identical `globalThis.PassMarker = (() => {...})()` IIFE shape as `clock.js`/`score-model.js`.

---

### `src/pass-segmenter.js` (utility, pure, transform/batch)

**Analog:** `src/score-model.js`'s `walkNotes`/`extract` — a single structural walk over an ordered array producing derived plain-data records (measures/notes there; passes here).

**Pattern to copy:** `extract()` (score-model.js lines 138-203) shows the shape — walk once, accumulate into an array, sort/validate, return `{schemaVersion, ...}`. Segmenter should walk the raw event array once using `PassMarker.findMarkers()` output as split points (D-03, D-04, D-07: first pass opens at session start, one mark ends current/starts next, trailing pass kept if non-empty, marker events themselves excluded from `notes` per pass but present in the pass's raw slice for audit).

---

### `src/metronome.js` (service, Web Audio, streaming/event-driven)

**Analog:** none in-repo (Phase 1 has no audio code). Use RESEARCH.md's own Pattern 1 code example verbatim as the base — it already conforms to this repo's IIFE/classic-script convention (confirmed by the researcher against `score-model.js`'s shape):

```javascript
'use strict';
globalThis.Metronome = (() => {
  const LOOKAHEAD_MS = 25;
  const SCHEDULE_AHEAD_S = 0.1;
  function create(audioContext, { timeSignatureFor, onClick }) {
    let nextClickTime = 0, bpm = 0, barNumber = 1, beatInBar = 1, timer = null;
    function secondsPerBeat() { return 60 / bpm; }
    function scheduleClick(time, isAccent) { /* oscillator + gain envelope; onClick({audioTime, bar, beat, bpm, isAccent}) */ }
    function tick() { /* while nextClickTime < audioContext.currentTime + SCHEDULE_AHEAD_S: scheduleClick, advance beat/bar using timeSignatureFor(barNumber) */ }
    return { start(startBpm) { /* setInterval(tick, LOOKAHEAD_MS) */ }, setBpm(newBpm) { bpm = newBpm; }, stop() { clearInterval(timer); } };
  }
  return { create };
})();
```
Full example: 02-RESEARCH.md lines 272-323 ("Pattern 1: Look-Ahead Metronome Scheduler"). `timeSignatureFor(barNumber)` should be backed by `S.model.measures[...].timeSignature` (from `ScoreModel.extract`, already available per code_context Reusable Assets — no model change needed).

**Error handling:** none shown in the example; per D-06/D-17, `onClick` callback must feed straight into `Storage`'s click-timeline write path (never buffered only in memory) so a crash doesn't lose scheduled clicks already sounded.

---

### `src/midi-capture.js` (service, Web MIDI, event-driven)

**Analog:** `prototype/piano-app.js` `onMidi` (lines 148-165) — reference only, not reused verbatim (canonical_refs explicitly says "reference only, not reused"). RESEARCH.md Pattern 3 gives the concrete Phase-2-shaped rewrite:

```javascript
'use strict';
globalThis.MidiCapture = (() => {
  function decode(event) {
    const data = Array.from(event.data); // plain array — IndexedDB/JSON-safe
    const [status, d1, d2] = data;
    const kind = status >> 4, channel = status & 15;
    if (kind === 9 && d2 > 0) return { type: 'noteon', channel, note: d1, velocity: d2, timeStamp: event.timeStamp, raw: data };
    if (kind === 8 || (kind === 9 && d2 === 0)) return { type: 'noteoff', channel, note: d1, velocity: d2, timeStamp: event.timeStamp, raw: data };
    if (kind === 11 && d1 === 64) return { type: 'sustain', channel, value: d2, timeStamp: event.timeStamp, raw: data }; // CC64, D-02
    return { type: 'other', channel, timeStamp: event.timeStamp, raw: data };
  }
  async function connect({ onEvent, onStateChange }) {
    const access = await navigator.requestMIDIAccess();
    for (const input of access.inputs.values()) input.onmidimessage = (event) => onEvent(decode(event));
    access.onstatechange = onStateChange;
    return access;
  }
  return { decode, connect };
})();
```
Full example: 02-RESEARCH.md lines 372-398. `decode()` is the pure/testable half (analogous to `score-model.js`'s pure functions — test the same way as `test/score-model.test.cjs`); `connect()` is the thin side-effecting wrapper, analogous to `score-renderer.js`'s `loadPiece`/`openFile` split between async I/O and pure extraction.

**Key deviation from prototype:** prototype's `onMidi` ignores channel 9 (percussion) and validates message shape defensively before decoding — Phase 2's D-04 requires keeping everything, so do NOT port the prototype's early-return validation/ignore-percussion logic; every message must be decoded and stored (only `type: 'other'` catches anything not note/CC64).

---

### `src/storage.js` (service, IndexedDB/idb, CRUD)

**Analog:** none in-repo. RESEARCH.md Pattern 5 is the concrete base:

```javascript
'use strict';
globalThis.Storage = (() => {
  const DB_NAME = 'piano-mistakes', DB_VERSION = 1;
  async function open() {
    return idb.openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('pieces', { keyPath: 'id' });
          db.createObjectStore('settings', { keyPath: 'key' });
          db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
          db.createObjectStore('passes', { keyPath: 'id', autoIncrement: true }).createIndex('bySession', 'sessionId');
          db.createObjectStore('rawEvents', { keyPath: 'id', autoIncrement: true }).createIndex('bySession', 'sessionId');
          db.createObjectStore('clickTimeline', { keyPath: 'id', autoIncrement: true }).createIndex('bySession', 'sessionId');
        }
      },
    });
  }
  async function appendRawEvents(db, sessionId, passOrdinal, events) {
    const tx = db.transaction('rawEvents', 'readwrite');
    try {
      await Promise.all([...events.map((e) => tx.store.add({ sessionId, passOrdinal, ...e })), tx.done]);
    } catch (error) {
      if (error && error.name === 'QuotaExceededError') {
        throw new Error('Storage is full — free up space or export history before continuing.');
      }
      throw error;
    }
  }
  return { open, appendRawEvents };
})();
```
Full example: 02-RESEARCH.md lines 443-486.

**Error handling pattern:** matches `score-renderer.js`'s `loadPiece` try/catch/finally shape (lines 34-63) — surface errors via the same `toast(message)` helper `capture-app.js` should reuse, never swallow (D-17 quota errors must reach the user, mirroring how `loadPiece` calls `toast('Could not open ' + ...)` on failure).

**Loading convention:** `idb` UMD global loaded via classic `<script>` tag exactly like OSMD's tag in `index.html` (lines 15-17) — same pinned-version + `integrity` + `crossorigin` pattern:
```html
<script src="https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@2.1.2/build/opensheetmusicdisplay.min.js"
        integrity="sha384-12lItsNRZQLTAONzjzkiAB2oOKC7L9JPNqWBHro/ug0hLJZTmGxbr0V2JRt8KwC2"
        crossorigin="anonymous"></script>
```
Add an equivalent tag for `idb@8.0.3` UMD (hash given in RESEARCH.md lines 138-141) directly above/below this one.

---

### `src/capture-app.js` (controller/UI, DOM owner)

**Analog:** `src/score-renderer.js`

**State-object pattern** (score-renderer.js lines 5-19):
```javascript
'use strict';
const OSMD = globalThis.opensheetmusicdisplay;
const $ = (id) => document.getElementById(id);
const S = {
  osmd: null, model: null, sourceNotes: null, svgMap: null, svgRefs: null,
  problems: [], renderCount: 0, loading: false, fileName: '',
};
```
`capture-app.js` should declare its own `S`-shaped state object (session id, current pass ordinal, MIDI access/input, metronome instance, running median array, etc.) using the same flat plain-object convention and the same `$` id-lookup helper (redeclare or share — Phase 1 declares `$` locally in `score-renderer.js`; `capture-app.js` loading after it can reuse the same `const $` pattern in its own file since there's no shared module system).

**toast/status helper pattern** (score-renderer.js lines 21-32):
```javascript
function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { $('toast').hidden = true; }, 6500);
}
function setStatus(text) { $('status').textContent = text; }
```
Reuse verbatim (or call the existing global functions directly, since `score-renderer.js` loads first) for MIDI connection-state text (D-19) and error surfacing (quota errors from `storage.js`, MIDI permission denial).

**Async load + try/catch/finally pattern** (score-renderer.js lines 34-63, `loadPiece`): copy this exact shape for `startSession()`/`connectMidi()` — set a loading flag, attempt the async operation, reset relevant state and toast on failure, always clear the loading flag in `finally`.

**Restore-on-reopen integration point** (score-renderer.js line 34, `loadPiece(file)` accepts a Blob): on app load, `capture-app.js` reads stored file bytes from `Storage`, wraps them in a `Blob`, and calls the existing `loadPiece(blob)` — no changes needed to `score-renderer.js` itself (per code_context Reusable Assets and Integration Points).

---

### `index.html` (modified, config)

**Analog:** itself (Phase 1 version), lines 15-17 (CDN script tag pattern) and lines 44-47 (local script tag order).

**Pattern:** append the new `idb` CDN tag beside the OSMD tag (same pinned-version + `integrity` + `crossorigin` shape), then append new local `<script src="src/....js">` tags after the existing three, in dependency order matching `src/` listing above: `clock.js`, `pass-marker.js`, `pass-segmenter.js` (pure, no deps) → `metronome.js`, `midi-capture.js`, `storage.js` (side-effecting) → `capture-app.js` (wires everything, loads last). New DOM elements (BPM input, Start/Stop buttons, MIDI input `<select>`, live readout `<details>`, pass list) should follow the existing `<details id="inspect">`/`<table>` structural convention (lines 33-49) — plain semantic HTML, `id`-addressed, no framework.

---

### `scripts/check-run-path.cjs` (modified, test/config gate)

**Analog:** itself (Phase 1 version).

**Pattern to extend** (lines 32, 84-85):
```javascript
const EXPECTED_LOCAL_SCRIPTS = ['src/score-model.js', 'src/inspect-table.js', 'src/score-renderer.js'];
// ...
checkIndexHtml();
for (const file of EXPECTED_LOCAL_SCRIPTS) checkSourceFile(file);
```
Extend the array to the full ordered list of 7 new files (see index.html pattern above) — this is a hard integration point: the gate fails red (`'local script tags in dependency order'`) until both `index.html`'s script tags and this array are updated together, per RESEARCH.md's explicit warning (lines 263).

**Reusable sub-checks unchanged:** `checkSourceFile()` (no-ES-module-syntax, `node --check` syntax validity) applies unmodified to every new `src/*.js` file — no changes needed to that function itself, only to the array it iterates.

---

### Tests: `test/clock.test.cjs`, `test/pass-marker.test.cjs`, `test/pass-segmenter.test.cjs`

**Analog:** `test/score-model.test.cjs`

**Pattern** (lines 1-11):
```javascript
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
require('../src/score-model.js');
const M = globalThis.ScoreModel;

test('description', async () => {
  const result = M.someFunction(input);
  assert.deepEqual(result, expected);
});
```
For `clock.js`/`pass-marker.js`/`pass-segmenter.js`: no `installOsmdNodeEnv()` / `loadSheet()` needed (those are OSMD-jsdom-specific, per `test/osmd-node-env.cjs` — code_context explicitly says the new pure modules "should be tested the same way with no DOM," i.e., skip that harness entirely and `require()` the file directly like `score-model.js`'s own test does for its pure functions). Include a `JSON.parse(JSON.stringify(x))` round-trip test for any stored shape, mirroring score-model.test.cjs's "the model is plain JSON data" test (lines 27-31).

---

### `test/storage.test.cjs`

**Analog:** `test/score-model.test.cjs` structure + RESEARCH.md's `fake-indexeddb` recommendation (no local IndexedDB test exists yet).

**Pattern:** same `node:test`/`assert/strict` shell as above, but install `fake-indexeddb`'s global `indexedDB`/`IDBKeyRange` before `require('../src/storage.js')`, then exercise `Storage.open()`, write/read round-trips per object store, and a simulated quota-exceeded rejection to confirm the surfaced-error message (never-swallowed, D-17). Add `fake-indexeddb` as a devDependency per RESEARCH.md's `npm install -D fake-indexeddb`.

---

### `scripts/check-midi-storage.cjs` (new headless CDP gate, likely)

**Analog:** `scripts/check-svg-map.cjs`

Read this file if a headless MIDI/storage round-trip check is planned — reuse its raw DevTools-Protocol connection/navigation boilerplate and extend with `Page.addScriptToEvaluateOnNewDocument` to install a fake `navigator.requestMIDIAccess`/`MIDIInput` before app scripts run (per RESEARCH.md's "Don't Hand-Roll" table — explicitly prefer this over adding Playwright as a new devDependency).

---

## Shared Patterns

### Classic-script IIFE global convention
**Source:** `src/score-model.js` lines 45-46, 205-218
**Apply to:** `clock.js`, `pass-marker.js`, `pass-segmenter.js`, `metronome.js`, `midi-capture.js`, `storage.js`
```javascript
'use strict';
globalThis.SomeName = (() => {
  // private helpers
  return { publicFn1, publicFn2 };
})();
```
No ES module syntax anywhere (`check-run-path.cjs`'s `checkSourceFile` hard-fails on `import`/`export` lines at start-of-line).

### State object + `$` DOM helper + toast/status
**Source:** `src/score-renderer.js` lines 5-32
**Apply to:** `capture-app.js`

### Async operation try/catch/finally with loading flag and toast-on-error
**Source:** `src/score-renderer.js` `loadPiece` lines 34-63
**Apply to:** `capture-app.js` (`startSession`, `connectMidi`), `storage.js` (`appendRawEvents` quota handling — never swallow, per D-17)

### Pure, `node:test`-able transform functions with no DOM/browser globals
**Source:** `src/score-model.js` (all exported functions)
**Apply to:** `clock.js`, `pass-marker.js`, `pass-segmenter.js` — caller (`metronome.js`/`midi-capture.js`/`capture-app.js`) samples live browser values (`performance.now()`, `audioContext.currentTime`, DOM events) and passes plain numbers/objects in; the pure module never touches `performance`/`AudioContext`/`navigator` itself.

### Structural, deterministic ids + schema version on persisted shapes
**Source:** `src/score-model.js` `deriveNoteId` (lines 102-104) and `SCHEMA_VERSION` (line 47)
**Apply to:** `storage.js`'s object-store records (pieces keyed by content-hash id per D-17; DB carries `DB_VERSION` with an `upgrade()` migration function from day one, per D-17's "schema version with a migration function from day one")

### Velocity-0-as-note-off MIDI decode (reference only)
**Source:** `prototype/piano-app.js` lines 152-153 — do not reuse verbatim; reimplement per RESEARCH.md Pattern 3's `decode()` shape in `midi-capture.js`, keeping the bit-shift logic (`status >> 4`, `status & 15`) but dropping the prototype's percussion-channel and malformed-message filtering (Phase 2 keeps everything, D-04).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/metronome.js` | service | streaming/event-driven | No Web Audio code exists in this codebase yet — use RESEARCH.md Pattern 1's complete code example as the primary source instead of a local analog |
| `src/storage.js` | service | CRUD | No IndexedDB/persistence code exists in this codebase yet — use RESEARCH.md Pattern 5's complete code example as the primary source instead of a local analog |

## Metadata

**Analog search scope:** `src/`, `test/`, `scripts/`, `index.html`, `prototype/piano-app.js` (reference only, per canonical_refs), `package.json`
**Files scanned:** `src/score-model.js`, `src/score-renderer.js`, `test/score-model.test.cjs`, `test/osmd-node-env.cjs`, `scripts/check-run-path.cjs`, `scripts/check-svg-map.cjs` (referenced, not fully re-read — pattern already documented in canonical_refs/RESEARCH.md), `prototype/piano-app.js`, `index.html`
**Pattern extraction date:** 2026-09-13
