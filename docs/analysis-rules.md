# Piano Mistakes — Interpretation Contract (D-21)

This is the repo's interpretation contract, required by decision D-21 before any alignment
code exists. It states every implementation decision D-01 to D-21 from
`.planning/phases/03-what-you-actually-played/03-CONTEXT.md` in plain prose, pairs each one
with a worked example on rung 1 and the fixture file that pins it, and fixes the result
shapes, the cost model, the tunables table, the finalization rule and the detail-panel
sentences that every fixture, the alignment engine, the aggregate engine and the paint layer
must agree with.

This revision reconciles the Round 1, Round 2 and Round 3 cross-AI reviews of the plan that
produced it (03-01): the late-entry rule is made length-independent, pass finalization against
the scheduler horizon is defined, gap denominators are made consistent, tempo membership
excludes clicks at or after the pass end, chord re-strikes and equidistant in-chord pairings
are defined, the reach rule under a late reading is isolated behind one named switch
(`reachClock`) awaiting the user's decision, the lag bound comes from several probe tokens so
one stray opening note cannot disable the late-entry reading, restart detection is defined over
every optimal alternative rather than one traceback, the 2600 ms crossover example is its own
chronological event sequence, and every worked number below has been reconciled against its
own definitions.

## 1. Purpose and reading guide

Raw MIDI events, passes and the click timeline are the source of truth and are never modified
by anything in this document (Phase 2 D-03/D-04, D-06). Alignment — which score note was
played, missed, wrong, or unassessed, and where the extra notes are — is derived data,
recomputed on load and after every mark (D-20), never itself stored. Every rule below names
the fixture file that pins it, or the test file that will pin it in a later plan, so that
nothing here is an unchecked claim. Where the app genuinely cannot tell what happened — an
abandoned pass, a restart, an ambiguous alignment, a tempo change mid-pass — it says
"unassessed" with a reason (D-15) rather than guessing. That reason vocabulary, the gap-key
vocabulary, the shapes and the finalization rule are the contract every later plan in this
phase, and Phase 4 and Phase 5 after it, build on without renegotiating it.

## 2. The setting used by every worked example

Every worked example in this document uses one fixed setting unless it says otherwise: rung 1
(`fixtures/01-right-hand.musicxml`, one bar of 5/4, quarter notes C4 D4 E4 F4 G4), with score
note ids `m1-s1-v1-b0_1-p60` (C4), `m1-s1-v1-b1_1-p62` (D4), `m1-s1-v1-b2_1-p64` (E4),
`m1-s1-v1-b3_1-p65` (F4), `m1-s1-v1-b4_1-p67` (G4). The click timeline is synthetic 120 BPM,
clicks 500 ms apart starting at page time 1000: bar 1 beat 1 at 1000, beat 2 at 1500, beat 3 at
2000, beat 4 at 2500, beat 5 at 3000, bar 2 beat 1 at 3500, and so on. A pass starts at 900 and,
unless a worked example says otherwise, ends at 3400. Under this setting the expected times are
C 1000, D 1500, E 2000, F 2500, G 3000; the local beat is 500 ms; the mark grace is 250 ms
(`markGraceBeats` 0.5).

## 3. One section per decision, D-01 to D-21

Each rule below is stated in the user's own terms (from 03-CONTEXT.md), then given a worked
example using the numbers from section 2, then paired with the fixture or test that pins it.
A fixture tagged `(plan 03-03)`, `(plan 03-07)` or `(plan 03-08)` is written by a later plan in
this phase, not this one; this plan's own twelve committed fixtures carry no tag.

### D-01 — Pass origin

The origin of a pass is the first bar-1 (accented) click at or after the pass's start
timestamp in the stored click timeline. The file's first score note is expected on that click,
and every other score note's expected time comes from the actual scheduled click times in the
timeline — onset in beats mapped onto the recorded clicks, never recomputed from BPM alone.
The first pass of a session anchors to the metronome's first click, which is bar 1 beat 1 by
construction. The user's practice: after B7+C8, wait for the very next accented click and play
the whole file from its first note.

**Worked example (clean pass):** C4 D4 E4 F4 G4 played exactly on the clicks 1000/1500/2000/
2500/3000 -> `attempt: true`, `originIndex: 0`, `bpm: 120`, `wholeReason: null`, all five notes
played, no extras. Fixture: `test/fixtures/align/rung1-clean.json`.

**Worked example (origin after the pass start, RESEARCH Pitfall 2):** a pass whose
`startTimeStamp` is 3200 (after the bar-1 click at 3000 already passed) finds its origin at the
next accented click, bar 3 beat 1 -- `originIndex: 5` on the fifteen-click rung-1 timeline. All
five notes played on their (later) expected times. Fixture:
`test/fixtures/align/rung1-origin-after-start.json`.

**No origin:** a pass starting after the very last accented click in the recorded timeline has
`originIndex: null`; every score note is unassessed `not-reached`; every played note is an
extra at `before:0`, listed in the pass view but not counted (the gap `before:0` is
unassessed); the pass's BPM is taken from the last click before the start, or left ungrouped
when there is none. Fixture: `test/fixtures/align/rung1-no-origin.json` (plan 03-03).

### D-02 — The origin never moves (late entry)

No lateness cutoff, no snapping to a better-fitting downbeat, no re-anchoring on the first
played note. A first note played a full beat late reads as late by a beat, and so does every
note after it. A missing first note is a missed note, and the remaining notes keep their real
timing against their original score positions. The user's words: "Keep the next bar-1 click as
the fixed origin, without a lateness cutoff. If I intentionally wait for a later downbeat, I
should mark again before it. Never silently move the origin to make my playing appear on
time."

