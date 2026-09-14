# Verification Ladder — What Each Rung Should Look Like

This is the manifest for the at-the-piano check (Phase 1). Open `index.html` in
Chrome, load each file below in order, and compare what you see — on the
notation, in the status line, and in the note table — against this page.

A mismatch (wrong notes, a wrong status line, a `MISSING` row, `map FAIL`, or a
repeated fingerprint) is a defect to report. It is never something to explain
away or wave through.

## Rung 1 — `fixtures/01-right-hand.musicxml`

- Time signature: 5/4, one bar.
- Treble staff: C4 D4 E4 F4 G4, quarter notes.
- Bass staff: a whole-bar rest.
- Expected status line:
  `01-right-hand.musicxml: 1 bars, 5 notes, 5/5 noteheads mapped, map OK`

## Rung 2 — `fixtures/02-left-hand.xml`

- Time signature: 5/4, one bar.
- Treble staff: a whole-bar rest.
- Bass staff: C3 D3 E3 F3 G3, quarter notes.
- The `.xml` extension is on purpose — it is one of the three file extensions
  the app promises to open (`.musicxml`, `.xml`, `.mxl`), and this rung is the
  `.xml` case.
- Expected status line:
  `02-left-hand.xml: 1 bars, 5 notes, 5/5 noteheads mapped, map OK`

## Rung 3 — `fixtures/03-both-hands.musicxml`

- Time signature: 5/4, one bar.
- Treble staff: C4 D4 E4 F4 G4, quarter notes.
- Bass staff: C3 D3 E3 F3 G3, quarter notes, at the same five beats as the
  treble staff.
- Expected status line:
  `03-both-hands.musicxml: 1 bars, 10 notes, 10/10 noteheads mapped, map OK`

## Rung 4 — `fixtures/04-chords.musicxml`

- Time signature: 4/4, one bar.
- Treble staff: C4+E4+G4 half-note chord, then F4+A4+C5 half-note chord.
- Bass staff: C3 half note, then F3 half note.
- Expected status line:
  `04-chords.musicxml: 1 bars, 8 notes, 8/8 noteheads mapped, map OK`

## Rung 5 — `fixtures/05-yanni-4-measures.musicxml` (also `.mxl`)

- Time signature: 3/4, four bars. This is the user's own four real bars from
  "Yanni - Reflections of Passion", not a hand-made exercise.
- Bar 1 right hand: B4+D5+B5 dotted half (the whole bar, one chord).
  Left hand: G2 D3 G3 B3 G3 D3, six eighths.
- Bar 2 right hand: F#5+D6 quarter, E5+C#6 dotted quarter, D5+B5 eighth.
  Left hand: G2 D3 G3 A3 eighths, B3 quarter.
- Bar 3 right hand: E5+C#6 quarter, G5+E6 dotted quarter, F#5+D6 eighth.
  Left hand: A2 E3 eighths, A3 quarter, C#4+E4 eighth, B3+D4 eighth.
- Bar 4 right hand: E5+C#6 dotted half (the whole bar, one chord).
  Left hand: C#4 B3 A3 B3 C#4 A3, six eighths.
- Expected status line (same for both the `.musicxml` and the `.mxl` file,
  only the file name changes):
  `05-yanni-4-measures.musicxml: 4 bars, 41 notes, 41/41 noteheads mapped, map OK`
  `05-yanni-4-measures.mxl: 4 bars, 41 notes, 41/41 noteheads mapped, map OK`

### Rebuilding rung 5

Rung 5 is produced from the user's MuseScore file by `node scripts/build-rung5.cjs`
(source: `Yanni - 4 measures.mscz`). As of this writing the source file already
has exactly 4 measures, so the script's trailing-empty-measure trim step is not
needed and prints "No trailing empty measures; source already trimmed." If bars
are ever added back to the source and left untrimmed, the script's fallback
trims them automatically and says so.

## Reading the Notehead column

Every row in the note table has a fingerprint like `auto482#1` in the Notehead
column. The part before the `#` names the rendered note group (one group per
written note position on the page); the number after the `#` is the note's
position inside a chord, counted from the lowest pitch upward, starting at 0.

So a single note (no chord) always ends in `#0`. The three notes of one of
rung 4's chords must show the same group name with `#0`, `#1`, `#2` — lowest
pitch is `#0`, highest is `#2`. No two rows anywhere on the page, in any rung,
may show the exact same fingerprint.

A `map FAIL` in the status line, a `MISSING` row, or two rows sharing one
fingerprint is a defect — report it, do not explain it away.

