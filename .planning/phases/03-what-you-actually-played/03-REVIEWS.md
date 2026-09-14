---
phase: 3
reviewers: [codex]
reviewed_at: 2026-09-14T19:59:48Z
plans_reviewed: [03-01-PLAN.md, 03-02-PLAN.md, 03-03-PLAN.md, 03-04-PLAN.md, 03-05-PLAN.md, 03-06-PLAN.md, 03-07-PLAN.md]
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

Reviewed all seven local plans against the capture, storage, renderer, score-model, and existing test code. The analysis modules are not implemented yet; findings below concern the proposed implementation. No files were changed.

## 03-01

**Summary:** The contract-first approach is appropriate, but the revised contract changes a locked counting rule and overstates what its extra-note denominators establish.

**Strengths**

- Hand-derived expectations use real structural note IDs and rational onsets, matching the existing model and tests. This provides an independent check on alignment rather than reproducing its output. Evidence: [src/score-model.js:127](<C:/Code/Piano Mistakes/src/score-model.js:127>), [test/score-model.test.cjs:13](<C:/Code/Piano Mistakes/test/score-model.test.cjs:13>).

**Concerns**

- **HIGH — Lagged reach changes D-11.** The late-abandoned example makes F unassessed because its *lagged* time is 3000, despite its fixed-origin time being 2500 and the mark occurring at 2700. D-11 explicitly defines reach from the fixed origin. Retaining the original `deviationMs` does not preserve that counting policy. Evidence: [03-01-PLAN.md:178](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-01-PLAN.md:178>), [03-CONTEXT.md:37](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-CONTEXT.md:37>).
- **MEDIUM — A bounded numerator is presented as an exact rate.** The plan acknowledges that extras beside ambiguous alignment are a lower bound, but the detail sentence still says “in N of M assessed passes.” Reaching a gap does not establish whether that gap contained an extra when event assignments remain ambiguous. `passesWithExtra <= assessedPasses` checks arithmetic consistency, not assessment validity. Evidence: [03-01-PLAN.md:195](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-01-PLAN.md:195>), [03-01-PLAN.md:327](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-01-PLAN.md:327>).
- **MEDIUM — Harness reporting conflicts with tracer completion.** This plan prints its success lines at the end, while 03-02 Task 1 requires the first success line even if a later scenario fails. Evidence: [03-01-PLAN.md:288](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-01-PLAN.md:288>), [03-02-PLAN.md:207](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-02-PLAN.md:207>).

**Suggestions**

- Resolve fixed-origin versus lagged reach explicitly before freezing fixtures. If changing D-11, update the canonical decision and validate a **late, abandoned** pass.
- Separate gap reach from confidence about extra-note presence; expose uncertain opportunities or label counts as minimum confirmed counts.
- Print each harness success immediately after its assertions pass.

**Risk Assessment: HIGH.** This contract controls every subsequent label, denominator, and Phase 4 interpretation.

## 03-02

**Summary:** The integration seams are well chosen, but the finalization assertions and model-identity guard need correction before this plan is executable.

**Strengths**

- Repainting after map reconstruction addresses a real lifecycle: `renderAndMap()` rebuilds the SVG map, including on resize. The existing map already targets individual chord noteheads. Evidence: [src/score-renderer.js:83](<C:/Code/Piano Mistakes/src/score-renderer.js:83>), [src/score-renderer.js:148](<C:/Code/Piano Mistakes/src/score-renderer.js:148>).
- Pending analysis addresses an actual scheduling horizon: clicks are emitted by a 25 ms timer with 100 ms look-ahead. Evidence: [src/metronome.js:10](<C:/Code/Piano Mistakes/src/metronome.js:10>), [src/metronome.js:65](<C:/Code/Piano Mistakes/src/metronome.js:65>).

**Concerns**

- **HIGH — The final-prefix deep-equality promise is false for the specified result shape.** In the plan’s own start=3600/end=3800 case, the prefix ending at the accented click at 6000 qualifies as final. Later score-slot times are then `null`; appending clicks supplies those times. Consequently, `PassResult.slots` changes even if verdicts remain unchanged. Evidence: [03-02-PLAN.md:195](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-02-PLAN.md:195>), [03-02-PLAN.md:244](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-02-PLAN.md:244>).
- **HIGH — One required test contradicts the reach formula.** With clicks through 3000, end=2750 and grace=250, G’s expected time exists and satisfies `3000 <= 3000`. It must be missed, not `not-reached` as the test specifies. Evidence: [03-02-PLAN.md:245](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-02-PLAN.md:245>).
- **HIGH — Reopening the same file during capture permanently suppresses painting.** Loading creates a fresh model object, but the capture session ends only when the content hash changes. The proposed reference-identity guard therefore rejects the new map, while the live session prevents `loadLatestSession()` from rebinding it. Evidence: [src/score-renderer.js:45](<C:/Code/Piano Mistakes/src/score-renderer.js:45>), [src/capture-app.js:605](<C:/Code/Piano Mistakes/src/capture-app.js:605>), [03-02-PLAN.md:254](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-02-PLAN.md:254>).