This rule holds for a passage of any length (review 03-01 HIGH round 1): the in-time cost model
alone cannot, because a whole pass shifted by one beat eventually costs less than a shifted-
pitch reading as the passage grows (twelve quarter notes one beat late cost 40.8 in time against
40 for a shifted reading, and rung 1 three beats late costs 51 against 27 for a three-slot
shift) -- both would silently lose pitch correspondence. The fix is whole-click lag *readings*
(section 4): every reading from lag 0 up to a bound H is tried, a reading above lag 0 pays a
constant `weights.lateEntry`, and the origin and every reported `deviationMs` always stay at lag
0 regardless of which reading wins.

**Late first note:** C at 1200, D E F G on their clicks -> all five played, C `deviationMs` +200
(recorded, never judged). The lag bound is 2 (the first three played tokens' nearest clicks are
0, 1, 2), but every late reading costs more than the in-time reading (1.36 in time), so
`entryLag` is 0. Fixture: `test/fixtures/align/rung1-late-first-note.json`.

**Skipped first note:** D E F G on their clicks -> C missed, D E F G played; the origin stays at
1000. The lag bound is 3 (probe tokens D, E, F), but the one-click-late reading costs 4
substitutions plus G deleted plus `lateEntry`, **18 vs 4** in time, and later lags cost more, so
the in-time reading stands. Fixture: `test/fixtures/align/rung1-missing-first-note.json`.

**Whole-beat late (D-02 mirror of D-08):** C D E F G played one beat late (1500, 2000, 2500,
3000, 3500), `endTimeStamp` 3900 -> all five played, extras []. Fixture:
`test/fixtures/align/rung1-whole-beat-late.json`.

**Late entry, the length-independent rule:** a whole pass one beat late -- C 1500 ... G 3500, mark
3900 -- all five played, each `deviationMs` +500, `entryLag` 1. In time alone, five notes still
separate cheaply (17 vs 19), but twelve quarter notes one beat late cost **40.8 vs 40** (twelve
late matches against one deletion, eleven substitutions and one insertion), and rung 1 three
beats late costs 51 against 27 (a three-slot shift) -- both would lose pitch correspondence
without the late reading. The late reading pays `lateEntry` (2) in every such case. Late with a
wrong note: C 1500, D 2000, F 2500, F 3000, G 3500 -> E wrong played F4, others played,
`entryLag` 1, **5 vs 16**. Fixture: `test/fixtures/align/rung1-late-wrong-e.json` (plan 03-03).

**Late entry with a stray opening note (review 03-03 HIGH round 2):** an extra C6 at 1000 on
the origin, then the twelve quarter notes one beat late (1500 ... 7000), mark 7400 -> all twelve
played, extra C6 at `before:0`, `entryLag` 1, **5 vs 39** (C6 inserted plus `lateEntry`, against
twelve in-slot substitutions plus the last note inserted; the intended in-time correspondence
would cost 43.8). The probe tokens C6, C4, D4 give lag bound 2; a bound taken from the first
event alone would be 0 and lose this reading. The raw C6 is never filtered -- it is an extra
(D-09). Three or more stray tokens before a late entry fall back to the in-time reading
(`lateEntryProbeTokens` is tunable). Fixture: `test/fixtures/align/long12-late-opening-extra.json`
(plan 03-03).

**Late entry with the opening note missing (review 03-03 HIGH round 2):** the twelve-note
passage one beat late with C4 omitted (D4 at 2000 ... G5 at 7000), mark 7400 -> C4 missed, the
other eleven played, `entryLag` 1, **6 vs 41** (C4 deleted plus `lateEntry`, against two
deletions, ten substitutions and one insertion in time). Fixture:
`test/fixtures/align/long12-late-missing-first.json` (plan 03-03).

**Late entry, twelve notes in time (baseline for the two examples above):** Fixture:
`test/fixtures/align/long12-one-beat-late.json` (plan 03-03). **Three beats late on rung 1:**
Fixture: `test/fixtures/align/rung1-three-beats-late.json` (plan 03-03).

**Late and abandoned -- the reach clock (review 03-01 HIGH round 2, user decision pending):**
see D-11 below; the two fixtures are `test/fixtures/align/rung1-late-abandoned-origin.json` and
`test/fixtures/align/rung1-late-abandoned-reading.json` (plan 03-03).

### D-03 — Timing unassessed only from pitch uncertainty

A pass's timing is unassessed only when its pitch alignment is uncertain (D-12, D-13), never
because of distance from the click. In this phase the origin does two jobs: it gives each score
note a time slot so that timing can settle pitch disputes (D-08, D-09), and it decides which
score notes were reached before the pass ended (D-11). Timing verdicts themselves (early/late,
tempo drift) are Phase 4's job; this phase only records `deviationMs` and never judges it.

### D-04 — Wrong notes, no threshold

One played note in a score note's slot, at roughly the right time, is a wrong note
(substitution) whatever the pitch, an octave slip included. No semitone threshold. The detail
records which pitch was played.

**Wrong E:** C D F F G -> E `{ status: "wrong", playedPitch: 65 }`, others played, extras [].
Fixture: `test/fixtures/align/rung1-wrong-e.json`.

**Octave slip:** C D C5 F G -> E wrong `playedPitch: 72` (octave slip is still wrong, not
missed-plus-extra: a wrong note costs one substitution, 3, against missed-plus-extra, 7).
Fixture: `test/fixtures/align/rung1-octave-slip.json`.

