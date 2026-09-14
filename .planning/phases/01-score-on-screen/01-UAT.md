---
status: complete
phase: 01-score-on-screen
source: 01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md
started: 2026-09-14T01:15:41Z
updated: 2026-09-14T01:20:42Z
---

## Current Test

[testing complete]

## Tests

### 1. Rung 1 renders and maps (post-fix, SRI-loaded OSMD)
expected: index.html opens from file://, OSMD loads with the new SRI hash (no integrity/CORS console error), rung 1 renders C4-G4 treble with bass rest, status "01-right-hand.musicxml: 1 bars, 5 notes, 5/5 noteheads mapped, map OK"
result: pass
source: claude-in-chrome
evidence: Chrome (claude-in-chrome), app served at http://127.0.0.1:8791 because the extension cannot open file:// from a new tab. OSMD loaded with integrity sha384-12lItsNRZQLTA..., no integrity/CORS console errors. Status exact; screenshot shows C D E F G quarters treble, whole rest bass.

### 2. Rung 2 (.xml) renders and maps
expected: Bass C3-G3, treble rest; status "02-left-hand.xml: 1 bars, 5 notes, 5/5 noteheads mapped, map OK"
result: pass
source: claude-in-chrome
evidence: Status exact; 5 rows bass staff C3-G3 at onsets 0-4; screenshot shows treble rest and ascending bass quarters.

### 3. Rung 3 both hands renders and maps
expected: Treble C4-G4 and bass C3-G3 aligned; status "03-both-hands.musicxml: 1 bars, 10 notes, 10/10 noteheads mapped, map OK"
result: pass
source: claude-in-chrome
evidence: Status exact; 10 rows, treble C4-G4 and bass C3-G3 at the same onsets 0-4; no duplicate fingerprints.

### 4. Rung 4 chords render with distinct fingerprints
expected: Treble C4+E4+G4 then F4+A4+C5 half chords, bass C3 then F3; status "04-chords.musicxml: 1 bars, 8 notes, 8/8 noteheads mapped, map OK"; chord notes share group with #0/#1/#2 low-to-high; no duplicate fingerprints
result: pass
source: claude-in-chrome
evidence: Status exact; chords C4/E4/G4 = auto1390#0/#1/#2 and F4/A4/C5 = auto1399#0/#1/#2 (low to high); bass C3, F3; no duplicates, no MISSING.

### 5. Rung 5 (.musicxml and .mxl) renders and maps
expected: Four 3/4 bars matching fixtures/README.md; status "... 4 bars, 41 notes, 41/41 noteheads mapped, map OK" for both files
result: pass
source: claude-in-chrome
evidence: Both files 4 bars, 41 notes, 41/41 map OK. All 41 rows match fixtures/README.md bar by bar; .mxl note list identical to .musicxml. Real MuseScore export not re-tested (not in repo; approved at the piano in 01-03).

### 6. Resize reflow keeps map OK
expected: Narrowing then widening the window reflows notation; status line identical and still map OK
result: pass
source: claude-in-chrome
evidence: Maximized window would not resize via the extension; simulated by narrowing #notation to 450px plus a resize event, then restoring. SVG width 946->450->946, renderCount 1->2->3, status identical and map OK each time, 0 duplicates. Per-rung resize also covered by check-svg-map.cjs (6/6 OK, re-run today).

### 7. Invalid file rejected, app recovers
expected: Non-MusicXML file shows red toast, notation and table clear, status "No piece loaded"; loading rung 1 afterward works normally
result: pass
source: claude-in-chrome
evidence: Loaded fixtures/README.md: red toast "Could not open README.md: OpenSheetMusicDisplay: The document which was provided is invalid", notation and table cleared, status "No piece loaded". Reloading rung 1 rendered normally and hid the toast.

### 8. Same file re-selection after ignored mid-load pick (WR-02)
expected: After a selection is ignored during a load, choosing that file again triggers a load
result: pass
source: claude-in-chrome
evidence: Synthetic change events: picked rung 5, then rung 1 during the load; the second pick was ignored and the input value reset to "". Rung 5 finished (map OK); picking rung 1 again loaded it (map OK).

### A1. Score model extraction (01-01 D1)
expected: Score model extraction proven through the real OSMD parser
result: pass
source: automated
coverage_id: 01-01-D1

### A2. No build step in run path (01-01 D3)
expected: No build step, bundler, server, or local ES-module import in the run path
result: pass
source: automated
coverage_id: 01-01-D3

### A3. Ladder rungs 2-4 note lists (01-02 D1)
expected: Rungs 2-4 match exact hand-typed note lists
result: pass
source: automated
coverage_id: 01-02-D1

### A4. Rung 5 reproducible build (01-02 D3)
expected: Rung 5 built reproducibly; 41-note list matches .musicxml and .mxl
result: pass
source: automated
coverage_id: 01-02-D3

### A5. Tie resolution and rational exactness (01-02 D4)
expected: Ties fold correctly; exact rationals and ordering pinned
result: pass
source: automated
coverage_id: 01-02-D4

### A6. Plain node/npm checks pass (01-03 D1)
expected: npm test, check-run-path, check-svg-map pass
result: pass
source: automated
coverage_id: 01-03-D1

### A7. Ladder manifest exists (01-03 D2)
expected: fixtures/README.md gives checkable manifest
result: pass
source: automated
coverage_id: 01-03-D2

## Summary

total: 15
passed: 15
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
