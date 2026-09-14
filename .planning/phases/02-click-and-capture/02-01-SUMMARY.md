---
phase: 02-click-and-capture
plan: 01
subsystem: capture-storage
tags: [web-midi, indexeddb, idb, fake-indexeddb, devtools-protocol, node-test]

requires:
  - phase: 01-score-on-screen
    provides: "Score model schema v1, globalThis.ScoreRenderer.loadPiece(file) accepting any Blob, the classic-script/no-build-step run path"
provides:
  - "globalThis.MidiCapture: decode(event) (never throws, never filters, keeps channel 10/CC64/velocity-0-note-off), noteName(midi), connect({onStateChange}), listInputs(access), attach(input, onEvent), detach(input)"
  - "globalThis.Storage: idb-backed IndexedDB wrapper — DB_NAME 'piano-mistakes', DB_VERSION 1, six object stores (pieces, settings, sessions, passes, rawEvents, clickTimeline) with bySession/byPiece indexes, full CRUD surface, rethrowStorageError() surfacing QuotaExceededError as a named message, never swallowed"
  - "globalThis.CaptureApp: MIDI input selector with state-in-words, live note-on indicator (count/last-note/flash, no grading), Start/Stop session lifecycle writing one raw event per MIDI message with no buffering, restore-on-reopen (piece + prior sessions with note counts)"
  - "document CustomEvents piece-loaded/piece-unloaded dispatched by src/score-renderer.js, the integration seam capture-app.js hooks into"
  - "scripts/check-capture-roundtrip.cjs: headless-Chrome DevTools-protocol round trip proving 8 raw MIDI events survive a full reload byte- and timestamp-identical, in arrival order"
  - "test/idb-node-env.cjs: fake-indexeddb + idb global shim for node:test, mirroring test/osmd-node-env.cjs's descriptor-preserving install/restore shape"
affects: ["02-02 (metronome and click timeline land on top of this unchanged raw-event path)", "02-03 (pass marking/segmentation reads the raw event stream this plan writes)", "02-04 (the phase-end piano checkpoint verifies this capture path with the real FP-60X)", "Phase 3 (alignment reads passes/rawEvents plus the score model)", "Phase 4 (timing reads the click timeline and session calibration this schema reserves)"]

actuals:
  tokens: 13500
  tasks: 2
  commits: 2
plan_head_before: 2b4237a0b1c53e8b5bf3d51dc6948e901e92469d

tech-stack:
  added: ["idb@8.0.3 (CDN UMD script in the browser, pinned devDependency for node:test)", "fake-indexeddb@6.2.5 (test-only devDependency, in-memory IndexedDB for node:test)"]
  patterns:
    - "Raw-event-sourced persistence: every decoded MIDI message is written via a single db.add call per message as it arrives, never buffered or debounced (D-17, pitfall P2-6) — durability comes from the write itself, pagehide is only an opportunistic extra flush"
    - "IndexedDB schema versioned from day one: upgrade(db, oldVersion) with an explicit `if (oldVersion < 1) {...}` block; a future `if (oldVersion < 2)` is added beside it, never inside it"
    - "Headless-Chrome DevTools-protocol round trip extended with Page.addScriptToEvaluateOnNewDocument to install a fake navigator.requestMIDIAccess before the app's own scripts run — the raw-CDP equivalent of Playwright's addInitScript(), avoiding a new devDependency"
    - "Classic-script globalThis IIFE modules with no top-level const/let/var/function outside the IIFE, so capture-app.js can load after score-renderer.js without colliding with its S/$/toast/setStatus bindings"

key-files:
  created:
    - src/midi-capture.js
    - src/storage.js
    - src/capture-app.js
    - scripts/check-capture-roundtrip.cjs
    - test/idb-node-env.cjs
    - test/midi-capture.test.cjs
    - test/storage.test.cjs
  modified:
    - src/score-renderer.js
    - index.html
    - scripts/check-run-path.cjs
    - package.json
    - package-lock.json
    - README.md

