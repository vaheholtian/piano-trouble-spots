---
phase: 01-score-on-screen
plan: 03
subsystem: notation-rendering
tags: [opensheetmusicdisplay, musicxml, mxl, node-test, verification, at-the-piano]

requires:
  - phase: 01-01
    provides: "Score model schema v1, noteId->SVG map, jsdom test harness, check-svg-map.cjs"
  - phase: 01-02
    provides: "Ladder rungs 2-5 as committed fixtures (including .xml and .mxl forms), tie-chain and contract tests, 21/21 green"
provides:
  - "fixtures/README.md — the human-readable ladder manifest used at the piano"
  - "Confirmation that all automated gates (npm test, check-run-path.cjs --fixtures, check-svg-map.cjs) are green from plain node/npm commands"
  - "The user's at-the-piano approval of all five ladder rungs, the two .mxl files, a real MuseScore export, and invalid-file recovery — closing Phase 1's blocking-human checkpoint"
affects: ["Phase 2 (builds capture/metronome on top of this proven notation slice)", "Phase 3 (alignment is judged against these same fixtures)"]

actuals:
  tokens: 1200
  tasks: 2
  commits: 1
plan_head_before: 0e552cc804c9385fd21599d9d52e9829480ce623

tech-stack:
  added: []
  patterns:
    - "fixtures/README.md as the single human-facing manifest: per-rung file/time-signature/bar-by-bar contents, the exact expected status line, and a plain-language explanation of the Notehead fingerprint (group#chord-index) so a repeated fingerprint or MISSING row reads as a defect, never explained away"

key-files:
  created:
    - fixtures/README.md
  modified: []

key-decisions:
  - "The phase gate re-ran npm test, check-run-path.cjs --fixtures, and check-svg-map.cjs one more time immediately before the checkpoint rather than trusting the 01-02 evidence alone, so the piano session started from freshly-verified green gates"
  - "The manifest documents resize-on-every-rung and the invalid-file recovery as explicit steps, not just rung 5, closing the review finding that resize/invalid-file coverage was previously implied rather than required"

patterns-established: []

requirements-completed: [SCORE-01, SCORE-03]

coverage:
  - id: D1
    description: "npm test, check-run-path.cjs --fixtures, and check-svg-map.cjs all pass from plain node/npm commands with no shell-specific syntax"
    requirement: "SCORE-03"
    verification:
      - kind: unit
        ref: "npm test (21/21 pass)"
        status: pass
      - kind: other
        ref: "node scripts/check-run-path.cjs --fixtures (0 failed)"
        status: pass
      - kind: automated_ui
        ref: "node scripts/check-svg-map.cjs (six OK lines, all N/N mapped, map OK)"
        status: pass
    human_judgment: false
  - id: D2
    description: "fixtures/README.md gives the user an exact, checkable manifest of what each ladder rung must look like and how to read the Notehead fingerprint"
    requirement: "SCORE-01"
    verification:
      - kind: other
        ref: "fixtures/README.md (committed 04e728d); acceptance-criteria grep checks in the plan"
        status: pass
    human_judgment: false
  - id: D3
    description: "User sat at the FP-60X and confirmed all five ladder rungs render correctly, map OK with distinct chord fingerprints, survive a resize on every rung, both .mxl files render, a real MuseScore export renders without an error toast, and an invalid file is rejected with the app recovering"
    requirement: "SCORE-01"
    verification: []
    human_judgment: true
    rationale: "This is the phase's blocking-human at-the-piano checkpoint (VRFY-01) — visual notation correctness, audible correctness on a real piano, and UI recovery behavior cannot be established by automated tests alone; the user's verbatim approval is the only valid evidence."

duration: 10min
completed: 2026-09-13
status: complete
---

# Phase 1 Plan 3: Score on Screen — Phase Gate and At-the-Piano Verification Summary

**All automated gates re-confirmed green (21/21 tests, all node/npm run-path and headless-Chrome map checks), fixtures/README.md manifest written and committed, and the user approved every item of the at-the-piano checkpoint — closing Phase 1's blocking-human verification requirement.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-09-13T23:00:00Z (approx)
- **Completed:** 2026-09-13T23:10:00Z (approx)
- **Tasks:** 2 (1 auto, 1 checkpoint:human-verify)
- **Files modified:** 1 (fixtures/README.md, created)

## Accomplishments

- `fixtures/README.md`: one section per ladder rung (file name, time signature, bar-by-bar treble/bass contents in words, the exact expected status line, and a note on rebuilding rung 5 via `node scripts/build-rung5.cjs`), a "Reading the Notehead column" paragraph explaining the `group#chord-index` fingerprint format, and a "How to check at the piano" list covering every rung, the resize check on every rung (not just one), the two `.mxl` files, and the invalid-file recovery check.
- Re-ran the full phase gate immediately before the checkpoint: `npm test` (21 pass / 0 fail), `node scripts/check-run-path.cjs --fixtures` (all run-path gates plus all seven fixtures and `fixtures/README.md` tracked, 0 failed), and `node scripts/check-svg-map.cjs` with no arguments (six OK lines, every file N/N mapped, `map OK`) — all three are plain node/npm invocations, behaving identically from PowerShell, cmd, and Git Bash.
- At-the-piano checkpoint (Task 2, `gate="blocking-human"`) presented to the user; the user's verbatim response was **"Approved"**, confirming: all five rungs rendered the right notes on the right staff with the right rhythm and time signature; every status line matched the manifest exactly (5/5, 5/5, 10/10, 8/8, 41/41 noteheads mapped, `map OK`, no `MISSING` rows); rung 4's and rung 5's chords showed distinct `#0`/`#1`/`#2` fingerprints per chord with no two rows sharing a fingerprint; every rung survived a window resize (status line and table unchanged); `fixtures/05-yanni-4-measures.mxl` rendered the same 41/41 `map OK`; a real MuseScore export (`Yanni - Reflections of Passion-Piano.mxl`) rendered without an error toast; and a non-MusicXML file was rejected with a recovery (toast, cleared view, rung 1 reopened successfully afterward).

