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
| **Full suite command** | `npm test && node scripts/check-run-path.cjs --fixtures && node scripts/check-svg-map.cjs && node scripts/check-capture-roundtrip.cjs && node scripts/check-paint.cjs && node scripts/check-align-perf.cjs` |
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
| ANLZ-01 | Twelve hand-derived rung-1 fixtures: missing first note, late first note, whole bar one beat late, wrong E, octave slip, correction with extra at its gap, shifted start (five wrong), not-reached with grace boundary, origin after pass start, double mark | unit (fixture) | `node --test test/align.test.cjs test/align-fixtures.test.cjs` | ❌ 03-01 (fixtures + shape test), 03-02 (engine tests) | ⬜ pending |
| ANLZ-01 | A pass is judged only once final. Every final click prefix gives the same `Align.stableFields` as the full timeline (expectedTime of unreached slots excluded; the start 3600 / end 3800 tail case named). The 3000-click boundary test matches the reach formula. Per-event deviationMs; worked costs via totalCost | unit (fixture + property) | `node --test test/align.test.cjs` | ❌ 03-02 | ⬜ pending |
| ANLZ-01 | Repeated pitches unique / symmetric tie, and a messy pass with an ambiguous region. Late entry at any length: twelve notes one beat late, a stray C6 on the origin before it, the opening C4 missing, rung 1 three beats late, late with a wrong note, late and abandoned under both reach clocks. Restart / near miss / two runs. Tempo change inside a pass, and a BPM change on the first click after a pass. No origin, empty and beyond the timeline, repeated opening, non-attempt precedence | unit (fixture) | `node --test test/align.test.cjs test/align-fixtures.test.cjs` | ❌ 03-03 (28 fixtures) | ⬜ pending |
| ANLZ-01 | Analysis budget: typical pass ≤ 20 ms, a pass entering 16 beats late ≤ 60 ms, a 50-pass session ≤ 1500 ms | perf (node script) | `node scripts/check-align-perf.cjs` | ❌ 03-03 (re-run in every later gate) | ⬜ pending |
| ANLZ-01 | Rungs 1-2 through the real OSMD parser against an independent oracle: perfect, wrong pitch, omission with fixed end, one beat late, stray opening note then late. The user's reach decision is applied to `reachClock` | unit (ladder) | `node --test test/align-ladder.test.cjs test/align.test.cjs` | ❌ 03-06 | ⬜ pending |
| ANLZ-01 | Both hands one slot (rung 3 fixture); rung 3 through the ladder | unit (fixture + ladder) | `node --test test/align.test.cjs test/align-ladder.test.cjs` | ❌ 03-07 (29 fixtures) | ⬜ pending |
| ANLZ-01 | Rung 4: chords per notehead, re-strike with note-order permutations, rolled chord and window boundary, equidistant pairing ambiguous. Exact forced-label assignment with no cap: oversized fumble tokens (unique and tie), brute-force agreement on 200 seeded cases. Rung 4 through the ladder | unit (fixture + property + ladder) | `node --test test/align.test.cjs test/align-ladder.test.cjs` | ❌ 03-08 (32 fixtures) | ⬜ pending |
| ANLZ-01 | Rung 5 through the ladder: five cases, interpolation anchors 2250 / 3750 / 5250 / 5500, 60 BPM, repeated bass G3 assigned by timing | unit (ladder) | `node --test test/align-ladder.test.cjs` | ❌ 03-09 | ⬜ pending |
| ANLZ-01 | Double mark (zero-note pass) excluded from counts/denominators; tempo-changed passes outside every group | unit (hand-built PassResults) | `node --test test/aggregate.test.cjs` | ❌ 03-02 | ⬜ pending |
| ANLZ-03 | `align.js` / `aggregate.js` have no DOM, MIDI, or audio dependency | unit + static | `node --test test/align.test.cjs` (plain Node) + `node scripts/check-run-path.cjs` + a comment-stripped negative grep in 03-02/03-03/03-08 acceptance criteria | ✅ pattern | ⬜ pending |
| AGGR-01 slice | Counts/rates only over passes at the same BPM. Per-note wrong/missed/assessed/unassessed-by-reason. Gap counts with unassessedPasses and lowerBoundPasses (no-extra gaps next to ambiguous notes are unassessed; counted extras there say "at least"), with lowerBoundPasses ≤ passesWithExtra ≤ assessedPasses. Colour rule; sentence templates | unit | `node --test test/aggregate.test.cjs` | ❌ 03-02 (messy fold in 03-03) | ⬜ pending |
| AGGR-03 slice | Glyph placement rule (same system, system break, first, last, within) | unit (pure geometry) | `node --test test/paint.test.cjs` | ❌ 03-04 | ⬜ pending |
| AGGR-03 slice | In a real headless-Chrome render: painted notehead children change `fill`; a pass stays pending until its clicks exist; detail sentences regenerate. Reopening the same file during capture keeps painting; a piece switch never paints the wrong score. Single-pass view and back; extra glyphs with counts and geometry; tempo selector and an after-mark BPM change; resize and reload survival with reconciled counts. Each OK line printed as its group passes | browser (headless Chrome) | `node scripts/check-paint.cjs` (seven OK lines after 03-02, ten after 03-04) | ❌ 03-01 (harness, red) → 03-02 / 03-04 (green) | ⬜ pending |
| AGGR-03 slice | Phase 2 capture regression tolerates only the analysis-status pass-list suffixes; raw-storage and restore assertions unchanged | browser (headless Chrome) | `node scripts/check-capture-roundtrip.cjs` | ✅ exists, amended in 03-04 Task 1 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `docs/analysis-rules.md` — interpretation contract (D-21), before align code (03-01 Task 1)
- [ ] `test/fixtures/align/*.json` — twelve rung-1 fixtures (03-01 Task 2); sixteen more in 03-03 (28), one in 03-07 (29), three in 03-08 (32 total)
- [ ] `test/align-fixtures.test.cjs` — fixture shape validation, green with no engine (03-01 Task 2)
- [ ] `scripts/check-paint.cjs` + `npm run check:paint` — headless-Chrome paint check, red by design until 03-02 (03-01 Task 3)
- [ ] `test/align.test.cjs` — ANLZ-01 fixture scenarios (03-02, extended in 03-03, 03-07 and 03-08)
- [ ] `test/aggregate.test.cjs` — AGGR-01 pitch-only slice, D-14 denominator exclusion, gap invariant, D-19 sentences (03-02)
- [ ] `test/paint.test.cjs` — glyph placement rule (03-04 Task 2)
- [ ] `test/align-ladder.test.cjs` — the rungs through the real parser against an independent oracle, one rung per plan (03-06 rungs 1-2, 03-07 rung 3, 03-08 rung 4, 03-09 rung 5)
- [ ] `scripts/check-align-perf.cjs` — analysis time budget (03-03 Task 2)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Marks match what was actually played | ANLZ-01, AGGR-03 slice | Real FP-60X hardware round trip | One build-then-check checkpoint per rung, in ladder order. Rung 1 in 03-05: every rung-1 rule, including a doubled E and a within-pass tempo change. Rung 2 in 03-06, rung 3 in 03-07. Rung 4 in 03-08: chords, the equidistant chord, and roll timing read from stored timestamps. Rung 5 in 03-09: late, wrapped, repeated G3. Each with a clean pass + a deliberately wrong pass |
| Reach rule for a late, abandoned pass (D-11, user decision pending) | ANLZ-01 | A policy choice only the user can make | 03-05 Task 2 step 9: the late-and-abandoned bar under `reachClock 'origin'`; the user answers "reach: origin" or "reach: reading"; 03-06 Task 1 applies it |
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
