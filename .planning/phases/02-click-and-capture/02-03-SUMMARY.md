---
phase: 02-click-and-capture
plan: 03
subsystem: capture-pass-marking
tags: [pure-functions, node-test, devtools-protocol, indexeddb, keyboard-events]

requires:
  - phase: 02-click-and-capture (plan 01)
    provides: "globalThis.Storage (passes/rawEvents stores, putPass/readPasses/updateRawEvent/readRawEvents), globalThis.CaptureApp's C state object, onMidiEvent, start/endSession/restore lifecycle, scripts/check-capture-roundtrip.cjs's headless-Chrome fake-MIDI harness"
  - phase: 02-click-and-capture (plan 02)
    provides: "C.bpm, the metronome/clock wiring onMidiEvent already reads (unaffected by this plan's changes)"
provides:
  - "globalThis.PassMarker: DEFAULT_KEYS [107,108], WINDOW_MS 100, createDetector({keys, windowMs}) -> {feed, reset}, findMarkers(events, opts) -- pure, no DOM/MIDI/Audio globals"
  - "globalThis.PassSegmenter: segment(events, {sessionStartTimeStamp, sessionEndTimeStamp, includeEmptyTrailing}) -> passes [{ordinal, startSeq, endSeq, startTimeStamp, endTimeStamp, noteCount, eventCount, notes}] -- pure, seq-ordered, never mutates input"
  - "src/capture-app.js: openPass/persistPassUpdate/renderPassList/mark/onKeyDown wired into onMidiEvent, start(), endSession(), restore(), and a body keydown listener; CaptureApp.mark exposed"
  - "Raw event stream additions: type:'marker' records ({source:'pair'|'spacebar', timeStamp, seq, passOrdinal, raw:[], marker:true}); marker:true retroactively applied (in memory and via Storage.updateRawEvent) to the pair's two note-ons and their note-offs"
  - "Pass records {id, sessionId, ordinal, startSeq, startTimeStamp, endSeq, endTimeStamp, bpm} written at Start (pass 1), at every mark (close N, open N+1), and finalized on Stop and on reopen for an interrupted session"
  - "#passList DOM: live 'Pass N - K notes' listing with the trailing pass suffixed '(in progress)'; restored on reopen from the same PassSegmenter.segment() the live view uses"
affects: ["02-04 (phase-end piano checkpoint verifies B7+C8 and spacebar marking with the real FP-60X and a real 10+ pass drill)", "Phase 3 (alignment reads passes and the marker-tagged raw stream)", "Phase 5 (aggregate denominators may need to decide whether 0-note passes count -- flagged, not decided here)"]

actuals:
  tokens: 10300
  tasks: 2
  commits: 3
plan_head_before: d81ba795e29afc0211a37d3e49d0dd84bc7e7bc9

tech-stack:
  added: []
  patterns:
    - "Pass-marker detection and segmentation follow score-model.js's pure-transform convention exactly: plain records in, plain records out, no DOM/MIDI/Audio globals touched, node:test-able with a bare require()"
    - "A pass object's own creation write (Storage.putPass, autoIncrement keyPath) is tracked in a WeakMap so a same-tick close (mark landing before the create write resolves an id) chains off that promise instead of risking a second autoIncrement row -- the same class of race the raw-event marker-retag code already guards against via a seq-keyed pendingWrites map"
    - "The live pass list re-renders on every stored MIDI event (not just at mark time), matching the must_haves' 'live during the session' requirement for the trailing pass's note count"

key-files:
  created:
    - src/pass-marker.js
    - src/pass-segmenter.js
    - test/pass-marker.test.cjs
    - test/pass-segmenter.test.cjs
  modified:
    - src/capture-app.js
    - index.html
    - scripts/check-run-path.cjs
    - scripts/check-capture-roundtrip.cjs

