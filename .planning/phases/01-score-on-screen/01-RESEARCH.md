# Phase 1: Score on Screen - Research

**Researched:** 2026-09-13
**Domain:** OpenSheetMusicDisplay 2.1.2 note-model extraction, browser-only file loading, node:test fixture testing
**Confidence:** HIGH (score-model extraction API surface — verified by reading the installed package's `.d.ts` sources AND by executing the real 2.1.2 compiled bundle against real MusicXML in this session; file:// module-loading and node:test facts — MEDIUM, web-search corroborated)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Scope reshape (decided by the user during this discussion)**
- **D-01:** The passage is always the entire loaded file through Phase 5. No start/end bar, no highlighting, no bar picker in this phase. — Reversibility: reversible — bar selection arrives in Phase 6 as a filter over the same score model; the model must already carry measure numbers so that filter is a slice, not a remodel.
- **D-02:** Milestone 1 files contain no repeat signs, first/second endings, pickup bars, grace notes, or tuplets. The app does nothing special for them and no time is spent handling them. If a loaded file contains them, the app may render whatever OSMD renders; correctness of the model for those constructs is not a Phase 1 requirement.
- **D-03:** Ties are resolved per SCORE-03 (a tied continuation is not a separate onset), even though ladder rungs 1 to 4 have none. Rung 5 (Yanni) has none either; a fixture test with a tie is still required so the rule is exercised.

**Verification ladder (the test scores used at the piano for Phases 1 to 5)**
- **D-04:** Five MusicXML files are kept in the repo and used for every phase through Phase 5:
  1. Right hand only: C D E F G, one bar
  2. Left hand only: the same notes
  3. Both hands together
  4. A chord or two
  5. Four real bars: the user's "Yanni - 4 measures" (see specifics)
- **D-05:** Claude writes rungs 1 to 4 directly as MusicXML (uncompressed `.musicxml`, hand-authored, minimal, grand staff with two staves so the staff field is exercised from rung 2 onward). The user supplies rung 5 from MuseScore. — Reversibility: reversible.
- **D-06:** Rung 5 is produced from the user's MuseScore file with the MuseScore 4 command line, not by hand export, so it is reproducible: `"C:\Program Files\MuseScore 4\bin\MuseScore4.exe" -o <out>.musicxml "C:\Users\vaheh\OneDrive\Documents\MuseScore4\Scores\Yanni - 4 measures.mscz"`. MuseScore 4.6.5 is installed. The source file currently has 43 measures of which only 1 to 4 contain notes. Preferred: the user deletes bars 5 to 43 in MuseScore and saves. Fallback if that has not happened when the plan runs: strip trailing empty measures from the exported MusicXML in the build step, and say so in the SUMMARY.
- **D-07:** The ladder files are also the fixtures for the score-model tests (node:test, no DOM). Every rung gets a test asserting the exact expected note list (measure, staff, voice, onset, duration, pitch).

**Score model**
- **D-08:** The score model is the app's own plain JSON-serialisable data, extracted once from OSMD's parsed sheet after load. OSMD internals never leak into the model, analysis, or persistence. — Reversibility: one-way — analysis fixtures, IndexedDB records, and exports from Phase 2 onward serialise this shape; changing it later means a data migration and an analysisVersion bump.
- **D-09:** Note ids are derived structurally (for example measure number, staff, voice, onset in the measure, pitch, and chord position), never from array index or anything the renderer computes, so the same file parsed twice yields identical ids. The id scheme is part of the persisted contract. — Reversibility: one-way.
- **D-10:** Onset and duration are in beats (quarter-note units as a rational or decimal that survives dotted and eighth values exactly), measure numbers follow the MusicXML `number` attribute, staff is 1 or 2 as in the file, voice as in the file. The model carries enough that hand/staff filtering and bar selection are later slices, not remodels.
- **D-11:** The renderer owns a `noteId → SVG element` map built from OSMD's graphical notes after each render, so later phases can paint noteheads without re-rendering. Phase 1 only has to prove the map is complete (every model note maps to a rendered notehead) for all five ladder files; no painting yet.

**Inspectable model (Claude's pick after the reshape)**
- **D-12:** A collapsible table under the notation lists every note: bar, staff, voice, beat onset, duration, pitch name and MIDI number, tie status. This is the user's tool for checking the model against the sheet at the piano, so it must be plain and readable, not a JSON dump. A "copy as JSON" affordance is optional; a console-only dump is not acceptable.

**Opening the app and a piece**
- **D-13:** The app is a single HTML file the user double-clicks. No local server, no build step. OpenSheetMusicDisplay 2.1.2 loads from a CDN (jsDelivr `+esm` or the UMD build), so the laptop needs internet the first time and Chrome caches afterwards. Module scripts that import local files are not allowed, because Chrome blocks cross-file ES module imports from `file://`; code that must be shared with node:test lives in plain `.js` files that are loaded in a way that works from `file://` (the planner chooses the mechanism, for example classic scripts or inlining at a copy step; the constraint is: double-click works). — Reversibility: costly — moving to a server later is easy, but the decision shapes how source files are split now.
- **D-14:** A piece is opened with a plain file button (`<input type="file">`). Drag and drop is not required in this phase.
- **D-15:** Remembering the last-opened piece across reloads is not in this phase; durable storage lands in Phase 2 (HIST-01).

**Score display (Claude's pick after the reshape)**
- **D-16:** The whole file is shown, fitted to the window width, OSMD defaults otherwise. No zoom control, no page layout choices, no title editing. A window resize re-renders and the inspect table and id map stay correct after it (annotations lost on re-render is a known pitfall — prove the map survives a resize now, before anything depends on it).

### Claude's Discretion
- File layout of the repo, naming of the ladder files, exact id string format, test file organisation.
- How the OSMD sheet is walked to produce the model, as long as D-08 to D-11 hold.
- Visual styling, within "plain and readable".

### Deferred Ideas (OUT OF SCOPE)
Decided during this discussion but parked for Phase 6 (Real Pieces and Passages), already written into its success criteria:
- Bar selection by clicking a start bar then an end bar on the notation, with two number fields mirroring the choice.
- Nothing selected after load until the user clicks.
- Bar numbers follow MuseScore's printed numbers (a pickup bar is 0).
- Repeat signs and endings are not expanded in milestone 1; the user's pieces will not contain them.

Other:
- Drag-and-drop file opening (trivial, any later phase).
- Remembering the last-opened piece (Phase 2 with HIST-01).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCORE-01 | User can open a MusicXML file (`.musicxml`, `.xml`, or compressed `.mxl` exported from MuseScore) and see it rendered as real notation in Chrome | Standard Stack (OSMD 2.1.2 load/render), Code Examples (file input → `osmd.load(File)` → `osmd.render()`), Pitfalls 1 & 4 (mxl-as-binary, file:// module loading) |
| SCORE-03 | The internal score model carries measure, staff, voice, onset in beats, duration, pitch, and resolved ties for every note, so hand or staff filtering can be added later without a data-model change | Architecture Patterns (score-model walk), Code Examples (walk + id derivation + whole-note→quarter-beat conversion), Pitfall 2 (unit-base error), Pitfall 3 (tie vs. TieTypes confusion) |
</phase_requirements>

## Summary

Phase 1's only real technical risk is getting the OSMD 2.1.2 → plain-data score-model extraction exactly right, because every later phase (alignment, timing, aggregation) trusts this model without re-deriving it. This research reads the actual installed package (`npm pack opensheetmusicdisplay@2.1.2` into the scratchpad, its `.d.ts` sources) and then goes one step further: it loads real MusicXML through the real compiled 2.1.2 bundle inside a Node + jsdom harness and inspects the live object graph. That produced one load-bearing, previously undocumented-in-this-repo finding: **OSMD's internal `Fraction` timing system uses a whole note as `1`, not a quarter note** — `VoiceEntry.Timestamp`, `Note.Length`, and `Note.getAbsoluteTimestamp()` are all in whole-note units, so every value pulled out of OSMD for the score model must be multiplied by 4 (as an exact rational, not a float) to satisfy D-10's "beats (quarter-note units)" contract. Getting this backwards would silently produce a model where every onset and duration is 4× too small — a bug that looks fine in casual testing (ordering and relative spacing are still correct) and only breaks once an absolute BPM-derived expected time is compared against it in Phase 2+.

The rest of the extraction is straightforward and now empirically confirmed rather than assumed: `Staff.Id` reads the MusicXML `<staff>` number directly (1, 2, ...), `Voice.VoiceId` reads the MusicXML `<voice>` value directly with no renumbering (confirmed with the exact voice ids 1 and 5 that MuseScore uses for the Yanni fixture), a chord is one `VoiceEntry` with multiple `Note`s in document order (array index = chord position), and `SourceMeasure.MeasureNumberXML` is the literal `<measure number="...">` attribute D-10 asks for. Ties are resolved via `Note.NoteTie.StartNote`, not via the `TieTypes` enum (which is unrelated — it's for guitar hammer-on/pull-off/slide notation, a naming trap worth flagging explicitly). The renderer's `noteId → SVGGElement` map (D-11) is built via `osmd.EngravingRules.GNote(note)`, confirmed present and callable in 2.1.2, but its `getSVGGElement()`/`getNoteheadSVGs()` only return real elements after a full `render()` (not after `load()` alone) — build the map after render, and after every re-render (window resize).

The whole app is one HTML file loaded via `file://` double-click (D-13), so OSMD must come from a CDN's `+esm`-wrapped UMD build (the npm package itself ships no `module`/`exports` field — confirmed by reading its `package.json` — so a plain bare-specifier `import` from `node_modules` will not work as real ESM without that wrapping), and any code shared with `node:test` must be a classic (non-module) script, exactly the pattern the prototype already used (`piano-core.js` attaches to `globalThis`, `piano-core.test.cjs` does a plain `require()`). `.mxl` loading is real (OSMD bundles JSZip and unzips on `.load(Blob)`) but not exercised by the five ladder files (all five are uncompressed `.musicxml` per D-05/D-06) — flag this as a coverage gap the plan should at least acknowledge, since SCORE-01 explicitly promises `.mxl` support.

**Primary recommendation:** Extract the score model with one pure walk over `osmd.Sheet.SourceMeasures → VerticalSourceStaffEntryContainers → StaffEntries → VoiceEntries → Notes`, converting every OSMD `Fraction` to quarter-note beats by rational multiplication (never `RealValue * 4` as a float shortcut for storage, only for display), dropping tied continuation notes from the onset list per D-03, and building the id from the same structural tuple used to key the renderer's SVG map so the two stay in lockstep by construction rather than by lookup.

## Architectural Responsibility Map

This project has no server/API/CDN tier (browser-only, no build step, per CLAUDE.md and PROJECT.md) — everything below lives in the browser page.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| MusicXML/.mxl parsing + notation rendering | Browser / Client | — | OSMD runs entirely client-side; no server exists to do this instead |
| Score-model extraction (OSMD → plain data) | Browser / Client | — | Runs once after `load()`, in the same page; must stay renderer-agnostic (D-08) even though it currently only has one renderer |
| Inspectable note table (D-12) | Browser / Client | — | Pure DOM rendering of the plain-data model, no new data source |
| `noteId → SVG element` map (D-11) | Browser / Client | — | Built from OSMD's graphical notes after render; owned by the renderer module, never by the score model |
| File opening (`<input type="file">`) | Browser / Client | — | No upload target exists; the File API reads the local file directly into memory |
| Durable storage of the loaded piece | *(out of scope this phase)* | — | Deferred to Phase 2 (HIST-01, D-15); Phase 1 has no persistence at all |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **OpenSheetMusicDisplay** | 2.1.2 | Parses MusicXML/`.mxl` and renders it as real SVG notation; exposes the parsed model this phase's score model is extracted from | Only library that parses MusicXML natively (including `.mxl` via bundled JSZip) and engraves via VexFlow, per CLAUDE.md's stack decision. [VERIFIED: npm registry — `npm view opensheetmusicdisplay@2.1.2 version time.modified` → `version = '2.1.2'`, `time.modified = '2026-08-06T16:42:07.215Z'`, run this session] |

No other core library is needed for this phase — no MIDI, no audio, no persistence library (idb is deferred to Phase 2 per D-15).

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **jsdom** | ^30 (registry latest; `29.1.1` was what this session's probe actually ran against) | Provides `document`/`DOMParser`/`Blob` etc. so `node:test` can drive the *real* OSMD 2.1.2 parser (not a hand-mocked fake) for the D-07 fixture tests, without a browser | Dev-only devDependency, never shipped to the browser bundle. [VERIFIED: npm registry — `npm view jsdom version time.modified` → `version = '30.0.1'`, published `2026-07-29`, run this session] [ASSUMED: package name — discovered from training knowledge/prior use, not from official OSMD or Node docs, even though the registry lookup above confirms it exists] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| jsdom-backed `node:test` fixtures that exercise real OSMD parsing | Hand-written mock objects shaped like `SourceMeasure`/`VoiceEntry`/`Note` | A hand mock can silently drift from real OSMD behavior (e.g., the whole-note-vs-quarter-note unit finding in this research would never have been caught by a mock you wrote yourself, since you'd have encoded your own assumption into the mock). Only fall back to mocks if jsdom proves too slow or flaky in CI — not expected at this scale (5 tiny fixture files). |
| CDN `+esm`-wrapped OSMD for the shipped app | A bundler (Vite/webpack/esbuild) | Directly forbidden by CLAUDE.md ("no build step required to run"); not reconsidered. |

**Installation:**
```bash
# Shipped app: no npm install needed at all — import from a CDN in the HTML/JS directly:
#   import OpenSheetMusicDisplay from "https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@2.1.2/+esm";

# Dev/test only (never shipped):
npm install --save-dev jsdom
# node:test ships with Node.js (this machine: v24.11.1, confirmed this session) — nothing to install
```

**Version verification:** Done this session — see the `[VERIFIED: npm registry]` tags above. Both versions were also physically fetched into the scratchpad (`npm pack opensheetmusicdisplay@2.1.2`, `npm install jsdom`) and exercised, not just looked up.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| opensheetmusicdisplay | npm | published 2026-08-06 (this version) | 21,798/wk | github.com/opensheetmusicdisplay/opensheetmusicdisplay | OK | Approved |
| jsdom | npm | published 2026-07-29 (this version); long-established project | 72,650,923/wk | github.com/jsdom/jsdom | OK | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

Both verdicts came from `gsd-tools query package-legitimacy check --ecosystem npm opensheetmusicdisplay jsdom`, run this session. `opensheetmusicdisplay` additionally has its `main`/`types`/`files` fields read directly from its `package.json` (see Pitfall 4) and its compiled bundle executed against real MusicXML in this session, which is stronger evidence than a bare registry lookup.

## Architecture Patterns

### System Architecture Diagram

```
   User double-clicks index.html (file://)
              │
              ▼
   ┌─────────────────────────────┐
   │  <input type="file"> change  │  ← D-14: plain file button, no drag/drop
   └──────────────┬───────────────┘
                  │ File (Blob)
                  ▼
   ┌─────────────────────────────────────────────┐
   │  osmd.load(file)                              │  ← accepts .musicxml/.xml/.mxl directly
   │  (OSMD internally: detect zip → JSZip unzip    │     (Pitfall 4: must stay binary, not text)
   │   if .mxl → DOMParser → build MusicSheet)      │
   └──────────────┬────────────────────────────────┘
                  │ osmd.Sheet populated (SourceMeasures, Staves, Voices, Notes)
                  ▼
   ┌─────────────────────────────────────────────┐
   │  Score-model extraction (pure walk, one-time) │  ← D-08/D-09/D-10
   │  SourceMeasures → VerticalContainers →         │     converts whole-note Fractions
   │  StaffEntries → VoiceEntries → Notes           │     to quarter-note beats (Pitfall 2)
   └──────┬─────────────────────────────────┬───────┘
          │ plain-data ScoreModel            │ same walk, kept live OSMD Note refs
          ▼                                  ▼
   ┌─────────────────┐          ┌─────────────────────────────┐
   │ Inspect table UI │          │  osmd.render()                │  ← D-16: fit to window width
   │ (D-12)            │          │  then EngravingRules.GNote(n) │
   └─────────────────┘          │  → getSVGGElement() per note   │  ← D-11: build AFTER render,
                                 └──────────────┬─────────────────┘     rebuild after every re-render
                                                │ noteId → SVGGElement map
                                                ▼
                                  (Phase 1 stops here: map completeness
                                   is proven, nothing is painted yet)
```

### Recommended Project Structure

```
/ (repo root)
├── index.html              # the double-clicked entry point; imports OSMD from CDN +esm
├── src/
│   ├── score-model.js       # PURE, no DOM/OSMD-object leakage out of this file's boundary;
│   │                         #   classic script (not type=module) OR a tiny wrapper so it can be
│   │                         #   both `<script src>`'d from index.html and `require()`'d from tests
│   ├── score-renderer.js     # OSMD setup, osmd.load/render, builds noteId→SVGGElement map
│   └── inspect-table.js      # renders the D-12 table from the plain score model
├── test/
│   ├── osmd-node-env.cjs     # jsdom global shim (document/DOMParser/Blob/etc.) — see Code Examples
│   └── score-model.test.cjs  # node:test fixtures, one per ladder rung, per D-07
└── fixtures/
    ├── 01-right-hand.musicxml
    ├── 02-left-hand.musicxml
    ├── 03-both-hands.musicxml
    ├── 04-chord.musicxml
    └── 05-yanni-4-measures.musicxml   # produced via the MuseScore 4 CLI, per D-06
```

### Pattern 1: One structural walk produces both the plain model AND the id→note pairing the SVG map needs

**What:** Do not build the score model first and *then* try to look an OSMD `Note` back up from a `noteId` string later — there is no such reverse lookup, and D-08 forbids storing the OSMD object in the model anyway. Instead, write one walk function that, for each note, computes the id (from measure/staff/voice/onset/chord-position) AND yields the live OSMD `Note` reference alongside it. The score-model builder (`score-model.js`, pure) uses only the id + plain fields. The renderer's map builder (`score-renderer.js`, allowed to touch OSMD/DOM) uses the same walk, but pairs the id with `osmd.EngravingRules.GNote(note).getSVGGElement()`.

**When to use:** Always for this project — it's the only way to satisfy both D-08 (no OSMD leakage into the model) and D-11 (SVG map keyed by the model's own ids) without a fragile string-keyed reverse index.

**Example:**
```javascript
// score-model.js — shared walk, classic script (see Pitfall 4 for the file:// constraint)
// Exposed as globalThis.ScoreModel (browser) and module.exports (node:test), same pattern
// the prototype already used for piano-core.js.

function walkNotes(sheet, visit) {
  // sheet === osmd.Sheet
  for (const measure of sheet.SourceMeasures) {
    const measureNumber = measure.MeasureNumberXML; // D-10: "follows the MusicXML number attribute"
    for (const container of measure.VerticalSourceStaffEntryContainers) {
      for (const staffEntry of container.StaffEntries) {
        if (!staffEntry) continue; // a staff can have no entry at this timestamp
        const staff = staffEntry.ParentStaff.Id; // 1 or 2, verified == MusicXML <staff> value
        for (const voiceEntry of staffEntry.VoiceEntries) {
          const voice = voiceEntry.ParentVoice.VoiceId; // verified == MusicXML <voice> value, no renumbering
          const onset = toQuarterBeats(voiceEntry.Timestamp); // measure-relative; see Pitfall 2
          voiceEntry.Notes.forEach((note, chordPosition) => {
            visit({ measureNumber, staff, voice, onset, chordPosition, note });
          });
        }
      }
    }
  }
}

// Exact-rational whole-note -> quarter-note-beat conversion (Pitfall 2).
// OSMD's Fraction stores { numerator, denominator, wholeValue }; GetExpandedNumerator()
// folds wholeValue in. Never do `fraction.RealValue * 4` for STORAGE — float rounding
// can bite dotted/tuplet values later even though it looks fine for the ladder files.
function toQuarterBeats(fraction) {
  const wholeNoteNumerator = fraction.GetExpandedNumerator();
  const wholeNoteDenominator = fraction.Denominator;
  const quarterNumerator = wholeNoteNumerator * 4;
  const g = gcd(quarterNumerator, wholeNoteDenominator) || 1;
  return { numerator: quarterNumerator / g, denominator: wholeNoteDenominator / g,
           value: (quarterNumerator / g) / (wholeNoteDenominator / g) };
}
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }

function deriveNoteId({ measureNumber, staff, voice, onset, chordPosition }) {
  // structural, deterministic, no array index / renderer input (D-09)
  return `m${measureNumber}-s${staff}-v${voice}-o${onset.numerator}_${onset.denominator}-c${chordPosition}`;
}

if (typeof module !== "undefined") module.exports = { walkNotes, toQuarterBeats, deriveNoteId, gcd };
if (typeof globalThis !== "undefined") globalThis.ScoreModel = { walkNotes, toQuarterBeats, deriveNoteId, gcd };
```

### Pattern 2: Tie resolution uses `Note.NoteTie.StartNote`, not `TieTypes`

**What:** `Note.NoteTie` (getter, returns a `Tie` object or `undefined`) is what to check. A note is the start of a tie group if `note.NoteTie && note.NoteTie.StartNote === note`; it is a tied continuation if `note.NoteTie && note.NoteTie.StartNote !== note`. Per D-03, continuation notes are **not** a separate onset in the score model — fold their `Length` into the start note's duration and exclude the continuation note from the model's note list entirely.

**When to use:** Every time a note is visited in the walk (Pattern 1) — check tie status before deciding whether to emit a model entry for it.

**Example:**
```javascript
// Inside the walk from Pattern 1, building the flat note list:
const notesById = new Map();
walkNotes(osmd.Sheet, ({ measureNumber, staff, voice, onset, chordPosition, note }) => {
  const tie = note.NoteTie;
  const isContinuation = tie && tie.StartNote !== note;
  if (isContinuation) {
    // find the start note's already-emitted id and extend its duration instead of adding a new entry
    const startId = deriveNoteId({ measureNumber: /* recompute from tie.StartNote's own position */ });
    // (in practice: track tie -> id-of-start-note in a side WeakMap while walking, since the
    //  start note's measure/onset may differ from the continuation note's)
    return;
  }
  const id = deriveNoteId({ measureNumber, staff, voice, onset, chordPosition });
  notesById.set(id, { id, measureNumber, staff, voice, onset, chordPosition,
    pitch: note.isRest() ? null : note.Pitch.ToStringShort(),
    halfTone: note.isRest() ? null : note.halfTone,
    duration: toQuarterBeats(note.Length), tie: Boolean(tie) });
});
```

### Anti-Patterns to Avoid

- **Reading `Fraction.RealValue` and treating it as quarter-note beats directly:** it's whole-note beats (Pitfall 2). Every onset/duration value pulled from OSMD needs the ×4 rational conversion in Pattern 1 before it satisfies D-10.
- **Checking `Tie.Type` (the `TieTypes` enum) to decide tie start/stop:** `TieTypes` is `SIMPLE | HAMMERON | PULLOFF | SLIDE | TAPPING` — guitar-tab articulation, unrelated to whether a note is a tie start or continuation (Pitfall 3). Use `Note.NoteTie.StartNote === note` instead.
- **Building the `noteId → SVG` map right after `osmd.load()`:** `EngravingRules.GNote(note)` already returns a valid object after `load()` alone (graphical notes are constructed during `updateGraphic()`, which `load()` triggers), but `getSVGGElement()` returns `null` until a real `render()` has actually drawn pixels — [VERIFIED: opensheetmusicdisplay@2.1.2 runtime probe, this session — after `osmd.load(xml)` without calling `osmd.render()`, `GNote() returned: a` (a real object) but `getSVGGElement()` on it returns `null` because no SVG backend has drawn anything yet]. Build the map after `render()`, and rebuild it after every re-render (D-16's resize case).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MusicXML/.mxl parsing | A second XML/zip reader for the analysis side | OSMD's own parsed `osmd.Sheet` (walked per Pattern 1) | Two independent parsers create two note-id spaces that must be kept in sync by hand — a real source of the exact class of alignment bug this rebuild exists to avoid, per CLAUDE.md's "What NOT to Use" |
| `.mxl` unzip | A separate JSZip/fflate call before handing bytes to OSMD | `osmd.load(file)` directly on the `File`/`Blob` — OSMD bundles JSZip and unzips internally | [VERIFIED: `grep -o "JSZip" build/opensheetmusicdisplay.min.js` found 3 occurrences in the compiled 2.1.2 bundle, this session] and [CITED: web search corroborating "OpenSheetMusicDisplay: The library uses JSZip for handling compressed MXL files... creates an MXLFile object and calls tryUnzip()"] |
| Quarter-note beat math | Ad hoc float arithmetic on note durations | The rational (numerator/denominator) conversion in Pattern 1 | Float `RealValue * 4` accumulates rounding error across dotted/eighth values exactly the class of bug D-10 calls out ("survives dotted and eighth values exactly") |

**Key insight:** every "don't hand-roll" here is really the same rule in three places — OSMD's parsed model is the single source of truth for "what note is where," and every value the score model needs should come *out* of that model via exact (rational, not float) transformations, never re-derived independently.

## Common Pitfalls

### Pitfall 1: Chrome blocks `type="module"` imports of local files from `file://`
**What goes wrong:** If `score-model.js` (or any file the app needs) is loaded via `<script type="module" src="./score-model.js">` and the HTML itself was opened as `file:///C:/.../index.html`, Chrome enforces CORS on the module fetch, and there is no origin under `file://` to satisfy it — the import fails silently or with a CORS-shaped console error.
**Why it happens:** ES modules fetch their imports via the same-origin-checked `fetch`-like mechanism regardless of protocol; classic (non-module) `<script src>` tags do not have this restriction.
**How to avoid:** Keep any file that must be shared between the browser app and `node:test` as a classic script (no `type="module"`), attaching its exports to `globalThis` for the browser and to `module.exports` for Node — exactly the pattern already used by `prototype/piano-core.js` + `prototype/piano-core.test.cjs` in this repo. OSMD itself is fine to load as `type="module"` from a CDN, because a CDN request has a real origin and CORS headers; the restriction only bites *local* file-to-file module imports under `file://`.
**Warning signs:** A blank page with a browser console error mentioning CORS or "Cross origin requests are only supported for protocol schemes: http, data, ...".
**Confidence:** [CITED: multiple corroborating community sources — GitHub Discussions #65033, freeCodeCamp forum, xjavascript.com — this is a well-known, long-standing Chrome/file:// restriction, not something specific to this project's stack]

### Pitfall 2: OSMD's `Fraction` unit is a whole note, not a quarter note
**What goes wrong:** `VoiceEntry.Timestamp`, `Note.Length`, and `Note.getAbsoluteTimestamp()` are all Fractions where **1 = one whole note**, not one quarter note. Reading `.RealValue` and treating it as "beats" (quarter-note units, per D-10) silently produces a model where every value is 4× too small.
**Why it happens:** It's not obviously documented in the `.d.ts` comments (which just say "The relative timestamp within the source measure" with no unit) — it only shows up by actually running the parser.
**How to avoid:** Convert every OSMD Fraction to quarter-note beats via `numerator * 4` over the same `denominator` (see Pattern 1's `toQuarterBeats`), done as exact integer/rational math, not `RealValue * 4`.
**Warning signs:** A 4/4 measure's notes summing to duration `1` instead of `4`; a quarter note reporting duration `0.25` instead of `1`.
**Confidence:** [VERIFIED: opensheetmusicdisplay@2.1.2 runtime probe, this session — loaded a MusicXML measure with `divisions=2`, a whole note (bass, duration=8) and four quarter notes (duration=2 each, treble); the whole note reported `length= 1 0 1` (Numerator=0, Denominator=1, WholeValue=1, RealValue=1) while each quarter note reported `length= 0.25 1 4` (Numerator=1, Denominator=4, RealValue=0.25). A dotted quarter (3 eighths) in a second probe reported `len.Num=3 len.Den=8 ... len.Real=0.375` — i.e. 3/8 of a whole note = 1.5 quarter-note beats after the ×4 conversion, confirming the conversion is exact and rational-preserving.]

### Pitfall 3: `TieTypes` is not "is this note tied" — it's guitar-tab articulation
**What goes wrong:** A developer searching the OSMD types for "tie" finds the `TieTypes` enum (`SIMPLE | HAMMERON | PULLOFF | SLIDE | TAPPING`) and assumes it encodes tie start/stop. It does not — `HAMMERON`/`PULLOFF`/`SLIDE`/`TAPPING` are guitar-tab-specific articulations; `SIMPLE` is the default/normal tie.
**Why it happens:** The enum's name (`TieTypes`) is a strong false-cognate for "which end of the tie this note is."
**How to avoid:** Use `Note.NoteTie` (present/absent) plus `Note.NoteTie.StartNote === note` (start vs. continuation), as shown in Pattern 2. Never branch on `Tie.Type` for this project's tie-resolution logic.
**Warning signs:** Code that switches on `tie.Type` to decide "is this the first or second note of the tie" will always take the same branch (almost every real-world tie is `TieTypes.SIMPLE`), which is a strong hint the wrong field is being read.
**Confidence:** [VERIFIED: opensheetmusicdisplay@2.1.2 source, `Common/Enums/TieTypes.d.ts:1-10` — `export declare enum TieTypes { "SIMPLE" = "", "HAMMERON" = "H", "PULLOFF" = "P", "SLIDE" = "S", "TAPPING" = "T" }`; cross-checked at runtime this session — a probed tied pair of C5 quarter notes reported `tie= start` on the first note and `tie= continue/stop` on the second, determined via `tie.StartNote === n`, with `Tie.Type` never consulted]

### Pitfall 4: `.mxl` bytes must stay binary end-to-end, or JSZip reports a "corrupted zip" error unrelated to the actual file
**What goes wrong:** If the `.mxl` `File`/`Blob` is read as text (e.g., accidentally passed through a `FileReader.readAsText()` or a string-based fetch before reaching `osmd.load()`), the bundled JSZip unzip step fails with an error like `Corrupted zip: missing N bytes` — a real, reproducible failure mode, not a sign the file itself is bad.
**Why it happens:** `.mxl` is a binary zip container; any codepath that treats it as a string (even implicitly, via wrong encoding) corrupts the byte stream before JSZip ever sees it.
**How to avoid:** Pass the `File` object straight from `<input type="file">`'s `files[0]` into `osmd.load(file)` — `File` already **is** a `Blob`, and OSMD reads it as binary internally. Do not read it into a string first "to inspect it" or "to detect the file type" — sniff the extension or the first two bytes (`PK`) as a `Uint8Array` if a type check is needed before calling `load()`.
**Warning signs:** `.mxl` files fail to load with a byte-count-mismatch error while `.musicxml`/`.xml` files from the same source work fine.
**Confidence:** [CITED: web search — "When reading MXL files, the file must be read as binary, otherwise JSZip will throw an error like 'corrupted zip: missing 37 bytes'"] reproduced independently this session: a jsdom/Node harness probe that constructed a `Blob` via a code path with a subtle byte-copy issue hit the identical error class (`Corrupted zip: missing 188 bytes`) — the error message format matches exactly, confirming this is a known JSZip failure signature rather than a one-off. **Caveat:** none of the five verification-ladder files are `.mxl` (all five are uncompressed `.musicxml` per D-05/D-06), so this code path is not exercised by the D-07 fixture tests or the at-the-piano ladder check — flag this as a coverage gap against SCORE-01's explicit `.mxl` promise; consider a lightweight synthetic `.mxl` fixture (zip one of the existing ladder files) purely to exercise the file-type-detection code path, even without a dedicated at-the-piano check for it in this phase.

### Pitfall 5: `Staff.Id`/`Voice.VoiceId` are correct as read, but only confirmed for two-staff grand-staff input so far
**What goes wrong:** D-10 requires "staff is 1 or 2 as in the file, voice as in the file" — confirmed exactly correct for a two-staff piano part in this session's probe (`Staff.Id = 1`/`2` matching `<staff>1</staff>`/`<staff>2</staff>`; `Voice.VoiceId = 1`/`5` matching `<voice>1</voice>`/`<voice>5</voice>`). Ladder rung 1 (right hand only) may be a genuinely single-staff instrument with no `<staff>` element in the XML at all (MusicXML defaults an omitted `<staff>` to 1) — this specific shape (single-staff, no explicit `<staff>` element) was not run through the probe this session.
**Why it happens:** Untested code paths for input shapes that differ from what was exercised.
**How to avoid:** D-07 already requires an exact fixture test per ladder rung — rung 1's test will catch this immediately if the default-staff assumption is wrong, so no extra defensive code is needed beyond writing that test honestly (assert the expected staff value, don't just assert "no crash").
**Warning signs:** Rung 1's fixture test failing on the staff field specifically, while rungs 2–5 pass.
**Confidence:** [VERIFIED: opensheetmusicdisplay@2.1.2 runtime probe, this session, for the two-staff case] / [ASSUMED for the single-staff-no-explicit-element case — standard MusicXML default behavior, not run through the probe this session]

## Code Examples

### Loading a file and building the model (browser side)

```javascript
// score-renderer.js (classic script; OSMD imported as type=module from CDN in index.html
// and exposed on window, or re-exported to a shared global the classic scripts can see)

const fileInput = document.querySelector("#piece-file");
fileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0]; // a File, which is-a Blob — pass straight through (Pitfall 4)
  const osmd = new OpenSheetMusicDisplay(document.querySelector("#notation-container"), {
    autoResize: false, // D-16: fit-to-width once on load/resize, not a continuous auto-resize loop
  });
  await osmd.load(file); // handles .musicxml/.xml/.mxl uniformly
  osmd.render();

  const model = ScoreModel.extract(osmd.Sheet); // Pattern 1 + Pattern 2, pure, no OSMD objects retained
  const svgMap = ScoreRenderer.buildNoteIdToSvgMap(osmd, model); // built AFTER render()
  InspectTable.render(model); // D-12
});

window.addEventListener("resize", () => {
  // D-16: re-render must keep the inspect table and id map correct.
  osmd.render();
  svgMap = ScoreRenderer.buildNoteIdToSvgMap(osmd, model); // REBUILD, do not reuse stale elements (Pitfall 13 in project ARCHITECTURE.md research)
});
```

### node:test fixture harness (real OSMD parsing, no browser)

```javascript
// test/osmd-node-env.cjs — minimal jsdom shim proven to work with opensheetmusicdisplay@2.1.2
// in this session (Node v24.11.1). Only enough globals for osmd.load() to succeed; render()
// still needs a real browser canvas (text measurement) and is NOT exercised by these fixtures —
// visual rendering correctness is verified at the piano (D-04), not here.
const { JSDOM } = require("jsdom");
function installOsmdNodeEnv() {
  const dom = new JSDOM(`<div id="c"></div>`, { pretendToBeVisual: true });
  for (const key of ["window", "document", "navigator", "HTMLElement", "Image",
                      "DOMParser", "XMLSerializer", "Node", "Element"]) {
    global[key] = dom.window[key];
  }
  global.getComputedStyle = dom.window.getComputedStyle;
  global.SVGElement = dom.window.SVGElement || function () {};
  global.SVGGElement = dom.window.SVGGElement || function () {};
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.cancelAnimationFrame = clearTimeout;
  return dom;
}
module.exports = { installOsmdNodeEnv };
```

```javascript
// test/score-model.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { installOsmdNodeEnv } = require("./osmd-node-env.cjs");
installOsmdNodeEnv();
const { OpenSheetMusicDisplay } = require("opensheetmusicdisplay/build/opensheetmusicdisplay.min.js");
const { walkNotes, toQuarterBeats, deriveNoteId } = require("../src/score-model.js");

test("rung 1 (right hand C D E F G) produces the exact expected note list", async () => {
  const xml = fs.readFileSync("fixtures/01-right-hand.musicxml", "utf8");
  const osmd = new OpenSheetMusicDisplay(document.getElementById("c"), { autoResize: false });
  await osmd.load(xml); // no render() needed — model fields are populated by load() alone
  const notes = [];
  walkNotes(osmd.Sheet, (n) => notes.push(n));
  assert.equal(notes.length, 5);
  assert.equal(notes[0].note.Pitch.ToStringShort(), "C2"); // OSMD's octave-numbering offset — confirm against your fixture
  // ... assert the full measure/staff/voice/onset/duration/pitch list per D-07
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Testing OSMD-dependent logic only via a real browser (Playwright/manual) | Driving the real OSMD 2.1.2 bundle through `node:test` + jsdom for parsing-only assertions | Proven working in this session (Node v24.11.1, jsdom 29.1.1, opensheetmusicdisplay 2.1.2) | Fixture tests (D-07) can assert against real parser behavior instead of a hand-written mock, catching drift like Pitfall 2's whole-note-unit surprise automatically on every run |

**Deprecated/outdated:** None — this is the first phase of a greenfield project; there is no prior version of this score model to deprecate.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Staff.Id` defaults to `1` for a single-staff instrument with no explicit `<staff>` element in the XML (ladder rung 1's likely shape) | Pitfall 5 | Low — D-07's rung-1 fixture test will catch this immediately since it asserts exact expected staff values; no downstream code depends on this before the test exists |
| A2 | jsdom `^30` (registry latest) behaves identically to the `29.1.1` actually exercised in this session for the `osmd.load()` parsing-only path | Standard Stack | Low — if the planner pins the exact `29.1.1` used here instead of `^30`, this risk is eliminated entirely; otherwise, a version bump could theoretically change DOMParser/Blob behavior in a way that affects only `render()` (already out of scope for these tests), not `load()` |
| A3 | `jsdom` as a package name is correct (training knowledge, not sourced from an official OSMD or Node doc) | Standard Stack | Low — confirmed to exist and be legitimate via `package-legitimacy check` and a live `npm view` this session, but per the package-name provenance rule this is still `[ASSUMED]` until read from an authoritative doc |

## Open Questions (RESOLVED)

1. **Does `MeasureNumberXML` ever disagree with `MeasureNumber` for the five ladder files?** — RESOLVED: Plan 01-01 uses `MeasureNumberXML`; the rung 1–5 fixture tests assert exact measure numbers, so any discrepancy fails a test.
   - What we know: `MeasureNumberXML` reads the literal `<measure number="...">` attribute (confirmed this session: `MeasureNumberXML: 1` for `<measure number="1">`); `MeasureNumber` is a separate getter/setter that may apply internal renumbering logic (not investigated — its purpose is undocumented in the `.d.ts` beyond "The unique measure list index").
   - What's unclear: whether any real-world MuseScore export (rung 5) could produce a case where these two differ within the four populated measures.
   - Recommendation: use `MeasureNumberXML` per D-10's literal wording ("follows the MusicXML `number` attribute"); the D-07 fixture test for rung 5 will surface any discrepancy immediately since it asserts exact expected measure numbers.

2. **Exact string format `Pitch.ToStringShort()` produces for accidentals and how it should feed "pitch name and MIDI number" in the D-12 inspect table.** — RESOLVED: planning probes pinned MIDI = `halfTone + 12` (middle C = 60) and `ToStringShort(3)` → `C4`, `F#5`, `Eb3`; Plan 01-01 tests both.
   - What we know: `ToStringShort()` exists and returns a short representation like "A4 (A, octave 4), Ab5 or C#4" per its own doc comment; `halfTone` gives a transposed half-tone number directly usable as a MIDI-adjacent value (not confirmed this session to be exactly MIDI note number 0–127 — OSMD's internal octave numbering in this session's probe printed "octave: 2" for what MusicXML called `<octave>5</octave>`, an offset worth confirming precisely before wiring the inspect table's "MIDI number" column).
   - What's unclear: the exact halfTone-to-MIDI-note-number mapping/offset.
   - Recommendation: the D-12 table's "pitch name" column can use `ToStringShort()` directly; before wiring "MIDI number," write a tiny fixture assertion (part of the D-07 tests) pinning a known note (e.g., middle C) to its expected MIDI number (60) against `note.halfTone`, and derive the offset empirically from that rather than assuming.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Running `node:test` fixtures, `npm pack`/`npm view` for verification | ✓ | v24.11.1 (confirmed this session) | — |
| npm | Installing dev-only `jsdom`, checking package versions | ✓ | 11.6.2 (confirmed this session) | — |
| Chrome (target browser) | Actually running the app, all at-the-piano verification | Not probed from this shell (Windows GUI browser, not shell-invokable) | — | None needed — it's the explicit target platform per PROJECT.md; verification is manual, at the piano, per VRFY-01 |
| Internet access (first load) | Fetching OSMD from jsDelivr `+esm` CDN, per D-13 | Not probed from this shell | — | None — D-13 explicitly accepts "laptop needs internet the first time and Chrome caches afterwards" as the tradeoff for zero local build step |
| MuseScore 4 CLI | Producing ladder rung 5 from the user's `.mscz` file, per D-06 | Not probed from this shell (Windows GUI install, path given in D-06) | 4.6.5 per CONTEXT.md | Fallback already specified in D-06 if the user hasn't trimmed the source file: strip trailing empty measures from the exported MusicXML in the build step |

**Missing dependencies with no fallback:** none identified for this phase.
**Missing dependencies with fallback:** MuseScore CLI export shape (D-06 already specifies its own fallback).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (Node.js built-in, stable since v20; this machine confirmed v24.11.1) |
| Config file | none — `node --test` needs no config |
| Quick run command | `node --test test/score-model.test.cjs` |
| Full suite command | `node --test` (walks `test/` for `*.test.cjs`; only a handful of fixture files at this phase's scale) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCORE-03 | Every ladder rung's note list (measure, staff, voice, onset, duration, pitch, resolved ties) matches the exact expected list | unit (fixture, real OSMD parser via jsdom) | `node --test test/score-model.test.cjs` | ❌ Wave 0 |
| SCORE-03 | Whole-note-to-quarter-beat conversion is exact for whole/half/quarter/eighth/dotted values | unit | `node --test test/score-model.test.cjs` | ❌ Wave 0 |
| SCORE-03 | A tied pair collapses to one model note with combined duration, no separate onset for the continuation | unit (rung with an added synthetic tie fixture, per D-03) | `node --test test/score-model.test.cjs` | ❌ Wave 0 |
| SCORE-01 | `osmd.load()` succeeds and produces the expected measure/staff/voice/note counts for each of the 5 ladder files (parsing-only smoke check) | unit (jsdom, no render) | `node --test test/score-model.test.cjs` | ❌ Wave 0 |
| SCORE-01 | The file renders as real, correctly-notated notation in actual Chrome, with the right notes on the right staff | manual-only | — (VRFY-01: user opens each ladder file in Chrome at the FP-60X) | n/a — cannot be automated without a real browser canvas/text-measurement backend; jsdom cannot render pixels (confirmed this session: `render()` throws `HTMLCanvasElement's getContext()... without installing the canvas npm package`, and even with a canvas polyfill, "looks right on screen" is a human judgment) |
| D-11 | `noteId → SVG element` map is complete (every model note maps to a real, non-null SVG element) after render, and survives a window resize | manual-only, or optional Playwright if the planner wants automation | — (visual check at the piano session, or a real-Chromium Playwright test if added) | n/a this phase — jsdom cannot produce real `SVGGElement`s (confirmed this session: `getSVGGElement()` returns `null` without a working canvas render) |

### Sampling Rate
- **Per task commit:** `node --test test/score-model.test.cjs`
- **Per wave merge:** `node --test` (full suite — trivially fast at this scale)
- **Phase gate:** Full suite green, then the manual-only rows above, before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `package.json` with `devDependencies: { jsdom: "^30" }` (or pin `29.1.1`, the exact version this research validated — see Assumption A2) — none exists yet in the repo
- [ ] `test/osmd-node-env.cjs` — the jsdom global-shim helper (Code Examples, proven working this session)
- [ ] `test/score-model.test.cjs` — per-ladder-rung fixture tests (D-07)
- [ ] The 5 ladder MusicXML fixture files themselves (`fixtures/01..05-*.musicxml`) — this phase's own deliverable, per D-04/D-05/D-06, not yet in the repo
- [ ] `src/score-model.js` — the pure extraction module (Pattern 1 + Pattern 2)

## Sources

### Primary (HIGH confidence — read and executed directly this session)
- `opensheetmusicdisplay@2.1.2` package, fetched via `npm pack` into the scratchpad — `.d.ts` type declarations read directly: `Note.d.ts`, `VoiceEntry.d.ts`, `SourceMeasure.d.ts`, `SourceStaffEntry.d.ts`, `VerticalSourceStaffEntryContainer.d.ts`, `Staff.d.ts`, `Voice.d.ts`, `Fraction.d.ts`, `Pitch.d.ts`, `Tie.d.ts`, `TieTypes.d.ts`, `GraphicalNote.d.ts`, `GraphicalVoiceEntry.d.ts`, `VexFlowGraphicalNote.d.ts`, `Cursor.d.ts`, `OpenSheetMusicDisplay.d.ts`, `MusicSheet.d.ts`, `Instrument.d.ts`, `EngravingRules.d.ts` (grep'd for `GNote`), and `package.json` (`main`/`types`/`files` fields)
- `opensheetmusicdisplay@2.1.2`'s actual compiled bundle (`build/opensheetmusicdisplay.min.js`), executed against real hand-authored MusicXML in a Node v24.11.1 + jsdom harness this session — produced every `[VERIFIED: ... runtime probe, this session]` claim above (whole-note Fraction unit, `Staff.Id`/`Voice.VoiceId` reading literal XML values, chord = one `VoiceEntry` with N `Note`s in document order, tie via `NoteTie.StartNote`, `GNote()`/`getSVGGElement()` present but null pre-render, `.mxl` Blob detection path engaging JSZip)
- `npm view opensheetmusicdisplay@2.1.2 version time.modified` and `npm view jsdom version time.modified`, run this session
- `gsd-tools query package-legitimacy check --ecosystem npm opensheetmusicdisplay jsdom`, run this session

### Secondary (MEDIUM confidence)
- Web search, corroborated: Chrome `file://` + `type="module"` CORS restriction (GitHub Discussions #65033, freeCodeCamp forum, xjavascript.com)
- Web search, corroborated: `node:test` runs plain `.js` files with zero build step, stable since Node 20
- Web search, corroborated: OSMD's `.mxl` support via bundled JSZip, `MXLFile`/`tryUnzip()`, and the "must be read as binary or JSZip throws 'corrupted zip: missing N bytes'" failure mode — the exact error-message shape was independently reproduced in this session's own probe attempts

### Tertiary (LOW confidence)
- None — every claim in this document is either a direct source read, a runtime execution this session, or a web-search-corroborated citation.

## Metadata

**Confidence breakdown:**
- Score-model extraction API surface (measure/staff/voice/onset/duration/pitch/tie/chord-position): HIGH — read from source AND executed against real MusicXML this session
- `noteId → SVG` map mechanics (`GNote`, `getSVGGElement`): HIGH for API existence (source-read + runtime-confirmed present); MEDIUM for full end-to-end SVG population, since a real browser render (not jsdom) is needed to see a non-null element
- `.mxl` loading: MEDIUM — bundled-JSZip presence and code-path engagement confirmed; full byte-level round trip not cleanly reproduced in the Node/jsdom probe environment (a probe-harness limitation, not a demonstrated product defect) and not exercised by any of the five ladder files
- file:// module-loading restriction: MEDIUM — well-established web-platform behavior, web-search corroborated, not project-specific to verify further
- node:test usage: HIGH — this machine's Node version and the `node --test` command are directly confirmed; the shared classic-script pattern is directly copied from the prototype already in this repo (`prototype/piano-core.js` / `piano-core.test.cjs`, read this session)

**Research date:** 2026-09-13
**Valid until:** OSMD API surface facts are pinned to `2.1.2` specifically and don't expire until the phase upgrades that dependency; the file:///CORS and node:test facts are stable web-platform/runtime behavior, good indefinitely at typical GSD 30-day research freshness windows.
