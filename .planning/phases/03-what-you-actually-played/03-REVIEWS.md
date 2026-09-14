---
phase: 3
reviewers: [codex]
reviewed_at: 2026-09-14T18:31:18Z
plans_reviewed: [03-01-PLAN.md, 03-02-PLAN.md, 03-03-PLAN.md, 03-04-PLAN.md, 03-05-PLAN.md, 03-06-PLAN.md]
models:
  codex: "gpt-6-astra (reasoning=medium)"
model_sources:
  codex: "banner"
---

# Cross-AI Plan Review — Phase 3

<!-- gsd:plan-revision-conflicts:begin -->
## Plan-Revision Conflicts
<!-- gsd:plan-revision-conflicts:end -->

## Codex Review

Reviewed all **6 plans** against the repository’s capture, segmentation, scheduler, storage, renderer, and test code. I also ran read-only probes against the installed OSMD parser and checked the proposed cost arithmetic. Findings below concern the planned implementation; no files were changed.

## 03-01

**Summary:** Writing the interpretation contract before implementing alignment is sound, but the proposed contract contains unresolved mathematical and counting contradictions. These should be settled before its shapes and expectations become dependencies.

**Strengths**

- Hand-derived fixtures have a credible existing reference: the rung-1 test independently specifies all five structural IDs, pitches, onsets, and durations. This supports testing intended musical outcomes independently of alignment output. [test/score-model.test.cjs:17](<C:/Code/Piano Mistakes/test/score-model.test.cjs:17>)
- The painting research checks out: the renderer maps individual chord notehead containers, and inspection of the installed OSMD bundle confirmed that its colouring implementation sets child fills. [src/score-renderer.js:83](<C:/Code/Piano Mistakes/src/score-renderer.js:83>)

**Concerns**

- **HIGH — The cost model does not preserve the general late-entry promise.** The inequalities are explicitly fitted to five slots. For 12 distinct quarter notes played one beat late, the intended matching costs **40.8**, while deleting the first score note, substituting 11 notes, and inserting the last performance note costs **40**. Thus the intended matching cannot win. Even rung 1 played three beats late costs **51**, versus **35** for deleting and inserting everything. Keeping the origin fixed does not prevent timing from destroying pitch correspondence. [03-01-PLAN.md:174](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-01-PLAN.md:174>), [03-CONTEXT.md:24](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-CONTEXT.md:24>)
- **HIGH — Extra-note denominators conflict with retained confident extras.** The messy fixture has four confident extras at `before:3`, but that gap is assessed only when preceding slot E is assessed—and E is ambiguous. A session containing that pass therefore has known extras with zero assessed gap opportunities. The no-origin case creates the same problem. The contract does not say whether these become misleading fractions or disappear from counts. [03-01-PLAN.md:165](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-01-PLAN.md:165>), [03-01-PLAN.md:176](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-01-PLAN.md:176>)
- **MEDIUM — A worked gap expectation contradicts the gap definition.** The crossover example places extra F exactly at E’s expected time, 2000 ms, but calls it `before:2`. Counting slots whose expected time is `≤ 2000` gives `before:3`. [03-01-PLAN.md:172](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-01-PLAN.md:172>), [03-01-PLAN.md:176](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-01-PLAN.md:176>)

**Suggestions**

- Test the cost policy against longer passages, larger delays, and multi-note slots before freezing it.
- Define gap assessability independently and require `passesWithExtra ≤ assessedPasses`, with explicit handling of unassessed gaps.
- Reconcile every numeric worked example before generating fixtures.

**Risk Assessment: HIGH.** Errors here would propagate into every engine, aggregate, and display test.

## 03-02

**Summary:** The end-to-end slice uses appropriate existing seams, but its live timeline and piece lifecycle need stronger contracts. Its current browser test would miss important runtime failures.

**Strengths**

- Reusing `PassSegmenter` preserves actual marker exclusion and event ordering: it sorts by `seq`, splits at marker records, and retains only non-marker note-ons in `notes`. [src/pass-segmenter.js:36](<C:/Code/Piano Mistakes/src/pass-segmenter.js:36>)
- Repainting after map reconstruction is necessary and correctly located: resize currently rerenders and replaces `S.svgMap`. [src/score-renderer.js:148](<C:/Code/Piano Mistakes/src/score-renderer.js:148>)

**Concerns**

