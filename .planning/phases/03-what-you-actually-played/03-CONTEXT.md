# Phase 3: What You Actually Played - Context

**Gathered:** 2026-09-14
**Status:** Ready for planning

<domain>
## Phase Boundary

A pure, DOM-free alignment engine reads the passes, raw MIDI events, and click timeline that Phase 2 already stores, and labels every score note in a pass as played, missed, or wrong-pitch, flags extra played notes, and leaves uncertain or interrupted regions visibly unassessed with a reason. Those labels are painted on the noteheads of the rendered notation through the Phase 1 `noteId → SVG` map. Across the passes of a session at one tempo, each score note carries plain-language counts (mistakes over assessed opportunities, plus unassessed counts with reasons), shown when the user selects a marked note. All of it is proven at the FP-60X one ladder rung at a time, starting with right-hand C D E F G, and the interpretation rules are written down with fixture examples before the alignment code exists.

Requirements: ANLZ-01, ANLZ-03, and the pitch-only early slice of AGGR-01 and AGGR-03 (full acceptance stays in Phase 5).

Not in this phase: onset-deviation timing verdicts (Phase 4), intensity scales, bar shading, ranked lists (Phase 5), bar selection (Phase 6), export/import and past-session browsing (Phase 7), automatic pass splitting (out of scope for the milestone), any change to the capture workflow or the stored raw records.

**The user's stated priority is detection accuracy.** Every rule below is chosen so that a mark the user sees at the piano says what actually happened, and so that the app says "I could not tell" rather than guessing.

</domain>

<decisions>
## Implementation Decisions

### Pass origin (the rule Phase 4 reuses unchanged)
- **D-01:** The origin of a pass is the first bar-1 (accented) click at or after the pass's start timestamp in the stored click timeline. The file's first score note is expected on that click, and every other score note's expected time is taken from the actual scheduled click times in the timeline (onset in beats mapped onto the recorded clicks, never recomputed from BPM alone). The first pass of a session anchors to the metronome's first click, which is bar 1 beat 1 by construction. The user's practice: after B7+C8, wait for the very next accented click and play the whole file from its first note. — **Reversibility:** costly — Phase 4's timing verdicts and its fixtures are built on this rule; changing it means re-deriving every stored pass's expected timeline and rewriting those fixtures.
- **D-02:** The origin never moves. No lateness cutoff, no snapping to a better-fitting downbeat, no re-anchoring on the first played note. A first note played a full beat late reads as late by a beat, and so does every note after it. A missing first note is a missed note, and the remaining notes keep their real timing against their original score positions. The user's words: "Keep the next bar-1 click as the fixed origin, without a lateness cutoff. If I intentionally wait for a later downbeat, I should mark again before it. Never silently move the origin to make my playing appear on time."
- **D-03:** A pass's timing is unassessed only when its pitch alignment is uncertain (D-12, D-13), never because of distance from the click. In this phase the origin does two jobs: it gives each score note a time slot so that timing can settle pitch disputes (D-08, D-09), and it decides which score notes were reached before the pass ended (D-11).