**Crossover ("roughly a slot's width," reconciled review 03-01 MEDIUM / HIGH round 3):** with F
at 1900 and E at 2300 (events C 1000, D 1500, F 1900, E 2300, F 2500, G 3000, seq 0-5) -> E
played (2.04 + 3), extra F4 at `before:2`, **5.04 vs 6.68**. With F at 1900 and E at 2600 the
late E now comes after the F at 2500, so the example is its own chronological sequence, seq
numbered in time order: C 1000 (seq 0), D 1500 (1), F 1900 (2), F 2500 (3), E 2600 (4), G 3000
(5) -- written out as **C D F F E G**, never the correction's events with only E's timestamp
moved (that clone leaves E before F in seq order, and the tokenizer would then read them as one
chord). Result: E wrong played F4 (3 + 0.68), F played, extra E4 at `before:4` (four slots at
or before 2600), **6.68 vs 14.08** -- crediting E as played would pair E with the E at 2600
(4.08), leave both Fs as extras (3 + 3) and F's slot missed (4), because an F slot cannot pair
with an F played before the E it follows. Every later reading costs more (lag 1: 22.36, lag 2:
27.8). No fixture for the crossover cases in this plan; pinned by `test/align.test.cjs` in plan
03-02.

### D-05 — Corrections credit the right note

A correction credits the right note. Score C D E F G played C D F E F G reports F as an extra
note and E as played (late), because the played E matches its score note. Marks over many
passes then read "extra F before E" plus "E late", which is what happened.

**Correction:** C 1000, D 1500, F 1900, E 2100, F 2500, G 3000 -> all five played, one extra F4
at gap `before:2` (two slots at or before 1900), E `deviationMs` +100. Costs: E paired with E
(timing 0.68) plus the inserted F (3) against E paired with F (3 + 0.68) plus an inserted E
(3): **3.68 vs 6.68**. Fixture: `test/fixtures/align/rung1-correction.json`.

### D-06 — Repeated pitches assigned by timing

Repeated pitches (score E E E, two Es played) are assigned by timing against their slots. When
two assignments cost the same, the whole repeated group is unassessed with reason "ambiguous",
never guessed.

**Worked example:** three quarter-note E4s (3/4, slots 1000/1500/2000): E at 1000 and E at 2000
-> played, missed, played (a clear timing assignment); E at 1000 and E at 1750 -> all three
ambiguous (5.7 vs 5.7 -- the two assignments tie). Fixtures: `test/fixtures/align/repeated-e-unique.json`,
`test/fixtures/align/repeated-e-tie.json` (plan 03-03).

### D-07 — Chords judged per notehead

Chords are judged per notehead: C E G played C Eb G is E wrong (Eb) with C and G played; C G is
E missed; C E G B is an extra B in that chord. Notes played within a short window count as one
chord regardless of order, and a slightly rolled chord still counts as together. The window
(`chordWindowMs`) is tuned from fixtures.

**Worked example (rung 4 = `fixtures/04-chords.musicxml`, 4/4, half-note chords C4 E4 G4 + C3
at beat 1 and F4 A4 C5 + F3 at beat 3):** C3 1000, C4 1005, Eb4 1010, G4 1020, B4 1030, F3 2000,
F4 2010, C5 2020 -> C3 C4 G4 played, E4 wrong played MIDI 63, extra B4 at `within:0`; F3 F4 C5
played, A4 missed.

**Re-strike inside a chord (review 03-03 HIGH):** C3 1000, C4 1005, E4 1010, C4 1020, G4 1030 ->
all four played, one extra C4 at `within:0` -- the later, re-struck C4 stays in the token as a
duplicate rather than fragmenting into a false miss.

**Equidistant pairing (review 03-03 HIGH):** C3 1000, D4 1005, G4 1010 -> C3 and G4 played; C4
and E4 unassessed ambiguous because D4 is two semitones from both, and D4 is an ambiguous
played note. (A played C E G against a score C F is not itself a tie: F4 is one semitone from
E4, two from G4, so E4 is wrong played F4 and G4 is missed -- no ambiguity.)

Fixtures: `test/fixtures/align/rung4-chord-mistakes.json`, `rung4-chord-restrike.json`,
`rung4-chord-equidistant.json` (plan 03-08); left-hand chord case
`test/fixtures/align/rung3-left-hand-wrong.json` (plan 03-07).

### D-08 — Timing wins over pitch by a whole beat

Timing wins over pitch when they disagree by a whole beat. Score C D E F G played D E F G A in
time on the click is five wrong notes (C wrong played D, D wrong played E, and so on), not "C
missed, A extra, D E F G early." The principle for the cost model: a pitch match within roughly
a slot's width of its expected time is a match (D-05); a pitch match displaced by a whole beat
loses to an in-slot substitution.

**Shifted start:** D E F G A on the five clicks -> C wrong (D4), D wrong (E4), E wrong (F4), F
wrong (G4), G wrong (A4); no extras; **15 vs 20.6** (five substitutions against C deleted, four
matches a beat early, and A inserted). The lag bound is 2 (probe tokens on clicks 0, 1, 2), but
the one-click-late reading costs **21 vs 15** (D inserted, four substitutions, G deleted,
`lateEntry`) and the two-click reading more, so the in-time reading stands -- pinned at
`entryLag` 0 by `rung1-shifted-start.json` once readings exist (plan 03-03). Fixture:
`test/fixtures/align/rung1-shifted-start.json`.

