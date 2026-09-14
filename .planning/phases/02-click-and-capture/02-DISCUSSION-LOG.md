# Phase 2: Click and Capture - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-13
**Phase:** 02-click-and-capture
**Areas discussed:** Pass marking, Metronome and anchoring, Clock check, Sessions and restore

---

## Pass marking

| Option | Description | Selected |
|--------|-------------|----------|
| Sustain pedal | Pedal down marks; hands stay on keys | |
| Spacebar only | Simplest; reach to laptop | |
| A chosen MIDI key | A key the exercise never uses, excluded from the pass | |
| B7+C8 together plus spacebar | User's own proposal after learning the pedal would need a double-tap gesture | ✓ |

**User's choice:** B7+C8 pressed together, and spacebar.
**Notes:** User uses the sustain pedal while playing, so it cannot be the marker. Double-tap was offered and rejected as a mis-split risk.

| Option | Description | Selected |
|--------|-------------|----------|
| One press ends and starts | Each mark closes the current pass and opens the next | ✓ |
| Separate start and stop | Notes between stop and start discarded | |
| Mark with discard-last-pass | Extra action to throw away the last pass | |

**User's choice:** One press ends and starts.

| Option | Description | Selected |
|--------|-------------|----------|
| Keep everything | Every note inside a pass is the pass; aggregate handles one-offs | ✓ |
| Ignore notes until next downbeat click | Drop notes before the next bar-one click | |
| Mark twice to discard | Two marks with no notes between flags the previous pass | |

**User's choice:** Keep everything. "I don't get why I would play stray notes. They would be mistakes."

---

## Metronome and anchoring

| Option | Description | Selected |
|--------|-------------|----------|
| Accent beat 1 from the score's time signature | Higher click on beat 1 | ✓ |
| Plain even click | Every beat the same | |
| Accent plus subdivision ticks | Eighth-note ticks between beats | |

**User's choice:** Accent beat 1 from the score's time signature.

| Option | Description | Selected |
|--------|-------------|----------|
| Continuous click, start each pass on a bar-one click | All click times stored; mark is a timestamp; Phase 4 aligns | ✓ |
| Mark restarts the click at bar one | Metronome resets at each mark | |
| Click stops between passes, Start button | One more action per pass | |

**User's choice:** Continuous click; start each pass on a bar-one click.

---

## Clock check

| Option | Description | Selected |
|--------|-------------|----------|
| Live readout: last note offset and running median | Diagnostic panel, collapsible | ✓ |
| Summary after each pass | Median per pass only | |
| Separate calibration page | Dedicated screen | |

**User's choice:** Live readout with running median.

| Option | Description | Selected |
|--------|-------------|----------|
| Store as session calibration, apply nothing | Phase 4 decides | ✓ |
| User-typed offset applied to display | Risk of hiding a clock bug | |
| Ignore, display only | Phase 4 re-measures | |

**User's choice:** Store as session calibration value, apply nothing yet.

| Option | Description | Selected |
|--------|-------------|----------|
| Laptop speakers or headphones | Default Chrome output | |
| FP-60X speakers over USB audio | Needs output-device selection | |
| Decide at the piano | Laptop default first | ✓ |

**User's choice:** Not sure yet, decide at the piano.

---

## Sessions and restore

| Option | Description | Selected |
|--------|-------------|----------|
| Pressing Start on the metronome | Ends on Stop or tab close; never spans pieces | ✓ |
| Opening a piece | Every file open is a session | |
| One per piece per calendar day | Morning and evening merge | |

**User's choice:** Pressing Start on the metronome.

| Option | Description | Selected |
|--------|-------------|----------|
| Same session, tempo recorded per pass | Phase 5 can filter later | ✓ |
| Tempo change starts a new session | Fragments a drill | |

**User's choice:** Same session, tempo recorded per pass.

| Option | Description | Selected |
|--------|-------------|----------|
| Piece reloaded, passes listed, session ended, Start = new session | Crash never merges sittings | ✓ |
| Resume the interrupted session | Next pass numbered after the last | |
| Reopen empty, pick from a list | One more step every session | |

**User's choice:** Piece reloaded, passes listed, session marked ended; Start opens a new session.

## Claude's Discretion

Live indicator design, MIDI input selector behaviour, raw event record format and batching, `idb` UMD versus raw IndexedDB, BPM control and range, clock re-sampling schedule, layout and styling, whether the in-progress pass at Stop is kept (kept if it has at least one note).

## Deferred Ideas

Click through the FP-60X over USB audio with an output picker; discard-last-pass action; count-in (v2 CAPT-06); drag-and-drop opening.
