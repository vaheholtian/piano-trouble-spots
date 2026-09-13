# Architecture Research

**Domain:** Browser-based MIDI piano practice tool (score-aligned mistake detection)
**Researched:** 2026-09-13
**Confidence:** MEDIUM-HIGH (component boundaries and data flow: HIGH, informed by direct system reasoning plus verified Web Audio/Web MIDI/OSMD API facts; alignment-algorithm choice: MEDIUM, drawn from MIR literature via web search, not hands-on verified)

## Standard Architecture

Systems in this space — score-following practice tools, MIR performance analyzers, DAW-adjacent browser apps — converge on the same shape: a **pure analysis core** with no DOM/audio dependencies, fed by **capture adapters** (MIDI, clock) on one side and driving **render adapters** (notation SVG) on the other, with a **persistence layer that stores raw inputs, not conclusions**, so the pure core can be re-run as it improves.

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          CAPTURE (browser APIs)                       │
├──────────────────┬──────────────────┬─────────────────────────────────┤
│  MIDI Input       │  Metronome Clock  │  Rep Boundary Marker            │
│  (Web MIDI)       │  (Web Audio)      │  (keyboard/pedal event)         │
│  → raw MIDI events│  → scheduled beat │  → rep-start/rep-end timestamps │
│    + timestamps   │    timeline       │                                  │
└─────────┬─────────┴─────────┬────────┴────────────────┬────────────────┘
          │                   │                          │
          ▼                   ▼                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    PERSISTENCE (IndexedDB, raw + derived)             │
│  Pieces │ Score models │ Sessions │ Repetitions │ RAW EVENT LOG        │
│  (derived: alignments/metrics are cached, never the only copy)        │
└─────────┬───────────────────────────────────────────────────┬────────┘
          │ raw events replayed in                             │ score model
          ▼                                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                 ANALYSIS CORE (pure functions, no DOM/no audio)       │
│  ┌─────────────┐  ┌───────────────┐  ┌───────────────┐  ┌──────────┐ │
│  │ Score Model  │  │ Alignment     │  │ Metrics        │  │ Aggreg-  │ │
│  │ (MusicXML→   │→│ (perf ↔ score │→│ (timing,       │→│ ation    │ │
│  │  canonical)  │  │  edit-distance)│  │  velocity/bar) │  │ (habits) │ │
│  └─────────────┘  └───────────────┘  └───────────────┘  └──────────┘ │
└─────────┬──────────────────────────────────────────────────┬────────┘
          │ score model + note IDs                            │ annotation set
          ▼                                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    RENDER (DOM, one-way consumer)                     │
