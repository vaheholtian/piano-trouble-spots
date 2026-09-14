# Phase 3: What You Actually Played - Research

**Researched:** 2026-09-14
**Domain:** Pure score-to-performance alignment (sequence alignment / edit distance), aggregate mistake counting, and no-re-render SVG annotation, for a browser-only MIDI piano practice tool
**Confidence:** HIGH (existing-codebase facts, OSMD internals, data shapes — all read directly from installed source this session) / MEDIUM (external alignment-algorithm literature — one directly-relevant paper found, cost-model parameters not published)

## Summary

This phase adds no new runtime dependencies. Everything it needs — the raw event log, the click timeline, the score model, and the `noteId -> notehead SVG` map — already exists from Phases 1 and 2, read directly from the installed source this session. The work is: (1) a pure `align.js` that runs a Needleman-Wunsch-style dynamic-programming sequence alignment between the score's note/chord tokens and a pass's played note/chord tokens, using the session's actual recorded click timeline (never BPM arithmetic) as the expected-time reference; (2) a pure `aggregate.js` that folds per-pass alignment results into per-note counts, denominators, and unassessed reasons across passes at one BPM; and (3) a `paint.js` that writes colours directly onto the SVG elements Phase 1 already mapped, without touching OSMD's renderer or triggering a re-render.

The single most consequential technical finding this session is **how OSMD 2.1.2 actually paints a notehead without re-rendering**, read directly from the installed package's bundled source (not from docs, which are silent on this): `getNoteheadSVGs()` returns *container* elements, and OSMD's own `setColor()` sets the `fill` attribute on each container's **children**, never on the container itself. `S.svgMap` (built in `src/score-renderer.js`) already stores exactly these container elements, so the phase's paint module must mirror OSMD's own pattern — iterate `svgMap.get(noteId).children` and set `fill` there — or nothing will visibly change. This single detail is exactly the kind of thing that "looks done" in a code review and fails silently at the piano.

The second consequential finding is that **interpolation between recorded clicks is required starting at rung 5, not deferred to a later phase**: rung 5's bar 2 right hand contains an eighth note at quarter-beat offset 2.5 from the bar (quarter, dotted quarter, eighth — read directly from `fixtures/README.md`), which falls between two recorded clicks, not on one. Rungs 1-4 are exclusively quarter- and half-note offsets that land exactly on a recorded click, so the alignment engine can ship a simple click-array lookup first and prove it at the piano on rungs 1-4 before rung 5 forces the interpolation path — but the interpolation function should exist from the start so rung 5 does not require reworking the expected-time contract mid-phase.

**Primary recommendation:** Build `src/align.js` as a pure Needleman-Wunsch-style DP over onset-slotted score/performance chord tokens (per ARCHITECTURE.md Pattern 2, refined here with a published piano-specific cost model), driven entirely by the session's real click-timeline records (never recomputed BPM math), with pluggable/tunable weights; build `src/aggregate.js` as a pure fold over per-pass alignment results respecting the D-11 through D-16 denominator rules; build `src/paint.js` as the only file that touches both alignment-result shapes and `S.svgMap`, setting `fill` on notehead children exactly as OSMD's own `setColor()` does internally.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Pass origin (the rule Phase 4 reuses unchanged)**
- D-01: The origin of a pass is the first bar-1 (accented) click at or after the pass's start timestamp in the stored click timeline. The file's first score note is expected on that click, and every other score note's expected time is taken from the actual scheduled click times in the timeline (onset in beats mapped onto the recorded clicks, never recomputed from BPM alone). The first pass of a session anchors to the metronome's first click, which is bar 1 beat 1 by construction. The user's practice: after B7+C8, wait for the very next accented click and play the whole file from its first note.
- D-02: The origin never moves. No lateness cutoff, no snapping to a better-fitting downbeat, no re-anchoring on the first played note. A first note played a full beat late reads as late by a beat, and so does every note after it. A missing first note is a missed note, and the remaining notes keep their real timing against their original score positions.
- D-03: A pass's timing is unassessed only when its pitch alignment is uncertain (D-12, D-13), never because of distance from the click. The origin gives each score note a time slot (used to settle pitch disputes, D-08/D-09) and decides which score notes were reached before the pass ended (D-11).

