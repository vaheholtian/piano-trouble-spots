# Roadmap: Piano Mistakes

## Overview

Six phases build one loop and nothing else: load a piece, pick a few bars, drill them to a click many times, and see the handful of spots worth working on painted on the actual notation. Each phase is a vertical slice the user can sit down and try at the Roland FP-60X over USB — never a component finished in isolation. Phase 1 puts real notation on screen (everything downstream paints onto it or compares against it). Phase 2 makes a practice session recordable and durable, and settles the MIDI-clock vs audio-clock question empirically at the piano before anything depends on timestamp correctness. Phase 3 proves alignment on a single pass. Phase 4 adds early/late. Phase 5 is the actual product — the aggregate across 20+ passes. Phase 6 makes it survive a browser reset and span weeks.

**Verification:** VRFY-01 is mapped to Phase 6 for traceability, but it applies to every phase — each phase below carries "user tried it at the FP-60X over USB" as an explicit success criterion. A phase is not done until the user has played it.

**Scope discipline:** Exactly the 18 v1 requirements, nothing more. Tempo drift per bar, relative dynamics, hands-separate passages, and playback are v2 and stay out of these phases.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Score on Screen** - Load a MusicXML piece, see real notation, select the bars to drill
- [ ] **Phase 2: Click and Capture** - Metronome, MIDI recording, manual pass marking, nothing ever lost
- [ ] **Phase 3: What You Actually Played** - One pass aligned to the score; wrong, missed, and extra notes marked on the notation
- [ ] **Phase 4: Early and Late** - Onset deviation against the click, shown per note
- [ ] **Phase 5: Habits, Not Slips** - Aggregate across every pass in the session, painted on the score with counts
- [ ] **Phase 6: History That Survives** - Reopen past sessions, export and import the whole history

## Phase Details

### Phase 1: Score on Screen
**Goal**: User can open the piece they are about to practice and mark off exactly the bars they want to drill
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: SCORE-01, SCORE-02, SCORE-03
**Success Criteria** (what must be TRUE):
  1. User opens a `.musicxml`, `.xml`, or `.mxl` file exported from MuseScore and sees it rendered as real notation in Chrome
  2. User sets a start bar and an end bar, and those bars are visibly highlighted on the notation
  3. Every note in the score carries a stable id plus measure, staff, voice, onset in beats, duration, pitch, and resolved ties — inspectable for the selected passage, so hand/staff filtering can be added later without a data-model change
  4. User sat at the FP-60X with the laptop, loaded a piece they actually practice, and selected the passage they would really drill
**Plans**: TBD
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
  5. User ran a real 10+ pass drill at the FP-60X over USB and every pass was captured as its own repetition with nothing missing
**Plans**: TBD

### Phase 3: What You Actually Played
**Goal**: After a single pass, the user sees on the notation which notes were wrong, missed, or extra
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: ANLZ-01, ANLZ-03
**Success Criteria** (what must be TRUE):
  1. Synthetic performances with known mistakes (fixtures) produce the expected wrong/missed/extra classification in tests that run with no DOM, MIDI, or audio present
  2. After one recorded pass, every score note in the passage is classified as played, missed, or wrong-pitch, and extra played notes are flagged, without chords or small timing sloppiness producing false mistakes
  3. Those classifications appear painted on the rendered notation at the right noteheads, not in a separate list
  4. User played one clean pass and one deliberately wrong pass at the FP-60X, and the marks matched what they actually did
**Plans**: TBD
**UI hint**: yes

### Phase 4: Early and Late
**Goal**: User can see which notes they rush and which they drag, measured against the click
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: ANLZ-02
**Success Criteria** (what must be TRUE):
  1. Every correctly played note reports its onset deviation from the metronome-defined expected time in milliseconds, with direction
  2. Each note is classified early, on time, or late using a tolerance the user can adjust, and changing the tolerance re-classifies the stored pass without replaying it
  3. Timing marks appear on the score alongside Phase 3's wrong/missed/extra marks without hiding them
  4. User played a pass at the FP-60X deliberately rushing one bar and dragging another, and the app flagged those bars in the right direction
**Plans**: TBD

### Phase 5: Habits, Not Slips
**Goal**: After many repetitions, the score shows the handful of spots and habits worth working on, with the number of passes behind each
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: AGGR-01, AGGR-02, AGGR-03
**Success Criteria** (what must be TRUE):
  1. Each score note's result is reported across all passes in the session as a count and rate, for example "missed in 6 of 22 passes", rather than per-take verdicts
  2. The notation shows the aggregate: noteheads coloured by dominant mistake type with intensity by rate, and bars shaded by their worst per-note rate
  3. Hovering or clicking a marked note or bar gives plain-language detail — what kind of mistake, how many passes, typical timing offset
  4. A one-off slip is visibly distinguishable from a habit, so the user can tell which marks to trust
  5. User drilled a real passage 20+ times at the FP-60X over USB and agreed the highlighted spots are the ones actually worth practising
**Plans**: TBD
**UI hint**: yes

### Phase 6: History That Survives
**Goal**: Practice history outlives the session and the browser, so trouble spots can be watched over weeks
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: HIST-02, HIST-03, VRFY-01
**Success Criteria** (what must be TRUE):
  1. User reopens a piece and sees the aggregate for a previous session of the same passage, labelled by date
  2. User exports the entire history to a single file and imports it back into a cleared browser or a second Chrome profile, with the same pieces, sessions, and aggregates showing afterwards
  3. User practised the same passage on two separate days at the FP-60X over USB, and on the second day the first day's session and its marked trouble spots were still there
  4. Every phase of this milestone was tried by the user at the FP-60X over USB before being counted done (VRFY-01 closed out)
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Score on Screen | 0/TBD | Not started | - |
| 2. Click and Capture | 0/TBD | Not started | - |
| 3. What You Actually Played | 0/TBD | Not started | - |
| 4. Early and Late | 0/TBD | Not started | - |
| 5. Habits, Not Slips | 0/TBD | Not started | - |
| 6. History That Survives | 0/TBD | Not started | - |

---
*Roadmap created: 2026-09-13*
