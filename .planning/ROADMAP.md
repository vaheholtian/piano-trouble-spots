# Roadmap: Piano Mistakes

## Overview

Seven phases build one loop: load a score, drill it to a click many times, and see the handful of spots worth working on painted on the actual notation. Phases 1 and 2 provide notation and durable capture. Phase 3 proves pitch alignment and a minimal repeated-mistake view, starting with right-hand C D E F G before advancing through the exercise ladder. Phase 4 adds trustworthy early/late feedback. Phase 5 completes the aggregate display and tests whether it helps the user choose a problem, practise it, and assess the result. Phase 6 brings in real pieces and bar selection only after that practice loop is useful. Phase 7 adds export/import and access to past sessions. Every phase is tried at the FP-60X over USB.

**Detection accuracy first:** Through Phase 5 the "passage" is always the entire loaded file, and the files are tiny exercises the user makes in MuseScore so every note can be checked by eye and ear. Bar selection, pickup-bar numbering, repeats, and real multi-page pieces wait until Phase 6.

**Verification ladder:** Five small MusicXML files kept in the repo, used at the piano for every phase from 1 to 5:

1. Right hand only: C D E F G, one bar
2. Left hand only: the same
3. Both hands together
4. A chord or two
5. Four bars of a real piece

**Execution within Phases 3–5:** The ladder is an ordered progression, not only an end-of-phase test suite. In Phase 3, get single-pass pitch marks and basic repeated-mistake counts working on rung 1, then have the user check them at the piano before advancing to left hand, both hands, chords, and four bars. Fix false marks at the current rung before expanding. Phase 4 follows the same order for timing. Earlier rungs remain regression checks. Do not defer the first aggregate experiment until Phase 5 or require polished heat maps before trying it.

**Interpretation contract (decide in Phase 3 before implementation):** Keep all raw events and passes. Separately define which score-note opportunities can be assessed. An interrupted or uncertain region is reported as unassessed with a reason, never silently counted as clean or missed; distinguish it from a confidently established omission within an attempted passage. Counts show mistakes / assessed opportunities plus unassessed counts. Compare passes at the same constant tempo; separate different tempos and label within-pass tempo changes as outside the initial aggregate comparison. Document these rules with examples before coding. This is analysis over Phase 2 data, not a new capture workflow or a discard feature.

**Pass origin and timing evidence:** Phase 3 planning must specify how a pass is associated with a metronome downbeat, including a missed first note, a late start, and several plausible downbeats. The recorded click timeline remains the reference; choosing an origin must not erase an initial timing error. Ambiguous origins remain unassessed. Use that same origin policy in Phase 4. The stored on-click playing median is a diagnostic observation, not proof of device latency and not an automatic correction. Before timing verdicts, establish the clock/output-latency comparison with independent evidence and retain the original observations. These instructions govern downstream analysis where older Phase 2 context leaves interpretation to later phases; preserve completed capture and its raw records.

**Verification:** VRFY-01 is mapped to Phase 7 for traceability, but it applies to every phase — each phase below carries "user tried it at the FP-60X over USB" as an explicit success criterion. A phase is not done until the user has played it.

**Scope discipline:** Exactly the 18 v1 requirements, nothing more. Tempo drift per bar, relative dynamics, hands-separate passages, and playback are v2 and stay out of these phases. Repeat signs and first/second endings are not handled in this milestone; the pieces used will not contain them.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Score on Screen** - Load a tiny MusicXML exercise, see real notation, note model ready for alignment (completed 2026-09-13)
- [x] **Phase 2: Click and Capture** - Completed per user report on 2026-09-14; final checkpoint evidence has not yet been recorded locally
- [ ] **Phase 3: What You Actually Played** - Pitch mistakes and basic repeated-mistake counts, proven one exercise rung at a time
- [ ] **Phase 4: Early and Late** - Onset deviation against the click, shown per note
- [ ] **Phase 5: Habits, Not Slips** - Aggregate across every pass in the session, painted on the score with counts
- [ ] **Phase 6: Real Pieces and Passages** - Load a full piece and select the bars to drill
- [ ] **Phase 7: History That Survives** - Reopen past sessions, export and import the whole history

## Phase Details

### Phase 1: Score on Screen