│  Score Renderer (OSMD/VexFlow → SVG)  →  Annotation Layer (paint IDs)  │
└──────────────────────────────────────────────────────────────────────┘
```

The critical property this diagram is meant to convey: **arrows into the Analysis Core carry data, arrows out of it carry results — nothing about DOM elements, audio nodes, or MIDI ports ever crosses into that box.** Everything in Capture and Render is a thin, swappable adapter around a browser API; everything in Analysis Core is deterministic, unit-testable TypeScript that can run in Node with fixture JSON.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| MusicXML Loader | Parse MusicXML into a canonical score model: notes with onset (beats), duration, pitch (MIDI number), staff, voice, measure index, tie/chord grouping resolved | Hand-rolled parser over the OSMD-internal model, or walk OSMD's own `Sheet`/`Instrument`/`Note` object graph after it parses the file — do not write a second independent MusicXML parser |
| Score Model | Canonical, renderer-agnostic representation of "what should be played": ordered note/chord events per voice/staff/measure, each with a stable `noteId` | Plain TypeScript interfaces + arrays, structurally shareable, serializable to IndexedDB |
| Score Renderer | Render the score model as real notation (SVG) and expose a stable mapping from `noteId` → SVG element for painting | OpenSheetMusicDisplay (OSMD), which wraps VexFlow; `osmd.rules.GNote(note)` / `osmd.cursor.GNotesUnderCursor()` return a `GraphicalNote` whose `.getSVGGElement()` gives the actual SVG `<g>`, paintable in place without a full re-render |
| MIDI Capture | Listen to Web MIDI input, timestamp every note-on/note-off with velocity, buffer as raw events | `navigator.requestMIDIAccess()` → `MIDIInput.onmidimessage`; store `event.timeStamp` (DOMHighResTimeStamp, same clock as `performance.now()`) verbatim, do no interpretation at this layer |
| Metronome / Clock | Own the current tempo and the "expected timeline" — the sequence of beat times a passage should land on at the chosen BPM — and produce audible clicks | Web Audio `AudioContext` with a look-ahead scheduler (25ms poll interval, ~100ms schedule-ahead window); the scheduled beat-time list this produces IS the expected timeline used by alignment, not a separate calculation |
| Clock Correlator | One small utility: convert between the MIDI capture clock (`performance.now()`-relative) and the AudioContext clock (context-relative) with a single fixed offset | Sample `AudioContext.getOutputTimestamp()` (or `performance.now()` alongside `audioContext.currentTime`) once at session start; apply the constant offset everywhere downstream — do not re-derive it per note |
| Repetition Segmenter | Turn a continuous stream of raw MIDI + marker events into discrete repetition windows (start/end timestamp pairs) | Manual: a marker event (spacebar/pedal/spare key) closes the previous rep and opens the next; purely a slicing operation over the raw event log, not an analysis step |
| Alignment Engine | Given one repetition's raw performance events + the score model + the expected timeline, produce a match/substitution/deletion/insertion labeling per expected note and per played note | Sequence alignment (Needleman-Wunsch-style global alignment / edit distance) over onset-windowed note-or-chord tokens, not raw DTW — see Architectural Pattern 2 |
| Metrics Engine | From an alignment result, compute per-note onset deviation vs. expected timeline, per-bar tempo drift, per-note velocity relative to neighbours | Pure functions over the alignment output; no knowledge of MIDI/DOM |
| Aggregator | Combine metrics across many repetitions (and sessions) into habit statistics: counts, rates, trend over time, keyed by `noteId`/measure | Pure functions folding an array of per-repetition results into a summary structure; recomputable from stored raw data at any time |
| Persistence | Store pieces, score models (or MusicXML source + parse-on-load), sessions, repetitions, and the **raw MIDI event log** durably; store derived analysis as a cache, not as the source of truth | IndexedDB via the `idb` promise wrapper; export/import as a JSON/zip file for portability |
| Annotation Layer | Take the Aggregator's output (a set of `{noteId or measureIndex, mistakeKind, severity/rate}` records) and paint it onto the renderer's SVG | Thin adapter calling into the Score Renderer's `noteId → SVG element` map; the only component allowed to touch both "analysis result" shapes and DOM |
| App/UI State | Wire the above together: which piece is loaded, which passage is selected, is a session recording, current tempo | A lightweight store (Zustand/Redux/plain signals) — deliberately not listed as an architectural centerpiece; keep it thin, push logic down into the pure core |

## Recommended Project Structure

```
src/
├── score/                     # MusicXML → canonical score model (pure, no DOM)
│   ├── musicxml-parser.ts     # loads MusicXML, resolves ties/chords/voices
│   ├── score-model.ts         # types: Note, Chord, Measure, Voice, Passage
│   └── score-model.test.ts
├── capture/                   # Browser-API adapters — thin, side-effecting
│   ├── midi-input.ts          # Web MIDI wiring → raw event emission
│   ├── clock.ts                # AudioContext look-ahead scheduler + clock correlator
│   └── rep-marker.ts          # keyboard/pedal → segment boundary events
├── analysis/                  # PURE CORE — no DOM, no Web MIDI, no Web Audio imports
│   ├── alignment/
│   │   ├── align.ts           # score ↔ performance sequence alignment
│   │   ├── tokens.ts          # note/chord tokenization, onset windowing
│   │   └── align.test.ts      # fixture-driven: JSON in, labeled diff out
│   ├── metrics/
│   │   ├── timing.ts          # onset deviation, per-bar tempo drift
│   │   ├── dynamics.ts        # relative velocity vs neighbours
│   │   └── metrics.test.ts
│   ├── aggregate/
│   │   ├── habits.ts          # fold many repetitions into habit stats
│   │   └── habits.test.ts
│   └── types.ts               # RawEvent, AlignmentResult, MetricResult, Habit — shared contracts
├── persistence/                # IndexedDB via idb; raw-event-first schema
│   ├── db.ts                   # schema/migrations
│   ├── pieces-repo.ts
│   ├── sessions-repo.ts
│   ├── raw-events-repo.ts      # the single most important table
│   └── export-import.ts        # file-based backup/restore
├── render/                     # DOM-touching — OSMD wrapper + annotation painting
│   ├── score-renderer.ts       # OSMD setup, noteId → SVG element map
│   ├── annotation-layer.ts     # paints AggregateResult onto SVG (color/opacity by mistake kind)
│   └── cursor.ts                # passage selection, playback cursor
├── ui/                          # React/Svelte components + app state
│   ├── state/
│   └── components/
└── app.ts                       # composition root — wires capture → persistence → analysis → render
```

### Structure Rationale

- **`analysis/` has a hard import boundary:** nothing under `analysis/` may import from `capture/`, `render/`, or any browser-only global (`document`, `AudioContext`, `MIDIAccess`). Enforce this with an ESLint `no-restricted-imports` rule per-folder, not just convention — it is the single highest-leverage rule in this codebase, because it is what makes the alignment/metrics/aggregation logic testable with plain fixture JSON and safely re-runnable months later against old raw data.
- **`capture/` and `render/` are both thin and swappable.** Capture could later add a phone/Bluetooth relay (explicitly deferred per PROJECT.md) without touching analysis. Render could swap OSMD for a different renderer without touching analysis, as long as it still produces a `noteId → element` map.
- **`persistence/raw-events-repo.ts` is the load-bearing table.** Every other derived table (alignments, metrics, habits) is a cache keyed by `(pieceId, sessionId, repetitionId, analysisVersion)` that can be dropped and recomputed from `raw-events-repo` + `score` at any time. This is what makes "re-run analysis after improving the alignment algorithm" a real, cheap capability instead of a rewrite.
- **`score/` sits between MusicXML and both `analysis/` and `render/`** as the one shared vocabulary (`noteId`, beat-based onset, measure index) both sides speak. Building it once and keeping it canonical avoids the common failure mode of the renderer and the analysis engine disagreeing about what "note 47" means.

## Architectural Patterns

### Pattern 1: Raw-Event-Sourced Persistence (store inputs, derive everything else)

**What:** Persist the raw MIDI event log (every note-on/note-off, timestamp, velocity) and the raw rep-boundary markers as the durable source of truth for a session. Alignment results, per-note metrics, and aggregated habit stats are all *derived* tables, tagged with an `analysisVersion`, that can be deleted and regenerated from the raw log at any time.

**When to use:** Always, for this project — the roadmap explicitly anticipates alignment and metrics logic improving over multiple phases, and the user's core value ("trust built from many repetitions") depends on being able to re-score old sessions with a better algorithm without asking the user to re-play them.

**Trade-offs:** Slightly more storage (raw events are verbose) and an extra "recompute" step after schema/algorithm changes, in exchange for never losing practice history to an algorithm bug and never forcing a replay to benefit from an improvement.

**Example:**
```typescript
// persistence/raw-events-repo.ts
interface RawEvent {
  repetitionId: string;
  type: 'noteon' | 'noteoff';
  midiNote: number;
  velocity: number;
  timestamp: number; // performance.now()-relative, clock-correlated at capture time
}

