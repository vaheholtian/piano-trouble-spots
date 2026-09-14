# Phase 3: What You Actually Played - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-14
**Phase:** 3-what-you-actually-played
**Areas discussed:** Pass origin: which click is bar 1; Wrong vs missed+extra, repeated notes; Interrupted and abandoned passes; What you see on the score (Claude's picks at the user's request)

---

## Pass origin: which click is bar 1

**How do you come in for the next pass after B7+C8?**

| Option | Description | Selected |
|--------|-------------|----------|
| Next bar-1 click, from the start of the file | Origin is the first bar-1 click after the mark; the file's first note is expected there | ✓ |
| Some bar-1 click, maybe a bar or two later | Candidates are every later bar-1 click; pick the best pitch fit; equal fits are ambiguous | |
| Not always on a downbeat | Timing cannot be anchored reliably | |

**Late start: C a full beat late, D E F G in time relative to C**

| Option | Description | Selected |
|--------|-------------|----------|
| C is late by one beat, and so is everything after it | Origin stays on the click; the late-entry habit is visible | ✓ |
| C is late; the rest are measured from your C | Hides a systematic late entry on all but one note | |
| Timing unassessed for this pass, reason "late start" | Throws away information | |

**Missed first note: skip C, play D on beat 2, E F G in time**

| Option | Description | Selected |
|--------|-------------|----------|
| C missed; D E F G played and on time | Pitch alignment pins the origin; nothing shifts | ✓ |
| C missed; timing of the rest unassessed | More cautious than needed | |

**Notes:** User added: "Keep the expected start anchored to the bar-1 click even when the first note is missing. Judge each remaining note against its original score position."

**When is the start ambiguous / lateness cutoff?**

| Option | Description | Selected |
|--------|-------------|----------|
| Never by distance; only by pitch fit | Fixed anchor, no threshold; unassessed only when pitch alignment is uncertain | ✓ |
| Beyond half a bar late, unassessed | A threshold to tune | |
| Beyond one full bar late, unassessed | Wider threshold | |

**Notes:** User added: "Keep the next bar-1 click as the fixed origin, without a lateness cutoff. If I intentionally wait for a later downbeat, I should mark again before it. Never silently move the origin to make my playing appear on time."

---

## Wrong vs missed+extra, repeated notes

**Score C D E F G, played C D F F G**

| Option | Description | Selected |
|--------|-------------|----------|
| E is a wrong note (you played F) | One note in the slot at the right time is a substitution | ✓ |
| E missed and F extra | Double-counts one slip | |

**Far substitute: C D C5 F G**

| Option | Description | Selected |
|--------|-------------|----------|
| Still a wrong note, any pitch | No semitone threshold | ✓ |
| Wrong only within a few semitones; otherwise missed + extra | Adds a threshold that flips categories | |

**Repeated notes: score E E E, two Es played**

| Option | Description | Selected |
|--------|-------------|----------|
| Use timing to decide; if timing cannot tell, mark the group unassessed as ambiguous | Slots decide; equal cost means unassessed | ✓ |
| Always the last one by convention | Sometimes blames the wrong E | |
| Whole group unassessed whenever a repeat is short | Never guesses, loses information | |

**Chord C E G played C Eb G**

| Option | Description | Selected |
|--------|-------------|----------|
| E is wrong (you played Eb); C and G played | Per-notehead judgement; chord window tuned from fixtures | ✓ |
| Whole chord wrong | Hides which note is the problem | |

**Correction: C D F E F G**

| Option | Description | Selected |
|--------|-------------|----------|
| F is an extra note; E is played, just late | The played E is credited | ✓ |
| E is wrong (you played F); your correcting E is extra | Double-counts and hides the correct note | |

**Shifted start: D E F G A in time**

| Option | Description | Selected |
|--------|-------------|----------|
| Five wrong notes | Timing wins over pitch when displaced by a whole beat | ✓ |
| C missed, A extra, D E F G played early | Pitch wins; misdescribes a wrong starting key | |

