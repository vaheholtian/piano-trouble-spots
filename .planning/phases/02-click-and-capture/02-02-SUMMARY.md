---
phase: 02-click-and-capture
plan: 02
subsystem: capture-metronome
tags: [web-audio, web-midi, metronome, look-ahead-scheduler, clock-correlation, node-test]

requires:
  - phase: 02-click-and-capture (plan 01)
    provides: "globalThis.Storage (clickTimeline store, session.clockPairs/latency/calibration/bpmAtStart fields), globalThis.CaptureApp's C state object and Start/Stop lifecycle, scripts/check-capture-roundtrip.cjs's headless-Chrome harness"
provides:
  - "globalThis.Clock: samplePair, toAudioContextTime, toPageTime, offsetMs, nearestClick, median -- pure, no browser globals, node:test-able"
  - "globalThis.Metronome: advance() pure scheduling math, isValidBpm(), create(audioContext, {timeSignatureFor, onClick}) returning {start, setBpm, stop, nextClickTime, isRunning, cursor} -- a Web Audio look-ahead scheduler, never a setInterval-driven click"
  - "A BPM input, Start/Stop wiring that creates/resumes the AudioContext synchronously inside the click handler (pitfall P2-3), writes every scheduled click to Storage.appendClick as {sessionId, audioTime, pageTime, bar, beat, bpm, accent}, and remembers BPM per piece (setting bpm:<pieceId>) with a live mid-session tempo change (D-08/D-14)"
  - "A collapsible clock readout showing the last note's offset from the nearest click, the running median of the last 20, note count, and AudioContext base/output latency -- diagnostic only, no per-note verdict (D-10)"
  - "Session calibration {medianOffsetMs, noteCount} plus a fresh clock pair re-sampled every 30s and once more at Stop (D-11), stored on the session, never applied to any timestamp"
  - "scripts/check-capture-roundtrip.cjs extended to assert the click timeline: bar/beat/accent/bpm numbering through rung 1's 5/4 time signature, ~0.5s cadence at 120 BPM, strictly increasing pageTime, and the session's clockPairs/bpmAtStart/latency fields"
affects: ["02-03 (pass segmentation reads the same raw event stream, unaffected by this plan)", "02-04 (the phase-end piano checkpoint verifies the click is audible and the readout's median settles near zero)", "Phase 4 (timing reads the click timeline this plan writes and the session calibration as its expected-timeline ground truth)"]

actuals:
  tokens: 7800
  tasks: 2
  commits: 3
plan_head_before: 48a96f9d7b562e9267499a031f5463ea73da9a52

tech-stack:
  added: []
  patterns:
    - "Web Audio look-ahead scheduler: a 25ms setInterval poll only decides which clicks fall within a 100ms horizon on audioContext.currentTime; the click's own scheduled AudioContext time is the only ground truth, never the timer's firing time (D-05)"
    - "Paired-sample clock correlation: Clock.samplePair(performance.now(), audioContext.currentTime) taken at Start, every 30s, and at Stop; conversion happens only at comparison time, stored MIDI timestamps are never rewritten (D-09)"
    - "Pure scheduling-math core (Metronome.advance) separated from the side-effecting AudioContext wrapper (Metronome.create), mirroring src/clock.js and src/score-model.js's existing DOM-free, node:test-able convention"
    - "Headless-Chrome verification polls an actual in-page counter instead of a fixed sleep, because headless Chrome's AudioContext clock does not track wall-clock time 1:1"

key-files:
  created:
    - src/clock.js
    - src/metronome.js
    - test/clock.test.cjs
    - test/metronome.test.cjs
  modified:
    - src/capture-app.js
    - index.html
    - scripts/check-run-path.cjs
    - scripts/check-capture-roundtrip.cjs