### D-09 — Nothing the piano sends is ignored

Every non-marker note-on in a pass is a played note: a soft brush of a key is an extra note, a
re-struck key is an extra note. No velocity floor, no bounce suppression, no note filter of any
kind. Consistent with Phase 2 D-04 ("they would be mistakes"). Note-offs are not used for pitch
classification. Restart-adjacent near-miss extras (`rung1-restart-near-miss.json`, plan 03-03)
and the chord re-strike (`rung4-chord-restrike.json`, plan 03-08) both exercise this rule.

### D-10 — Extra notes attach to a gap

A played note that matches nothing is an extra note. For display and counting it is attached to
the gap between the two score notes whose expected times bracket it, or before the first score
note, or after the last. The gap key follows the rule in section 4: `before:k` where k is the
number of slots whose expected time in the chosen reading is at or before the note's time, and
`within:k` for a duplicate inside slot k's own chord. Fixture: `test/fixtures/align/rung1-correction.json`
(the D-05 example above is also the D-10 example).

Gap attachment under a late reading uses the chosen reading's times, so an extra played between
a late D and a late E is shown between D4 and E4 -- with fixed-origin times it would be shown
one gap later. This is Claude's discretion, independent of `reachClock`, and the user sees it
only if a late pass carries extras.

### D-11 — Abandoned pass, reach, and the finalization gate

Abandoned pass: score notes whose expected time (from the fixed origin) lies after the pass's
end mark are unassessed with reason "not-reached." Score notes whose expected time passed
inside the pass with no matching played note are confident misses. Time decides. A small grace
margin at the mark (`markGraceBeats`) is Claude's discretion, pinned by a fixture.

**Abandoned pass:** C D E on the clicks, mark 2200 -> F and G unassessed `not-reached` (2500 >
2450 = 2200 + 250). Fixture: `test/fixtures/align/rung1-not-reached.json`.

**Early last note (grace boundary):** C D E F on the clicks, G at 2900, `endTimeStamp` 2950 ->
all played. With no G played, mark 2750 -> G missed (3000 <= 2750 + 250 = 3000); mark 2749 ->
G not-reached (3000 > 2749 + 250 = 2999). Fixture: `test/fixtures/align/rung1-early-last-note.json`.

**Late and abandoned -- the reach clock (review 03-01 HIGH round 2, FLAGGED ASSUMPTION, user
decision pending):** C 1500, D 2000, E 2500, mark 2700. Both rules agree on pitch
correspondence (lag 1: C D E played) and differ only on F. With `reachClock 'origin'` (the
default, D-11 as written): reach is judged from the fixed-origin expected times C 1000 ... G
3000 against 2700 + 250 = 2950, so F (2500) was reached with no matching note -> F missed, G
not-reached, **6 vs 13** (F deleted plus `lateEntry`, against C deleted and three substitutions
in time). With `reachClock 'reading'` (the alternative): reach is judged from the late
reading's times, F 3000 and G 3500 are after 2950 -> F and G not-reached, **2 vs 13**. Both
fixtures exist with explicit tunables so neither changes when the default flips: the user chooses at the rung-1 piano checkpoint (03-05); rung 5 checks a complete late performance.
Fixtures: `test/fixtures/align/rung1-late-abandoned-origin.json`,
`test/fixtures/align/rung1-late-abandoned-reading.json` (plan 03-03).

**Finalization (D-11, D-20, review 03-02 HIGH):** see section 5 for the full rule. Worked
example: the same C D E F with no G and a mark at 2750, live. The metronome records a click
only about 100 ms before it sounds, so at the moment of the mark G's click (3000) does not
exist yet; the pass is pending -- not painted, not counted -- until a click at or after 2750 +
750 = 3500 is recorded, then it is judged once: G missed. A reload computes the same result
from the stored clicks.

### D-12 — Restart without a mark

Restart without a mark (C D E, pause, C D E F G, then the mark): the whole pass is unassessed
with reason "restarted." The pass stays stored and listed, counts as one unassessed pass for
every note, and its reason nudges the user to mark before restarting. Automatic splitting into
two passes is out of scope for the milestone.

**Restart:** C D E on the clicks, silence, then C D E F G from 4000, mark 6400 -> whole pass
restarted, every note reason `restarted`, no extras. Fixture: `test/fixtures/align/rung1-restart.json`
(plan 03-03).

**Near miss (not a restart, D-09):** C at 1000 and C again at 1150 (outside the 50 ms
`chordWindowMs`), then D E F G -> all played plus an extra C4 at `before:1`. Fixture:
`test/fixtures/align/rung1-restart-near-miss.json` (plan 03-03).

**Two complete runs without a mark** are a restart too. Fixture:
`test/fixtures/align/rung1-two-runs.json` (plan 03-03).

**Restart over every optimal alternative (review 03-03 MEDIUM round 3):** the restart verdict
never depends on which optimal alignment a traceback happens to pick. `rung1-restart` itself has
several co-optimal alignments at the same minimum cost, every one inserting part of the second
run, so it is restarted regardless of which one is chosen. Tied alternatives that disagree: with
fixture tunables `perBeat` 1 and `lateEntry` 1, C D E at 1000/1500/2000 then C D E F G at 2500 ...
4500, mark 4900 -> lag 0 (first run matched, second run's C D E extras) and lag 2 (first run
extras, second run matched one beat late, 14 + 1) both cost **15**; one inserts the second run
and the other does not, so the pass is **not** restarted -- every optimal alternative must insert
a token of the run for the pass to be called restarted, and here they disagree, so every slot
and token on which the alternatives disagree is ambiguous under the tie rule instead, with the
gap keys taken from lag 0 (the smallest tied lag). Fixture:
`test/fixtures/align/rung1-restart-tie.json` (plan 03-03).

