# Phase 2: Click and Capture - Research

**Researched:** 2026-09-13
**Domain:** Web MIDI capture, Web Audio metronome scheduling, cross-clock correlation, IndexedDB durability — all inside the classic-script, no-build-step, `file://`-runnable app established in Phase 1
**Confidence:** HIGH (the phase's single biggest open question — whether Web MIDI/IndexedDB/AudioContext work from `file://` in Chrome — was resolved by direct empirical test against the real installed Chrome, not by web search alone) / MEDIUM (clock-correlation accuracy, Windows MIDI exclusivity behavior with the actual FP-60X, and MIDI-permission persistence across restarts still need the at-the-piano checkpoint to close out)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The pass marker is the two highest keys, B7 and C8 (MIDI 107 and 108), pressed together: both note-ons arriving within roughly 100 ms of each other. Spacebar does the same from the laptop. The key pair is a stored setting so it can be changed if a piece ever needs those keys.
- **D-02:** The sustain pedal is never a marker. CC64 events are captured and stored raw like every other message; nothing in this phase interprets them.
- **D-03:** One mark ends the current pass and starts the next. The first pass opens when the session starts (metronome Start). The pass in progress when the session ends is closed as-is and kept if it contains at least one non-marker note.
- **D-04:** Everything played inside a pass belongs to that pass. No discard action, no double-mark undo, no dropping of notes before a downbeat. The marker keys' own note-on/off events are stored raw, tagged as marker events, and excluded from a pass's played notes by every downstream reader.
- **D-05:** The click is scheduled with the Web Audio look-ahead scheduler. JS timers only decide which upcoming clicks to schedule; the click's authoritative time is the AudioContext time it was scheduled at. Beat 1 is accented, using the `timeSignature` already carried per measure in `src/score-model.js`; ladder files are 4/4, Yanni bars are 3/4. No subdivision ticks.
- **D-06:** The click runs continuously from Start to Stop, across every pass mark. Every scheduled click is recorded with: its AudioContext time, its converted page-clock time (the `performance.now()` domain `MIDIMessageEvent.timeStamp` uses), its bar number counting from Start, its beat within the bar, and the BPM in effect. This list is stored with the session and is the expected timeline Phase 4 measures against. — **Reversibility: costly** — Phase 4 timing and its fixtures consume this shape.
- **D-07:** A pass boundary is a plain timestamp (page clock) plus its position in the raw event stream. This phase does not decide which click is a pass's bar one and does not snap anything.
- **D-08:** Tempo is a user-set BPM, remembered per piece. The score's own tempo marking is never read for anything. BPM may be changed mid-session without ending it: the click list records BPM per click and each pass records the BPM in effect when it opened.
- **D-09:** One small pure clock utility, unit-tested with node:test, correlates the page clock (`MIDIMessageEvent.timeStamp`, `performance.now()`) with AudioContext time using a paired sample taken at session start (`AudioContext.getOutputTimestamp()` or a paired read; the researcher confirms which is reliable in Chrome on Windows) and re-sampled as the planner sees fit. Raw events always keep the original MIDI `timeStamp` unmodified; conversion happens only where a comparison is made.
- **D-10:** A collapsible live readout shows the last played note's offset in milliseconds from the nearest scheduled click (positive means late) and the running median over the last 20 notes, plus the AudioContext `baseLatency` and `outputLatency` values. Diagnostic, not grading.
- **D-11:** The median offset measured in a session is stored on the session as a calibration value, together with the raw clock pair. Nothing is applied to any timestamp in this phase. — **Reversibility: reversible.**
- **D-12:** The click plays through Chrome's default audio output. Output-device selection is deferred unless the laptop output proves unusable at the piano.
- **D-13:** A session starts when the user presses Start with a piece loaded and ends on Stop, on opening another piece, or on tab close or crash. A session never spans two pieces.
- **D-14:** A tempo change does not end a session.
- **D-15:** On reopening the app: the last-opened piece is rendered again from the file bytes stored in IndexedDB, every recorded pass of the interrupted session is listed with its note count, that session is marked ended, and the click is stopped. Pressing Start opens a new session. A crash never merges two sittings and never loses a pass.
- **D-16:** The session view lists passes as numbered repetitions with a note count each. Nothing per-note is shown.
- **D-17:** IndexedDB is the store. Stored records: pieces (file name, file bytes, content-hash id, extracted score model with `SCHEMA_VERSION`), settings (marker keys, last BPM per piece, last-opened piece, last-used MIDI input), sessions (piece id, start and end, clock pair, calibration value), the click timeline per session, passes (session id, ordinal, start/end position and timestamp, BPM), and raw MIDI events (every message: raw bytes, original `timeStamp`, decoded type, note, velocity, controller and value where applicable, session id, pass ordinal, marker flag). Raw events are written as they arrive or in small batches, before anything else touches them. The database carries a schema version with a migration function from day one. Quota errors are surfaced to the user, never swallowed. — **Reversibility: one-way** — Phase 7 export/import and Phase 3-5 analysis fixtures serialise these shapes.
- **D-18:** Everything must keep working when `index.html` is double-clicked from disk with classic scripts. The researcher verifies that IndexedDB, Web MIDI (`navigator.requestMIDIAccess`), and AudioContext all work from a `file://` origin in current Chrome on Windows before any plan depends on it. If any does not, the fallback is a one-line local static server documented in README, and that is a decision to surface to the user, not to make silently. **→ Resolved by this research: see "The `file://` Question" below — all three work. No fallback needed.**
- **D-19:** The MIDI input selector lists connected inputs, remembers the last-used one, and auto-selects it when present; connection state (connected, disconnected, permission denied) is shown in words. The live indicator per current pass is the note count, the last note's name and velocity, and a brief flash on note-on. No piano-roll, no per-note colour.

### Claude's Discretion

- Whether to use the `idb` UMD build from a CDN or raw IndexedDB, given classic scripts. **→ Resolved: `idb` UMD build. See Standard Stack.**
- Exact raw event record format and batching, within D-17.
- BPM control design and range; layout and styling of the transport, readout, and pass list, within "plain and readable".
- How clock re-sampling is scheduled during a session (D-09).
- Whether marker detection uses the spacebar keydown time or the MIDI note-on time as the boundary timestamp; both are recorded either way.

### Deferred Ideas (OUT OF SCOPE)

- Route the click to the FP-60X speakers over its USB audio interface, with an output-device picker (only if laptop output is unusable at the piano).
- A "discard last pass" action (rejected for now; the aggregate handles one-offs).
- Count-in before each pass (v2, CAPT-06).
- Drag-and-drop file opening (still deferred from Phase 1).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| CAPT-01 | User can pick a connected USB MIDI input in Chrome; the app records note-on, note-off, velocity, and timestamp for every event | "The `file://` Question" (Web MIDI works), Pitfall P2-1 (velocity-0-as-note-off), Pattern 3 (MIDI capture wiring), Code Example "MIDI capture and raw event decoding" |
| CAPT-02 | Minimal live indicator that notes are arriving, no per-note grading | D-19 already specifies the shape; Architectural Responsibility Map places this in Browser/Client, no analysis dependency |
| CAPT-03 | User sets BPM, hears an audible Web Audio metronome click that defines the expected timeline | Pattern 1 (look-ahead scheduler), Pitfall P2-2 (background-tab throttling is exempted while audio is audible — CITED), Code Example "Look-ahead metronome scheduler" |
| CAPT-04 | User marks pass boundaries with one action; each pass stored as its own repetition | Pattern 4 (marker detection as pure function), Code Example "Pass marker detection" |
| CAPT-05 | Raw MIDI events for every repetition stored unmodified | Pattern 5 (raw-event-sourced persistence via idb), Pitfall P2-6 (flush-before-close) |
| HIST-01 | Pieces, sessions, repetitions, raw events saved in IndexedDB; closing the tab loses nothing | "The `file://` Question" (IndexedDB works from `file://`), Standard Stack (`idb` UMD), Code Example "Storage schema and migration" |

</phase_requirements>

## Summary

The single highest-uncertainty item going into this phase — whether Web MIDI, IndexedDB, and AudioContext actually work when `index.html` is opened by double-click (`file://` origin), per D-18 — is now settled by direct test against the real installed Chrome 153 on this machine, not by inference: **all three work.** `window.isSecureContext` is `true` on `file://` (the W3C Secure Contexts spec explicitly special-cases `file:` as "Potentially Trustworthy" — this contradicts a common but wrong claim, repeated in several web-search summaries during this research, that `file://` is an insecure origin for Web MIDI; that claim is refuted by the direct test below and should not be repeated in planning). `navigator.requestMIDIAccess()` is present as a function and, after permission is granted, resolves to a working `MIDIAccess` object; before permission is granted it rejects with `NotAllowedError` — a real permission-prompt gate (Chrome ≥124, confirmed present in the installed Chrome 153), not a secure-context failure. `indexedDB.open()` succeeds immediately with no error. `AudioContext` constructs fine, starts `suspended` (autoplay policy — the user's Start-button click satisfies this), and exposes `getOutputTimestamp`, `baseLatency` (0.01s measured), and `outputLatency`. **D-18's fallback (a one-line local static server) is not needed; do not build it.**

The second load-bearing question, D-09's clock correlation, has a well-established standard technique (a single paired sample of `performance.now()` and `audioContext.currentTime`, taken once and re-sampled as needed) but the spec-provided helper meant for exactly this job, `AudioContext.getOutputTimestamp()`, has a documented (if not precisely pinned to a single open Chromium bug) history of returning jittery/inconsistent values in Chrome compared to Firefox. The recommendation is to make the simple paired-sample the *primary* correlation mechanism (matches Pitfall 5/Anti-Pattern 3 in the existing PITFALLS.md/ARCHITECTURE.md) and use `getOutputTimestamp()` only for the diagnostic `baseLatency`/`outputLatency` numbers D-10 already asks to display — never as the sole source of the offset used to convert timestamps.

For storage, `idb` ships a genuine UMD build (`https://cdn.jsdelivr.net/npm/idb@8.0.3/build/umd.js`, confirmed present and exposing a global `idb.{openDB,deleteDB,wrap,unwrap}` by direct fetch) that resolves the "Claude's Discretion" item cleanly: classic `<script src>` tag, no ES modules, no bundler, matching Phase 1's established convention exactly. For testing the storage layer under `node:test` without a browser, `fake-indexeddb` (actively maintained, 4.4M weekly downloads) is the standard companion to `idb` for exactly this scenario and should be a test-only devDependency, following the same "keep it a pure-enough module, test without a browser" philosophy Phase 1 used for `score-model.js`.

For headless verification, the project already has a working pattern — `scripts/check-svg-map.cjs` drives real headless Chrome over the raw DevTools Protocol — and this phase should extend that pattern for a MIDI/storage round-trip check rather than introducing Playwright as a new devDependency (CLAUDE.md recommends Playwright generically for Web-MIDI mocking, but Phase 1 never added it, and the canonical_refs in 02-CONTEXT.md explicitly point at reusing `check-svg-map.cjs`'s CDP pattern). CDP's `Page.addScriptToEvaluateOnNewDocument` is the direct raw-protocol equivalent of Playwright's `addInitScript()` and can install a fake `navigator.requestMIDIAccess`/`MIDIInput` before the app's own scripts run, then dispatch synthetic `MIDIMessageEvent`-shaped calls via `Runtime.evaluate` — the same mocking technique CLAUDE.md describes, without a new dependency.

**Primary recommendation:** Build capture as five small classic-script modules beside the existing `src/score-model.js`/`src/score-renderer.js` (a pure `clock.js`, a pure `pass-marker.js`, a pure `pass-segmenter.js`, a side-effecting `metronome.js` and `midi-capture.js`, plus a `storage.js` wrapping the `idb` UMD global), wire them into a new `capture-app.js` that owns the transport/live-readout DOM the same way `score-renderer.js` owns the notation DOM, and treat the raw-event write path as the one flow that must never be allowed to fail silently — matching D-17 and the project's own Pattern 1 (raw-event-sourced persistence).

## Architectural Responsibility Map

This is a single-page, browser-only, local-storage app with no server and no CDN tier — three of the standard five tiers (Frontend Server/SSR, CDN/Static, and any network API/Backend) do not apply. The relevant axes are Browser/Client (capture, scheduling, UI) and Storage (IndexedDB), plus a "Pure Logic" sub-tier within Browser/Client that is deliberately kept free of DOM/MIDI/Audio globals so it stays `node:test`-able, matching the project's own established convention from `score-model.js`.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| MIDI input enumeration + capture | Browser/Client (capture adapter) | — | `navigator.requestMIDIAccess`/`MIDIInput.onmidimessage` are browser-only globals; this must be a thin, side-effecting wrapper, not analysis |
| Metronome click scheduling | Browser/Client (capture adapter) | — | `AudioContext` is a browser-only global; owns both the audible click and the authoritative click-timeline (D-06) |
| Clock correlation (`performance.now()` ↔ `AudioContext.currentTime`) | Pure Logic | Browser/Client (sampled from) | The conversion math itself takes two numbers and returns an offset — pure, `node:test`-able; only the *sampling* touches browser globals |
| Pass-marker detection (B7+C8, spacebar) | Pure Logic | Browser/Client (keydown/note-on events feed it) | A pure function over a stream of `{type, key/note, timestamp}` records — no DOM needed to decide "is this a marker" |
| Pass segmentation (slice raw stream into passes) | Pure Logic | — | Pure slicing operation over an array plus marker timestamps; identical shape to `score-model.js`'s pure-transform style |
| Raw MIDI event persistence | Storage (IndexedDB) | Browser/Client (write call site) | The single most important table in the app per Phase 1's own ARCHITECTURE.md Pattern 1; must never be lost |
| Session/pass/click-timeline persistence | Storage (IndexedDB) | — | Same store, different object stores; schema-versioned per D-17 |
| Live indicator / transport UI | Browser/Client (DOM) | — | D-19's note count, flash, and MIDI-state text are pure UI, no analysis dependency |
| Restore-on-reopen (piece + passes) | Browser/Client (DOM, on load) | Storage (reads) | Reuses `score-renderer.js`'s existing `loadPiece(file)` Blob-accepting path per code_context Integration Points |

## Project Constraints (from CLAUDE.md)

The following directives from `.claude/CLAUDE.md` are binding for this phase's plan:

| Directive | Applies to Phase 2 as |
|-----------|------------------------|
| No build step required to run; plain `<script type="module">` is even disallowed here — Phase 1 went further and uses classic (non-module) scripts exclusively | All new files (`clock.js`, `metronome.js`, `midi-capture.js`, `pass-marker.js`, `pass-segmenter.js`, `storage.js`, `capture-app.js`) must be classic scripts, `require()`-able for side effects by `node:test`, exactly like `score-model.js` |
| Web MIDI API and Web Audio API: browser built-ins, no wrapper library | `midi-capture.js` calls `navigator.requestMIDIAccess()` directly; `metronome.js` owns a hand-rolled ~80-line look-ahead scheduler, no Tone.js |
| `idb` (not raw `indexedDB.open()` callbacks, not Dexie, not localForage) for practice history | `storage.js` wraps the `idb` UMD global; `localStorage` only for tiny settings if any |
| `node:test` for pure logic; Playwright reserved for Web-MIDI-mock e2e, but only if actually adopted | This research recommends *not* adding Playwright as a new dependency yet — see "Testing Web MIDI Headlessly" below; if the planner still wants an e2e layer, CLAUDE.md's `addInitScript()` mocking pattern is confirmed viable via WebSearch (MEDIUM confidence, no single canonical example found) |
| Never anchor timing to the first played note; anchor to the metronome's own scheduled clock | `clock.js`/`metronome.js` must not introduce a `t0`/`anchorNote` variable derived from a MIDI event — ground truth is always the AudioContext-scheduled click timeline |
| Never read tempo from the score file for timing math | `metronome.js` takes BPM only from user input (D-08); `timeSignature` is the only thing pulled from `score-model.js`'s `ScoreModel.extract()` output |
| IndexedDB, not `localStorage`, with a `schemaVersion` field and quota-exceeded handling from day one | `storage.js`'s `idb.openDB(name, version, { upgrade })` call is where this lands (see Code Examples) |
| GSD Workflow Enforcement: file-changing tools only through a GSD command | Not a technical constraint on the plan's content, but binding on how this phase gets executed |

## The `file://` Question (D-18) — Resolved

D-18 explicitly required this to be verified empirically, not assumed, before any plan depends on it. It was verified directly against the machine's installed Chrome (153.0.8010.36) in headless mode over the raw DevTools Protocol, loading a real `file://` URL:

```
isSecureContext:                    true
typeof navigator.requestMIDIAccess: "function"
requestMIDIAccess() (no permission): rejects, NotAllowedError, "Permission to use Web MIDI API was not granted."
requestMIDIAccess() (after CDP Browser.grantPermissions ["midi","midiSysex"]):
                                     resolves, { inputsSize: 0, sysexEnabled: false }   (0 inputs — no MIDI hardware attached to this dev machine)
indexedDB.open('test-db', 1):       succeeds
new AudioContext():                 succeeds, state "suspended", sampleRate 48000, baseLatency 0.01, getOutputTimestamp is a function
```

`[VERIFIED: direct headless-Chrome test against file:///.../test.html via DevTools Protocol Runtime.evaluate, this session]` — all four probes above were executed against the real Chrome binary at `C:\Program Files\Google\Chrome\Application\chrome.exe`, not simulated.

This is corroborated by the W3C Secure Contexts spec: `[CITED: w3c.github.io/webappsec-secure-contexts §3.1]` — the "Is origin potentially trustworthy?" algorithm has an explicit step, "If origin's scheme is 'file', return 'Potentially Trustworthy'." This is why `isSecureContext` is `true` for `file://` in Chrome, and it directly refutes a claim that surfaced repeatedly in this session's web searches ("file:// origins are not considered secure contexts, they cannot access the Web MIDI API") — that claim conflates `file://` with genuinely insecure `http://` origins, which the Chromium team has separately discussed deprecating Web MIDI on (a different, unrelated deprecation effort scoped to `http://`). **Do not carry the "file:// is insecure" claim into the plan; it is refuted, not merely unconfirmed.**

The only real gate is the **per-origin permission prompt** (Chrome ≥124 gates all Web MIDI access, sysex or not, behind a user-facing Allow/Block prompt — `[CITED: developer.chrome.com/blog/web-midi-permission-prompt]`). Because every `file://` page shares the single origin string `"file://"` in Chrome (confirmed: `location.origin` inside the test page printed exactly `"file://"`), granting MIDI permission once for `index.html` should apply to any other local file the user later opens over `file://` on the same Chrome profile — but whether Chrome's site-settings *persistence* (which is designed around resolvable hostnames) treats the bare `"file://"` origin the same way across a full browser restart was not independently verified this session (CDP's `Browser.grantPermissions` sets an ephemeral per-connection grant, not a verified on-disk site-settings entry). Treat this as `[ASSUMED]` — see Assumptions Log A1 — and confirm at the piano checkpoint: open the app, click Allow once, fully close Chrome, reopen, and confirm no second prompt appears.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| Web MIDI API (browser built-in) | N/A | `navigator.requestMIDIAccess()`, `MIDIInput.onmidimessage` | Confirmed working from `file://` this session; `MIDIMessageEvent.timeStamp` shares `performance.now()`'s origin `[VERIFIED: W3C Web MIDI spec + MDN, carried from Phase 1's STACK.md]` |
| Web Audio API (browser built-in) | N/A | `AudioContext` + hand-rolled look-ahead scheduler | Confirmed working from `file://` this session (`baseLatency` 0.01, `getOutputTimestamp` present); the look-ahead pattern is the only technique that keeps click ground-truth immune to JS timer jitter `[CITED: web.dev/articles/audio-scheduling]` |
| `idb` | 8.0.3 | Thin promise wrapper over IndexedDB, loaded as a classic UMD script | `[VERIFIED: npm registry via package-legitimacy check — publishedAt 2025-05-07 registry entry / 2025-11-07 latest metadata fetch, weeklyDownloads 18.1M, repo github.com/jakearchibald/idb, verdict OK]`. UMD build confirmed to exist and export the expected globals: `curl https://cdn.jsdelivr.net/npm/idb@8.0.3/build/umd.js` returns HTTP 200, and the fetched bytes define `globalThis.idb = { openDB, deleteDB, wrap, unwrap }` via a standard UMD IIFE wrapper `[VERIFIED: direct fetch and byte inspection, this session]`. This resolves D-17's "Claude's Discretion" item: **use the UMD build**, not raw IndexedDB, and not an ESM `+esm` import (Phase 1's `check-run-path.cjs` gate hard-fails on any `type="module"` script tag). |

**Pinned script tag** (same convention as Phase 1's OSMD tag):
```html
<script src="https://cdn.jsdelivr.net/npm/idb@8.0.3/build/umd.js"
        integrity="sha384-lLGuFiulNF2N/nqC6IxFZzy3WGfLokEKQD73HN9gCx1vFouvtty5kp+wf20Rrs0Y"
        crossorigin="anonymous"></script>
```
The `integrity` hash above was computed directly from the fetched file this session (`openssl dgst -sha384 -binary umd.js | openssl base64 -A`) `[VERIFIED: direct computation, this session]` — re-run that command against the same URL before committing if the executor wants an independent check, since a transcription error in a hash silently breaks script loading with no console detail beyond a generic network error.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fake-indexeddb` | 6.2.5 | In-memory IndexedDB polyfill for `node:test` | `[VERIFIED: npm registry via package-legitimacy check — publishedAt 2025-11-07, weeklyDownloads 4.46M, repo github.com/dumbmatter/fakeIndexedDB, verdict OK, engines node >=18]`, compatible with the installed Node 24.11.1. Standard companion to `idb` for unit-testing storage-layer functions (schema migration, write/read round-trips, quota-error handling) without a browser — matches CLAUDE.md's "pure module, `node:test`-able" philosophy applied to the one module that can't actually be DOM-free (it needs *some* IndexedDB implementation). Test-only devDependency, never shipped to the browser. |
| Structured-clone-safe raw event shape | N/A | `Uint8Array` MIDI payload as a plain array before storage | `MIDIMessageEvent.data` is a `Uint8Array`; IndexedDB can store typed arrays directly via structured clone, but converting to a plain `Array.from(data)` before storage keeps stored records identical to `JSON.stringify`-able shapes, consistent with `score-model.js`'s own "plain JSON, no exotic object ever reachable from it" discipline (mirrors its `JSON.parse(JSON.stringify(model))` deep-equal test) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `idb` UMD classic script | `idb`'s `+esm` CDN import via `type="module"` | Rejected outright — Phase 1's `check-run-path.cjs` gate hard-fails on any `type="module"` script tag; this is a project-level constraint, not a preference |
| Extending `scripts/check-svg-map.cjs`'s raw-CDP pattern for MIDI mocking | `@playwright/test` with `page.addInitScript()` | CLAUDE.md recommends Playwright generically for this exact use case (mocking `navigator.requestMIDIAccess`), and it is a real, documented pattern `[CITED: playwright.dev/docs/mock-browser-apis via WebSearch]`. But Phase 1 never added Playwright as a devDependency, and 02-CONTEXT.md's own canonical_refs point at reusing `check-svg-map.cjs`'s CDP pattern for "a storage or MIDI round-trip check" — treat introducing Playwright now as a new decision to surface, not a default, since it adds a devDependency and a bundled-Chromium download the project hasn't needed so far |
| Simple paired-sample clock correlation as primary | `AudioContext.getOutputTimestamp()` as primary | `getOutputTimestamp()` is spec-designed for exactly this correlation and accounts for output latency, but has a `[CITED, MEDIUM confidence: GitHub WebAudio/web-audio-api#2461 discussion thread]` history of jittery/inconsistent values specifically in Chrome ("the value appears to bounce around while the Firefox value remains steady" — a community report, not a single pinned Chromium bug ID confirmed still open this session). Use it only for the diagnostic `baseLatency`/`outputLatency` numbers D-10 already wants, not as the sole timestamp-conversion source |

**Installation:** No `npm install` is required to *run* the app (the `idb` UMD build loads from CDN exactly like OSMD does). For local dev/test:
```bash
npm install -D fake-indexeddb
```

**Version verification performed this session:**
```
idb@8.0.3            — npm registry, confirmed current (published 2025-05-07 / latest metadata 2025-11-07), UMD build fetched and byte-inspected
fake-indexeddb@6.2.5 — npm registry, confirmed current (published 2025-11-07), engines node >=18 (installed: v24.11.1)
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| idb | npm | actively maintained (metadata refreshed 2025-11-07) | 18.1M/wk | github.com/jakearchibald/idb | OK | Approved |
| fake-indexeddb | npm | actively maintained (published 2025-11-07) | 4.46M/wk | github.com/dumbmatter/fakeIndexedDB | OK | Approved |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** none.

Both packages were checked via `gsd_run query package-legitimacy check --ecosystem npm idb fake-indexeddb` (seam-verified against the live npm registry) and independently cross-checked with `npm view <pkg> version`/`time.modified`/`engines` this session. Neither is `[ASSUMED]` — both are `[VERIFIED: npm registry]` and their maintainers/purpose are corroborated by their own official GitHub repos, which is the standard this project already applies to `opensheetmusicdisplay` and `idb` in the existing STACK.md.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  BROWSER, file:// origin, one tab                                        │
│                                                                           │
│   [User: pick MIDI input]        [User: set BPM, press Start]           │
│         │                                  │                            │
│         ▼                                  ▼                            │
│  ┌──────────────┐                  ┌───────────────────────┐            │
│  │ midi-capture │                  │ metronome              │            │
│  │ .js          │                  │ .js                    │            │
│  │ requestMIDI  │                  │ AudioContext +          │           │
│  │ Access()     │                  │ look-ahead scheduler    │           │
│  │ onmidimessage│                  │ → audible click          │          │
│  └──────┬───────┘                  │ → click-timeline entries │          │
│         │ raw {type,note,vel,      │   (AudioContext time,    │          │
│         │  timeStamp,cc}           │    bar, beat, BPM)       │          │
│         │                          └──────────┬───────────────┘         │
│         │                                     │                          │
│         │              ┌──────────────────────┘                          │
│         │              │ (both feed the same session's raw stream)       │
│         ▼              ▼                                                 │
│  ┌────────────────────────────────┐    ┌──────────────┐                  │
│  │ pass-marker.js  (pure)          │    │ clock.js (pure) │               │
│  │ B7+C8 within ~100ms, or         │    │ correlate perf.now()│           │
│  │ spacebar keydown → marker event │    │ ↔ audioContext.currentTime│    │
│  └──────────────┬──────────────────┘    └──────┬────────┘               │
│                 ▼                               │ (used only where       │
│         ┌───────────────────┐                   │  a comparison is made, │
│         │ pass-segmenter.js  │                   │  never mutates raw     │
│         │ (pure) slices the  │                   │  stored timestamps)    │
│         │ raw stream into    │                   ▼                        │
│         │ numbered passes    │            (feeds the live readout only,   │
│         └─────────┬──────────┘             D-10 — diagnostic, no grading) │
│                   │                                                       │
│                   ▼                                                       │
│         ┌───────────────────────────────────────────┐                    │
│         │ storage.js  (idb UMD wrapper)               │                   │
│         │ writes raw events + pass boundaries          │                  │
│         │ AS THEY ARRIVE, before anything else reads   │                  │
│         │ them (Pattern 1). Also persists: pieces,     │                  │
│         │ settings, sessions, click timeline.          │                  │
│         └─────────────────┬─────────────────────────────┘                │
│                           ▼                                              │
│                    IndexedDB (file:// origin store)                      │
│                                                                           │
│         ┌───────────────────────────────────────────┐                    │
│         │ capture-app.js  — DOM: transport controls,   │                  │
│         │ MIDI-state text, live readout, pass list      │                 │
│         │ (reads capture-app's own state object, never  │                 │
│         │ reaches into storage.js's internals directly) │                 │
│         └───────────────────────────────────────────┘                    │
│                                                                           │
│  On reopen: storage.js reads the last piece's file bytes → feeds them    │
│  through score-renderer.js's existing loadPiece(file) Blob path (D-15)   │
└─────────────────────────────────────────────────────────────────────────┘
```

The critical property: **the only two places that touch browser-only globals directly are `midi-capture.js` and `metronome.js` (Web MIDI/Web Audio) and `storage.js` (IndexedDB, via the `idb` UMD global) and `capture-app.js` (DOM).** `clock.js`, `pass-marker.js`, and `pass-segmenter.js` take and return plain data, exactly like `score-model.js` — this is what lets them be `node:test`-ed the same way (per code_context's Established Patterns note).

### Recommended Project Structure

Following Phase 1's flat, no-subfolder convention (`src/score-model.js`, `src/score-renderer.js`, `src/inspect-table.js` — one global per file, no `src/capture/`, `src/analysis/` subtree):

```
src/
├── score-model.js       # (Phase 1, unchanged)
├── score-renderer.js    # (Phase 1; loadPiece(file) reused for restore-on-reopen)
├── inspect-table.js     # (Phase 1, unchanged)
├── clock.js             # NEW — pure: paired-sample correlation, timestamp conversion
├── pass-marker.js        # NEW — pure: B7+C8 / spacebar marker detection over a raw stream
├── pass-segmenter.js     # NEW — pure: slices a raw event array into numbered passes
├── metronome.js          # NEW — AudioContext + look-ahead scheduler; owns click-timeline
├── midi-capture.js       # NEW — Web MIDI wiring; decodes raw bytes, tags markers/CC
├── storage.js            # NEW — idb UMD wrapper; schema, migrations, all object-store repos
└── capture-app.js        # NEW — DOM: transport, MIDI selector, live readout, pass list
```

`index.html`'s script tags must stay in dependency order per `check-run-path.cjs`'s `EXPECTED_LOCAL_SCRIPTS` gate — **that array is currently hardcoded to the three Phase 1 files and will need extending** to include the seven new files in load order (e.g. `clock.js`, `pass-marker.js`, `pass-segmenter.js` first since nothing depends on browser globals; then `metronome.js`, `midi-capture.js`, `storage.js`; then `capture-app.js` last, since it wires everything else together). This is a concrete integration point for the plan, not just a note — the gate will fail red until the script updates and the check script's array are both changed together.

### Pattern 1: Look-Ahead Metronome Scheduler (the click IS the ground truth)

**What:** A `setInterval` polling loop (~25ms) that, each tick, schedules any click whose time falls within a ~100ms look-ahead window using `audioContext.currentTime` + a scheduled `AudioBufferSourceNode`/oscillator `start(time)` call — never scheduling from the JS timer's own firing time. Every scheduled click is also pushed into an in-memory + persisted click-timeline array with its AudioContext time, converted page-clock time (via `clock.js`), bar number, beat, and BPM (D-06).

**When to use:** Always for this phase — it is the one piece of ground truth every later phase measures against (D-06, D-09).

**Example:**
```javascript
// src/metronome.js — classic script, mirrors src/score-model.js's IIFE style
'use strict';
globalThis.Metronome = (() => {
  const LOOKAHEAD_MS = 25;
  const SCHEDULE_AHEAD_S = 0.1;

  function create(audioContext, { timeSignatureFor, onClick }) {
    let nextClickTime = 0;
    let bpm = 0;
    let barNumber = 1;
    let beatInBar = 1;
    let timer = null;

    function secondsPerBeat() { return 60 / bpm; }

    function scheduleClick(time, isAccent) {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.frequency.value = isAccent ? 1500 : 1000;
      gain.gain.setValueAtTime(0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      osc.connect(gain).connect(audioContext.destination);
      osc.start(time);
      osc.stop(time + 0.05);
      onClick({ audioTime: time, bar: barNumber, beat: beatInBar, bpm, isAccent });
    }

    function tick() {
      const { beats } = timeSignatureFor(barNumber);
      while (nextClickTime < audioContext.currentTime + SCHEDULE_AHEAD_S) {
        scheduleClick(nextClickTime, beatInBar === 1);
        nextClickTime += secondsPerBeat();
        beatInBar += 1;
        if (beatInBar > beats) { beatInBar = 1; barNumber += 1; }
      }
    }

    return {
      start(startBpm) {
        bpm = startBpm;
        nextClickTime = audioContext.currentTime + 0.05;
        timer = setInterval(tick, LOOKAHEAD_MS);
      },
      setBpm(newBpm) { bpm = newBpm; }, // D-08: BPM may change mid-session
      stop() { clearInterval(timer); timer = null; },
    };
  }

  return { create };
})();
```
Source: hand-rolled from the canonical look-ahead pattern `[CITED: web.dev/articles/audio-scheduling (Chris Wilson)]`, adapted to this project's classic-script/IIFE convention (matches `score-model.js`'s own `globalThis.X = (() => {...})()` shape, confirmed by direct read of that file this session).

### Pattern 2: Paired-Sample Clock Correlation (primary), `getOutputTimestamp()` (diagnostic only)

**What:** Take one synchronous pair `(performance.now(), audioContext.currentTime)` right after the AudioContext is resumed at session Start; store the pair as the session's "clock pair" (D-17). Convert any `MIDIMessageEvent.timeStamp` into the AudioContext domain via `audioTime = pair.audioContextTimeAtStart + (midiTimeStamp - pair.performanceNowAtStart) / 1000`. Re-sample the pair periodically (e.g. once a minute, or once per pass) to guard against any long-run drift between the two clocks, storing the latest pair as the one used for the *next* comparison window — the raw stored MIDI timestamps themselves are never rewritten (D-09's "conversion happens only where a comparison is made").

**When to use:** As the sole mechanism feeding D-10's live readout math and D-11's stored calibration value.

**Do NOT use `getOutputTimestamp()`'s `{contextTime, performanceTime}` pair as the *only* correlation source** — it is spec-designed for exactly this and its numbers share `performance.now()`'s origin `[CITED: MDN AudioContext.getOutputTimestamp()]`, but a community-reported Chrome-specific inconsistency (values "bouncing around" vs. a steady Firefox value) means it should not be blindly trusted as the single ground truth without the at-the-piano sanity check D-10 already specifies. Use it to populate the `baseLatency`/`outputLatency` diagnostic numbers D-10 wants displayed, and optionally as a cross-check against the paired-sample result — if the two disagree by more than a few ms, that disagreement itself is useful diagnostic information for the live readout.

**Example:**
```javascript
// src/clock.js — pure, no DOM/MIDI/Audio globals touched at call time; caller passes the samples
'use strict';
globalThis.Clock = (() => {
  function samplePair(performanceNowValue, audioContextCurrentTimeValue) {
    return { performanceNowAtSample: performanceNowValue, audioContextTimeAtSample: audioContextCurrentTimeValue };
  }

  // midiTimeStamp: raw MIDIMessageEvent.timeStamp (ms, performance.now()-origin)
  // pair: the most recent samplePair() result
  // returns: the equivalent time in the AudioContext clock domain (seconds)
  function toAudioContextTime(midiTimeStamp, pair) {
    return pair.audioContextTimeAtSample + (midiTimeStamp - pair.performanceNowAtSample) / 1000;
  }

  function offsetMs(midiTimeStamp, expectedAudioContextTime, pair) {
    return (toAudioContextTime(midiTimeStamp, pair) - expectedAudioContextTime) * 1000;
  }

  return { samplePair, toAudioContextTime, offsetMs };
})();

if (typeof module !== 'undefined') module.exports = globalThis.Clock;
```
This module takes plain numbers, not live `performance`/`AudioContext` objects — the call sites in `metronome.js`/`midi-capture.js` do `Clock.samplePair(performance.now(), audioContext.currentTime)` and pass the result in. This mirrors `score-model.js`'s pure-transform convention and makes the entire correlation formula testable with `node --test`, no jsdom, no fake AudioContext needed at all.

### Pattern 3: MIDI Capture and Raw Event Decoding

**What:** `navigator.requestMIDIAccess()` → enumerate `access.inputs` → attach `onmidimessage` → decode the 3-byte (or shorter, for real-time) message into a raw event record, tagging note-on/note-off (including the velocity-0-as-note-off convention) and CC64 (sustain), storing everything unmodified.

**Reference (not reused, per canonical_refs):** `prototype/piano-app.js` line 152 decodes exactly this way — `[VERIFIED: prototype/piano-app.js:151-152, read this session]`:
```javascript
const [status, pitch, velocity] = event.data, kind = status >> 4, channel = status & 15;
const isOn = kind === 9 && velocity > 0, isOff = kind === 8 || (kind === 9 && velocity === 0);
```

**Example (new, Phase 2 shape):**
```javascript
// src/midi-capture.js
'use strict';
globalThis.MidiCapture = (() => {
  function decode(event) {
    const data = Array.from(event.data); // plain array — IndexedDB-safe, JSON-safe (see Standard Stack note)
    const [status, d1, d2] = data;
    const kind = status >> 4;
    const channel = status & 15;
    if (kind === 9 && d2 > 0) return { type: 'noteon', channel, note: d1, velocity: d2, timeStamp: event.timeStamp, raw: data };
    if (kind === 8 || (kind === 9 && d2 === 0)) return { type: 'noteoff', channel, note: d1, velocity: d2, timeStamp: event.timeStamp, raw: data };
    if (kind === 11 && d1 === 64) return { type: 'sustain', channel, value: d2, timeStamp: event.timeStamp, raw: data }; // CC64, D-02
    return { type: 'other', channel, timeStamp: event.timeStamp, raw: data };
  }

  async function connect({ onEvent, onStateChange }) {
    const access = await navigator.requestMIDIAccess(); // sysex: false — not requested, per D-11's sysexEnabled: false
    for (const input of access.inputs.values()) {
      input.onmidimessage = (event) => onEvent(decode(event));
    }
    access.onstatechange = onStateChange; // handles USB replug / driver re-enumeration
    return access;
  }

  return { decode, connect };
})();
```
`decode()` is pure (plain data in, plain data out) and should be the primary `node:test` surface for CAPT-01/CAPT-05; `connect()` is the thin side-effecting wrapper.

### Pattern 4: Pass-Marker Detection and Segmentation (pure)

**What:** A pure function scanning a stream of `{type, source, key/note, timestamp}` records for the B7+C8 (MIDI 107+108) near-simultaneous condition (both note-ons within ~100ms, D-01) or a spacebar keydown, emitting marker events; a second pure function slicing the full raw event array into numbered passes using those marker timestamps (D-03, D-04, D-07).

**Example:**
```javascript
// src/pass-marker.js
'use strict';
globalThis.PassMarker = (() => {
  const DEFAULT_KEYS = [107, 108]; // B7, C8 — stored setting per D-01
  const WINDOW_MS = 100;

  // events: array of {type: 'noteon'|'noteoff'|..., note, timeStamp} in arrival order
  // returns: array of {timeStamp, sourceEventIndexes: [i, j]} marker occurrences
  function findMarkers(events, markerKeys = DEFAULT_KEYS) {
    const markers = [];
    const pending = new Map(); // note -> event index, awaiting the pair
    events.forEach((e, i) => {
      if (e.type !== 'noteon' || !markerKeys.includes(e.note)) return;
      const other = markerKeys.find((k) => k !== e.note);
      const otherIndex = pending.get(other);
      if (otherIndex !== undefined && Math.abs(events[otherIndex].timeStamp - e.timeStamp) <= WINDOW_MS) {
        markers.push({ timeStamp: e.timeStamp, sourceEventIndexes: [otherIndex, i] });
        pending.delete(other);
      } else {
        pending.set(e.note, i);
      }
    });
    return markers;
  }

  return { findMarkers, DEFAULT_KEYS, WINDOW_MS };
})();
```
This is the exact shape code_context's Established Patterns section asks for: "the clock utility, marker detector, and pass segmenter should be tested the same way with no DOM."

### Pattern 5: Raw-Event-Sourced Persistence via `idb`

**What:** Every raw MIDI event and pass boundary is written to IndexedDB as it arrives (or in a small debounced batch), before any other code reads it — carried over unchanged from Phase 1's own ARCHITECTURE.md Pattern 1, now concretely backed by `idb`.

**Example (schema + migration + a write path):**
```javascript
// src/storage.js
'use strict';
globalThis.Storage = (() => {
  const DB_NAME = 'piano-mistakes';
  const DB_VERSION = 1;

  async function open() {
    // idb.openDB is the global exposed by the UMD build — see Standard Stack
    return idb.openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        if (oldVersion < 1) {
          db.createObjectStore('pieces', { keyPath: 'id' });               // content-hash id
          db.createObjectStore('settings', { keyPath: 'key' });
          db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
          db.createObjectStore('passes', { keyPath: 'id', autoIncrement: true })
            .createIndex('bySession', 'sessionId');
          db.createObjectStore('rawEvents', { keyPath: 'id', autoIncrement: true })
            .createIndex('bySession', 'sessionId');
          db.createObjectStore('clickTimeline', { keyPath: 'id', autoIncrement: true })
            .createIndex('bySession', 'sessionId');
        }
        // future: if (oldVersion < 2) { ...add a store or index without touching the above... }
      },
    });
  }

  async function appendRawEvents(db, sessionId, passOrdinal, events) {
    const tx = db.transaction('rawEvents', 'readwrite');
    try {
      await Promise.all([
        ...events.map((e) => tx.store.add({ sessionId, passOrdinal, ...e })),
        tx.done,
      ]);
    } catch (error) {
      if (error && error.name === 'QuotaExceededError') {
        throw new Error('Storage is full — free up space or export history before continuing.'); // D-17: surfaced, never swallowed
      }
      throw error;
    }
  }

  return { open, appendRawEvents };
})();
```
`idb.openDB`/transaction shape `[CITED: raw.githubusercontent.com/jakearchibald/idb/main/README.md, fetched this session]`. `QuotaExceededError` surfacing through a rejected promise follows directly from the underlying `IDBRequest.onerror` → promise-rejection wrapping that is `idb`'s whole documented purpose; this specific propagation path was not independently re-verified against a real quota-exceeded condition this session — `[ASSUMED]`, low risk given it is basic IndexedDB spec behavior (see Assumptions Log if the executor wants to add a real quota-exhaustion test).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| IndexedDB promise wrapping, transactions, cursors | A hand-rolled `indexedDB.open()` callback wrapper | `idb` (UMD build) | The callback API is painful enough that hand-rolling it is a false economy even in a "no framework" project — this is CLAUDE.md's own stated position, now backed by a confirmed-working UMD build |
| Metronome timing | `setInterval(click, msPerBeat)` directly | The look-ahead scheduler pattern (Pattern 1) | A naive timer-driven click drifts 10-25ms+ under JS event-loop load and would poison every later phase's timing judgments — PITFALLS.md Pitfall 8, reconfirmed this session |
| Testing IndexedDB code without a browser | An in-memory mock object shaped like `IDBDatabase` | `fake-indexeddb` | Actively maintained (4.46M weekly downloads), designed for exactly this, compatible with `idb`'s API surface out of the box |
| Web MIDI mocking for headless verification | A new Playwright test harness (new devDependency) | Extend `scripts/check-svg-map.cjs`'s raw-CDP pattern with `Page.addScriptToEvaluateOnNewDocument` | The project already has a working, dependency-free CDP harness; introducing Playwright is a real option (CLAUDE.md-sanctioned) but is a new decision, not a default, per 02-CONTEXT.md's canonical_refs pointing at the existing script |
| Cross-clock timestamp conversion | Comparing `MIDIMessageEvent.timeStamp` directly against `AudioContext.currentTime` | `clock.js`'s paired-sample conversion (Pattern 2) | These are two different clock origins; comparing them raw introduces a constant, easy-to-misdiagnose offset error into every timing judgment — PITFALLS.md Pitfall 5 / ARCHITECTURE.md Anti-Pattern 3 |

**Key insight:** every "don't hand-roll" item above already exists as a named pitfall in the project's own Phase 1 research (PITFALLS.md, ARCHITECTURE.md) — Phase 2 is where those pitfalls stop being theoretical and become the actual code being written, so the plan should treat PITFALLS.md pitfalls 1, 2, 5, 6, 7, 8, and 15 as a literal pre-merge checklist for this phase's tasks, not background reading.

## Common Pitfalls

> Pitfalls 1, 2, 3, 4, 6, 7, 8, 9-14, 15, 16 are already fully documented in `.planning/research/PITFALLS.md` (Phase 1 research) and remain fully applicable — canonical_refs already point the planner there. This section covers only what changed or was newly discovered this session.

### Pitfall P2-1: Trusting the "file:// is insecure" claim and building an unneeded fallback server

**What goes wrong:** Multiple independent web sources (Chromium bug-tracker discussions, general web commentary) state or imply that `file://` origins cannot use Web MIDI because they are "insecure." Taking this at face value would trigger D-18's fallback clause (a local static server) for no reason, adding infrastructure the project's own PITFALLS.md Pitfall 16 explicitly warns against building before a real practice session works.

**Why it happens:** The claim conflates `file://` (explicitly special-cased as "Potentially Trustworthy" by the Secure Contexts spec) with genuinely insecure `http://` origins, which Chromium has a *separate*, real deprecation effort for.

**How to avoid:** Trust the direct empirical test in "The `file://` Question" above over secondhand web claims. Do not add a local server task to this phase's plan on the basis of that claim alone.

**Warning signs:** Any plan task titled something like "add a local dev server because file:// can't do Web MIDI."

### Pitfall P2-2: Assuming background-tab throttling will drift the metronome the same way regardless of audio

**What goes wrong:** PITFALLS.md Pitfall 8 (correctly) says to test the metronome with the tab backgrounded for several minutes. A naive read of that instruction might lead to over-engineering a Web-Worker-based scheduler to defeat throttling, when Chrome's own documented behavior already exempts audio-playing tabs.

**How to avoid:** Chrome's background-tab timer throttling explicitly exempts pages playing audible audio, with the exemption lasting a few seconds after audio stops `[CITED: developer.chrome.com/blog/background_tabs]`. Since D-06 requires the click to run continuously from Start to Stop, the tab should stay in the audio-exempt category for the entire session, and the `setInterval`-based polling loop (Pattern 1) should not drift even backgrounded — but this is still worth the literal at-the-piano test D-06/D-08 and the project's own verification ladder call for (background the tab for several minutes, confirm no drift), since this is a Chrome *policy* description, not a guarantee for every Chrome version/OS combination. If drift is ever observed, moving the ~25ms polling loop into a Web Worker (exempt from main-thread throttling entirely `[CITED: developer.chrome.com background-tabs docs]`) is the documented escape hatch — but do not build it preemptively.

### Pitfall P2-3: AudioContext created suspended, never resumed, click never audible

**What goes wrong:** Chrome's autoplay policy starts every `AudioContext` in the `"suspended"` state until a user gesture resumes it — confirmed directly this session (`new AudioContext()` in headless Chrome with no gesture reported `state: "suspended"`). If the plan creates the AudioContext on page load rather than inside the Start-button click handler (or calls `.resume()` there), the metronome will silently produce no sound and no clicks will ever be scheduled, and D-06's click timeline will simply be empty with no error surfaced.

**How to avoid:** Create the `AudioContext` (or call `.resume()` on an already-created one) synchronously inside the Start button's click handler, not on page load and not inside an `async` continuation after an `await` (some browsers only honor the gesture if the resume call is still in the same synchronous task as the click).

**Warning signs:** `audioContext.state` still `"suspended"` after Start is pressed; no audible click but no console error either.

### Pitfall P2-4: Requesting `sysex: true` when it isn't needed

**What goes wrong:** `navigator.requestMIDIAccess({ sysex: true })` triggers a different, more alarming permission prompt (raw device control) and is unnecessary for note-on/note-off/CC64 capture.

**How to avoid:** Call `requestMIDIAccess()` with no options (sysex defaults to `false`) — confirmed this session: after granting only `["midi"]` (not `midiSysex`) permission via CDP, the resulting `MIDIAccess.sysexEnabled` was `false`, and inputs were still enumerable. `[CITED: developer.chrome.com/blog/web-midi-permission-prompt — "Request SysEx messages support ... only if your website absolutely needs this feature"]`.

### Pitfall P2-5: Windows MIDI 1.0 driver exclusivity silently hiding the device

**What goes wrong:** On Windows, some MIDI 1.0 drivers grant exclusive access to a single client; if another application (a DAW, a second browser tab, a MIDI monitor utility) already has the FP-60X's port open, Chrome's `MIDIAccess.inputs` may simply not list it, or `onmidimessage` may never fire, with no explicit error surfaced to the page `[CITED: midi.org/about-web-midi via WebSearch — "some underlying implementations may not be able to support shared access to MIDI devices"]`. MIDI 2.0 changes this (every device becomes multi-client), but the FP-60X's actual driver generation was not verified this session — `[ASSUMED]`, see Assumptions Log A3.

**How to avoid:** D-19 already requires showing connection state in words (connected/disconnected/permission denied) — extend that state machine to include "input not found" distinctly from "permission denied," and document in the UI copy or a checkpoint note that closing other MIDI-using apps (a DAW, another browser tab with this same app open) may be required if the FP-60X doesn't appear in the input list.

**Warning signs:** The FP-60X is powered on and connected via USB, Windows Device Manager sees it, but `access.inputs` is empty or missing it.

### Pitfall P2-6: Relying on `beforeunload` to flush the last buffered writes

**What goes wrong:** `beforeunload` (and any asynchronous work started inside it, including an in-flight IndexedDB transaction) is not guaranteed to complete before the browser actually unloads the page, especially for a background tab closed by the OS or browser process manager `[CITED: multiple sources via WebSearch, e.g. issue discussions cited in web.dev's IndexedDB best-practices piece]`. If the storage layer buffers raw events and only flushes on `beforeunload`, a crash or an abrupt tab close can lose exactly the data D-17/HIST-01 promise never to lose.

**How to avoid:** D-17 already mandates "written as they arrive or in small batches, before anything else touches them" — this is the correct design and should not be weakened to "flush on unload." Use `visibilitychange`/`pagehide` only as an *additional*, best-effort opportunistic flush trigger (e.g., flush any pending debounce buffer early when the tab is hidden), never as the primary durability mechanism. `pagehide` is bfcache-friendly (doesn't prevent back-forward-cache) and is the documented next-best signal after `visibilitychange` `[CITED: developer.mozilla.org Window: pagehide event, via WebSearch summary]`.

**Warning signs:** Any code path that accumulates raw events in a plain in-memory array with the only IndexedDB write happening inside a `beforeunload`/`unload` handler.

## Code Examples

### Testing Web MIDI Headlessly (extends the existing `check-svg-map.cjs` CDP pattern)

CLAUDE.md's documented approach (Playwright's `page.addInitScript()`) has a direct, dependency-free equivalent already usable in this project via the raw DevTools Protocol, confirmed working this session (used to grant MIDI permission and enumerate `access.inputs`):

```javascript
// Sketch for a future scripts/check-midi-capture.cjs, extending check-svg-map.cjs's pattern.
// Page.addScriptToEvaluateOnNewDocument runs BEFORE any page script — the raw-CDP equivalent
// of Playwright's page.addInitScript(), confirmed to exist as a Target-domain-adjacent command
// on the same WebSocket connection check-svg-map.cjs already opens.
const FAKE_MIDI_INIT_SCRIPT = `
  (function() {
    const fakeInput = {
      id: 'fake-fp60x', name: 'Fake FP-60X', onmidimessage: null,
      addEventListener(type, cb) { if (type === 'midimessage') this.onmidimessage = cb; },
    };
    window.__fakeMidiInput = fakeInput; // test harness pokes messages in via this handle
    navigator.requestMIDIAccess = () => Promise.resolve({
      inputs: new Map([[fakeInput.id, fakeInput]]),
      outputs: new Map(),
      sysexEnabled: false,
      onstatechange: null,
    });
  })();
`;
// ws.send(JSON.stringify({ id, method: 'Page.addScriptToEvaluateOnNewDocument', params: { source: FAKE_MIDI_INIT_SCRIPT } }));
// ... then navigate/reload the target page, then drive events:
// evaluate(ws, `window.__fakeMidiInput.onmidimessage({ data: new Uint8Array([0x90, 60, 100]), timeStamp: performance.now() })`);
```
`[CITED: playwright.dev/docs/mock-browser-apis pattern description via WebSearch, adapted to raw CDP]` — the `Page.addScriptToEvaluateOnNewDocument` CDP method itself was not called in this session's tests (only `Runtime.evaluate` and `Browser.grantPermissions` were exercised directly), so its exact param shape here is `[ASSUMED]` based on well-documented CDP surface, not independently re-verified this session — worth a quick spike before the plan depends on it.

### Granting MIDI permission for a headless round-trip check

Confirmed working this session, verbatim from the actual test run:
```javascript
// After opening the WebSocket to the page target (see scripts/check-svg-map.cjs for the connection setup):
await send(ws, 'Browser.grantPermissions', { permissions: ['midi', 'midiSysex'] }); // omit origin to grant broadly
// Now navigator.requestMIDIAccess() resolves instead of rejecting with NotAllowedError.
```
`[VERIFIED: direct CDP call, this session — see "The file:// Question" transcript above]`.

## State of the Art

| Old/Assumed Approach | Current/Verified Approach | When Changed | Impact |
|------------------------|------------------------------|---------------|--------|
| Assume `file://` blocks Web MIDI/needs a local server | `file://` is a Potentially Trustworthy origin per spec; Web MIDI, IndexedDB, and AudioContext all confirmed working from `file://` in the installed Chrome 153 | Verified this session (2026-09-13) | D-18's fallback (local static server) is not needed for this phase — remove it from planning unless a *different* failure surfaces at the piano |
| Web MIDI access silently available, or gated only by sysex | Full Web MIDI API gated behind an Allow/Block permission prompt since Chrome ≥124, regardless of sysex | Chrome 124, rolled out gradually; confirmed still active in the installed Chrome 153 | The plan needs an explicit "waiting for / denied permission" UI state (D-19 already anticipates this: "permission denied" shown in words) |
| `AudioContext.getOutputTimestamp()` as the sole clock-correlation source | Paired-sample `(performance.now(), audioContext.currentTime)` as primary; `getOutputTimestamp()` reserved for `baseLatency`/`outputLatency` diagnostics only | Standing community-reported Chrome inconsistency (not a single dated fix) | Changes D-09's implementation detail without changing its stored contract (D-06's click-timeline shape is unaffected) |

**Deprecated/outdated:** None specific to this phase beyond the above — the rest of the stack (OSMD, `idb`, node:test, the look-ahead scheduler pattern) is unchanged from Phase 1's STACK.md/ARCHITECTURE.md/PITFALLS.md, which remain current.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|-----------------|
| A1 | Chrome's on-disk site-settings persistence treats the bare `"file://"` origin the same way as a normal hostname, so a granted Web MIDI permission survives a full browser restart | "The `file:// ` Question" | If wrong, the user sees a permission prompt every time the app is reopened — an annoyance, not data loss; verify at the first at-the-piano checkpoint (open, Allow, fully quit Chrome, reopen, confirm no second prompt) |
| A2 | `getOutputTimestamp()`'s Chrome-specific jitter is real and current, not an old/fixed bug | Pattern 2, State of the Art | If the jitter report is stale, the extra paired-sample-as-primary design is unnecessary caution, not harmful — low risk either way, but worth a quick live comparison (log both correlation methods' offsets side by side during the D-10 at-the-piano test and see if they diverge) |
| A3 | The Roland FP-60X's specific MIDI driver on this Windows 11 machine does not enforce single-client exclusivity in a way that would hide it from Chrome | Pitfall P2-5 | If wrong, the device simply won't appear in the input list while another app holds it open; the D-19 UI's "input not found" state plus a note to close other MIDI apps is the mitigation, not a code fix |
| A4 | `QuotaExceededError` from an `idb` write reliably surfaces as a rejected promise with `error.name === 'QuotaExceededError'`, matching the pattern in the storage.js code example | Pattern 5, Code Examples | If the error shape differs slightly (e.g. wrapped in a `DOMException` accessed differently), the quota-error UI message in D-17 might not trigger correctly; cheap to verify with a real `node:test` against `fake-indexeddb` forced into a quota-exceeded state, or a manual browser test with a tiny quota override |
| A5 | `Page.addScriptToEvaluateOnNewDocument`'s exact CDP parameter shape (as sketched in the headless-MIDI-mocking code example) works as shown | Code Examples | If the param shape is off, the future `check-midi-capture.cjs` script needs a quick fix; no impact on the shipped app, only on the dev-time verification script |