key-decisions:
  - "Headless Chrome's AudioContext.currentTime does not advance at real wall-clock speed (measured ~64% of real time with no audio output device) -- the round-trip check polls CaptureApp.state.clicks.length instead of a fixed sleep(1600), which was flaky under system load"
  - "FIRST_CLICK_DELAY_S and SCHEDULE_AHEAD_S are both 0.1s by plan design, so the very first synchronous tick() inside start() finds zero clicks in range (0.1 is not strictly less than 0.1) -- the first click is always picked up on a later tick, exactly the CAPT-03 adjacency edge the plan calls out, confirmed both in the create() mock-timer test and in the real headless-Chrome round trip"
  - "nearestClick's tie-break keeps the earlier index by only replacing the current best on a strictly smaller absolute difference, never on equal"

patterns-established:
  - "Metronome.advance/Clock.* stay pure and DOM-free; only Metronome.create/capture-app.js touch AudioContext/DOM -- same separation Phase 1 established for ScoreModel.extract vs score-renderer.js"

requirements-completed: [CAPT-03, CAPT-02]

coverage:
  - id: D1
    description: "Start creates/resumes the AudioContext synchronously and runs a Web Audio look-ahead click at the user's BPM with beat 1 accented from the score's time signature"
    requirement: "CAPT-03"
    verification:
      - kind: unit
        ref: "test/metronome.test.cjs (8 tests: advance horizon strictness, bar/beat numbering, time-signature cycling, BPM-change adjacency, isValidBpm, create() mock-timer smoke test)"
        status: pass
      - kind: e2e
        ref: "scripts/check-capture-roundtrip.cjs (real headless Chrome: CaptureApp.state.audioState reads 'running' after Start, click count polled to at least 3)"
        status: pass
    human_judgment: true
    rationale: "The scheduling math and the AudioContext-state transition are proven programmatically, but whether the click is actually audible and stays tight over a several-minute backgrounded-tab session (PITFALLS.md pitfall 8) needs ears, deferred to the Plan 04 phase-end piano checkpoint per workflow.human_verify_mode=end-of-phase and the project's VRFY-01 constraint."
  - id: D2
    description: "Every scheduled click is written to the clickTimeline store as {sessionId, audioTime, pageTime, bar, beat, bpm, accent}, ascending and gap-free, and a clock pair is sampled at Start and Stop onto the session"
    requirement: "CAPT-03"
    verification:
      - kind: e2e
        ref: "scripts/check-capture-roundtrip.cjs (Storage.readClicks/getSession after a full reload: bar/beat/accent numbering through rung 1's 5/4 signature, ~0.5s cadence at 120 BPM within 2ms, strictly increasing pageTime, clockPairs.length >= 2 with finite values, bpmAtStart 120, finite latency.base)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Clock.offsetMs/nearestClick/median are pure, unit-tested conversion and diagnostic functions with no browser globals"
    requirement: "CAPT-02"
    verification:
      - kind: unit
        ref: "test/clock.test.cjs (12 tests: conversion formulas both directions, offsetMs sign, nearestClick incl. exact-tie and empty-array edges, median incl. empty/single/odd/even/no-mutation edges, JSON round trip)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The live clock readout shows a diagnostic offset and running median with no per-note grade, verdict, colour or tally, plus AudioContext base/output latency"
    requirement: "CAPT-02"
    verification:
      - kind: unit
        ref: "grep -cwE 'grade|verdict|correct|incorrect' src/capture-app.js == 0"
        status: pass
    human_judgment: true
    rationale: "The absence of any grading vocabulary is proven statically, but whether the median genuinely settles near zero when the user deliberately plays on the click (D-10's actual purpose, and roadmap success criterion 2) can only be judged at the real piano -- deferred to the Plan 04 checkpoint."
  - id: D5
    description: "BPM is remembered per piece, defaults to 100, and can be changed mid-session without ending it or restarting the click"
    requirement: "CAPT-03"
    verification:
      - kind: unit
        ref: "test/metronome.test.cjs 'a BPM change between calls neither doubles nor drops the next click'"
        status: pass
      - kind: e2e
        ref: "scripts/check-capture-roundtrip.cjs asserts session.bpmAtStart === 120 after setting #bpm before Start"
        status: pass
    human_judgment: false