key-decisions:
  - "sessions store carries a byPiece index on pieceId, exactly as the plan specified — missed in the first draft of src/storage.js (only bySession was added on the other three stores) and caught by the headless round-trip check before the Task 1 commit; listSessionsForPiece and restore-on-reopen depend on it"
  - "idb's npm package (named exports openDB/deleteDB/wrap/unwrap) supplies the Node `idb` global for tests — identical API surface to the UMD build the browser loads from the pinned CDN URL, so storage.js's own code never needs a test-only branch"
  - "fake-indexeddb's full constructor set (IDBCursor, IDBCursorWithValue, IDBDatabase, IDBIndex, IDBObjectStore, IDBOpenDBRequest, IDBRequest, IDBTransaction, IDBVersionChangeEvent) had to be installed on globalThis, not just IDBFactory/IDBKeyRange as first assumed — idb's wrap() does instanceof checks against them and throws ReferenceError otherwise"
  - "Task 2 is one test-only commit, not a RED/GREEN pair: the decode()/storage behavior under test was already implemented and committed by Task 1's tracer (the fixed contract Phase 3-5 depend on), so no behavioral RED was expected or observed — see TDD Gate Compliance below"
  - "package.json pins fake-indexeddb and idb without a caret (matching the project's existing exact-pin convention for opensheetmusicdisplay/jsdom), overriding npm install's default caret range"

patterns-established:
  - "Pattern 5 (raw-event-sourced persistence) is now concrete: decode() -> onMidiEvent() -> Storage.appendRawEvent(), one write per message, quota errors surfaced via toast, never swallowed"
  - "Restore-on-reopen: every open session is marked endReason 'reopen' and re-read (not cached) before being summarized, so the summary always reflects the just-applied close"

requirements-completed: [CAPT-01, CAPT-02, CAPT-05, HIST-01]

coverage:
  - id: D1
    description: "MIDI capture decodes every message type without throwing or filtering (note-on/off including velocity-0, CC64, program change, real-time bytes, channel 10) and connects to a real or fake Web MIDI input"
    requirement: "CAPT-01"
    verification:
      - kind: unit
        ref: "test/midi-capture.test.cjs (11 tests, node --test)"
        status: pass
      - kind: e2e
        ref: "scripts/check-capture-roundtrip.cjs (real headless Chrome, fake MIDI input, 8 messages)"
        status: pass
    human_judgment: false
  - id: D2
    description: "IndexedDB schema (6 stores, 2 index kinds), CRUD surface, arrival-order read-back, and QuotaExceededError surfacing are pinned and proven durable across a full page reload"
    requirement: "HIST-01"
    verification:
      - kind: unit
        ref: "test/storage.test.cjs (10 tests, node --test, fake-indexeddb-backed)"
        status: pass
      - kind: e2e
        ref: "scripts/check-capture-roundtrip.cjs (piece and 8 raw events restored byte- and timestamp-identical after reload)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Live indicator (note count, last note name/velocity, flash) shows no verdict/grade/colour anywhere, matching CAPT-02's constraint"
    requirement: "CAPT-02"
    verification:
      - kind: e2e
        ref: "scripts/check-capture-roundtrip.cjs (#liveCount reads 3 after 3 note-ons, #midiState reads 'Connected: Fake FP-60X')"
        status: pass
    human_judgment: true
    rationale: "The headless check proves the DOM values and the absence of a verdict field programmatically, but whether the indicator reads comfortably at a real piano while playing (D-19's actual UX intent) needs eyes and hands, deferred to the Plan 04 phase-end checkpoint per workflow.human_verify_mode=end-of-phase and the project's VRFY-01 constraint."
  - id: D4
    description: "index.html still opens by double-click from file:// with classic scripts only, extended with the pinned idb CDN tag and three new local scripts in dependency order"
    verification:
      - kind: other
        ref: "node scripts/check-run-path.cjs (24 gates, including the new idb URL and script-order gates)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-14
status: complete
---

# Phase 2 Plan 1: Click and Capture — Raw MIDI Capture and Storage Summary

**Every raw MIDI message a fake FP-60X sends during a session survives Start, eight decoded messages, Stop, a full page reload, and reads back byte- and timestamp-identical from IndexedDB — proven in real headless Chrome, with the decode table and storage contract separately pinned by 21 node:test cases.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-14T02:52:00Z (approx)
- **Completed:** 2026-09-14T03:08:16Z
- **Tasks:** 2
- **Files modified:** 13 (7 created, 6 modified)

