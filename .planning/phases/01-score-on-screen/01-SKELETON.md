# Walking Skeleton — Piano Mistakes

**Phase:** 1
**Generated:** 2026-09-13

## Capability Proven End-to-End

A pianist double-clicks index.html in Chrome, opens a tiny MusicXML exercise, sees it as real notation, and can read every note of the app's own score model (bar, staff, voice, onset, duration, pitch, MIDI, tie) in a table under the score — with every model note mapped to its rendered notehead.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | None. Plain classic-script JavaScript (`'use strict'` IIFEs on `globalThis`), one `index.html`, no bundler, no TypeScript build | PROJECT constraint "no build step required to run"; the prototype lost sessions to infrastructure. Classic scripts are also the only local-file loading mode Chrome allows from `file://` (ES-module imports of sibling files are blocked by CORS), and they `require()` cleanly from node:test (prototype `piano-core.js` pattern). D-13. |
| Notation renderer / parser | OpenSheetMusicDisplay 2.1.2, UMD build loaded by a classic `<script>` from `https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@2.1.2/build/opensheetmusicdisplay.min.js` (exposes `window.opensheetmusicdisplay`) | Only library that parses MusicXML and `.mxl` natively and exposes per-note SVG access (`EngravingRules.GNote(note).getSVGGElement()`) without re-render. CDN keeps the shipped app dependency-free; the same pinned file is a devDependency for tests. CLAUDE.md stack decision. |
| Score model (the persisted contract) | App-owned plain JSON, schema v1: `{ schemaVersion, title, measures[{ number, start, length, timeSignature }], notes[{ id, staff, voice, measure, onset, duration, pitch{ name, midi }, tiedNoteCount }] }`; every rational is `{ num, den, beats }` in quarter-note beats; ids are structural `m{bar}-s{staff}-v{voice}-b{num}_{den}-p{midi}`; tied continuations are folded into their start note | D-08/D-09/D-10 (one-way: Phases 2-7 serialise this shape). Extracted once per load from `osmd.Sheet` by one pure walk; OSMD objects never leak into the model, analysis, or storage. OSMD `Fraction` is whole-note based, so beats = `GetExpandedNumerator() * 4 / Denominator` reduced; MIDI = `halfTone + 12`; pitch name = `Pitch.ToStringShort(3)`. |
| Renderer-owned map | `Map<noteId, SVGGElement>` rebuilt after every `render()` (load and window resize) from a retained `Map<noteId, OSMD Note>`; only `isConnected` elements count | D-11/D-16: later phases paint noteheads without re-rendering; the count is shown in the UI so completeness is inspectable, not assumed. |
| Data layer | **N/A this phase, by design.** Phase 1 has no persistence requirement (D-15). The plain-JSON model is the honest equivalent of a "write": it round-trips `JSON.parse(JSON.stringify(model))` unchanged, which is exactly what Phase 2 will put into IndexedDB via `idb` (HIST-01). | Inventing storage now would pre-empt Phase 2's decision on record shapes (sessions, repetitions, raw MIDI events) with no user value in this phase. |
| Auth | N/A — single user, browser-only, no server, no accounts (PROJECT constraint) | Nothing to authenticate; file export/import is the "sync". |
| Deployment target | Local file: double-click `C:\Code\Piano Mistakes\index.html` in Chrome on the Windows 11 laptop (`file://`); internet required on the first open only (CDN fetch, then cached) | The one environment that will be used; zero friction per session. No dev server, no static server needed. Documented in README "Run". |
| Test runner | `node:test` + jsdom 29.1.1 driving the **real** OSMD parser (`osmd.load()` only, never `render()`) with the ladder MusicXML files as fixtures | Zero-dependency runner matching the no-build philosophy; real-parser fixtures caught the whole-note-unit surprise a hand mock never would. `render()` cannot run under jsdom, so visual correctness is checked at the piano (VRFY-01). |
| Directory layout | `index.html` (entry), `src/score-model.js` (pure), `src/inspect-table.js` (DOM from plain model), `src/score-renderer.js` (OSMD + file input + map), `fixtures/0N-*.musicxml` (ladder, also test fixtures), `test/*.test.cjs` + `test/osmd-node-env.cjs` + `test/fixtures/`, `scripts/` (dev tooling such as `build-rung5.cjs`), `package.json` (devDependencies only) | Keeps the prototype's proven split (pure core / app / one HTML) and lets later phases add `src/midi-capture.js`, `src/metronome.js`, `src/alignment.js`, `src/storage.js` as sibling classic scripts with their own `test/*.test.cjs`. |

## Stack Touched in Phase 1

- [x] Project scaffold — `package.json` (dev-only), `npm test`, `.gitignore` already excludes `node_modules/`; no lint step (none required to run; optional later)
- [x] Routing — N/A by design: a single page opened from `file://`; there is exactly one "route" (`index.html`) and no navigation
- [x] Database — N/A by design this phase (see Data layer row); the plain-JSON model round-trip is the read/write proof; real IndexedDB lands in Phase 2 (HIST-01)
- [x] UI — `<input type="file">` → `osmd.load(File)` → `render()` → `ScoreModel.extract(sheet)` → inspect table + N/N mapped status; window resize re-renders and rebuilds the map
- [x] Deployment — documented local run: double-click `index.html` in Chrome (README "Run"); first open needs internet for the pinned CDN library

## Out of Scope (Deferred to Later Slices)

- Bar / passage selection, highlighting, bar-number fields (Phase 6, SCORE-02); the whole file is the passage through Phase 5 (D-01)
- Hand/staff filtering (v2 SCORE-04) — the model carries `staff` and `voice` so it is a filter later, not a remodel
- Repeat signs, endings, pickup bars, grace notes, tuplets — no handling; the app renders whatever OSMD renders (D-02)
- MIDI input, metronome, pass marking, IndexedDB persistence (Phase 2); alignment and mistake marking (Phase 3+); painting noteheads (Phase 3+ uses the map built here)
- Drag-and-drop file opening; remembering the last-opened piece (D-14, D-15)
- Zoom, page layout options, title editing (D-16)
- Any server, bundler, TypeScript build, or framework

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- Phase 2: pick the FP-60X as a Web MIDI input, hear a Web Audio click at a set BPM, mark passes, and persist piece + repetitions + raw events in IndexedDB (`src/midi-capture.js`, `src/metronome.js`, `src/storage.js`); the score model's `measures[].start` and `timeSignature` give the expected timeline
- Phase 3: align one pass to `model.notes` (pure `src/alignment.js`, fixture-tested on the same ladder files) and paint wrong/missed/extra onto noteheads through the `noteId → SVGGElement` map
- Phase 4: onset deviation per note against the click, painted alongside Phase 3 marks
- Phase 5: aggregate across passes; colour by dominant mistake and rate; hover detail
- Phase 6: real pieces and bar selection as a slice over `model.measures` / `model.notes`
- Phase 7: sessions across days, export/import of the whole IndexedDB history as one file
