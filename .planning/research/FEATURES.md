# Feature Research

**Domain:** MIDI piano practice feedback / score-following practice tools
**Researched:** 2026-09-13
**Confidence:** MEDIUM (web search, cross-corroborated across multiple independent sources; no first-party API docs or hands-on trials — see Sources)

## Feature Landscape

Products surveyed: Flowkey, Simply Piano (JoyTunes), Playground Sessions, Piano Marvel, Yousician, Synthesia, MuseScore 4 (practice/playback features), Tomplay, Tonara (defunct but instructive precedent), plus practice-loop utilities (RepShed, NoteHound) and academic score-following/performance-assessment research (ASAP dataset, conspicuous-mistake TCN detector, "Profy" DIS'26 paper).

Two clusters exist, and this project sits closer to the second than the first:

1. **Lesson-catalogue apps** (Flowkey, Simply Piano, Playground Sessions, Yousician) — gamified, curriculum-driven, grade a single take against a curated song library, real-time only, aimed at beginners.
2. **Score/practice-tool apps** (Piano Marvel, Synthesia, MuseScore, Tomplay, Tonara) — closer to this project's shape: user-controlled tempo, looping, hands-separate, and (Piano Marvel, Synthesia) user-supplied files rather than only a catalogue. None of these aggregate across dozens of repetitions or expose per-note dynamics-relative-to-neighbours — that gap is this project's opening.

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or unusable at the piano.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Render real notation from the score, not just falling notes | Every serious tool (Piano Marvel, Tomplay, MuseScore) shows real sheet music; falling-notes-only (Synthesia default) reads as a game, not a practice tool, to a classical player | MEDIUM | Already in scope via MusicXML + a notation renderer |
| Metronome with on/off, audible click, adjustable tempo | Universal across every tool surveyed (MuseScore, Tomplay, Synthesia, dedicated metronome apps); classical practice assumes a click | LOW | Already in scope; add count-in before the first bar (standard in dedicated metronome apps, absent from MuseScore's basic click) |
| Loop / repeat a selected range (passage looping) | RepShed, NoteHound, MuseScore, Synthesia, Tomplay, Flowkey all treat looping a difficult passage as baseline; it is *the* practice primitive | LOW–MEDIUM | Already in scope as "choose a passage to drill" |
| Hands-separate / single-staff practice | Flowkey ("Select a Hand"), Synthesia (hands separate/together), Piano Marvel (isolate trouble spots per hand) all ship this; it's a foundational classical-practice technique, not a nice-to-have | LOW–MEDIUM | Already in scope ("optionally one hand or staff") |
| Immediate wrong/missed/extra-note feedback on the score | Playground Sessions (red/green/pink/purple), Simply Piano, Yousician, Piano Marvel all mark correctness on notation in real time; users expect *some* visible correctness signal, not just a final score | MEDIUM–HIGH | This project deliberately does aggregate-first rather than live-color, but a single-pass visual echo (even minimal) sets expectations; confirm this is intentionally deferred, not accidentally missing |
| Tempo adjustment independent of the notated tempo (slow-down practice) | Tomplay, MuseScore (speed slider), RepShed, NoteHound, Synthesia — universal; adult learners practicing classical repertoire slow down difficult passages as a first move | LOW | Already in scope via user-set metronome tempo |
| Recognizable MIDI input support (USB/class-compliant keyboard) | Piano Marvel and Playground Sessions both position MIDI-in as their accuracy differentiator over microphone-based detection (mic apps "struggle with background noise and fast polyphonic passages") | LOW | Already in scope; Web MIDI is the right call versus audio pitch-detection, which every reviewed mic-based app is criticized for |
| Session/practice history that persists across sessions | Piano Marvel's score history, PianoJournal, Piano Practice Log all treat history as core, not optional; users expect to see whether they're improving over days/weeks | MEDIUM | Already in scope; the aggregation-across-sessions angle is what most catalogue apps under-deliver on |
| Progress indicator per piece/passage (some visible measure of "how much is solid") | Piano Marvel's "slicing" pass-off + completion circle, PianoJournal's charts/heatmaps, Piano Practice Log's stats dashboard | MEDIUM | Already implied by "trouble spots seen to shrink over weeks" |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required by the genre, but where this project should compete — and where the research confirms nobody else is doing this well.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Aggregation across 20+ repetitions into a stable "habit" signal | Every competitor reviewed grades one take at a time (Playground Sessions colors this pass's notes; Piano Marvel's SASR scores this test). None distinguish a one-off slip from a recurring habit. Academic work (2026 "Profy" paper) validates that summary-based single-pass feedback is "hard to act on" and researchers are actively building take-aggregating tools — this is a genuinely underserved niche, not a solved problem being reinvented | HIGH | This is the project's core value proposition; nothing in the survey does this for a home MIDI setup |
| Render and grade the user's own MusicXML, not a curated catalogue | Piano Marvel and Synthesia are the only surveyed tools that accept user files at all (Piano Marvel: MIDI/MusicXML/audio upload; Synthesia: any MIDI file); Flowkey/Simply Piano/Playground Sessions/Yousician/Tomplay lock users into a licensed song catalogue, and "limited repertoire" is a recurring complaint for classical/advanced players ("Flowkey arrangements overly simplified") | MEDIUM (given MusicXML is already the input format) | Confirms the project's MusicXML choice is aligned with the only credible precedent (Piano Marvel) rather than an outlier |
| Relative-dynamics detection (notes hit harder/softer than neighbours) | No surveyed consumer app does per-note dynamics-relative-to-neighbours feedback; the closest is "Scale Training" style tools that flag uneven velocity/timing per finger, and generic claims that MIDI-connected apps *could* analyze velocity but none surfaced doing so on real repertoire | HIGH | Explicitly in scope and explicitly *not* absolute-dynamics (matches project's decision); this is uncharted territory among consumer tools, low competitive risk of "obviously worse than X" |
| Tempo-drift detection per bar (you slow down here) | Reviews describe "playback and visualization... reveal rushed entries, dragging passages" as a *manual* listening exercise musicians do themselves; no surveyed tool automates per-bar tempo-drift flagging against a metronome-anchored reference | HIGH | Directly matches the project's "bars where you slow down" requirement; genuinely differentiated |
| Per-bar/per-note statistics with repetition counts ("wrong in 6 of 23 passes") | Piano Marvel's history and PianoJournal's heatmaps track aggregate practice *time*, not aggregate *note-level* correctness across takes; Playground Sessions' "heat map" language (per one source) appears to mean per-take colour-coding, not cross-take frequency | HIGH | The count-based framing ("how many passes it happened in") is what builds trust per PROJECT.md's success criteria — no competitor does this |
| Score history survives without an account (local export/import) | Every competitor surveyed is a paid cloud account; Piano Marvel/Playground Sessions/Flowkey all require login and subscription. A zero-account, file-exportable local tool is unusual in this space | LOW–MEDIUM | Matches project's browser-only, no-server constraint; differentiator mostly by omission (privacy/simplicity) rather than a built feature |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems — or that this project's PROJECT.md already excludes for good reason confirmed by research.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Microphone/audio pitch detection (no MIDI keyboard required) | Broadens who can use the tool without a MIDI piano | Every mic-based competitor (Simply Piano, Yousician) is criticized for unreliable detection with acoustic pianos, background noise, and fast polyphonic/chord passages — exactly the classical-repertoire case this project targets | Stay MIDI-only (already the project's constraint); the accuracy gap is real, not a solved problem |
| Real-time gamified scoring (stars, streaks, XP) on every take | Competitors (Simply Piano, Yousician) use this to drive daily engagement and are the market standard for beginners | Reviewers explicitly call gamification "patronizing to adult learners," and it reinforces single-take thinking — the opposite of this project's aggregate-over-many-reps thesis; also a scope-creep magnet (leaderboards, streak-shaming) | Session-level and multi-session summaries instead of a per-take score/badge |
| Automatic repetition-boundary detection | Feels more "magic," removes a manual step | No surveyed competitor does this reliably even in a constrained lesson format; it's a much harder segmentation problem than metronome-anchored alignment, and the project's own retrospective (prototype failure) flagged premature automation as a risk | Manual pass marking (already the project's decision), revisit only after the loop is proven |
| Absolute dynamics / "play this pp, that ff" grading against a reference performance | Competitors with "AI evaluation across pitch, rhythm, dynamics, expression" (e.g. TheONE) market this as premium | Requires a reference performance/interpretation to grade against, which is subjective for classical repertoire and explicitly rejected by the user (PROJECT.md: "never; only relative to neighbouring notes") | Relative dynamics only (already the project's decision) |
| Free-tempo / no-metronome "musical" scoring | Feels more natural, avoids fighting a click track | Removes the one fixed reference point (the click) that makes timing analysis tractable; academic score-following systems that handle free tempo (Tonara, NIME 2003 survey) are substantially harder engineering than metronome-anchored alignment | Metronome-anchored timing first (already the project's decision); free tempo is a credible v2 direction once alignment is proven |
| Built-in accompaniment/backing tracks or play-along audio (Tomplay-style) | Makes practice feel more like "playing with a band," a strong Tomplay/Playground Sessions selling point | Orthogonal to the core value (mistake aggregation); adds audio-sync engineering with no analysis payoff | Skip; metronome click is the only audio reference needed |
| Whole-piece run-through heat map before the passage loop is proven | Would look impressive as a landing feature ("see your whole piece at a glance") | PROJECT.md explicitly defers this; per-bar aggregation logic needs to be validated on short passages first, where ground truth is easiest to check by ear | Passages before whole piece (already the project's decision); this becomes the natural v1.x extension once passage-level aggregation is trusted |

## Feature Dependencies

```
MusicXML rendering (real notation)
    └──requires──> Passage selection (bar range, hand/staff)
                       └──requires──> Manual repetition marking
                                          └──requires──> MIDI capture (Web MIDI, timestamps+velocity)
                                                             └──requires──> Metronome-anchored timing
                                                                                └──enables──> Score-to-performance alignment (wrong/missed/extra notes)
                                                                                                  └──enables──> Per-repetition mistake detection (timing, dynamics, tempo-drift)
                                                                                                                    └──requires (20+ reps)──> Cross-repetition aggregation
                                                                                                                                                  └──enables──> On-score mistake visualization (color/heat map, per-bar stats)
                                                                                                                                                  └──enables──> Practice history across sessions
                                                                                                                                                                    └──enables──> Trouble-spot trend over weeks
                                                                                                                                                                    └──requires──> Export/import history (survives browser reset)

Hands-separate practice ──enhances──> Passage selection (adds a staff/hand filter, not a new pipeline)
Tempo scaling (slow-down practice) ──enhances──> Metronome-anchored timing (same click, different rate)
Count-in ──enhances──> Metronome (small addition to existing metronome feature)

Live per-take color feedback ──conflicts──> Aggregate-first product framing
    (showing correctness live re-trains the user to chase single-take green scores,
     which competes with "don't trust a one-off slip" — if added, keep it understated
     and secondary to the aggregate view, or defer entirely)

Automatic repetition-boundary detection ──conflicts──> Manual pass marking (v1 decision)
    (the two are alternate solutions to the same problem; do not build both)

Absolute dynamics grading ──conflicts──> Relative dynamics only (explicit product decision)
Free-tempo analysis ──conflicts──> Metronome-anchored timing (explicit product decision, sequenced later)
```

### Dependency Notes

- **Aggregation requires alignment, which requires metronome-anchored timing:** every differentiator (habit detection, tempo-drift-per-bar, relative dynamics, per-bar stats with repetition counts) sits downstream of getting single-repetition score alignment right first. This matches PROJECT.md's own sequencing (passages before whole piece, metronome first) and is confirmed by the research: no competitor skips single-take correctness detection on the way to anything more sophisticated.
- **Live per-take color feedback conflicts with the aggregate-first framing:** Playground Sessions/Simply Piano's biggest visual feature (red/green notes as you play) is exactly the "single-take grading" the project explicitly wants to avoid over-indexing on. If any live feedback is added later for usability (e.g., "yes it heard you"), it should be minimal and not compete visually with the aggregate view for attention.
- **Automatic repetition-boundary detection conflicts with manual marking:** these are alternatives, not additive; building both wastes effort and manual marking is deliberately kept as the reliable v1 choice per PROJECT.md.
- **Hands-separate and tempo scaling are low-cost enhancements, not new subsystems:** both piggyback on passage selection and the metronome respectively — cheap to add once those exist, expensive to bolt on later if the data model doesn't already carry hand/staff and tempo as first-class dimensions.

## MVP Definition

### Launch With (v1)

Minimum viable product — matches PROJECT.md's Active requirements; this research did not surface any table-stakes feature missing from that list.

- [ ] MusicXML rendering as real notation — without this, nothing else has a visual home
- [ ] Passage selection (bar range, optional hand/staff) — the unit of practice; every competitor's practice tools operate on a selectable range
- [ ] Web MIDI capture (notes, velocity, timestamps) — MIDI-in is the accuracy differentiator every credible competitor (Piano Marvel, Playground Sessions) relies on over microphone input
- [ ] Metronome with user-set tempo — the fixed reference point that makes timing analysis tractable
- [ ] Manual repetition marking — reliable v1 approach; automatic segmentation is unproven even by competitors
- [ ] Wrong/missed/extra note detection via score alignment — the baseline correctness signal every competitor has, here computed per repetition rather than shown live
- [ ] Timing (early/late) and tempo-drift detection per bar — matches "you slow down in bar 12," not found automated in any surveyed competitor
- [ ] Relative dynamics detection (louder/softer than neighbours) — matches "you press that E harder," not found in any surveyed competitor
- [ ] Cross-repetition aggregation — the core differentiator; nothing else in the MVP matters without this
- [ ] On-score aggregate visualization (which notes/bars, what kind of mistake, how many passes) — the payoff view
- [ ] Practice history per piece across sessions — needed to show trouble spots shrinking over weeks
- [ ] Export/import history as a file — the only "sync" this milestone needs, per the no-server constraint

### Add After Validation (v1.x)

Features to add once the core aggregation loop is proven at the piano.

- [ ] Count-in before the first bar of a repetition — cheap add-on to the existing metronome once tempo/timing logic is stable; standard in dedicated metronome apps, worth adding once the click is trusted
- [ ] Tempo scaling / progressive speed-up across sessions (RepShed/NoteHound-style ramp) — natural extension of metronome-anchored practice once passage looping is a proven habit
- [ ] Whole-piece heat map (aggregate across passages) — trigger: once per-bar aggregation on a single passage is trusted, extend the same math across a full piece
- [ ] Automatic repetition-boundary detection — trigger: once manual marking friction becomes the top complaint from actual use, revisit as a segmentation problem
- [ ] Minimal live "it heard you" feedback (e.g., a soft visual echo per note, not full color grading) — trigger: only if manual pass marking without any real-time confirmation proves disorienting at the piano

### Future Consideration (v2+)

Features to defer until the aggregation core has product-market validation with the single user.

- [ ] Free-tempo (no metronome) analysis — defer: requires solving tempo estimation jointly with alignment, a substantially harder problem than metronome-anchored timing
- [ ] Phone/tablet on the music stand, LAN relay — defer: the prototype burned multiple sessions on this infrastructure before ever validating the core loop; explicitly out of scope until desktop workflow is proven
- [ ] Server/cloud sync, multi-device history — defer: no current need with one user, one laptop; adds infrastructure risk the prototype already demonstrated is a trap
- [ ] Absolute-dynamics or expression grading against a reference recording — defer indefinitely per explicit product decision (never planned, not merely deferred)
- [ ] Pedal, articulation, finger-strength assessment — defer indefinitely; not reliably measurable from MIDI note data per PROJECT.md

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|----------------------|----------|
| MusicXML rendering | HIGH | MEDIUM | P1 |
| Web MIDI capture | HIGH | LOW | P1 |
| Metronome + manual pass marking | HIGH | LOW | P1 |
| Wrong/missed/extra note alignment | HIGH | HIGH | P1 |
| Timing/tempo-drift detection | HIGH | HIGH | P1 |
| Relative dynamics detection | MEDIUM–HIGH | HIGH | P1 |
| Cross-repetition aggregation | HIGH | HIGH | P1 |
| On-score aggregate visualization | HIGH | MEDIUM–HIGH | P1 |
| Practice history + export/import | HIGH | MEDIUM | P1 |
| Count-in | LOW–MEDIUM | LOW | P2 |
| Tempo-scaling ramp across sessions | MEDIUM | MEDIUM | P2 |
| Whole-piece heat map | MEDIUM | MEDIUM | P2 |
| Automatic repetition-boundary detection | MEDIUM | HIGH | P3 |
| Live minimal correctness echo | LOW | LOW–MEDIUM | P3 |
| Free-tempo analysis | LOW (for this user, now) | HIGH | P3 |
| Phone/tablet + LAN relay | LOW (for this user, now) | HIGH | P3 |

**Priority key:**
- P1: Must have for launch (matches PROJECT.md's Active requirements)
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Piano Marvel | Playground Sessions | This Project's Approach |
|---------|--------------|----------------------|--------------------------|
| Input source | MIDI keyboard, also accepts MusicXML/MIDI/audio uploads | MIDI keyboard required for accurate scoring | Web MIDI from USB piano only |
| Correctness feedback | Score history, SASR numeric sight-reading score | Live red/green/pink/purple note coloring per take | Aggregate-only across 20+ takes; per-take color deliberately not the primary view |
| Repertoire | User can upload own scores (rare in this market) | Locked to licensed song catalogue | User's own MusicXML only — aligned with Piano Marvel, opposite of Playground Sessions |
| Tempo handling | Auto-scroll at set pace, isolate/slow trouble spots | Metronome/tempo via lesson settings | Metronome-anchored, user-set tempo, scaling deferred to v1.x |
| Habit/trend detection | Score history over time (aggregate practice score, not per-note mistake frequency) | None found beyond per-take coloring | Cross-repetition per-note/per-bar mistake frequency — not offered by either competitor |
| Dynamics feedback | Not found | Not found | Relative-dynamics detection (louder/softer than neighbours) — not offered by any surveyed competitor |
| Account/sync model | Cloud account, subscription | Cloud account, subscription | Browser-only, local storage, file export/import, no account |

## Sources

- [Best Piano Learning Apps in 2026 — HackerNoon](https://hackernoon.com/best-piano-learning-apps-in-2026-an-in-depth-comparison-of-music-education-technology)
- [Piano Marvel vs Flowkey vs Simply Piano vs Yousician — Practis Blog](https://pract.is/blog/simply-piano-vs-flowkey-vs-piano-marvel-vs-yousician-2026-honest-comparison)
- [Piano Sight-Reading Test (SASR) — Piano Marvel](https://pianomarvel.com/en/feature/sasr)
- [Piano Marvel SASR Challenge — Kate and Family](https://kateandfamily.com/pianomarvel/features/sasr-challenge/)
- [Yousician Piano review — Piano Dreamers](https://www.pianodreamers.com/yousician-piano-review/)
- [Yousician Piano review — Pianists Compass](https://pianistscompass.org/reviews/apps/yousician-piano/)
- [About Synthesia](https://synthesiagame.com/about)
- [Synthesia Piano Review 2026 — Pianoers](https://pianoers.com/synthesia-piano-review/)
- [Play mode — MuseScore Handbook](https://musescore.org/en/handbook/2/play-mode)
- [Playback controls — MuseScore Studio Handbook](https://handbook.musescore.org/sound-and-playback/playback-controls)
- [Tomplay — How does it work?](https://tomplay.com/how-it-works)
- [Tomplay Sheet Music Review — Educational App Store](https://www.educationalappstore.com/app/tomplay-sheet-music)
- [Tonara Wikipedia (company, defunct)](https://en.wikipedia.org/wiki/Tonara_(company))
- [Tonara for iPad Listens and Turns Musical Score Pages Automatically — MacRumors](https://www.macrumors.com/2011/09/14/tonara-for-ipad-listens-and-turns-musical-score-pages-automatically/)
- [When playing through a lesson segment, green and red notes appear... — Playground Sessions Support](https://support.playgroundsessions.com/hc/en-us/articles/360032441492-When-playing-through-a-lesson-segment-green-and-red-notes-appear-on-the-staff-at-the-same-time-How-can-I-fix-this)
- [Piano Marvel FAQ](https://pianomarvel.com/en/faq)
- [Dashboard — Piano Marvel](https://pianomarvel.com/en/feature/dashboard)
- [Uploads — Piano Marvel](https://pianomarvel.com/en/feature/uploads)
- [Piano Practice Log — App Store](https://apps.apple.com/us/app/piano-practice-log/id6759742932)
- [PianoJournal — Piano Practice Companion](https://pianojournal.app/)
- [Ultimate Guide to Piano Apps with Feedback Features — Cooper Piano](https://cooperpiano.com/piano-apps-feedback-features-guide/)
- [RepShed — Free Music Practice Tool](https://repshed.com/)
- [NoteHound](https://notehound.app/)
- [Automatic Note-Level Score-to-Performance Alignments in the ASAP Dataset — TISMIR](https://transactions.ismir.net/articles/10.5334/tismir.149)
- [SIMULATING PIANO PERFORMANCE MISTAKES FOR MUSIC LEARNING — SMC 2024](https://smcnetwork.org/smc2024/papers/SMC2024_paper_id171.pdf)
- [Profy: Interpretable Visualization of Expertise-Dependent Motor Skills Toward Supporting Piano Practice — arXiv 2606.10627 (DIS '26)](https://arxiv.org/abs/2606.10627)
- [Score Following: State of the Art and New Developments — NIME 2003](https://www.nime.org/proceedings/2003/nime2003_036.pdf)
- [Flowkey vs Simply Piano: Which Wins for Adult Beginners?](https://www.pianostartguide.com/flowkey-vs-simply-piano/)
- [Simply Piano Review 2026 — Pianoers](https://pianoers.com/simply-piano-review-the-honest-truth-about-learning-piano-with-an-app/)

---
*Feature research for: MIDI piano practice feedback tool (mistake aggregation over repeated passage practice)*
*Researched: 2026-09-13*
