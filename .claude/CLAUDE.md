<!-- GSD:project-start source:PROJECT.md -->

## Project

**Piano Mistakes**

A local browser app for a pianist with a USB MIDI piano. You load a piece, choose a passage, play it many times to a metronome, and the app marks up the actual sheet music with the mistakes you keep making: wrong, missed, and extra notes, early or late notes, bars where you slow down, and notes you hit harder or softer than their neighbours. It replaces a tutor saying "you keep doing X in bar 12", for one person practicing alone.

**Core Value:** After many repetitions of a passage, the score shows the handful of spots and habits worth working on, with enough repetitions behind each one that the pianist trusts it.

### Constraints

- **Platform**: Chrome on Windows 11 laptop with Web MIDI — the one environment that will actually be used; no need for Safari or iOS support in milestone 1
- **Architecture**: Browser-only, no server, no build step required to run — keeps the friction of opening it every session near zero; the prototype showed how much time infrastructure eats
- **Data**: Local browser storage plus file export/import — no accounts or sync; history must survive a browser reset via export
- **Verification**: Every phase must be tried at the piano by the user before it counts as done — the prototype was never played once
- **Input format**: MusicXML only for milestone 1 — avoids MIDI-to-notation conversion, which is lossy and hard

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **OpenSheetMusicDisplay (OSMD)** | 2.1.2 | MusicXML/MXL → SVG notation renderer | Only library in this space that (a) parses MusicXML natively — including compressed `.mxl` via an internal JSZip-based unzip on `load()`, (b) engraves via VexFlow so it inherits VexFlow's mature multi-voice/multi-staff/grace-note/tie engraving instead of reinventing it, and (c) ships a purpose-built interactivity surface: `Cursor.Iterator` for note-by-note traversal with per-note timestamps, and `GraphicalNote.setColor()` / `getSVGGElement()` / `getNoteheadSVGs()` for recoloring individual noteheads, stems, and beams **without a full re-render**. That last point is load-bearing for this project — the whole UI loop is "render once, recolor hundreds of noteheads per session as aggregate mistake data updates." No other option below has this as a first-class, documented feature. |
| **Web MIDI API** (browser built-in) | N/A | MIDI input capture (note-on/off, velocity, timing) | Native to Chrome on Windows, exactly the constraint given. No library needed or wanted — wrapping it adds indirection for zero benefit at this scale. `MIDIMessageEvent.timeStamp` is a `DOMHighResTimeStamp` on the **same time origin as `performance.now()`**, which is the fact that makes MIDI timing directly comparable to Web Audio scheduling (see below) without a manual clock-sync step. |
| **Web Audio API** (browser built-in) | N/A | Metronome click scheduling, precise audio timing | Native to Chrome. The standard pattern (not a library — hand-rolled, ~60-100 lines) is Chris Wilson's "A Tale of Two Clocks": a `setTimeout` loop polling every ~25ms schedules click sounds against `audioContext.currentTime` roughly 100ms ahead, because `AudioContext.currentTime` is the actual sample-accurate clock the audio hardware plays against, while `setTimeout`/`setInterval` alone drift by tens of milliseconds under JS event-loop load. This is the only technique that keeps a metronome tight enough to judge "early/late" against. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **idb** | 8.0.3 | Thin Promise wrapper over IndexedDB | Persisting per-piece practice history (many sessions × many repetitions × per-note mistake tallies) across browser restarts. Use this, not raw `indexedDB.open()` callbacks — the callback API is painful enough that hand-rolling it is a false economy even in a "no framework" project. ~1.2KB brotli'd, loadable straight off a CDN as an ES module with zero build step (`https://cdn.jsdelivr.net/npm/idb@8/+esm`). |
| **File System Access API** (browser built-in, Chrome only) or a plain `<a download>` + `Blob` fallback | N/A | Export/import history as a file (survive a browser reset, per the constraint) | Use `showSaveFilePicker`/`showOpenFilePicker` where available (Chrome on Windows — the one target environment) for a real "save/load" dialog; fall back to `Blob` + `URL.createObjectURL` + a synthetic `<a>` click for export, and a plain `<input type="file">` for import. No library needed — this is a handful of native calls. |
| **fflate** | 0.8.3 | Only if you ever need to *read* `.mxl` bytes yourself (outside OSMD's own loader) | Not needed for rendering — OSMD unzips `.mxl` internally. Reach for this only if the analysis/parsing layer needs the raw MusicXML string independently of OSMD's load path (see Architecture note below). Prefer `fflate` over `jszip` if you do: ~8KB vs ~100KB, same job, no build-step penalty since both are CDN-loadable, but fflate is meaningfully smaller to fetch on every cold open. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **`node:test`** (Node.js built-in, stable since Node 20) | Unit tests for pure logic: MIDI-to-score alignment, mistake classification, aggregation math, metronome scheduling math | Zero dependencies, runs `.js` files directly with no build step — matches the "no build step to run" constraint for the *app*, and extends the same philosophy to its tests. Handles mocking, fake timers, watch mode, and coverage (`node --test --experimental-test-coverage`) without adding a devDependency. The alignment/scoring engine is pure data-in/data-out logic (MIDI events + score model → mistake list) with no DOM dependency, so it is exactly node:test's sweet spot. |
| **Playwright** (`@playwright/test`) | 1.63.0 | End-to-end tests: load a MusicXML file, drive a fake Web MIDI device, assert the score gets annotated | Playwright has no dedicated Web MIDI automation API (it's a non-standard/experimental browser API), so the standard approach is to mock it: use `page.addInitScript()` to install a fake `navigator.requestMIDIAccess` / `MIDIAccess` / `MIDIInput` before the page's own scripts run, then drive fake `MIDIMessageEvent`s from the test via `page.evaluate()`. This tests the app's MIDI-handling and rendering code paths in a real Chrome/Chromium instance without needing a physical piano or a virtual MIDI loopback driver in CI. Reserve a manual/at-the-piano checklist (already a project constraint) for real hardware verification — Playwright covers the software logic, not the hardware round-trip. |

## Installation

# Path A — zero install, CDN-only, open index.html directly or via a trivial static server

# In your HTML/JS, import straight from a CDN that serves ESM (jsDelivr's `+esm` endpoint

# wraps UMD/CJS packages like OSMD into a real ES module on the fly):

#

#   import OpenSheetMusicDisplay from "https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@2.1.2/+esm";

#   import { openDB } from "https://cdn.jsdelivr.net/npm/idb@8/+esm";

#

# No npm install needed at all for the shipped app.

# Path B — local node_modules for editor autocomplete / offline dev / tests, still no bundler

# Dev dependencies (test tooling only — never shipped to the browser)

# node:test ships with Node.js — nothing to install

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| OpenSheetMusicDisplay | **VexFlow** (5.0.0) directly | Never for this project — VexFlow has **no official MusicXML importer**; you'd depend on a third-party, less-maintained converter (`vexflow-musicxml`, or the newer `vexml`/`@stringsync/vexml`, actively updated but still pre-1.0-grade maturity for arbitrary real-world scores) to do what OSMD already does natively and battle-tested. Only reconsider VexFlow directly if you outgrow OSMD's engraving/styling flexibility and are willing to hand-write a MusicXML→VexFlow layer yourself — not justified for milestone 1. |
| OpenSheetMusicDisplay | **alphaTab** (1.8.4) | If the project pivots toward guitar tab or needs a bundled MIDI synthesizer/audio playback of the *score itself* (alphaTab ships `alphaSynth`, a full softsynth + SoundFont player). Its MusicXML import is rated "Mature, good test coverage" by its own docs and it does render piano grand staff, but it's built around Guitar Pro-style tab + playback, not around fine-grained per-note recoloring for an external annotation UI, and it drags in a synth/soundfont you don't need (you already have a real piano). MPL-2.0 licensed — compatible, but the extra weight isn't bought back by anything this project needs. |
| OpenSheetMusicDisplay | **Verovio** (6.3.0) | If you need MEI/Humdrum support or extremely complex scholarly engraving (early music, critical editions). Verovio is a C++-compiled-to-WASM toolkit; the npm package unpacks to **~27MB** (WASM binary + fonts), and its SVG output is highlightable via `data-*` attributes it stamps on elements — technically workable for coloring, but there's no equivalent of OSMD's `Cursor`/`GraphicalNote` interactivity layer; you'd be doing manual `querySelector` + `data-id` plumbing yourself for both coloring and note-to-time mapping. Much heavier for zero added value here. |
| Hand-rolled Web Audio "two clocks" scheduler | A scheduling/sequencer library (Tone.js, etc.) | Only if the metronome needs to grow into a full sequencer (varying time signatures mid-piece, swing, sample-based click sounds with layered polyrhythms, etc.). Tone.js is a large dependency (~200KB+) to buy a technique that is ~80 lines of well-documented vanilla code for a single steady click. Not justified for "play a click at a set tempo." |
| idb | **Dexie.js** (4.4.6) | If the history model grows into something that needs real queries — "all sessions in the last 30 days where bar 12 was a mistake," compound indexes, live queries, etc. Dexie's fluent query API earns its weight once you're filtering/joining across stores; for milestone 1 (a handful of stores: pieces, sessions, per-note aggregates) plain `idb` keeps the dependency and the mental model smaller. Revisit if/when the "shrink over weeks" trend view (in Context) needs non-trivial querying. |
| localStorage (not recommended as primary store) | — | Only for tiny UI preferences (last-used tempo, last-opened piece id) — never for practice history. `localStorage` is synchronous (blocks the main thread on every read/write), capped around 5-10MB, and stores strings only, all of which are wrong for potentially thousands of timestamped MIDI events and per-note aggregates across many pieces and weeks. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| A MusicXML parsing library separate from OSMD (e.g., hand-rolled DOMParser walking, or a generic XML-to-JSON parser) for the **analysis** side | OSMD already parses MusicXML into a navigable model (`osmd.sheet.SourceMeasures`, `Cursor.Iterator` with `CurrentVoiceEntries`, per-note `halfTone`/timestamp/voice/measure) and keeps that model in lockstep with the rendered `GraphicalNote`s you need to color. Parsing MusicXML a second time independently creates two note-ID spaces that must be kept in sync by hand — a real source of subtle alignment bugs (the exact class of bug this rebuild is trying to avoid, per the prototype post-mortem). | Drive the analysis/alignment engine off OSMD's own parsed model (`osmd.sheet` / `osmd.cursor`) as the single source of truth for "what note is where, in what voice, in what measure" — reach for a raw XML parse only for metadata OSMD doesn't surface (if any) and confirm through direct inspection of the installed version's TypeScript defs before depending on this shape, since these are semi-internal APIs and the "get SVG per note without re-render" helpers are relatively recent additions. |
| Vite / webpack / esbuild / Rollup as a required step to **run** the app | Directly contradicts the stated constraint ("no build step required to run"); every extra tool between "edit a file" and "see it in Chrome" is friction the project explicitly wants to avoid after the prototype burned sessions on infrastructure instead of practicing. | Plain ES modules loaded via `<script type="module">`, with dependencies pulled from a CDN's ESM endpoint (jsDelivr `+esm`, or unpkg) or from a local `node_modules` reached through a bare-specifier import map. A build step is fine as an *optional* convenience for contributors (e.g. TypeScript type-checking in CI) but must never be required to open `index.html` and play. |
| TypeScript compiled ahead-of-time via a bundler, if you want type safety | Reintroduces a mandatory build step. | If type-checking is wanted, write JS with JSDoc type annotations and run `tsc --noEmit --checkJs` as a lint-only CI step (never touching the shipped files), or skip typed tooling entirely for milestone 1 — the alignment/aggregation logic is the part worth the most test coverage, not the type system. |
| Jest | Slower cold start, requires more configuration (transform pipeline, ESM interop shims) than either alternative here for a project with no build step; both `node:test` and Playwright cover this project's needs without it. | `node:test` for unit logic, Playwright for browser/e2e. |
| localForage / generic "pick any storage" abstraction libraries | Adds an abstraction layer (auto-selecting between WebSQL/IndexedDB/localStorage) solving a cross-browser problem this project doesn't have — it targets exactly one browser (Chrome on Windows) where IndexedDB is always available. | `idb` directly against IndexedDB. |

## Stack Patterns by Variant

- Keep it as a pure module — functions taking arrays of `{pitch, velocity, onTime, offTime}` MIDI events and a plain-data score model (extracted once from `osmd.sheet`/`osmd.cursor` into your own lightweight JS objects) and returning mistake records.
- Because: this keeps `node:test` able to test the entire alignment algorithm with zero DOM/browser dependency, and keeps OSMD strictly as "renderer + parser," never leaking VexFlow/OSMD internals into the scoring logic itself.
- Keep the MIDI-capture and metronome-scheduling code isolated behind a small interface (e.g. an event emitter of note-on/off + a clock source), so a future relay transport (the prototype's LAN relay, revisited) can feed the same alignment engine without touching it.
- Because: the prototype's failure mode was sinking sessions into transport (relay/Bluetooth) instead of the core practice loop — keeping transport and analysis decoupled from day one avoids repeating that on this app's own future variant.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `opensheetmusicdisplay@2.1.2` | Modern evergreen Chrome (target: latest Chrome on Windows 11) | OSMD renders to SVG in-browser; no known Chrome-specific incompatibilities. Uses VexFlow internally as a bundled dependency — do not also install a separate VexFlow version expecting them to interoperate; treat OSMD as a sealed unit for rendering. |
| `idb@8.0.3` | Any browser with IndexedDB (all of Chrome) | No coupling to OSMD or Web MIDI; independent layer. |
| `@playwright/test@1.63.0` | Node.js (LTS; check Playwright's current supported-Node floor before pinning CI) | Bundles its own Chromium build for e2e runs — this is a *separate* Chromium from the user's actual Chrome, used only for automated tests: still validate manually on the user's real Chrome + real Roland FP-60X, per the project's explicit "verify at the piano" constraint. |
| `node:test` | Node.js ≥ 20 (built-in) | No install, no version pinning beyond the Node.js version itself. |

## Sources

- npm registry (`npm view <pkg> version` / `time.modified`, run directly against the live registry 2026-09-13) — HIGH confidence, primary source for all version numbers: `opensheetmusicdisplay@2.1.2` (published 2026-08-06), `vexflow@5.0.0`, `@coderline/alphatab@1.8.4`, `verovio@6.3.0` (~27MB unpacked), `idb@8.0.3`, `dexie@4.4.6`, `@playwright/test@1.63.0`, `fflate@0.8.3`, `@stringsync/vexml@1.4.0` (actively updated 2026-09-07).
- OSMD GitHub (`opensheetmusicdisplay/opensheetmusicdisplay`), OSMD class docs (`opensheetmusicdisplay.github.io/classdoc`), and the OSMD blog post "OSMD brings colour into play!" — MEDIUM confidence (cross-checked across GitHub source references, class docs, and blog, but exact current method signatures for `setColor`/`GNote`/`getNoteheadSVGs` should be re-verified against the installed 2.1.2 TypeScript definitions before writing code against them, since some of this surfaced via wiki/issue discussion rather than versioned API reference docs).
- OSMD GitHub wiki, "Tutorial - Extracting note timing for playing" — MEDIUM confidence; confirms the `Cursor.Iterator` / `CurrentVoiceEntries` / `currentTimeStamp` pattern used for the note-timing/analysis approach recommended above.
- MDN / web.dev, "A tale of two clocks" (Web Audio scheduling) — HIGH confidence, well-established, widely cross-referenced standard technique for Web Audio metronomes/sequencers.
- W3C Web MIDI API spec + MDN `MIDIMessageEvent` — HIGH confidence for `timeStamp`/`performance.now()` time-origin equivalence.
- npm-compare.com and RxDB's IndexedDB wrapper comparison — MEDIUM confidence for the `idb` vs `Dexie` tradeoff framing.
- Playwright docs ("Mock browser APIs") plus a community `playwright-midi-test` reference repo — MEDIUM confidence for the Web-MIDI-mocking-in-Playwright approach; there is no official first-party Playwright Web MIDI API, so this is a documented community pattern, not a guaranteed-stable feature.

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
