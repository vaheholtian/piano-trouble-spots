# Requirements: Piano Mistakes

**Defined:** 2026-09-13
**Core Value:** After many repetitions of a passage, the score shows the handful of spots and habits worth working on, with enough repetitions behind each one that the pianist trusts it.

Scope stance: deliberately small. v1 is the thinnest loop that delivers the core value at the piano. Everything else is sequenced, not dropped.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Score

- [ ] **SCORE-01**: User can open a MusicXML file (`.musicxml`, `.xml`, or compressed `.mxl` exported from MuseScore) and see it rendered as real notation in Chrome
- [ ] **SCORE-02**: User can select a passage as a start bar and end bar, and the selected bars are visibly highlighted on the notation (Phase 6; until then the whole loaded file is the passage)
- [ ] **SCORE-03**: The internal score model carries measure, staff, voice, onset in beats, duration, pitch, and resolved ties for every note, so hand or staff filtering can be added later without a data-model change

### Capture

- [ ] **CAPT-01**: User can pick a connected USB MIDI input in Chrome and the app records note-on, note-off, velocity, and timestamp for every event
- [ ] **CAPT-02**: User can see a minimal live indicator that notes are arriving (for example a count or a brief flash), with no per-note grading
- [ ] **CAPT-03**: User can set a tempo in BPM and hear an audible metronome click scheduled with Web Audio (not timers), which defines the expected timeline of the passage
- [ ] **CAPT-04**: User can mark the boundary between repetitions with one action (spacebar, a chosen MIDI key, or the sustain pedal), and each pass is stored as its own repetition
- [ ] **CAPT-05**: Raw MIDI events for every repetition are stored unmodified, so analysis can be re-run later with improved algorithms

### Analysis

- [ ] **ANLZ-01**: For each repetition, played notes are aligned to the passage's score notes, tolerant of chords and small timing errors, and each score note is classified as played, missed, or wrong-pitch, with extra played notes flagged
- [ ] **ANLZ-02**: For each played score note, the onset deviation from the metronome-defined expected time is measured in milliseconds and classified as early, on time, or late using an adjustable tolerance
- [ ] **ANLZ-03**: Analysis code has no DOM, MIDI, or audio dependencies and is covered by fixture-based tests of synthetic performances with known mistakes

### Aggregate and display

- [ ] **AGGR-01**: Mistakes are aggregated across all repetitions of the passage in the session, and each score note's result is reported as a count and rate, for example "missed in 6 of 22 passes"
- [ ] **AGGR-02**: The rendered notation shows the aggregate: noteheads coloured by their dominant mistake type and intensity by rate, and bars shaded by their worst per-note rate
- [ ] **AGGR-03**: User can hover or click a marked note or bar to see the plain-language detail (what kind of mistake, how many passes, typical timing offset)

### History

- [ ] **HIST-01**: Pieces, sessions, repetitions, and raw events are saved in the browser (IndexedDB) so closing the tab loses nothing
- [ ] **HIST-02**: User can export all history to a single file and import it back on the same or another browser
- [ ] **HIST-03**: User can reopen a piece and see the aggregate for a previous session of the same passage

### Verification

- [ ] **VRFY-01**: Every phase ends with the user trying the delivered slice at the Roland FP-60X over USB before the phase counts as done
- Verification ladder: five tiny MusicXML files made in MuseScore (right hand C D E F G, left hand same, both hands, a chord or two, four real bars) are kept in the repo and used at the piano for Phases 1 to 5, so detection accuracy is checked on scores where every note can be verified by eye

## v2 Requirements

Deferred to the next milestone. Tracked but not in the current roadmap. The first two are the user's headline examples and go first once alignment is trusted.

### Analysis

- **ANLZ-04**: Per-bar tempo drift relative to the click ("you slow down in bar 12")
- **ANLZ-05**: Relative dynamics: notes played noticeably louder or softer than their neighbours in the same pass ("you press that E too hard"), never compared to a reference

### Score

- **SCORE-04**: User can restrict a passage to one hand or staff
- **SCORE-05**: User can hear the selected passage played back at the chosen tempo

### Capture

- **CAPT-06**: Count-in of one bar before each repetition
- **CAPT-07**: Progressive tempo ramp across sessions

### Aggregate and display

- **AGGR-04**: Ranked per-bar summary list beside the score
- **AGGR-05**: Whole-piece run-through with a trouble-spot heat map

### History

- **HIST-04**: Trend view of a passage's trouble spots across weeks

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| PDF or scanned scores | Optical music recognition is a separate hard project; export MusicXML from MuseScore instead |
| MIDI-only reference files with no notation | MIDI-to-notation is lossy; MusicXML is canonical for this milestone |
| Automatic detection of repetition boundaries | Unsolved even by funded competitors; manual marking is reliable and trivial |
| Free-tempo analysis without a metronome | Removes the fixed clock that makes timing tractable; revisit after alignment is proven |
| Absolute dynamics against a reference performance | User decision: dynamics are only ever relative to neighbouring notes |
| Pedal, articulation, finger-strength assessment | Not reliably measurable from MIDI note data |
| Live per-take colour grading, stars, streaks | Conflicts with the aggregate-first thesis; one pass means nothing |
| Phone or tablet on the music stand, LAN relay | The prototype burned sessions here before validating the core loop |
| Any server, login, or cloud sync | Browser-only with local storage and file export is enough for one user on one laptop |
| Microphone pitch detection | Unreliable for polyphonic classical passages; MIDI is the accuracy advantage |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCORE-01 | Phase 1 | Pending |
| SCORE-02 | Phase 6 | Pending |
| SCORE-03 | Phase 1 | Pending |
| CAPT-01 | Phase 2 | Pending |
| CAPT-02 | Phase 2 | Pending |
| CAPT-03 | Phase 2 | Pending |
| CAPT-04 | Phase 2 | Pending |
| CAPT-05 | Phase 2 | Pending |
| ANLZ-01 | Phase 3 | Pending |
| ANLZ-02 | Phase 4 | Pending |
| ANLZ-03 | Phase 3 | Pending |
| AGGR-01 | Phase 5 | Pending |
| AGGR-02 | Phase 5 | Pending |
| AGGR-03 | Phase 5 | Pending |
| HIST-01 | Phase 2 | Pending |
| HIST-02 | Phase 7 | Pending |
| HIST-03 | Phase 7 | Pending |
| VRFY-01 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0 ✓

Note: VRFY-01 (verify at the piano) is mapped to Phase 7 so it appears exactly once, but it is enforced in every phase — each phase in ROADMAP.md carries "user tried it at the FP-60X over USB" as an explicit success criterion.

---
*Requirements defined: 2026-09-13*
*Last updated: 2026-09-13 after Phase 1 discussion (bar selection moved to Phase 6, verification ladder added)*
