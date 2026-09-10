# Trouble spots

A local MIDI piano practice tool focused on timing and physical key-hold lengths in a selected section.

Hosted at <https://vaheholtian.github.io/piano-trouble-spots/>, or open `piano-mistake-tracker.html` locally. Keep `piano-core.js` and `piano-app.js` in the same folder. No installation, server, or build is required.

Recording needs the Web MIDI API. Chrome, Edge, and Opera support it on desktop and Android. Firefox, and every browser on iOS and iPadOS, do not: those can open the page and load a saved session, but cannot connect a piano.

## Practice

1. Load a reference `.mid` or `.midi` file.
2. Choose a starting measure and a 4- or 8-measure section. Sections near the end stop at the last measure containing a note onset. If needed, choose one reference track for a single part.
3. Connect your piano and choose its MIDI input.
4. Click **Ready to record**, then play the section from its first note or chord at the reference MIDI's tempo.
5. Release the final keys, then click **Stop & review**. Recording does not stop during rests or long holds.
6. Review individual notes and recurring issues. Save the session before closing.

The first played note anchors the clock to the section's first reference note. Leading silence is ignored. After that, reference timing remains fixed, including any tempo changes encoded in the MIDI. The app never estimates your tempo or searches for the passage you played.

## Measurements

- **Note length:** played key-up minus key-down, compared with reference note-off minus note-on. A late attack with the correct duration is an attack issue, not a length issue.
- **Note start:** early/late against the reference timeline. The first played note is the anchor and cannot itself be graded early or late. Other notes in its chord can be assessed individually.
- **Timing drift:** change in offset between the first and last assessed reference onsets. Positive means finishing that assessed span behind the MIDI; negative means ahead. This is not a whole-section completion score.
- **Recurring issues:** counts for each reference note and measurement. Unassessed notes and unrecorded releases never enter the denominator. A measure's colour shows its highest per-note issue rate.

The two headline error values are median absolute differences, in milliseconds. The table retains the direction of each difference. Tolerances are adjustable independently for note length and note start. History is separated by section, reference track, and tolerances.

## Current boundaries

This phase intentionally defers automatic passage identification and pitch-error scoring. Pitch is used only to associate a performed key with an expected note inside the already selected section.

Association is conservative: the same pitch must fall within 750 ms of its expected onset and within the midpoint boundaries between repeated notes of that pitch. Multiple candidate attacks, duplicate unison reference parts, missing keys, and notes outside those windows are unassessed. Large departures can therefore reduce coverage; they must not be interpreted as a clean performance. Repeated passages and large timing errors will need more work in a later phase.

Lengths measure physical key holds, not pedal resonance. An unfinished release stays unknown. The reference MIDI's articulation is the target, which may differ from printed note values or an intended musical interpretation. MIDI does not identify your fingers, and this version does not assess velocity, finger strength, or pedal technique.

Supported reference files use MIDI format 0 or 1 with beat-based timing. Drum-channel notes are excluded. Files missing pitched-note releases are rejected because their durations are unknown. Measure numbering follows MIDI time signatures; there is no separate pickup-measure numbering control.

Session format 2 stores the reference, settings, and raw performed notes. Feedback is recalculated on import after validation. Sessions from the previous pitch-tracker prototype are rejected without changing current practice; keep those files if their history matters. Loading a new reference starts a new session.

## Development

- `piano-core.js`: MIDI parsing, fixed-section timing analysis, aggregation, and session validation; no DOM access.
- `piano-app.js`: controls, recording state, MIDI devices, rendering, and file operations.
- `piano-mistake-tracker.html`: layout and styles.

Run the tests with Node.js:

```sh
node --test piano-core.test.cjs piano-app.test.cjs
```

Tests use synthetic MIDI and performance data. Application tests use a small DOM/MIDI adapter; they do not replace testing in a real browser with a piano. Hardware timestamp behaviour, visual layout, and the practical tolerance defaults still need that trial.
