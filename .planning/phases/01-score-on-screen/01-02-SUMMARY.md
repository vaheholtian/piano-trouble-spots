---
phase: 01-score-on-screen
plan: 02
subsystem: notation-rendering
tags: [opensheetmusicdisplay, musicxml, mxl, node-test, ties, fixtures]

requires:
  - phase: 01-01
    provides: "Score model schema v1, ScoreModel.extract/walkNotes/toQuarterBeats, the noteId->SVG map, jsdom test harness, check-svg-map.cjs"
provides:
  - "Ladder rungs 2-5 as committed fixtures (fixtures/02-left-hand.xml, 03-both-hands.musicxml, 04-chords.musicxml, 05-yanni-4-measures.musicxml + .mxl), each with an exact-row node:test asserting bar/onset/staff/voice/pitch/MIDI/duration"
  - "scripts/build-rung5.cjs: reproducible MuseScore-CLI export of the user's file into a temp dir, trim fallback, .mxl export, validation, then atomic replace of both fixtures"
  - "test/fixtures/tie.musicxml and the tie-resolution contract tests (pairs and a three-segment chain)"
  - "Contract-pinning tests: rational exactness (12/8 -> 6/1), canonical ordering, bar-boundary, empty input, duplicate-id rejection, DOM-free extraction"
affects: ["01-03 (piano checkpoint verifies all five rungs including chords and the four real bars)", "Phase 2 (persists this exact score model shape)", "Phase 3 (alignment is judged against these fixtures)"]

actuals:
  tokens: 14000
  tasks: 3
  commits: 3
plan_head_before: 51d67afe913adef44c447f6bf4b255078d209f41

tech-stack:
  added: []
  patterns:
    - "rowsOf(model) test helper: maps model.notes to [measure, onset, staff, voice, pitch, midi, duration] tuples for exact deepEqual against hand-typed expected arrays, never derived from a prior extractor run"
    - "Fixture regeneration (scripts/build-rung5.cjs) always writes to a temp dir first, validates counts and the .mxl zip signature there, and only then copies into fixtures/ — a failed run never leaves fixtures/ half-refreshed"

key-files:
  created:
    - fixtures/02-left-hand.xml
    - fixtures/03-both-hands.musicxml
    - fixtures/04-chords.musicxml
    - fixtures/05-yanni-4-measures.musicxml
    - fixtures/05-yanni-4-measures.mxl
    - scripts/build-rung5.cjs
    - test/fixtures/tie.musicxml
  modified:
    - test/score-model.test.cjs

key-decisions:
  - "Rung 2 is stored as .xml (not .musicxml) so the ladder itself exercises SCORE-01's third promised extension with no duplicate fixture (review finding 7)"
  - "scripts/build-rung5.cjs exports into fs.mkdtempSync, validates 4 measures/41 pitches/PK signature there, then copies both fixtures into place together — a validation failure leaves fixtures/ untouched and the temp dir available for inspection (review finding 5)"
  - "test/fixtures/tie.musicxml's bar 4 carries a genuine MuseScore-order stop-before-start middle note (<tie type=\"stop\"/><tie type=\"start\"/>) so the three-segment chain test exercises the real continuation-joins-open-tie behavior, not just two two-note ties (review finding 4)"
  - "The user had already deleted MuseScore bars 5-43 before this plan ran, so scripts/build-rung5.cjs's trim fallback did not trigger this run (see 'Rung 5 Build' below) — the fallback code path is still exercised by the trim-regex logic and remains available if bars are ever re-added"

patterns-established:
  - "Never paste extractor output into a test expectation — every EXPECTED_RUNG_N/EXPECTED_TIE array in test/score-model.test.cjs was hand-typed from the plan's 'Expected rows' table before any test was run"

requirements-completed: [SCORE-01, SCORE-03]