## Accomplishments

- `src/midi-capture.js` decodes every MIDI message type the FP-60X (or any input) can send — note-on, note-on-with-velocity-0-as-note-off, note-off, any control change (CC64 sustain stored exactly like any other controller), program change, 1-byte real-time bytes, and channel 10 (percussion) — into a plain-data record, never throwing and never filtering (D-04, CAPT-01).
- `src/storage.js` wraps the `idb` UMD global with a fully schema-versioned IndexedDB layer: six object stores (`pieces`, `settings`, `sessions`, `passes`, `rawEvents`, `clickTimeline`) created in `DB_VERSION` 1 with `bySession`/`byPiece` indexes, a full CRUD surface for every store, and `rethrowStorageError()` turning a `QuotaExceededError` into a named user-facing message instead of swallowing it (D-17, HIST-01).
- `src/capture-app.js` owns the capture transport DOM: a MIDI input selector remembering the last-used input, connection state shown in words for every case D-19 lists, a live indicator (note count, last note name/velocity, a brief flash) with no verdict/grade anywhere, and Start/Stop session lifecycle writing one raw event per MIDI message with no debounce buffer.
- `src/score-renderer.js` gained a two-line hook: `piece-loaded`/`piece-unloaded` `CustomEvent`s dispatched on `document`, the seam `capture-app.js` uses to hash, store, and restore pieces without either file reaching into the other's internals.
- `scripts/check-capture-roundtrip.cjs` drives real headless Chrome over the DevTools protocol, installs a fake `navigator.requestMIDIAccess` via `Page.addScriptToEvaluateOnNewDocument`, records a session of 8 messages (including a same-timestamp chord pair and a real-time byte), reloads the page, and asserts the piece re-renders and all 8 events read back unmodified in arrival order — printing `OK capture round-trip: 8 raw events restored unmodified, piece restored from stored bytes`.
- `test/idb-node-env.cjs`, `test/midi-capture.test.cjs`, and `test/storage.test.cjs` pin the decode table and the storage contract with 21 hand-typed `node:test` cases run against `fake-indexeddb` (no browser needed), bringing the full suite to 42 passing tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "one recording of raw MIDI survives a reload"** — `ecf8679` (feat)
2. **Task 2: Pin the decode table and the storage contract with node:test** — `6d3bf9c` (test)

**Plan metadata:** committed alongside this SUMMARY.

_Note: Task 2 is TDD-flagged (`tdd="true"`) but produced a single `test(...)` commit rather than a RED/GREEN pair — see "TDD Gate Compliance" below for why that is correct here, not a violation._

## Files Created/Modified

- `src/midi-capture.js` — Web MIDI decode/connect/listInputs/attach/detach
- `src/storage.js` — idb-backed IndexedDB schema, CRUD, quota surfacing
- `src/capture-app.js` — MIDI selector, live indicator, session lifecycle, restore-on-reopen
- `src/score-renderer.js` — dispatches `piece-loaded`/`piece-unloaded`
- `index.html` — pinned `idb@8.0.3` UMD tag, capture transport DOM, three new script tags
- `scripts/check-run-path.cjs` — extended for the idb CDN gate and six-script dependency order
- `scripts/check-capture-roundtrip.cjs` — headless-Chrome fake-MIDI-input round trip
- `test/idb-node-env.cjs` — fake-indexeddb + idb global shim
- `test/midi-capture.test.cjs` — 11 decode/noteName tests
- `test/storage.test.cjs` — 10 schema/CRUD/quota tests
- `package.json` / `package-lock.json` — `idb@8.0.3`, `fake-indexeddb@6.2.5` devDependencies
- `README.md` — documents `check:capture` and the in-memory IndexedDB test setup

## Decisions Made