## How to check at the piano

1. Double-click `index.html`.
2. For each rung, in order:
   - Click "Open MusicXML" and choose the file.
   - Compare the notation, the status line, and the fingerprints against this
     page.
   - Drag the window to about half width, then back to wide. The notation
     should reflow, and the status line should read exactly the same as
     before (same N/N, still `map OK`). Do this on every rung, not just the
     last one.
3. Open the two `.mxl` files (`fixtures/05-yanni-4-measures.mxl`, and the
   user's own real MuseScore export).
4. Open a file that is not MusicXML and confirm the app recovers: a red toast
   appears, the notation and table clear, the status reads "No piece loaded",
   and opening rung 1 again works normally afterward.

## Phase 2 - click and capture at the piano

Keep this section open at the piano. It covers granting MIDI, picking the
FP-60X, the metronome and clock readout, marking passes, and the two
checkpoint scenarios with the numbers you should see.

### First run - granting MIDI

The first time you open `index.html`, Chrome shows an Allow/Block prompt for
MIDI on the page. Click Allow. If the MIDI state line ever says permission
denied, click the site info icon in the address bar, allow MIDI for the page,
and reload.

### Finding the FP-60X

The FP-60X should appear in the MIDI input list with the state
`Connected: <name>`. If the list is empty:

- Check the USB cable is plugged in at both ends and the piano is powered on.
- Close any other program or browser tab that might already be using MIDI
  (a DAW, another instance of this app, a MIDI monitor utility) - Windows
  MIDI drivers can grant exclusive access to a single client, and closing
  other MIDI apps is often what makes the piano reappear.
- Reload the page after closing the other program.

### BPM, Start/Stop, and the live indicator

The BPM field accepts 20-300. Press Start to hear a steady Web Audio click
with beat 1 accented (a higher pitch); press Stop to end the session. While
recording, the live indicator shows the note count for the current pass, the
last note played and its velocity, and a brief green flash on every note-on.
None of this is graded - it only confirms notes are arriving.

### Marking passes

Between passes, press B7 and C8 together - the two highest keys on the
keyboard - or press the spacebar on the laptop. Either one ends the current
pass and starts the next; the pass list shows `Pass N - K notes` live, with
the pass in progress marked "(in progress)". The sustain pedal never marks
anything, even if you hold it through a mark.

### Reading the Clock readout

Expand "Clock readout". Positive means late. Play single notes exactly on
the click and expect the median to settle near 0 ms. A steady non-zero
value - for example a median that stays around +40 ms no matter what you
play - is a clock or latency finding to write down for a later phase, not a
playing habit to explain away.

### Scenario A - the click and the clock

1. Open `fixtures/01-right-hand.musicxml`, set BPM to 80, press Start.
2. Play C4 exactly on the click, 8 times. Read the median from the Clock
   readout and write it down (expect it within about ±25 ms of 0), along
   with the AudioContext base and output latency numbers shown underneath.
3. Change BPM to 120 while the session runs; the click should speed up
   without stopping or changing the session. Play 8 more notes on the click;
   the median should stay close to what you wrote down.
4. Switch to another window and leave the tab in the background for three minutes
   with the click still running. Come back and confirm the click is
   still steady, then play 8 more notes on the click - the median should not
   have moved by more than about 10 ms.
5. Press Stop, fully quit Chrome, and reopen `index.html`. Note whether
   Chrome asks for MIDI permission again (either answer is fine - just write
   it down) and confirm the FP-60X reconnects.

### Scenario B - a real 10+ pass drill

1. Open `fixtures/01-right-hand.musicxml`, set BPM to 80, press Start.
2. Play the bar cleanly, then press B7 and C8 together. A clean pass reads
   `Pass 1 - 5 notes`; a pass with one wrong note still reads 5 notes (a
   wrong note is still a note - the counts are honest, not graded); a pass
   with one extra note reads 6.
3. Repeat for at least 10 passes, marking most with B7+C8 and at least one
   with the spacebar instead. Hold the sustain pedal through one full pass -
   it must not split the pass.
4. Press Stop and confirm every pass you played is listed, in order, with
   the counts you expect, and no trailing empty pass after the last mark.
5. Close the tab **without pressing Stop** at least once during your
   drilling, then reopen `index.html`. The interrupted session should be
   listed as reopened with all of its passes intact and the click silent.
6. Reopen the tab normally (after Stop) and confirm the piece and every pass
   from step 4 are restored exactly.
