# Phase 3: What You Actually Played - Pattern Map

**Mapped:** 2026-09-14
**Files analyzed:** 8 (3 new source modules, 2 new test files, N fixture files as a group, 1 modified file, 1 new doc)
**Analogs found:** 7 / 8 (fixtures group has no single analog; documented under "No Analog Found")

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|---------------|
| `src/align.js` | service (pure transform) | transform (batch, DP over arrays) | `src/pass-segmenter.js` | role-match (pure classic-script transform, same input shapes) |
| `src/aggregate.js` | service (pure transform) | batch/fold (CRUD-like aggregation) | `src/score-model.js` (`extract`/reduce-style walk) | role-match |
| `src/paint.js` | component/renderer (DOM write) | event-driven (invoked after mark/load) | `src/score-renderer.js` (`buildSvgMap`/`verifySvgMap`) | exact (same `S.svgMap` surface) |
| `test/align.test.cjs` | test | request-response (pure fn in, assertion out) | `test/pass-segmenter.test.cjs` | exact |
| `test/aggregate.test.cjs` | test | request-response | `test/pass-segmenter.test.cjs` | exact |
| `test/fixtures/align/*.json` | fixture data | file-I/O (static JSON) | `test/fixtures/tie.musicxml` (fixture directory convention) | role-match (different format, same "fixtures dir committed alongside tests" convention) |
| `src/capture-app.js` (modified: add align→aggregate→paint hooks) | controller/orchestrator | event-driven | itself, existing `mark()`/`restore()`/`renderPassList()` | exact (same file, extend existing hook points) |
| `docs/analysis-rules.md` | config/contract doc | — | none (first doc of its kind) | no analog — new pattern for the repo |

## Pattern Assignments

### `src/align.js` (service, pure transform / batch)

**Analog:** `src/pass-segmenter.js` (module shape) + `src/score-model.js` (rational math, structural ids)

**Module wrapper pattern** (`src/pass-segmenter.js` lines 14-15, 70-73):
```javascript
'use strict';
globalThis.PassSegmenter = (() => {
  // ... pure functions ...
  return { segment };
})();

if (typeof module !== 'undefined') module.exports = globalThis.PassSegmenter;
```
`align.js` must follow this exact wrapper: `globalThis.Align = (() => { ... return { align, resolveOrigin, expectedTime }; })();` plus the same `module.exports` tail line, so `scripts/check-run-path.cjs` and `require('../src/align.js')` in tests both work unchanged.

**Purity discipline** (`src/pass-segmenter.js` lines 1-13, doc comment): the file-level comment documents inputs/outputs and explicitly calls out ordering rules and "never mutates" guarantees. Mirror this for `align.js`: document that it takes `(scoreModel, passNotes, clicks)` and returns a plain-JSON `AlignmentResult`, never touches `document`/MIDI/audio, and never mutates its inputs (verify with the same `JSON.parse(JSON.stringify(...))` round-trip check used in `test/pass-segmenter.test.cjs` line 106).

**Rational-onset arithmetic to reuse verbatim** (`src/score-model.js` lines 65-86):
```javascript
function rational(num, den) { /* gcd-reduced fraction, .beats for display only */ }
function addRationals(a, b) {
  return rational(a.num * b.den + b.num * a.den, a.den * b.den);
}
function compareRationals(a, b) {
  const left = a.num * b.den;
  const right = b.num * a.den;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
```
`align.js` must call `ScoreModel.addRationals`/`ScoreModel.compareRationals` for every onset comparison (chord grouping, absolute-onset math) — never reimplement float comparison, per RESEARCH.md's "Don't Hand-Roll" table and CLAUDE.md's "no second parser" rule extended to no second onset-math helper.

**Origin resolution pattern** (RESEARCH.md Pattern 1/2, grounded in `src/metronome.js` lines 23-34 and `src/capture-app.js` line 209):
```javascript
// clicks: Storage.readClicks() shape — { audioTime, bar, beat, bpm, accent, pageTime, sessionId, id }[]
function resolveOrigin(clicks, passStartTimeStamp) {
  return clicks.findIndex((c) => c.accent && c.pageTime >= passStartTimeStamp);
}
```
`accent` is set by `Metronome.advance()` as `next.beat === 1` (`src/metronome.js` line 32); `pageTime` is added at write time in `capture-app.js` line 209 via `Clock.toPageTime(click.audioTime, C.pair)` — confirms both pass timestamps and click timestamps share one time domain (Phase 2 D-06/D-09), so `align.js` never needs a clock-sync step, only a direct `>=` comparison.

