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
| 1-TBD | TBD | TBD | SCORE-03 | — | N/A | unit (fixture, real OSMD via jsdom) — per-rung note list matches expected | `node --test test/score-model.test.cjs` | ❌ W0 | ⬜ pending |
| 1-TBD | TBD | TBD | SCORE-03 | — | N/A | unit — exact whole-note→quarter-beat rational conversion | `node --test test/score-model.test.cjs` | ❌ W0 | ⬜ pending |
| 1-TBD | TBD | TBD | SCORE-03 | — | N/A | unit — tied pair collapses to one note with combined duration | `node --test test/score-model.test.cjs` | ❌ W0 | ⬜ pending |
| 1-TBD | TBD | TBD | SCORE-01 | — | N/A | unit (jsdom, no render) — load() succeeds with expected counts for each ladder file | `node --test test/score-model.test.cjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Planner fills concrete Task IDs / plans / waves.*

---

## Wave 0 Requirements

- [ ] `package.json` — devDependencies: jsdom (pin the version research validated)
- [ ] `test/osmd-node-env.cjs` — jsdom global-shim helper
- [ ] `test/score-model.test.cjs` — per-ladder-rung fixture tests
- [ ] `fixtures/01..05-*.musicxml` — the five ladder files
- [ ] `src/score-model.js` — pure extraction module

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