- The recomputed SHA-384 integrity hash for `idb@8.0.3`'s UMD build matched the plan-supplied hash exactly (`sha384-lLGuFiulNF2N/nqC6IxFZzy3WGfLokEKQD73HN9gCx1vFouvtty5kp+wf20Rrs0Y`) — no hash update was needed.
- CDP's `Page.addScriptToEvaluateOnNewDocument` parameter shape (research assumption A5) worked exactly as sketched in 02-RESEARCH.md's code example on the first attempt — no adjustment needed.
- `refreshInputs()` re-attaches the stored `lastMidiInputId` when present, else the first input, matching D-19 exactly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing `byPiece` index on the `sessions` object store**
- **Found during:** Task 1, first run of `node scripts/check-capture-roundtrip.cjs` (before any commit)
- **Issue:** The first draft of `src/storage.js`'s `upgrade()` only added `bySession` indexes to `passes`/`rawEvents`/`clickTimeline`, but never created the `byPiece` index on `sessions` that the plan explicitly specifies. `restore()`'s call to `Storage.listSessionsForPiece` (via `db.getAllFromIndex(STORES.sessions, 'byPiece', pieceId)`) threw on the second page load, surfacing as `#status` `dataset.restore === 'error'` even though the piece itself had re-rendered correctly.
- **Fix:** Added `.createIndex('byPiece', 'pieceId')` to the `sessions` object-store creation in the version-1 `upgrade()` block.
- **Files modified:** `src/storage.js` (fixed before the file was ever committed, so the committed version is already correct)
- **Verification:** `node scripts/check-capture-roundtrip.cjs` now exits 0 with the `OK` line; `test/storage.test.cjs`'s schema test asserts `sessions`' `indexNames` is exactly `['byPiece']`
- **Committed in:** `ecf8679` (Task 1 commit)

**2. [Rule 3 - Blocking] `idb`'s `wrap()` needs the full IndexedDB constructor set on `globalThis`, not just `IDBFactory`/`IDBKeyRange`**
- **Found during:** Task 2, first run of `node --test test/storage.test.cjs`
- **Issue:** `idb`'s `wrap()` does `instanceof` checks against `IDBRequest`, `IDBCursor`, `IDBTransaction`, and others to decide how to promisify each IndexedDB object. Installing only `indexedDB`, `IDBKeyRange`, and `idb` (the shim's first draft, mirroring `osmd-node-env.cjs`'s smaller DOM-only list) left every one of those checks looking at an undefined global, throwing `ReferenceError: IDBRequest is not defined` on the very first `Storage.open()` call.
- **Fix:** `test/idb-node-env.cjs` now installs all nine constructors `fake-indexeddb` exports (`IDBCursor`, `IDBCursorWithValue`, `IDBDatabase`, `IDBIndex`, `IDBObjectStore`, `IDBOpenDBRequest`, `IDBRequest`, `IDBTransaction`, `IDBVersionChangeEvent`) alongside `indexedDB`/`IDBKeyRange`/`idb`, all with the same descriptor-preserving `Object.defineProperty` install/restore.
- **Files modified:** `test/idb-node-env.cjs`
- **Verification:** `node --test test/midi-capture.test.cjs test/storage.test.cjs` exits 0, `# fail 0`
- **Committed in:** `6d3bf9c` (Task 2 commit)

**3. [Rule 1 - Bug] `npm install -D` wrote caret ranges instead of exact pins**
- **Found during:** Task 2, immediately after `npm install -D idb@8.0.3 fake-indexeddb@6.2.5`
- **Issue:** npm defaulted to `"^8.0.3"`/`"^6.2.5"` in `package.json`, breaking the project's existing exact-pin convention (`opensheetmusicdisplay: "2.1.2"`, `jsdom: "29.1.1"`) and failing the plan's own acceptance grep for the literal pinned strings.
- **Fix:** Edited `package.json` to `"idb": "8.0.3"` and `"fake-indexeddb": "6.2.5"` (the caret only ever affected `package.json`; `package-lock.json` already recorded the exact resolved versions).
- **Files modified:** `package.json`
- **Verification:** `grep -c '"idb": "8.0.3"' package.json` and `grep -c '"fake-indexeddb": "6.2.5"' package.json` both print 1
- **Committed in:** `6d3bf9c` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs, 1 Rule 3 blocking issue)
**Impact on plan:** All three were necessary for the plan's own acceptance criteria and verification commands to pass as specified; no scope creep, no design change from what the plan asked for.