key-decisions:
  - "openPass() and persistPassUpdate() use the same fire-and-tracked (C.pending) write pattern as every other write in capture-app.js, rather than the plan's illustrative 'await Storage.putPass' shown for the Start call site -- keeps C.currentPass/C.passes synchronously correct for the very next MIDI event regardless of IndexedDB round-trip latency, and durability still comes from flush()/C.pending exactly as it does for raw events and clicks"
  - "renderPassList() is called after every stored event when no mark occurred (not only inside mark()), because PassSegmenter.segment() recomputes noteCount fresh from the whole event array every time -- without this, the trailing pass's displayed note count would lag behind notes played after the last mark"
  - "The spacebar's boundary timestamp is the keydown's own DOMHighResTimeStamp (Claude's Discretion, per D-01/CONTEXT.md), not a MIDI timestamp -- there is no corresponding MIDI event to tag for a spacebar mark"

patterns-established:
  - "Pass records and marker records both use the fire-and-tracked C.pending write pattern; a same-object WeakMap (C.passWrites) or a seq-keyed Map (C.pendingWrites) is the guard whenever a later write needs an id that an earlier, still-in-flight write on the same record will eventually produce"

requirements-completed: [CAPT-04, CAPT-05, HIST-01]

coverage:
  - id: D1
    description: "B7+C8 (either order, within 100ms) and the spacebar both mark a pass boundary; the session panel lists 'Pass N - K notes' live (trailing pass marked in progress) and identically after a reload mid-drill, with nothing played ever dropped or double-mark-undone"
    requirement: "CAPT-04"
    verification:
      - kind: e2e
        ref: "scripts/check-capture-roundtrip.cjs (real headless Chrome, fake MIDI + a real KeyboardEvent dispatch: pair, sustain-during-a-pass, reversed pair, lone note, spacebar, mixed drill of 4 passes, verified again after a reload)"
        status: pass
    human_judgment: true
    rationale: "The headless check proves the detection, segmentation, persistence and restore logic exactly as specified with a fake MIDI input and a synthetic keydown, but whether B7+C8 feels natural and reliable to actually press together at speed on the real FP-60X, and whether a real 10+ pass drill comes back intact, needs the piano -- deferred to the Plan 04 phase-end checkpoint per workflow.human_verify_mode=end-of-phase and the project's VRFY-01 constraint."
  - id: D2
    description: "PassMarker.createDetector/findMarkers: pair order, the 100ms/100.01ms window edge, a lone key never hitting, the later of two same-key presses pairing, a repeated key replacing the earlier pending press, note-offs/CC64 never seeding or interfering, a custom key pair, and hit ordering/JSON round-trip through findMarkers"
    requirement: "CAPT-04"
    verification:
      - kind: unit
        ref: "test/pass-marker.test.cjs (8 tests, node --test)"
        status: pass
    human_judgment: false
  - id: D3
    description: "PassSegmenter.segment: no-marker single pass, a two-marker split with exact boundary/note-count numbers, the trailing-pass keep/drop rule under includeEmptyTrailing, a kept 0-note middle pass (no double-mark undo), marker-tagged/note-off/control/other exclusion from noteCount, the empty-input edge, seq-order independence with no input mutation, and the live passOrdinal invariant"
    requirement: "CAPT-04"
    verification:
      - kind: unit
        ref: "test/pass-segmenter.test.cjs (8 tests, node --test)"
        status: pass
    human_judgment: false
  - id: D4
    description: "HIST-01 extended to passes and markers: an interrupted session's passes (including the still-open trailing pass) are re-derived from the raw stream on reopen, the trailing pass record is finalized in storage, the session is marked endReason reopen, and nothing is merged with the new session that follows"
    requirement: "HIST-01"
    verification:
      - kind: e2e
        ref: "scripts/check-capture-roundtrip.cjs (Storage.readPasses/readRawEvents and CaptureApp.state.restored.sessions checked after a full page reload without Stop)"
        status: pass
    human_judgment: true
    rationale: "The clean-reload path (tab navigated, not killed) is proven end to end; a true abrupt process kill was already flagged as deferred to the Plan 04 checkpoint in Plan 01's own summary and remains so here -- this plan changes what gets restored (passes) but not the durability mechanism itself."
  - id: D5
    description: "CAPT-05's 'raw MIDI stored unmodified' extended to markers and pass boundaries: CC64/sustain is never interpreted as a marker and is stored exactly like any other message; a marker never snaps a timestamp or rewrites a stored value; the marker keys' own note-on/off events are tagged marker:true but never dropped, filtered, or excluded from the raw stream"
    requirement: "CAPT-05"
    verification:
      - kind: e2e
        ref: "scripts/check-capture-roundtrip.cjs (asserts both control:64 records keep marker:false, all 8 pair-key note-on/off records carry marker:true, the lone note's on/off carry marker:false, and the raw record count is exactly 27 with no message ever missing)"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-09-14
