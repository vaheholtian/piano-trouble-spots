# Phase 1: Score on Screen - Context

**Gathered:** 2026-09-13
**Status:** Ready for planning

<domain>
## Phase Boundary

The user opens a tiny MusicXML exercise (`.musicxml`, `.xml`, or compressed `.mxl`) in Chrome and sees it rendered as real notation. The whole loaded file is the passage; there is no bar selection, no hand or staff filter, no MIDI, no metronome, no analysis. Every note in the file is carried in the app's own plain-data score model with a stable id plus measure, staff, voice, onset in beats, duration, pitch, and resolved ties, and that model is inspectable in the app so the user can check it against the sheet. The five-file verification ladder exists in the repo and renders correctly.

Requirements: SCORE-01, SCORE-03. SCORE-02 (bar selection) moved to Phase 6 during this discussion; the roadmap, requirements, project, and state files were updated to match.

**The user's stated priority for the first milestones is guaranteeing the accuracy of mistake detection.** Everything in this phase exists to make the later alignment trustworthy on scores so small every note can be verified by eye and ear. Anything that does not serve that is out.

</domain>

<decisions>
## Implementation Decisions

### Scope reshape (decided by the user during this discussion)
- **D-01:** The passage is always the entire loaded file through Phase 5. No start/end bar, no highlighting, no bar picker in this phase. — **Reversibility:** reversible — bar selection arrives in Phase 6 as a filter over the same score model; the model must already carry measure numbers so that filter is a slice, not a remodel.
- **D-02:** Milestone 1 files contain no repeat signs, first/second endings, pickup bars, grace notes, or tuplets. The app does nothing special for them and no time is spent handling them. If a loaded file contains them, the app may render whatever OSMD renders; correctness of the model for those constructs is not a Phase 1 requirement.
- **D-03:** Ties are resolved per SCORE-03 (a tied continuation is not a separate onset), even though ladder rungs 1 to 4 have none. Rung 5 (Yanni) has none either; a fixture test with a tie is still required so the rule is exercised.

### Verification ladder (the test scores used at the piano for Phases 1 to 5)
- **D-04:** Five MusicXML files are kept in the repo and used for every phase through Phase 5:
  1. Right hand only: C D E F G, one bar
  2. Left hand only: the same notes
  3. Both hands together
  4. A chord or two
  5. Four real bars: the user's "Yanni - 4 measures" (see specifics)
- **D-05:** Claude writes rungs 1 to 4 directly as MusicXML (uncompressed `.musicxml`, hand-authored, minimal, grand staff with two staves so the staff field is exercised from rung 2 onward). The user supplies rung 5 from MuseScore. — **Reversibility:** reversible.
- **D-06:** Rung 5 is produced from the user's MuseScore file with the MuseScore 4 command line, not by hand export, so it is reproducible:
  `"C:\Program Files\MuseScore 4\bin\MuseScore4.exe" -o <out>.musicxml "C:\Users\vaheh\OneDrive\Documents\MuseScore4\Scores\Yanni - 4 measures.mscz"`
  MuseScore 4.6.5 is installed. The source file currently has 43 measures of which only 1 to 4 contain notes. Preferred: the user deletes bars 5 to 43 in MuseScore and saves. Fallback if that has not happened when the plan runs: strip trailing empty measures from the exported MusicXML in the build step, and say so in the SUMMARY.
- **D-07:** The ladder files are also the fixtures for the score-model tests (node:test, no DOM). Every rung gets a test asserting the exact expected note list (measure, staff, voice, onset, duration, pitch).

### Score model
- **D-08:** The score model is the app's own plain JSON-serialisable data, extracted once from OSMD's parsed sheet after load. OSMD internals never leak into the model, analysis, or persistence (research ARCHITECTURE.md anti-pattern 4, CLAUDE.md "What NOT to Use"). — **Reversibility:** one-way — analysis fixtures, IndexedDB records, and exports from Phase 2 onward serialise this shape; changing it later means a data migration and an analysisVersion bump.
- **D-09:** Note ids are derived structurally (for example measure number, staff, voice, onset in the measure, pitch, and chord position), never from array index or anything the renderer computes, so the same file parsed twice yields identical ids. The id scheme is part of the persisted contract. — **Reversibility:** one-way — same reason as D-08.
- **D-10:** Onset and duration are in beats (quarter-note units as a rational or decimal that survives dotted and eighth values exactly), measure numbers follow the MusicXML `number` attribute, staff is 1 or 2 as in the file, voice as in the file. The model carries enough that hand/staff filtering and bar selection are later slices, not remodels.
- **D-11:** The renderer owns a `noteId → SVG element` map built from OSMD's graphical notes after each render, so later phases can paint noteheads without re-rendering. Phase 1 only has to prove the map is complete (every model note maps to a rendered notehead) for all five ladder files; no painting yet.

### Inspectable model (Claude's pick after the reshape)
- **D-12:** A collapsible table under the notation lists every note: bar, staff, voice, beat onset, duration, pitch name and MIDI number, tie status. This is the user's tool for checking the model against the sheet at the piano, so it must be plain and readable, not a JSON dump. A "copy as JSON" affordance is optional; a console-only dump is not acceptable.

