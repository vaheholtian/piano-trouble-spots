# Pitfalls Research

**Domain:** Browser-based MIDI piano practice tool — Web MIDI capture, metronome-anchored timing, MusicXML score alignment, mistake detection and aggregation
**Researched:** 2026-09-13
**Confidence:** HIGH (Web MIDI/Web Audio timing mechanics, MIDI protocol semantics, MusicXML spec structure — verified against MDN, W3C Web MIDI spec, W3C MusicXML tutorial, OSMD docs) / MEDIUM (alignment algorithm failure modes, velocity-to-loudness mapping — synthesized from music-information-retrieval and MIDI practice-tool domain knowledge, not a single citable source)

## Critical Pitfalls

### Pitfall 1: Anchoring all timing to the first played note (the prototype's actual failure)

**What goes wrong:**
The prototype computed every subsequent note's timing relative to when the first note of a pass was played, rather than against a fixed external clock (the metronome). Any error in identifying "the first note" — a stray key touch, a rolled first chord, a slightly early pickup note — throws off every timing judgment for the rest of the pass, and there is no way to tell late playing from a bad anchor.

**Why it happens:**
It's the easiest thing to implement: `t0 = first noteOn.timestamp`, then `delta = noteOn.timestamp - t0`. It feels correct because it's self-consistent within one take. It only breaks down when you need to compare across takes or judge absolute timing (early/late vs. a click), which this project explicitly requires.

**How to avoid:**
Anchor timing to the Web Audio metronome's own scheduled clock (`AudioContext.currentTime`-derived beat times), not to any played note. The metronome defines ground truth; every played note's timestamp is converted into the same clock domain and compared against the nearest expected beat/subdivision. The user starts the metronome, then plays — the first note is just another note to be judged, not a reference point.

**Warning signs:** Any code path with a variable named `startTime`, `t0`, `anchorNote`, or similar that is set from a MIDI event rather than from the audio clock. Timing analysis that "resets" per pass instead of reading from one continuous, monotonic timeline.

**Phase to address:** Metronome + timing-capture phase (must ship before alignment/scoring). Verify by playing intentionally late and intentionally early passes and confirming the reported offsets have the correct sign and magnitude both agree with what was actually played, at the piano, not just in a unit test.

---

### Pitfall 2: Assuming the reference has one true tempo (also an actual prototype failure)

**What goes wrong:**
Treating the score's tempo as fixed and exact (whether from a MIDI reference or a MusicXML `<sound tempo>` marking) means every real human tempo fluctuation — including deliberate rubato, or simply the user's chosen practice tempo differing from the marked tempo — gets misreported as an error.

**Why it happens:**
MusicXML and MIDI both carry a nominal tempo, and it's tempting to trust it as the timing reference instead of asking the user what tempo they're actually practicing at right now.

**How to avoid:**
Make practice tempo an explicit user-set parameter for the metronome (already in requirements: "Practice to a metronome at a tempo the user sets"). Never read tempo from the score file to drive timing judgment — only durations/ratios (quarter note = X, dotted = 1.5x, triplet = 2/3, etc.) scale against the user's chosen BPM. Store the tempo used for each take alongside the take so later aggregation isn't mixing takes recorded at different tempi as if they were comparable.

**Warning signs:** Tempo read from the MusicXML file and used anywhere in scoring logic rather than only for optional display/reference.

**Phase to address:** Metronome phase and Storage/take-recording phase.

---

### Pitfall 3: Refusing to score wrong notes (scoring only timing) — an actual prototype failure

**What goes wrong:**
A tool that only measures timing but treats pitch as unscored, or silently drops notes it can't match, misses the majority of what the user actually wants: "you keep missing a note in that chord," "you play a wrong note in bar 12." Pitch/note-identity mistakes (wrong, missed, extra) are core requirements, not a stretch feature.

**Why it happens:**
Timing-only scoring is a much simpler algorithm — compare N-th played note to N-th expected note by time. True note matching requires a real alignment step (sequence alignment / dynamic time warping style matching) that tolerates insertions, deletions, and substitutions, which is meaningfully harder to build correctly.

**How to avoid:**
Design the alignment engine from day one to classify each expected note as {correct, wrong-pitch, missed} and each played note that doesn't match an expected one as {extra}, using an edit-distance style alignment (e.g., a variant of Needleman-Wunsch/DTW over (pitch, time) tuples) rather than positional 1:1 matching. Build this as the second phase, right after basic MIDI capture + score rendering, not as a late add-on.

**Warning signs:** Any design document or code where "align" only produces a time-offset per note index with no path to represent a skipped or inserted note.

**Phase to address:** Alignment/scoring phase — this is arguably the core technical phase of the whole project and should get the most design scrutiny and deepest phase-specific research (sequence alignment algorithms) before implementation.

---

### Pitfall 4: Building nothing to show on the score (an actual prototype failure)

**What goes wrong:**
A tool that computes mistake data but never renders it back onto the notation is useless for this project's stated purpose — the value is "the score shows the handful of spots... worth working on." A backend-only or console/table-only output was the prototype's terminal failure mode: infrastructure without a usable practice loop.

**Why it happens:**
Score rendering (via a notation library) and mistake-overlay rendering are a genuinely separate, fiddly subsystem from MIDI/alignment logic, and it's tempting to defer "just the display part" indefinitely while polishing the analysis engine, or to build capture/relay infrastructure (as the prototype did) instead of closing the loop to visible feedback.

**How to avoid:**
Treat "score renders, and at least one kind of mark appears on a real note after a real take" as the single earliest end-to-end milestone, even before the analysis is sophisticated. A crude passthrough (e.g., color one wrong note red) proves the rendering pipeline works before investing in richer analysis.

