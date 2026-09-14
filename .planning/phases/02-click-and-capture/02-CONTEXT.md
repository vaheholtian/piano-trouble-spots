# Phase 2: Click and Capture - Context

**Gathered:** 2026-09-13
**Status:** Ready for planning

<domain>
## Phase Boundary

The user opens a ladder file (Phase 1), picks the Roland FP-60X from the connected Web MIDI inputs, sets a BPM, presses Start, and hears a Web Audio click with beat 1 accented. They play the passage many times, pressing B7+C8 together (or spacebar) between passes. Every raw MIDI message, every pass boundary, and every scheduled click time is written to IndexedDB as it happens. Closing the tab and reopening restores the piece and every recorded pass with its raw data unmodified. A small live readout shows each played note's offset from the nearest click so the MIDI-timestamp versus audio-clock relationship is measured at the piano, not assumed.

No alignment, no grading, no colouring of the score, no export/import, no bar selection. The whole loaded file is the passage (Phase 1 D-01).

Requirements: CAPT-01, CAPT-02, CAPT-03, CAPT-04, CAPT-05, HIST-01.

**The user's stated priority is detection accuracy.** This phase exists so that Phase 3 and Phase 4 have raw data that is complete, unmodified, and anchored to a trustworthy click. Nothing here may alter a timestamp or drop an event.

</domain>

<decisions>
## Implementation Decisions

### Pass marking
- **D-01:** The pass marker is the two highest keys, B7 and C8 (MIDI 107 and 108), pressed together: both note-ons arriving within roughly 100 ms of each other. Spacebar does the same from the laptop. The key pair is a stored setting so it can be changed if a piece ever needs those keys. — **Reversibility:** reversible — the marker detector is one small function over the raw stream; changing keys changes a setting.
- **D-02:** The sustain pedal is never a marker. The user pedals while playing, and a double-tap gesture could mis-split a pass during a real piece, which would silently corrupt the aggregate. CC64 events are captured and stored raw like every other message (PITFALLS.md pitfall 7); nothing in this phase interprets them.
- **D-03:** One mark ends the current pass and starts the next. The first pass opens when the session starts (metronome Start). The pass in progress when the session ends is closed as-is and kept if it contains at least one non-marker note.
- **D-04:** Everything played inside a pass belongs to that pass. No discard action, no double-mark undo, no dropping of notes before a downbeat. The user's words: "I don't get why I would play stray notes. They would be mistakes." The marker keys' own note-on/off events are stored in the raw log tagged as marker events and are excluded from a pass's played notes by every downstream reader.

### Metronome and expected timeline
- **D-05:** The click is scheduled with the Web Audio look-ahead scheduler (CLAUDE.md "A Tale of Two Clocks", PITFALLS.md pitfall 8). JS timers only decide which upcoming clicks to schedule; the click's authoritative time is the AudioContext time it was scheduled at. Beat 1 is accented, using the time signature already carried per measure in the Phase 1 score model (`timeSignature` in `src/score-model.js`); the ladder files are 4/4 and the Yanni bars are 3/4. No subdivision ticks.
- **D-06:** The click runs continuously from Start to Stop, across every pass mark. Every scheduled click is recorded with: its AudioContext time, its converted page-clock time (the `performance.now()` domain that `MIDIMessageEvent.timeStamp` uses), its bar number counting from Start, its beat within the bar, and the BPM in effect. This list is stored with the session and is the expected timeline Phase 4 measures against (ARCHITECTURE.md Key Data Flow 4: one scheduler produces both the sound and the ground truth). — **Reversibility:** costly — Phase 4 timing and its fixtures consume this shape; changing it means rewriting those fixtures and re-deriving stored timelines.
- **D-07:** A pass boundary is a plain timestamp (page clock) plus its position in the raw event stream. This phase does not decide which click is a pass's bar one and does not snap anything. The user's practice is to start each pass on a bar-one click; Phase 4 finds which bar-one click the first note lines up with.
- **D-08:** Tempo is a user-set BPM, remembered per piece. The score's own tempo marking is never read for anything (PITFALLS.md pitfall 2). BPM may be changed mid-session without ending it: the click list records BPM per click and each pass records the BPM in effect when it opened.

