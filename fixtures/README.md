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