status: complete
---

# Phase 2 Plan 3: Click and Capture — Pass Marking and Segmentation Summary

**B7+C8 (either order, within 100ms) or the spacebar splits a session into numbered passes — a pure PassMarker/PassSegmenter pair pinned by 16 node:test cases, wired into capture-app.js's raw event stream, with a real headless-Chrome drill of 4 passes (3/2/1/1 notes) surviving a reload mid-session.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-14T03:20:00Z (approx)
- **Completed:** 2026-09-14T04:02:00Z
- **Tasks:** 2
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments

- `src/pass-marker.js` implements `globalThis.PassMarker`: `createDetector({keys, windowMs})` returns `{feed, reset}` over a pending-map of the two marker keys, hitting on either press order within the (inclusive) 100ms window, replacing an older pending press of the same key, and never touching note-offs, CC64, or any other message type; `findMarkers(events, opts)` runs a detector over a whole stream (D-01, D-02, CAPT-04).
- `src/pass-segmenter.js` implements `globalThis.PassSegmenter.segment()`: slices a raw event array (sorted by `seq`, never `timeStamp`) into numbered passes at each `type: 'marker'` record, excluding marker-tagged note-ons/note-offs/controls/other from `noteCount` (they land in `eventCount`), always keeping a marker-closed middle pass even at 0 notes, and keeping the trailing pass only when it holds a note or `includeEmptyTrailing` is set (D-03, D-04, D-07).
- `src/capture-app.js` wires both modules into the live capture path: `openPass`/`persistPassUpdate` write pass records (guarding a same-tick close against a race with its own creation write); `mark(source, timeStamp)` closes the current pass, opens the next, and writes a `type:'marker'` raw record; `onMidiEvent` feeds the detector, retags the pairing note-on (and both note-offs) with `marker: true` in memory and in storage once each write resolves, and re-renders `#passList` on every event; a body `keydown` (code `Space`, not inside an input/select/textarea) marks a pass the same way; `restore()` finalizes an interrupted session's trailing pass record and re-lists its passes from the same segmenter the live view uses.
- `index.html` gained `#passList`, a hint about the two marking gestures, and the `pass-marker.js`/`pass-segmenter.js` script tags in dependency order; `scripts/check-run-path.cjs` extended for the ten-script order and the new DOM marker.
- `scripts/check-capture-roundtrip.cjs`'s second scenario drives a fake FP-60X through 3 ordinary notes, a B7+C8 pair, 2 notes around a sustain press, a reversed C8+B7 pair, a lone B7, a real spacebar `KeyboardEvent`, and one more note — asserting the live `#passList` (`Pass 1 - 3 notes`, `Pass 2 - 2 notes`, `Pass 3 - 1 notes`, `Pass 4 - 1 notes (in progress)`), then a reload without Stop restoring the same four passes, 27 raw records (3 marker records: two `pair`, one `spacebar`), the pair's 8 note-on/off records tagged `marker:true`, the lone note and both sustain-control records tagged `marker:false`, and four contiguous pass records in storage. Prints `OK capture round-trip: pass split 3/2/1/1 restored after reload mid-session`.
- `test/pass-marker.test.cjs` (8 cases) and `test/pass-segmenter.test.cjs` (8 cases) pin every edge named in the plan's `<behavior>` block by hand, bringing the suite to 78 passing `node:test` cases.

## Task Commits

Each task was committed atomically; Task 2 is TDD-flagged and split into a test-pin commit (no genuine RED — see TDD Gate Compliance) and a feat commit for the genuinely new spacebar behavior:

1. **Task 1: End-to-end "B7+C8 splits the session into numbered passes that survive a reload mid-drill"** — `7c45114` (feat)
2. **Task 2 pins: node:test pins for the pass-marker detector and pass-segmenter** — `9ab3066` (test)
3. **Task 2 feature: spacebar marking and the mixed pair+spacebar round-trip extension** — `c8fa4bd` (feat)

**Plan metadata:** committed alongside this SUMMARY.

## Files Created/Modified

- `src/pass-marker.js` — `globalThis.PassMarker`: `DEFAULT_KEYS`, `WINDOW_MS`, `createDetector`, `findMarkers`
- `src/pass-segmenter.js` — `globalThis.PassSegmenter.segment`
- `src/capture-app.js` — `openPass`, `persistPassUpdate`, `renderPassList`, `mark`, `onKeyDown`; wired into `start`, `onMidiEvent`, `endSession`, `restore`; `CaptureApp.mark` exposed
- `index.html` — `#passList`, hint text, two new script tags in dependency order
- `scripts/check-run-path.cjs` — ten-script `EXPECTED_LOCAL_SCRIPTS` order, `id="passList"` gate
- `scripts/check-capture-roundtrip.cjs` — second scenario: pair/spacebar drill, mid-session reload, marker/pass assertions
- `test/pass-marker.test.cjs` — 9 hand-typed detector pins
- `test/pass-segmenter.test.cjs` — 8 hand-typed segmenter pins

## Decisions Made