### Clock relationship (roadmap success criterion 2)
- **D-09:** One small pure clock utility, unit-tested with node:test, correlates the page clock (`MIDIMessageEvent.timeStamp`, `performance.now()`) with AudioContext time using a paired sample taken at session start (`AudioContext.getOutputTimestamp()` or a paired read; the researcher confirms which is reliable in Chrome on Windows) and re-sampled as the planner sees fit. Raw events always keep the original MIDI `timeStamp` unmodified; conversion happens only where a comparison is made (ARCHITECTURE.md Anti-Pattern 3, PITFALLS.md pitfall 5).
- **D-10:** A collapsible live readout shows the last played note's offset in milliseconds from the nearest scheduled click (positive means late) and the running median over the last 20 notes, plus the AudioContext `baseLatency` and `outputLatency` values. It is diagnostic, not grading, so it satisfies CAPT-02's "no per-note grading". The at-the-piano test: play single notes deliberately on the click and read a median near zero; a steady constant such as +40 ms means a clock or latency problem, not a playing habit.
- **D-11:** The median offset measured in a session is stored on the session as a calibration value, together with the raw clock pair. Nothing is applied to any timestamp in this phase. Phase 4 decides whether and how to use it. — **Reversibility:** reversible — it is one stored number.
- **D-12:** The click plays through Chrome's default audio output (laptop speakers or headphones). Output-device selection, including routing the click to the FP-60X speakers over its USB audio interface, is deferred unless the laptop output proves unusable at the piano.

### Sessions and repetitions
- **D-13:** A session starts when the user presses Start with a piece loaded and ends on Stop, on opening another piece, or on tab close or crash. A session never spans two pieces.
- **D-14:** A tempo change does not end a session (see D-08). Phase 5 may filter by tempo later; nothing is split now.
- **D-15:** On reopening the app: the last-opened piece is rendered again from the file bytes stored in IndexedDB, every recorded pass of the interrupted session is listed with its note count, that session is marked ended, and the click is stopped. Pressing Start opens a new session. A crash never merges two sittings and never loses a pass.
- **D-16:** The session view lists passes as numbered repetitions with a note count each (roadmap success criterion 3). Nothing per-note is shown.

### Storage
- **D-17:** IndexedDB is the store (PITFALLS.md pitfall 15; localStorage only for tiny preferences, if at all). Stored records: pieces (file name, file bytes, a content-hash id, and the extracted score model with its `SCHEMA_VERSION`), settings (marker keys, last BPM per piece, last-opened piece, last-used MIDI input), sessions (piece id, start and end, clock pair, calibration value), the click timeline per session, passes (session id, ordinal, start and end position and timestamp, BPM), and raw MIDI events (every message: raw bytes, original `timeStamp`, decoded type, note, velocity, controller and value where applicable, session id, pass ordinal, marker flag). Raw events are written as they arrive or in small batches, before anything else touches them (ARCHITECTURE.md Pattern 1 and Key Data Flow 1). The database carries a schema version with a migration function from day one. Quota errors are surfaced to the user, never swallowed. — **Reversibility:** one-way — Phase 7 export/import and the Phase 3 to 5 analysis fixtures serialise these shapes; changing them later requires a data migration and an analysisVersion bump.
- **D-18:** Everything must keep working when `index.html` is double-clicked from disk with classic scripts (Phase 1 D-13). The researcher verifies that IndexedDB, Web MIDI (`navigator.requestMIDIAccess`), and AudioContext all work from a `file://` origin in current Chrome on Windows before any plan depends on it. If any does not, the fallback is a one-line local static server documented in README, and that is a decision to surface to the user, not to make silently.

### Live indicator and MIDI input (Claude's picks, not asked)
- **D-19:** The MIDI input selector lists connected inputs, remembers the last-used one, and auto-selects it when present; connection state (connected, disconnected, permission denied) is shown in words. The live indicator per current pass is the note count, the last note's name and velocity, and a brief flash on note-on. No piano-roll, no per-note colour.

### Claude's Discretion
- Whether to use the `idb` UMD build from a CDN or raw IndexedDB, given classic scripts.
- Exact raw event record format and batching, within D-17.
- BPM control design and range; layout and styling of the transport, readout, and pass list, within "plain and readable".
- How clock re-sampling is scheduled during a session (D-09).
- Whether marker detection uses the spacebar keydown time or the MIDI note-on time as the boundary timestamp; both are recorded either way.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning
- `.planning/ROADMAP.md` §Phase 2 — goal, requirements, and the five success criteria, especially criterion 2 (clock relationship measured at the piano) and 5 (a real 10+ pass drill captured with nothing missing)
- `.planning/REQUIREMENTS.md` — CAPT-01 to CAPT-05 and HIST-01 (this phase); CAPT-06 count-in is v2 and out
- `.planning/PROJECT.md` — constraints (browser-only, no build step, local storage plus export) and Key Decisions (manual repetition marking, metronome-anchored timing)
- `.planning/STATE.md` — the Phase 2 blocker: MIDI timestamps versus AudioContext origin must be settled empirically before Phase 4
- `.planning/phases/01-score-on-screen/01-CONTEXT.md` — D-08/D-09 (score model is the persisted contract), D-13 (single HTML file, classic scripts, double-click from disk), D-15 (remembering the last piece lands here)

