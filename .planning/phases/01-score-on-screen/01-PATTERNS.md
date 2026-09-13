# Phase 1: Score on Screen - Pattern Map

**Mapped:** 2026-09-13
**Files analyzed:** 9 (new)
**Analogs found:** 5 / 9 (the rest have no analog — first use of OSMD/notation in this repo; RESEARCH.md's own Code Examples are the fallback source for those)

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|-----------------|---------------|
| `src/score-model.js` | utility (pure transform) | transform (OSMD sheet → plain data) | `prototype/piano-core.js` | role-match (pure, no-DOM, classic-script core module) |
| `test/score-model.test.cjs` | test | batch (fixture assertions) | `prototype/piano-core.test.cjs` | exact (node:test + classic-script `require`) |
| `test/osmd-node-env.cjs` | utility (test harness) | transform (env shim) | none in repo | no analog — use RESEARCH.md Code Examples verbatim |
| `src/score-renderer.js` | component/service (OSMD wiring) | event-driven (file input change, resize) | `prototype/piano-app.js` (file-load + `useInput`/state-refresh sections) | role-match (event listener → validate → mutate module state → re-render) |
| `src/inspect-table.js` | component | transform (model → DOM table) | `prototype/piano-app.js` `renderLastTake`/`renderHistory`/`node()` helper | role-match (DOM-building helper + row-per-item render loop) |
| `index.html` | config/layout | request-response (static page) | `prototype/index.html` + `prototype/piano-mistake-tracker.html` | role-match (single HTML entry, classic `<script src>` tags, no bundler) |
| `fixtures/01..05-*.musicxml` | test fixture (data) | file-I/O | none in repo (no MusicXML fixtures exist yet) | no analog — author per CONTEXT D-04/D-05/D-06 |
| `package.json` (new, dev-only) | config | — | none in repo (prototype has none) | no analog — create fresh, per RESEARCH.md (`opensheetmusicdisplay` + `jsdom` devDependencies, test-only) |

## Pattern Assignments

### `src/score-model.js` (utility, transform)

**Analog:** `prototype/piano-core.js`

**Module wrapper pattern** (lines 1-3, 258-259):
```javascript
/* Pure MIDI and timing logic. Classic script so the HTML also opens directly from disk. */
'use strict';
globalThis.PianoCore = (() => {
  // ...
  return {parseMidi, validateSong, validateSettings, sectionNotes, analyze, aggregate, readSession, pitchName, median, limits};
})();
```
Copy this exact shape for `score-model.js`: an IIFE assigned to `globalThis.ScoreModel`, returning only the pure functions (`walkNotes`, `toQuarterBeats`, `deriveNoteId`, `extract`, tie-resolution helper). No DOM, no OSMD object retained past the walk — mirrors how `piano-core.js` never touches `document`.

**Dual export for classic-script + node:test** (RESEARCH.md Pattern 1, matches `piano-core.js`'s own convention exactly):
```javascript
if (typeof module !== "undefined") module.exports = { walkNotes, toQuarterBeats, deriveNoteId, gcd };
if (typeof globalThis !== "undefined") globalThis.ScoreModel = { walkNotes, toQuarterBeats, deriveNoteId, gcd };
```
`piano-core.js` uses only the `globalThis` form (no `module.exports`) because its test does `require('./piano-core.js')` and reads `globalThis.PianoCore` (see below) — follow that exact convention for consistency rather than mixing both export styles.

**Validation-throws-Error pattern** (lines 121-136, `validateSong`):
```javascript
function validateSong(song) {
  if (!song || typeof song.name !== 'string' || ... ) throw new Error('Invalid song data.');
  // ... per-item loop validating monotonic/structural invariants
  return song;
}
```
Apply the same shape to any score-model validation (e.g. rejecting a note whose tie start cannot be resolved): plain `if` guards, `throw new Error('<message>')`, return the validated value unchanged.

**Pure numeric helper pattern** (lines 10-14, `median`): small top-level pure functions, no classes — same style to use for `toQuarterBeats`/`gcd`/`deriveNoteId`.

---

### `test/score-model.test.cjs` (test, batch)

**Analog:** `prototype/piano-core.test.cjs`

**Harness pattern** (lines 1-4):
```javascript
const {test} = require('node:test');
const assert = require('node:assert/strict');
require('./piano-core.js');
const C = globalThis.PianoCore;
```
Copy directly, substituting `./score-model.js` and `globalThis.ScoreModel`. Note this repo's convention is `require()`-for-side-effect then read off `globalThis` — do not add a `module.exports` path to `score-model.js` unless the harness needs a real CJS import (jsdom setup in `test/osmd-node-env.cjs` will need real `require()`, but `score-model.js` itself should stay in the `globalThis`-read style to match `piano-core.js`).

**One assertion per fixture-derived behavior** (throughout the file): each `test(...)` names the specific behavior in plain English ("a clean take at the MIDI tempo has zero duration..."), constructs minimal fixture data inline or via a small local builder function (`song()`, `play()`, `take()`), and asserts exact expected values with a `near()` epsilon helper for floats:
```javascript
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .00001, actual + ' should equal ' + expected);
```
Use this same `near()` helper for beat/duration float assertions in the D-07 ladder tests, and name each `test()` the same declarative way (e.g. "rung 1 (right hand C D E F G) produces the exact expected note list").

**Error-path assertions** (lines 98-101, 178-182): `assert.throws(() => C.fn(...), /substring of the message/)` — use the same for score-model validation-throw tests.

---

### `src/score-renderer.js` (component/service, event-driven)

**Analog:** `prototype/piano-app.js`

**Element lookup + module-level state object** (lines 1-6):
```javascript
'use strict';
const C = PianoCore;
const $ = id => document.getElementById(id);
const S = {song: null, takes: [], /* ... */};
```
For `score-renderer.js`: `const ScoreModel = globalThis.ScoreModel;`, a `$ = id => document.getElementById(id)` helper, and a module-level state object (e.g. `{osmd: null, model: null, svgMap: null}`) — same shape, not a class.

**File input change → validate → mutate state → re-render pattern** (lines 369-388, `importFile`):
```javascript
async function importFile(event, session) {
  const file = event.target.files[0]; if (!file || S.loading || S.recState !== 'idle') return;
  S.loading = true; refreshControls();
  try {
    // ... size check, parse, validate
    replaceSession(data.song, data.settings, data.takes); S.dirty = false;
    toast(session ? 'Session loaded...' : 'Reference loaded...');
  } catch (error) { toast(error.message); }
  finally { S.loading = false; event.target.value = ''; refreshControls(); }
}
$('midiFile').onchange = event => importFile(event, false);
```
Copy this try/catch/finally shape for the `<input type="file">` handler (D-14): read `event.target.files[0]`, pass the `File` straight to `osmd.load(file)` (Pitfall 4 — never read it as text first), catch and surface load errors via a toast-equivalent, reset `event.target.value` in `finally` so re-selecting the same file re-fires `change`.

**Re-render-and-rebuild-derived-state pattern** (lines 357-368, `replaceSession`, and the resize handler sketched in RESEARCH.md Code Examples): after loading, rebuild every derived structure (`$('startBar').max = ...`, table population) from the new state — same principle applies to rebuilding the `noteId → SVGGElement` map after every `osmd.render()` call (initial load AND window resize), per D-11/D-16 and Pitfall 13.

**Toast/status feedback, not console-only** (lines 15-18):
```javascript
function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { $('toast').hidden = true; }, 6500);
}
```
Reuse verbatim (or near-verbatim) for surfacing OSMD load errors — matches D-12's "not console-only" spirit for user-facing feedback, even though D-12 itself is about the inspect table.

---

### `src/inspect-table.js` (component, transform)

**Analog:** `prototype/piano-app.js` (`node()` helper + `renderLastTake` row loop, lines 9-14, 88-99)

**DOM-node builder helper**:
```javascript
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
```
Copy verbatim into `inspect-table.js` (or a small shared DOM utility) — used for every table row/cell.

**replaceChildren + per-row loop pattern** (lines 88-96):
```javascript
$('noteRows').replaceChildren();
for (const o of a.observations.slice(0, 200)) {
  const row = node('tr');
  row.append(node('td', o.bar + ' · ' + beat(o.beat)), node('td', C.pitchName(o.pitch)), /* ... */);
  $('noteRows').append(row);
}
```
Apply the same pattern for D-12's note table: `replaceChildren()` on the table body before repopulating (never append without clearing — avoids duplicate rows on re-render), one `node('tr')` per model note with `node('td', ...)` cells for bar/staff/voice/onset/duration/pitch-name/MIDI-number/tie-status.

**Formatting helpers as small top-level functions** (lines 63-70, `describe`, `ms`, `beat`): keep formatting (e.g. rational onset → "1.5", tie status → "tied"/"—") as small pure functions beside the render function, not inlined in the loop body.

---

### `index.html` (config, static)

**Analog:** `prototype/index.html` (redirect stub, not useful) — real analog is `prototype/piano-mistake-tracker.html`'s script-loading tail (lines 180-181) plus its file-input markup (lines 93, 172).

**Classic-script tail, no bundler** (`piano-mistake-tracker.html` lines 180-181):
```html
<script src="piano-core.js"></script>
<script src="piano-app.js"></script>
```
For the new `index.html`: load OSMD as `<script type="module">` from the jsDelivr `+esm` CDN URL (per D-13/RESEARCH.md — CDN imports are fine as ES modules because they have a real origin), then load `score-model.js`, `score-renderer.js`, `inspect-table.js` as plain classic `<script src="...">` tags in dependency order (score-model before score-renderer/inspect-table) — mirrors this exact "classic script tag, no bundler" tail.

**File input markup** (`piano-mistake-tracker.html` line 93):
```html
<label class="file"><input type="file" id="midiFile" accept=".mid,.midi">Load reference MIDI</label>
```
Copy this label-wrapped file input shape for the piece-opening control, with `accept=".musicxml,.xml,.mxl"` per D-14/SCORE-01.

---

### `fixtures/*.musicxml` and `package.json`

No analog exists in the repo (no MusicXML files, no `package.json` at all currently — prototype has zero dependencies). Follow RESEARCH.md's Recommended Project Structure and Code Examples directly:
- Ladder rungs 1-4: hand-authored per D-05 (uncompressed `.musicxml`, grand staff, two `<staff>` elements from rung 2 on).
- Rung 5: produced via the MuseScore 4 CLI per D-06.
- `package.json`: `devDependencies: { opensheetmusicdisplay: "2.1.2", jsdom: "29.1.1" }` (exact pins; OSMD is needed so node:test can drive the real parser) — no other dependency, matching CLAUDE.md's "no build step to run" and the prototype's own dependency-free root.

## Shared Patterns

### Classic-script + dual global/module export for DOM-free logic
**Source:** `prototype/piano-core.js` lines 1-3, 258-259; consumed by `prototype/piano-core.test.cjs` lines 1-4
**Apply to:** `src/score-model.js` and its test file — this is the load-bearing pattern that satisfies D-13's file:// constraint (Pitfall 1) while still being `require()`-able from `node:test`.

### Toast-style, non-blocking user feedback for async load errors
**Source:** `prototype/piano-app.js` lines 15-18, used throughout `importFile`/`playSection`/`$('connect').onclick`
**Apply to:** `src/score-renderer.js`'s file-open handler — OSMD `load()` failures (bad MusicXML, corrupt `.mxl` per Pitfall 4) should surface the same way, not just `console.error`.

### DOM builder (`node()`) + `replaceChildren()` before repopulating a list/table
**Source:** `prototype/piano-app.js` lines 9-14 and every `replaceChildren()` call (grid, table rows, track `<select>` options)
**Apply to:** `src/inspect-table.js` (D-12 table) and any re-render of the `noteId → SVGGElement` map bookkeeping UI, so re-renders (window resize, D-16) never leave stale/duplicate DOM nodes.

### Module-level plain state object, no framework/class
**Source:** `prototype/piano-app.js` line 4 (`const S = {...}`)
**Apply to:** `src/score-renderer.js`'s OSMD/model/svgMap state — consistent with the project's "no framework" constraint (CLAUDE.md).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `test/osmd-node-env.cjs` | utility (test harness) | transform (jsdom shim) | First use of OSMD/jsdom in this repo; no prior DOM-shim harness exists. Use RESEARCH.md's Code Examples section verbatim (`installOsmdNodeEnv`) as the source instead of a codebase analog. |
| `fixtures/01..05-*.musicxml` | test fixture | file-I/O | No MusicXML files exist anywhere in the repo yet; author per CONTEXT.md D-04/D-05/D-06 and RESEARCH.md's fixture-shape notes (e.g. Pitfall 5's rung-1 single-staff caveat). |
| `package.json` | config | — | Prototype has no dependency manifest at all; create fresh with devDependencies `opensheetmusicdisplay` 2.1.2 and `jsdom` 29.1.1 (test-only), per RESEARCH.md Code Examples. |

## Metadata

**Analog search scope:** `prototype/` (the only tracked source in the repo besides planning docs); `graphify-out/` and `.planning/graphs/` explicitly excluded per orchestrator instruction.
**Files scanned:** `prototype/piano-core.js`, `prototype/piano-core.test.cjs`, `prototype/index.html`, `prototype/piano-app.js`, `prototype/piano-mistake-tracker.html` (grep only, for script-tag/file-input lines); `prototype/relay/` (Node MIDI relay, not applicable to Phase 1's browser/notation scope) skipped.
**Pattern extraction date:** 2026-09-13
**Tracked-source gate:** all five analog files confirmed via `git ls-files` as tracked (not gitignored mirrors).
