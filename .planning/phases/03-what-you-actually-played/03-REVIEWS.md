---
phase: 3
reviewers: [codex]
reviewed_at: 2026-09-14T21:09:06Z
plans_reviewed: [03-01-PLAN.md, 03-02-PLAN.md, 03-03-PLAN.md, 03-04-PLAN.md, 03-05-PLAN.md, 03-06-PLAN.md, 03-07-PLAN.md, 03-08-PLAN.md, 03-09-PLAN.md]
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

I read the repository source and all nine plans. The existing `npm test` run completed with **78 passed, 0 failed**. Phase 3’s proposed modules and tests are not implemented yet; the findings below distinguish source-backed integration risks from defects in the proposed specifications.

Plan-file links point to `.planning/phases/03-what-you-actually-played/`.

## 03-01

**Summary:** Documenting the interpretation rules before implementation is appropriate, but one worked example contradicts the prescribed tokenization, and the fixture validator does not ensure complete expectations.

**Strengths**

- The fixtures build on an independently asserted score model: `test/score-model.test.cjs:17` explicitly lists all five notes and their rational onsets.
- The repaint harness targets a real integration boundary. `src/score-renderer.js:148` renders and rebuilds the map, so testing marks after resize and file reopening is necessary.

**Concerns**

- **HIGH — The 2600 ms correction example is internally inconsistent.** [03-01-PLAN.md:179](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-01-PLAN.md:179>) expects the late E to become a separate extra. However, cloning the original sequence and changing E’s timestamp leaves E@2600 before F@2500 in sequence order. The prescribed tokenizer merges F into E’s token because `2500 − 2600 <= 50`. A small executable probe reproduced this grouping. The specified substitution path then costs **7360**, not **6680**. Sequence ordering is intentional in existing code: `src/pass-segmenter.js:37`.
- **MEDIUM — Fixture validation permits missing note expectations.** [03-01-PLAN.md:252](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-01-PLAN.md:252>) checks that expected keys are valid model IDs, but does not require every model ID to appear. The downstream comparison similarly iterates supplied expectations, allowing an accidentally omitted verdict to escape verification.

**Suggestions**

- Give the crossover case its own chronological event sequence and renumber `seq`; separately specify and test decreasing timestamps without changing raw records.
- Require exact expected-note key coverage for attempts, and an empty key set for non-attempts.

**Risk Assessment: HIGH.** An inconsistent contract can force implementation changes that satisfy the example while violating the intended ordering policy.

## 03-02

**Summary:** The session/model binding and finalization work address real source behavior. The remaining weakness is lifecycle handling around asynchronous restoration and failed file loads.

**Strengths**

- The model-identity guard addresses an actual ordering hazard: `src/score-renderer.js:45` replaces the model and renders before dispatching `piece-loaded` at line 49.
- In-memory derived results fit the existing persistence architecture: `src/storage.js:147` and `src/storage.js:164` independently retrieve raw events and clicks for replay.

**Concerns**

- **HIGH — Starting a session does not invalidate an outstanding history load.** The generation checks in [03-02-PLAN.md:260](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-02-PLAN.md:260>) cover piece events and history loads, but the proposed Start hook does not advance the generation. A delayed `loadLatestSession` can therefore overwrite the newly created live `A.session` with an older restored session. Existing Start already crosses several asynchronous boundaries (`src/capture-app.js:461`, `:467`, `:482`).
- **HIGH — Failed piece loading is missing from the lifecycle contract.** `src/score-renderer.js:51` clears the model and dispatches `piece-unloaded`; `src/capture-app.js:626` only clears `pieceId`. Meanwhile, the running metronome reads `ScoreRenderer.state.model.measures` at `src/capture-app.js:204`. The proposed unload hook also clears analysis state without explicitly ending capture. Loading malformed MusicXML during recording can leave capture active against a null model.

**Suggestions**

- Invalidate pending loads when starting or replacing a session; assert the intended session identity before applying asynchronous results.
- Add browser scenarios for Start during delayed restoration and invalid MusicXML during live capture. Specify how capture ends and how its retained attempts remain accessible.

**Risk Assessment: HIGH.** These failures can disconnect displayed results from the session actually being recorded.

## 03-03

**Summary:** The alignment plan has useful adversarial fixtures and explicit ambiguity rules. Its performance evidence, however, does not measure the live path it claims to protect.