**Goal**: User can open a tiny MusicXML exercise and see it as real notation, with every note modelled precisely enough that alignment can be built on it
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: SCORE-01, SCORE-03
**Success Criteria** (what must be TRUE):

  1. User opens a `.musicxml`, `.xml`, or `.mxl` file exported from MuseScore and sees it rendered as real notation in Chrome; the whole file is the passage, with no bar selection
  2. Every note in the file carries a stable id plus measure, staff, voice, onset in beats, duration, pitch, and resolved ties — inspectable in the app for the loaded file, so hand/staff filtering and bar selection can be added later without a data-model change
  3. The five-file verification ladder exists in the repo and every file renders with the right notes on the right staff
  4. User sat at the FP-60X with the laptop and loaded each ladder file

**Plans:** 3/3 plans complete

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Tracer: rung 1 through the real OSMD parser into the plain score model (node:test), then the double-click index.html slice with the inspect table and the noteId to SVG map

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Ladder rungs 2-5 as fixtures with exact note-list tests, rung 5 built from MuseScore (.musicxml and .mxl), tie fixture and model-contract tests

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Phase gate (full suite, file:// run-path checks, ladder manifest) and the blocking at-the-piano checkpoint

**UI hint**: yes

### Phase 2: Click and Capture

**Goal**: User can drill a passage to a metronome and have every repetition recorded as raw MIDI that nothing can lose
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: CAPT-01, CAPT-02, CAPT-03, CAPT-04, CAPT-05, HIST-01
**Success Criteria** (what must be TRUE):

  1. User picks the FP-60X from the connected MIDI inputs and sees a live indicator that notes are arriving as they play, with no per-note grading
  2. User sets a BPM and hears a steady Web Audio click; a note played deliberately on a click reads as a near-zero offset, so the MIDI-timestamp / audio-clock relationship is measured at the piano, not assumed
  3. User marks the boundary between passes with one action (spacebar, a chosen MIDI key, or the sustain pedal) and the session splits into numbered repetitions with a note count each
  4. Closing the tab and reopening restores the piece, the passage, and every recorded repetition with its raw note-on, note-off, velocity, and timestamp data unmodified
  5. User ran a real 10+ pass drill at the FP-60X over USB on a ladder file and every pass was captured as its own repetition with nothing missing

**Status:** User reported Phase 2 finished on 2026-09-14. Three of four plan summaries are present; `02-04-SUMMARY.md` and its measured piano results are not present locally. Preserve this distinction: do not invent checkpoint responses or treat an unknown calibration result as zero. Reconcile the final record when available; this planning revision does not re-execute Phase 2.

**Plans:** 3/4 plans documented; phase complete per user report

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Tracer: pick the MIDI input, write every raw message to IndexedDB as it arrives, reopen restores the piece and the events unmodified (headless Chrome from file://); decode table and storage schema pinned with node:test

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — Web Audio look-ahead click with beat-1 accent, click timeline and clock pair stored per session, live clock readout (offset, median, latency), calibration on the session, BPM per piece and mid-session change

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-03-PLAN.md — B7+C8 and spacebar pass marking as marker records in the raw stream, pure detector and segmenter, live pass list with note counts, interrupted-session restore

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 02-04-PLAN.md — Phase gate (all node/npm checks, piano checklist) and the two blocking at-the-piano checkpoints: clock relationship, 10+ pass drill

### Phase 3: What You Actually Played

**Goal**: User can trust pitch-mistake marks and basic counts across repeated attempts, first on right-hand C D E F G and then on each harder exercise
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: ANLZ-01, ANLZ-03; early pitch-only slice of AGGR-01 and AGGR-03 (full acceptance remains Phase 5)
**Success Criteria** (what must be TRUE):

  1. Synthetic performances with known mistakes (fixtures) produce the expected wrong/missed/extra classification in tests that run with no DOM, MIDI, or audio present
  2. After one recorded pass, assessable score notes are classified as played, missed, or wrong-pitch, and extra played notes are flagged, without chords or small timing sloppiness producing false mistakes. Uncertain alignment and interrupted regions are visibly unassessed, with reasons; they are not forced into a mistake classification
  3. Those classifications appear painted on the rendered notation at the right noteheads, not in a separate list
  4. User played one clean pass and one deliberately wrong pass at the FP-60X on each ladder file, and the marks matched what they actually did
  5. Before advancing beyond rung 1, user played 10+ passes at one tempo with one repeated pitch mistake and one one-off slip. Selecting a marked score note shows plain-language counts with assessed and unassessed totals, and the user confirms the recurring mistake is distinguishable from the slip. Reuse this minimal view as the ladder expands; bar shading, intensity scales, timing statistics, and ranked lists are not needed for this experiment
  6. Fixture examples cover a missing first note, late entry, repeated pitches, an extra note, an interrupted pass, ambiguous alignment, and tempo changes. The pass-origin and counting rules above explain each result, and these rules are checked on relevant piano examples before the next rung

**Plans:** 1/9 plans executed

Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Interpretation contract docs/analysis-rules.md. Covers every rule, reconciled rung-1 examples, late-entry readings with a probe-token lag bound, the `reachClock` switch (D-11 default, user decision pending), finalization over stable fields, gap denominators with "at least" lower bounds, tempo membership, chord rules, seq-ordered tokens with an absolute chord window, restart judged over every optimal alternative, shapes and tunables. Also twelve hand-derived rung-1 fixtures with an exact-coverage shape test, and the headless-Chrome paint harness with per-group OK lines, including Start during a delayed restoration and an unreadable file during capture (red until the tracer)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 03-02-PLAN.md — Tracer: one marked pass of C D F F G goes align → aggregate → paint → red E4 on the notation and the detail sentence on click. Then:
  - a pass is judged only once its clicks exist (live equals replay over stable fields);
  - sessions stay bound to their own score across piece switches and same-file reopens;
  - Start and Stop invalidate in-flight restorations, and a failed piece load ends capture cleanly with its passes kept;
  - final results are reused;
  - the detail panel regenerates.

  All twelve fixtures green

**Wave 3** *(blocked on Wave 2; 03-03 and 03-04 run in parallel, disjoint files)*

- [ ] 03-03-PLAN.md — Engine, rung-1 rules: ambiguity from the co-optimal edge set (repeated pitches, messy pass), the late-entry reading robust to a stray or missing opening note, both reach clocks pinned, restart without a mark judged over every optimal alternative (tie fixture), tempo change inside a pass (clicks strictly before the end), no-origin edge, measured analysis budget (median and worst)
- [ ] 03-04-PLAN.md — Display: single-pass view and the way back with the detail following the view, tempo-group selector that always returns to a session view, extra-note + glyphs (system breaks included) with counts and whole-result sentences, twelve-line paint harness with reconciled counts, suffix-tolerant capture round-trip check, and the complete live click callback measured in Chrome

**Wave 4** *(blocked on 03-03 and 03-04)*

- [ ] 03-05-PLAN.md — Rung-1 piano gate: all node/npm checks (including the messy pass through the browser UI and the live-callback budget), README and a rung-1 checklist with the ready rule, views and sentences. Then at the FP-60X:
  - Scenario A: single passes, including the reach decision, a doubled E and a within-pass tempo change;
  - Scenario B: twelve passes at one tempo, then a controlled BPM change right after a mark.

**Wave 5** *(blocked on the rung-1 approval and reach decision in 03-05)*

- [ ] 03-06-PLAN.md — Rung 2: apply the user's reach decision to its one switch, ladder regression through the real OSMD parser against an independent oracle (rungs 1-2), rung-2 checklist and piano check (with a piano recheck of the late-and-abandoned bar if the user chose "reading")

**Wave 6** *(blocked on the rung-2 approval in 03-06 and, after a "reading" choice, the D-11 amendment in 03-CONTEXT.md)*

- [ ] 03-07-PLAN.md — Rung 3: both hands as one slot (fixture and ladder), two-hand offsets around the 50 ms window in both orders with the tolerance recorded, rung-3 checklist and piano check

**Wave 7** *(blocked on the rung-3 approval in 03-07)*

- [ ] 03-08-PLAN.md — Rung 4: chords per notehead with re-strikes, an exact in-chord assignment that reports ties as ambiguous (no cap, checked against an equal-first brute-force oracle, oversized fumble tokens), chord performance in node and Chrome, ladder rung 4, rung-4 checklist with the equidistant chord and timestamp-based roll diagnosis, piano check

**Wave 8** *(blocked on the rung-4 approval in 03-08)*

- [ ] 03-09-PLAN.md — Rung 5 and phase close: ladder rung 5 with interpolation anchors, 60 BPM and repeated bass pitches, rung-5 checklist and piano check (late, wrapped, repeated G3, a reopen compared sentence by sentence against a session with known marks), evidence table per success criterion

**UI hint**: yes

### Phase 4: Early and Late

**Goal**: User can see which notes they rush and which they drag, measured against the click
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: ANLZ-02
**Success Criteria** (what must be TRUE):

  1. Every confidently matched, correctly played note with an established pass origin reports its onset deviation from the metronome-defined expected time in milliseconds, with direction. Uncertain notes remain unassessed
  2. Each note is classified early, on time, or late using a tolerance the user can adjust, and changing the tolerance re-classifies the stored pass without replaying it
  3. Timing marks appear on the score alongside Phase 3's wrong/missed/extra marks without hiding them
  4. User played a pass at the FP-60X deliberately rushing one bar and dragging another, and the app flagged those bars in the right direction
  5. A deliberately late first note or omitted first note does not shift the expected timeline to hide the error. Timing verification records the clock/output-latency evidence separately from the user's observed playing offsets; no stored playing median is automatically subtracted. If timing remains uncertain, keep pitch feedback usable and resolve the timing evidence before claiming this phase complete

**Plans**: TBD

### Phase 5: Habits, Not Slips

**Goal**: After many repetitions, the score shows the handful of spots and habits worth working on, with the number of passes behind each
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: AGGR-01, AGGR-02, AGGR-03
**Success Criteria** (what must be TRUE):

  1. Extend Phase 3's pitch counts to the full aggregate, including timing: each score note shows a count and rate over assessed opportunities at the same constant tempo, for example "missed in 6 of 22 assessed passes; 2 unassessed". All raw passes remain available; different tempos are separated and passes with within-pass tempo changes are labelled outside the initial comparison
  2. The notation shows the aggregate: noteheads coloured by dominant mistake type with intensity by rate, and bars shaded by their worst per-note rate
  3. Hovering or clicking a marked note or bar gives plain-language detail — what kind of mistake, how many passes, typical timing offset
  4. A one-off slip is visibly distinguishable from a habit, so the user can tell which marks to trust
  5. User drilled the four-bar ladder file 20+ times at the FP-60X over USB and agreed the highlighted spots are the ones actually worth practising
  6. Before Phase 6, user uses that feedback to choose one problem, practises it specifically, then records a fresh set of passes on the same four bars at the same tempo. Compare the two sets separately (two sessions and a recorded observation are sufficient; no trend dashboard). Record the chosen problem, before/after counts, and whether the feedback matches what the user heard and helps choose the next practice action. Improvement is not a guaranteed pass condition: unchanged or worse playing must be reported honestly. Misleading or unusable feedback sends work back to the relevant analysis/display step before expanding to full pieces

**Plans**: TBD
**UI hint**: yes

### Phase 6: Real Pieces and Passages

**Goal**: User can load a full piece they actually practice and mark off exactly the bars they want to drill
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: SCORE-02
**Success Criteria** (what must be TRUE):

  1. User opens a real multi-page piece exported from MuseScore and it renders as notation with nothing missing
  2. Nothing is selected until the user clicks a bar; clicking a start bar and then an end bar highlights those bars visibly on the notation, and two number fields mirror the choice
  3. Bar numbers follow the printed numbers from MuseScore, so a pickup bar is bar 0 and the first full bar is bar 1
  4. Only the selected bars form the expected note sequence for capture, alignment, and the aggregate; repeat signs and endings are not expanded
  5. User selected the passage they would really drill at the FP-60X over USB, ran a drill, and the aggregate covered only those bars

**Plans**: TBD
**UI hint**: yes

### Phase 7: History That Survives

**Goal**: Practice history outlives the session and the browser, so trouble spots can be watched over weeks
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: HIST-02, HIST-03, VRFY-01
**Success Criteria** (what must be TRUE):

  1. User reopens a piece and sees the aggregate for a previous session of the same passage, labelled by date
  2. User exports the entire history to a single file and imports it back into a cleared browser or a second Chrome profile, with the same pieces, sessions, and aggregates showing afterwards
  3. User practised the same passage on two separate days at the FP-60X over USB, and on the second day the first day's session and its marked trouble spots were still there
  4. Every phase of this milestone was tried by the user at the FP-60X over USB before being counted done (VRFY-01 closed out)

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Score on Screen | 3/3 | Complete    | 2026-09-13 |
| 2. Click and Capture | 3/4 documented | Complete per user; final evidence record pending | 2026-09-14 |
| 3. What You Actually Played | 1/9 | In Progress|  |
| 4. Early and Late | 0/TBD | Not started | - |
| 5. Habits, Not Slips | 0/TBD | Not started | - |
| 6. Real Pieces and Passages | 0/TBD | Not started | - |
| 7. History That Survives | 0/TBD | Not started | - |

---
*Roadmap created: 2026-09-13*
*Reshaped 2026-09-13 during Phase 1 discussion: bar selection moved to Phase 6, verification ladder added*
*Redirected 2026-09-14: early pitch aggregate in Phase 3, ordered piano gates, explicit interpretation rules, and a practice-and-recheck gate before Phase 6; phase numbering and v2 scope retained.*