- **HIGH — Live and replayed results can disagree because future clicks are missing.** The scheduler records only about 100 ms ahead. At the planned boundary—mark at 2750, G expected at 3000, grace 250 ms—G’s click is not yet recorded live, so `expectedTime` returns null and G is unassessed. Reanalysis after that click exists can turn it into a miss. The harness conceals this by waiting for ten clicks before injecting the earlier passes. [src/metronome.js:10](<C:/Code/Piano Mistakes/src/metronome.js:10>), [src/metronome.js:65](<C:/Code/Piano Mistakes/src/metronome.js:65>), [03-02-PLAN.md:172](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-02-PLAN.md:172>), [03-01-PLAN.md:257](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-01-PLAN.md:257>)
- **HIGH — Piece switching can analyze the old session against the new score.** `loadPiece()` replaces the model and renders before dispatching `piece-loaded`; that listener then ends the old session. The planned `endSession()` hook analyzes using `ScoreRenderer.state.model`, which already belongs to the new piece. The new render event also exposes old analysis to the new map before session loading completes. [src/score-renderer.js:45](<C:/Code/Piano Mistakes/src/score-renderer.js:45>), [src/capture-app.js:600](<C:/Code/Piano Mistakes/src/capture-app.js:600>), [03-02-PLAN.md:195](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-02-PLAN.md:195>)
- **MEDIUM — Stored deviations use the chord token’s first onset for every note.** This loses the individual timing of a rolled chord despite retaining `playedSeq`. MIDI capture already preserves each event’s timestamp, so Phase 4 should not inherit this artificial synchronization. [03-02-PLAN.md:185](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-02-PLAN.md:185>), [src/capture-app.js:395](<C:/Code/Piano Mistakes/src/capture-app.js:395>)

**Suggestions**

- Specify when a completed pass becomes final given the scheduler horizon; test immediate marking followed by later clicks and reload.
- Bind analysis to a piece ID and model snapshot, and reject stale asynchronous load results.
- Calculate per-note deviations from the matched event’s timestamp.

**Risk Assessment: HIGH.** These issues can change visible judgments despite unchanged playing.

## 03-03

**Summary:** Considering all optimal sequence assignments is a substantial improvement over arbitrary traceback. However, chord tokenization and internal chord assignment still permit false certainty and false misses.

**Strengths**

- Forward/backward optimal-path analysis examines alternative assignments globally instead of treating a locally tied backpointer as sufficient evidence. This directly supports the required regional ambiguity behavior. [03-03-PLAN.md:125](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-03-PLAN.md:125>)
- Both-hands fixtures match the existing model’s actual ordering and separate staff IDs at shared onsets. [test/score-model.test.cjs:88](<C:/Code/Piano Mistakes/test/score-model.test.cjs:88>)

**Concerns**

- **HIGH — Chord ambiguity is explicitly guessed.** The plan prohibits resolving genuine assignment ties by order, then instructs internal chord ties to prefer the lower score pitch. For expected C–E–G played C–F, F is equally close to E and G; selecting one changes which note is wrong and which is missed. The outer DP cannot detect this because `pairCost` has already discarded the alternative. [03-03-PLAN.md:54](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-03-PLAN.md:54>), [03-03-PLAN.md:125](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-03-PLAN.md:125>)
- **HIGH — A re-strike can fragment an otherwise complete chord.** Expected C–E–G, played C@1000, E@1010, C@1020, G@1030 becomes tokens `{C,E}` and `{C,G}` under the specified tokenizer. Since one score slot can pair with only one token, the engine cannot report all chord notes played plus one extra C. The existing proposed re-strike test uses a single-note score and misses this interaction. [03-01-PLAN.md:172](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-01-PLAN.md:172>), [03-03-PLAN.md:159](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-03-PLAN.md:159>)

**Suggestions**

- Carry alternative internal chord assignments into per-note ambiguity results.
- Add a chord-with-re-strike fixture and permit duplicate played events without forcing unrelated chord notes into separate alignment units.
- Test chord order permutations alongside these cases.

**Risk Assessment: HIGH.** Both defects undermine the phase’s central promise of trustworthy notehead attribution.

## 03-04

**Summary:** The restrained two-view interface is appropriate. The main gaps are geometric verification and keeping detail text synchronized with the displayed view.

**Strengths**