**Pitch classification**
- D-04: One played note in a score note's slot, at roughly the right time, is a wrong note (substitution) whatever the pitch, an octave slip included. No semitone threshold. The detail records which pitch was played.
- D-05: A correction credits the right note. Score C D E F G played C D F E F G reports F as an extra note and E as played (late), because the played E matches its score note.
- D-06: Repeated pitches (score E E E, two Es played) are assigned by timing against their slots. When two assignments cost the same, the whole repeated group is unassessed with reason "ambiguous", never guessed.
- D-07: Chords are judged per notehead: C E G played C Eb G is E wrong (Eb) with C and G played; C G is E missed; C E G B is an extra B in that chord. Notes played within a short window count as one chord regardless of order, and a slightly rolled chord still counts as together. The window is tuned from fixtures (Claude's discretion).
- D-08: Timing wins over pitch when they disagree by a whole beat. Score C D E F G played D E F G A in time on the click is five wrong notes (C wrong, played D; and so on), not "C missed, A extra, D E F G early". A pitch match within roughly a slot's width of its expected time is a match (D-05); a pitch match displaced by a whole beat loses to an in-slot substitution (D-08). Exact windows and weights are tunable data derived from fixture failures.
- D-09: Nothing the piano sends is ignored. Every non-marker note-on in a pass is a played note: a soft brush of a key is an extra note, a re-struck key is an extra note. No velocity floor, no bounce suppression. Note-offs are not used for pitch classification.
- D-10: A played note that matches nothing is an extra note. For display and counting it is attached to the gap between the two score notes whose expected times bracket it (or before the first, or after the last).

**Unassessed regions, interrupted passes, and denominators**
- D-11: Abandoned pass: score notes whose expected time (from the fixed origin) lies after the pass's end mark are unassessed with reason "not reached". Score notes whose expected time passed inside the pass with no matching played note are confident misses. A small grace margin at the mark is Claude's discretion and must be covered by a fixture.
- D-12: Restart without a mark: the whole pass is unassessed with reason "passage restarted without a mark". Detection (a second run that re-matches the passage from its first notes after a fragment) is Claude's heuristic and needs a fixture for both a true restart and a near miss that is not one. Automatic splitting into two passes is out of scope for the milestone.
- D-13: Messy pass: per-note marks wherever the alignment for that region is unique; a region with equal-cost alternatives is unassessed with reason "ambiguous"; the rest of the pass still counts. A pass is never dropped for being "too wrong".
- D-14: Zero-note passes (a double mark) are not attempts: excluded from every count and denominator, though still stored and listed. A pass with one or more played notes is an attempt and follows D-11.
- D-15: Unassessed reasons are a fixed vocabulary: `not-reached`, `restarted`, `ambiguous`, `tempo-changed`. Every unassessed opportunity carries exactly one.
- D-16: Counts per score note are computed over passes at the same BPM: wrong count, missed count, assessed opportunities, and unassessed count broken down by reason. Extras are counted per gap position (D-10). A pass whose BPM changed inside it is labelled `tempo-changed`, excluded from the aggregate view, but still listed and viewable as a single pass. Passes at other tempos form their own groups.

**What you see on the score (Claude's picks, at the user's request)**
- D-17: The score repaints after every pass mark and on load, in place through the existing `svgMap`, with no OSMD re-render. Two views only: "This session at N BPM" (default; aggregate over that tempo group) and a single pass. A BPM selector appears in the heading only when the session holds more than one tempo group.
- D-18: Flat colours, no intensity scale in this phase. Wrong = red notehead, missed = blue notehead, extra = a small red `+` glyph above the staff at the gap position, showing a count in the aggregate view. A score note with assessed opportunities and no mistakes stays black. A score note with zero assessed opportunities in the current view is light grey. Ties (wrong vs missed) go to wrong. Exact shades are Claude's discretion.
- D-19: Clicking a coloured notehead or an extra glyph shows a plain-language detail panel below the score, not a tooltip.
- D-20: Alignment results are derived data: recomputed from raw events, the score model, and the click timeline on load and after each mark, held in memory, not persisted in this phase. An `analysisVersion` constant exists from the first commit.
- D-21: The interpretation contract is a repo document, `docs/analysis-rules.md`, written and reviewed before the alignment code, with every rule above paired with the fixture file that exercises it. Fixtures are plain JSON under `test/fixtures/`, runnable with node:test and nothing else.

### Claude's Discretion
- The alignment algorithm. ARCHITECTURE.md Pattern 2 (Needleman-Wunsch-style edit distance over onset-slotted note or chord tokens) is the starting hypothesis; the fixed origin (D-01) means every score note has a known time slot, which the cost model must use so that D-05 and D-08 both hold.
- All windows and weights (slot width, chord window, restart detection, grace margin at the mark) as tunable data derived from fixture failures, kept in one place and documented in `docs/analysis-rules.md`.
- Module layout and names, following the one-global-per-classic-script pattern (for example a pure `src/align.js` and `src/aggregate.js`, and a paint module that only touches `svgMap`), extended into `scripts/check-run-path.cjs`.
- Detail panel layout and exact colours, within "plain and readable".
- How the restored-session view and the live view share code.
- Whether the Phase 4 timing offsets are computed now and simply not shown (allowed if it falls out of the cost model for free; not required).

### Deferred Ideas (OUT OF SCOPE)
- Automatic splitting of a pass at a detected restart (out of scope for the milestone; D-12 reports it instead).
- Intensity by rate, bar shading, ranked per-bar list (Phase 5, AGGR-02 and AGGR-04).
- Persisting alignment results keyed by `analysisVersion` (Phase 5 or 7, when history spans sessions).
- Count-in before each pass (v2, CAPT-06).
- Timing offsets per note (Phase 4), using D-01 to D-03 unchanged.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ANLZ-01 | Align played notes to score notes per pass, tolerant of chords and small timing errors; classify played/missed/wrong-pitch, flag extras; leave uncertain/interrupted regions unassessed with a reason; pass-origin rule handles a missed first note and a late start without shifting away the error | Architecture Patterns 1-3 below (DP alignment, chord tokenization, click-anchored expected-time lookup); Code Examples (DP skeleton, origin-click lookup, interpolation) |
| ANLZ-03 | Analysis code has no DOM, MIDI, or audio dependencies and is covered by fixture-based tests of synthetic performances with known mistakes | Validation Architecture (test map, fixture list); Don't Hand-Roll (reuse `ScoreModel` rational math, `PassSegmenter`, `Storage.readClicks`, none of which touch analysis with browser types) |
| AGGR-01 (pitch-only slice) | Repetitions retained; mistakes reported as count/rate over assessed opportunities at one tempo, unassessed counts and reasons visible; different tempos separated; within-pass tempo changes labelled outside comparison | Architecture Pattern 5 (derived, versioned in-memory aggregate); Code Examples (aggregate fold); Common Pitfalls (denominator errors) |
| AGGR-03 (pitch-only slice) | User can click a marked note to see plain-language detail | Architecture Pattern 4 (paint via svgMap children); D-19's detail-panel contract already fixes the copy shape — this research does not need to add to it |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pass-origin resolution (find the anchoring click) | Analysis (pure) | Persistence (click timeline read) | D-01 requires only click records + a timestamp; no DOM/MIDI type ever needs to appear in this function |
| Score/performance tokenization (chords, onset windows) | Analysis (pure) | — | Pure data transform over `ScoreModel.notes` and a pass's `notes` array; must stay DOM/MIDI-free per ANLZ-03 |
| Sequence alignment (DP, cost model) | Analysis (pure) | — | The core of ANLZ-01; must be fixture-testable with `node:test`, no browser globals |
| Aggregation across passes | Analysis (pure) | Persistence (reads stored passes/raw events on demand) | Derived, recomputable data (D-20); never the source of truth |
| Notehead/glyph painting | Render (DOM) | Analysis (consumes result shapes only) | The one deliberate seam where analysis-result types meet the DOM (ARCHITECTURE.md Anti-Pattern 1); must never leak DOM types back into `align.js`/`aggregate.js` |
| Detail panel (plain-language counts) | Render (DOM) | Aggregation (reads its output) | UI-only; reads the same aggregate structure the paint module reads, keyed by `noteId` |
| Click timeline storage/lookup | Persistence | Capture (already written by Phase 2) | No changes needed this phase; `Storage.readClicks` already returns sorted records |

## Standard Stack

No new external packages are introduced in this phase. Per CLAUDE.md's "What NOT to Use" (no second MusicXML parser, no build step) and the project's own established pattern of hand-rolled pure modules loaded as classic scripts, the alignment/aggregation/paint logic is written directly in vanilla JS reusing the already-installed stack:

### Core (already installed, no change)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:test | Node ≥20 built-in | Fixture-based unit tests for `align.js`/`aggregate.js` | Already the project's only test runner (`package.json` `"test": "node --test \"test/*.test.cjs\""`); zero new dependency |
| opensheetmusicdisplay | 2.1.2 (pinned in `index.html`) | Renderer that already produced `S.svgMap` in Phase 1 | No new usage beyond what Phase 1 built; this phase reads from `S.svgMap`/`S.model`, never calls a new OSMD API |
| idb | 8.0.3 (pinned in `index.html`) | Already the storage layer (`Storage.readPasses`, `Storage.readRawEvents`, `Storage.readClicks`) | No schema change needed this phase — pass/click/rawEvent record shapes were finalized in Phase 2 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled DP alignment in `src/align.js` | A generic JS diff/LCS library (`diff`, `fast-levenshtein`, `diff-match-patch`) | Rejected: these operate on flat token equality with a single edit cost; they have no way to inject a two-dimensional cost function (pitch distance *and* timing displacement, D-08's tie-break rule) or to treat a group of simultaneous notes as one alignable unit (D-07). The DP itself is ~100-150 lines; reusing the generic library would mean fighting its API for less control than hand-rolling. |

**Installation:** None required — no `npm install` for this phase.

## Package Legitimacy Audit

Not applicable. No external packages are installed in this phase; the alignment, aggregation, and painting logic is hand-rolled pure JavaScript reusing packages already vetted and installed in Phases 1-2 (`opensheetmusicdisplay`, `idb`, `node:test`). The Package Legitimacy Gate protocol is skipped per its own trigger condition ("whenever this phase installs external packages").

## Architecture Patterns

### System Architecture Diagram

```
[Storage: rawEvents, clickTimeline, passes]  [ScoreModel: measures, notes]
              |                                         |
              v                                         v
   PassSegmenter.segment()  ---(pass.notes,-------->  align.js
   (already exists,          startTimeStamp,           |  1. resolve pass origin (D-01)
    Phase 2)                 endTimeStamp)              |     -> first accent click >= pass.start
              |                                         |  2. tokenize score notes into
              |                                         |     onset-slotted chord tokens
              |                                         |  3. tokenize pass.notes into
              |                                         |     onset-window chord tokens
              |                                         |  4. DP alignment (match / substitution /
              |                                         |     deletion / insertion / ambiguous)
              |                                         |  5. tag unassessed regions
              |                                         |     (not-reached / restarted / ambiguous /
              |                                         |     tempo-changed)
              |                                         v
              |                              AlignmentResult[] (one per pass, in memory, D-20)
              |                                         |
              |                                         v
              |                                  aggregate.js
              |                              (fold across passes at one BPM;
              |                               D-11..D-16 denominator rules)
              |                                         |
              |                                         v
              |                              HabitAggregate[] keyed by noteId + gap position
              |                                         |
              v                                         v
      capture-app.js (after each mark, on load)  --->  paint.js
                                                          |  reads S.svgMap (noteId -> SVG el)
                                                          |  sets `fill` on el.children (D-18)
                                                          |  positions extra-note "+" glyphs
                                                          v
                                                  Rendered notation (no OSMD re-render)
                                                          |
                                                          v
                                              Detail panel (click handler reads
                                              the same HabitAggregate by noteId, D-19)
```

A reader can trace one pass end-to-end: raw events + clicks + score model enter `align.js`, produce a per-pass result, `aggregate.js` folds many such results into per-note counts, and `paint.js` is the only file that turns that data into a visible change on the actual notation — matching ARCHITECTURE.md's existing system diagram and its "arrows into the Analysis Core carry data, arrows out carry results" invariant.

### Recommended Project Structure
```
src/
├── align.js          # NEW — pure: pass-origin resolution, tokenization, DP alignment
├── aggregate.js       # NEW — pure: fold AlignmentResult[] into per-note/per-gap counts
├── paint.js           # NEW — DOM: the only file importing both alignment result shapes and svgMap
├── score-model.js      # existing, unchanged
├── score-renderer.js   # existing; S.svgMap/S.model read-only from here on
├── pass-segmenter.js   # existing, unchanged — align.js's input
├── storage.js           # existing; add no new stores, only new read call sites
└── capture-app.js       # existing; add "after each mark" and "on load" hooks calling
                          # align.js -> aggregate.js -> paint.js
docs/
└── analysis-rules.md    # NEW — the interpretation contract (D-21), written before align.js
test/
├── align.test.cjs        # NEW — node:test, no DOM
├── aggregate.test.cjs     # NEW — node:test, no DOM
└── fixtures/
    └── align/              # NEW — plain JSON: { scoreModel, passNotes, clicks, originIndex } -> expected AlignmentResult
```

### Pattern 1: Pass-Origin Resolution Anchored to Real Click Records (D-01/D-02)

**What:** Given a pass's `startTimeStamp` (page-clock domain, `performance.now()`-relative — same as every click's `pageTime` and every MIDI event's `timeStamp`, confirmed by `src/clock.js`'s header comment and `Clock.toPageTime`), find the first click record with `accent === true` (i.e. `beat === 1`, set in `src/metronome.js`'s `advance()`) whose `pageTime >= startTimeStamp`. That click's `pageTime` is quarter-beat offset 0. Every subsequent click is exactly one quarter-note-beat later (`Metronome.advance()` always does `next.nextClickTime += 60 / next.bpm; next.beat += 1`, regardless of BPM), so the click at array index `originIndex + k` is the expected time for any score note whose absolute onset (in quarter-beats from bar-1-beat-1) equals exactly `k`.

**When to use:** Every pass, before alignment begins. This is the one function Phase 4 must reuse unchanged (D-01's own text).

**Why click lookup, not BPM arithmetic:** `src/capture-app.js`'s `$('bpm').addEventListener('change', ...)` calls `C.metronome.setBpm(bpm)` mid-session (D-08/D-14) without stopping the click — a formula using "the" BPM would silently be wrong for any pass spanning a tempo change. The recorded click array is the only structure that is correct across a BPM change by construction, which is exactly why D-01 mandates it.

**Example:**
```javascript
// src/align.js — pure, no DOM/MIDI/audio imports
function resolveOrigin(clicks, passStartTimeStamp) {
  const index = clicks.findIndex((c) => c.accent && c.pageTime >= passStartTimeStamp);
  return index === -1 ? null : index; // null: no accent click after the pass started (edge case, needs a fixture)
}

// Absolute quarter-beat offset for a score note, using ScoreModel's exact rational math
// (never floats) -- reuses ScoreModel.addRationals, already proven in Phase 1.
function absoluteOnset(measure, note) {
  return ScoreModel.addRationals(measure.start, note.onset);
}
```

### Pattern 2: Click-Interpolated Expected Time for Off-Beat Notes

**What:** Rungs 1-4 are exclusively quarter- and half-note onsets — every score note's absolute quarter-beat offset is a whole number, so `clicks[originIndex + k].pageTime` is a direct, exact answer with zero interpolation. **Rung 5 is not** — its bar 2 right hand has quarter, dotted-quarter, then an eighth note (offsets 0, 1, 2.5 within the bar; verified against `fixtures/README.md`'s own worked description of rung 5), so offset 2.5 falls between two recorded clicks. The expected-time function must therefore interpolate between the two surrounding real click times for a fractional offset, rather than only supporting integer lookups:

```javascript
// d: absolute quarter-beat offset (rational) from the origin's quarter-beat-0 position.
function expectedTime(clicks, originIndex, d /* rational, e.g. { num: 5, den: 2 } for 2.5 */) {
  const whole = Math.floor(d.num / d.den);
  const frac = d.beats - whole; // 0 <= frac < 1; d.beats is fine here (display-only use, per
                                 // score-model.js's own convention -- ordering/equality still
                                 // goes through compareRationals elsewhere)
  const before = clicks[originIndex + whole];
  const after = clicks[originIndex + whole + 1];
  if (!before) return null;                 // origin itself missing this far back -- unassessed
  if (frac === 0 || !after) return before.pageTime; // on-beat, or no later click recorded yet
  return before.pageTime + frac * (after.pageTime - before.pageTime);
}
```

**When to use:** Build this from the start (Claude's Discretion note in CONTEXT.md explicitly allows shipping the integer-only path first and proving it at the piano through rung 4 before rung 5 forces the fractional path) — but do not defer *writing* the interpolating function, only *exercising* it, so rung 5 does not require reworking the expected-time contract that `align.js`'s cost model already depends on.

**Trade-off:** Linear interpolation between two real clicks assumes constant tempo between them, which is true by construction within one BPM (Metronome never varies tempo between two consecutive clicks) — the only case this doesn't model is a tempo change landing exactly between two clicks bracketing an off-beat note, which is already out of scope this phase (D-16: passes with an in-pass BPM change are tagged `tempo-changed` and excluded from the aggregate).

### Pattern 3: Chord Tokenization by Onset-Proximity Window (D-07)

**What:** Group score notes sharing the same `measure` + exact `onset` (`compareRationals` equal) into one score-side token with multiple pitches; group a pass's played note-on events whose `timeStamp` values fall within a small tunable window of each other into one performance-side token, regardless of the order the keys were struck (handles a rolled/arpeggiated chord). The DP operates one token at a time; within a matched token, pitches are diffed against each other per-notehead exactly as D-07 specifies (an extra pitch in the token is an extra note attached to that chord's gap position; a missing pitch is a missed note; a substituted pitch is wrong).

**Grounding:** This mirrors a directly-relevant published technique found this session — a Needleman-Wunsch-based MIDI-performance-to-score aligner for piano practice tools states plainly: "Key presses that occur in rapid succession are extracted as chords and treated as unordered sequences" [CITED: arxiv.org/abs/2203.12749, "Passive Haptic Rehearsal for Accelerated Piano Skill Acquisition"]. That paper does not publish its window value, consistent with this project's own decision (D-07: "The window is tuned from fixtures, Claude's discretion") — there is no authoritative number to adopt; only the *technique* (extraction into an unordered token) is externally corroborated.

**When to use:** Both sides of the DP, before the DP itself runs (tokenization is a pre-pass, not part of the DP loop).

### Pattern 4: Weighted DP Alignment with Timing-Dominates-Pitch Tie-Break (D-08)

**What:** A Needleman-Wunsch-style global alignment DP over the score-token sequence and the performance-token sequence, per ARCHITECTURE.md's existing Pattern 2 (`AlignOp` shape: match / substitution / deletion / insertion). This session found a directly relevant published cost formula for exactly this problem (score-to-MIDI piano-performance alignment): total cost = `Wa * AlignmentCost + Wt * TimingCost`, where `AlignmentCost` sums a flat cost per substitution/deletion/insertion, and `TimingCost` is `1(|t_i - t_i'| >= T)` — a per-note penalty applied only when a matched note's timing deviation crosses a threshold `T`, with `Wa`/`Wt` as user-configurable weights [CITED: arxiv.org/abs/2203.12749]. Neither `T` nor the weights are published — the paper explicitly leaves them as free parameters, consistent with this project's own D-08/CONTEXT.md instruction to treat them as "tunable data derived from fixture failures, not constants chosen up front."

**Refinement this project needs beyond the cited paper:** the paper's model does not by itself express D-08's specific tie-break ("a pitch match displaced by a whole beat loses to an in-slot substitution") — that requires the *substitution* cost at the correct time slot to be strictly cheaper than the *match* cost at a wrong time slot once the timing deviation exceeds roughly one slot width, i.e. the timing penalty for a "matched but very late/early" token must be set high enough to make the DP prefer a same-slot substitution. This is the one piece of the cost model that must be derived from the project's own fixtures (the "D E F G A in time" vs. "C D E F G shifted" scenario in CONTEXT.md's Specific Ideas), not copied from the cited paper.

**Example (skeleton, weights as named constants for fixture-driven tuning):**
```javascript
// src/align.js
const WEIGHTS = {
  substitution: 3,      // wrong pitch at the right slot
  deletion: 3,           // missed note
  insertion: 2,           // extra note
  matchTimingPenalty: 10, // added to a "match" whose |onsetDeviation| exceeds SLOT_WIDTH_MS,
                           // must exceed `substitution` so D-08's tie-break holds -- tune from
                           // fixtures, do not treat this number as final
  ambiguousMargin: 0,      // if the two best paths' costs differ by <= this, mark ambiguous (D-06/D-13)
};

function tokenCost(scoreToken, perfToken, expectedTime) {
  if (!perfToken) return WEIGHTS.deletion;
  if (!scoreToken) return WEIGHTS.insertion;
  const onsetDeviationMs = perfToken.onsetTime - expectedTime;
  const samePitch = scoreToken.pitches.length === perfToken.pitches.length &&
    scoreToken.pitches.every((p, i) => p === perfToken.pitches[i]);
  let cost = samePitch ? 0 : WEIGHTS.substitution;
  if (Math.abs(onsetDeviationMs) > SLOT_WIDTH_MS) cost += WEIGHTS.matchTimingPenalty;
  return cost;
}
// classic O(n*m) DP table over scoreTokens/perfTokens, back-pointer per cell for traceback,
// recording an 'ambiguous' flag whenever two back-pointer paths tie within ambiguousMargin.
```

### Pattern 5: Painting Directly on Cached Notehead Children (D-17/D-18)

**What:** `S.svgMap` (built in `src/score-renderer.js`'s `buildSvgMap()`) stores, per `noteId`, the element `heads[gNote.vfnoteIndex]` from OSMD's `getNoteheadSVGs()` — a **container** element (class `vf-notehead`), not the leaf shape. Reading OSMD 2.1.2's own bundled implementation directly (`node_modules/opensheetmusicdisplay/build/opensheetmusicdisplay.min.js`) shows exactly how its own `GraphicalNote.setColor()` colors a notehead:

```javascript
// OSMD 2.1.2's own VexFlowGraphicalNote.setColor(), decompiled from the installed bundle —
// applyToNoteheads defaults true:
if (applyToNoteheads) {
  const heads = this.getNoteheadSVGs();
  for (const head of heads) {
    for (const child of head.children) child.setAttribute('fill', color);
  }
}
```
`[VERIFIED: node_modules/opensheetmusicdisplay/build/opensheetmusicdisplay.min.js — VexFlowGraphicalNote.setColor, read directly this session]` — the container's own children, never the container element itself, carry the `fill` attribute. VexFlow's rendered notehead `<path>` elements set their own explicit `fill`, so setting `fill` on the parent `<g>` alone has no visual effect (SVG attribute inheritance only applies when the child has no explicit `fill` of its own).

`paint.js` should do exactly this against `S.svgMap`'s stored elements — **not** call `S.osmd.EngravingRules.GNote(...)`/`GraphicalNote.setColor()` itself, per this phase's own locked scope: "the paint module... a paint module that only touches `svgMap`" (CONTEXT.md, Claude's Discretion) and the canonical reference "`S.svgMap`... the only surface the paint module may touch" (CONTEXT.md, Existing Code Insights). Reimplementing the two-line loop directly against the cached elements keeps that boundary intact while producing an identical visual result to OSMD's own official API.

**Example:**
```javascript
// src/paint.js — the only file importing both HabitAggregate shapes and DOM elements
function paintNote(svgMap, noteId, color) {
  const el = svgMap.get(noteId);
  if (!el) return; // noteId not on the currently rendered page -- never throw
  for (const child of el.children) child.setAttribute('fill', color);
}
```

**Extra-note glyph (D-18's "+"):** there is no existing `noteId` to key off of — it is drawn at a *gap position* between two bracketing score notes (or before the first / after the last, D-10). Use `svgMap.get(bracketNoteId).getBoundingClientRect()` (already the technique `verifySvgMap()` uses for chord y-ordering in `score-renderer.js`) on the two bracketing noteheads to interpolate an x-position, and append a small SVG `<text>` or `<circle>`+`<text>` group into the rendered `#notation` SVG's root (found via `S.svgMap` values' `ownerSVGElement`, or by walking up from any mapped element). This must be redrawn after every resize-triggered re-render (Pitfall 13 below), exactly like the notehead colors.

### Anti-Patterns to Avoid

- **Coloring the notehead container instead of its children:** silently produces zero visible change because VexFlow's leaf `<path>` already carries its own explicit `fill`. This is the single highest-risk "looks done, isn't" bug in this phase — verify by screenshotting or asserting computed style in the headless-Chrome check, not by code review alone.
- **Recomputing an expected time from "the" BPM:** breaks the instant a session's BPM changes mid-pass (already wired up in `capture-app.js`); always index into the real `clicks` array (Pattern 1/2), never `note.onset.beats * (60 / bpm)`.
- **Positional (index-based) note matching instead of the DP:** the prototype's own documented failure (PITFALLS.md #1, #3, #10) — a single wrong/missed/extra note cascades into misaligning everything after it. The DP with insertion/deletion/substitution operators is what this phase exists to introduce.
- **Painting once and never re-applying after resize:** `score-renderer.js`'s existing `resize` handler already calls `renderAndMap()` (a full re-render, rebuilding `S.svgMap`) — any paint call must be re-triggered after that rebuild, exactly the class of bug PITFALLS.md #13 describes and the project already guards against for the base notehead map.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rational (fraction) onset arithmetic | A second onset-comparison helper inside `align.js` | `ScoreModel.compareRationals` / `ScoreModel.addRationals` (`src/score-model.js`, already proven in Phase 1's tie-handling) | Float onset math is exactly the kind of bug class (dotted/tuplet rounding) Phase 1 already solved once; a second implementation risks disagreeing with the renderer's own onset ordering |
| Slicing raw events into passes | A second pass-boundary walker inside `align.js` | `PassSegmenter.segment()` (`src/pass-segmenter.js`) | Already excludes marker events from `notes` (Phase 2 D-04); re-deriving this in the analysis layer risks silently disagreeing with what the live pass list already shows the user |
| Generic sequence diff/edit-distance | An npm diff library (`diff`, `fast-levenshtein`) repurposed with a hacked-in cost function | A hand-rolled ~150-line DP with named, tunable weights | See Alternatives Considered above — no generic diff library exposes a 2D pitch+timing cost function or a chord-token concept |
| Click-timeline storage/read | A new query path over `rawEvents` to re-derive click times | `Storage.readClicks(db, sessionId)` (already sorted by `id`, i.e. insertion order = chronological, per `src/storage.js`) | The click record already carries `pageTime`, `bar`, `beat`, `bpm`, `accent` — everything Pattern 1/2 need, with zero new schema |