## Open Questions

1. **Does the Web MIDI permission prompt reappear on every `file://` session, or is it remembered like a normal site?**
   - What we know: the permission prompt exists and gates access (Chrome ≥124); `file://` is a single shared origin string in Chrome.
   - What's unclear: whether Chrome's site-settings persistence layer, which is built around resolvable hostnames, treats `"file://"` as a stable, rememberable entry across full browser restarts.
   - Recommendation: treat as Assumption A1; verify at the very first at-the-piano checkpoint for this phase, since it directly affects whether CAPT-01's success criterion ("sees a live indicator... as they play") requires re-granting permission every session.

2. **Is the paired-sample clock correlation's accuracy good enough at the piano, or does it need periodic re-sampling more aggressively than "once a minute"?**
   - What we know: the standard technique is a single sample at session start, optionally re-sampled; D-09 leaves the re-sampling cadence to the planner's discretion.
   - What's unclear: how much the two clocks drift relative to each other over a 10-20 minute practice session on this specific machine.
   - Recommendation: D-10's own at-the-piano test (play single notes on the click, watch the median offset) is the direct empirical answer here — if the median offset stays flat over a long session, the re-sampling cadence chosen is sufficient; if it drifts over time within a single session, tighten the re-sampling interval.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Chrome (Windows 11) | All of CAPT-01 through CAPT-05, HIST-01 | ✓ | 153.0.8010.36 (well above the M124 MIDI-permission-gate threshold) | — |