**Should the app ever ignore a note the piano sends (soft brush, bounce)?**

| Option | Description | Selected |
|--------|-------------|----------|
| Never; every note-on is a played note | Consistent with Phase 2 "they would be mistakes" | ✓ |
| Ignore very soft notes below a velocity floor | Needs a floor tuned at the piano | |
| Ignore a quick re-strike of the same key | Hides real double-hits | |

---

## Interrupted and abandoned passes

**Abandoned: C D E, mark before the click reaches F**

| Option | Description | Selected |
|--------|-------------|----------|
| Unassessed, reason "pass ended before reaching them" | Time decides; a note whose click passed unplayed is a confident miss | ✓ |
| Missed, always | Inflates tail misses | |
| Unassessed after your last played note, always | Never counts a genuine trailing omission | |

**Restart without a mark: C D E, pause, C D E F G**

| Option | Description | Selected |
|--------|-------------|----------|
| Whole pass unassessed, reason "passage restarted without a mark" | Stored, listed, counted as unassessed for every note | ✓ |
| Assess the first run, treat the second as extras | Wall of extras | |
| Split it into two passes automatically | Out of scope for the milestone | |

**Messy pass: C D, a fumble of six or seven notes, G on its click**

| Option | Description | Selected |
|--------|-------------|----------|
| Per-note marks where the slot is clear; unassessed only where it is not | Pass still counts for C D G | ✓ |
| Whole pass unassessed when more than half the notes are mistakes | A passage you cannot play yet shows nothing | |

**Empty or near-empty passes**

| Option | Description | Selected |
|--------|-------------|----------|
| Zero notes: not an attempt, excluded from every count. One or more notes: an attempt, follow the abandoned rule | Denominators never include a double mark | ✓ |
| Every pass counts, zero-note passes as unassessed | Unassessed number becomes noise | |

---

## What you see on the score

The user asked Claude to pick the answers ("pick the answers for me"). Claude's picks, recorded as D-17 to D-21 in CONTEXT.md:

| Question | Claude's pick | Alternatives not taken |
|----------|---------------|------------------------|
| When does the score repaint? | After every pass mark and on load, in place through `svgMap`; default view is the session aggregate at the current BPM; a single pass is viewable by clicking it in the pass list | Paint only after Stop; last pass only; a separate results screen |
| Where does an extra note show? | A small red `+` glyph above the staff between the two score notes whose expected times bracket it, with a count in the aggregate view | Only in the detail panel; a count per bar; nothing on the score |
| What does clicking a marked note say? | A plain-language panel below the score with wrong and missed counts over assessed passes, the pitches played instead, and unassessed counts by reason | A hover tooltip; a table |
| Colours | Flat red (wrong), blue (missed), light grey (no assessed opportunities), black otherwise; larger count picks the colour, ties to wrong | Intensity scales and bar shading (Phase 5) |
| Are alignments stored? | Recomputed in memory from raw data on load and after each mark; `analysisVersion` constant from day one | Persisted cache keyed by `analysisVersion` (later phase) |
| Where do the rules live? | `docs/analysis-rules.md`, written before the alignment code, each rule paired with a fixture | Only in test names; only in planning files |

## Claude's Discretion

- Alignment algorithm (starting from ARCHITECTURE.md Pattern 2), all windows and weights as tunable data from fixture failures, grace margin at the mark, restart-detection heuristic.
- Module layout and names, exact colours, detail panel layout, how the restored-session view shares code with the live view.
- Whether Phase 4's timing offsets are computed now and simply not shown.

## Deferred Ideas

- Automatic splitting of a pass at a detected restart (out of scope for the milestone).
- Intensity by rate, bar shading, ranked per-bar list (Phase 5).
- Persisting alignment results keyed by `analysisVersion` (Phase 5 or 7).
- Count-in before each pass (v2, CAPT-06).
- Per-note timing offsets (Phase 4).
