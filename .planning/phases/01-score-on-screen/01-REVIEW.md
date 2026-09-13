---
phase: 01-score-on-screen
reviewed: 2026-09-13T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - index.html
  - src/score-model.js
  - src/score-renderer.js
  - src/inspect-table.js
  - scripts/build-rung5.cjs
  - scripts/check-run-path.cjs
  - scripts/check-svg-map.cjs
  - test/osmd-node-env.cjs
  - test/score-model.test.cjs
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-09-13T00:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the score-on-screen phase: the pure `ScoreModel.extract()` model (`src/score-model.js`), the OSMD-driven renderer and per-notehead SVG map (`src/score-renderer.js`), the developer inspection table (`src/inspect-table.js`), the page shell (`index.html`), the reproducible fixture-build/static-gate/headless-verification dev scripts, and the node:test coverage.

No injection, XSS, eval, or hardcoded-secret patterns were found — all DOM writes use `textContent`/`createElement`, not `innerHTML`; `execFileSync`/`spawn` calls in the dev scripts use argument arrays (no shell interpolation). The rational-arithmetic and tie-folding logic in `score-model.js` is careful and internally consistent with its own documented contract, and the test suite exercises it thoroughly (ladder rungs, tie chains, duplicate-id rejection, DOM-independence, JSON round-trip).

Two real robustness gaps stood out, both WARNING-level rather than BLOCKER: the pinned OSMD CDN `<script>` tag has no Subresource Integrity hash, and a file-input edge case can leave the `<input type="file">` permanently unable to re-select a specific file after a same-file re-selection is ignored mid-load. A few INFO-level quality items (dead parameter, unguarded `error.message`, developer-machine-specific hardcoded paths in a build script) round out the findings.

## Warnings

### WR-01: OSMD CDN script has no Subresource Integrity check

**File:** `index.html:18`
**Issue:** The app's only third-party dependency is loaded unconditionally from jsDelivr with a pinned version but no `integrity`/`crossorigin` attributes:
```html
<script src="https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@2.1.2/build/opensheetmusicdisplay.min.js"></script>
```
Version pinning alone does not protect against a compromised or cache-poisoned CDN response for that exact URL — the script runs with full page privileges (it is the only script tag with network access, and the app grants file/clipboard access to the page). Since this tag loads on every session (the app is opened "near zero friction" per the project constraints, i.e. frequently, unattended), a single tampered response would run silently.
**Fix:** Add an SRI hash (jsDelivr publishes one) and `crossorigin="anonymous"`:
```html
<script src="https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@2.1.2/build/opensheetmusicdisplay.min.js"
        integrity="sha384-<hash-from-jsdelivr>"
        crossorigin="anonymous"></script>
```

### WR-02: Ignored re-selection during load leaves the file input stuck on that file

**File:** `src/score-renderer.js:65-73`
**Issue:**
```js
async function openFile(event) {
  const file = event.target.files[0];
  if (!file || S.loading) return; // a second selection during a load is ignored
  try {
    await loadPiece(file);
  } finally {
    event.target.value = ''; // so re-selecting the same file fires change again
  }
}
```
When a second file is selected while a prior `loadPiece` is still in flight, the function returns early *before* the `try/finally`, so `event.target.value` is never cleared. The `<input>`'s value now holds that ignored file's path. Because browsers only fire `change` when the input's value actually changes, selecting that exact same file again afterward produces no `change` event at all — the user's retry is silently swallowed until they pick a *different* file first. This defeats the very purpose of the `value = ''` reset used everywhere else in this function.
**Fix:** Reset the value on the ignored path too, e.g.:
```js
async function openFile(event) {
  const file = event.target.files[0];
  if (!file || S.loading) {
    event.target.value = '';
    return;
  }
  try {
    await loadPiece(file);
  } finally {
    event.target.value = '';
  }
}
```

## Info

### IN-01: `chordPosition` is computed and threaded through but never consumed

**File:** `src/score-model.js:118-119, 158`
**Issue:** `walkNotes` computes `chordPosition` from `voiceEntry.Notes.forEach((note, chordPosition) => ...)` and passes it into every `visit()` call, but `extract`'s callback destructures only `{ measureNumber, staff, voice, onset, note }` (line 158) — `chordPosition` is dropped on the floor. It plays no role in `deriveNoteId` (which keys chords by pitch, not position) or anywhere else in the returned model.
**Fix:** Either drop the unused field from `walkNotes`'s payload, or if it is intended for a near-future consumer (e.g. `inspect-table.js`'s SVG mapping), note that intent in the doc comment above `walkNotes` so it doesn't read as dead code.

### IN-02: `error.message` assumes the thrown value is an `Error`

**File:** `src/score-renderer.js:59`
**Issue:** `toast('Could not open ' + file.name + ': ' + error.message);` will render `"...: undefined"` if OSMD (or a future code path) ever rejects/throws a non-`Error` value (string, plain object, etc.). OSMD's `load()` is a third-party async call whose rejection shape isn't guaranteed across versions.
**Fix:** Normalize the message, e.g. `error instanceof Error ? error.message : String(error)`.

### IN-03: Developer-machine-specific absolute paths hardcoded as defaults

**File:** `scripts/build-rung5.cjs:16-17`
**Issue:** Default paths embed a specific developer's username and MuseScore install location (`C:\Users\vaheh\OneDrive\...`, `C:\Program Files\MuseScore 4\...`). They're overridable via `MUSESCORE_EXE`/`RUNG5_SOURCE` env vars, so this doesn't break functionality, but the committed defaults are meaningless (and mildly identifying) on any other machine, and the failure mode when they're wrong is a generic MuseScore CLI error rather than a clear "set this env var" message.
**Fix:** Either drop the hardcoded personal defaults (require the env vars, fail fast with a clear message if unset) or move them to a local `.env`-style file that's gitignored.

---

_Reviewed: 2026-09-13T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