- Consolidating pass-list rendering addresses genuine duplication across live capture, stop, and restore paths. [src/capture-app.js:98](<C:/Code/Piano Mistakes/src/capture-app.js:98>), [src/capture-app.js:299](<C:/Code/Piano Mistakes/src/capture-app.js:299>), [src/capture-app.js:552](<C:/Code/Piano Mistakes/src/capture-app.js:552>)
- Recomputing glyph positions from current mapped elements correctly accommodates replacement of the SVG map during resize. [src/score-renderer.js:151](<C:/Code/Piano Mistakes/src/score-renderer.js:151>)

**Concerns**

- **MEDIUM — Midpoint placement fails across notation systems.** Averaging the right edge of the preceding slot and the left edge of the following slot assumes both occupy the same system. Across a line break, the glyph can appear over unrelated notation. DOM-relative coordinates solve coordinate conversion, but not this semantic placement problem. The harness checks glyph text and existence, not its geometry. [03-04-PLAN.md:148](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-04-PLAN.md:148>), [03-04-PLAN.md:152](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-04-PLAN.md:152>)
- **MEDIUM — Detail text can become stale.** View changes repaint the score, but the described handlers only replace detail text on a subsequent note or glyph click. A sentence from the 120 BPM group can remain beneath the 100 BPM score, or retain an old denominator after another pass. [03-04-PLAN.md:117](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-04-PLAN.md:117>), [03-04-PLAN.md:150](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-04-PLAN.md:150>)

**Suggestions**

- Define a system-break placement rule and test glyph bounding boxes on resized rung 5.
- Retain the selected detail target and regenerate its sentence on every relevant update, or explicitly clear the panel.

**Risk Assessment: MEDIUM.** The architecture is suitable, but mismatched text or glyph placement could mislead practice decisions.

## 03-05

**Summary:** The remaining edge cases are necessary, but the tempo-boundary rule and ladder test construction contain concrete defects.

**Strengths**

- The parser-backed ladder tests reuse the existing OSMD loading path rather than introducing another MusicXML parser. [test/osmd-node-env.cjs:85](<C:/Code/Piano Mistakes/test/osmd-node-env.cjs:85>)
- Restart precedence and explicit negative fixtures make the heuristic reviewable instead of leaving restart handling implicit. [03-05-PLAN.md:118](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-05-PLAN.md:118>)

**Concerns**

- **HIGH — A tempo change after a pass can invalidate that pass.** `tempoChangedBetween` includes the first click at or after the end timestamp. If the pass ends at 3400 and the next click at 3500 carries a new BPM, a constant-tempo completed pass becomes `tempo-changed`. The actual scheduler changes the BPM on the next unscheduled click, so this is reachable through the existing control. [03-05-PLAN.md:134](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-05-PLAN.md:134>), [src/metronome.js:77](<C:/Code/Piano Mistakes/src/metronome.js:77>)
- **HIGH — The rung-4 omission test expects the wrong result with the proposed helper.** `passFor` ends 400 ms after the last played note. Removing rung 4’s second chord leaves the final played note around 1015 ms, so end-plus-grace is about 1665 ms; the omitted chord is expected at 2000 ms and must be `not-reached`, not missed. The parser probe confirmed this separation. [03-05-PLAN.md:169](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-05-PLAN.md:169>), [test/score-model.test.cjs:101](<C:/Code/Piano Mistakes/test/score-model.test.cjs:101>)
- **MEDIUM — The performance generator shares the implementation being tested.** Generating timestamps through `Align.buildSlots` and `Align.expectedTime`, then checking alignment against those timestamps, allows shared timing errors to pass. An assertion that an eighth note lies somewhere between clicks does not establish its correct position. [03-05-PLAN.md:169](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-05-PLAN.md:169>)

**Suggestions**

- Define tempo membership using explicit pass boundaries and distinguish interpolation support from evidence of a tempo change.
- Keep the omission test’s end mark fixed beyond the omitted chord.
- Independently specify representative rung-5 timestamps and note IDs.

**Risk Assessment: HIGH.** The present tests could both reject correct behavior and accept incorrect behavior.

## 03-06

**Summary:** Human verification is correctly mandatory, but its sequencing and instructions currently cannot establish the required phase acceptance.

**Strengths**

