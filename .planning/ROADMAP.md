# Roadmap: Piano Mistakes

## Overview

Seven phases build one loop and nothing else: load a score, drill it to a click many times, and see the handful of spots worth working on painted on the actual notation. Each phase is a vertical slice the user can sit down and try at the Roland FP-60X over USB — never a component finished in isolation. Phase 1 puts real notation on screen from tiny exercise files (everything downstream paints onto it or compares against it). Phase 2 makes a practice session recordable and durable, and settles the MIDI-clock vs audio-clock question empirically at the piano before anything depends on timestamp correctness. Phase 3 proves alignment on a single pass. Phase 4 adds early/late. Phase 5 is the actual product — the aggregate across 20+ passes. Phase 6 brings in real pieces and selecting the bars to drill, once detection is trusted. Phase 7 makes it survive a browser reset and span weeks.

**Detection accuracy first:** Through Phase 5 the "passage" is always the entire loaded file, and the files are tiny exercises the user makes in MuseScore so every note can be checked by eye and ear. Bar selection, pickup-bar numbering, repeats, and real multi-page pieces wait until Phase 6.

**Verification ladder:** Five small MusicXML files kept in the repo, used at the piano for every phase from 1 to 5:
1. Right hand only: C D E F G, one bar
2. Left hand only: the same
3. Both hands together
4. A chord or two
5. Four bars of a real piece

**Verification:** VRFY-01 is mapped to Phase 7 for traceability, but it applies to every phase — each phase below carries "user tried it at the FP-60X over USB" as an explicit success criterion. A phase is not done until the user has played it.

**Scope discipline:** Exactly the 18 v1 requirements, nothing more. Tempo drift per bar, relative dynamics, hands-separate passages, and playback are v2 and stay out of these phases. Repeat signs and first/second endings are not handled in this milestone; the pieces used will not contain them.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Score on Screen** - Load a tiny MusicXML exercise, see real notation, note model ready for alignment
- [ ] **Phase 2: Click and Capture** - Metronome, MIDI recording, manual pass marking, nothing ever lost
- [ ] **Phase 3: What You Actually Played** - One pass aligned to the score; wrong, missed, and extra notes marked on the notation
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
  5. User ran a real 10+ pass drill at the FP-60X over USB on a ladder file and every pass was captured as its own repetition with nothing missing
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
  4. User played one clean pass and one deliberately wrong pass at the FP-60X on each ladder file, and the marks matched what they actually did
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
  5. User drilled the four-bar ladder file 20+ times at the FP-60X over USB and agreed the highlighted spots are the ones actually worth practising
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
| 1. Score on Screen | 0/TBD | Not started | - |
| 2. Click and Capture | 0/TBD | Not started | - |
| 3. What You Actually Played | 0/TBD | Not started | - |
| 4. Early and Late | 0/TBD | Not started | - |
| 5. Habits, Not Slips | 0/TBD | Not started | - |
| 6. Real Pieces and Passages | 0/TBD | Not started | - |
| 7. History That Survives | 0/TBD | Not started | - |

---
*Roadmap created: 2026-09-13*
*Reshaped 2026-09-13 during Phase 1 discussion: bar selection moved to Phase 6, verification ladder added*