| Web MIDI API | CAPT-01 | ✓ (confirmed from `file://`, this session) | — | — |
| Web Audio API / `AudioContext` | CAPT-03 | ✓ (confirmed from `file://`, `baseLatency` 0.01s measured) | — | — |
| IndexedDB | HIST-01 | ✓ (confirmed from `file://`) | — | — |
| `idb` UMD build (CDN) | HIST-01 storage layer | ✓ (fetched and byte-inspected this session) | 8.0.3 | Vendor a local copy of `umd.js` if offline-first ever becomes a requirement (not currently) |
| Internet access (first load only, for CDN fetches) | Bootstrapping OSMD + `idb` on a fresh Chrome profile | Assumed ✓ (same assumption Phase 1 already made and shipped with) | — | Chrome's HTTP cache after first successful load, per README's existing "Internet is needed the first time" note |
| Node.js (dev tooling) | `node:test`, `scripts/check-*.cjs` | ✓ | v24.11.1 (`node:test`'s `mock.timers` confirmed available, useful for scheduler-adjacent test code) | — |
| Roland FP-60X hardware over USB | CAPT-01/CAPT-05 success criterion 5 (10+ pass drill) | Not verifiable from this dev machine — the user's own instrument | — | — |
| `CHROME_EXE` for `scripts/check-*.cjs` | Dev-time headless verification | ✓ (`C:\Program Files\Google\Chrome\Application\chrome.exe`, matches the script's existing default) | — | — |

**Missing dependencies with no fallback:** None identified — every browser API this phase needs is confirmed present and working from the app's actual run path.

**Missing dependencies with fallback:** None currently required; the `idb` CDN dependency has a documented (unused-for-now) vendoring fallback noted above for completeness.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (Node built-in, v24.11.1 on this machine) — same as Phase 1, no new framework |
| Config file | none — Phase 1 set the pattern (`package.json` `"test": "node --test \"test/*.test.cjs\""`) |
| Quick run command | `node --test test/clock.test.cjs test/pass-marker.test.cjs test/pass-segmenter.test.cjs` (new files this phase; run only the changed ones per-task) |
| Full suite command | `npm test` (runs all of `test/*.test.cjs`, Phase 1's `score-model.test.cjs` plus this phase's new files) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|----------------------|--------------|
| CAPT-01 | Raw note-on/note-off/velocity/timestamp decoding, including velocity-0-as-note-off | unit (pure `MidiCapture.decode`) | `node --test test/midi-capture.test.cjs` | ❌ Wave 0 |
| CAPT-01 | Live indicator shows note count/name/velocity/flash, MIDI state in words | manual-only (DOM/visual) | — | n/a |
| CAPT-02 | No per-note grading anywhere in the live indicator | unit (assert the live-readout data shape has no verdict/grade field) | `node --test test/capture-app.test.cjs` (if the state-shaping logic is pulled into a pure function) | ❌ Wave 0 |
| CAPT-03 | Click scheduling math: which beats fall in the look-ahead window, bar/beat numbering across a time-signature change | unit (pure scheduling-math helper extracted from `metronome.js`) | `node --test test/metronome.test.cjs` | ❌ Wave 0 |
| CAPT-03 | Click is audible and doesn't drift over several minutes, including tab backgrounded | manual-only (real hardware/ears; per PITFALLS.md Pitfall 8) | — | n/a |
| CAPT-04 | Marker detection (B7+C8 within ~100ms, spacebar) and pass segmentation (D-01, D-03, D-04, D-07) | unit (pure `PassMarker.findMarkers` / `pass-segmenter.js`) | `node --test test/pass-marker.test.cjs test/pass-segmenter.test.cjs` | ❌ Wave 0 |
| CAPT-05 | Raw events written unmodified, in order, before anything else reads them | unit (`fake-indexeddb`-backed round-trip: write then read back, deep-equal) | `node --test test/storage.test.cjs` | ❌ Wave 0 |
| HIST-01 | Schema migration runs on a fresh DB; quota-exceeded surfaces as a thrown error, not swallowed | unit (`fake-indexeddb`-backed; simulate quota exhaustion) | `node --test test/storage.test.cjs` | ❌ Wave 0 |
| HIST-01 | Reopen restores piece + every recorded pass with note counts; session marked ended; click stopped | integration (headless-Chrome CDP round-trip, extending `scripts/check-svg-map.cjs`'s pattern) | `node scripts/check-storage-roundtrip.cjs` (new, sketch in Code Examples) | ❌ Wave 0 |
| CAPT-02, CAPT-03 (clock relationship, roadmap criterion 2) | Clock correlation math itself (paired-sample conversion formula) | unit (pure `Clock.toAudioContextTime`/`offsetMs`) | `node --test test/clock.test.cjs` | ❌ Wave 0 |
| Roadmap criterion 2 (at-the-piano) | Deliberate on-click notes read near-zero median offset | manual-only, blocking checkpoint | — | n/a |
| Roadmap criterion 5 (at-the-piano) | 10+ pass drill on a ladder file, nothing missing | manual-only, blocking checkpoint | — | n/a |

### Sampling Rate

- **Per task commit:** run the specific new/changed test file(s) for that task's module
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** full suite green, `npm run check` (extended for the new script files), plus the two blocking at-the-piano checkpoints (clock relationship, 10+ pass drill) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `test/clock.test.cjs` — covers the clock-correlation formula, no live AudioContext needed (pure numbers in/out)
- [ ] `test/pass-marker.test.cjs` — covers B7+C8/spacebar marker detection, including the ~100ms window edge cases
- [ ] `test/pass-segmenter.test.cjs` — covers slicing a raw stream into passes per D-03/D-04/D-07 (first pass opens at Start, marker-note exclusion, trailing pass kept only if it has ≥1 non-marker note)
- [ ] `test/midi-capture.test.cjs` — covers `decode()` for note-on, note-off, velocity-0-note-off, CC64/sustain, unknown message types
- [ ] `test/metronome.test.cjs` — covers the pure scheduling-math helper (which clicks fall in a look-ahead window given BPM/time-signature/current position), extracted so it doesn't need a real `AudioContext`
- [ ] `test/storage.test.cjs` — new test harness using `fake-indexeddb`, mirroring `test/osmd-node-env.cjs`'s "install a shim, `require()` the real module, `restore()` after" pattern but for `indexedDB`/`IDBKeyRange` globals instead of DOM globals
- [ ] Framework install: `npm install -D fake-indexeddb` — nothing else needed, `node:test` and the CDP-script pattern are already in place from Phase 1
- [ ] `index.html` + `scripts/check-run-path.cjs`'s `EXPECTED_LOCAL_SCRIPTS` array both need extending together for the seven new `src/*.js` files (see Recommended Project Structure) — this is a Wave 0 concern because the run-path gate will otherwise fail red the moment a new script tag is added

## Sources

### Primary (HIGH confidence)
- Direct empirical test, this session: `window.isSecureContext`, `typeof navigator.requestMIDIAccess`, `navigator.requestMIDIAccess()` before/after `Browser.grantPermissions`, `indexedDB.open()`, `new AudioContext()` — all run against the real installed Chrome 153.0.8010.36 via the DevTools Protocol against a real `file://` URL
- Direct fetch + byte inspection, this session: `https://cdn.jsdelivr.net/npm/idb@8.0.3/build/umd.js` (HTTP 200, defines `globalThis.idb`), plus a self-computed SHA-384 SRI hash for that exact file
- `gsd_run query package-legitimacy check --ecosystem npm idb fake-indexeddb` (seam-verified against live npm registry) — both `OK`
- `npm view idb version`/`time.modified`; `npm view fake-indexeddb version`/`time.modified`/`engines` — run directly against the live registry, this session
- `prototype/piano-app.js:151-152` — read directly this session, velocity-0-as-note-off reference
- `src/score-model.js`, `src/score-renderer.js`, `test/osmd-node-env.cjs`, `test/score-model.test.cjs`, `scripts/check-run-path.cjs`, `scripts/check-svg-map.cjs`, `index.html`, `README.md` — all read directly this session to confirm the project's actual classic-script/no-ESM/flat-`src/` conventions
- [W3C Secure Contexts spec §3.1](https://w3c.github.io/webappsec-secure-contexts/) — fetched this session, confirms `file:` scheme is "Potentially Trustworthy"
- [Chrome for Developers — Access to MIDI devices now requires user permission](https://developer.chrome.com/blog/web-midi-permission-prompt) — fetched this session
- [Chrome for Developers — Background tabs in Chrome 57](https://developer.chrome.com/blog/background_tabs) — via WebSearch, audio-exemption claim
- [web.dev — A tale of two clocks](https://web.dev/articles/audio-scheduling) — carried over from Phase 1's STACK.md, HIGH confidence, canonical look-ahead scheduler reference
- `idb` README (`raw.githubusercontent.com/jakearchibald/idb/main/README.md`) — fetched this session, `openDB`/transaction API shapes

### Secondary (MEDIUM confidence)
- [GitHub WebAudio/web-audio-api Issue #2461](https://github.com/WebAudio/web-audio-api/issues/2461) — via WebSearch, `getOutputTimestamp()` vs `outputLatency` clarification thread, referenced Chrome-vs-Firefox inconsistency report
- [playwright.dev/docs/mock-browser-apis](https://playwright.dev/docs/mock-browser-apis) — via WebSearch, general `addInitScript()` mocking pattern description, no Web-MIDI-specific worked example found
- [midi.org/about-web-midi](https://midi.org/about-web-midi) — via WebSearch, MIDI 1.0 exclusivity / MIDI 2.0 multi-client claims
- [developer.mozilla.org Window: pagehide event](https://developer.mozilla.org/docs/Web/API/Window/pagehide_event) — via WebSearch summary, bfcache-friendliness claim

### Tertiary (LOW confidence)
- General WebSearch-aggregated claims about `file://` being an insecure origin for Web MIDI — explicitly **refuted** by this session's direct empirical test and the W3C spec citation above; retained here only as a documented example of what NOT to carry into planning
- General WebSearch-aggregated claims about IndexedDB quota specifics for `file://` origins specifically — no source directly addressed this; the general Chrome quota model (up to 60% of disk per origin) was found, but its applicability to the `file://` origin specifically is unconfirmed and not load-bearing for this phase's plan

## Metadata

**Confidence breakdown:**
- `file://` platform capability (Web MIDI, IndexedDB, AudioContext): HIGH — direct empirical test against the real target machine, cross-checked against the authoritative W3C spec
- Standard stack (`idb` UMD, `fake-indexeddb`): HIGH — registry-verified, UMD build fetched and byte-inspected directly
- Clock correlation approach: MEDIUM — the paired-sample technique itself is HIGH confidence (canonical, cross-referenced), but the specific claim that `getOutputTimestamp()` is unreliable in the *current* Chrome is MEDIUM (a community report, not a pinned/dated Chromium bug confirmed still open this session) — treat the "use paired-sample as primary" recommendation as prudent design regardless, and use the at-the-piano checkpoint to settle it empirically either way
- Windows MIDI exclusivity with the actual FP-60X: LOW — general Web MIDI/MIDI 1.0 driver behavior is documented, but nothing device-specific to the FP-60X on this exact machine was tested (no MIDI hardware was attached to the research machine)
- Architecture/patterns/pitfalls: HIGH — directly extends Phase 1's own already-HIGH-confidence PITFALLS.md/ARCHITECTURE.md, cross-checked against the actual Phase 1 code this session

**Research date:** 2026-09-13
**Valid until:** ~30 days for the stack/library findings (stable ecosystem); the `file://`/Chrome-permission findings are tied to the specific installed Chrome version (153.0.8010.36) and should be re-spot-checked if the machine's Chrome auto-updates significantly before this phase is executed
