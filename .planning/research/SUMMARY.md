# Project Research Summary

**Project:** Piano Mistakes
**Domain:** Browser-based MIDI piano practice feedback tool
**Researched:** 2026-09-13
**Confidence:** MEDIUM-HIGH

## Executive Summary

Piano Mistakes is a single-user browser-only practice tool analyzing MIDI input against MusicXML scores across repeated passages, showing aggregate mistake patterns on the score itself. No surveyed competitor distinguishes habits from one-off slips by aggregating across 20+ repetitions — this project's core value and genuine market gap.

Research recommends a pure analysis core (no DOM/audio dependencies) fed by capture adapters (Web MIDI, Web Audio metronome) and driving render adapters (OpenSheetMusicDisplay + annotation). This keeps alignment/metrics/aggregation unit-testable in Node and safely re-runnable as algorithms improve.

Primary technical risk: clock synchronization between Web MIDI timestamps and Web Audio scheduling. STACK.md asserts they share a time origin, but PITFALLS.md and ARCHITECTURE.md flag this as a failure point. Resolve empirically during metronome phase.

## Key Findings

### Recommended Stack
- OpenSheetMusicDisplay 2.1.2: Only library with native MusicXML parsing, VexFlow engraving, and per-note recoloring API
- Web MIDI API + Web Audio API (browser built-in)
- idb 8.0.3: IndexedDB wrapper
- No bundler required; dependencies load from CDN

### Expected Features

**Must-have:** Real notation, metronome, passage selection, hands-separate, wrong/missed/extra feedback, MIDI input, session history

**Differentiators:** Aggregation across 20+ reps, relative-dynamics detection, tempo-drift per bar, per-bar/per-note statistics with counts

### Architecture Approach

Pure analysis core with raw-event-first persistence. Major components: Score model, MIDI capture, Metronome/clock, Alignment engine, Metrics engine, Aggregator, Persistence, Annotation layer.

### Critical Pitfalls (Top 5)

1. Anchoring timing to first played note (prototype's actual failure) — Use metronome clock as ground truth
2. Assuming reference has one true tempo (prototype failure) — User-set metronome parameter only
3. Clock-domain mismatch between Web MIDI and Web Audio — Establish explicit conversion at startup. NOTE: Disagreement in research; resolve empirically.
4. Refusing to score wrong/missed/extra notes (prototype failure) — Sequence alignment with insertions/deletions
5. No visual on score (prototype's terminal failure) — Make score rendering with mistake marks earliest milestone

## Implications for Roadmap

### Suggested Seven-Phase Structure

**Phase 1: Score Rendering & Passage Selection** — Every component depends on it
**Phase 2: MIDI Capture & Metronome** — Forces empirical clock validation (research flag: 1-2 hour spike)
**Phase 3: Repetition Marking** — Trivial add-on, unblocks alignment
**Phase 4: Alignment & Annotation** — Validate algorithm in isolation (research flag: cost-weight tuning)
**Phase 5: Timing & Dynamics Metrics** — (research flag: explicit policy design before coding)
**Phase 6: Cross-Repetition Aggregation** — Product's core value
**Phase 7: Cross-Session History** — Purely additive

Each phase: vertical slice, tryable at piano, no infrastructure work before the loop works.

### Research Flags

- Phase 2: Resolve clock-domain disagreement empirically (1-2 hours at piano)
- Phase 4: Empirical cost-weight tuning via fixture strategy
- Phase 5: Explicit policy design for relative-dynamics comparison

## Confidence Assessment

| Area | Confidence |
|------|------------|
| Stack | MEDIUM-HIGH |
| Features | MEDIUM |
| Architecture | MEDIUM-HIGH |
| Pitfalls | HIGH |
| **Overall** | **MEDIUM-HIGH** |

### Gaps to Address
1. Clock-domain disagreement — settle empirically during Phase 2
2. Alignment cost weights — derive from Phase 4 fixture failures
3. Relative-dynamics policy — explicit design during Phase 5
4. User validation of differentiators — Phase 6 piano validation is real test

## Sources

**Primary (HIGH):** W3C Web MIDI/Web Audio specs, MDN, OSMD docs, npm registry, PROJECT.md prototype failures

**Secondary (MEDIUM):** Piano tool market research (6+ sources 2026), "Profy" DIS'26, ASAP dataset, Score-Following NIME 2003, web.dev scheduling patterns

**Tertiary (LOWER):** Sequence-alignment vs DTW tradeoff, MIDI velocity non-linearity

---

*Research completed: 2026-09-13*
*Ready for roadmap planning*