**Key insight:** almost nothing generic fits this domain — MIR alignment libraries assume audio-to-MIDI (not MIDI-to-MIDI at a metronome-fixed origin), and text-diff libraries assume flat token equality with one edit cost, not a two-axis pitch/timing cost with chord grouping. The hand-rolled DP is the correct call here, not a shortcut — the project's own ARCHITECTURE.md reached the same conclusion in Phase 1's research, and this session's targeted search corroborates it (one directly on-topic paper found, and it also hand-rolls the same DP shape for the same reason).

## Common Pitfalls

### Pitfall 1: Coloring the SVG container element instead of its children
**What goes wrong:** `svgMap.get(noteId).setAttribute('fill', color)` compiles, runs, and produces no visible change.
**Why it happens:** `S.svgMap`'s values look like "the notehead" and most CSS/SVG intuition expects fill to cascade to children with no explicit fill of their own — but VexFlow's rendered paths already carry an explicit `fill`, which wins.
**How to avoid:** Follow Pattern 5 exactly — set `fill` on `el.children`, verified directly against OSMD 2.1.2's own bundled implementation this session.
**Warning signs:** A headless-Chrome check reports the paint call ran (no exception) but a pixel/attribute assertion on the actual notehead path shows the original color.

### Pitfall 2: Origin resolution picking the wrong click on a restarted or interrupted session
**What goes wrong:** `resolveOrigin` naively takes `clicks[0]` or the nearest click by absolute-value distance instead of the first *accent* click at-or-after the pass start; a pass that starts partway through a bar (e.g., right after a Stop/reopen edge case) silently anchors to a non-bar-1 click.
**Why it happens:** "Nearest click" is the intuitive first implementation; D-01 specifically requires "first accent click at or after," which is a one-directional search, not a nearest-neighbor search.
**How to avoid:** Implement exactly the `findIndex` shown in Pattern 1; add a fixture where the pass starts a few hundred ms before an accent click and a few hundred ms after one, and assert both resolve to the correct (later) accent click, never the earlier one.
**Warning signs:** A fixture pass with a deliberately-placed late first note reads as "on time" instead of "late" — a sign the origin silently snapped forward.