### Pitch classification
- **D-04:** One played note in a score note's slot, at roughly the right time, is a wrong note (substitution) whatever the pitch, an octave slip included. No semitone threshold. The detail records which pitch was played.
- **D-05:** A correction credits the right note. Score C D E F G played C D F E F G reports F as an extra note and E as played (late), because the played E matches its score note. Marks over many passes then read "extra F before E" plus "E late", which is what happened.
- **D-06:** Repeated pitches (score E E E, two Es played) are assigned by timing against their slots. When two assignments cost the same, the whole repeated group is unassessed with reason "ambiguous", never guessed.
- **D-07:** Chords are judged per notehead: C E G played C Eb G is E wrong (Eb) with C and G played; C G is E missed; C E G B is an extra B in that chord. Notes played within a short window count as one chord regardless of order, and a slightly rolled chord still counts as together. The window is tuned from fixtures (Claude's discretion).
- **D-08:** Timing wins over pitch when they disagree by a whole beat. Score C D E F G played D E F G A in time on the click is five wrong notes (C wrong, played D; and so on), not "C missed, A extra, D E F G early". The principle for the cost model: a pitch match within roughly a slot's width of its expected time is a match (D-05); a pitch match displaced by a whole beat loses to an in-slot substitution (D-08). Exact windows and weights are tunable data derived from fixture failures (STATE.md blocker), not constants chosen up front.
- **D-09:** Nothing the piano sends is ignored. Every non-marker note-on in a pass is a played note: a soft brush of a key is an extra note, a re-struck key is an extra note. No velocity floor, no bounce suppression. Consistent with Phase 2 D-04 ("they would be mistakes"). Note-offs are not used for pitch classification.
- **D-10:** A played note that matches nothing is an extra note. For display and counting it is attached to the gap between the two score notes whose expected times bracket it (or before the first, or after the last).

### Unassessed regions, interrupted passes, and denominators
- **D-11:** Abandoned pass: score notes whose expected time (from the fixed origin) lies after the pass's end mark are unassessed with reason "not reached". Score notes whose expected time passed inside the pass with no matching played note are confident misses. Time decides. A small grace margin at the mark is Claude's discretion and must be covered by a fixture.
- **D-12:** Restart without a mark (C D E, pause, C D E F G, then the mark): the whole pass is unassessed with reason "passage restarted without a mark". The pass stays stored and listed, counts as one unassessed pass for every note, and its reason nudges the user to mark before restarting. Detection (a second run that re-matches the passage from its first notes after a fragment) is Claude's heuristic and needs a fixture for both a true restart and a near miss that is not one. Automatic splitting into two passes is out of scope for the milestone.
- **D-13:** Messy pass: per-note marks wherever the alignment for that region is unique; a region with equal-cost alternatives is unassessed with reason "ambiguous"; the rest of the pass still counts. A pass is never dropped for being "too wrong".
- **D-14:** Zero-note passes (a double mark) are not attempts: excluded from every count and denominator, though still stored and listed. A pass with one or more played notes is an attempt and follows D-11.
- **D-15:** Unassessed reasons are a fixed vocabulary: `not-reached`, `restarted`, `ambiguous`, `tempo-changed`. Every unassessed opportunity carries exactly one.
- **D-16:** Counts per score note are computed over passes at the same BPM: wrong count, missed count, assessed opportunities (passes in which that note was assessed), and unassessed count broken down by reason. Extras are counted per gap position (D-10). A pass whose BPM changed inside it is labelled `tempo-changed`, excluded from the aggregate view, but still listed and viewable as a single pass. Passes at other tempos form their own groups.

### What you see on the score (Claude's picks, at the user's request)
- **D-17:** The score repaints after every pass mark and on load, in place through the existing `svgMap`, with no OSMD re-render. Two views only: "This session at N BPM" (the default; aggregate counts over that tempo group) and a single pass (click a pass in the existing pass list; click the session heading to return). The session is the live one, or the restored one after a reopen. A BPM selector appears in the heading only when the session holds more than one tempo group.
- **D-18:** Flat colours, no intensity scale in this phase. Wrong = red notehead, missed = blue notehead, extra = a small red `+` glyph above the staff at the gap position from D-10, showing a count in the aggregate view. A score note with assessed opportunities and no mistakes stays black. A score note with zero assessed opportunities in the current view (never reached, every pass restarted) is light grey so an untested tail is visible. When a note has both wrong and missed counts, the larger count picks the colour; ties go to wrong. Exact shades are Claude's discretion.
- **D-19:** Clicking a coloured notehead or an extra glyph shows a plain-language detail panel below the score, not a tooltip. Aggregate view example: "E4, bar 1 beat 3: wrong in 4 of 10 assessed passes (played F4 three times, Eb4 once); missed in 1 of 10; 2 passes unassessed (1 restarted, 1 not reached)". Single-pass view example: "E4, bar 1 beat 3: wrong, played F4". Extra glyph example: "Extra notes between E4 and F4: in 6 of 10 assessed passes (F4 five times, E4 once)". The roadmap's 10+ pass experiment (success criterion 5) is read from this panel.
- **D-20:** Alignment results are derived data: recomputed from raw events, the score model, and the click timeline on load and after each mark, held in memory, not persisted in this phase. An `analysisVersion` constant exists from the first commit so that caching in a later phase is an addition, not a migration. — **Reversibility:** reversible — nothing downstream reads a stored alignment.
- **D-21:** The interpretation contract is a repo document, `docs/analysis-rules.md`, written and reviewed before the alignment code, with every rule above paired with the fixture file that exercises it. The roadmap's required cases each get a worked example there: missing first note, late entry, repeated pitches, an extra note, an interrupted (abandoned) pass, a restart, ambiguous alignment, and a tempo change. Fixtures are plain JSON under `test/fixtures/` (score model plus played events plus click timeline in, expected labels out), runnable with node:test and nothing else.

### Claude's Discretion
- The alignment algorithm. ARCHITECTURE.md Pattern 2 (Needleman-Wunsch-style edit distance over onset-slotted note or chord tokens) is the starting hypothesis; the fixed origin (D-01) means every score note has a known time slot, which the cost model must use so that D-05 and D-08 both hold.
- All windows and weights (slot width, chord window, restart detection, grace margin at the mark) as tunable data derived from fixture failures, kept in one place and documented in `docs/analysis-rules.md`.
- Module layout and names, following the one-global-per-classic-script pattern (for example a pure `src/align.js` and `src/aggregate.js`, and a paint module that only touches `svgMap`), extended into `scripts/check-run-path.cjs`.
- Detail panel layout and exact colours, within "plain and readable".
- How the restored-session view and the live view share code.
- Whether the Phase 4 timing offsets are computed now and simply not shown (allowed if it falls out of the cost model for free; not required).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning
- `.planning/ROADMAP.md` §"Execution within Phases 3–5", §"Interpretation contract", §"Pass origin and timing evidence", and §Phase 3 — the six success criteria, the ordered rung-by-rung piano gates, and the rule that the contract is documented with examples before coding
- `.planning/REQUIREMENTS.md` — ANLZ-01, ANLZ-03 (this phase); AGGR-01 and AGGR-03 (pitch-only slice here, full acceptance Phase 5); the Verification section's rung-advancement rule
- `.planning/PROJECT.md` — Key Decisions "Early pitch aggregate, then expand one exercise rung at a time", "Preserve raw attempts; report only assessable opportunities as verdicts", "Separate playing offsets from clock/output-latency evidence"
- `.planning/STATE.md` — Blockers: alignment cost weights are tunable data from fixture failures; do not infer zero latency or subtract the playing median; pitch work proceeds regardless
- `.planning/phases/02-click-and-capture/02-CONTEXT.md` — D-03/D-04 (everything in a pass belongs to it; marker events excluded), D-06 (click timeline record: audio time, page time, bar, beat, BPM), D-07 (pass boundary is a plain timestamp; Phase 3 now owns the origin rule), D-08/D-14 (BPM per pass, mid-session change), D-11 (calibration stored, never applied), D-15 (restored session on reopen), D-17 (stored record shapes)
- `.planning/phases/01-score-on-screen/01-CONTEXT.md` — D-01 (whole file is the passage), D-08 to D-11 (score model contract, structural note ids, `noteId → SVG` map), D-13 (classic scripts, double-click from disk)

### Stack and architecture
- `.claude/CLAUDE.md` — OSMD `setColor`/`getNoteheadSVGs` for recolouring without re-render; node:test for pure logic; "What NOT to Use" (no second MusicXML parser, no build step)
- `.planning/research/ARCHITECTURE.md` — Pattern 1 (raw events are the source of truth; alignment is a derived, versioned cache), Pattern 2 (sequence alignment, not raw DTW; `AlignOp` shape), Pattern 3 (stable `noteId` contract), Anti-Patterns 1 and 2 (no DOM/MIDI types in analysis; never store only the alignment), Key Data Flow 4 (the click timeline is the expected timeline)
- `.planning/research/PITFALLS.md` — pitfall 5 (Web MIDI timestamp domain), pitfall 13 (annotations lost on re-render; paint through the map, prove it survives a resize)

### Existing code
- `src/score-model.js` — `ModelNote` (id, measure, staff, voice, onset, duration, pitch) and `compareRationals`; onsets in beats are what map onto the click timeline
- `src/score-renderer.js` — `S.svgMap` (noteId to per-pitch notehead SVG) and `S.model`; the only surface the paint module may touch
- `src/pass-segmenter.js` — `segment()` output shape: passes with `notes` (non-marker note-ons only), `startTimeStamp`, `endTimeStamp`; the alignment engine's input
- `src/storage.js` — `readPasses`, `readRawEvents`, `readClicks`, session record with `bpmAtStart`, `calibration` (read, never applied)
- `src/metronome.js` — click record: `audioTime`, `bar`, `beat`, `bpm`, `accent`; bar-1 clicks are `beat === 1`
- `src/capture-app.js` — pass list rendering (`passList`), the restore-on-reopen path, and where "after each mark" hooks in
- `fixtures/01-right-hand.musicxml` — rung 1: one bar of 5/4, quarter notes C4 D4 E4 F4 G4 on beats 1 to 5; the worked examples in `docs/analysis-rules.md` use these notes and beats
- `fixtures/README.md` — the ladder and its at-the-piano use
- `test/score-model.test.cjs`, `test/pass-segmenter.test.cjs` — node:test pattern for pure modules with fixture data
- `scripts/check-run-path.cjs`, `scripts/check-svg-map.cjs` — the static `file://` gate and the headless Chrome check pattern to extend for painting
- `docs/analysis-rules.md` — to be created in this phase (D-21); the contract every fixture cites

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PassSegmenter.segment()` already yields per-pass `notes` arrays with marker events excluded (Phase 2 D-04), so the engine takes a pass's `notes`, the score model, and the click timeline and nothing else.
- The click timeline stores each click's page-clock time alongside bar, beat, and BPM, so expected note times are lookups into recorded clicks, not arithmetic on BPM.
- `S.svgMap` gives one SVG element per pitch per chord, so per-notehead colouring (D-07, D-18) needs no renderer change.
- The pass list in `capture-app.js` is the natural place for "click a pass to view it" (D-17).

### Established Patterns
- One global per classic script from an IIFE, `module.exports` for node:test, loaded in dependency order in `index.html` and checked by `scripts/check-run-path.cjs`. New analysis modules follow it or the check fails.
- Pure modules never see `document`, MIDI, or audio objects; fixtures are plain JSON.
- Structural ids and schema versions on persisted shapes; the same discipline applies to the `analysisVersion` constant (D-20).

### Integration Points
- After each mark and on load, `capture-app.js` calls the pure engine with the current session's passes, then the paint module recolours through `svgMap` and the detail panel reads the aggregate.
- Phase 4 consumes this phase's per-pass origin and per-note match results; Phase 5 extends the same aggregate shape with timing and intensity.
- Both MIDI timestamps and the click timeline's page-clock times share the `performance.now()` origin (Phase 2 D-06, D-09). Any constant output-latency offset, still unmeasured (STATE.md blocker), is tens of milliseconds, far smaller than a slot window, so pitch classification does not depend on resolving it.

</code_context>

<specifics>
## Specific Ideas

- The user's rule in their own words: "Keep the expected start anchored to the bar-1 click even when the first note is missing. Judge each remaining note against its original score position." and "Keep the next bar-1 click as the fixed origin, without a lateness cutoff. If I intentionally wait for a later downbeat, I should mark again before it. Never silently move the origin to make my playing appear on time."
- The user asked Claude to pick the answers for the display area; D-17 to D-21 are Claude's picks, chosen to be the smallest thing that satisfies success criteria 3 and 5.
- Scenarios agreed for the fixtures, all on rung 1 (C4 D4 E4 F4 G4, quarter notes in one bar of 5/4): late first note; skipped first note; C D F F G (wrong E); C D C5 F G (octave slip is still wrong); C D F E F G (correction); D E F G A in time (shifted start, five wrong); C D E then mark before F's click (not reached); C D E, pause, C D E F G (restart, whole pass unassessed); C D, seven-note fumble, G (per-note where clear); a double mark (zero-note pass, not an attempt); a repeated-note score with one repeat short; a chord with one wrong, one missing, one extra note (rung 4); a BPM change inside a pass (`tempo-changed`).
- Piano gate order (roadmap): rung 1 clean pass, wrong pass, then 10+ passes at one tempo with one repeated mistake and one one-off slip; the user confirms the habit is distinguishable from the slip in the detail panel before rung 2. Earlier rungs stay regression checks.
- The Phase 2 at-the-piano checkpoints (02-04) are still to be done by the user; they said they will do them after this discussion. Phase 3 planning does not depend on their numbers.

</specifics>

<deferred>
## Deferred Ideas

- Automatic splitting of a pass at a detected restart (out of scope for the milestone; D-12 reports it instead).
- Intensity by rate, bar shading, ranked per-bar list (Phase 5, AGGR-02 and AGGR-04).
- Persisting alignment results keyed by `analysisVersion` (Phase 5 or 7, when history spans sessions).
- Count-in before each pass, which would remove the "wait for the next bar-1 click" step (v2, CAPT-06).
- Timing offsets per note (Phase 4), using D-01 to D-03 unchanged.

</deferred>

---

*Phase: 03-what-you-actually-played*
*Context gathered: 2026-09-14*