// analysis/types.ts
interface AlignmentResult {
  repetitionId: string;
  analysisVersion: string; // bump when align.ts logic changes materially
  matches: NoteMatch[];    // recomputed on demand from RawEvent[] + ScoreModel
}
```

### Pattern 2: Score↔Performance Alignment as Sequence Alignment (not raw DTW)

**What:** Model alignment as a Needleman-Wunsch-style global sequence alignment (dynamic-programming edit distance) between the expected note/chord sequence (from the score model, onset-ordered) and the observed note/chord sequence (from the performance, grouped into chords by an onset window), with per-cell costs for match (same pitch, small onset deviation), substitution (wrong pitch — "wrong note"), deletion (expected note absent — "missed note"), and insertion (played note with no match — "extra note").

**When to use:** For the core wrong/missed/extra note classification this project needs. Raw DTW (pure time-warping) is the more commonly cited technique in music-information-retrieval literature for audio-to-MIDI alignment, but it optimizes a continuous time-warp path and does not naturally produce a discrete match/substitute/insert/delete labeling, and it handles runs of repeated identical notes poorly — exactly the failure modes this project cares most about. A published hybrid (Needleman-Wunsch Time Warping, NWTW) combines DTW's multi-to-one time flexibility with NW's gap-penalty/jump handling specifically for this performance-evaluation use case; a plain NW/edit-distance DP over onset-windowed tokens is a reasonable, simpler starting point for milestone 1, with NWTW-style refinement as a later, isolated improvement to `analysis/alignment/align.ts` only.

**Trade-offs:** A plain edit-distance DP assumes performance and score notes arrive in roughly the same order (true for metronome-anchored passage drilling, per PROJECT.md's constraints) and needs tuned cost weights (onset-deviation penalty, pitch mismatch penalty, gap penalty) that should be treated as data, not hardcoded, so they can be adjusted without touching the DP itself. It does not by itself model expressive tempo variation well — that is handled downstream by feeding it the metronome's expected-beat-timeline rather than a fixed tempo, and by the separate tempo-drift metric.

**Example:**
```typescript
// analysis/alignment/align.ts — pure, no DOM/MIDI/audio imports
interface ScoreToken { noteIds: string[]; pitches: number[]; expectedBeat: number; }
interface PerfToken { midiNotes: number[]; onsetTime: number; velocity: number[]; }

