---
phase: "3"
slug: "what-you-actually-played"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-14"
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (Node ≥20 built-in) + headless-Chrome check scripts |
| **Config file** | none — `package.json` `"test": "node --test \"test/*.test.cjs\""` covers new files |
| **Quick run command** | `node --test test/align.test.cjs test/aggregate.test.cjs test/align-fixtures.test.cjs` |
| **Full suite command** | `npm test && node scripts/check-run-path.cjs --fixtures && node scripts/check-svg-map.cjs && node scripts/check-capture-roundtrip.cjs && node scripts/check-paint.cjs` |
| **Estimated runtime** | ~90 seconds (three headless-Chrome scripts) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command (or the test file the task touched) plus `node scripts/check-run-path.cjs`
- **After every plan wave:** Run the full suite command including the headless-Chrome paint check
- **Before `/gsd-verify-work`:** Full suite must be green, and the at-the-piano checkpoints done
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Filled in by the planner/executor per task. Requirement → test map from RESEARCH.md:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| ANLZ-01 | Missing first note, late first note, whole bar one beat late, wrong E, octave slip, correction with extra at its gap, shifted start (five wrong), not-reached with grace boundary, origin after pass start, double mark — twelve hand-derived fixtures | unit (fixture) | `node --test test/align.test.cjs test/align-fixtures.test.cjs` | ❌ 03-01 (fixtures + shape test), 03-02 (engine tests) | ⬜ pending |
| ANLZ-01 | Repeated pitches unique / symmetric tie (whole group ambiguous), messy pass with an ambiguous region, chords per notehead (rung 4), both hands one slot (rung 3), rolled chord, re-strike | unit (fixture) | `node --test test/align.test.cjs` | ❌ 03-03 | ⬜ pending |
| ANLZ-01 | Restart / near miss / two runs, tempo change inside a pass, no origin, beyond the timeline, repeated opening; all five rungs through the real OSMD parser with synthesized clicks | unit (fixture + ladder) | `node --test test/align.test.cjs test/align-ladder.test.cjs` | ❌ 03-05 | ⬜ pending |
| ANLZ-01 | Double mark (zero-note pass) excluded from counts/denominators; tempo-changed passes outside every group | unit (hand-built PassResults) | `node --test test/aggregate.test.cjs` | ❌ 03-02 | ⬜ pending |
| ANLZ-03 | `align.js` / `aggregate.js` have no DOM, MIDI, or audio dependency | unit + static | `node --test test/align.test.cjs` (plain Node) + `node scripts/check-run-path.cjs` + a comment-stripped negative grep in 03-02/03-03/03-05 acceptance criteria | ✅ pattern | ⬜ pending |
| AGGR-01 slice | Counts/rates only over passes at the same BPM; per-note wrong/missed/assessed/unassessed-by-reason; gap counts; colour rule; sentence templates | unit | `node --test test/aggregate.test.cjs` | ❌ 03-02 | ⬜ pending |
| AGGR-03 slice | Painted notehead children change `fill` in a real render; detail sentences; single-pass view and back; extra glyphs with counts; tempo selector; resize and reload survival | browser (headless Chrome) | `node scripts/check-paint.cjs` (four OK lines after 03-02, seven after 03-04) | ❌ 03-01 (harness, red) → 03-02 / 03-04 (green) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `docs/analysis-rules.md` — interpretation contract (D-21), before align code (03-01 Task 1)
- [ ] `test/fixtures/align/*.json` — twelve rung-1 fixtures (03-01 Task 2); five more in 03-03, five more in 03-05 (22 total)
- [ ] `test/align-fixtures.test.cjs` — fixture shape validation, green with no engine (03-01 Task 2)
- [ ] `scripts/check-paint.cjs` + `npm run check:paint` — headless-Chrome paint check, red by design until 03-02 (03-01 Task 3)
- [ ] `test/align.test.cjs` — ANLZ-01 fixture scenarios (03-02, extended in 03-03 and 03-05)
- [ ] `test/aggregate.test.cjs` — AGGR-01 pitch-only slice, D-14 denominator exclusion, D-19 sentences (03-02)
- [ ] `test/align-ladder.test.cjs` — all five rungs through the real parser (03-05 Task 2)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Marks match what was actually played | ANLZ-01, AGGR-03 slice | Real FP-60X hardware round trip | On each ladder file: one clean pass + one deliberately wrong pass; confirm marks match |
| Recurring mistake distinguishable from a one-off slip | AGGR-01 slice | Needs human judgement over real repetitions | Rung 1: 10+ passes at one tempo, one repeated pitch mistake + one one-off slip; select the marked notes and read the counts |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