**Strengths**

- Forward/backward co-optimal edge analysis explicitly handles alternatives rather than trusting one traceback: [03-03-PLAN.md:184](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-03-PLAN.md:184>).
- The tempo boundary matches the scheduler implementation: `src/metronome.js:34` advances time using the current BPM, while `setBpm` changes the cursor at line 81. Excluding later click labels from an earlier pass is justified.

**Concerns**

- **MEDIUM — The performance gate omits significant live work.** [03-03-PLAN.md:234](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-03-PLAN.md:234>) benchmarks alignment and aggregation in Node. The live callback also segments the full event log, updates pass items, paints, and regenerates details. Segmentation copies and sorts events (`src/pass-segmenter.js:37`), and the scheduler invokes the callback synchronously (`src/metronome.js:62`).
- **MEDIUM — Restart detection depends on a chosen traceback after ambiguity has been established.** The proposed detector tests insertion membership in the chosen reading. [03-03-PLAN.md:232](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-03-PLAN.md:232>) allows multiple optimal readings, but the restart rule does not state what happens when they disagree about that membership. A whole-pass verdict should not depend on an arbitrary representative.

**Suggestions**

- Measure the complete finalizing callback in Chrome with a realistic accumulated session, recording worst observed duration as well as median.
- Define restart detection over optimal alternatives and add a fixture where insertion membership differs between tied readings.

**Risk Assessment: MEDIUM.** The principal remaining risks concern operational performance and consistency between ambiguity and restart policies.

## 03-04

**Summary:** The display work is appropriately scoped, but the specified interfaces cannot support all promised sentences and view transitions.

**Strengths**

- Updating the capture regression alongside pass-list suffixes is necessary: `scripts/check-capture-roundtrip.cjs:445` currently compares exact text.
- Fresh geometry after repaint matches the renderer’s behavior: `src/score-renderer.js:175` rebuilds notation on resize.

**Concerns**

- **HIGH — Single-pass gap descriptions lose ambiguity information.** [03-04-PLAN.md:176](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-04-PLAN.md:176>) passes only filtered `result.extras` to `describeGap`. That data cannot reveal `ambiguousPlayed` or ambiguous adjacent score notes. Consequently, it cannot reliably produce the required “at least … (ambiguous notes nearby)” sentence.
- **MEDIUM — Selecting a tempo while viewing one pass does not select that tempo’s aggregate.** [03-04-PLAN.md:131](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-04-PLAN.md:131>) changes only `A.view.bpm`; rendering continues down the `kind: 'pass'` branch. The visible selector can therefore change without changing the displayed pass.

**Suggestions**

- Pass the complete `PassResult`, or a derived gap assessment containing ambiguity metadata, to single-pass descriptions. Exercise the messy fixture through the browser UI.
- Make tempo selection explicitly return to session view, or hide the selector in pass view. Test that transition.

**Risk Assessment: HIGH.** Losing the lower-bound qualifier directly undermines the phase’s promise of honest counts.

## 03-05

**Summary:** The piano gate now tests the actual product experiment at one tempo and records a concrete policy choice. Its timing guidance and automated acceptance wording still need correction.

**Strengths**

- The ready rule matches capture semantics: `src/capture-app.js:345` immediately opens the next pass after a mark, so inspection requires another boundary before playing.
- The twelve-pass experiment in [03-05-PLAN.md:218](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-05-PLAN.md:218>) directly serves the early aggregate experiment required by `.planning/ROADMAP.md:17`.

**Concerns**

- **MEDIUM — “Up to about a beat and a half” understates finalization delay.** [03-05-PLAN.md:122](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-05-PLAN.md:122>) omits rounding forward to the next recorded click and potentially waiting for an origin. For example, at 120 BPM, an end at 3100 requires support through 3850; the next click is 4000 and is scheduled around 3900—already more than 750 ms later. Scheduler constants are at `src/metronome.js:10`.
- **MEDIUM — Literal TAP acceptance fails on the current environment.** The plan requires `# fail 0`, but the fresh `npm test` run emitted `ℹ fail 0`. `package.json:5` does not explicitly select the TAP reporter. Successful execution can therefore be rejected by the written gate.

**Suggestions**

- Tell the user to wait until “finishing” clears, without promising an inaccurate upper bound.
- Explicitly select TAP where parsing TAP text is required, or use exit status and reporter-independent assertions.