## Task Commits

Each task was committed atomically:

1. **Task 1: Phase gate — full suite, run-path/fixture gates, headless map check, ladder manifest** — `04e728d` (docs)
2. **Task 2: At-the-piano checkpoint** — `checkpoint:human-verify`, no code changes; user responded "Approved" (no commit — verification-only task)

**Plan metadata:** committed alongside this SUMMARY.

## The Six `check-svg-map.cjs` OK Lines (re-confirmed at the phase gate)

```
OK fixtures/01-right-hand.musicxml: 01-right-hand.musicxml: 1 bars, 5 notes, 5/5 noteheads mapped, map OK
OK fixtures/02-left-hand.xml: 02-left-hand.xml: 1 bars, 5 notes, 5/5 noteheads mapped, map OK
OK fixtures/03-both-hands.musicxml: 03-both-hands.musicxml: 1 bars, 10 notes, 10/10 noteheads mapped, map OK
OK fixtures/04-chords.musicxml: 04-chords.musicxml: 1 bars, 8 notes, 8/8 noteheads mapped, map OK
OK fixtures/05-yanni-4-measures.musicxml: 05-yanni-4-measures.musicxml: 4 bars, 41 notes, 41/41 noteheads mapped, map OK
OK fixtures/05-yanni-4-measures.mxl: 05-yanni-4-measures.mxl: 4 bars, 41 notes, 41/41 noteheads mapped, map OK
```

## At-the-Piano Checkpoint — User's Verbatim Response

> "Approved"

Per the checkpoint's resume-signal contract, "approved" (case-insensitive) is only valid when every one of the following held, which the user confirmed by responding with the unqualified approval word rather than listing any rung/step mismatch:

- Rungs 1-5: steps 2a (right notes, right staff, right rhythm/time signature), 2b (exact status line text, 5/5, 5/5, 10/10, 8/8, 41/41, `map OK`, no `MISSING`), 2c (table rows match the sheet; chord fingerprints distinct with correct `#0/#1/#2` ordering), and 2d (resize to half width and back, status line and table unchanged) — on every rung, not just rung 5.
- Step 3: `fixtures/05-yanni-4-measures.mxl` rendered the same notation as rung 5, 41/41, `map OK`.
- Step 4: the real MuseScore export (`Yanni - Reflections of Passion-Piano.mxl`) rendered without an error toast.
- Step 5: a non-MusicXML file produced the red toast "Could not open ...", cleared the notation and table, showed "No piece loaded", and rung 1 opened successfully afterward.

## Files Created/Modified

- `fixtures/README.md` — the ladder manifest for the at-the-piano check: per-rung file/time-signature/bar contents, expected status lines, Notehead fingerprint explanation, and the piano checklist (resize on every rung, both `.mxl` files, invalid-file recovery)

## Decisions Made

- Re-ran all three automated gates fresh immediately before the checkpoint rather than relying solely on 01-02's evidence, so the piano session started from a gate state verified in this plan's own run.
- The manifest and checkpoint both treat resize-on-every-rung and invalid-file recovery as required parts of "approved," not optional extras, closing a review finding from the 01-03 plan review.

## Deviations from Plan

None - plan executed exactly as written. Both the automated phase gate and the at-the-piano checkpoint passed on the first attempt with no auto-fixes needed.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 1 success criteria 1-4 are all satisfied: the five ladder files render as real notation in Chrome from `.musicxml`, `.xml`, and `.mxl`; every note is modelled, inspectable, and mapped to its own notehead; the ladder and its manifest are committed with green tests; and the user tried every file at the FP-60X.
- SCORE-01 and SCORE-03 requirements are fully evidenced across all three phase 1 plans (01-01 built the mechanism, 01-02 proved it against the full ladder including chords and a real piece, 01-03 closes it with the blocking human verification).
- No blockers carried into Phase 2. The orchestrator (not this plan) is responsible for marking Phase 1 itself complete.

## Self-Check: PASSED

- `fixtures/README.md` exists on disk and is tracked (confirmed via `check-run-path.cjs --fixtures` and `git ls-files`).
- Task 1 commit `04e728d` found in `git log --oneline`.
- Re-ran `npm test`, `node scripts/check-run-path.cjs --fixtures`, and `node scripts/check-svg-map.cjs` after the commit: all green, matching the evidence quoted above.

---
*Phase: 01-score-on-screen*
*Completed: 2026-09-13*
