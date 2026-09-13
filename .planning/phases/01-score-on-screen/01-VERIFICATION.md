---
phase: 01-score-on-screen
verified: 2026-09-13T23:36:50Z
status: passed
score: 4/4 roadmap success criteria verified; 12/12 merged plan truths verified
covered_files:
  - .planning/phases/01-score-on-screen/01-01-PLAN.md
  - .planning/phases/01-score-on-screen/01-01-SUMMARY.md
  - .planning/phases/01-score-on-screen/01-02-PLAN.md
  - .planning/phases/01-score-on-screen/01-02-SUMMARY.md
  - .planning/phases/01-score-on-screen/01-03-PLAN.md
  - .planning/phases/01-score-on-screen/01-03-SUMMARY.md
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - package.json
  - index.html
  - src/score-model.js
  - src/inspect-table.js
  - src/score-renderer.js
  - test/osmd-node-env.cjs
  - test/score-model.test.cjs
  - test/fixtures/tie.musicxml
  - scripts/check-run-path.cjs
  - scripts/check-svg-map.cjs
  - scripts/build-rung5.cjs
  - fixtures/01-right-hand.musicxml
  - fixtures/02-left-hand.xml
  - fixtures/03-both-hands.musicxml
  - fixtures/04-chords.musicxml
  - fixtures/05-yanni-4-measures.musicxml
  - fixtures/05-yanni-4-measures.mxl
  - fixtures/README.md
  - README.md
covered_digest: "v1:sha256:2066d523d78bf75ec3f11921641f747558fd9cdaa47dbf16f0bf9474517a138d"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 1: Score on Screen Verification Report

**Phase Goal:** User can open a tiny MusicXML exercise and see it as real notation, with every note modelled precisely enough that alignment can be built on it (ROADMAP.md). Mode: mvp; user-story form: "As a pianist practising alone, I want to open a tiny MusicXML exercise and see it as real notation, so that every note is modelled precisely enough that alignment can be built on it."
**Verified:** 2026-09-13T23:36:50Z
**Status:** passed
**Re-verification:** No — initial verification

**covered_digest provenance note:** `gsd-tools.cjs` could not be located in this environment (checked repo-relative `gsd-core/bin/`, `.claude/gsd-core/bin/`, the global `@opengsd` npm package directory — installed but empty at the version present, and a bounded filesystem search). `covered_digest` above is a sha256 over `path:sha256(content)` pairs for every file in `covered_files`, sorted in the listed order, computed directly with `sha256sum` rather than the canonical `verification.fingerprint` verb. Flagged here so a future re-verification with working tooling can recompute and compare rather than silently trusting a hand-rolled value.

## User Flow Coverage (MVP mode)

User story: «As a pianist practising alone, I want to open a tiny MusicXML exercise and see it as real notation, so that every note is modelled precisely enough that alignment can be built on it.»