- `openPass()`/`persistPassUpdate()` use the same fire-and-tracked write pattern as every other write in `capture-app.js` rather than an inline `await`, so `C.currentPass`/`C.passes` stay synchronously correct for the very next MIDI event; durability still comes from `C.pending`/`flush()`.
- `renderPassList()` is called after every stored event (not only at `mark()`), because the segmenter recomputes fresh each time and the trailing pass's note count must stay live as notes are played after the last mark.
- The spacebar's boundary timestamp is the keydown's own `DOMHighResTimeStamp` (Claude's Discretion per D-01) — there is no MIDI event to tag for a spacebar mark, unlike the key-pair gesture.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The live pass list did not update after notes played following the last mark**
- **Found during:** Task 1, first run of `node scripts/check-capture-roundtrip.cjs` (before commit), tracing the expected `Pass 3 - 1 notes (in progress)` line by hand
- **Issue:** The plan's action text calls `renderPassList()` only from inside `mark()`. Since `PassSegmenter.segment()` is recomputed fresh each render (not incrementally updated), a note played *after* the last mark (e.g., the lone B7 at t+2400 in the round-trip drill) would never appear in `#passList` until the *next* mark fired — violating the must_haves truth that the pass list is "live during the session."
- **Fix:** `onMidiEvent` now calls `renderPassList()` after every stored event when no mark occurred on that event (mark() already re-renders on its own path).
- **Files modified:** `src/capture-app.js`
- **Verification:** `node scripts/check-capture-roundtrip.cjs` — `#passList` reads `Pass 3 - 1 notes (in progress)` (Task 1) / `Pass 4 - 1 notes (in progress)` (Task 2) as expected
- **Committed in:** `7c45114` (Task 1 commit)

**2. [Rule 1 - Bug] Closing a pass could insert a duplicate autoIncrement row instead of updating it**
- **Found during:** Task 1, tracing the round-trip drill's timing by hand before running it — all 22 fake MIDI sends execute synchronously in one page-side script, so a pass opened by one mark and closed by the very next mark (pass 2 in the drill) has no real elapsed time for its own `Storage.putPass` creation write to resolve an `id` before the closing write goes out. `db.put()` on an `autoIncrement`/`keyPath: 'id'` record with no `id` yet inserts a *new* row instead of updating the original — the closed pass's real values would land under a second, orphaned id, and `Storage.readPasses` would return 4+ records instead of 3.
- **Fix:** Added `C.passWrites` (a `WeakMap` from pass object to its in-flight creation-write promise) and `persistPassUpdate(pass)`, which waits on that promise (if the pass's `id` isn't set yet) before issuing the update `db.put()`, guaranteeing the `id` is always present. `mark()` and `endSession()` both close passes through `persistPassUpdate()`.
- **Files modified:** `src/capture-app.js`
- **Verification:** `node scripts/check-capture-roundtrip.cjs` — `Storage.readPasses(db, id)` returns exactly 4 contiguous pass records with the correct `endSeq` values, run 3 times consecutively, stable
- **Committed in:** `7c45114` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** Both were necessary for the plan's own must_haves truths ("live during the session") and the round-trip script's own acceptance criteria (exact pass-record counts) to hold; no scope creep, no design change from what the plan asked for.

## TDD Gate Compliance

Task 2 carries `tdd="true"`; this plan's frontmatter is `type: execute` (not `type: tdd`) and `workflow.tdd_mode` is `false` in this project's config, so the strict RED/GREEN/REFACTOR gate is not a hard blocker here (same situation as 02-01's Task 2). Judged against the spirit of the rule, this task actually splits into two different situations:

- **The detector/segmenter pins had no genuine RED.** `src/pass-marker.js` and `src/pass-segmenter.js` were already implemented and committed by Task 1's tracer (the fixed contract this and later phases depend on). Writing `test/pass-marker.test.cjs`/`test/pass-segmenter.test.cjs` against that already-correct code is pinning, not driving new implementation — exactly Plan 01's Task 2 precedent. One test-authoring mistake was caught and fixed before commit (a hand-traced expected pass count that didn't match the actual marker-closing semantics for a stream with three markers) — this was a bug in the *test*, not in the implementation, and was corrected before the `test(02-03):` commit, so it never reached a committed state.
- **The spacebar behavior is genuinely new**, and per the plan's own instruction ("The spacebar behavior is exercised by the round-trip script, not by node:test — it needs the DOM"), its only verification is `scripts/check-capture-roundtrip.cjs`, not a `node:test` unit test. A literal `test(...)`/`feat(...)` RED/GREEN pair over a DOM-dependent E2E script isn't the tool this behavior calls for; the implementation and the round-trip script's extension were authored together and verified by running the real headless-Chrome drill, matching the plan's explicit design choice to route this behavior through the E2E harness instead of `node:test`.
- **No REFACTOR commit** — nothing needed cleaning up after either commit.

This is judged a correct, intentional consequence of this task's own structure, not a discipline violation to silently wave through.

## Issues Encountered

None beyond the two auto-fixed deviations above, both resolved before their respective task's commit.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 04's phase-end piano checkpoint should specifically verify: B7+C8 feels natural to press together at the real FP-60X's actual key spacing/action, the spacebar works reliably as an alternative from the laptop without accidentally re-triggering Start/Stop, and a real 10+ pass drill (roadmap success criterion 5) comes back with the exact same pass count and note counts after closing and reopening the tab.
- Phase 3 (alignment) can read passes and the marker-tagged raw stream directly from `Storage.readPasses`/`Storage.readRawEvents` — both shapes are fixed by this plan and D-17.
- Flagged, not decided: whether Phase 5's aggregate denominators exclude a 0-note pass (a double-mark accident); this plan keeps such a pass and lists it honestly, per D-04's "no double-mark undo."
- No blockers for Plan 04.

## Self-Check: PASSED

- All key-files created exist on disk: `src/pass-marker.js`, `src/pass-segmenter.js`, `test/pass-marker.test.cjs`, `test/pass-segmenter.test.cjs`
- All three task commits found in git log: `7c45114`, `9ab3066`, `c8fa4bd`
- Re-ran all acceptance criteria and all plan-level `<verification>` commands on a clean pass after the final commit: `node --test test/pass-marker.test.cjs test/pass-segmenter.test.cjs` -> 16/16 pass, `# fail 0`; `node scripts/check-capture-roundtrip.cjs` -> both OK lines (`8 raw events restored unmodified, 3 clicks in the timeline, piece restored from stored bytes` and `pass split 3/2/1/1 restored after reload mid-session`), exit 0; `node scripts/check-run-path.cjs` -> 35 gates, 0 failed; `npm test` -> 78/78 pass, `# fail 0`

---
*Phase: 02-click-and-capture*
*Completed: 2026-09-14*