duration: 19min
completed: 2026-09-14
status: complete
---

# Phase 2 Plan 2: Click and Capture — Metronome, Click Timeline and Clock Readout Summary

**A Web Audio look-ahead click at a user-set BPM writes every beat to the session's click timeline with a live diagnostic readout of note-vs-click offset and a paired-sample clock calibration, proven end to end in real headless Chrome against rung 1's 5/4 time signature.**

## Performance

- **Duration:** ~19 min
- **Started:** 2026-09-14T03:12:00Z (approx)
- **Completed:** 2026-09-14T03:31:00Z
- **Tasks:** 2
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments

- `src/clock.js` grew from Task 1's `samplePair`/`toAudioContextTime`/`toPageTime` (pure paired-sample conversion) to also expose `offsetMs`, `nearestClick` (with a correct earlier-index tie-break), and `median` (odd/even/empty-safe, non-mutating) -- all `node:test`-able with zero browser globals (D-09, D-10).
- `src/metronome.js` implements `advance()`, the pure scheduling-math core that never schedules a click at or past its horizon (the CAPT-03 adjacency edge), cycles per-bar time signatures, and lets a BPM change apply from the next unscheduled interval without doubling or dropping a click; `create()` wraps it in a real Web Audio look-ahead scheduler (25ms poll, 100ms horizon, 1500/1000 Hz accent/click tone) that is exercised under `node:test`'s mock timers with a fake `AudioContext`.
- `src/capture-app.js` now creates/resumes the `AudioContext` synchronously inside the Start click handler (pitfall P2-3), starts `Metronome.create(...)`, writes every click straight to `Storage.appendClick`, samples the clock pair at Start/every 30s/Stop into `session.clockPairs`, stores `session.calibration = {medianOffsetMs, noteCount}` (D-11), remembers BPM per piece via the `bpm:<pieceId>` setting (default 100), and lets `#bpm`'s `change` event retune a running session without ending it (D-08/D-14).
- The live clock readout (`#readout`/`#readoutBody`) shows the last note's signed offset from the nearest click, the running median of the last 20 offsets, note count, and `AudioContext.baseLatency`/`outputLatency` in whole milliseconds -- confirmed by grep to carry no grading vocabulary anywhere in `capture-app.js` (D-10, CAPT-02).
- `scripts/check-capture-roundtrip.cjs` now sets BPM to 120 before Start, confirms `AudioContext.state` reaches `running` in headless Chrome, polls for at least 3 scheduled clicks (headless Chrome's audio clock runs at roughly 64% of wall-clock speed with no real output device -- a fixed sleep proved flaky), and after a full reload asserts the click timeline's bar/beat/accent numbering through rung 1's 5/4 signature, ~0.5s cadence, monotonic pageTime, and the session's `clockPairs`/`bpmAtStart`/`latency` fields.
- `test/clock.test.cjs` (12 cases) and `test/metronome.test.cjs` (8 cases) pin every formula and scheduling edge named in the plan's `<behavior>` block, bringing the suite to 62 passing `node:test` cases.

## Task Commits

Each task was committed atomically; Task 2 is TDD-flagged and produced a genuine RED/GREEN pair:

1. **Task 1: End-to-end "Start clicks at the BPM and every click lands in the timeline with a clock pair"** — `eceb313` (feat)
2. **Task 2 RED: failing pins for Clock.offsetMs/nearestClick/median and Metronome scheduling** — `6179e4e` (test)
3. **Task 2 GREEN: live clock readout, calibration, and 30s re-sampling** — `26781a1` (feat)

**Plan metadata:** committed alongside this SUMMARY.

_Note: no REFACTOR commit — nothing needed cleaning up after GREEN._

## Files Created/Modified

- `src/clock.js` — pure clock correlation: samplePair/toAudioContextTime/toPageTime/offsetMs/nearestClick/median
- `src/metronome.js` — pure advance() scheduling math plus create() Web Audio look-ahead scheduler
- `src/capture-app.js` — BPM input wiring, Start/Stop AudioContext lifecycle, click-timeline writes, live readout, calibration/re-sampling
- `index.html` — BPM input, clock readout markup, clock.js/metronome.js script tags
- `scripts/check-run-path.cjs` — extended EXPECTED_LOCAL_SCRIPTS and DOM marker gates for bpm/readout
- `scripts/check-capture-roundtrip.cjs` — extended to assert the click timeline and session clock fields; polls click count instead of a fixed sleep
- `test/clock.test.cjs` — 12 hand-typed pins for the clock conversion/diagnostic formulas
- `test/metronome.test.cjs` — 8 hand-typed pins for the scheduling math and the create() mock-timer smoke test

## Decisions Made

- Headless Chrome's `AudioContext.currentTime` does not track wall-clock time 1:1 with no real audio output device attached (measured advancing at roughly 64% of elapsed wall time over ~1s); the round-trip check now polls the actual recorded click count with a generous timeout instead of guessing a fixed sleep duration.
- Confirmed empirically (both in the `create()` mock-timer unit test and the real headless round trip) that because `FIRST_CLICK_DELAY_S` and `SCHEDULE_AHEAD_S` are both `0.1`, the very first click is never caught by the synchronous `tick()` call inside `start()` — it is always picked up on a later interval tick, exactly the "adjacency edge" the plan's must-haves call out, and this is correct behavior, not a bug.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed sleep(1600) in the round-trip check was flaky**
- **Found during:** Task 1, first run of `node scripts/check-capture-roundtrip.cjs` (before commit)
- **Issue:** The plan specified `sleep(1600)` before sending MIDI messages, assuming ~1.6s of real time would produce several clicks at 120 BPM (0.5s/click). A debug run showed headless Chrome's `AudioContext.currentTime` advancing at only ~64% of wall-clock speed, so a fixed sleep occasionally scheduled only 2 clicks instead of the required 3, failing the assertion non-deterministically.
- **Fix:** Replaced the fixed sleep with `pollClicks(ws, 3, 15000)`, which polls `CaptureApp.state.clicks.length` every 100ms up to a 15s timeout — deterministic regardless of how fast the headless audio clock happens to run on a given machine.
- **Files modified:** `scripts/check-capture-roundtrip.cjs`
- **Verification:** Ran the round-trip check three times consecutively after the fix; all three passed with exactly 3 clicks recorded.
- **Committed in:** `eceb313` (Task 1 commit)

**2. [Rule 1 - Bug] Floating-point-strict test assertion on `nearestClick`'s offsetMs**
- **Found during:** Task 2 GREEN phase, first run of `test/clock.test.cjs` after implementing `nearestClick`
- **Issue:** The RED-phase test asserted `deepEqual` against a literal `{index: 1, clickTime: 2.75, offsetMs: -10}`, but `(2.74 - 2.75) * 1000` evaluates to `-9.999999999999787` in IEEE 754 double arithmetic, not exactly `-10`.
- **Fix:** Split the assertion into `equal` checks for `index`/`clickTime` and an epsilon-tolerant `Math.abs(result.offsetMs - -10) < 1e-9` for the floating-point field, matching how every other offset assertion in the same file is already written.
- **Files modified:** `test/clock.test.cjs`
- **Verification:** `node --test test/clock.test.cjs test/metronome.test.cjs` — 20/20 pass, `# fail 0`
- **Committed in:** `26781a1` (Task 2 GREEN commit)

**3. [Rule 1 - Bug] Comment text tripped the plan's own no-grading-vocabulary gate**
- **Found during:** Task 2, running the plan's acceptance-criteria grep after implementation
- **Issue:** A code comment explaining that the readout is diagnostic used the words "verdict" and "grade" in a `never X` sentence, which the acceptance check `grep -cwE 'grade|verdict|correct|incorrect' src/capture-app.js` (correctly) cannot distinguish from actual grading logic — it printed 1 instead of the required 0.
- **Fix:** Reworded the comment to convey the same intent ("no per-note judgement of any kind") without using any of the four flagged words.
- **Files modified:** `src/capture-app.js`
- **Verification:** `grep -cwE 'grade|verdict|correct|incorrect' src/capture-app.js` prints `0`
- **Committed in:** `26781a1` (Task 2 GREEN commit)

---

**Total deviations:** 3 auto-fixed (3 Rule 1 bugs: one test-infrastructure flakiness fix, one floating-point test-precision fix, one comment wording fix)
**Impact on plan:** All three were necessary for the plan's own verification commands and acceptance criteria to pass reliably as specified; no scope creep, no design change from what the plan asked for.

## TDD Gate Compliance

Task 2 carries `tdd="true"` and this plan's config has `workflow.tdd_mode: false`, so the strict gate is not enforced as a hard blocker here, but the full RED/GREEN cycle was followed genuinely (unlike Plan 01's Task 2, where the implementation already existed):