### D-13 — Messy pass, per-note where clear

Per-note marks wherever the alignment for that region is unique; a region with equal-cost
alternatives is unassessed with reason "ambiguous"; the rest of the pass still counts. A pass is
never dropped for being "too wrong."

**Worked example:** C D on the clicks, E 1900 and E 2100, A4 2200, B4 2280, A4 2360, B4 2440, F4
2500, G4 3000 -> C D F G played; E unassessed ambiguous; the two Es are ambiguous played notes
(E 1900 at gap `before:2`, E 2100 at `before:3`), not extras; four confirmed extras at
`before:3` (the A4/B4 fumble). Gap `before:3` has confirmed extras, so the pass counts as a pass
with extras there, but the count is a minimum because one of the two Es may also be an extra:
"Extra notes between E4 and F4: in 1 of 1 assessed passes (at least A4 twice, B4 twice); 1 pass
with ambiguous notes nearby." Gap `before:2` has no confirmed extra and an ambiguous E beside
it, so it is unassessed in this pass; `within:2` is unassessed because slot E is. Fixture:
`test/fixtures/align/rung1-messy-fumble.json` (plan 03-03).

### D-14 — Zero-note passes are not attempts

Zero-note passes (a double mark) are not attempts: excluded from every count and denominator,
though still stored and listed. A pass with one or more played notes is an attempt and follows
D-11.

**Double mark:** zero notes -> `expected: { attempt: false, originIndex: 0, bpm: 120,
wholeReason: null, notes: {}, extras: [] }`; excluded from every count; listed in the pass view.
Fixture: `test/fixtures/align/rung1-double-mark.json`. Also pinned in `test/aggregate.test.cjs`
(plan 03-03).

### D-15 — Unassessed reason vocabulary

Unassessed reasons are a fixed vocabulary and every unassessed opportunity carries exactly one:

| Reason | Meaning |
| --- | --- |
| `not-reached` | the score note's expected time (per `reachClock`) fell after the pass's finalized end plus grace |
| `restarted` | the whole pass matched D-12's restart rule |
| `ambiguous` | two or more equal-cost alignments disagree on this note, token or gap |
| `tempo-changed` | a click inside the pass, before its end, carried a different BPM than the origin click |

### D-16 — Counts per score note, grouped by tempo

Counts per score note are computed over passes at the same BPM: wrong count, missed count,
assessed opportunities (passes in which that note was assessed), and unassessed count broken
down by reason. Extras are counted per gap position (D-10). A pass whose BPM changed inside it
is labelled `tempo-changed`, excluded from the aggregate view, but still listed and viewable as
a single pass. Passes at other tempos form their own groups.

**Tempo change:** clicks 1000, 1500, 2000 labelled 120, then from 2500 labelled 100 (next
clicks 3100, 3700, ...), pass 900..3400 -> `tempo-changed` (the click at 2500 lies strictly before
the end and carries bpm 100). Fixture: `test/fixtures/align/rung1-tempo-changed.json` (plan
03-03).

**After the end (review 03-05 HIGH -- tempo membership excludes clicks at or after the pass
end):** clicks 1000 ... 3000 labelled 120, the click at 3500 labelled 100 (it was computed from
the old interval; its label describes the interval that follows it), pass 900..3400 ->
**not** `tempo-changed`, all played, bpm 120. Fixture:
`test/fixtures/align/rung1-tempo-change-after-end.json` (plan 03-03). Both pinned again in
`test/aggregate.test.cjs`.

### D-17 — Score repaints in place, two views

The score repaints after every finalized pass mark and on load, in place through the existing
`svgMap`, with no OSMD re-render. Two views only: "This session at N BPM" (the default;
aggregate counts over that tempo group) and a single pass (click a pass in the existing pass
list; click the session heading to return). The session shown is the live one, or the restored
one after a reopen. A BPM selector appears in the heading only when the session holds more than
one tempo group. See section 9 for placement and section 8 for the heading text. Pinned by
`test/aggregate.test.cjs` and `scripts/check-paint.cjs`.

### D-18 — Flat colours, no intensity

Flat colours, no intensity scale in this phase. Wrong = red notehead, missed = blue notehead,
extra = a small red `+` glyph above the staff at the gap position from D-10, showing a count in
the aggregate view. A score note with assessed opportunities and no mistakes stays black. A
score note with zero assessed opportunities in the current view (never reached, every pass
restarted) is light grey so an untested tail is visible. When a note has both wrong and missed
counts, the larger count picks the colour; ties go to wrong. See section 9 for exact hex values.
Pinned by `test/aggregate.test.cjs` and `scripts/check-paint.cjs`.

### D-19 — Plain-language detail panel

Clicking a coloured notehead or an extra glyph shows a plain-language detail panel below the
score, not a tooltip. See section 8 for the exact sentence templates. Pinned by
`test/aggregate.test.cjs` and `scripts/check-paint.cjs`.

### D-20 — Alignment results are derived, versioned data

Alignment results are derived data: recomputed from raw events, the score model, and the click
timeline on load and after each mark, held in memory, not persisted in this phase. An
`Align.ANALYSIS_VERSION = 1` constant exists from the first commit so that caching in a later
phase is an addition, not a migration. Nothing downstream reads a stored alignment. The
finalization rule in section 5 defines exactly what "recomputed on load" is allowed to change
about an already-final pass -- nothing, except an unreached slot's `expectedTime`, which nothing
reads.