**Suggestions**

- Define precisely which result fields must remain stable; canonicalize unavailable tail metadata or compare the stable verdict projection.
- Correct the 3000-click expectation and retain a separate test where that click is genuinely absent.
- Add a live same-file reload test and explicitly reconcile the verified piece identity with the newly rendered model.

**Risk Assessment: HIGH.** These issues affect both mandatory tests and an ordinary file-opening action.

## 03-03

**Summary:** The ambiguity and tempo rules are substantially better specified, but late-entry robustness is still narrower than the advertised guarantee.

**Strengths**

- Co-optimal consuming edges distinguish genuinely different assignments from arbitrary traceback choices. Evidence: [03-03-PLAN.md:152](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-03-PLAN.md:152>).
- Strictly-before-end tempo membership matches the scheduler: a click receives the current BPM label before that BPM determines the following interval. Evidence: [src/metronome.js:27](<C:/Code/Piano Mistakes/src/metronome.js:27>), [03-03-PLAN.md:241](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-03-PLAN.md:241>).

**Concerns**

- **HIGH — One accidental opening note disables the late-entry repair.** The lag bound uses the first played event. Add an extra C6 on the origin before the twelve-note performance one beat late: the bound becomes zero. The intended correspondence costs `3 + 12×3.4 = 43.8`; twelve in-slot substitutions plus the final insertion cost `12×3 + 3 = 39`. Thus the cost model again prefers cascading wrong notes. The capture layer correctly retains that accidental event. Evidence: [03-03-PLAN.md:194](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-03-PLAN.md:194>), [src/pass-segmenter.js:54](<C:/Code/Piano Mistakes/src/pass-segmenter.js:54>).
- **MEDIUM — Computational cost has no acceptance budget.** Every lag runs a DP, and each pending-click callback reanalyzes completed passes. Long waits before entry enlarge the lag search; repeated sessions multiply the work on the same thread scheduling the metronome. Evidence: [03-03-PLAN.md:194](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-03-PLAN.md:194>), [03-02-PLAN.md:252](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-02-PLAN.md:252>), [src/metronome.js:75](<C:/Code/Piano Mistakes/src/metronome.js:75>).

**Suggestions**

- Add late-entry fixtures with an opening extra and a missing opening note. Resolve their interpretation without filtering raw events.
- Measure a realistic 20–50-pass session plus a long-wait case; reuse finalized in-memory results where necessary.

**Risk Assessment: HIGH.** The remaining failure directly undermines trust in messy real performances.

## 03-04

**Summary:** The display work is appropriately limited, but the existing and extended harness expectations have not been fully reconciled.

**Strengths**

- Fresh geometry on repaint fits the renderer’s replacement of notehead elements after resize. The pure geometry tests also make placement rules independently reviewable. Evidence: [src/score-renderer.js:148](<C:/Code/Piano Mistakes/src/score-renderer.js:148>), [03-04-PLAN.md:159](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-04-PLAN.md:159>).

**Concerns**

- **HIGH — The mandatory capture regression test will reject the new labels.** It sends future-timestamped events immediately and asserts exact strings such as `Pass 1 - 3 notes`. Those completed passes will now be pending, and `renderPassItems()` adds `(finishing)`. The script is not included in this plan’s changes. Evidence: [scripts/check-capture-roundtrip.cjs:406](<C:/Code/Piano Mistakes/scripts/check-capture-roundtrip.cjs:406>), [scripts/check-capture-roundtrip.cjs:446](<C:/Code/Piano Mistakes/scripts/check-capture-roundtrip.cjs:446>), [03-04-PLAN.md:121](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-04-PLAN.md:121>).
- **MEDIUM — The extended reload scenario retains a stale denominator.** The original reload assertion uses the step-5 E4 sentence, “1 of 3.” Adding correction pass 4 makes the 120 BPM denominator four, but the later-step amendments do not update that sentence. Evidence: [03-01-PLAN.md:287](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-01-PLAN.md:287>), [03-04-PLAN.md:166](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-04-PLAN.md:166>), [03-04-PLAN.md:169](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-04-PLAN.md:169>).