**Warning signs:** Roadmap phases ordered so that MIDI capture, alignment, and aggregation are all "done" before score rendering is even started. Any phase plan where score display is the last item rather than an early, thin vertical slice.

**Phase to address:** Should be pulled forward — an early phase should render the score and place at least one type of annotation, even trivially, to prove the full pipeline before deepening any single part of it.

---

### Pitfall 5: Web MIDI timestamp and driver quirks silently corrupting timing data

**What goes wrong:**
`MIDIMessageEvent.timeStamp` is a `DOMHighResTimeStamp` relative to the *page's* time origin (same clock as `performance.now()`), not wall-clock or `AudioContext.currentTime`. Mixing it with `AudioContext.currentTime` (a different, audio-hardware-anchored clock with its own origin) without an explicit conversion silently misaligns every comparison, typically by a roughly constant but non-zero offset that looks like "all notes are consistently early/late" — an easy bug to misdiagnose as a real playing habit. On Windows, USB-MIDI driver/OS scheduling can add a few milliseconds of jitter to `timeStamp`, and in some Chrome versions/OS combinations MIDI event timestamps have been reported as batched or coarser than expected. Chrome also intentionally reduces `timeStamp` precision for fingerprinting protection (rounded to ~0.1 ms, coarser in some configurations) — not usually significant here, but worth knowing.

**Why it happens:**
It's natural to assume "high res timestamp" means "same clock everywhere in the browser." Web MIDI and Web Audio are separate specs with separately defined clocks that happen to both look like milliseconds/seconds-since-some-origin.

**How to avoid:**
Establish one explicit conversion point at startup: capture a single `(performance.now(), audioContext.currentTime)` pair (or resync periodically) and use it to convert every incoming `MIDIMessageEvent.timeStamp` into the `AudioContext` clock domain before any comparison against scheduled metronome beat times. Never compare a raw MIDI timestamp against a raw `AudioContext.currentTime` value directly. Sanity-check on real hardware: play notes in time with an audible click and confirm reported offsets are near zero, not offset by a constant.

**Warning signs:** Reported timing errors that are suspiciously uniform across an entire pass (e.g., "every note is 40ms late") rather than varying naturally — a strong sign of an uncorrected clock-domain offset, not a real playing habit.

**Phase to address:** MIDI capture phase (establish the clock-conversion utility here, unit-test it, and reuse everywhere) and Metronome phase (do the actual cross-clock testing at the piano).

---

### Pitfall 6: Mishandling running status, note-on velocity 0, and note lifecycle