### D-21 — This document

The interpretation contract is this repo document, `docs/analysis-rules.md`, written and
reviewed before the alignment code, with every rule above paired with the fixture file that
exercises it. The roadmap's required cases each get a worked example above: missing first note
(D-02), late entry (D-02), repeated pitches (D-06), an extra note (D-10), an interrupted
(abandoned) pass (D-11), a restart (D-12), ambiguous alignment (D-06, D-13), and a tempo change
(D-16). Fixtures are plain JSON under `test/fixtures/align/` (score model plus played events
plus click timeline in, expected labels out), runnable with node:test and nothing else.

## 4. Slots, tokens, readings and the cost model

A **slot** is a distinct absolute onset (measure start plus onset, compared via
`ScoreModel.compareRationals`) holding every score note at that onset across both staves, in
canonical order. Expected time = the recorded click at (origin index + reading lag + whole
quarter beats), linearly interpolated to the next recorded click for a fractional onset; null
when a needed click is absent.

**Tokens:** note-ons are read in seq order, never timestamp order. A note-on joins the open
token when the absolute difference between its timeStamp and the open token's first note-on is
at most `chordWindowMs` -- a pitch already in the token joins as a duplicate; the token's onset
is its first note-on in seq order.

**Decreasing timestamps (review 03-01 HIGH round 3):** seq order is kept even when a later seq
carries an earlier timeStamp (the segmenter already orders by seq, `src/pass-segmenter.js`).
Such a note-on is never moved or re-stamped: it joins the open token only within the window
measured in either direction, otherwise it opens its own token with its own onset, and its
timing cost, `deviationMs` and gap key use its own timeStamp. Example: C 1000, D 1500, E 2000,
then F with timeStamp 1940 (seq 3), G 3000 -> F is its own token (60 ms from E's onset) and
pairs with F's slot: all played, F deviationMs −560; with F at 1960 instead it joins E's token:
E played, F4 an extra at `within:2`, F missed. The raw pass is byte-identical before and after
alignment -- nothing here ever reorders or rewrites a raw record.

**The global alignment:** dynamic programming over reached slots x tokens: pair a slot with a
token, delete a slot (its notes are missed), or insert a token (its notes are extras). Pair
cost = pitch cost + timing cost: equal pitches pair one-to-one as a multiset (played); any
remaining slot and token pitches are paired by the assignment with the minimum total semitone
distance, each pair a wrong note at `weights.substitution`; leftover slot pitches are missed at
`weights.deletion` each; leftover token pitches (duplicates included) are extras within the
slot at `weights.insertion` each; when more than one minimum-distance assignment labels
different noteheads, those noteheads are unassessed ambiguous and their played pitches are
ambiguous played notes (the pair cost is the same either way). Timing cost = `weights.perBeat`
x |token first onset - expected| / local-beat-ms, linear, no threshold. All costs are integer
thousandths of a weight unit (the timing term rounded once), so equal-cost alternatives compare
exactly, with no epsilon. `deviationMs` of a played note is its own matched event's timeStamp
minus the fixed-origin expected time (never the token's first onset, review 03-02 MEDIUM).

**Readings (D-02 late entry):** the lag bound H is the largest value, over the first
`lateEntryProbeTokens` tokens, of (the index of the click nearest that token's onset among
clicks at or after the origin, ties to the earlier click) minus the origin index, at least 0 --
several tokens, so one stray opening note cannot pin H to 0. Every lag h from 0 to H is a
reading; a reading's pitch correspondence and gap keys use the click lag h later; its total cost
is its DP cost plus `weights.lateEntry` when h > 0.

**Reach clock (the one switch for the pending user decision, review 03-01 HIGH round 2):** a
slot is reached when its expected time is not null and is at or before end + `markGraceBeats` x
localBeatMs(b), where b is the last click at or before the end (the origin index when none) and
localBeatMs(i) is the gap from click i to the next recorded click (the previous gap when none).
With `reachClock` `'origin'` (default, D-11 as written) the expected time used is the lag-0 time
in every reading, so all readings share one reach set. With `'reading'` it is the reading's
lagged time. The two agree at lag 0. No other rule reads this switch.

The cheapest reading is chosen; `entryLag` = its h. `deviationMs` and the reported origin always
use lag 0 -- the origin never moves.

**Ties:** two optimal alignments (within a reading or across equally cheap readings) that
assign a slot or token differently make it ambiguous, extended over a run of consecutive
identical-pitch-set slots (D-06). Label-identical optimal readings report the smaller lag;
equally cheap readings with different labels report `entryLag` = the smallest tied lag, and
that lag's times give the gap keys of the ambiguous played notes.

**Restart rule:** a second run of tokens matching the pitch sets (unique pitches) of the first
`restartPrefixSlots` slots, starting after the first run ends, where **every optimal
alternative** -- every co-optimal alignment of every minimum-cost reading -- inserts at least one
token of that run -> restarted; when some optimal alternative pairs every token of the run, the
pass is not restarted, and the tokens and slots on which the alternatives disagree are
ambiguous under the tie rule above.

**Tempo rule:** clicks at or after the origin and strictly before the pass end must share the
origin click's bpm, else `tempo-changed`.

**Precedence:** `tempo-changed` > `restarted` > per-slot not-reached / ambiguous.

## 5. When a pass is judged (finalization)

A completed pass is final when the session has ended, or when the recorded timeline holds an
accented click at or after the pass start and its last click is at or after pass end +
(`markGraceBeats` + 1) x localBeatMs(b) (b as in the reach rule above). Only final passes are
painted and counted; a pending pass is listed as still finishing. No fixed time bound is
promised -- clicks are recorded only about 100 ms before they sound and land on whole beats, so
the wait is usually longer than a beat and a half, and longer again if the pass was marked
before its bar-1 click.

Once final, appending more clicks never changes `stableFields(result)` -- the PassResult with
`expectedTime` removed from every slot whose `reached` is false. Why that is exactly the stable
set: the clicks are a contiguous prefix whose last click lies after end + grace, so the origin,
tempo membership, the lag bound, every reach decision, every gap key, every cost and every
label are already computed from clicks the prefix holds; only a slot beyond the covered
timeline (never reached) can gain an `expectedTime` later -- for example a pass 3600..3800 whose
origin is the accented click at 6000 reports D's `expectedTime` null on the prefix ending at
6000 and 6500 once the full timeline is recorded. Nothing in aggregation, painting or the
detail-panel sentences ever reads an unreached slot's `expectedTime`. This property is pinned
by `test/align.test.cjs` in plan 03-02.

## 6. Tunables table

| Name | Default | Why this value | Changed from fixture failure |
| --- | --- | --- | --- |
| `chordWindowMs` | 50 | notes struck within about a 32nd note of each other read as one chord attack | (none yet) |
| `markGraceBeats` | 0.5 | a mark half a beat after the true end still counts the last note as reached | (none yet) |
| `restartPrefixSlots` | 3 | three matching notes is enough to recognise "the passage started over" without false-triggering on a short repeated motif | (none yet) |
| `lateEntryProbeTokens` | 3 | one stray opening note must not be able to disable the late-entry reading; three tokens is enough evidence of where the passage actually starts | (none yet) |
| `weights.substitution` | 3 | a wrong note costs less than missed-plus-extra (4 + 3) so a genuine wrong note is never reported as two mistakes | (none yet) |
| `weights.deletion` | 4 | a missed note costs slightly more than a wrong note, so ambiguous cases resolve toward "wrong" over "missed+extra" | (none yet) |
| `weights.insertion` | 3 | symmetric with substitution | (none yet) |
| `weights.perBeat` | 3.4 | timing cost per full beat of displacement; large enough that a whole-beat shift always loses to an in-slot substitution (D-08), small enough that small deviationMs never flips a match | (none yet) |
| `weights.lateEntry` | 2 | a flat cost for reading the pass as starting late; small enough that any passage of two or more notes prefers a genuine late reading over cascading in-slot substitutions, large enough that a single early wrong note never triggers it | (none yet) |
| `reachClock` | `'origin'` | policy switch -- **user decision pending** (D-11); changed only by the user's recorded choice, never by a fixture failure | n/a -- user's choice, recorded at the rung-1 piano checkpoint (03-05) |

A fixture's `tunables` field is `null` (defaults) or a partial object deep-merged over the
defaults above. The inequalities any future change to these weights must preserve, for
passages of any length n:

- `substitution < perBeat` -- shifted pitches on the clicks stay wrong at every length, since
  n x substitution < deletion + insertion + (n - 1) x perBeat.
- `substitution < deletion + insertion` -- a wrong note beats missed-plus-extra.
- `0 < lateEntry < deletion + insertion - substitution` -- a late entry with one wrong note
  still reads late on two or more notes, and an in-time reading that explains the pass equally
  well stays the default.

A value in this table changes only when a named fixture fails; the failure and the fixture that
found it are recorded in the "Changed from fixture failure" column above.

## 7. Shapes

**Fixture file:** `{ name, rule, description, scoreModel, clicks, pass, tunables (null =
defaults), expected: { attempt, originIndex, bpm, wholeReason, entryLag?, notes: { noteId:
{ status, playedPitch?, reason? } }, extras: [{ gap, pitch }] } }`.

**PassResult:** `{ analysisVersion, passOrdinal, attempt, originIndex, originTime, bpm,
endTime, entryLag, totalCost, wholeReason, slots: [{ index, noteIds, expectedTime, reached }],
notes: { noteId: { status: played|wrong|missed|unassessed, playedPitch?, playedSeq?,
deviationMs?, reason? } }, extras: [{ seq, pitch, timeStamp, gap }], ambiguousPlayed: [{ seq,
pitch, timeStamp, gap }] }` -- an ambiguous played note carries the gap key it would have as an
extra, so the aggregate can tell which gaps are ambiguity-adjacent.

**Gap keys:** `before:k` (k = number of slots whose expected time in the chosen reading is at
or before the note's time) and `within:k`.

**`stableFields(result)`:** the PassResult with `expectedTime` removed from every slot whose
`reached` is false -- see section 5.

**SessionAggregate:** `{ analysisVersion, attempts, tempoGroups: [{ bpm, passOrdinals,
attempts, notes: { noteId: NoteCounts }, gaps: { gapKey: GapCounts } }], nonAttempts,
tempoChanged, ungrouped }`.

**NoteCounts:** `{ played, wrong, missed, assessed, unassessed: { not-reached, restarted,
ambiguous }, unassessedTotal, wrongPitches }`.

**GapCounts:** `{ passesWithExtra, totalExtras, assessedPasses, unassessedPasses,
lowerBoundPasses, pitches }`. The gap rule (review 03-01 HIGH round 1, MEDIUM round 2): a gap is
**base-assessable** in a pass when the pass has no whole-pass reason and, for `before:k`, slot
k-1 (slot 0 for k = 0) is reached, or, for `within:k`, slot k is assessed. A base-assessable gap
is **ambiguity-adjacent** when an `ambiguousPlayed` entry carries that gap key or a bracketing
slot (k-1 or k for `before:k`; k for `within:k`) is unassessed ambiguous. Not base-assessable ->
counted in `unassessedPasses`. Base-assessable with at least one confirmed extra -> counted in
`assessedPasses`, `passesWithExtra`, `totalExtras` and `pitches` from the confirmed extras,
*plus* `lowerBoundPasses` when ambiguity-adjacent. Base-assessable with no confirmed extra and
ambiguity-adjacent -> counted in `unassessedPasses`. Otherwise -> counted in `assessedPasses`
(a confident "no extra here"). Invariant: `lowerBoundPasses <= passesWithExtra <= assessedPasses`
always holds -- reaching a gap alone never makes "no extra there" a confident verdict when an
ambiguous note could belong to it.

**PaintView:** `{ kind: session|pass, label, bpm, noteKinds, glyphs: { gapKey: { count, text } } }`
with the D-18 colour rule: the larger of wrong/missed picks the colour, tie goes to wrong;
assessed 0 -> untested; no mistakes -> clean; pass view: played -> clean, unassessed -> untested.

## 8. Detail-panel sentences

Aggregate with mistakes: `E4, bar 1 beat 3: wrong in 4 of 10 assessed passes (played F4 three
times, D#4 once); missed in 1 of 10; 2 passes unassessed (1 restarted, 1 not reached)` -- the
first mistake segment says `N of M assessed passes`, later ones say `N of M`; a zero-count
segment is omitted (so a note only ever missed reads `G4, bar 1 beat 5: missed in 1 of 2
assessed passes`); wrong pitches are listed by count descending then MIDI ascending; counts
read once / twice / N times; unassessed reads `1 pass unassessed` / `N passes unassessed`, its
reasons listed in the order not reached, restarted, ambiguous.

Without mistakes: `C4, bar 1 beat 1: played correctly in all 3 assessed passes` plus `; 1 pass
unassessed (1 not reached)` when non-zero. Zero assessed: `E4, bar 1 beat 3: not assessed in
any pass (3 not reached)`. No passes at all: `E4, bar 1 beat 3: no passes yet`.

Single pass: `: wrong, played F4` / `: played` / `: missed` / `: unassessed (not reached)`,
using the reason words `not reached`, `restarted`, `ambiguous`, `tempo changed` (space-separated
in prose, unlike the D-15 hyphenated codes).

Gap aggregate: `Extra notes between D4 and E4: in 6 of 10 assessed passes (F4 five times, E4
once)` plus `; 2 passes unassessed` when non-zero, with `Extra notes before C4`, `Extra notes
after G4`, `Extra notes played with E4` for the naming pattern (a multi-note slot is named `the
chord at bar 1 beat 1`); when `lowerBoundPasses` > 0 the pitch list starts with `at least ` and
the sentence ends with `; 1 pass with ambiguous notes nearby` / `; N passes with ambiguous
notes nearby` after any unassessed segment -- the messy-pass example from D-13 reads in full:
`Extra notes between E4 and F4: in 1 of 1 assessed passes (at least A4 twice, B4 twice); 1 pass
with ambiguous notes nearby`. Gap single pass: `Extra notes between D4 and E4: F4`, several
extras comma-separated in seq order, and `Extra notes between E4 and F4: at least A4, B4, A4,
B4 (ambiguous notes nearby)` when that gap is ambiguity-adjacent in the pass.

Beat = `onset.beats + 1`, fractional as `beat 2.5`. Played pitches are spelled by
`MidiCapture.noteName` (sharps: Eb4 prints as D#4).

Heading: `This session at 120 BPM - 3 passes` (`1 pass` when singular), with ` - finishing pass
N` appended while a pass is still pending; tempo selector option `120 BPM (4 passes)`; default
detail text before anything is clicked: `Click a coloured notehead or a + to see what happened
there.` The panel remembers the last clicked note or gap and rewrites its sentence from the
current view on every repaint; a remembered gap with no glyph in the current view, or a session
or piece change, returns the panel to the default text.

## 9. Colours, glyphs and views

Colours (D-18): wrong `#d00000`, missed `#0050d0`, clean `#000000`, untested `#b0b0b0`. Extra
glyph: red `+N` in the aggregate view, `+` in a single-pass view.

Glyph x position for `before:k` between two slots on one system: the midpoint of the previous
slot's right edge and the next slot's left edge; when the next slot's left edge is left of the
previous slot's right edge (a system break) the glyph sits 12 px right of the previous slot on
its own line. `before:0` sits 12 px left of slot 0; a gap after the last slot sits 12 px right
of it. `within:k` sits at the centre of slot k. Glyph y sits 18 px above the highest notehead
used at that position.

Two views only (D-17): "This session at N BPM" (default) and a single pass. A BPM selector
appears in the heading only with more than one tempo group. The score repaints after every
final pass, on load, and after a resize, always through the current `svgMap` -- never a full
OSMD re-render. A session is painted only on the score it was recorded against (D-01/D-20); a
piece switch clears the view rather than painting stale marks on a different score.

Out of scope for this document: timing verdicts beyond "deviationMs is recorded" (Phase 4),
intensity or bar shading (Phase 5), and persisting results (deferred past this phase, D-20).