**Suggestions**

- Update the capture regression to verify stable ordinal/note-count data separately from analysis-status suffixes, preserving all raw-storage assertions.
- Reconcile every downstream sentence and pass count after extending the paint scenario.

**Risk Assessment: HIGH.** The plan currently requires incompatible outputs from its mandatory gates.

## 03-05

**Summary:** The twelve-pass experiment finally targets the core value, but the interaction timing makes parts of the checklist impossible to follow literally.

**Strengths**

- Twelve attempts at one tempo, an actual tally, and a question about which mistake to practise form a useful product experiment. This matches the roadmap’s requirement to validate the aggregate before advancing. Evidence: [03-05-PLAN.md:163](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-05-PLAN.md:163>), [.planning/ROADMAP.md:17](<C:/Code/Piano Mistakes/.planning/ROADMAP.md:17>).

**Concerns**

- **HIGH — Step 12 cannot occur at the time it specifies.** Step 11 requires waiting for finalization and reading two detail sentences; step 12 then says to change BPM “right after marking pass 12.” Meanwhile, the mark has already opened pass 13 and its origin may have passed at 80 BPM. Changing tempo then can correctly make the next attempt `tempo-changed`, contradicting the expected two clean tempo groups. Evidence: [03-05-PLAN.md:164](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-05-PLAN.md:164>), [src/capture-app.js:344](<C:/Code/Piano Mistakes/src/capture-app.js:344>).
- **MEDIUM — Inspection time conflicts with “start on the next accent.”** Finalization plus reading the panel can consume the next downbeat. The checklist needs a deliberate preparation boundary before the next attempt, otherwise it unintentionally tests late entry. Evidence: [03-05-PLAN.md:133](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-05-PLAN.md:133>), [src/pass-segmenter.js:48](<C:/Code/Piano Mistakes/src/pass-segmenter.js:48>).

**Suggestions**

- Schedule the immediate tempo change before inspecting results, or make it a separate controlled experiment.
- Explicitly mark again when ready after inspection; allow the resulting empty passes and avoid hard-coded ordinals where appropriate.

**Risk Assessment: HIGH.** The current protocol can produce false defect reports or misleading approval evidence.

## 03-06

**Summary:** The independent ladder oracle is strong and its rung-5 anchors are correct. Sequencing and bounded chord assignment still need attention.

**Strengths**

- I parsed the actual rung-5 file through the existing OSMD helper and confirmed 41 notes and all four proposed anchors: 2250, 3750, 5250, and 5500 ms. The oracle uses the model’s rational measure starts and onsets. Evidence: [src/score-model.js:139](<C:/Code/Piano Mistakes/src/score-model.js:139>), [03-06-PLAN.md:192](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-06-PLAN.md:192>).

**Concerns**

- **HIGH — Ordered expansion remains only partially fixed.** After rung-1 approval, Task 1 implements rung 4, Task 2 covers rung 3, and Task 3 covers all rungs before the next hardware checkpoint. The roadmap requires checking the current rung before expanding, not merely moving the first checkpoint earlier. Evidence: [03-06-PLAN.md:114](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-06-PLAN.md:114>), [03-06-PLAN.md:146](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-06-PLAN.md:146>), [.planning/ROADMAP.md:17](<C:/Code/Piano Mistakes/.planning/ROADMAP.md:17>).
- **MEDIUM — Assignment enumeration has an unspecified failure mode.** A “small cap” is permitted without defining the result when reached. Performance tokens can contain more notes than score chords. Truncating enumeration could report a guessed pairing as uniquely determined. Evidence: [03-06-PLAN.md:164](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-06-PLAN.md:164>), [src/pass-segmenter.js:54](<C:/Code/Piano Mistakes/src/pass-segmenter.js:54>).

**Suggestions**

- Interleave rung-2, rung-3, rung-4, and rung-5 implementation/checkpoints.
- Specify a complete assignment algorithm or an honest ambiguity fallback when the cap is reached; test an oversized fumble token.

**Risk Assessment: HIGH.** The numerical foundation is sound, but execution still violates the required progression.

## 03-07

**Summary:** The named-view expectations are clear, but the final acceptance claim exceeds the hardware evidence collected.

**Strengths**

- Explicitly checking blue in the missed pass and red in the tied aggregate removes an important source of misleading reports. Evidence: [03-07-PLAN.md:124](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-07-PLAN.md:124>).

**Concerns**