**Risk Assessment: MEDIUM.** The experiment is sound, but these discrepancies can cause false gate failures and confusing hardware instructions.

## 03-06

**Summary:** The independent ladder oracle and explicit application of the user’s reach choice are strong. The changed policy needs an observed recheck before it becomes the foundation for later rungs.

**Strengths**

- The oracle derives timing from model rationals instead of alignment helpers: [03-06-PLAN.md:146](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-06-PLAN.md:146>). Those rationals originate in score extraction (`src/score-model.js:139`).
- Fixing the omission pass’s end independently of its remaining notes avoids making omitted notes accidentally “not reached”: [03-06-PLAN.md:150](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-06-PLAN.md:150>).

**Concerns**

- **MEDIUM — Choosing `reading` changes behavior without a piano check of that behavior.** [03-06-PLAN.md:138](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-06-PLAN.md:138>) flips the default, but the subsequent hardware checklist exercises clean and wrong pitches. The user previously observed only the `origin` implementation.
- **LOW — The canonical decision update has no explicit completion gate.** [03-06-PLAN.md:140](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-06-PLAN.md:140>) leaves the context amendment to an orchestrator, allowing later execution to encounter contradictory canonical instructions.

**Suggestions**

- If the default changes, repeat the late-and-abandoned example and record the actual F4 result.
- Require the canonical decision record to be reconciled before starting rung 3.

**Risk Assessment: MEDIUM.** The implementation is narrow; the main gap is validating and consistently recording the policy change.

## 03-07

**Summary:** This is a well-bounded rung advancement. Its synthetic timing coverage is considerably narrower than the real two-hand behavior it intends to validate.

**Strengths**

- Grouping both staves by absolute onset fits the existing canonical ordering: `src/score-model.js:129` orders onset before staff.
- Independent source expectations already identify both E noteheads separately: `test/score-model.test.cjs:93`, supporting the proposed left-hand-only mistake assertion.

**Concerns**

- **MEDIUM — Two-hand timing tolerance is deferred to failure at the piano.** The fixture uses a 5 ms separation, while [03-07-PLAN.md:215](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-07-PLAN.md:215>) acknowledges that slightly wider separation produces false missed-plus-extra marks. Simply widening one global window may create different grouping errors elsewhere.

**Suggestions**

- Add two-hand fixtures spanning both arrival orders and several offsets around the window boundary.
- Record an explicit supported tolerance. If the piano requires more, evaluate score-aware grouping alongside a window adjustment, with repeated-note regressions.

**Risk Assessment: MEDIUM.** Scope and sequencing are appropriate, but the clean-pass acceptance depends on an unvalidated grouping threshold.

## 03-08

**Summary:** The exact assignment approach is substantially better specified than capped enumeration. The randomized oracle needs a precise domain, and performance coverage should exercise chords.

**Strengths**

- The forced-label calculation checks whether each candidate can participate in a minimum-distance assignment: [03-08-PLAN.md:190](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-08-PLAN.md:190>). This can identify ambiguity beyond one monotone traceback.
- The chord fixtures match real model structure: `test/score-model.test.cjs:101` lists the four noteheads at each onset.
- Timestamp-based roll diagnosis uses data actually retained by capture (`src/capture-app.js:395`) instead of relying on an estimated playing speed.

**Concerns**

- **MEDIUM — The randomized oracle does not explicitly exclude equal pitches before comparing leftover assignments.** [03-08-PLAN.md:179](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-08-PLAN.md:179>) draws both lists from the same pitch range, whereas line 187 requires equal pitches to be matched first. For score `[60,61]` and played `[61,62]`, both unrestricted assignments have distance 2, but equal-first policy fixes 61 as played. I reproduced this discrepancy numerically. Calling the generated lists “leftovers” is insufficient unless their construction enforces that condition.
- **MEDIUM — The inherited performance benchmark is monophonic.** Its 64 quarter-note score does not exercise the multi-note leftover assignment introduced here, despite the required performance claim after `pairCost` changes.

**Suggestions**

- Explicitly preprocess equal pitches in the reference oracle, or generate disjoint leftover pitch sets and test equal-first behavior separately.
- Add repeated chord and oversized-token cases to the performance gate, including browser execution.

**Risk Assessment: MEDIUM.** The algorithmic direction is sound, but the proof and performance claims need these adjustments.

## 03-09

