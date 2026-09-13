---
phase: 01-score-on-screen
plan: 01
subsystem: notation-rendering
tags: [opensheetmusicdisplay, musicxml, jsdom, node-test, svg-mapping, devtools-protocol]

requires: []
provides:
  - "Score model schema v1 (persisted contract for Phase 2+): schemaVersion, title, measures[], notes[] with exact-rational onset/duration, structural ids, resolved ties"
  - "globalThis.ScoreModel: extract, walkNotes, toQuarterBeats, deriveNoteId, pitchOf, compareNotes, rational math helpers"
  - "globalThis.ScoreRenderer: file load/render, per-pitch noteId->SVG notehead map, self-verifying verifySvgMap(), debounced resize re-render, ?fixture= dev hook"
  - "globalThis.InspectTable: D-12 note table with per-row notehead fingerprint and N/N-mapped summary"
  - "test/osmd-node-env.cjs: descriptor-preserving jsdom global shim reusable by later fixture tests"
  - "scripts/check-run-path.cjs and scripts/check-svg-map.cjs: shell-neutral dev gates, the latter driving real headless Chrome over the DevTools protocol"
  - "Ladder rung 1 (fixtures/01-right-hand.musicxml) as both a node:test fixture and the first piano-verification file"
affects: ["01-02 (adds rungs 2-5 and exercises chords/ties/.mxl against this same model/map)", "01-03 (piano checkpoint verifies this rendering path)", "Phase 2 (MIDI capture/storage serializes this score model)", "Phase 3 (alignment paints through this noteId->SVG map)"]

actuals:
  tokens: 23600
  tasks: 2
  commits: 2
plan_head_before: f119ce98d05229130ee5d9cd8aac8beb4bd9c83e

tech-stack:
  added: ["opensheetmusicdisplay@2.1.2 (devDependency, pinned; CDN-loaded in the shipped app)", "jsdom@29.1.1 (devDependency, test-only)"]
  patterns:
    - "Classic-script globalThis IIFE modules (no ES-module syntax anywhere), matching prototype/piano-core.js, so the same file opens from file:// and is require()-able from node:test"
    - "One structural walk (walkNotes) produces both the plain score model and the id<->OSMD-note pairing the renderer's SVG map needs, so the two stay in lockstep by construction"
    - "Exact rational arithmetic ({num, den, beats}) for all onset/duration math; never OSMD's RealValue float accessor"
    - "defineProperty-based global shim with descriptor-preserving restore for jsdom-under-node:test, because Node 24's navigator is a getter-only accessor plain assignment cannot replace"
    - "Per-pitch notehead addressing via getNoteheadSVGs()[vfnoteIndex], never the shared VexFlow stave-note group from getSVGGElement()"

key-files:
  created:
    - package.json
    - package-lock.json
    - fixtures/01-right-hand.musicxml
    - src/score-model.js
    - src/inspect-table.js
    - src/score-renderer.js
    - test/osmd-node-env.cjs
    - test/score-model.test.cjs
    - scripts/check-run-path.cjs
    - scripts/check-svg-map.cjs
    - index.html
  modified:
    - README.md

key-decisions:
  - "Score model id format is m{measure}-s{staff}-v{voice}-b{onset.num}_{onset.den}-p{midi}, structural and reproducible across extractions, per D-09"
  - "Onset/duration stored as {num, den, beats} exact rationals reduced by gcd; beats is display-only, never compared"
  - "SVG map value is gNote.getNoteheadSVGs()[gNote.vfnoteIndex] (the note's own vf-notehead group), never getSVGGElement() (the shared stave-note group) -- closes the HIGH-severity chord-addressability finding from the cross-AI review"
  - "jsdom globals installed via Object.defineProperty with saved descriptors and a restore() that replays them exactly, including a nested install/restore round-trip test -- closes the MEDIUM-severity Node 24 navigator finding from the cross-AI review"
  - "verifySvgMap() checks completeness, duplicate targets, notehead-class, and chord y-order by MIDI via getBoundingClientRect().top -- developer evidence ahead of the piano, not just a count"
  - "scripts/check-svg-map.cjs drives real headless Chrome over the DevTools protocol before Wave 1 is declared done, per the review's MEDIUM suggestion to complete the browser tracer check now rather than defer it"
  - "All verification commands are node/npm invocations (no Bash-only syntax), addressing the review's PowerShell-environment concern; grep-based acceptance checks were run by the executor in Git Bash"

