---
phase: "1"
slug: "score-on-screen"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-13"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node built-in; v24.11.1 on this machine) + jsdom devDependency to drive the real OSMD parser |
| **Config file** | none — Wave 0 adds `package.json` (jsdom devDependency) |
| **Quick run command** | `node --test test/score-model.test.cjs` |
| **Full suite command** | `node --test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/score-model.test.cjs`
- **After every plan wave:** Run `node --test`
- **Before `/gsd-verify-work`:** Full suite must be green, then manual-only rows below
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-T1 | 01 | 1 | SCORE-03 | — | N/A | unit (fixture, real OSMD via jsdom) — rung 1 exact note list, measures, JSON purity, id determinism, MIDI 60 / octave-offset pin, onNote hook order (tracer) | `node --test test/score-model.test.cjs` | ❌ W0 (created by this task) | ⬜ pending |
| 01-01-T2 | 01 | 1 | SCORE-01 | — | N/A | static run-path gates (`node --check`, no module-type script tag, pinned CDN URL, renderer script tag) + suite still green; human-check: rung 1 renders 5/5 in Chrome, survives resize, failed load recovers | verify chain in 01-01-PLAN.md Task 2 | ❌ W0 | ⬜ pending |
| 01-02-T1 | 02 | 2 | SCORE-03 | — | N/A | unit — rungs 2, 3, 4 exact note lists; chord notes at equal onset stay separate; staff 1 before staff 2 at equal onset; time signatures | `node --test test/score-model.test.cjs` | ❌ W0 | ⬜ pending |
| 01-02-T2 | 02 | 2 | SCORE-01, SCORE-03 | — | N/A | unit — rung 5 exact 41 rows and 4 measures; extracted twice identical; no untied note past its bar; .mxl model equals .musicxml model; rung 1 as File equals as text | `node scripts/build-rung5.cjs && node --test test/score-model.test.cjs` | ❌ W0 | ⬜ pending |
| 01-02-T3 | 02 | 2 | SCORE-03 | — | N/A | unit — tie fold within and across a bar (5 noteheads → 3 notes), exact whole→quarter rational conversion incl. dotted values and unreduced 12/8, rest-only file → [], duplicate pitch in a chord throws, extract with DOM globals deleted | `node --test test/score-model.test.cjs` | ❌ W0 | ⬜ pending |
| 01-03-T1 | 03 | 3 | SCORE-01, SCORE-03 | — | N/A | full suite (19) + index.html/src run-path gates + all seven fixtures tracked + fixtures/README.md manifest | `npm test` chain in 01-03-PLAN.md Task 1 | ❌ W0 | ⬜ pending |
| 01-03-T2 | 03 | 3 | SCORE-01, SCORE-03 | — | N/A | checkpoint:human-verify (blocking-human) at the FP-60X: five rungs render with right notes on right staff, N/N mapped (5, 5, 10, 8, 41), resize keeps 41/41, both .mxl files render, bad file recovers | manual — see 01-03-PLAN.md Task 2 | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs filled by the planner on 2026-09-13: three plans, three waves (01 → 02 → 03), one test file `test/score-model.test.cjs` grown across plans (5 → 8 → 13 → 19 tests).*

---

## Wave 0 Requirements

There is no separate Wave 0 plan: the tracer task (01-01 Task 1) creates the harness as part of proving the first slice, so the first test run and the first implementation land in the same commit.

- [ ] `package.json` — devDependencies pinned: opensheetmusicdisplay 2.1.2, jsdom 29.1.1 (the version every planning probe ran on) — 01-01 Task 1
- [ ] `test/osmd-node-env.cjs` — jsdom global-shim helper + `loadSheet` / `readFixture` — 01-01 Task 1
- [ ] `test/score-model.test.cjs` — per-ladder-rung fixture tests — 01-01 Task 1 (rung 1), 01-02 Tasks 1-3 (rungs 2-5, .mxl, tie, contract)
- [ ] `fixtures/01..05-*.musicxml` (+ `05-*.mxl`, `test/fixtures/tie.musicxml`) — 01-01 Task 1 (rung 1), 01-02 Task 1 (rungs 2-4), 01-02 Task 2 (rung 5 via `scripts/build-rung5.cjs`), 01-02 Task 3 (tie)
- [ ] `src/score-model.js` — pure extraction module — 01-01 Task 1

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| File renders as correct notation in real Chrome, right notes on right staff | SCORE-01 | jsdom cannot render pixels; "looks right" is human judgment | Open each ladder file in Chrome on the laptop at the FP-60X; compare against the file's intended content |
| noteId → SVG map complete after render and after window resize | SCORE-03 (D-11) | jsdom `getSVGGElement()` returns null without a real render | In Chrome, load a file, check inspect view reports every note mapped; resize window and re-check |
| `.mxl` file loads | SCORE-01 | No ladder rung is compressed | Export one ladder file as `.mxl` from MuseScore and open it |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
