# Phase 1: Score on Screen - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-13
**Phase:** 1-Score on Screen
**Areas discussed:** Picking the passage, Score display, Opening the app and a piece, Score model edge cases

When selecting areas the user added: "keep in mind that what i care about in the first few milestones is guaranteeing the accuracy of the mistakes detection".

---

## Picking the passage

| Option | Description | Selected |
|--------|-------------|----------|
| Click bars on the notation | Click a bar to set the start, another to set the end; number fields mirror the choice | ✓ |
| Typed bar numbers only | Two number inputs like the prototype | |
| Typed numbers plus a 4 or 8 bar length | Exactly the prototype's control | |

**User's choice:** Click bars on the notation.

| Option | Description | Selected |
|--------|-------------|----------|
| Follow the printed numbers from MuseScore | Pickup is bar 0, first full bar is bar 1 | ✓ |
| Count every measure from 1 | Pickup becomes bar 1 | |

**User's choice:** Follow the printed numbers from MuseScore.

| Option | Description | Selected |
|--------|-------------|----------|
| Printed bars once, in printed order | Ignore repeat signs; warn on first/second endings | |
| Expand repeats into the played order | Repeated section twice with the correct ending | |

**User's choice:** Neither. "why are we even discussing this in the first milestone? this is inviting risks. we want to keep things simple, in the first few phases/milestone there wont be repeat signs or first/second endings."

| Option | Description | Selected |
|--------|-------------|----------|
| Nothing, until you click a bar | Forces an explicit choice | ✓ |
| The whole piece | Everything selected by default | |

**User's choice:** Nothing, until you click a bar.

**Notes:** At the "more questions or next area" gate the user stopped and said the phase was not as simple as they wanted and felt risky, and proposed a progression: right hand C D E F G, then left hand, then both hands, then chords, then four bars, and only then the whole piece with bar selection. Claude agreed, proposed treating that progression as a five-file verification ladder used across Phases 1 to 5, and moving bar selection out of Phase 1.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, reshape it | Phase 1 = load a tiny file, see notation, note model ready; update ROADMAP and REQUIREMENTS | ✓ |
| Keep bar selection in Phase 1 | Leave the roadmap as is | |

**User's choice:** "yeah reshape phase 1 and maybe review/adjust all the exisiting planning accordingly". ROADMAP.md, REQUIREMENTS.md, PROJECT.md, and STATE.md were updated: bar selection became Phase 6 (Real Pieces and Passages), history became Phase 7, the ladder was added, and the earlier passage-picking answers were written into Phase 6's success criteria.

---

## Score display

Not asked after the reshape; with one-line exercise files there is nothing to decide. Claude's pick: whole file shown, fitted to window width, OSMD defaults, no zoom.

---

## Opening the app and a piece

| Option | Description | Selected |
|--------|-------------|----------|
| Double-click a single HTML file | No server; notation library from a CDN | ✓ |
| Run a tiny local server first | One command per session | |

**User's choice:** Double-click a single HTML file.

| Option | Description | Selected |
|--------|-------------|----------|
| Claude writes rungs 1 to 4, you export rung 5 | Tiny files hand-written as MusicXML; four real bars from MuseScore | ✓ |
| You make all five in MuseScore | User controls the look; Phase 1 waits on it | |

**User's choice:** Claude writes rungs 1 to 4, user supplies rung 5.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, I'll name it | User names the piece and bars | ✓ |
| Not yet, decide later | Rungs 1 to 4 are enough for Phase 1 | |

**User's choice:** `C:\Users\vaheh\OneDrive\Documents\MuseScore4\Scores\Yanni - 4 measures.mscz`. Claude converted it with the MuseScore 4.6.5 command line and inspected it: 3/4, two staves, chords in the right hand, no ties, repeats, grace notes, or tuplets; bars 5 to 43 are empty and should be deleted in MuseScore.

---

## Score model edge cases

Not asked after the reshape. Claude's pick: no repeats, endings, pickup bars, grace notes, or tuplets in milestone 1 files; ties still resolved per SCORE-03 with a fixture test. Inspectable model is a collapsible note table under the notation.

---

## Claude's Discretion

- Score display: whole file, fit to width, no zoom.
- Inspect view: collapsible plain table, not a JSON dump.
- File open control: plain file button, no drag and drop.
- Repo layout, ladder file names, id string format, how the OSMD sheet is walked.

## Deferred Ideas

- Bar selection by clicking bars, mirrored number fields, nothing selected by default (Phase 6).
- Bar numbers follow MuseScore's printed numbers, pickup is 0 (Phase 6).
- Repeats and endings: not handled in milestone 1.
- Drag-and-drop opening; remembering the last-opened piece (Phase 2 with HIST-01).