### Pitfall 3: Denominator errors — counting a non-attempt pass toward "not reached"
**What goes wrong:** A zero-note pass (double mark, D-14) gets folded into `aggregate.js` as a `not-reached` unassessed opportunity for every note, inflating the unassessed count and violating D-14's "excluded from every count and denominator."
**Why it happens:** The natural aggregate loop is "for every pass, for every note, classify" — a zero-note pass fed into that loop produces `not-reached` for everything unless explicitly filtered first.
**How to avoid:** Filter zero-note passes out of the pass list *before* it reaches `aggregate.js`, and cover it with a fixture (already on CONTEXT.md's required list: "a double mark (zero-note pass, not an attempt)").
**Warning signs:** The 10+-pass detail-panel experiment (success criterion 5) shows an unassessed count higher than the actual number of interrupted/ambiguous passes the user played.

### Pitfall 4: Chord window tuned against only one direction of failure
**What goes wrong:** A window wide enough to correctly group a slightly rolled chord (D-07) is also wide enough to wrongly merge two deliberately-separate repeated eighth notes (D-06) into one "chord," or vice-versa.
**Why it happens:** Both scenarios are governed by the same single number; tuning against only the fixture that prompted the change can silently break the other.
**How to avoid:** CONTEXT.md's Specific Ideas list already names both cases as required fixtures ("a repeated-note score with one repeat short" and "a chord with one wrong, one missing, one extra note") — run both every time the window changes, not just the one being debugged.
**Warning signs:** A previously-passing repeated-note fixture starts reporting `ambiguous` or a wrong chord grouping after a change made to fix a chord-only bug.

### Pitfall 5: Forgetting to re-run alignment (and re-paint) after every mark, not just on load
**What goes wrong:** D-20 requires recomputation "on load and after each mark" — a live capture path that only recomputes on load (or only paints once per session) leaves the score stale during a live drilling session, defeating the whole point of the 10+-pass experiment (success criterion 5).
**Why it happens:** It's easy to wire the recompute call into `restore()` (load path) and forget the equivalent hook in `mark()` (`src/capture-app.js`), since they are two different code paths today.
**How to avoid:** Add the align -> aggregate -> paint call at the exact point `mark()` already re-renders the pass list (`renderPassList()`), and cover it with the same headless-Chrome check pattern `check-svg-map.cjs` already uses for resize (drive a fixture pass, mark it, assert the paint changed).
**Warning signs:** The live pass list updates after a mark but the score's colors do not change until the page is reloaded.

## Code Examples

### Pass-origin resolution and expected-time lookup (verified data shapes)
```javascript
// src/align.js — pure, no DOM/MIDI/audio imports (ANLZ-03)
// clicks: Storage.readClicks() shape -- { audioTime, bar, beat, bpm, accent, pageTime, sessionId, id }[]
// pass: PassSegmenter.segment() shape -- { ordinal, startTimeStamp, endTimeStamp, notes, noteCount, ... }
function resolveOrigin(clicks, passStartTimeStamp) {
  return clicks.findIndex((c) => c.accent && c.pageTime >= passStartTimeStamp);
}
```

### Notehead painting (mirrors OSMD 2.1.2's own internal setColor, verified against installed bundle)
```javascript
// src/paint.js — the only file importing both alignment-result shapes and DOM elements
function paintNote(svgMap, noteId, color) {
  const el = svgMap.get(noteId);
  if (!el) return;
  for (const child of el.children) child.setAttribute('fill', color);
}

function resetNote(svgMap, noteId) {
  paintNote(svgMap, noteId, '#000000'); // black -- D-18's "no mistakes" state
}
```

### node:test fixture pattern (already established, reused unchanged)
```javascript
// test/align.test.cjs -- follows the exact pattern test/pass-segmenter.test.cjs already uses
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../src/score-model.js');
require('../src/align.js');
const Align = globalThis.Align;

test('a missing first note is a confident miss, not shifted timing', () => {
  const fixture = require('./fixtures/align/missing-first-note.json');
  const result = Align.align(fixture.scoreModel, fixture.passNotes, fixture.clicks);
  assert.equal(result.notes[0].status, 'missed');
  assert.equal(result.notes[1].status, 'played'); // remaining notes keep real timing (D-02)
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Positional (index N played = index N expected) note matching | Needleman-Wunsch-style DP with substitution/deletion/insertion operators over onset-slotted tokens | This phase (Phase 3) | A single wrong/missed/extra note no longer cascades into misclassifying everything after it in the same pass — directly closes the prototype's own documented failure (PITFALLS.md #1, #3, #10) |
| Timing anchored to the first played note | Timing anchored to the metronome's own recorded click timeline (D-01/D-02) | Phase 2 (click timeline) + this phase (consumption) | A missing or late first note no longer corrupts every subsequent judgment in the pass |

**Deprecated/outdated:** none specific to this phase — this is a first build, not a migration.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The extra-note "+" glyph can be positioned using `getBoundingClientRect()` interpolation between the two bracketing noteheads' `svgMap` elements, appended into the same SVG root `#notation` renders into | Architecture Pattern 5 | If OSMD's SVG root is harder to reach than assumed (e.g., nested in a way that complicates coordinate math), the glyph positioning approach may need rework; does not affect the notehead-coloring path, which is independently verified |
| A2 | Linear interpolation between two real recorded clicks is an acceptable expected-time model for off-beat notes (Pattern 2), rather than a more elaborate tempo curve | Architecture Pattern 2 | Low risk within one BPM (Metronome ticks are evenly spaced by construction); only matters once eighth-note-and-finer fixtures are added, i.e. rung 5 onward |
| A3 | The DP's timing-penalty weight can be tuned to satisfy D-08's "timing wins over pitch when they disagree by a whole beat" tie-break without a more exotic cost function than a flat threshold penalty | Architecture Pattern 4 | If a flat threshold proves insufficient against real fixture failures, the cost model may need a continuous (distance-proportional) timing penalty instead of the step function sketched here — CONTEXT.md already anticipates this by calling all weights "tunable data derived from fixture failures, not constants chosen up front" |

**If this table is empty:** N/A — three low-to-medium-risk assumptions are logged above; none touch a compliance, retention, or security-relevant decision, and all three are explicitly framed by CONTEXT.md as tunable/discretionary rather than requiring a fresh user decision.

## Open Questions

1. **Exact chord-grouping window value (ms)**
   - What we know: the technique (extract rapid keypresses as an unordered chord token) is externally corroborated [CITED: arxiv.org/abs/2203.12749]; the project's own D-07 explicitly defers the number to fixture tuning.
   - What's unclear: no external source publishes a concrete value for a similar piano-practice context.
   - Recommendation: start around 40-60ms (roughly the width of a hand-rolled arpeggiated chord at a moderate tempo) and adjust against the rung-4 chord fixture and the repeated-note fixture together (Pitfall 4), recording the final value and its rationale in `docs/analysis-rules.md` per D-21.

2. **Restart-detection heuristic (D-12)**
   - What we know: the signal is a played sequence that re-matches the passage's own opening after a discontinuity (CONTEXT.md's own description; also externally corroborated as a known failure mode in PITFALLS.md #10 — "non-monotonic MIDI timestamps... a strong signal the user restarted").
   - What's unclear: the exact discontinuity signal to key off (a backward jump in expected-vs-played onset order? A DP cost spike partway through the pass? A literal re-match of the first N score notes starting mid-pass?) is left as "Claude's heuristic" by CONTEXT.md.
   - Recommendation: implement as a DP-cost-spike detector (if the best alignment path's cumulative cost per note jumps sharply partway through and the tail then re-aligns cleanly to the score's own beginning, tag `restarted`) and validate against both required fixtures (a true restart, and a near-miss that is not one) before trusting it on a real 10+-pass session.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (node:test) | `align.js`/`aggregate.js` fixture tests | Yes `[VERIFIED: node --version, run this session]` | v24.11.1 | — |
| npm | test/check script invocation | Yes `[VERIFIED: npm --version, run this session]` | 11.6.2 | — |
| Google Chrome (headless, `CHROME_EXE`) | Extending `scripts/check-svg-map.cjs`-style headless check to verify painting actually changed a rendered notehead's fill | Yes, at the default path already hardcoded in `scripts/check-svg-map.cjs` `[VERIFIED: file exists at C:\Program Files\Google\Chrome\Application\chrome.exe, checked this session]` | not queried (script only checks existence) | — |
| Roland FP-60X over USB | Every phase's mandatory at-the-piano checkpoint (VRFY-01) | Not verifiable from this environment | — | None — this is the phase's own required human verification step, not a fallback-able dependency |

**Missing dependencies with no fallback:** none blocking implementation; the FP-60X checkpoint is an intentional human gate, not a missing tool.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (Node ≥20 built-in) |
| Config file | none — `package.json`'s `"test": "node --test \"test/*.test.cjs\""` glob already covers any new `test/*.test.cjs` file |
| Quick run command | `node --test test/align.test.cjs` (or `test/aggregate.test.cjs`) |
| Full suite command | `npm test` (all `test/*.test.cjs`), plus `npm run check` (static gates) and the extended headless-Chrome paint check (new script, see Wave 0 Gaps) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANLZ-01 | Missing first note is a confident miss; remaining notes keep real timing (D-02) | unit (fixture) | `node --test test/align.test.cjs` | ❌ Wave 0 |
| ANLZ-01 | Late entry (deliberately shifted start): all notes read wrong, not "shifted early" (D-08) | unit (fixture) | `node --test test/align.test.cjs` | ❌ Wave 0 |
| ANLZ-01 | Repeated pitches assigned by timing slot; tie -> whole group ambiguous (D-06) | unit (fixture) | `node --test test/align.test.cjs` | ❌ Wave 0 |
| ANLZ-01 | Extra note attached to its bracketing gap position (D-10) | unit (fixture) | `node --test test/align.test.cjs` | ❌ Wave 0 |
| ANLZ-01 | Interrupted (abandoned) pass: notes after the mark are `not-reached`, notes before with no match are confident misses (D-11) | unit (fixture) | `node --test test/align.test.cjs` | ❌ Wave 0 |
| ANLZ-01 | Restart without a mark: whole pass unassessed, reason `restarted` (D-12) | unit (fixture, +1 near-miss fixture that is NOT a restart) | `node --test test/align.test.cjs` | ❌ Wave 0 |
| ANLZ-01 | Ambiguous alignment: equal-cost region unassessed, rest of pass still counts (D-13) | unit (fixture) | `node --test test/align.test.cjs` | ❌ Wave 0 |
| ANLZ-01 | Mid-pass tempo change: pass tagged `tempo-changed` (D-16) | unit (fixture) | `node --test test/align.test.cjs` | ❌ Wave 0 |
| ANLZ-01 | Octave slip is still wrong, not a match (D-04) | unit (fixture) | `node --test test/align.test.cjs` | ❌ Wave 0 |
| ANLZ-01 | Correction credits the right note (D-05: extra F, played E late) | unit (fixture) | `node --test test/align.test.cjs` | ❌ Wave 0 |
| ANLZ-01 | Chord: one wrong, one missing, one extra note, judged per notehead (D-07, rung 4) | unit (fixture) | `node --test test/align.test.cjs` | ❌ Wave 0 |
| ANLZ-01 | Double mark (zero-note pass) excluded from every count/denominator (D-14) | unit (fixture) | `node --test test/aggregate.test.cjs` | ❌ Wave 0 |
| ANLZ-03 | `align.js`/`aggregate.js` import nothing from `document`, MIDI, or audio globals | static/lint-style assertion | `node --check src/align.js` (already the pattern `scripts/check-run-path.cjs` uses for every `src/*.js`) | ✅ pattern exists, extend `EXPECTED_LOCAL_SCRIPTS` list |
| AGGR-01 slice | Counts/rates computed only over passes at the same BPM; other tempos separated | unit (fixture, multi-pass) | `node --test test/aggregate.test.cjs` | ❌ Wave 0 |
| AGGR-03 slice | Painting a notehead's `fill` actually changes the rendered SVG (not just the container) | browser check (headless Chrome, real render) | new script extending `scripts/check-svg-map.cjs`'s pattern | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test test/align.test.cjs` (or whichever file the task touched) plus `node scripts/check-run-path.cjs`
- **Per wave merge:** `npm test` (full suite) plus the extended paint-verification headless-Chrome script
- **Phase gate:** Full suite green, `npm run check`/`check:map` green, plus the mandatory at-the-piano checkpoints (clean pass + wrong pass on every ladder file; the 10+-pass repeated-mistake-vs-slip experiment) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/align.test.cjs` — covers ANLZ-01 (all fixture scenarios above)
- [ ] `test/aggregate.test.cjs` — covers AGGR-01 pitch-only slice, D-14's denominator exclusion
- [ ] `test/fixtures/align/*.json` — one file per scenario in CONTEXT.md's "Scenarios agreed for the fixtures" list (at minimum: missing first note, late entry, wrong-E, octave slip, correction, shifted-start-five-wrong, not-reached, restart, messy-per-note-fumble, double-mark, repeated-note-short, chord-with-three-mistakes, tempo-changed) — 13 files
- [ ] `docs/analysis-rules.md` — the interpretation contract itself (D-21); not a test, but a hard prerequisite the plan must sequence before any `align.js` code is written
- [ ] A headless-Chrome browser check extending the `scripts/check-svg-map.cjs` pattern, asserting a painted notehead's actual `fill` attribute changed on its child elements after a fixture pass is marked (Pitfall 1's regression guard) — node:test cannot cover this because the project's own `test/osmd-node-env.cjs` explicitly supports parsing only, never `render()`, under jsdom