### Stack and architecture
- `.claude/CLAUDE.md` — Web MIDI (timeStamp shares the `performance.now()` origin), Web Audio "A Tale of Two Clocks" scheduler, `idb` versus raw IndexedDB, node:test for pure logic, Playwright Web MIDI mocking pattern
- `.planning/research/ARCHITECTURE.md` — Pattern 1 (raw-event-sourced persistence), Data Flow (capture to persistence is immediate; one scheduler produces click and expected timeline), Anti-Pattern 1 (no DOM or MIDI types in analysis), Anti-Pattern 3 (clock correlation step)
- `.planning/research/PITFALLS.md` — pitfall 5 (Web MIDI timestamp quirks), 6 (note-on velocity 0 is note-off), 7 (store CC64), 8 (no timer-driven click; test with the tab backgrounded), 15 (IndexedDB, schema version, quota errors)
- `.planning/research/STACK.md` — Web MIDI and Web Audio API surface notes

### Existing code
- `src/score-model.js` — `ScoreModel` global, `SCHEMA_VERSION`, per-measure `timeSignature`; the model shape stored per piece
- `src/score-renderer.js` — the `S` state object and `loadPiece(file)` that restore-on-reopen hooks into
- `scripts/check-run-path.cjs` — static gate for the `file://` run path; extend it for the new scripts
- `scripts/check-svg-map.cjs` — headless Chrome over the DevTools protocol; the pattern to reuse for a storage or MIDI round-trip check
- `fixtures/README.md` — the ladder files used at the piano
- `prototype/piano-app.js` line 152 — reference for treating note-on with velocity 0 as note-off (pitfall 6); reference only, not reused

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ScoreModel.extract` output already carries `timeSignature` per measure, so the metronome accent needs no model change.
- The `S` state object and `loadPiece(file)` in `src/score-renderer.js` accept a Blob; restore-on-reopen can feed stored file bytes through the same path.
- `test/osmd-node-env.cjs` and `test/score-model.test.cjs` show the node:test plus jsdom pattern for pure modules; the clock utility, marker detector, and pass segmenter should be tested the same way with no DOM.
- `scripts/check-svg-map.cjs` drives real headless Chrome; a sibling script can prove IndexedDB round-trips from `file://`.

### Established Patterns
- Classic scripts in dependency order in `index.html`, guarded by `npm run check`; no ES modules, no build step. New files follow this or the check fails.
- One global per file (`ScoreModel`, `InspectTable`) from an IIFE; the app file owns DOM and state.
- Structural ids and a schema version on persisted shapes (Phase 1 D-09); apply the same to sessions, passes, and events.

### Integration Points
- New capture, metronome, clock, and storage modules sit beside the score model; the storage layer persists the model and the file bytes per piece.
- Phase 3 reads passes and raw events from storage plus the score model; Phase 4 reads the click timeline and the session calibration value. Both shapes are fixed here (D-06, D-17).

</code_context>

<specifics>
## Specific Ideas

- The user: "I don't mind sustain pedal but I also like using it while I play", hence B7+C8 as the marker.
- The user: "keep everything, I don't get why I would play stray notes. They would be mistakes".
- At-the-piano test for criterion 2: metronome on, play single notes on the click, readout median near zero; then play a 10+ pass drill of a ladder file, close the tab, reopen, and count the passes.
- Test the metronome for several minutes with the tab in the background and confirm no drift (pitfall 8).

</specifics>

<deferred>
## Deferred Ideas

- Route the click to the FP-60X speakers over its USB audio interface, with an output-device picker (only if laptop output is unusable at the piano).
- A "discard last pass" action (rejected for now; the aggregate handles one-offs).
- Count-in before each pass (v2, CAPT-06).
- Drag-and-drop file opening (still deferred from Phase 1).

</deferred>

---

*Phase: 02-click-and-capture*
*Context gathered: 2026-09-13*
