# Piano Mistakes

## What This Is

A local browser app for a pianist with a USB MIDI piano. You load a piece, choose a passage, play it many times to a metronome, and the app marks up the actual sheet music with the mistakes you keep making: wrong, missed, and extra notes, early or late notes, bars where you slow down, and notes you hit harder or softer than their neighbours. It replaces a tutor saying "you keep doing X in bar 12", for one person practicing alone.

## Core Value

After many repetitions of a passage, the score shows the handful of spots and habits worth working on, with enough repetitions behind each one that the pianist trusts it.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Load a piece as MusicXML and see it rendered as real notation in the browser
- [ ] Choose a passage (a range of bars, optionally one hand or staff) to drill
- [ ] Connect a USB MIDI piano in Chrome and record what is played, with velocities and timestamps
- [ ] Practice to a metronome at a tempo the user sets; timing is judged against that click
- [ ] Mark the boundary between repetitions manually (spacebar, a pedal, or a spare key)
- [ ] Align each repetition to the score and detect wrong, missed, and extra notes
- [ ] Detect early and late notes and bars where the tempo drifts, relative to the click
- [ ] Detect notes played noticeably louder or softer than their neighbouring notes in the same pass (relative dynamics, never compared to a reference)
- [ ] Aggregate mistakes across all repetitions in a session, so a one-off slip is distinguishable from a habit
- [ ] Show the aggregate on the score: which notes and bars, and what kind of mistake, with how many passes it happened in
- [ ] Keep practice history per piece across sessions so trouble spots can be seen to shrink over weeks
- [ ] Export and import history as a file so it survives a browser reset
- [ ] Verify every phase at the actual piano, not only with tests

### Out of Scope

- PDF or scanned scores — optical music recognition is a separate hard project; use MusicXML exported from MuseScore instead
- MIDI-only reference files (no notation) — deferred; MusicXML is the canonical format for milestone 1
- Automatic detection of where each repetition starts and ends — deferred; manual marking is simpler and reliable
- Free-tempo (no metronome) analysis — deferred; metronome-anchored timing first
- Whole-piece run-through with a trouble-spot heat map — deferred until the passage loop is proven
- Absolute dynamics compared to a reference performance — never; only relative to neighbouring notes
- Pedal, articulation, and finger-strength assessment — not measurable reliably from MIDI note data
- Phone or tablet on the music stand, and the LAN relay from the prototype — deferred; laptop with USB cable first
- Any server, login, or cloud sync — deferred; browser-only with local storage and file export
- Grading a single take as pass or fail — one pass means nothing; the product is the aggregate

## Context

- **The prototype failed on product, not code.** A timing-only tool at tag `v0-prototype` (kept under `prototype/`) anchored on the first note, assumed the MIDI's exact tempo, refused to score wrong notes, and had no visual on the score. Several sessions went into a phone relay, Bluetooth pairing, and hardening instead of one real practice session. Its MIDI parser and relay are reusable reference material; its design is not the base for this build.
- **The user's practice pattern.** Mistakes are numerous, so a single pass is not representative. The user repeats a passage easily more than 20 times and wants to be told "on this bar you slow down", "you press that E too hard", "you keep missing a note in that chord".
- **Progression the user asked for.** Start simple: manual pass marking, metronome first, passages before whole piece. Do not rush the steps. Concretely: right hand C D E F G, then left hand, then both hands, then chords, then four real bars, and only then a whole piece with bar selection. No repeat signs or endings in this milestone.
- **Hardware.** Roland FP-60X connected over USB to a Windows 11 laptop running Chrome. Chrome exposes Web MIDI with timestamps and velocities.
- **Score availability.** The user can supply pieces as MusicXML, MIDI, or PDF. MusicXML chosen because it carries bars, staves, voices, and ties, and renders as real notation with existing libraries.
- **Success in a month.** The user opens it every session, identifies where they played wrong without a tutor, and fixes those mistakes.

## Constraints

- **Platform**: Chrome on Windows 11 laptop with Web MIDI — the one environment that will actually be used; no need for Safari or iOS support in milestone 1
- **Architecture**: Browser-only, no server, no build step required to run — keeps the friction of opening it every session near zero; the prototype showed how much time infrastructure eats
- **Data**: Local browser storage plus file export/import — no accounts or sync; history must survive a browser reset via export
- **Verification**: Every phase must be tried at the piano by the user before it counts as done — the prototype was never played once
- **Input format**: MusicXML only for milestone 1 — avoids MIDI-to-notation conversion, which is lossy and hard

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| MusicXML as the canonical reference format | Real notation to render and mark; bars, hands, voices, ties come for free; avoids building MIDI-to-notation | — Pending |
| Manual repetition marking (key or pedal) | Reliable, trivial to build; auto-detection is a later milestone | — Pending |
| Metronome-anchored timing first | Removes tempo estimation from the alignment problem; free tempo later | — Pending |
| Relative dynamics only | User wants "that E is louder than its neighbours", not comparison to a reference performance | — Pending |
| Browser-only, local storage, file export | Zero friction to open; no infrastructure; tablet or sync can be added later without rework of the analysis | — Pending |
| Passages before whole piece | User explicitly does not want to rush; prove the loop on a few bars first | — Pending |
| Tiny test-score ladder before real pieces | Detection accuracy comes first; each rung is a MusicXML file made in MuseScore (right hand C D E F G, left hand, both hands, chords, four real bars) where every note can be verified by eye, and the whole file is the passage until the aggregate is trusted; bar selection and real pieces wait for Phase 6 | — Pending |
| Restart from scratch rather than extend the prototype | The prototype's fixed-tempo, timing-only design and lack of score display were the failure, not its code quality | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-13 after Phase 1 discussion*
