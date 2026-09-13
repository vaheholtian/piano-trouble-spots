---
phase: 1
reviewers: [codex]
reviewed_at: 2026-09-13T20:16:18Z
plans_reviewed: [01-01-PLAN.md, 01-02-PLAN.md, 01-03-PLAN.md]
models:
  codex: "gpt-6-astra (reasoning=medium)"
model_sources:
  codex: "banner"
---

# Cross-AI Plan Review — Phase 1

<!-- gsd:plan-revision-conflicts:begin -->
## Plan-Revision Conflicts
<!-- gsd:plan-revision-conflicts:end -->

## Codex Review

Reviewed all three repository plans, their supporting documents, and the prototype patterns. I also inspected the supplied MuseScore archives and OSMD’s pinned 2.1.2 source. The new app and tests do not exist yet, so this review assesses the proposed mechanisms, not a working implementation.

## 01-01

**Summary**

The tracer has a sound boundary between parsing, plain data, and rendering. However, its proposed SVG map does not establish individual notehead addressability—the capability later mistake annotation depends on.

**Strengths**

- **The model boundary is explicit and testable.** Extraction returns plain data while passing live OSMD references through a separate hook. This keeps renderer objects out of persistence and analysis. See [01-01-PLAN.md:169](/C:/Code/Piano%20Mistakes/.planning/phases/01-score-on-screen/01-01-PLAN.md:169).
- **The shared-script approach has an actual repository precedent.** The prototype exposes its core through `globalThis`, and its tests consume that same implementation. See [piano-core.js:3](/C:/Code/Piano%20Mistakes/prototype/piano-core.js:3) and [piano-core.test.cjs:1](/C:/Code/Piano%20Mistakes/prototype/piano-core.test.cjs:1).
- **The table’s prescribed DOM helper handles imported text safely.** The referenced helper assigns `textContent`, so score text is not interpreted as HTML. See [piano-app.js:9](/C:/Code/Piano%20Mistakes/prototype/piano-app.js:9).

**Concerns**