coverage:
  - id: D1
    description: "Ladder rungs 2-4 (hand-authored: left hand, both hands, two chords) each match an exact hand-typed note list through the real OSMD parser, including chord adjacency (equal onsets stay distinct) and canonical staff ordering"
    requirement: "SCORE-03"
    verification:
      - kind: unit
        ref: "test/score-model.test.cjs (rung 2/3/4 tests, node --test)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Rung 4's chord noteheads and rung 5's two-note chords map to distinct, correctly y-ordered SVG noteheads in real headless Chrome, before and after a forced resize"
    requirement: "SCORE-01"
    verification:
      - kind: automated_ui
        ref: "node scripts/check-svg-map.cjs (all six fixtures, real headless Chrome via DevTools protocol)"
        status: pass
    human_judgment: true
    rationale: "The headless check proves map completeness/distinctness/chord-order programmatically, but actual visual notation correctness at the piano (right notes on the right staff for all five rungs, readable engraving) is explicitly deferred to the phase-level piano checkpoint in plan 01-03 per workflow.human_verify_mode = end-of-phase."
  - id: D3
    description: "Rung 5 (the user's four real bars) is reproducibly built from the .mscz source via scripts/build-rung5.cjs, validated in a temp dir before replacing fixtures/, and its 41-row/41-id note list matches the .musicxml and .mxl forms identically"
    requirement: "SCORE-01"
    verification:
      - kind: unit
        ref: "test/score-model.test.cjs (rung 5 exact-list, determinism, .mxl-equivalence tests)"
        status: pass
      - kind: automated_ui
        ref: "node scripts/check-svg-map.cjs fixtures/05-yanni-4-measures.musicxml fixtures/05-yanni-4-measures.mxl"
        status: pass
      - kind: other
        ref: "node scripts/build-rung5.cjs (exit 0, validated counts, ran twice with identical measure/pitch counts)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Tie resolution (a within-bar pair, a cross-barline pair, and a three-segment chain with a genuine stop+start middle note) folds correctly into tiedNoteCount and combined duration; rational exactness (12/8 -> 6/1, never 3/2), canonical ordering, bar-boundary, empty-input, duplicate-id rejection, and DOM-free extraction are all pinned"
    requirement: "SCORE-03"
    verification:
      - kind: unit
        ref: "test/score-model.test.cjs (tie, three-segment chain, toQuarterBeats, rest-only, duplicate-id, no-DOM-dependency, TieTypes-absent tests)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-13
status: complete
---

# Phase 1 Plan 2: Score on Screen — Full Verification Ladder and Contract Tests Summary