**What goes wrong:**
Raw MIDI (relevant if any MIDI-file reference or MIDI-in fallback is ever parsed, and conceptually relevant to any hand-rolled parsing utilities reused from the prototype) uses running status, where consecutive messages of the same type omit the repeated status byte — a naive per-message parser that assumes every message starts with a status byte will misread the stream. Separately, a Note On message with velocity 0 is defined by the MIDI spec to mean Note Off (this convention exists specifically to exploit running status), so any code that only treats explicit Note Off (0x8n) messages as note-endings will see notes as "stuck on" or will double-count releases. The Web MIDI API itself delivers already-parsed, complete messages per event (not raw running-status bytes) for standard input, which removes some of this risk for live Web MIDI input — but it resurfaces if the app also parses `.mid` files directly (e.g., a reused reference-tempo MIDI, or the prototype's parser) or reads from any non-Web-MIDI byte stream.

**Why it happens:**
The spec detail is easy to miss because most test MIDI files/keyboards send explicit Note Off, so the velocity-0 case only shows up with certain DAWs, certain keyboards' internal firmware, or certain generated files — it can lurk undetected for a long time.

**How to avoid:**
Wherever raw MIDI bytes are parsed (not needed for live Web MIDI note capture itself, but relevant to any `.mid` reference-file handling reused or rebuilt from the prototype), implement running status correctly and treat `noteOn velocity==0` identically to `noteOff` everywhere without exception.

**Warning signs:** Notes that never seem to end in recorded data, or duration values that are implausibly long for specific input sources.

**Phase to address:** MIDI capture phase (if/when any raw MIDI file parsing is (re)built — reference the prototype's parser as noted in PROJECT.md, and specifically re-verify this handling rather than assuming the reused code already does it right).

---

### Pitfall 7: Sustain pedal CC64 ignored or mishandled, causing false "held/overlapping note" mistakes

**What goes wrong:**
CC64 (sustain pedal) is a switch (0–63 = off, 64–127 = on) but some keyboards/DAWs send continuous intermediate values, and half-pedaling is not reliably represented at all by CC64. If the alignment/duration logic ignores the pedal entirely, legitimately pedaled/overlapping note durations can look like "held too long" or spurious sustain can make note offsets or "extra note" detection noisy. Conversely, if a pedal-up message is ever dropped (dropped MIDI packet, USB hiccup), notes can appear to sustain indefinitely in captured data.

**Why it happens:**
Requirements explicitly exclude pedal *assessment* ("Pedal ... assessment — not measurable reliably from MIDI note data," per PROJECT.md), which is correct, but that's different from *ignoring pedal state when interpreting note durations* — the two get conflated.

**How to avoid:**
Capture and store CC64 events even though the product won't score pedal technique — they're useful context for a human reviewing an anomaly, and may matter later for correctly not penalizing pedal-sustained note overlap as "wrong". Don't let note-off detection or duration-based dynamics inference (if ever added) assume clean note boundaries without checking whether the pedal was down.

**Warning signs:** Any "note held for implausibly long" mistake type firing frequently in real sessions where the user is using the pedal normally.

**Phase to address:** MIDI capture phase (store CC64 alongside notes) — explicitly out of scope for *scoring*, but in scope for *not corrupting* other scoring.

---

### Pitfall 8: setTimeout/setInterval-driven metronome click, causing audible and measurable drift

**What goes wrong:**
A metronome built on `setTimeout`/`setInterval` alone drifts because JS timers are not guaranteed to fire on time — main-thread work, GC pauses, and (critically) background-tab throttling (browsers can throttle timers to ~1/sec in inactive tabs) all introduce drift on the order of 10–25ms per beat or worse. Since this project's entire timing model depends on the metronome being the trustworthy reference clock (Pitfall 1's fix), a drifting click makes every "early/late" judgment meaningless — the tool would be measuring drift in its own click, not the user's timing.

**Why it happens:**
`setInterval(click, msPerBeat)` is the obvious first implementation and sounds fine to casual listening even though it's measurably imprecise; the audible click can seem correct while the underlying scheduled times used for comparison are wrong.

**How to avoid:**
Use the standard Web Audio look-ahead scheduler pattern (the "Chris Wilson" approach documented by web.dev/A tale of two clocks): a `setInterval`/`setTimeout` loop running frequently (~25ms) only decides *which* upcoming beats need scheduling, while the actual click sound and — critically — the *authoritative beat timestamps used for scoring* are scheduled against `AudioContext.currentTime` with a short lookahead window (~100ms), not against the JS timer firing time. Store the precisely scheduled beat times (not the timer-callback time) as the ground truth for alignment.

**Warning signs:** Metronome clicks that sound fine but drift audibly out of sync with a physical reference metronome over 30+ seconds, or the app's own reported timing errors trending in one direction over a long pass.

**Phase to address:** Metronome phase — should be its own small, rigorously tested phase before it's trusted as scoring ground truth. Verify with a stopwatch/reference metronome test, and by running it for several minutes with the browser tab in the background to confirm no throttling-induced drift.

---

### Pitfall 9: MusicXML structural edge cases breaking a naive score model

**What goes wrong:**
A parser/model built only against simple single-voice, single-staff, no-repeat examples will break (silently produce wrong bar/beat positions, wrong note counts, or crash) on real scores, which routinely include: compressed `.mxl` (zip container, not raw XML — needs unzipping before parsing); ties (same pitch held across a barline/note boundary, no re-attack) vs. slurs (phrasing marks, no duration effect) being visually similar but semantically opposite for alignment purposes — a tie must **not** be treated as a second note-onset, while a slur must not suppress one; grace notes (zero or near-zero notated duration, `<grace>` element, no `<duration>` in some forms) which must not be forced into the beat-position grid the same way as normal notes; tuplets (`<time-modification>`) which change effective duration without changing the notated type; repeats and voltas (`<repeat>`, `<ending number="1,2">`) which mean the "linear" sequence of notes to play is not simply the document order — a passage may need to be *expanded* into its actual played order before it can be compared to a take; multiple voices per staff (`<voice>` elements) and cross-staff notes/beaming (`<staff>` per note, notes moving between grand-staff hands) which break any model that assumes "one note per beat position per staff"; pickup/anacrusis measures (partial first measure, `<attributes><time>` vs. actual measure duration mismatch) which break beat-position math anchored at measure boundaries; and divisions changes (`<divisions>` can change mid-piece, and is per-part) which break any code that hardcodes a single ticks-per-quarter-note value for the whole piece.

**Why it happens:**
Hand-rolled or lightly-tested MusicXML readers are usually built and tested against one exported file from one notation program (e.g., MuseScore) on one simple piece, which doesn't exercise these cases; they only surface once the user loads a piece they actually want to practice, at which point the failure is confusing and hard to localize.

**How to avoid:**
Use a mature, actively maintained MusicXML parsing/rendering library (e.g., OpenSheetMusicDisplay, which wraps VexFlow and handles the structural parsing) rather than hand-rolling a MusicXML reader — this project only needs to *interpret* the resulting note graph for alignment, not re-solve MusicXML parsing. Even then, explicitly test against the W3C/MakeMusic "unofficial MusicXML test suite" (a public regression corpus covering ties, slurs, grace notes, tuplets, repeats/voltas, multi-voice, and more) and against at least one real, non-trivial user piece (with repeats, a pickup measure, and two-hand grand staff) before trusting the alignment engine, not just a single-voice C-major scale export.
- Ties: collapse into one continuous note event for alignment purposes; never a separate onset.
- Repeats/voltas: expand the score into its actual playable sequence (respecting the chosen passage/repeat structure) before generating the expected-note sequence to align against — do this once at load/passage-selection time, not per-take.
- Grace notes: decide and document a policy explicitly (e.g., "grace notes are optional for alignment matching, not required for a note to count as correct") rather than letting it fall out of unspecified default behavior.
- Divisions: always read `<divisions>` per-part and recompute at each `<attributes>` element that changes it; never assume one global value.

**Warning signs:** Beat/bar position drifting increasingly wrong as a piece progresses (classic divisions or pickup-measure bug); alignment failing specifically on pieces with a repeat sign or a pickup measure while working fine on simple scales; tied notes showing up as "extra" or duplicate onsets.

**Phase to address:** Score loading/rendering phase, with a dedicated verification pass (against the MusicXML test suite plus a real user piece) before the alignment phase begins — a broken score model poisons every downstream mistake-detection feature.

---

### Pitfall 10: Alignment falsely reporting "wrong note" for ornaments, doublings, chords, and normal restart behavior

**What goes wrong:**
A rigid note-for-note matcher will misclassify musically-correct variation as mistakes: ornaments/trills played with extra notes not literally notated as separate pitches; octave doublings or voicing choices in chords; a chord that's rolled/arpeggiated by the player (notes technically not simultaneous, but musically "one chord") being read as wrong timing or extra notes per note; repeated notes at the same pitch being ambiguously matched to the wrong occurrence in the score, causing a cascade of misalignment for everything after; a user simply stopping mid-passage and restarting a few bars back without pressing the "new pass" boundary key, which — without restart-detection — corrupts the whole take's alignment as the engine tries to match a discontinuous sequence to a linear expected sequence.

**Why it happens:**
These are exactly the situations a positional or greedy nearest-match alignment algorithm handles badly, because they all involve either non-1:1 note correspondence or breaks in monotonic time — and they are *extremely common* in real practice (arguably the majority of what a passage repeated 20+ times will contain), not edge cases.

**How to avoid:**
- Use an alignment algorithm designed for insertions/deletions/substitutions (edit-distance/DTW-style, as in Pitfall 3), which naturally tolerates extra or missing notes rather than needing special-cased rules for each ornament type.
- Treat a chord as a *set* of expected onsets within a small time window rather than as N independently-timed notes; score "wrong timing" against the chord's own onset-time spread, not against a fixed absolute time per note.
- Detect non-monotonic MIDI timestamps within a pass (a new note's time earlier than, or implausibly discontinuous from, the previous one) as a strong signal the user restarted without marking a new pass — surface this to the user rather than silently mis-scoring it (e.g., prompt "did you restart?" or auto-split into two passes).
- For trills/ornaments, since the requirement explicitly excludes "articulation... assessment" as unreliable, keep the policy simple and conservative: don't try to validate ornament *execution*, only match the framing notes; make this an explicit, documented scope decision rather than an emergent bug.

**Warning signs:** A single messy take producing a wildly implausible number of "wrong note" flags (a strong signal of alignment cascade failure, not real mistakes) — this is exactly the kind of thing the aggregation-vs-single-take pitfall (below) should catch if surfaced honestly.

**Phase to address:** Alignment/scoring phase — this should include explicit test cases (rolled chords, a restart mid-pass, a repeated-note passage) verified at the real piano, not only synthetic unit tests, before the phase is considered done, per the project's own verification constraint.

---

### Pitfall 11: Treating MIDI velocity as a linear, absolute, or cross-instrument-comparable loudness measure

**What goes wrong:**
MIDI velocity (0–127) is not a linear measure of perceived loudness, and its mapping to actual dB/perceived volume is instrument- and even preset-dependent (the Roland FP-60X's velocity curve is its own thing, not a universal standard) — so any comparison that assumes velocity differences are proportionally meaningful loudness differences, or that a fixed velocity threshold means "loud," will misjudge dynamics. Chord voicing makes this worse: the same musical intent (an accented top note in a chord) can be played with very different absolute velocities depending on hand position and voicing, so absolute-velocity comparisons across different chords are unreliable even within one player's own playing.

**Why it happens:**
Velocity is a convenient single number that looks like "how hard the note was hit," so it's tempting to treat it as directly comparable across notes, chords, and sessions.

**How to avoid:**
This is already partly protected by the project's own scope decision: "relative dynamics only... never compared to a reference performance." Extend that same discipline within a single pass: compare a note's velocity only to its *immediate neighboring notes* (as the requirement states — "louder or softer than their neighbouring notes in the same pass"), not to a fixed threshold or to notes many bars away, and not across different sessions/takes at different times unless normalizing per-take (e.g., z-score within the pass) rather than comparing raw velocity numbers. For chords, compare voicing-aware: within-chord relative balance (is the melody note louder than the accompaniment notes in *this* chord) rather than a chord's average velocity against another chord's.

**Warning signs:** Dynamics findings that don't match what the user's ear/memory says happened, especially findings framed as "note X was too loud" using an absolute number rather than "note X was louder than its neighbours here."

**Phase to address:** Dynamics-detection phase (later requirement) — explicitly design the comparison window (which neighbors count) before implementing, and verify against the user's own judgment at the piano.

---

### Pitfall 12: Trusting a single take instead of building and presenting honest aggregate statistics

**What goes wrong:**
This is the project's actual stated core value ("many repetitions... trusts it") and its most important non-technical pitfall: showing a mistake found in one pass with the same visual weight as a mistake found in 18 of 20 passes destroys the tool's credibility, because a single pass is not representative (explicitly out of scope: "Grading a single take as pass or fail — one pass means nothing"). Equally, silently averaging away information (e.g., showing only a final "problem" flag with no counts) hides whether a "problem" bar is a rock-solid habit or a fluke, which is exactly the distinction the user wants.

**Why it happens:**
It is much simpler to implement a per-take result view and stop there; aggregation across an arbitrary, growing number of takes (needing running/incremental statistics, not batch recomputation) and honest uncertainty display (e.g., "flagged in 3 of 4 passes" vs. "flagged in 3 of 20 passes" reads very differently, but both might show as "3 times" if not normalized) is a genuinely harder data-design problem.

**How to avoid:**
Store per-note, per-take raw results (not just a running tally) so aggregation is always recomputable and auditable. Always present counts as a fraction/rate (e.g., "missed in 6 of 22 passes," "consistently late in the last 10 passes but not before") rather than a raw count alone, so trend and volume are both visible — this is also what lets the user see improvement over weeks, an explicit requirement. Consider recency-weighting or trend display (is a habit shrinking) rather than only cumulative counts, since the product's success criterion is habits shrinking over time, not just being logged.

**Warning signs:** Any UI mockup or data model that stores only a running total/percentage per note without the underlying per-take breakdown; any design where "3 mistakes" is shown without stating out of how many attempts.

**Phase to address:** Aggregation phase — should be designed alongside the storage schema (Pitfall 14) from the start, since retrofitting per-take raw storage after building only aggregate counters is a costly rework.

---

### Pitfall 13: Score-annotation UI losing or misplacing marks across re-renders

**What goes wrong:**
Notation rendering libraries (e.g., OpenSheetMusicDisplay/VexFlow, which OSMD wraps) frequently need a full re-render for many option or layout changes, which can invalidate previously-obtained references to individual note DOM/SVG nodes if annotations were attached by ad hoc DOM manipulation rather than through the library's own model. Overlaying mistake markers by directly poking SVG nodes obtained once, then triggering any re-render (window resize, transposition, zoom, passage change), silently loses or misplaces the overlay. Separately, mapping "this MusicXML note" to "this rendered graphical note" is not always 1:1 or stable — ties, chords, and cross-staff notes can make simple index-based mapping brittle across re-renders or across score edits.

**Why it happens:**
It's fast to grab a note's SVG element once and color it; the failure only appears on the second interaction (resize, replay, passage switch), which is easy to miss in a quick demo/test but happens constantly in real use.

**How to avoid:**
Drive annotation through the rendering library's own stable identifiers (e.g., a note's underlying MusicXML `id`/timing position rather than a transient DOM node reference), and re-apply the annotation layer after every render call rather than assuming it persists — treat "render" as always producing a fresh visual state that annotations are layered onto, not a one-time paint. Build the mistake-overlay logic as a separate, idempotent "apply annotations to current render" function callable after any render trigger.

**Warning signs:** Annotations that disappear or shift position after resizing the window, changing zoom, or navigating between passages — test this explicitly, it won't show up in a single static screenshot.

**Phase to address:** Score rendering / annotation phase. Explicitly test resize + passage-switch + repeat-playback scenarios, not just first paint.

---

### Pitfall 14: Colour-only mistake encoding and other UI choices that don't hold up under real practice conditions

**What goes wrong:**
Encoding mistake *type* (wrong pitch vs. missed vs. extra vs. early/late vs. dynamics) purely by hue is inaccessible to colour-blind users and, more practically for this single-user project, is genuinely hard to read at a glance on a laptop screen propped on/near a music stand at a normal reading distance, especially for closely-related hues. A related but distinct pitfall: encoding *severity/frequency* only by colour intensity (e.g., a gradient from light to dark red) is very hard to distinguish at a glance and doesn't scale to "6 of 22 passes" vs "18 of 22 passes" being visually different enough to trust.

**Why it happens:**
Colour is the first tool reached for and looks great in a demo screenshot at full zoom on a dev monitor; it's not tested at actual practice viewing distance/lighting, nor against the requirement that the user needs to *trust* what's shown, which needs more than a subtle shade difference.

**How to avoid:**
Pair colour with a redundant encoding — shape/marker (e.g., different marker per mistake type: circle for wrong pitch, X for missed, small tag for timing), and use text (a small count label like "6/22") rather than relying on colour intensity alone to convey frequency/confidence. Choose a colour-blind-safe palette (avoid red/green as the only distinguishing pair) if colour is used at all as a secondary cue.

**Warning signs:** A legend that only differentiates mistake types by colour swatches; any confidence/frequency encoding that's only a colour gradient with no numeric label.

**Phase to address:** Score annotation/UI phase, informed by the aggregation phase's data (Pitfall 12) — design the encoding once real aggregate data (counts, rates) exists to display, not before.

---

### Pitfall 15: localStorage limits, schema drift, and losing raw take data

**What goes wrong:**
`localStorage` has a small per-origin size ceiling (commonly ~5–10MB depending on browser) and is synchronous string-only storage — storing raw per-note, per-take MIDI event data (needed for honest aggregation, per Pitfall 12) for many pieces over weeks of practice can plausibly approach or exceed this, especially if raw timestamps/velocities for every note of every pass are kept indefinitely. Separately, any local schema for stored practice history will need to change as features are added (new mistake types, new metadata) — without a migration story, old stored data becomes unreadable or silently ignored after an update, defeating the explicit requirement to see trouble spots shrink "across sessions... over weeks."

**Why it happens:**
`localStorage` is the fastest thing to reach for for a "just make it persist" first pass, and schema versioning is easy to skip when there's only ever been one schema version so far.

**How to avoid:**
Use IndexedDB (not `localStorage`) for practice history from the start — it has a much larger practical quota, is asynchronous (won't block the UI), and supports structured data better than string serialization; reserve `localStorage` at most for small settings/preferences. Version the stored schema explicitly from day one (a `schemaVersion` field) with a migration function run on load, even when there's only one version so far, so the pattern exists before it's urgently needed. Since the requirement already calls for file export/import as the durability mechanism ("history must survive a browser reset via export"), make sure the exported file format is also versioned and is the same raw-data granularity as what's stored — don't let export be a lossy summary while local storage keeps the detail, or export becomes a downgrade.

**Warning signs:** Any storage write path that doesn't check/handle a `QuotaExceededError`; any stored-data reader that doesn't check a version field before assuming the current shape; export files that contain only aggregates, not raw per-take data.

**Phase to address:** Storage/persistence phase — should be designed early (schema + IndexedDB + versioning) even if some features/mistake-types are added later, since retrofitting migrations after real user data exists is riskier than the user losing nothing today.

---

### Pitfall 16: Building infrastructure (relay, Bluetooth bridge, hardening) before one real practice session — the prototype's core process failure

**What goes wrong:**
The prototype spent multiple sessions on a phone-to-laptop LAN relay and Bluetooth MIDI bridging on Windows, and on general hardening, without ever completing one real, useful practice session end-to-end. Per PROJECT.md this is explicitly named as the root failure mode to avoid, and is reinforced by the constraint that "Architecture: ... no build step required to run" and "Phone or tablet on the music stand, and the LAN relay ... deferred; laptop with USB cable first."

**Why it happens:**
Infrastructure work (networking, pairing, driver workarounds) has visible, satisfying incremental progress and clear technical subproblems to solve, which makes it easy to keep pulling on that thread instead of confronting the harder and fuzzier problem of "does the actual mistake-detection loop work and feel useful," which can only be validated at the instrument.

**How to avoid:**
Enforce the project's own stated constraint literally: USB-only, laptop-only, no relay, no Bluetooth, no server, for the entirety of this milestone — treat any proposal to build networking/pairing infrastructure as explicitly out of scope and a red flag if it resurfaces. Sequence the roadmap so the very first phases produce a working, if crude, end-to-end loop (play a few notes on the USB-connected piano, see *something* land on the score) before any phase adds sophistication to any one part of the pipeline. Apply the project's own verification constraint literally and early: every phase gets tried at the real piano before being called done — not deferred to a later "integration testing" phase.

**Warning signs:** Any roadmap phase whose deliverable is a technical capability (a parser, an algorithm, a data model) with no user-visible, played-at-the-piano output by the end of that phase. Any discussion of networking, phones, tablets, or Bluetooth resurfacing in milestone 1 planning.

**Phase to address:** This is a roadmap-structuring concern more than a single phase — it should shape phase *ordering* (thin vertical slices ending in a played, visible result) across the whole milestone, and the project's own "Verify every phase at the actual piano" requirement should be a literal gate on every phase's definition of done.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Positional (index-based) note matching instead of edit-distance alignment | Ships alignment faster | Cascading misalignment on any wrong/missed/extra note corrupts the rest of the pass's scoring (Pitfall 3, 10) | Never for the core alignment engine; fine only for a disposable early proof-of-concept before the real engine is built |
| Reading tempo from the score file instead of requiring user-set metronome tempo | Slightly less UI to build early | Reintroduces the prototype's "assumed exact tempo" failure (Pitfall 2) | Never |
| Attaching annotations directly to SVG nodes instead of through stable note IDs | Faster first implementation | Breaks on any re-render (Pitfall 13) | Only for a disposable spike/demo, not the shipped annotation layer |
| Storing only aggregate counters, not per-take raw data | Simpler storage schema, less data | Cannot show honest rate ("X of Y passes"), cannot recompute after fixing an aggregation bug, cannot support later analyses (Pitfall 12, 15) | Never — raw per-take storage is cheap enough at this scale (one user, MB not GB) that there's no good reason to skip it |
| Hand-rolling a MusicXML parser instead of using a maintained library | Full control, no dependency | Near-certain to mishandle ties/voices/repeats/divisions correctly (Pitfall 9); reinvents a large, well-solved problem | Only if a specific OSMD/VexFlow limitation genuinely blocks a requirement — verify that's actually true before hand-rolling |
| `localStorage` instead of IndexedDB for practice history | Simpler API to start | Quota ceiling hit after weeks of real use, exactly when the tool is proving its value (Pitfall 15) | Only for small settings, never for take history |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|-------------------|
| Web MIDI API | Assuming `MIDIMessageEvent.timeStamp` is in the same clock domain as `AudioContext.currentTime` | Explicitly convert via a captured `(performance.now(), audioContext.currentTime)` reference pair (Pitfall 5) |
| Web MIDI API | Assuming a MIDI input's identity/port is stable across a session (USB replug, driver re-enumeration on Windows) | Handle `onstatechange` and re-acquire/validate the selected input rather than caching a device reference indefinitely |
| Web Audio API | Using `setInterval`/`setTimeout` timer-callback time as the scheduled click time used for scoring | Use the look-ahead scheduler pattern; use `AudioContext.currentTime`-scheduled times as ground truth, not JS timer firing time (Pitfall 8) |
| MusicXML / OSMD (or chosen renderer) | Treating the renderer's default linear playback order as the actual note sequence when repeats/voltas exist | Explicitly expand repeats/voltas for the selected passage before generating the expected-note sequence to align against (Pitfall 9) |
| MusicXML `.mxl` | Assuming all user-supplied files are uncompressed XML | Detect and unzip `.mxl` (it's a zip container) before XML parsing, or rely on a library that already handles this |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Re-running full aggregation over all stored takes on every UI update | UI lag/jank appearing only after many practice sessions accumulate | Maintain incremental/running aggregates updated per new take, recomputed from raw data only when needed (e.g., after a data migration) | Noticeable after tens to low hundreds of takes per piece, exactly the regime this tool is meant to operate in ("more than 20 times" per passage, across many sessions) |
| Full OSMD re-render on every annotation update instead of only after data/layout changes | Visible flicker or delay after each pass, more so on longer scores | Separate "apply annotation overlay" (cheap, no full re-render) from "re-render score" (only on load/passage/layout change) — see Pitfall 13 | Noticeable on longer pieces or slower laptops once annotation updates happen frequently (e.g., live during/after each pass) |
| Storing full raw MIDI event streams indefinitely with no pruning/compaction strategy | Slow app startup, storage quota pressure over months of use | Keep raw per-note data (needed for honest aggregation) but consider compacting old sessions' redundant metadata; use IndexedDB, not localStorage (Pitfall 15) | Becomes relevant after weeks/months of regular use across many pieces — worth designing for, not urgent for MVP |

## Security Mistakes

This is a local, single-user, browser-only, no-server tool per explicit constraints, so most conventional web security concerns (auth, injection, XSS from remote data) don't apply. The relevant domain-specific risks are narrower:

| Mistake | Risk | Prevention |
|---------|------|------------|
| Loading arbitrary user-supplied MusicXML/`.mxl` files without bounds checking | A malformed or malicious zip (`.mxl`) or deeply nested/huge XML could cause excessive memory use or a hang (zip-bomb-style risk, even if unintentional from a corrupted export) | Bound decompression size and parse depth/time when reading uploaded files, consistent with the prototype's prior hardening of `parseMidi` memory bounds — apply the same discipline to MusicXML/`.mxl` loading |
| Treating imported history/export files as fully trusted on re-import | A corrupted or hand-edited export file could crash the import path or silently corrupt existing stored history | Validate schema/version and sanity-check ranges (velocities 0-127, plausible timestamps) on import before merging into storage |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Requiring the user to leave the piano to interact with the computer between passes | Breaks practice flow, discourages doing 20+ repetitions | Manual pass-boundary marking via spacebar/pedal/spare key at the keyboard itself, as already specified in requirements — keep this the primary interaction, not a mouse-driven UI |
| Showing raw per-note data or a wall of numbers instead of the score itself as the primary view | User has to translate abstract data back onto the music mentally — exactly what this tool is meant to avoid (replacing a tutor's verbal feedback) | Score-first UI: the annotated notation is the primary and default view, not a secondary tab/table |
| Giving equal visual weight to a single-pass slip and a persistent habit | Erodes trust in the tool (the core value proposition) if not distinguished | Encode frequency/rate visibly, not just presence (Pitfall 12, 14) |
| No way to see progress over time (only "current state") | Undermines the explicit "see trouble spots shrink over weeks" requirement | Persist and surface a trend view per trouble spot across sessions, not just the latest session's aggregate |

## "Looks Done But Isn't" Checklist

- [ ] **MIDI capture:** Often missing clock-domain conversion between `MIDIMessageEvent.timeStamp` and `AudioContext.currentTime` — verify by checking whether reported timing offsets are ever a suspicious constant across an entire pass (Pitfall 5)
- [ ] **Metronome:** Often missing a true look-ahead scheduler — verify by leaving the tab in the background for a few minutes and checking the click hasn't drifted or stalled (Pitfall 8)
- [ ] **Score loading:** Often missing repeat/volta expansion, tie handling, and per-part divisions changes — verify against a real piece with a pickup measure, a repeat sign, and two-hand grand staff, not just a single-voice scale (Pitfall 9)
- [ ] **Alignment:** Often missing tolerance for chords/rolled chords, repeated notes, and mid-pass restarts — verify by deliberately rolling a chord and deliberately restarting mid-passage without marking a new pass, and checking the result is still sane (Pitfall 10)
- [ ] **Dynamics:** Often missing neighbor-relative (not absolute or cross-take) comparison — verify a flagged "loud note" actually sounds loud relative to its neighbors when replayed, not just a high raw velocity number (Pitfall 11)
- [ ] **Aggregation:** Often missing per-take raw storage behind the aggregate — verify by checking whether a mistake count can be broken back down into "X of Y passes," not just a bare total (Pitfall 12)
- [ ] **Score annotation:** Often missing persistence across re-render — verify by resizing the window or switching passages after annotations appear, and confirming they're still correctly placed (Pitfall 13)
- [ ] **Storage:** Often missing schema versioning and IndexedDB (vs. localStorage) — verify by checking there's a `schemaVersion` field and that a quota-exceeded write path is handled, not just the happy path (Pitfall 15)
- [ ] **Every phase, generally:** Often "done" per automated tests but never played at the real piano — verify per the project's own explicit constraint that no phase counts as done until tried at the instrument (Pitfall 16)

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| Timing anchored to first note instead of metronome clock (Pitfall 1) | MEDIUM | Rework the timing-capture layer to consume scheduled beat times as ground truth; old stored takes without a metronome-clock reference may need to be discarded or re-derived if raw MIDI timestamps plus the take's original metronome settings were preserved |
| Positional alignment instead of edit-distance alignment (Pitfall 3, 10) | HIGH | Replace the core alignment algorithm; because raw per-take note data should already be stored (per Pitfall 12's prevention), historical takes can be re-aligned with the corrected algorithm without re-collecting data, provided raw data was in fact kept |
| localStorage quota exceeded mid-use (Pitfall 15) | MEDIUM | Migrate to IndexedDB; if data was already lost due to quota eviction before the fix, there is no recovery for that lost data — this is why prevention (do it before quota pressure hits) matters more than recovery here |
| Annotations breaking on re-render (Pitfall 13) | LOW | Rework the annotation layer to re-apply after every render call using stable note IDs; no data loss, purely a rendering-layer fix |
| Score model breaking on repeats/ties/divisions (Pitfall 9) | MEDIUM-HIGH | Depends on whether the parsing library itself was wrong (swap/fix library — moderate) vs. a bespoke interpretation layer on top of a correct library output (rework the interpretation layer — the library's raw model is usually still correct and reusable) |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| Anchoring to first note, not metronome (1) | Metronome + timing-capture phase | Play deliberately early/late passes at the piano; reported offsets match reality in sign and rough magnitude |
| Trusting score's own tempo (2) | Metronome phase | Practice tempo is always a user-set control; score's own tempo marking, if displayed, never feeds scoring math |
| Refusing to score wrong notes (3) | Alignment/scoring phase | Deliberately play a wrong note and a missed note in a test passage; both are correctly classified, not just timing |
| No visual on the score (4) | Early, pulled-forward "first visible loop" phase | A real take produces at least one visible mark on the rendered score, before deeper analysis features exist |
| Web MIDI/Web Audio clock mismatch (5) | MIDI capture phase | Reported timing offsets aren't a uniform constant across an in-time pass |
| Running status / velocity-0 note-off (6) | MIDI capture / file-parsing phase | Notes from test files with velocity-0 note-offs and running status parse with correct durations |
| Sustain pedal ignored, corrupting duration logic (7) | MIDI capture phase | Pedaled passages don't trigger spurious "held too long" flags |
| setTimeout-driven metronome drift (8) | Metronome phase | No audible/measured drift against a reference metronome over several minutes, including with the tab backgrounded |
| MusicXML structural edge cases (9) | Score loading/rendering phase | Loads and correctly represents a real piece with repeats, pickup measure, ties, and two-hand grand staff, not just a scale |
| False positives from chords/ornaments/restarts (10) | Alignment/scoring phase | Rolled chords, repeated notes, and a deliberate mid-pass restart don't produce an implausible flood of "wrong note" flags |
| Velocity treated as absolute/linear loudness (11) | Dynamics-detection phase | Flagged loud/soft notes match the user's own ear when replayed; comparisons are always neighbor-relative |
| Single-take trust instead of aggregate honesty (12) | Aggregation + storage phase (designed together) | Every displayed mistake count is shown as a rate ("X of Y passes"), and per-take raw data is recomputable |
| Annotations lost on re-render (13) | Score rendering/annotation phase | Annotations survive window resize, zoom, and passage switching |
| Colour-only, unreadable encoding (14) | Score annotation/UI phase | Mistake type and frequency are each distinguishable without relying on colour alone; legible at normal practice viewing distance |
| localStorage limits and schema drift (15) | Storage/persistence phase | Schema has a version field with a migration path tested end-to-end; storage uses IndexedDB; quota-exceeded is handled, not silently swallowed |
| Infrastructure before a real practice session (16) | Roadmap structure as a whole | Every phase, without exception, is verified at the actual piano before being marked done, per the project's own stated constraint |

## Sources

- [MDN: Event.timeStamp](https://developer.mozilla.org/en-US/docs/Web/API/Event/timeStamp) — HIGH confidence, official docs
- [W3C Web MIDI API spec](https://www.w3.org/TR/webmidi/) — HIGH confidence, official spec
- [GitHub WebAudio/web-midi-api Issue #73 — on performance.now and relative deltatime](https://github.com/WebAudio/web-midi-api/issues/73) — HIGH confidence, spec editors' discussion of the exact clock-domain issue described in Pitfall 5
- [web.dev — A tale of two clocks (audio scheduling)](https://web.dev/audio-scheduling/) — HIGH confidence, canonical reference for the look-ahead scheduler pattern (Pitfall 8)
- [GitHub cwilso/metronome — Web Audio metronome scheduling example](https://github.com/cwilso/metronome) — HIGH confidence, the reference implementation the look-ahead pattern is named for
- [MDN — Web Audio API advanced techniques (scheduling)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques) — HIGH confidence, official docs
- MIDI protocol running-status and note-on-velocity-0-as-note-off convention — MEDIUM-HIGH confidence, well-established protocol convention corroborated across multiple community/technical sources (Arduino Forum, KVR Audio DSP forum) rather than a single normative citation
- MIDI CC64 (sustain pedal) on/off threshold and half-pedal limitation — MEDIUM confidence, corroborated across multiple audio-production community sources (VI-Control, MOTUnation)
- [W3C — Compressed .MXL Files (MusicXML 4.0 tutorial)](https://www.w3.org/2021/06/musicxml40/tutorial/compressed-mxl-files) — HIGH confidence, official spec tutorial
- [Recordare/MakeMusic MusicXML 3.0 Tutorial (PDF)](https://www.musicxml.com/wp-content/uploads/2012/12/musicxml-tutorial.pdf) — HIGH confidence, official tutorial covering ties/slurs/spanners/grace notes/tuplets
- [Unofficial MusicXML Test Suite (LilyPond regression collation)](https://lilypond.org/doc/v2.18/input/regression/musicxml/collated-files.html) and [music21 docs mirror](https://music21.org/music21docs/developerReference/musicxmlTest.html) — HIGH confidence, the standard public regression corpus for exercising MusicXML edge cases
- [OpenSheetMusicDisplay GitHub repo and classdoc](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay) — HIGH confidence, official project docs, re: re-render behavior and cursor/note ID stability
- [OSMD blog — Introducing OSMD 1.3.0](https://opensheetmusicdisplay.org/blog/osmd-version-1-3-0/) — MEDIUM-HIGH confidence, official project blog on annotation/re-render behavior
- Domain synthesis on alignment failure modes (chords, ornaments, restarts), velocity-to-loudness non-linearity, aggregate-vs-single-take statistics, and colour-blind-unfriendly encodings — MEDIUM confidence: standard, well-known concerns in music information retrieval / practice-tool UX, not tied to a single citable source for this specific product context
- Project-specific prototype failure details (Pitfalls 1, 2, 3, 4, 16) — HIGH confidence, sourced directly from `.planning/PROJECT.md` (the project's own documented account of what went wrong) rather than external research

---
*Pitfalls research for: Browser-based MIDI piano practice tool (MusicXML alignment, mistake detection)*
*Researched: 2026-09-13*