**Structural id reuse:** `ScoreModel.deriveNoteId`/`ModelNote.id` (`src/score-model.js` lines 14-27, 102-104) is the `noteId` that `align.js`'s per-note results must key by — the same id `S.svgMap` uses (see paint.js below). Never invent a second id scheme for alignment results.

**Data shapes consumed** (`src/pass-segmenter.js` lines 16-34): a pass object is `{ ordinal, startSeq, startTimeStamp, endSeq, endTimeStamp, noteCount, eventCount, notes }`. `align.js` takes `pass.notes` (already marker-free, per `segment()` line 53's `event.marker !== true` filter) and `pass.startTimeStamp`/`endTimeStamp` directly — never re-derive pass boundaries.

---

### `src/aggregate.js` (service, pure fold)

**Analog:** `src/score-model.js`'s `extract()` walk-and-reduce shape (lines 138-203), and the same module-wrapper convention as `align.js`.

**Fold-over-array-with-side-map pattern** (`src/score-model.js` lines 149-193): builds a `Map` keyed by structural id while walking a sorted array once, exactly the shape `aggregate.js` needs for "fold `AlignmentResult[]` into per-`noteId` counts." Reuse the same discipline: one pass over `alignmentResults`, a `Map<noteId, counts>`, sort/derive only at the end (mirrors `notes.sort(compareNotes)` at line 194 — aggregate.js sorts/derives its output structure only after the fold completes, not incrementally).

**Filter-before-fold pitfall guard (D-14):** RESEARCH.md's Pitfall 3 requires zero-note passes excluded *before* the fold, not inside it — mirror `PassSegmenter.segment()`'s own boundary-first design (it decides `noteCount`/`eventCount` membership before any caller sees the pass) by giving `aggregate.js` a top-level `passes.filter(p => p.notes.length > 0 || <treat this pass, if zero-note, as not-an-attempt>)` guard as the very first line of `fold()`, matching the `test/pass-segmenter.test.cjs` line 68-74 "0-note middle pass" test pattern for how such passes are represented but never counted as attempts.

---

### `src/paint.js` (renderer, DOM write, event-driven)

**Analog:** `src/score-renderer.js` — `buildSvgMap()` (lines 83-99) and `verifySvgMap()` (lines 103+)

**The exact surface paint.js may touch** (`src/score-renderer.js` lines 83-99):
```javascript
function buildSvgMap() {
  const map = new Map();
  const refs = new Map();
  for (const [id, note] of S.sourceNotes) {
    const gNote = S.osmd.EngravingRules.GNote(note);
    if (!gNote) continue;
    const heads = gNote.getNoteheadSVGs();
    const el = heads && heads[gNote.vfnoteIndex];
    if (el && el.isConnected) {
      map.set(id, el);
      refs.set(id, gNote.getSVGId() + '#' + gNote.vfnoteIndex);
    }
  }
  S.svgMap = map;
  S.svgRefs = refs;
  return map;
}
```
`S.svgMap.get(noteId)` returns the **container** element (`heads[gNote.vfnoteIndex]`), confirmed against OSMD 2.1.2's own bundled `VexFlowGraphicalNote.setColor()` (RESEARCH.md Pattern 5) which sets `fill` on the container's `children`, never the container itself. `paint.js` must do the same:
```javascript
// src/paint.js
function paintNote(svgMap, noteId, color) {
  const el = svgMap.get(noteId);
  if (!el) return; // noteId not on the currently rendered page — never throw
  for (const child of el.children) child.setAttribute('fill', color);
}
```

**Re-apply-after-rebuild pattern:** `score-renderer.js`'s `renderAndMap()` (line 151, calling `buildSvgMap()`) already runs on resize, per its own resize handler — `verifySvgMap()` immediately re-derives geometry from the freshly rebuilt map rather than caching stale elements (lines 103-138 read live `getBoundingClientRect()` off current `S.svgMap` entries every call). `paint.js` must follow the same discipline: never cache SVG elements across a `renderAndMap()` call; always re-read `S.svgMap` and repaint fresh after any rebuild (RESEARCH.md Pitfall 5 / Anti-Pattern 3).

**Global module surface convention:** `globalThis.ScoreRenderer = { state: S, loadPiece, buildSvgMap, verifySvgMap, renderAndMap };` (`src/score-renderer.js` final line) — `paint.js` should export similarly: `globalThis.Paint = { paintNote, resetNote, paintGlyphs, ... }`, read-only access to `ScoreRenderer.state.svgMap`, never assigning into it.

---

### `test/align.test.cjs` / `test/aggregate.test.cjs` (test, request-response)

**Analog:** `test/pass-segmenter.test.cjs` (full file read; pattern below)

**Exact test harness pattern** (`test/pass-segmenter.test.cjs` lines 1-14):
```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../src/pass-segmenter.js');
const PS = globalThis.PassSegmenter;

function ev(seq, type, note, timeStamp, extra) {
  return { seq, type, note, timeStamp, marker: false, ...extra };
}
```
`align.test.cjs`/`aggregate.test.cjs` should mirror this exactly: `require('../src/score-model.js')` then `require('../src/align.js')`, pull `globalThis.Align`, and use small local fixture-builder helper functions for anything not loaded from `test/fixtures/align/*.json` (the pattern-mapper found `ev()`/`marker()` helpers built inline for compact scenarios — reuse this style for any test-local synthetic data not worth a JSON fixture file).

**Round-trip / immutability assertion pattern** (`test/pass-segmenter.test.cjs` lines 100-107):
```javascript
const snapshot = JSON.parse(JSON.stringify(events));
const passes = PS.segment(events, { ... });
assert.deepEqual(events, snapshot);
assert.deepEqual(JSON.parse(JSON.stringify(passes)), passes);
```
Apply the same two assertions to `Align.align(...)` and `Aggregate.fold(...)` outputs — inputs never mutated, outputs are plain JSON (required for D-20's "derived, held in memory" contract and any future persistence).

**Per-scenario test-per-decision pattern** (`test/pass-segmenter.test.cjs`, one `test(...)` block per D-numbered rule, plain-English test names quoting the rule): name each `align.test.cjs` test after its CONTEXT.md decision, e.g. `test('a missing first note is a confident miss, not shifted timing (D-02)', ...)`, exactly mirroring how `pass-segmenter.test.cjs`'s test names cite D-03/D-04/D-07 inline.

---

### `test/fixtures/align/*.json` (fixture data, file-I/O)

**Analog:** `test/fixtures/tie.musicxml` (directory convention only — different format)

No direct JSON-fixture analog exists yet in this codebase (the only existing fixture is a `.musicxml` file consumed by `score-model.test.cjs`). Follow RESEARCH.md's own prescribed shape instead: `{ scoreModel, passNotes, clicks, originIndex }` → expected `AlignmentResult`, one file per CONTEXT.md scenario (13 files listed in RESEARCH.md's Wave 0 Gaps). Keep them under `test/fixtures/align/` as a new subdirectory, consistent with the existing `test/fixtures/` flat convention but namespaced since this phase introduces many more fixture files than any prior phase.

---

### `src/capture-app.js` (modified: add align→aggregate→paint hooks)

**Analog:** itself — extend existing hook points, do not create parallel ones.

**Existing mark-and-repaint hook** (`src/capture-app.js` lines 317-348):
```javascript
function mark(source, timeStamp) {
  // ... existing marker-append logic ...
  renderPassList();
}
```
**Existing restore/load hook** (`src/capture-app.js` lines 53-137, esp. line 128 `C.restored = {...}` and the `passList` rendering block lines 98-119).

**Integration instruction:** add the `Align.align(...) → Aggregate.fold(...) → Paint.paint(...)` call sequence immediately after `renderPassList()` at both call sites — line 348 (inside `mark()`) and inside `restore()`'s pass-list-render block (around line 119) — per RESEARCH.md Pitfall 5's explicit warning that forgetting the `mark()`-path hook (as opposed to only wiring the load path) leaves the score stale during a live session. `renderPassList()` itself is called at three sites total (lines 348, 434, 503, 643 per the grep) — audit each call site to decide whether it also needs the align/paint hook, or whether only the "after a mark" and "on load" sites do (per D-20's literal text, only those two).

---

## Shared Patterns

### One-global-per-classic-script + `module.exports` tail
**Source:** `src/pass-segmenter.js` lines 14-15, 73; `src/score-model.js` lines 46, and its own tail (`globalThis.ScoreModel = ...`); `src/score-renderer.js` final line.
**Apply to:** `src/align.js`, `src/aggregate.js`, `src/paint.js` — every new module.
```javascript
'use strict';
globalThis.ModuleName = (() => {
  // pure functions
  return { /* public API */ };
})();
if (typeof module !== 'undefined') module.exports = globalThis.ModuleName;
```
Also extend `scripts/check-run-path.cjs`'s `EXPECTED_LOCAL_SCRIPTS`-style list (per RESEARCH.md's Validation Architecture) and `index.html`'s script-tag load order so the three new files load after `score-model.js`/`score-renderer.js`/`pass-segmenter.js` and before `capture-app.js`.

### No DOM/MIDI/audio types in pure modules (ANLZ-03)
**Source:** `src/pass-segmenter.js`'s own header comment (lines 1-13): "Classic script... node:test can `require()` it for side effects" with zero `document`/MIDI references anywhere in the file; `src/score-model.js` takes an OSMD `sheet` object but returns only plain-JSON (`extract()` return at line 202 — schemaVersion/title/measures/notes, no OSMD object reachable).
**Apply to:** `src/align.js`, `src/aggregate.js` — verified today with `node --check src/align.js` (the same static check `scripts/check-run-path.cjs` already runs for every `src/*.js`, per RESEARCH.md's test map).

### Structural, never-array-index ids
**Source:** `src/score-model.js` lines 14-27, `deriveNoteId()` lines 102-104: `m{measure}-s{staff}-v{voice}-b{onset.num}_{onset.den}-p{midi}`.
**Apply to:** every alignment/aggregate result keyed by `noteId` must reuse `ModelNote.id` verbatim (never regenerate or re-derive it) so `paint.js`'s `S.svgMap.get(noteId)` lookups line up by construction, exactly as `score-renderer.js`'s `buildSvgMap()` already keys off `S.sourceNotes` entries sharing the same ids the model produced.

### Rational (fraction) math, never floats, for onset comparison
**Source:** `src/score-model.js` lines 65-86 (`rational`, `addRationals`, `compareRationals`).
**Apply to:** all onset-slotting, chord-grouping-by-onset, and absolute-onset computation inside `align.js`.

### Time-domain equivalence (MIDI timestamps == click `pageTime` == `performance.now()` origin)
**Source:** `src/capture-app.js` line 209 (`pageTime: Clock.toPageTime(click.audioTime, C.pair)`); `src/metronome.js` lines 23-34 (`accent: next.beat === 1`).
**Apply to:** `align.js`'s `resolveOrigin`/`expectedTime` functions — compare `pass.startTimeStamp`/note `timeStamp` directly against `click.pageTime`, never against `click.audioTime` (a different clock domain) and never recompute from BPM (D-01/D-02, RESEARCH.md Anti-Pattern 2).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `docs/analysis-rules.md` | config/contract doc | — | First interpretation-contract document in the repo; no analog exists. Structure it as one section per D-numbered rule (D-01 through D-21) pairing prose with its fixture file path, per D-21's own requirement — model the cross-referencing style on how `CONTEXT.md`/`RESEARCH.md` already cite D-numbers inline throughout this phase's own planning docs. |
| `test/fixtures/align/*.json` | fixture data | file-I/O | No prior JSON-fixture convention in this repo (only `.musicxml`); build fresh per RESEARCH.md's `{ scoreModel, passNotes, clicks, originIndex }` shape. |
| headless-Chrome paint-verification script (extends `scripts/check-svg-map.cjs`) | test/config | browser check | Not explicitly requested as a new file path by CONTEXT.md, but RESEARCH.md's Wave 0 Gaps calls for one; closest analog is `scripts/check-svg-map.cjs` itself (extend, do not duplicate) — planner should decide whether this is a new script file or an addition to the existing one. |

## Metadata

**Analog search scope:** `src/`, `test/`, `test/fixtures/`, `scripts/` (existing repo tree only; no other packages/submodules present)
**Files scanned:** `src/pass-segmenter.js`, `src/score-model.js`, `src/score-renderer.js`, `src/storage.js`, `src/metronome.js`, `src/capture-app.js`, `test/pass-segmenter.test.cjs`, `test/fixtures/tie.musicxml` (8 files read in full or in targeted ranges this session; all confirmed git-tracked source, no `.gsd`/capability-mirror paths involved)
**Pattern extraction date:** 2026-09-14
