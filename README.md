# Trouble spots

A local MIDI piano practice tool focused on timing and physical key-hold lengths in a selected section.

Hosted at <https://vaheholtian.github.io/piano-trouble-spots/>, or open `piano-mistake-tracker.html` locally. Keep `piano-core.js` and `piano-app.js` in the same folder. No installation, server, or build is required.

Direct recording needs the browser to expose the Web MIDI API and grant MIDI access. Browsers without that API, including Safari on iPhone and iPad, can record through the relay below.

## Phone or tablet without Web MIDI

`relay/server.js` runs on a computer that is connected to the piano. It serves this page on the local network and forwards the computer's MIDI inputs to the page over a WebSocket, with the timestamps the MIDI driver reported. The phone only shows the page; timing is measured on the computer.

1. Connect the piano to the computer (USB, or Bluetooth MIDI through a bridge; see below).
2. With Node.js 18 or later installed, in `relay/`, run `npm ci` once, then `npm start`. Allow Node.js through the Windows firewall for private networks when asked. Use `npm start -- 9000` to change the port from 8765.
3. On the phone, open the address the relay prints, for example `http://10.0.0.175:8765/`, and click **Connect piano**. Inputs are listed with "via relay" after their names.

The relay is plain HTTP, so use it only on a network you trust. WebSocket connections must have the exact origin of the relay page; unrelated websites and missing or `null` origins are rejected. HTTP and WebSocket requests also require a local interface address, `localhost`, or the computer's hostname with the correct port, preventing an attacker-controlled hostname from bypassing the origin check through DNS rebinding. Use a printed address; arbitrary DNS aliases and reverse proxies are not supported.

These checks protect against other websites opening the relay in your browser. They are not login authentication: a person or program on the local network can connect directly. Do not forward the port to the Internet. The GitHub Pages copy cannot connect to the local relay; open the address printed by the relay instead.

After a successful connection, the page reconnects on its own when the connection drops. Heartbeats detect silent connection failures within about 15 seconds while the page is running; a suspended phone detects them when it resumes. A take in progress is reviewed with unfinished releases unassessed, like a USB disconnect. Failed initial connections stop retrying; check the relay and click **Connect piano** again.

### Bluetooth MIDI on Windows

Windows MIDI Services (Windows 11 24H2 and later) has no Bluetooth MIDI transport yet. A bridge such as [Perfect Bluetooth MIDI for Windows](https://github.com/mayerwin/Perfect-Bluetooth-MIDI-For-Windows) connects the piano over Bluetooth LE and exposes it as a normal MIDI port that the relay opens like any other. Bluetooth LE MIDI adds roughly 10 ms of latency and some jitter of its own; a USB cable is the more precise reference when the tolerances are tight.

## Practice

1. Load a reference `.mid` or `.midi` file.
2. Choose a starting measure and a 4- or 8-measure section. Sections near the end stop at the last measure containing a note onset. If needed, choose one reference track for a single part.
3. Click **Hear this section** to play the reference through the device's speakers at its own tempo, so you know what you are aiming for. Click again to stop it.
4. Connect your piano and choose its MIDI input.
5. Click **Ready to record**, then play the section from its first note or chord at the reference MIDI's tempo.
6. Release the final keys, then click **Stop & review**. Recording does not stop during rests or long holds.
7. Review individual notes and recurring issues. Save the session before closing.

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

Playback is a synthesised tone, one voice per reference note, not a piano recording or a performance to imitate: it plays the selected part at the written timing with no count-in, dynamics, or pedal. It is the same note list the take is graded against, so it is a check on the section and part you chose. Playback stops when you arm a take, change the section, or load another reference. On iPhone and iPad the silent switch mutes it.

Lengths measure physical key holds, not pedal resonance. An unfinished release stays unknown. The reference MIDI's articulation is the target, which may differ from printed note values or an intended musical interpretation. MIDI does not identify your fingers, and this version does not assess velocity, finger strength, or pedal technique.

Supported reference files use MIDI format 0 or 1 with beat-based timing. Drum-channel notes are excluded. Files missing pitched-note releases are rejected because their durations are unknown. Measure numbering follows MIDI time signatures; there is no separate pickup-measure numbering control.

Session format 2 stores the reference, settings, and raw performed notes. Feedback is recalculated on import after validation. Sessions from the previous pitch-tracker prototype are rejected without changing current practice; keep those files if their history matters. Loading a new reference starts a new session.

Reference MIDI files can be up to 16 MB and session files up to 64 MB. A session holds at most 2,000 takes and 200,000 performed notes, with 20,000 notes per take. Recording stops accepting new notes at those limits; save the session before clearing takes to continue. Releases already received are preserved. Recorded timestamps must be nonnegative and advance on one device clock; a clock reset ends the take with remaining releases unassessed.

## Development

- `piano-core.js`: MIDI parsing, fixed-section timing analysis, aggregation, and session validation; no DOM access.
- `piano-app.js`: controls, recording state, MIDI devices, reference playback, rendering, and file operations.
- `piano-mistake-tracker.html`: layout and styles.
- `relay/server.js`: optional local server that forwards MIDI to browsers without Web MIDI.

Run the tests with Node.js:

```sh
node --test piano-core.test.cjs piano-app.test.cjs
```

After installing the relay dependencies, run all checks with:

```sh
node --test piano-core.test.cjs piano-app.test.cjs relay/server.test.cjs
```

Tests use synthetic MIDI and performance data. Application tests use a small DOM/MIDI adapter, and a stubbed audio context for reference playback. Relay tests open actual HTTP/WebSocket connections on an ephemeral loopback port, including rejected origins, forged hosts, MIDI forwarding, and driver failure recovery. They do not replace testing in a real browser with a piano. Hardware timestamp behaviour, visual layout, and the practical tolerance defaults still need that trial.