## Security Domain

Omitted — `security_enforcement: false` in `.planning/config.json`.

## Sources

### Primary (HIGH confidence — read directly from installed source or the project's own files this session)
- `node_modules/opensheetmusicdisplay/build/opensheetmusicdisplay.min.js` — `VexFlowGraphicalNote.setColor()` decompiled directly, confirming `fill` is set on notehead **children**, never the container
- `node_modules/opensheetmusicdisplay/build/dist/src/MusicalScore/Graphical/VexFlow/VexFlowGraphicalNote.d.ts` — confirms `getNoteheadSVGs(): HTMLElement[]` and `setColor(color, coloringOptions?)` signatures
- `src/score-model.js`, `src/score-renderer.js`, `src/pass-segmenter.js`, `src/storage.js`, `src/metronome.js`, `src/clock.js`, `src/capture-app.js`, `src/midi-capture.js`, `src/pass-marker.js` — read in full this session for exact data shapes (`ModelNote`, click record, pass record, raw event record)
- `fixtures/01-right-hand.musicxml`, `fixtures/README.md` — read directly; confirmed rung 1's onsets are all integer quarter-beats and rung 5 bar 2 contains an eighth note at a half-integer offset
- `test/pass-segmenter.test.cjs`, `test/score-model.test.cjs`, `test/osmd-node-env.cjs` — confirm node:test fixture patterns and the jsdom env's "parse only, never render" limitation
- `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md` (Phase 1 research, this project) — Pattern 2/3, Anti-Patterns 1/2/4, Pitfalls 1/3/9/10/13