| Step | Expected | Evidence | Status |
|------|----------|----------|--------|
| Open the app | Double-click `index.html`, no server/build | `index.html` — classic scripts only, `grep -v '<!--' index.html \| grep -c 'type="module"'` = 0; OSMD loaded from pinned jsDelivr CDN URL (1 occurrence) | ✓ |
| Load a MusicXML file | "Open MusicXML" file input accepts `.musicxml/.xml/.mxl`, renders real notation | `index.html` (`id="pieceFile" accept=".musicxml,.xml,.mxl"`) → `src/score-renderer.js:openFile/loadPiece` → `OSMD.OpenSheetMusicDisplay(...).load(file)`; confirmed live for all 5 ladder files + both `.mxl` files + a real MuseScore export in the at-the-piano checkpoint (01-03-SUMMARY.md, user response "Approved") | ✓ |
| See every note modelled | Stable id, measure/staff/voice/onset/duration/pitch/resolved ties, inspectable | `src/score-model.js:extract/deriveNoteId/walkNotes`; rendered via `src/inspect-table.js` into the on-page table; asserted by 21/21 `node --test` fixture tests including tie resolution and a 3-segment chain | ✓ |
| Outcome: notation trustworthy enough for later alignment | Every note maps 1:1 to its own rendered notehead, self-verified, survives resize, recovers from a bad file | `src/score-renderer.js:buildSvgMap/verifySvgMap/renderAndMap`; `node scripts/check-svg-map.cjs` reports `map OK` for all six ladder files in real headless Chrome (re-run below); resize-per-rung and invalid-file recovery both confirmed at the piano | ✓ |

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User opens a `.musicxml`, `.xml`, or `.mxl` file and sees it rendered as real notation in Chrome; whole file is the passage, no bar selection | ✓ VERIFIED | `index.html` file input `accept=".musicxml,.xml,.mxl"`; no bar-selection/highlight code anywhere (`grep -ci "start.*bar\|end.*bar\|bar.*select\|highlight"` = 0 across `index.html` and `src/*.js`); rendered for rung 2 (`.xml`) and rung 5 (`.mxl`, both the ladder file and a real MuseScore export) at the piano, "Approved" |
| 2 | Every note carries stable id + measure, staff, voice, onset in beats, duration, pitch, resolved ties — inspectable | ✓ VERIFIED | `src/score-model.js` (`deriveNoteId`, exact-rational `onset`/`duration`, tie folding via `NoteTie.StartNote`); rendered per-row in `src/inspect-table.js`; 21/21 `node --test` including duplicate-id rejection, DOM-free extraction, and the 3-segment tie chain |
| 3 | Five-file verification ladder exists in the repo and every file renders with the right notes on the right staff | ✓ VERIFIED | `fixtures/01..05-*` + `fixtures/05-yanni-4-measures.mxl`, all `git ls-files`-tracked; `node scripts/check-svg-map.cjs` (re-run below) prints all six `OK ... map OK` lines; content spot-checked and confirmed by the user at the piano against `fixtures/README.md` |
| 4 | User sat at the FP-60X with the laptop and loaded each ladder file | ✓ VERIFIED | `.planning/phases/01-score-on-screen/01-03-SUMMARY.md`, blocking `checkpoint:human-verify` task, user's verbatim response "Approved" — covering all five rungs (steps 2a-2d), both `.mxl` files, a real MuseScore export, and invalid-file recovery |

**Score:** 4/4 roadmap success criteria verified (0 present-but-behavior-unverified)