- **HIGH — Chord notes can share the same mapped SVG element.** `buildSvgMap()` accepts any connected result from `getSVGGElement()` and counts map keys. In OSMD 2.1.2, that method returns the enclosing VexFlow note element; the chord index is stored separately. Three chord pitches can therefore count as three mappings while targeting the same element. Later colouring could affect the whole chord. See [01-01-PLAN.md:224](/C:/Code/Piano%20Mistakes/.planning/phases/01-score-on-screen/01-01-PLAN.md:224) and [OSMD 2.1.2 source, lines 70–85 and 168–175](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay/blob/2.1.2/src/MusicalScore/Graphical/VexFlow/VexFlowGraphicalNote.ts#L168).
- **MEDIUM — The prescribed global shim does not reliably replace `navigator`.** The plan copies globals using the research example’s assignment loop. On this machine’s Node v24.11.1, I verified that `globalThis.navigator` has a getter and no setter: assignment silently fails outside strict mode and throws in strict mode. This undermines the claimed jsdom environment. See [01-01-PLAN.md:172](/C:/Code/Piano%20Mistakes/.planning/phases/01-score-on-screen/01-01-PLAN.md:172) and [01-RESEARCH.md:376](/C:/Code/Piano%20Mistakes/.planning/phases/01-score-on-screen/01-RESEARCH.md:376).

**Suggestions**

- Resolve each source pitch to its specific notehead using the pinned renderer’s chord index. Verify distinct targets for rung 4, correct pitch association, and replacement after resize. This can be a development check without adding product UI.
- Install test globals with configurable property descriptors, preserve the originals, and restore them during cleanup.
- Complete the browser tracer check before declaring Wave 1 complete; syntax checks cannot establish the rendering contract.

**Risk Assessment: HIGH**

The model approach is credible, but the mapping defect could pass every proposed count check and survive until annotation work.

## 01-02

**Summary**

This plan provides strong musical fixtures and closes the compressed-file coverage gap. Its main weaknesses are a contradictory precision requirement and incomplete tie-chain coverage.

**Strengths**

- **The expected musical content has independent backing.** I inspected the supplied `.mscz`: its first four measures’ pitches and rhythmic values match the planned 41 rows, and both staves still contain 43 measures. The export-and-trim procedure addresses the actual source state. See [01-02-PLAN.md:229](/C:/Code/Piano%20Mistakes/.planning/phases/01-score-on-screen/01-02-PLAN.md:229).
- **Compressed loading exercises the intended binary handoff.** The `.mxl` test constructs a `File` from bytes and compares both notes and measures against uncompressed input. This checks considerably more than the ZIP signature. See [01-02-PLAN.md:240](/C:/Code/Piano%20Mistakes/.planning/phases/01-score-on-screen/01-02-PLAN.md:240).
- **The tie fixture checks both duration and onset suppression.** Five written notes must become three attack events, including a cross-bar tie. See [01-02-PLAN.md:274](/C:/Code/Piano%20Mistakes/.planning/phases/01-score-on-screen/01-02-PLAN.md:274).

**Concerns**

- **MEDIUM — Two authoritative requirements disagree on conversion.** The front matter says whole-note `12/8` becomes `3/2` quarter beats, while the detailed test correctly expects `6/1`. Both cannot pass. See [01-02-PLAN.md:36](/C:/Code/Piano%20Mistakes/.planning/phases/01-score-on-screen/01-02-PLAN.md:36) and [01-02-PLAN.md:278](/C:/Code/Piano%20Mistakes/.planning/phases/01-score-on-screen/01-02-PLAN.md:278).
- **MEDIUM — Two-note ties do not establish general tie resolution.** Both fixture ties contain only a start and stop. They do not exercise a middle note carrying stop/start, although extraction assumes every continuation identifies the originally emitted start. See [01-02-PLAN.md:274](/C:/Code/Piano%20Mistakes/.planning/phases/01-score-on-screen/01-02-PLAN.md:274) and [01-01-PLAN.md:169](/C:/Code/Piano%20Mistakes/.planning/phases/01-score-on-screen/01-01-PLAN.md:169).
- **LOW — Failed fixture regeneration can overwrite the committed outputs.** The script exports directly to final fixture paths and validates counts only after both exports. A changed source or failed second export leaves partially refreshed artifacts. See [01-02-PLAN.md:230](/C:/Code/Piano%20Mistakes/.planning/phases/01-score-on-screen/01-02-PLAN.md:230).

**Suggestions**

- Correct the `12/8` requirement to `6/1` quarter beats.
- Add one three-segment tie assertion, checking total duration, one onset, and `tiedNoteCount: 3`.
- Generate into a temporary directory, validate, then replace the fixture files together.
- Treat a mismatch as something to investigate; the statement that it necessarily means the user edited the piece excludes exporter or extraction defects.

**Risk Assessment: MEDIUM**

The fixtures are concrete and source-backed. The remaining issues are bounded corrections before the model becomes a persisted contract.

## 01-03

**Summary**

The explicit piano checkpoint addresses the prototype’s central failure. Its acceptance procedure nevertheless needs stronger mapping evidence and a more precise definition of what “approved” covers.

**Strengths**

- **Human verification is genuinely blocking.** The plan requires the pianist’s response and records it rather than accepting automated results alone. See [01-03-PLAN.md:97](/C:/Code/Piano%20Mistakes/.planning/phases/01-score-on-screen/01-03-PLAN.md:97).
- **The manifest makes musical verification practical.** It specifies staff content, rhythm, and expected counts rather than asking vaguely whether the screen looks correct. See [01-03-PLAN.md:78](/C:/Code/Piano%20Mistakes/.planning/phases/01-score-on-screen/01-03-PLAN.md:78).
- **The checkpoint includes actual browser-specific paths.** It covers compressed files, resize, invalid input, and recovery—behaviour unavailable from parsing-only tests. See [01-03-PLAN.md:108](/C:/Code/Piano%20Mistakes/.planning/phases/01-score-on-screen/01-03-PLAN.md:108).

**Concerns**

- **HIGH — The gate accepts mapping counts that cannot detect the chord defect.** Checking `8/8` or `41/41` and absence of `MISSING` does not establish distinct, correctly associated noteheads. See [01-03-PLAN.md:106](/C:/Code/Piano%20Mistakes/.planning/phases/01-score-on-screen/01-03-PLAN.md:106).
- **MEDIUM — Verification commands assume an undeclared shell.** The gate uses Bash command substitution, `test`, `!`, and `/dev/null`; the supplied environment is PowerShell. Git Bash is installed, but the plan never specifies invoking it. See [01-03-PLAN.md:85](/C:/Code/Piano%20Mistakes/.planning/phases/01-score-on-screen/01-03-PLAN.md:85).
- **LOW — The approval signal omits required checks.** The instructions require invalid-file recovery, but the approval sentence does not include it. The front matter also promises resize verification for every rung, while the procedure resizes only rung 5. See [01-03-PLAN.md:22](/C:/Code/Piano%20Mistakes/.planning/phases/01-score-on-screen/01-03-PLAN.md:22), [01-03-PLAN.md:108](/C:/Code/Piano%20Mistakes/.planning/phases/01-score-on-screen/01-03-PLAN.md:108), and [01-03-PLAN.md:113](/C:/Code/Piano%20Mistakes/.planning/phases/01-score-on-screen/01-03-PLAN.md:113).

**Suggestions**

- Require developer evidence of correct individual chord targets before the piano checkpoint.
- Use a small Node verification script or explicitly invoke Git Bash.
- Align the approval sentence with every mandatory check and clarify whether resize applies to all rungs.
- Add a lightweight `.xml`-extension check to cover the third explicitly promised input extension.

**Risk Assessment: MEDIUM, contingent on fixing 01-01**

The human gate is well designed for musical correctness, but cannot compensate for an inadequate technical mapping assertion.

**Overall recommendation:** Revise before execution. Preserve the three-wave structure; prioritize individual notehead mapping, the Node shim, and consistent acceptance criteria.

Available follow-ups: revise the plans, save this review, re-review a narrower area, or discuss a finding.

---

## Consensus Summary

Only one reviewer (Codex) ran, per `review.default_reviewers`, so there is no cross-reviewer consensus. The review is source-grounded: it cites plan lines, prototype files, and the pinned OSMD 2.1.2 source, and it checked the Node shim claim locally. The priorities below come from that single review.

### Agreed Strengths
- Keeping the plain-data model separate from live OSMD references (01-01).
- Fixtures that match the supplied `.mscz` source, plus a real `.mxl` byte-handoff test (01-02).
- A blocking at-the-piano checkpoint with a concrete manifest (01-03).

### Agreed Concerns (single reviewer — highest priority)
1. **HIGH — Chord noteheads not individually addressable.** `getSVGGElement()` returns the enclosing VexFlow note group, so all pitches in a chord map to one element. The count-based checks in 01-01 and 01-03 cannot catch this. Fix: resolve each pitch to its own notehead by chord index, and assert that the targets are distinct.
2. **MEDIUM — The jsdom global shim cannot overwrite `navigator` on Node 24** (getter-only). Fix: install globals with `Object.defineProperty` and restore them afterwards.
3. **MEDIUM — 01-02 contradicts itself on 12/8:** the frontmatter says `3/2` quarter beats, the test expects `6/1`. Fix: use `6/1`.
4. **MEDIUM — No tie chain of three or more notes in the fixtures.** Fix: add one three-segment tie assertion.
5. **MEDIUM — The 01-03 verification commands are Bash-only**, but the environment is PowerShell. Fix: run them with a Node script, or say explicitly to use Git Bash.
6. **LOW —** Fixture regeneration writes over the committed files before validating; the approval sentence leaves out invalid-file recovery; resize is promised for every rung but only tested on rung 5; there is no `.xml` extension check.

### Divergent Views
None — single reviewer.
