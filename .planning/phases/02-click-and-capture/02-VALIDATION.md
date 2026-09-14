---
phase: "2"
slug: "click-and-capture"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-13"
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (Node built-in) |
| **Config file** | none — package.json "test" script |
| **Quick run command** | `node --test test/<changed>.test.cjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/<changed>.test.cjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 2 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | CAPT-01, CAPT-02, CAPT-05, HIST-01 | — | N/A | integration (real headless Chrome over CDP, fake MIDI input, reload) | `node scripts/check-capture-roundtrip.cjs` | ❌ created by this task | ⬜ pending |
| 2-01-02 | 01 | 1 | CAPT-01, CAPT-05, HIST-01 | — | N/A | unit (fake-indexeddb) | `node --test test/midi-capture.test.cjs test/storage.test.cjs` | ❌ created by this task | ⬜ pending |
| 2-02-01 | 02 | 2 | CAPT-03 | — | N/A | integration (click timeline + clock pairs after reload) | `node scripts/check-capture-roundtrip.cjs` | ✅ (extended) | ⬜ pending |
| 2-02-02 | 02 | 2 | CAPT-02, CAPT-03 | — | N/A | unit | `node --test test/clock.test.cjs test/metronome.test.cjs` | ❌ created by this task | ⬜ pending |
| 2-03-01 | 03 | 3 | CAPT-04, CAPT-05, HIST-01 | — | N/A | integration (pair marks, reload mid-session) | `node scripts/check-capture-roundtrip.cjs` | ✅ (extended) | ⬜ pending |
| 2-03-02 | 03 | 3 | CAPT-04 | — | N/A | unit | `node --test test/pass-marker.test.cjs test/pass-segmenter.test.cjs` | ❌ created by this task | ⬜ pending |
| 2-04-01 | 04 | 4 | CAPT-01..05, HIST-01 | — | N/A | gate | `npm test`; `node scripts/check-run-path.cjs --fixtures`; `node scripts/check-svg-map.cjs`; `node scripts/check-capture-roundtrip.cjs` | ✅ | ⬜ pending |
| 2-04-02 | 04 | 4 | CAPT-01, CAPT-02, CAPT-03 | — | N/A | manual (checkpoint:human-verify, blocking-human) | — | n/a | ⬜ pending |
| 2-04-03 | 04 | 4 | CAPT-04, CAPT-05, HIST-01 | — | N/A | manual (checkpoint:human-verify, blocking-human) | — | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/check-capture-roundtrip.cjs` — created by the plan 01 tracer (2-01-01), extended by 2-02-01 and 2-03-01; the end-to-end gate every wave runs
- [ ] `test/idb-node-env.cjs`, `test/midi-capture.test.cjs`, `test/storage.test.cjs` — created by 2-01-02 in the same task as the contracts they pin
- [ ] `test/clock.test.cjs`, `test/metronome.test.cjs` — created by 2-02-02
- [ ] `test/pass-marker.test.cjs`, `test/pass-segmenter.test.cjs` — created by 2-03-02
- [ ] Framework install: `npm install -D idb@8.0.3 fake-indexeddb@6.2.5` (2-01-02); node:test and the CDP headless pattern already exist from Phase 1

No separate Wave 0 plan: each test file is created inside the task whose code it pins, and every task carries a runnable `<automated>` verify from its first commit.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Notes played on the click read a near-zero median offset in the readout (MIDI clock vs AudioContext clock relationship) | CAPT-03, CAPT-02 (roadmap criterion 2) | Needs the real FP-60X, real audio output and human timing; headless Chrome has neither | Plan 04 Task 2, Scenario A steps 2-4: BPM 80, play C4 on the click 8 times, write down the median and both latency numbers |
| The click does not drift with the tab in the background for three minutes | CAPT-03 (PITFALLS 8, research P2-2) | Chrome's throttling policy is observable only in a real foreground/background switch over minutes | Plan 04 Task 2, Scenario A step 5 |
| MIDI permission remembered for the file:// origin across a full Chrome restart | CAPT-01 (research A1) | Site-settings persistence is Chrome-profile behaviour, not page code | Plan 04 Task 2, Scenario A step 6 (recorded either way) |
| A real 10+ pass drill is captured with nothing missing, the pedal never splits a pass, an abrupt tab close loses nothing | CAPT-04, CAPT-05, HIST-01 (roadmap criterion 5; the HIST-01 unclassified probe row) | Real hardware, real key pair, real process teardown | Plan 04 Task 3, Scenario B steps 1-6 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 2s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** {pending / approved YYYY-MM-DD}