### Merged Plan Must-Have Truths (01-01, 01-02, 01-03 frontmatter, deduplicated against the above)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 5 | Score model extraction proven through the real OSMD 2.1.2 parser with exact rationals, structural ids, MIDI/octave pins, JSON purity | ✓ VERIFIED | `test/score-model.test.cjs` (21 tests); re-run: `node --test "test/*.test.cjs"` → `# pass 21`, `# fail 0` |
| 6 | Chord notes never share one mapped SVG element; `verifySvgMap()` catches duplicates, non-noteheads, missing notes, chord y-order violations | ✓ VERIFIED | `src/score-renderer.js`: `getNoteheadSVGs`×1, `vfnoteIndex`≥2, `isConnected`≥1, `getSVGGElement`=0 (shared group never used); rung 4 (chords) and rung 5 (two-note chords) both report `N/N ... map OK` in real headless Chrome |
| 7 | `scripts/check-svg-map.cjs` drives real headless Chrome via DevTools protocol and proves the map for every ladder file including a forced resize re-render | ✓ VERIFIED | Re-run in this verification: 6/6 `OK` lines, all `map OK`, render count 2 per file (script requires `renderCount === '2'` for a PASS) |
| 8 | jsdom global shim uses `Object.defineProperty` with descriptor-preserving restore (Node 24 getter-only `navigator`) | ✓ VERIFIED | `test/osmd-node-env.cjs`: `Object.defineProperty(globalThis`≥1, `getOwnPropertyDescriptor`≥1, `restore`≥1, no bracket-assignment form; nested install/restore round-trip test passes |
| 9 | Score model is plain JSON data with no OSMD object reachable | ✓ VERIFIED | Test "the model is plain JSON data": `JSON.parse(JSON.stringify(model))` deep-equals model — passing |
| 10 | Note ids are structural (`m{bar}-s{staff}-v{voice}-b{num}_{den}-p{midi}`), reproducible across extractions | ✓ VERIFIED | `src/score-model.js:deriveNoteId`; "extracting the same file twice yields identical ids" test passing; rung-5 41-id array matches literally |
| 11 | Onset/duration are exact reduced rationals, never floats | ✓ VERIFIED | `toQuarterBeats`/`addRationals`/`compareRationals` tests including the 12/8 → 6/1 edge case; `grep -c 'RealValue' src/score-model.js` = 0 |
| 12 | Concurrent/failed load handling: second selection during load ignored, failed load shows a toast and clears state, next load works | ✓ VERIFIED | `src/score-renderer.js:openFile` (`if (!file \|\| S.loading) return;`) and `loadPiece` catch block (resets `S`, clears notation/table, sets "No piece loaded", toasts); confirmed at the piano (step 5, "Approved") |
| 13 | Resize re-renders and rebuilds the map from retained source notes without re-extracting the model | ✓ VERIFIED | `addEventListener('resize'` = 1 in `src/score-renderer.js`, calls `renderAndMap()` which calls `buildSvgMap()` from `S.sourceNotes`, not `ScoreModel.extract` (`ScoreModel.extract(` = 1 total, only in `loadPiece`); confirmed on every rung at the piano |
| 14 | Whole file is the passage — no bar/hand/staff filter UI, nothing stored/restored across reload | ✓ VERIFIED | No `localStorage`/`indexedDB` reference anywhere in `src/*.js` or `index.html` (0 matches); no bar-selection markup |
| 15 | Every automated verify command runs identically from PowerShell/cmd/Git Bash | ✓ VERIFIED | `npm test`, `node scripts/check-run-path.cjs [--fixtures]`, `node scripts/check-svg-map.cjs` — all plain node/npm invocations, re-run successfully in this session |
| 16 | `fixtures/README.md` gives the user an exact, checkable manifest (status lines, fingerprint explanation, resize-every-rung instruction) | ✓ VERIFIED | `fixtures/README.md` present and tracked; contains all six expected status-line substrings, "Notehead column" explanation, "every rung" resize instruction (all required greps ≥1) |

**Score:** 12/12 merged plan truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/score-model.js` | Pure OSMD-sheet → plain-data score model | ✓ VERIFIED | Exports present (`ScoreModel.extract` etc.), no import/export syntax, no DOM reference |
| `src/score-renderer.js` | File load/render, per-notehead SVG map, self-check, resize, dev hook | ✓ VERIFIED | All required symbols present and wired (see truths 6-7, 12-13) |
| `src/inspect-table.js` | Note table with per-row fingerprint | ✓ VERIFIED | `replaceChildren`≥1, `MISSING`≥1, `svgRefs`≥1 |
| `index.html` | Double-click entry point, classic scripts, OSMD from CDN | ✓ VERIFIED | 0 module-type scripts, 1 pinned CDN URL, 3 local scripts in dependency order |
| `fixtures/01..05-*` + `.mxl` | Six ladder files | ✓ VERIFIED | All `git ls-files`-tracked, all render `N/N ... map OK` |
| `test/score-model.test.cjs` | 21 fixture/contract tests | ✓ VERIFIED | `# pass 21`, `# fail 0` on live re-run |
| `test/osmd-node-env.cjs` | Descriptor-preserving jsdom shim | ✓ VERIFIED | See truth 8 |
| `scripts/check-run-path.cjs` | Shell-neutral static run-path gates | ✓ VERIFIED | 22 gates, 0 failed on live re-run (with `--fixtures`) |
| `scripts/check-svg-map.cjs` | Headless-Chrome notehead map proof | ✓ VERIFIED | 6/6 `OK` lines on live re-run |
| `scripts/build-rung5.cjs` | Reproducible rung-5 build from the user's `.mscz` | ✓ VERIFIED | `execFileSync`≥2, `mkdtempSync`, `copyFileSync`≥2, `Validation failed` present (per 01-02-SUMMARY, ran successfully, validated 4 measures/41 pitches/PK signature) |
| `fixtures/README.md` | Human-readable ladder manifest | ✓ VERIFIED | Present, tracked, content matches manifest requirements |