patterns-established:
  - "Score model extraction stays pure (no OSMD object reachable from the returned model); the renderer pairs ids with live OSMD notes via a hook, never a reverse lookup"
  - "Any file shared between the browser app and node:test is a classic script attaching to globalThis, never ES-module import/export"

requirements-completed: [SCORE-01, SCORE-03]

coverage:
  - id: D1
    description: "Score model extraction proven through the real OSMD 2.1.2 parser: exact note list, exact rationals, structural ids, MIDI/octave pins, JSON purity, tie-hook pairing, and a descriptor-preserving jsdom shim"
    requirement: "SCORE-03"
    verification:
      - kind: unit
        ref: "test/score-model.test.cjs (6 tests, node --test)"
        status: pass
    human_judgment: false
  - id: D2
    description: "index.html opens by double-click, loads OSMD from the pinned CDN, renders rung 1, and every model note maps to its own distinct notehead (proven in real headless Chrome including a forced resize re-render)"
    requirement: "SCORE-01"
    verification:
      - kind: automated_ui
        ref: "scripts/check-svg-map.cjs fixtures/01-right-hand.musicxml (real headless Chrome via DevTools protocol)"
        status: pass
    human_judgment: true
    rationale: "The headless check proves map completeness/distinctness/render-count programmatically, but actual visual notation correctness (right notes on the right staff, readable engraving) and the failed-load/recovery flow require eyes and hands at the piano per the project's VRFY-01 constraint; this is explicitly deferred to the phase-level piano checkpoint in plan 01-03 (workflow.human_verify_mode = end-of-phase)."
  - id: D3
    description: "No build step, bundler, server, or local ES-module import exists anywhere in the run path; every automated verify is a node/npm command"
    verification:
      - kind: other
        ref: "node scripts/check-run-path.cjs"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-13
status: complete
---

# Phase 1 Plan 1: Score on Screen — Model and Rendering Tracer Summary

**A pure score-model extraction proven through the real OpenSheetMusicDisplay 2.1.2 parser, plus a double-click index.html that renders rung 1 with every note mapped to its own notehead, verified end-to-end in real headless Chrome over the DevTools protocol.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-13T22:23:00Z (approx, session start)
- **Completed:** 2026-09-13T22:44:43Z
- **Tasks:** 2
- **Files modified:** 12 (11 created, 1 modified)

## Accomplishments