**Summary:** The phase-close evidence table is appropriately cautious. One final hardware check cannot demonstrate what it claims because it reopens a session with no visible mistakes.

**Strengths**

- The interpolation anchors agree with the source model’s named notes and measure starts: `test/score-model.test.cjs:193`, `:196`, `:199`, and `:210`.
- The repeated G3 probe targets genuinely distinct score opportunities at beats 2 and 3 (`test/score-model.test.cjs:153`, `:155`).
- The evidence table explicitly distinguishes recorded piano observations from fixture-only coverage: [03-09-PLAN.md:216](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-09-PLAN.md:216>).

**Concerns**

- **MEDIUM — The final reopen check is visually non-discriminating.** [03-09-PLAN.md:197](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-09-PLAN.md:197>) creates a fresh, clean rung-4 session immediately before checking that “marks survived” reopening. All-black notation could also result from missing analysis or failed restoration. Restoration loads the last piece (`src/capture-app.js:57`), not necessarily the marked rung-5 session.

**Suggestions**

- Reopen while a session with known wrong, missed, and extra marks is selected.
- Assert its exact detail sentence and pass count after reopening, then perform the clean regression separately.

**Risk Assessment: MEDIUM.** Most coverage is substantive; the final persistence observation needs an observable failure condition.

**Overall assessment:** Request revisions before execution. The highest-priority changes are the correction fixture’s event ordering, async session ownership, failed-load handling, and preservation of ambiguity metadata through the UI.

The architecture and rung-by-rung gates remain appropriate. The existing suite provides a healthy baseline, but its 78 passing tests do not validate the proposed Phase 3 contracts. No repository files were edited.

---

## Consensus Summary

This round had a single reviewer: Codex, round 3, run after the 98efac5 replan. Its findings cite `file:line` evidence, and Codex ran `npm test` for a baseline (78 passed, 0 failed). Codex still recommends revising before execution. The severity profile has dropped since round 2: 4 HIGH and 12 MEDIUM/LOW now, against 7 HIGH before. Five of nine plans are rated MEDIUM risk overall.

### Agreed Strengths
(Only one reviewer.)
- Rung-by-rung gates and the overall architecture are appropriate.
- The model-identity guard and in-memory derived results address real source ordering.
- The tempo boundary matches the scheduler.
- The ladder timing check is independent of the engine code.
- Chord pairing now uses an exact algorithm, and roll diagnosis uses stored timestamps.
- The phase-close evidence table is honest about what was checked at the piano versus by fixtures.

### Agreed Concerns
(Only one reviewer. HIGH items first.)
1. **The 2600 ms correction fixture contradicts the tokenizer (03-01).** Keeping sequence order puts E@2600 before F@2500, so they merge into one token. The substitution path then costs 7360, not the stated 6680. Codex reproduced this with a probe.
2. **Start doesn't invalidate a pending history load (03-02).** A delayed `loadLatestSession` can overwrite the new live session.
3. **A failed piece load during capture isn't handled (03-02).** The model is cleared while the metronome still reads `ScoreRenderer.state.model.measures`, so capture keeps running against a null model.
4. **Single-pass gap sentences lose ambiguity data (03-04).** `describeGap` only receives the filtered extras, so it can't produce the "at least … (ambiguous notes nearby)" wording.

MEDIUM/LOW items:
- Fixture validation doesn't require every note id to have an expectation (03-01).
- The performance gate skips the live callback's segmentation and paint work (03-03).
- Restart detection depends on one chosen reading when several tie (03-03).
- Selecting a tempo in pass view doesn't switch to that tempo's aggregate (03-04).
- "About a beat and a half" understates the finishing delay (03-05).
- The `# fail 0` acceptance check doesn't match the default spec reporter's `ℹ fail 0` (03-05).
- Choosing reach=reading gets no piano recheck of the new behaviour (03-06).
- The CONTEXT amendment has no completion gate (03-06, LOW).
- The two-hand timing tolerance is only tested at a 5 ms separation (03-07).
- The randomized chord check doesn't match equal pitches first, as the algorithm does (03-08).
- The performance benchmark has no chords (03-08).
- The final reopen check uses a clean session, so it can't show that marks survived (03-09).

### Divergent Views
None (single reviewer). The D-11 reach deferral from round 2 was not re-raised as a defect. Codex accepted the switch and the piano-gate approach, and only asked for a recheck if the default changes.
