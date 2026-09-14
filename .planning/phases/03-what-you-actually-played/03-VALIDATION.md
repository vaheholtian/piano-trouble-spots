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
| **Quick run command** | `node --test test/align.test.cjs test/aggregate.test.cjs` |
| **Full suite command** | `npm test && node scripts/check-run-path.cjs && node scripts/check-svg-map.cjs` (+ new paint check script) |
| **Estimated runtime** | ~30 seconds |

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
| ANLZ-01 | Missing first note, late entry, repeated pitches, extra note, interrupted pass, restart (+ near-miss), ambiguous alignment, tempo change, octave slip, correction, chord mistakes | unit (fixture) | `node --test test/align.test.cjs` | ❌ W0 | ⬜ pending |
| ANLZ-01 | Double mark (zero-note pass) excluded from counts/denominators | unit (fixture) | `node --test test/aggregate.test.cjs` | ❌ W0 | ⬜ pending |
| ANLZ-03 | `align.js` / `aggregate.js` have no DOM, MIDI, or audio dependency | unit + static | `node --test test/align.test.cjs` (runs under plain Node) + `node scripts/check-run-path.cjs` | ✅ pattern | ⬜ pending |
| AGGR-01 slice | Counts/rates only over passes at the same BPM | unit (multi-pass fixture) | `node --test test/aggregate.test.cjs` | ❌ W0 | ⬜ pending |
| AGGR-03 slice | Painted notehead children actually change `fill` in a real render | browser (headless Chrome) | new paint-check script following `scripts/check-svg-map.cjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `docs/analysis-rules.md` — interpretation contract (D-21), before align code
- [ ] `test/align.test.cjs` — ANLZ-01 fixture scenarios
- [ ] `test/aggregate.test.cjs` — AGGR-01 pitch-only slice, D-14 denominator exclusion
- [ ] `test/fixtures/align/*.json` — one file per agreed scenario
- [ ] headless-Chrome paint check script — asserts child `fill` changed after marking

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
