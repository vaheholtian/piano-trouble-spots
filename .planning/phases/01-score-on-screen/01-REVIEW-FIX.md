---
phase: 01-score-on-screen
fixed_at: 2026-09-14T01:15:00Z
review_path: .planning/phases/01-score-on-screen/01-REVIEW.md
iteration: 2
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-09-14T01:15:00Z
**Source review:** .planning/phases/01-score-on-screen/01-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 5 (fix_scope: all — WR-01, WR-02, IN-01, IN-02, IN-03)
- Fixed: 5 (2 already fixed in iteration 1, verified still present; 3 newly fixed this iteration)
- Skipped: 0

## Fixed Issues

### WR-01: OSMD CDN script has no Subresource Integrity check

**Files modified:** `index.html`
**Commit:** f239f5d (iteration 1)
**Applied fix:** Added `integrity="sha384-12lItsNRZQLTAONzjzkiAB2oOKC7L9JPNqWBHro/ug0hLJZTmGxbr0V2JRt8KwC2"` and `crossorigin="anonymous"` to the OSMD CDN `<script>` tag.

Re-verified this iteration: `integrity=` attribute confirmed present at `index.html:19` before any new edits were made. Not re-applied.

### WR-02: Ignored re-selection during load leaves the file input stuck on that file

**Files modified:** `src/score-renderer.js`
**Commit:** 87d032f (iteration 1)
**Applied fix:** `openFile()`'s early-return branch now resets `event.target.value = ''` before returning, matching the reset already done in the `try/finally` success path.

Re-verified this iteration: the early-return branch confirmed present in `src/score-renderer.js` before any new edits were made. Not re-applied.

### IN-01: `chordPosition` is computed and threaded through but never consumed

**Files modified:** `src/score-model.js`
**Commit:** 33c6e40
**Applied fix:** Confirmed via repo-wide grep (`src/`, `scripts/`, `test/`) that nothing reads `chordPosition` — it was only referenced in `score-model.js` itself and in planning docs (prose, not code). Applied the smallest fix: `walkNotes`'s `voiceEntry.Notes.forEach((note, chordPosition) => ...)` no longer captures or forwards `chordPosition`; the `visit()` payload no longer includes it.

### IN-02: `error.message` assumes the thrown value is an `Error`

**Files modified:** `src/score-renderer.js`
**Commit:** 557b564
**Applied fix:** `openFile`'s catch-path toast now normalizes with `error instanceof Error ? error.message : String(error)`, matching the review's suggested fix exactly.

### IN-03: Developer-machine-specific absolute paths hardcoded as defaults

**Files modified:** `scripts/build-rung5.cjs`
**Commit:** b3cb8fd
**Applied fix:** Removed the personal default for `RUNG5_SOURCE` (previously `C:\Users\vaheh\OneDrive\...`). The script now requires `RUNG5_SOURCE` to be set and fails fast with a clear message naming the env var (`RUNG5_SOURCE env var is not set. Set it to the absolute path of the MuseScore source file (e.g. RUNG5_SOURCE="C:\path\to\Yanni - 4 measures.mscz") and re-run.`) before touching anything else, rather than passing a bogus path through to the MuseScore CLI. Per the fix-scope guidance, `MUSESCORE_EXE`'s default (`C:\Program Files\MuseScore 4\bin\MuseScore4.exe`, a standard install location, not personally identifying) was left unchanged.

**Doc reference note (not edited, per instructions):** `fixtures/README.md`'s "Rebuilding rung 5" section documents running the script as `node scripts/build-rung5.cjs` without mentioning `RUNG5_SOURCE`. It never claimed the script works with zero env vars (no default was ever usable on a machine other than the original developer's), so no existing claim in that doc is now false — but a reader following it verbatim will now get the new fail-fast message rather than a MuseScore CLI error. No other `.planning/` doc or plan documents invoking this script without env vars in a way that would now break. Left as-is since it is a project doc, not part of this fix's scope, and the instruction was to report rather than edit it.

## Verification

- **Tier 1 (all 5 fixes):** Re-read modified file sections after each edit; fix text present, surrounding code intact. For WR-01/WR-02, re-read to confirm the iteration-1 fix text is still present before marking as already-fixed (no re-application).
- **Tier 2:**
  - IN-01 (`src/score-model.js`, plain classic script): `node -c src/score-model.js` — passed.
  - IN-02 (`src/score-renderer.js`, plain classic script): `node -c src/score-renderer.js` — passed.
  - IN-03 (`scripts/build-rung5.cjs`, CommonJS Node script): `node -c scripts/build-rung5.cjs` — passed. Additionally ran a functional smoke check: `env -u RUNG5_SOURCE node scripts/build-rung5.cjs` exits 1 and prints the new fail-fast message naming the env var, confirming the guard fires before any MuseScore invocation.
- **Full test suite:** `node --test test/*.test.cjs` run inside the isolated worktree (`NODE_PATH` pointed at the main checkout's `node_modules`, since the worktree has no `node_modules` by design — see gate-safety note against reparse-point teardown). Result: **21/21 passed, 0 failed**. Ran once, after all three new commits (IN-01, IN-02, IN-03) were in place on top of the already-committed WR-01/WR-02 fixes.
- **Verification environment:** All gate commands above ran inside the isolated git worktree (`.claude/worktrees/rf-01-*`, on temp branch `gsd-reviewfix/01-*`), not the main checkout. The worktree was fast-forward-merged into `main` and removed after all fixes were committed and verified, so these results are reproducible from the main checkout's current `HEAD` (same file content, same `node_modules`), even though the worktree itself no longer exists.

## Skipped Issues

None — all in-scope findings were fixed (2 confirmed-already-fixed from iteration 1, 3 newly fixed this iteration).

---

_Fixed: 2026-09-14T01:15:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