- `src/score-model.js` walks `osmd.Sheet` once (measure -> vertical container -> staff entry -> voice entry -> note) and emits a plain-data model: exact-rational onsets/durations, structural note ids, resolved ties (continuation notes fold into their start note's duration and `tiedNoteCount`), sorted canonically by measure/onset/staff/voice/pitch.
- `test/score-model.test.cjs` drives this model through the **real** OSMD 2.1.2 bundle (via `test/osmd-node-env.cjs`'s jsdom shim, never a hand-mock) and asserts the exact 5-note list for rung 1 (`C4 D4 E4 F4 G4`, onsets 0-4 beats, MIDI 60/62/64/65/67), JSON purity, id stability across repeated extractions, the `onNote` hook's id<->OSMD-note pairing, and the jsdom shim's install/restore round trip. 6/6 tests pass.
- `index.html` opens by double-click from `file://`, loads OSMD from the pinned jsDelivr CDN URL as a classic script, and renders rung 1 as real grand-staff notation.
- `src/score-renderer.js` builds a `noteId -> vf-notehead SVG element` map using `gNote.getNoteheadSVGs()[gNote.vfnoteIndex]` — each pitch's own notehead group, never the shared VexFlow stave-note group — and self-verifies it (`verifySvgMap()`: completeness, duplicate targets, notehead-class, chord y-order by MIDI via bounding-rect geometry).
- `src/inspect-table.js` renders the D-12 note table with a per-row notehead fingerprint (`<staveNoteId>#<index>`) and an "N of M noteheads mapped" summary that the status line echoes.
- `scripts/check-svg-map.cjs` drives real headless Chrome over the DevTools protocol (no browser test framework), loads rung 1 through a `?fixture=&resize=1` dev hook, forces a resize re-render, and asserts `5/5 noteheads mapped, map OK` with render count 2 — the browser tracer check the cross-AI review asked to complete inside Wave 1, not defer.
- `scripts/check-run-path.cjs` is a single Node script (not a Bash/grep chain) asserting the file:// run path: no `type="module"` scripts, exactly one pinned CDN URL, the three local scripts in dependency order, and no ES-module syntax in any `src/` file.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "rung 1 file to plain score model"** — `6966737` (feat)
2. **Task 2: Double-click index.html, render rung 1, prove the notehead map in headless Chrome** — `a1b6fb6` (feat)

**Plan metadata:** committed alongside this SUMMARY.

## Files Created/Modified

- `package.json` / `package-lock.json` — dev-only manifest, `opensheetmusicdisplay@2.1.2` and `jsdom@29.1.1` pinned; `test`, `check`, `check:map` npm scripts
- `fixtures/01-right-hand.musicxml` — ladder rung 1: right hand C D E F G, grand staff, one 5/4 bar
- `src/score-model.js` — pure OSMD-sheet-to-plain-data extraction (`extract`, `walkNotes`, `toQuarterBeats`, `deriveNoteId`, `pitchOf`, `compareNotes`, exact rational helpers)
- `test/osmd-node-env.cjs` — `defineProperty`-based jsdom global shim with descriptor-preserving `restore()`
- `test/score-model.test.cjs` — 6 node:test cases against the real OSMD parser
- `index.html` — double-click entry point, classic scripts, OSMD from the pinned CDN URL
- `src/inspect-table.js` — D-12 note table renderer
- `src/score-renderer.js` — file load, render, per-notehead SVG map, self-check, resize handling, dev hook
- `scripts/check-run-path.cjs` — shell-neutral static run-path gates
- `scripts/check-svg-map.cjs` — headless-Chrome DevTools-protocol map verification
- `README.md` — added Run, Test, Developer checks, Verification ladder sections

## Decisions Made

- Notehead map value is `gNote.getNoteheadSVGs()[gNote.vfnoteIndex]`, never `getSVGGElement()` — this closes the cross-AI review's HIGH-severity finding that chord notes could otherwise share one mapped element.
- jsdom globals are installed with `Object.defineProperty` (recording and restoring exact prior descriptors), never plain assignment — closes the review's MEDIUM-severity finding that Node 24's `navigator` is a getter-only accessor.
- All verification commands in this plan are `node`/`npm` invocations, not Bash-only syntax, per the review's environment concern; grep-based acceptance checks were executed by this executor in Git Bash.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `scripts/check-svg-map.cjs`'s `Runtime.evaluate` polling hung indefinitely on Node's global `WebSocket`**
- **Found during:** Task 2, first run of `node scripts/check-svg-map.cjs fixtures/01-right-hand.musicxml` (before the file was committed)
- **Issue:** Node's built-in `WebSocket` fires WHATWG-style `MessageEvent`s — the JSON payload is on `event.data`, not the event object itself. The first draft's `evaluate()` helper treated the callback parameter as the raw payload (`data.toString()`), so `JSON.parse` silently threw on every incoming message (caught and ignored), the response was never matched to its request id, and the poll loop never observed `check: 'done'`. This hung the script indefinitely — confirmed by isolating the DevTools-listening handshake (fast, correct) from the `Runtime.evaluate` round trip (never resolved) in a scratch reproduction, then fixing the handler to read `event.data`.
- **Fix:** Changed the `onMessage` handler in `evaluate()` to parse `event.data.toString()` instead of `data.toString()`.
- **Files modified:** `scripts/check-svg-map.cjs` (fixed before the file was ever committed, so the committed version is already correct)
- **Verification:** `node scripts/check-svg-map.cjs fixtures/01-right-hand.musicxml` now returns in a few seconds with `OK fixtures/01-right-hand.musicxml: 01-right-hand.musicxml: 1 bars, 5 notes, 5/5 noteheads mapped, map OK`, exit 0
- **Committed in:** `a1b6fb6` (Task 2 commit)

**2. [Rule 1 - Bug] `checkFixture()`'s cleanup could crash with `EPERM` on Windows**
- **Found during:** Task 2, same debugging session
- **Issue:** `fs.rmSync(profileDir, ...)` was called immediately after `child.kill()`; Chrome can hold the profile directory's files locked for a moment after being signalled on Windows, throwing `EPERM` and crashing the whole check run before it could report a verdict.
- **Fix:** Added a 500ms wait after `child.kill()` before `rmSync`, and wrapped the removal in try/catch (profile-dir cleanup is best-effort; the OS temp directory reclaims it eventually either way).
- **Files modified:** `scripts/check-svg-map.cjs`
- **Verification:** Repeated runs of `node scripts/check-svg-map.cjs fixtures/01-right-hand.musicxml` complete cleanly with exit 0, no `EPERM` thrown
- **Committed in:** `a1b6fb6` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1, both in the new headless-Chrome developer tool, both fixed before the file was ever committed)
**Impact on plan:** Both fixes were necessary for `scripts/check-svg-map.cjs` to function at all on this Windows machine; no scope creep, no change to the plan's design. Worth flagging for Plan 02/03, which reuse this script against the remaining four ladder fixtures.

## Facts Pinned by Planning-Time Probes: What Held, What Was New

Every fact pinned in the plan's frontmatter held exactly as stated once exercised:

- `OCTAVE_XML_DIFFERENCE = 3` matches `opensheetmusicdisplay.Pitch.OctaveXmlDifference` (asserted directly in test 3).
- `MIDI_OFFSET = 12` (`halfTone + 12`) gives middle C = 60 (asserted in tests 1 and 3).
- `GetExpandedNumerator() * 4 / Denominator`, reduced by gcd, produced the exact expected rationals for every quarter note and the whole 5/4 measure — no float drift.
- `gNote.getNoteheadSVGs()[gNote.vfnoteIndex]` returned a distinct, connected `vf-notehead` element for every one of rung 1's 5 notes; observed fingerprints in the real render: `auto1006#0`, `auto1011#0`, `auto1015#0`, `auto1019#0`, `auto1023#0` (rung 1 has no chords, so every `vfnoteIndex` is 0 — the chord-index and y-order paths are implemented per the pinned addressing facts and `verifySvgMap()`'s logic, but are not exercised by any note in this rung; rung 4 in Plan 02 is the first fixture with an actual chord).
- Node 24's `navigator` is confirmed a getter-only accessor (`{ get, set: undefined, configurable: true }`); the `defineProperty`-based shim and its nested install/restore round trip both passed on the first run.
- Headless Chrome's `--headless=new --remote-debugging-port=0` DevTools-listening line, the `/json/list` HTTP endpoint, and `Runtime.evaluate` all worked exactly as pinned — the only surprise was in this executor's own first-draft client code (see Deviation 1 above), not in Chrome's behavior.