### Secondary (MEDIUM confidence — external source, cross-checked against the project's own decisions)
- ["Passive Haptic Rehearsal for Accelerated Piano Skill Acquisition"](https://arxiv.org/abs/2203.12749) (arXiv 2203.12749) — a directly on-topic Needleman-Wunsch piano-performance-to-score aligner; confirms the cost-model shape (`Wa*AlignmentCost + Wt*TimingCost`), the chord-as-unordered-sequence technique, and a per-note timing threshold, all without publishing concrete parameter values (consistent with this project's own "tunable data" framing, not contradicting it)

### Tertiary (LOW confidence)
- None used as the basis for any claim in this document — where external sources were silent on a parameter, that silence is reported as an Open Question, not filled with an invented number.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all existing versions read directly from `package.json`/`index.html`
- Architecture (alignment DP, chord tokenization, origin resolution): HIGH for data shapes and OSMD painting mechanics (read from installed source); MEDIUM for the specific DP cost-model tuning (externally corroborated technique, but no externally-verifiable parameter values — correctly deferred to fixture-driven tuning per CONTEXT.md)
- Pitfalls: HIGH — grounded in this project's own Phase 1 research (PITFALLS.md) plus concrete code-reading this session (the notehead-container bug, the origin-resolution edge case)

**Research date:** 2026-09-14
**Valid until:** No expiry driver identified — no external package versions are pinned by this research that could drift; the OSMD 2.1.2 internals cited are pinned in `index.html` and will not change unless that CDN pin changes, which is a project-controlled event, not a passive staleness risk.