type AlignOp =
  | { kind: 'match'; scoreToken: ScoreToken; perfToken: PerfToken; onsetDeviationMs: number }
  | { kind: 'substitution'; scoreToken: ScoreToken; perfToken: PerfToken } // wrong note
  | { kind: 'deletion'; scoreToken: ScoreToken }                          // missed note
  | { kind: 'insertion'; perfToken: PerfToken };                          // extra note

function align(score: ScoreToken[], perf: PerfToken[], weights: AlignWeights): AlignOp[] {
  // classic O(n*m) DP table over score/perf token sequences
}
```

### Pattern 3: Renderer-Owned Note-ID Map, Analysis-Owned Note-ID Contract

**What:** The score model assigns every note a stable `noteId` when it is parsed from MusicXML (e.g. `measure3-voice1-note2` or a UUID). The Score Renderer, when it renders that same score model, builds and owns a `Map<noteId, SVGGElement>` (via OSMD's `GraphicalNote.getSVGGElement()`). The Analysis Core never touches SVG; it only ever emits and consumes `noteId`. The Annotation Layer is the sole bridge: it takes an aggregated result (`{noteId, mistakeKind, rate}[]`) and looks up each `noteId` in the renderer's map to paint it.

**When to use:** From the very first phase that renders anything — this contract is what keeps alignment/metrics/aggregation unit-testable against JSON fixtures indefinitely, and what lets the renderer be swapped later without touching analysis.

**Trade-offs:** Requires discipline to keep `noteId` assignment 100% deterministic and stable across re-parses of the same MusicXML (same piece parsed twice must yield identical IDs, or cached alignment results become unusable) — derive IDs structurally (measure index + voice + staff + position-in-measure), never from array index alone or from anything the renderer computes.

**Example:**
```typescript
// render/annotation-layer.ts — the only file allowed to import both analysis types and DOM
function paintAggregate(
  aggregate: HabitAggregate[],
  noteIdToSvg: Map<string, SVGGElement>
): void {
  for (const { noteId, mistakeKind, rate } of aggregate) {
    const el = noteIdToSvg.get(noteId);
    if (el) applyMistakeStyle(el, mistakeKind, rate);
  }
}
```

## Data Flow

### Practice Session Flow

```
[User opens piece] → MusicXML Loader → Score Model → Score Renderer (SVG on screen)
[User picks passage] → Passage = subrange of Score Model (measures/staff filter)
[User sets tempo] → Metronome Clock starts, produces expected-beat-timeline + audible click
[User plays at piano] → MIDI Capture → Raw Events (buffered, clock-correlated)
[User marks rep boundary] → Repetition Segmenter slices Raw Events into a Repetition
      ↓ (every repetition, immediately)