## TDD Gate Compliance

Task 2 carries `tdd="true"`, but this plan's frontmatter is `type: execute` (not `type: tdd`), so the strict RED/GREEN/REFACTOR gate (`workflow.tdd_mode` is `false` in this project's config) does not apply as a hard gate here. Even judged against the spirit of the rule:

- **RED, as literally defined (a test failing on the target behavior before implementation exists), did not occur** — Task 1's tracer already implemented and committed `src/midi-capture.js` and `src/storage.js` in full, correct form, one commit before Task 2 began. Task 2's job, per its own `<action>` and `<behavior>` blocks, is to *pin* that already-working contract with hand-typed `node:test` cases, not to drive new implementation from a failing test.
- **The one genuine failure encountered while building Task 2** (`ReferenceError: IDBRequest is not defined`, deviation 2 above) was an environment/test-harness gap, not a behavioral one — it went away once the harness correctly shimmed IndexedDB, with zero changes to `src/storage.js` itself. This matches `tdd.md`'s own "Framework Setup (If None Exists)" allowance: framework/harness setup is a legitimate part of getting to a real RED, and here the harness fix revealed the *tests* were already correct against already-correct code.
- **GREEN was immediate and unmodified:** once the harness was fixed, all 21 new tests (11 `midi-capture`, 10 `storage`) passed on the same run with no `src/*.js` changes, which is why Task 2 produced one `test(02-01):` commit rather than a `test(02-01):`/`feat(02-01):` pair — there was no implementation delta to separate out.
- **No REFACTOR commit** — nothing needed cleaning up after GREEN.

This is judged a correct, intentional consequence of this plan's own structure (Task 1 = tracer that proves and commits the real implementation; Task 2 = pin the contract with tests), not a discipline violation to silently wave through. Flagging it here per the gate's own instruction to document a missing RED/GREEN split in the SUMMARY.

## Issues Encountered

None beyond the three auto-fixed deviations above, all resolved before their respective task's commit.

## User Setup Required

None — no external service configuration required. Internet access was needed once for the `idb@8.0.3` UMD CDN fetch (confirmed reachable, HTTP 200) in addition to Phase 1's existing OSMD fetch; both are cached by Chrome afterward. `npm install` additionally fetches `idb` and `fake-indexeddb` as devDependencies for the test suite only.

## Next Phase Readiness

- Plan 02 (metronome, click timeline, clock correlation) can build directly on `Storage`'s `clickTimeline` store and the session's `clockPairs`/`calibration` fields, already created in this plan's schema.
- Plan 03 (pass marking and segmentation) can build directly on the `passes` store and the raw event stream's `marker`/`passOrdinal` fields, already present on every stored record.
- Two items are explicitly deferred to Plan 04's phase-end piano checkpoint, per the plan's own "Flagged assumptions" section and the project's VRFY-01 constraint, not silently dropped:
  - Whether an abrupt process kill (not just a clean tab close/reload) truly loses nothing — the per-message-write design and the headless round trip prove the normal path; only a real kill-and-reopen at the piano closes this out.
  - Research assumption A1 (whether Chrome remembers the Web MIDI grant for the bare `file://` origin across a full browser restart, not just a page reload).
- No blockers for Plan 02.

## Self-Check: PASSED

- All key-files created exist on disk: `src/midi-capture.js`, `src/storage.js`, `src/capture-app.js`, `scripts/check-capture-roundtrip.cjs`, `test/idb-node-env.cjs`, `test/midi-capture.test.cjs`, `test/storage.test.cjs`
- Both task commits found in git log: `ecf8679`, `6d3bf9c`
- Re-ran all acceptance criteria and all three plan-level `<verification>` commands on a clean pass after both commits: `node scripts/check-capture-roundtrip.cjs` -> `OK capture round-trip: 8 raw events restored unmodified, piece restored from stored bytes`, exit 0; `node scripts/check-run-path.cjs` -> 24 gates, 0 failed; `npm test` -> 42/42 pass, `# fail 0`

---
*Phase: 02-click-and-capture*
*Completed: 2026-09-14*