**The exact `check-svg-map.cjs` output line for rung 1:**
```
OK fixtures/01-right-hand.musicxml: 01-right-hand.musicxml: 1 bars, 5 notes, 5/5 noteheads mapped, map OK
```
(render count 2: initial render + forced resize re-render, both counted by the script's pass condition).

## Issues Encountered

None beyond the two auto-fixed deviations above, both resolved before commit.

## User Setup Required

None — no external service configuration required. Internet access is needed only for the one-time jsDelivr CDN fetch of the pinned OSMD bundle (cached by Chrome afterward), which was already available in this environment.

## Next Phase Readiness

- The score model schema (v1) and the `noteId -> SVG notehead` map are both proven on rung 1 and ready for Plan 02 to exercise against rungs 2-5 (left hand, both hands, chords, ties, `.mxl`, and the four-bar Yanni excerpt).
- The chord y-order and duplicate-target checks in `verifySvgMap()` are implemented but not yet exercised by a real chord — Plan 02's rung 4 is the first fixture that will actually drive that code path.
- The at-the-piano human verification (visual notation correctness, resize behavior across all rungs, failed-load recovery) is intentionally deferred to Plan 03's blocking checkpoint, per `workflow.human_verify_mode = end-of-phase` and the project's VRFY-01 constraint.
- No blockers for Plan 02.

## Self-Check: PASSED

- All key-files created exist on disk: `package.json`, `package-lock.json`, `fixtures/01-right-hand.musicxml`, `src/score-model.js`, `src/inspect-table.js`, `src/score-renderer.js`, `test/osmd-node-env.cjs`, `test/score-model.test.cjs`, `scripts/check-run-path.cjs`, `scripts/check-svg-map.cjs`, `index.html`, `README.md`
- Both task commits found in git log: `6966737`, `a1b6fb6`
- Re-ran all acceptance criteria and all three plan-level `<verification>` commands on a clean pass after commit: `node --test "test/*.test.cjs"` -> 6/6 pass; `node scripts/check-run-path.cjs` -> 13 gates, 0 failed; `node scripts/check-svg-map.cjs fixtures/01-right-hand.musicxml` -> `OK ... 5/5 noteheads mapped, map OK`, exit 0

---
*Phase: 01-score-on-screen*
*Completed: 2026-09-13*