[Persistence] ← Raw Events + Repetition boundaries written to IndexedDB (source of truth)
```

### Analysis Flow (can run live after each rep, or be replayed later from storage)

```
[Persistence: Raw Events for repetition] ──┐
                                            ├─→ [Alignment Engine] → AlignmentResult (match/sub/del/ins per note)
[Score Model: expected notes for passage] ──┘         ↓
                                              [Metrics Engine] → per-note timing + velocity, per-bar tempo drift
                                                       ↓
                        [Persistence] ← cache AlignmentResult + Metrics (derived, versioned, disposable)
                                                       ↓
                          (after N repetitions) [Aggregator] → Habit stats (counts, rates, trend)
                                                       ↓
                                        [Persistence] ← cache Habit stats
                                                       ↓
                                        [Annotation Layer] → paints onto Score Renderer's SVG via noteId map
```

### Key Data Flows

1. **Capture → Persistence is one-directional and immediate.** Raw MIDI events are written to IndexedDB as they arrive (or in small batches), before any analysis runs, so a crash or a bad alignment run never loses the actual performance data.
2. **Persistence → Analysis is replayable.** The Analysis Core's only inputs are Raw Events (from Persistence) and the Score Model (from Score, itself derived from stored MusicXML). Given the same two inputs and the same `analysisVersion`, output is deterministic — this is what makes it fixture-testable and safely re-runnable.
3. **Analysis → Render is one-directional and read-only.** The Annotation Layer only ever reads AlignmentResult/Metrics/Habit data structures and writes to the DOM; nothing flows back from Render into Analysis. The Score Renderer's playback cursor and passage selection are UI state, not analysis inputs (except that "which passage" bounds which score-model notes are the expected sequence).
4. **The Metronome Clock's scheduled-beat-time list doubles as the alignment engine's "expected timeline.**" Do not compute expected note times two different ways (once for the audible click, once for scoring) — one look-ahead scheduler produces both the click and the ground-truth timeline that performance onsets are measured against.

## Scaling Considerations

This is a single-user, browser-only, local-storage tool (per PROJECT.md constraints) — there is no multi-tenant or network scale axis here. The relevant "scale" axes are data volume per user over time and algorithm cost per repetition.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| A session (tens of reps, one sitting) | In-memory alignment/metrics is instant (a passage is a few hundred notes at most); write raw events to IndexedDB per-rep, not per-note, to avoid excessive small transactions |
| A piece over weeks (hundreds of reps across many sessions) | Aggregation must operate on cached per-repetition derived results, not re-run alignment over every historical rep on every app open; recompute only when `analysisVersion` changes or on explicit user request |
| Whole practice history (many pieces, months) | Raw event log becomes the largest table; keep it append-only and indexed by `(pieceId, sessionId)`; export/import (already a requirement) doubles as the backup/prune mechanism — no need for automatic pruning in milestone 1 |

### Scaling Priorities

1. **First bottleneck:** re-running the Alignment Engine over an unbounded rep history whenever habit stats need refreshing. Fix: version-tag derived results (`analysisVersion`) and only recompute reps whose cached result predates the current version; never recompute reps whose result is already current.
2. **Second bottleneck (much later, not milestone 1):** IndexedDB read latency once the raw event log spans many pieces and months. Fix, if it ever matters: paginate by session when loading a piece's history view, and keep the Aggregator's output (habit stats) as the thing the UI reads by default, only pulling raw events on demand (e.g. "show me the actual reps behind this habit").

## Anti-Patterns

### Anti-Pattern 1: Coupling Alignment/Metrics Logic to the DOM or Web MIDI Types

**What people do:** Write the alignment function to accept `MIDIMessageEvent[]` directly, or have it reach into `osmd.cursor` for score timing, because it's convenient when there's only one call site.
**Why it's wrong:** It makes the core analysis logic untestable without a browser, unrunnable in Node for fixture-based unit tests, and impossible to safely evolve — the exact opposite of the "keep analysis pure and testable" requirement this research was asked to protect. It also silently smuggles browser-only assumptions (event timing quirks, DOM node lifecycle) into logic that is supposed to be deterministic and replayable.
**Do this instead:** Define plain data types (`RawEvent`, `ScoreToken`, `AlignmentResult`) in `analysis/types.ts` that `capture/` and `score/` adapt browser data into, and that `render/` adapts results out of. Enforce the boundary with lint rules, not just discipline.

### Anti-Pattern 2: Storing Only the Alignment Result, Not the Raw Performance

**What people do:** Run alignment immediately after each repetition and persist only the summary ("3 wrong notes, 1 missed"), discarding the raw MIDI events to save space or because "we already extracted what we need."
**Why it's wrong:** It makes the alignment/metrics algorithm effectively frozen forever — any improvement to the DP cost weights, chord-grouping window, or tempo-drift formula can only apply to future practice, never to the weeks of history the user has already trusted the product to keep, directly undermining the "trust built from many repetitions over weeks" core value in PROJECT.md.
**Do this instead:** Always persist the raw MIDI event log per repetition as the source of truth; treat every analysis output as a disposable, versioned cache derivable from it.

### Anti-Pattern 3: Two Independent Clocks Without a Correlation Step

**What people do:** Timestamp MIDI events with `performance.now()` and schedule the metronome with `AudioContext.currentTime`, then compare them directly assuming they're the same number.
**Why it's wrong:** `AudioContext.currentTime` is zero-based from context creation while `performance.now()`/`MIDIMessageEvent.timeStamp` are relative to `performance.timeOrigin` (page load) — comparing them raw introduces a constant offset error into every single onset-deviation measurement, silently making all timing analysis wrong by a fixed but unknown amount.
**Do this instead:** Correlate the two clocks once per session (via `AudioContext.getOutputTimestamp()` or a paired sample at startup) and apply that fixed offset everywhere raw MIDI timestamps are compared against the expected beat timeline. Put this in one small `clock.ts` utility, not inline at each comparison site.

### Anti-Pattern 4: Building the Score Model and the Renderer's Internal Model as the Same Object

**What people do:** Use OSMD's internal `Note`/`GraphicalNote` objects directly as the "score model" that alignment and persistence work with, since OSMD already parsed the MusicXML.
**Why it's wrong:** It ties analysis and persistence to a specific rendering library's internal object graph and versioning, makes fixture-based unit tests require instantiating OSMD (defeating the pure-core goal), and makes serializing a score model to IndexedDB awkward (renderer objects are not clean JSON).
**Do this instead:** Define your own minimal `ScoreModel`/`Note`/`Chord` types in `score/score-model.ts`, populate them once from either OSMD's parsed structure or your own MusicXML walk, and treat that as the only score representation analysis/persistence ever see. The renderer is free to build whatever internal structures it needs from that same MusicXML independently.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| OpenSheetMusicDisplay (npm package) | Instantiate against a container `div`, call `.load(musicXmlString)` then `.render()`; access notes via `osmd.Sheet`/cursor for the note-ID map | Built on VexFlow; the project should treat OSMD's parsed structures as an input to build the project's own `ScoreModel` from, not as the ScoreModel itself (Anti-Pattern 4) |
| Web MIDI API (browser built-in) | `navigator.requestMIDIAccess()` → iterate `inputs` → `input.onmidimessage` | Chrome-only concern is already scoped out by PROJECT.md constraints (Chrome/Windows only); no polyfill needed |
| Web Audio API (browser built-in) | `AudioContext` + look-ahead scheduler (25ms poll / 100ms lookahead) for the metronome click and the expected-beat-timeline | This is also the authoritative "expected timeline" the alignment engine scores performance against — do not compute it twice |
| IndexedDB (browser built-in, via `idb` wrapper) | Promise-based CRUD per object store (`pieces`, `sessions`, `repetitions`, `rawEvents`, cached `alignments`/`metrics`/`habits`) | `idb` (Jake Archibald) is the standard lightweight wrapper; plan the schema so `rawEvents` is append-only and everything else is a derived, droppable cache |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `capture/` ↔ `persistence/` | Direct writes of `RawEvent`/`RepetitionBoundary` records, no analysis in between | Keep this path as short and reliable as possible — it's the one flow that must never lose data |
| `persistence/` ↔ `analysis/` | `analysis/` functions take plain data (arrays of `RawEvent`, a `ScoreModel`) as arguments and return plain data (`AlignmentResult`, `MetricResult[]`, `HabitAggregate[]`); `persistence/` calls them and caches the output | This is a function-call boundary, not an event bus — keep it simple; no need for a message queue in a single-tab local app |
| `score/` ↔ `render/` and `score/` ↔ `analysis/` | Both consume the same `ScoreModel` + `noteId` scheme; `render/` additionally builds its own `noteId → SVGGElement` map | The one shared vocabulary in the system; changes to `noteId` derivation logic must be treated as a breaking schema change requiring `analysisVersion` bump |
| `analysis/` ↔ `render/` | Only via `render/annotation-layer.ts`, which imports both `analysis/types.ts` result shapes and DOM types | This is the single deliberate seam where "pure result" meets "DOM" — keep it as the *only* such file |

## Suggested Build Order (Vertical-MVP, Tryable at the Piano Each Phase)

Each step below should end with something the user can actually sit at the piano and try, per PROJECT.md's verification constraint -- not a component finished in isolation.

1. **Score in, score on screen.** `score/` (MusicXML parser + ScoreModel) + `render/score-renderer.ts` (OSMD). Tryable: load a real piece, see real notation, pick a passage (a measure-range filter over the ScoreModel -- no new component, just a slice).
   - *Why first:* every other component either produces data that must ultimately be compared to the ScoreModel, or paints onto the renderer this step builds. Nothing downstream can be meaningfully tried without it.

2. **Hear a click, capture what you play.** `capture/clock.ts` (look-ahead metronome scheduler) + `capture/midi-input.ts` (Web MIDI capture) + `persistence/raw-events-repo.ts`. Tryable: set a tempo, hear a steady click, play along, and see raw notes/velocities land in storage (e.g. a debug table) -- no alignment yet.
   - *Why second:* both capture adapters are independent of each other and of `score/`; building them together lets the clock-correlator (Anti-Pattern 3) get exercised immediately against real MIDI hardware, which is the highest-uncertainty integration risk in the whole system (confirm empirically before building anything that depends on timestamp correctness).

3. **Manual rep marking.** `capture/rep-marker.ts` + slicing raw events into `Repetition` records. Tryable: play a passage several times, mark boundaries, see distinct repetitions saved.
   - *Why third:* trivial on top of step 2's raw event log; unblocks step 4 by giving the alignment engine a bounded unit (one repetition) to work on instead of an unbounded stream.

4. **Align one repetition to the score, see it painted.** `analysis/alignment/align.ts` (NW-style edit-distance DP) + `render/annotation-layer.ts` using the ScoreModel's `noteId` map from step 1. Tryable: play one repetition, immediately see wrong/missed/extra notes marked on the actual notation.
   - *Why fourth:* this is the first point where the Analysis Core and the Annotation Layer contract (Pattern 3) gets built and proven end-to-end; deliberately scoped to *one* repetition, single-pass, no aggregation yet, so the alignment algorithm can be validated in isolation against real playing before anything is built on top of it.
   - *Build this with fixture tests first* (hand-authored `RawEvent[]` + `ScoreModel` -> expected `AlignmentResult`), then wire to live capture -- the pure-core boundary (Anti-Pattern 1) makes this cheap to do in that order.

5. **Timing and dynamics metrics.** `analysis/metrics/timing.ts` (onset deviation vs. the clock's expected-beat-timeline, per-bar tempo drift) + `analysis/metrics/dynamics.ts` (relative velocity vs. neighbours). Tryable: after a rep, see which notes were early/late and which were hit harder/softer than their neighbours, on top of the wrong/missed/extra marks from step 4.
   - *Why fifth:* depends on step 4's alignment output (metrics are computed per matched note) and step 2's clock correlation (onset deviation needs the expected-beat-timeline); has no dependents below it, so it can be scoped independently and even reordered with step 6 if needed.

6. **Aggregate across repetitions into habits.** `analysis/aggregate/habits.ts` + persistence of cached aggregates + the "many passes" view on the Annotation Layer (intensity/rate instead of single-instance marks). Tryable: play a passage 10-20 times as the user actually practices, then see the product's real value proposition -- a handful of trustworthy trouble spots, not single-take noise.
   - *Why last:* this is the actual point of the product (per PROJECT.md's Core Value) and depends on everything above being correct first; it is also the step most likely to reveal that step 4's alignment cost weights need tuning, which is fine because raw events were persisted from step 2 onward and can be re-aligned without replaying.

7. **Cross-session history and export/import.** Extend `persistence/` to key sessions by date, add the export/import file format. Tryable: close the browser, reopen days later, still see prior sessions' habit trends; export a file, wipe storage, import it back.
   - *Why last:* purely additive to the persistence schema already built in steps 2-6; no new analysis or rendering concepts, just longevity and portability of what already exists.

Note on component build order vs. this phase order: within each phase, build `analysis/` pieces against hand-written fixtures before wiring them to live `capture/`/`render/` -- the pure-core boundary from Pattern 1/Anti-Pattern 1 is what makes that possible, and it catches alignment/metrics bugs far faster than debugging them at the piano.

## Sources

- [OpenSheetMusicDisplay — GitHub repository](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay) — MEDIUM confidence (official project repo)
- [OSMD Wiki — Tutorial: Extracting note timing for playing](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay/wiki/Tutorial---Extracting-note-timing-for-playing) — MEDIUM confidence (official project wiki; confirms `GraphicalNote.getSVGGElement()`, `osmd.rules.GNote(note)`, `osmd.cursor.GNotesUnderCursor()`, and `MusicPartManagerIterator.currentTimeStamp.realValue` timing model)
- [OSMD classdoc — GraphicalNote](https://opensheetmusicdisplay.github.io/classdoc/classes/GraphicalNote.html) — MEDIUM confidence (generated API reference)
- [web.dev — A Tale of Two Clocks (Chris Wilson)](https://html5rocks.com/en/tutorials/audio/scheduling/) and [cwilso/metronome](https://github.com/cwilso/metronome) — HIGH confidence (canonical, widely cross-referenced source for the Web Audio look-ahead scheduling pattern; independently corroborated by MDN's Web Audio "Advanced techniques" guide)
- [MDN — MIDIMessageEvent](https://developer.mozilla.org/en-US/docs/Web/API/MIDIMessageEvent) and [MDN — Web MIDI API](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API) — MEDIUM confidence (MDN is authoritative for the API surface; the specific clock-correlation guidance is inferred/standard practice, not a single MDN paragraph — verify `getOutputTimestamp()` behavior in Chrome directly during implementation)
- Needleman-Wunsch Time Warping / performance-to-score alignment literature — MEDIUM confidence, via [Needleman–Wunsch algorithm (Wikipedia)](https://en.wikipedia.org/wiki/Needleman%E2%80%93Wunsch_algorithm), [Optimizing DTW-based audio-to-MIDI alignment and matching (IEEE)](https://ieeexplore.ieee.org/document/7471641/), and related MIR papers surfaced via search — this is an architectural direction recommendation grounded in published MIR technique names, not a verified benchmark for this project's exact use case; treat as a strong starting hypothesis to validate empirically once real performance data exists
- [`idb` on npm](https://www.npmjs.com/package/idb) — MEDIUM confidence (npm's most-used IndexedDB promise wrapper; standard choice, low risk)

---
*Architecture research for: Browser-based MIDI piano practice tool*
*Researched: 2026-09-13*