- Recording actual piano observations and stopping on false marks follows the existing verification approach, which already treats notation mismatches as defects. [fixtures/README.md:7](<C:/Code/Piano Mistakes/fixtures/README.md:7>), [03-06-PLAN.md:147](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-06-PLAN.md:147>)

**Concerns**

- **HIGH — The first piano experiment happens after harder-rung implementation.** This gate depends on both 03-04 and 03-05, after both-hands, chord, and full-ladder work. The roadmap explicitly requires trying rung-1 feedback before expanding to those capabilities. [03-06-PLAN.md:6](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-06-PLAN.md:6>), [.planning/ROADMAP.md:17](<C:/Code/Piano Mistakes/.planning/ROADMAP.md:17>)
- **HIGH — Scenario B does not deliver 10+ passes at one tempo.** It instructs eight passes at 80 BPM and four at 100 BPM. Neither comparison group meets the success criterion, and the repeated mistake and slip need not even occur in the same group. [03-06-PLAN.md:143](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-06-PLAN.md:143>), [.planning/ROADMAP.md:123](<C:/Code/Piano Mistakes/.planning/ROADMAP.md:123>)
- **MEDIUM — Several expected observations contradict the rules.** “Mark before F’s click” does not ensure F is unassessed under a half-beat grace. On rung 4, one wrong E followed by one missed E produces a tied aggregate, which stays red under the specified tie rule—not blue. The checklist must explicitly select the single-pass view for that observation. [03-06-PLAN.md:136](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-06-PLAN.md:136>), [03-06-PLAN.md:160](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-06-PLAN.md:160>), [03-01-PLAN.md:176](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-01-PLAN.md:176>)

**Suggestions**

- Move the rung-1 piano gate ahead of harder-rung implementation dependencies.
- Run all 12 experimental passes at one tempo; test tempo switching separately afterward.
- Specify the selected view and precise marking window for every expected observation.

**Risk Assessment: HIGH.** The current procedure could approve unmet requirements or report correct behavior as defective.

**Overall assessment:** Revise before execution. The module boundaries and source reuse are strong; the blocking risks are interpretation consistency, live/replay stability, chord attribution, and the delayed product experiment. Address those before expanding the fixture suite around the current contract.

Next options: revise the plans, save this review, re-review a focused area, or discuss a finding.

---

## Consensus Summary

Single reviewer (Codex, source-grounded with `file:line` citations), so there is no cross-reviewer consensus. The findings below are ranked by what they would do to the pianist's trust in the marks. Overall verdict: **revise before execution**.

### Agreed Strengths
(Only one reviewer.) Codex found the module boundaries and source reuse strong: `PassSegmenter` reuse, repainting after the SVG map rebuilds, parser-backed ladder tests through the existing OSMD path, and a mandatory at-the-piano gate.

### Agreed Concerns
(Only one reviewer; HIGH-severity items, highest priority.)
1. **The cost model can't handle a late start on longer passages (03-01).** With 12 notes played a beat late, deleting and reinserting notes costs less than the intended matching, so pitch correspondence is lost. Rung 1 played three beats late fails the same way.
2. **Extra-note denominators are inconsistent (03-01).** Confident extras can land in gaps that were never assessed, which produces passes-with-extra > assessed passes.
3. **Live results can disagree with a replay (03-02).** Clicks are only recorded ~100 ms ahead, so a note expected after the marker is unassessed live but can become a miss on reanalysis.
4. **Switching pieces analyses the old session against the new score (03-02).** `loadPiece()` swaps the model before `piece-loaded` ends the old session.
5. **Chord handling is unreliable (03-03).** Internal chord ties are resolved by lower pitch, which is a guess. A re-strike inside a chord splits it into two tokens and causes false misses.
6. **A tempo change right after a pass marks it tempo-changed (03-05).** The rung-4 omission test also expects "missed" where the helper produces "not-reached".
7. **The piano test is scheduled too late and can't meet the success criterion (03-06).** Its first run comes after the harder rungs, against the roadmap's rung-1-first order. Scenario B's 8+4 passes split across tempos never reach 10+ passes at one tempo.

MEDIUM items: a worked gap example contradicts the gap rule (03-01); per-note deviations use the chord token's first onset (03-02); glyph midpoint placement breaks across system breaks, and detail text goes stale (03-04); the performance generator reuses the code under test (03-05); some checklist expectations contradict the rules (03-06).

### Divergent Views
None (single reviewer).