**All five ladder rungs (left hand, both hands, two chords, and the user's four real Yanni bars in both .musicxml and .mxl form) now have exact-row node:test fixtures against the real OSMD 2.1.2 parser, plus tie-chain, rational-exactness, and DOM-free contract tests — 21/21 green, six-of-six headless-Chrome notehead maps OK.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-13T22:50:00Z (approx)
- **Completed:** 2026-09-13T22:59:55Z
- **Tasks:** 3
- **Files modified:** 8 (7 created, 1 modified)

## Accomplishments

- `fixtures/02-left-hand.xml` (rung 2, the `.xml` extension case), `fixtures/03-both-hands.musicxml` (rung 3), and `fixtures/04-chords.musicxml` (rung 4, two right-hand triads over two bass half notes) — hand-authored, minimal, sharing rung 1's grand-staff skeleton (divisions 2, staff 1 voice 1, staff 2 voice 5).
- `test/score-model.test.cjs` gained a `rowsOf(model)` helper and exact-row tests for rungs 2-4: chord adjacency is asserted directly (the three notes of rung 4's first chord share onset `0/1` but have three distinct ids `...-p60`, `...-p64`, `...-p67`), and canonical staff ordering is asserted for rung 3 (staff 1 before staff 2 at an equal onset).
- `scripts/build-rung5.cjs`: exports the user's `Yanni - 4 measures.mscz` with the MuseScore 4 CLI into `fs.mkdtempSync`, trims trailing empty measures if needed (fallback, did not trigger this run — see "Rung 5 Build" below), exports the compressed `.mxl` from the trimmed `.musicxml`, validates (4 measures, 41 pitches, `PK` zip signature) in the temp dir, and only then `copyFileSync`s both fixtures into place. A validation failure exits 1 and leaves `fixtures/` untouched.
- `fixtures/05-yanni-4-measures.musicxml` and `.mxl`: 4 real bars, 41 notes, produced by the script above. The 41-row table from the plan (typed by hand at planning time from inspecting the `.mscz`) matched the actual MuseScore export exactly on every row — no mismatch, no investigation needed.
- Tests for rung 5: the exact 41-row/41-id list, `model.measures` (4 entries, starts `0/1 3/1 6/1 9/1`, length `3/1` each, time signature `{beats:3, beatType:4}`), determinism (extracted twice, `deepEqual`), a bar-boundary check across all five rungs (`onset + duration <= measure.length` for every note), and `.mxl`-vs-`.musicxml` model equivalence via the real binary `File` handoff (`new File([bytes], name)` into `osmd.load`).
- `test/fixtures/tie.musicxml`: a within-bar tied pair (C4, bar 1), a pair crossing a barline (E4/G4, bars 2-3), and — addressing the cross-AI review's concern that two two-note ties don't establish general tie resolution — a genuine three-segment chain in bars 4-5 (A4 start, then a middle note carrying `<tie type="stop"/><tie type="start"/>` in MuseScore's own stop-before-start order, then a final stop) that folds into one onset, duration `8/1`, `tiedNoteCount: 3`, with no model note in bar 5.
- Contract tests added: `toQuarterBeats` pinned exact for whole/half/quarter/eighth/dotted-quarter/dotted-eighth, and for MuseScore's unreduced whole-note `12/8` fraction, which correctly reduces to `6/1` quarter beats (the front-matter/test contradiction the review flagged — `6/1` is the only correct value, since 12/8 of a whole note is 1.5 whole notes = 6 quarter beats); `addRationals`/`compareRationals` asserted never to use floats; a rest-only file yields `notes: []` with its measure still listed; a chord repeating a pitch throws `Duplicate note id m1-s1-v1-b0_1-p60` instead of silently merging; `extract()` runs correctly with `document`/`window`/`navigator` deleted from `globalThis` (proving no DOM dependency), restored afterward via saved property descriptors; `TieTypes` confirmed absent from `src/score-model.js`.
- `node scripts/check-svg-map.cjs` (no arguments, scanning all fixtures) prints all six expected `OK` lines — see below.

## Task Commits

Each task was committed atomically:

1. **Task 1: Ladder rungs 2, 3, 4 with exact note-list tests and rung 4's chord noteheads proven distinct** — `ca5674c` (feat)
2. **Task 2: Rung 5 built from the user's MuseScore file (uncompressed and .mxl)** — `8df636d` (feat)
3. **Task 3: Tie fixture and score-model contract tests** — `5d82bca` (test)

**Plan metadata:** committed alongside this SUMMARY.

## Rung 5 Build

`scripts/build-rung5.cjs`'s trim fallback (D-06) **did not trigger** this run: at plan-01 (context-gathering) time the source `.mscz` had 43 measures (39 trailing empty), but by the time this plan ran, the user had already deleted bars 5-43 in MuseScore and saved — the script printed `No trailing empty measures; source already trimmed.` The trim-regex logic itself is unchanged and still exercised at the code level; it will activate again automatically if empty trailing bars are ever reintroduced. No action needed from the user.

One incidental observation: re-running `build-rung5.cjs` a second time (to confirm reproducibility, per the plan's verification section) produced a byte-identical `.musicxml` but a `.mxl` that differed by a few internal bytes at the same total size (2589 bytes both times) — almost certainly a zip-internal timestamp MuseScore embeds on export, not a content difference (the model extracted from both `.mxl` exports is identical, and the diff was discarded before committing, leaving the originally-validated `.mxl` as the committed fixture). This does not affect any test or the map check, both of which passed identically on the re-export.

## The Six `check-svg-map.cjs` OK Lines

```
OK fixtures/01-right-hand.musicxml: 01-right-hand.musicxml: 1 bars, 5 notes, 5/5 noteheads mapped, map OK
OK fixtures/02-left-hand.xml: 02-left-hand.xml: 1 bars, 5 notes, 5/5 noteheads mapped, map OK
OK fixtures/03-both-hands.musicxml: 03-both-hands.musicxml: 1 bars, 10 notes, 10/10 noteheads mapped, map OK
OK fixtures/04-chords.musicxml: 04-chords.musicxml: 1 bars, 8 notes, 8/8 noteheads mapped, map OK
OK fixtures/05-yanni-4-measures.musicxml: 05-yanni-4-measures.musicxml: 4 bars, 41 notes, 41/41 noteheads mapped, map OK
OK fixtures/05-yanni-4-measures.mxl: 05-yanni-4-measures.mxl: 4 bars, 41 notes, 41/41 noteheads mapped, map OK
```

No fix to `src/score-renderer.js` was needed — rung 4's chord addressability (the HIGH-severity finding from the 01-01 cross-AI review) was already closed by plan 01-01's `getNoteheadSVGs()[vfnoteIndex]` implementation, and this plan's rung 4/5 chords are the first real exercise of that code path. It held on the first run.

## Files Created/Modified

- `fixtures/02-left-hand.xml` — ladder rung 2: left hand C D E F G, one 5/4 bar, `.xml` extension
- `fixtures/03-both-hands.musicxml` — ladder rung 3: both hands together, one 5/4 bar
- `fixtures/04-chords.musicxml` — ladder rung 4: two right-hand triads over two bass half notes, one 4/4 bar
- `fixtures/05-yanni-4-measures.musicxml` / `.mxl` — ladder rung 5: the user's four real bars, produced by the build script
- `scripts/build-rung5.cjs` — reproducible rung 5 build: MuseScore CLI export to a temp dir, trim fallback, `.mxl` export, validation, atomic fixture replace
- `test/fixtures/tie.musicxml` — synthetic tie fixture: within-bar pair, cross-barline pair, three-segment chain
- `test/score-model.test.cjs` — added `rowsOf` helper and 15 new tests (9 -> 21 total): rungs 2-5, `.mxl` equivalence, rung 1 File-vs-text equivalence, tie resolution, rational exactness, ordering/boundary, empty input, duplicate-id rejection, DOM-free extraction

## Decisions Made

- Rung 2 stored as `.xml` (not `.musicxml`) so the ladder itself covers SCORE-01's third promised extension with no duplicate fixture.
- `scripts/build-rung5.cjs` validates in a temp directory before ever touching `fixtures/`, so a failed or mismatched export can never leave the committed fixtures half-refreshed.
- The tie fixture's bar 4 uses MuseScore's real stop-before-start note order for the three-segment chain's middle note, exercising the actual "continuation joins the open Tie" behavior rather than a simplified two-note case.
- No changes to `src/score-model.js` or `src/score-renderer.js` were needed this plan — all 21 tests and all six map checks passed against the implementation from plan 01-01 on the first run.

## Deviations from Plan

None - plan executed exactly as written. The plan anticipated needing to investigate a mismatch between the planning-time rung 5 table and the actual MuseScore export; no mismatch occurred (the table matched exactly, row for row), and the plan anticipated the trim fallback might not be needed if the user had already trimmed the source, which is exactly what happened.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. MuseScore 4 (already installed at `C:\Program Files\MuseScore 4\bin\MuseScore4.exe`) and the source file (`C:\Users\vaheh\OneDrive\Documents\MuseScore4\Scores\Yanni - 4 measures.mscz`, already trimmed to 4 measures) were both present and used as-is.

## Next Phase Readiness

- All five ladder rungs and their `.mxl` variant exist as committed fixtures with exact-row tests and headless-Chrome map proof; the score model contract (measure/staff/voice/onset/duration/pitch/tie/ordering/precision/empty/duplicate-id) is now fully pinned by 21 green tests ahead of Phase 2 persisting this shape.
- Plan 01-03's at-the-piano checkpoint can now exercise all five rungs, including real chords and the user's own four bars in both file formats.
- No blockers for 01-03.

## Self-Check: PASSED

- All key-files created exist on disk: `fixtures/02-left-hand.xml`, `fixtures/03-both-hands.musicxml`, `fixtures/04-chords.musicxml`, `fixtures/05-yanni-4-measures.musicxml`, `fixtures/05-yanni-4-measures.mxl`, `scripts/build-rung5.cjs`, `test/fixtures/tie.musicxml`
- All three task commits found in git log: `ca5674c`, `8df636d`, `5d82bca`
- Re-ran all acceptance criteria and all plan-level `<verification>` commands on a clean pass after the final commit: `node --test test/score-model.test.cjs` -> 21/21 pass; `node scripts/build-rung5.cjs` -> exit 0, validated 4 measures/41 pitches/PK, reproducible on a second run; `node scripts/check-svg-map.cjs` (no args) -> all six `OK` lines exactly as specified; `git ls-files fixtures test/fixtures` -> all seven files tracked

---
*Phase: 01-score-on-screen*
*Completed: 2026-09-13*