### Key Link Verification

| From | To | Via | Status |
|------|-----|-----|--------|
| `index.html` | `src/score-renderer.js` | classic script tag, dependency order after `score-model.js`/`inspect-table.js` | ✓ WIRED |
| `src/score-renderer.js` | `src/score-model.js` | `ScoreModel.extract(osmd.Sheet, { onNote })` once per load | ✓ WIRED |
| `src/score-renderer.js` | OSMD UMD global | `OSMD.OpenSheetMusicDisplay`, `EngravingRules.GNote(note).getNoteheadSVGs()[vfnoteIndex]` | ✓ WIRED |
| `src/score-renderer.js` | `src/inspect-table.js` | `InspectTable.render(S.model, S.svgMap, S.svgRefs)` on every render and on load failure | ✓ WIRED |
| `#pieceFile` change event | `openFile` → `loadPiece` | `addEventListener('change', openFile)` | ✓ WIRED |
| `window` resize event | `renderAndMap` | debounced `addEventListener('resize', ...)` | ✓ WIRED |
| `scripts/check-svg-map.cjs` | `index.html` | headless Chrome DevTools protocol, `?fixture=...&resize=1` | ✓ WIRED (re-run passing) |

### Behavioral Spot-Checks / Probe Execution

| Command | Result | Status |
|---------|--------|--------|
| `npm test` (`node --test "test/*.test.cjs"`) | `# pass 21`, `# fail 0` | ✓ PASS |
| `node scripts/check-run-path.cjs --fixtures` | 22 gates, 0 failed | ✓ PASS |
| `node scripts/check-svg-map.cjs` (all six ladder files, real headless Chrome) | 6/6 `OK ... map OK` lines, exact text matching what SUMMARY.md claimed | ✓ PASS |

All three commands were re-run live by this verifier (not taken on SUMMARY's word) and produced output identical to what 01-01/01-02/01-03 SUMMARY.md claimed.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SCORE-01 | 01-01, 01-02, 01-03 | Open MusicXML/.xml/.mxl, see real notation in Chrome | ✓ SATISFIED | Truths 1, 6-7, 12-13; live headless + human checkpoint |
| SCORE-03 | 01-01, 01-02, 01-03 | Score model carries measure/staff/voice/onset/duration/pitch/ties | ✓ SATISFIED | Truths 2, 5, 8-11 |

No orphaned requirements: `.planning/REQUIREMENTS.md` traceability table maps only SCORE-01 and SCORE-03 to Phase 1, both claimed by plan frontmatter and both satisfied.

### Anti-Patterns Found

None. Scanned `src/*.js`, `index.html`, `scripts/*.cjs`, `test/*.cjs`, `fixtures/README.md` for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` and stub-returns (`return null`, hardcoded empty arrays flowing to render, `localStorage`/`indexedDB`, drag-and-drop, bar-selection UI) — zero matches. No debt markers, no stubs.

### Human Verification Required

None outstanding. The phase's one required human item — the blocking at-the-piano checkpoint (VRFY-01) — was already completed: `.planning/phases/01-score-on-screen/01-03-SUMMARY.md` records the user's verbatim "Approved" response, explicitly covering all five rungs' visual correctness (2a), exact status lines (2b), table/fingerprint correctness (2c), resize-per-rung (2d), both `.mxl` files, a real MuseScore export, and invalid-file recovery. This satisfies ROADMAP success criterion 4 and the project-wide VRFY-01 constraint for this phase; nothing in this phase's scope was left unaddressed by that checkpoint.

### Gaps Summary

None. All ROADMAP success criteria and all merged plan must-haves are verified against live re-execution of the phase's own automated gates (not SUMMARY.md's word alone), and the required human checkpoint was already completed and approved. No debt markers, no stubs, no unwired artifacts, no orphaned requirements.

---

*Verified: 2026-09-13T23:36:50Z*
*Verifier: Claude (gsd-verifier)*