### Opening the app and a piece
- **D-13:** The app is a single HTML file the user double-clicks. No local server, no build step. OpenSheetMusicDisplay 2.1.2 loads from a CDN (jsDelivr `+esm` or the UMD build), so the laptop needs internet the first time and Chrome caches afterwards. Module scripts that import local files are not allowed, because Chrome blocks cross-file ES module imports from `file://`; code that must be shared with node:test lives in plain `.js` files that are loaded in a way that works from `file://` (the planner chooses the mechanism, for example classic scripts or inlining at a copy step; the constraint is: double-click works). — **Reversibility:** costly — moving to a server later is easy, but the decision shapes how source files are split now.
- **D-14:** A piece is opened with a plain file button (`<input type="file">`). Drag and drop is not required in this phase.
- **D-15:** Remembering the last-opened piece across reloads is not in this phase; durable storage lands in Phase 2 (HIST-01).

### Score display (Claude's pick after the reshape)
- **D-16:** The whole file is shown, fitted to the window width, OSMD defaults otherwise. No zoom control, no page layout choices, no title editing. A window resize re-renders and the inspect table and id map stay correct after it (PITFALLS.md pitfall 13: annotations lost on re-render, prove the map survives a resize now, before anything depends on it).

### Claude's Discretion
- File layout of the repo, naming of the ladder files, exact id string format, test file organisation.
- How the OSMD sheet is walked to produce the model, as long as D-08 to D-11 hold.
- Visual styling, within "plain and readable".

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning (updated in this discussion)
- `.planning/ROADMAP.md` — Phase 1 goal and success criteria as reshaped; the verification ladder; Phase 6 now holds bar selection
- `.planning/REQUIREMENTS.md` — SCORE-01 and SCORE-03 are this phase; SCORE-02 is Phase 6; ladder note under Verification
- `.planning/PROJECT.md` — constraints (browser-only, no build step, MusicXML only) and the Key Decisions table, including "Tiny test-score ladder before real pieces"

### Stack and architecture
- `.claude/CLAUDE.md` — Technology stack: OSMD 2.1.2, no bundler, `node:test`, "What NOT to Use" (no second MusicXML parser, no build step to run)
- `.planning/research/ARCHITECTURE.md` — Score Model component, stable `noteId` pattern, `noteId → SVGGElement` map, anti-pattern 4 (do not use OSMD objects as the model)
- `.planning/research/STACK.md` — OSMD API surface for cursor iteration and per-note SVG access; verify against the installed 2.1.2 typings before coding
- `.planning/research/PITFALLS.md` — pitfall 9 (MusicXML structure: ties, divisions, `.mxl` unzip), pitfall 13 (annotations lost on re-render)

### User-supplied material
- `C:\Users\vaheh\OneDrive\Documents\MuseScore4\Scores\Yanni - 4 measures.mscz` — source for ladder rung 5 (outside the repo; convert with the MuseScore 4 CLI per D-06). Inspected 2026-09-13: 3/4, key C, one part with two staves, bars 1 to 4 have notes (right hand two-note chords, left hand single notes with two chords), bars 5 to 43 empty, no ties, repeats, grace notes, or tuplets.
- `prototype/` (tag `v0-prototype`) — reference only, not a base. Its `piano-core.js` shows the pure-core, no-DOM test style to keep; its UI is not reused.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None in the new build; the repo has no app code yet. `prototype/piano-core.js` and its `node --test` setup are a pattern reference for pure, DOM-free modules with fixture tests.

### Established Patterns
- Prototype split: pure core file with no DOM access, app file for controls and rendering, one HTML file for layout. Keep that split.
- Prototype opened as a single HTML file with sibling `.js` files; the new app must also work by double-click (D-13).

### Integration Points
- Phase 2 will add MIDI capture and storage next to the score model; the model and the `noteId → SVG` map are the two surfaces it and Phases 3 to 5 depend on.

</code_context>

<specifics>
## Specific Ideas

- The user's words: "what i care about in the first few milestones is guaranteeing the accuracy of the mistakes detection" and "first we load maybe a CDEFG only right hand, perfect that, then add the left hand, perfect both together, then maybe try chords in a different phase. then expand that to maybe 4 measures, perfect that, and only then we can talk about the whole piece and selecting measures".
- Rung 5 content, for writing its fixture test (pitch/staff, `+` means chord continuation):
  - m1: B4 +D5 +B5 (s1); G2 D3 G3 B3 G3 D3 (s2)
  - m2: F#5 +D6, E5 +C#6, D5 +B5 (s1); G2 D3 G3 A3 B3 (s2)
  - m3: E5 +C#6, G5 +E6, F#5 +D6 (s1); A2 E3 A3 C#4 +E4 B3 +D4 (s2)
  - m4: E5 +C#6 (s1); C#4 B3 A3 B3 C#4 A3 (s2)
  - Note types present: eighth, quarter, half. Divisions 2. Voices 1 (staff 1) and 5 (staff 2) as MuseScore exports them.

</specifics>

<deferred>
## Deferred Ideas

Decided during this discussion but parked for Phase 6 (Real Pieces and Passages), already written into its success criteria:
- Bar selection by clicking a start bar then an end bar on the notation, with two number fields mirroring the choice.
- Nothing selected after load until the user clicks.
- Bar numbers follow MuseScore's printed numbers (a pickup bar is 0).
- Repeat signs and endings are not expanded in milestone 1; the user's pieces will not contain them.

Other:
- Drag-and-drop file opening (trivial, any later phase).
- Remembering the last-opened piece (Phase 2 with HIST-01).

</deferred>

---

*Phase: 01-score-on-screen*
*Context gathered: 2026-09-13*