- **MEDIUM — Required hardware scenarios remain uncovered.** The checklists do not explicitly exercise repeated-pitch ambiguity, the equidistant chord pairing, or an intentional within-pass tempo change. Nevertheless, the completion statement claims every required interpretation case was checked at the piano. Evidence: [03-07-PLAN.md:118](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-07-PLAN.md:118>), [03-07-PLAN.md:166](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-07-PLAN.md:166>), [.planning/ROADMAP.md:124](<C:/Code/Piano Mistakes/.planning/ROADMAP.md:124>).
- **MEDIUM — Roll-speed diagnosis relies on subjective estimates.** Asking “how slow” a roll was cannot distinguish a grouping defect from crossing the 50 ms threshold. The captured event timestamps already contain the necessary evidence. Evidence: [03-07-PLAN.md:127](<C:/Code/Piano Mistakes/.planning/phases/03-what-you-actually-played/03-07-PLAN.md:127>), [src/storage.js:147](<C:/Code/Piano Mistakes/src/storage.js:147>).

**Suggestions**

- Add the missing relevant hardware probes before claiming full criterion-6 acceptance.
- Record the affected pass and inspect its retained timestamp spread when a chord test fails.

**Risk Assessment: MEDIUM.** The principal issue is completeness and reliability of acceptance evidence.

## Overall assessment

**Recommendation: revise before execution.** The architecture is suitable, but the plans are not yet internally executable.

Prioritize:

1. Resolve the reach policy and late-entry counterexample.
2. Correct finalization assertions and same-file reload handling.
3. Reconcile both browser harnesses.
4. Repair checklist timing and restore rung-by-rung gates.

The parser probe verified the rung-5 anchors; it did **not** validate the proposed alignment engine or establish that the full test suite passes.

Next options: revise the plans, save this review, review another scope, discuss a finding, or give another direction.

---

## Consensus Summary

Single reviewer (Codex, source-grounded with `file:line` citations, round 2 after the af0835b replan), so there is no cross-reviewer consensus. Round-1 findings are not repeated. Codex found them addressed, except where noted below. Verdict: **revise before execution**, though the problems are now about internal consistency rather than the architecture.

### Agreed Strengths
(Only one reviewer.)
- The pending/finalization concept matches the real 25 ms / 100 ms scheduler horizon.
- Tempo membership that counts only clicks strictly before the pass end matches the scheduler.
- Co-optimal ambiguity detection is sound.
- The rung-5 oracle anchors (2250/3750/5250/5500 ms) were independently confirmed through the OSMD parser.
- The 12-pass single-tempo experiment now targets the core value.

### Agreed Concerns
(Only one reviewer; HIGH items, highest priority.)
1. **Lagged reach contradicts locked decision D-11 (03-01).** D-11 defines reach from the fixed origin. Either keep that rule or change D-11 explicitly. The planner flagged this as a decision for the user.
2. **The late-entry repair is disabled by one stray opening note (03-03).** The lag bound comes from the first played event. With an extra C on the origin, a 12-note late pass costs 43.8 against 39 for cascading substitutions.
3. **Two finalization tests contradict the rules (03-02).** Deep equality fails because tail slot times get filled in later. The clicks-through-3000 test expects not-reached, but G must be missed.
4. **Reopening the same file during capture permanently stops painting (03-02).** The model-identity guard rejects the new model, and the live session never rebinds.
5. **The existing `check-capture-roundtrip.cjs` will fail on the new "(finishing)" labels (03-04).** The extended paint scenario also keeps a stale "1 of 3" denominator.
6. **Piano checklist timing (03-05).** Step 12's tempo change can't happen "right after marking pass 12" once inspection time is included. Inspecting results can also eat the next downbeat.
7. **Rung-by-rung gating is only partly fixed (03-06).** Rungs 3, 4 and 5 are all built before the next piano check. Codex wants a check per rung.

MEDIUM items:
- Extra-note counts are a lower bound but are phrased as exact rates (03-01).
- The harness reports success only at the end, while the tracer expects per-scenario reporting (03-01/03-02).
- No performance budget for per-lag DP and repeated reanalysis (03-03).
- The chord-assignment enumeration cap has no defined fallback (03-06).
- The piano checks omit repeated-pitch ambiguity, the equidistant chord and within-pass tempo change, yet claim full acceptance (03-07).
- Roll-speed diagnosis relies on subjective estimates rather than stored timestamps (03-07).

### Divergent Views
None (single reviewer). One item carries over between rounds: finding 1 above (lagged vs fixed-origin reach) is the same decision the round-1 planner flagged for the user. The reviewer and the planner disagree on it, so it needs a user decision rather than another replan.