- **RED was real and intentional (#3770-compliant):** `test/clock.test.cjs` and `test/metronome.test.cjs` were written and run before `Clock.offsetMs`/`nearestClick`/`median` existed. The run failed with 9 of 20 tests failing, every one a `TypeError: K.<fn> is not a function` on exactly the three not-yet-implemented functions — a target-behavior failure, not a fixture crash or unrelated failure. The 11 tests covering Task 1's already-implemented `samplePair`/`toAudioContextTime`/`toPageTime`/`advance`/`isValidBpm`/`create` passed unchanged, as expected since that code was already correct.
- **Commit `6179e4e`** (`test(02-02): ...`) captures this RED state.
- **GREEN was reached in one implementation pass:** adding `offsetMs`/`nearestClick`/`median` to `src/clock.js` (plus the readout/calibration wiring in `capture-app.js`) brought all 20 tests to green, after fixing one genuine floating-point-precision bug in the test itself (deviation 2 above).
- **Commit `26781a1`** (`feat(02-02): ...`) captures GREEN.
- **No REFACTOR commit** — nothing needed cleaning up after GREEN.

## Issues Encountered

None beyond the three auto-fixed deviations above, all resolved before their respective commit.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 03 (pass marking and segmentation) is unaffected by this plan's changes; it continues to read the same raw event stream Plan 01 established.
- Plan 04's phase-end piano checkpoint should specifically verify: the click is audible through the laptop's default output, the accent on beat 1 is audibly distinct, the tab stays drift-free with several minutes backgrounded (PITFALLS.md pitfall 8), and — the load-bearing one for roadmap success criterion 2 — playing single notes deliberately on the click shows the readout's median settling near 0 ms, confirming the MIDI-timestamp-to-AudioContext-time correlation is trustworthy before Phase 4 depends on it.
- No blockers for Plan 03.

## Self-Check: PASSED

- All key-files created exist on disk: `src/clock.js`, `src/metronome.js`, `test/clock.test.cjs`, `test/metronome.test.cjs`
- All three commits found in git log: `eceb313`, `6179e4e`, `26781a1`
- Re-ran all acceptance criteria and all plan-level `<verification>` commands on a clean pass after the final commit: `node --test test/clock.test.cjs test/metronome.test.cjs` -> 20/20 pass, `# fail 0`; `node scripts/check-capture-roundtrip.cjs` -> `OK capture round-trip: 8 raw events restored unmodified, 3 clicks in the timeline, piece restored from stored bytes`, exit 0 (repeated 3x, stable); `node scripts/check-run-path.cjs` -> 30 gates, 0 failed; `npm test` -> 62/62 pass, `# fail 0`

---
*Phase: 02-click-and-capture*
*Completed: 2026-09-14*
