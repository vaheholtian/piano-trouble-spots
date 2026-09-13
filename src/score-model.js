/* Pure OSMD-sheet to plain-data score model extraction. Classic script so the HTML also opens
   directly from disk (D-13) and node:test can `require()` it for side effects (prototype
   piano-core.js pattern).

   @typedef {{ num: number, den: number, beats: number }} Rational
   Exact quarter-note-beat value. `num`/`den` are reduced by gcd with `den` always positive;
   `beats` is `num / den` as a plain Number, for display/convenience ONLY — never compare
   rationals by `beats`, always by `compareRationals` (cross-multiplication, no floats).

   @typedef {{ name: string, midi: number }} Pitch
   `name` is a scientific pitch name with written accidental (C4, F#5, Eb3).
   `midi` is the MIDI note number (middle C = 60).

   @typedef {{
     id: string,
     measure: number,
     staff: number,
     voice: number,
     onset: Rational,
     duration: Rational,
     pitch: Pitch,
     tiedNoteCount: number
   }} ModelNote
   `id` is structural: `m{measure}-s{staff}-v{voice}-b{onset.num}_{onset.den}-p{midi}` — never
   an array index, never anything the renderer computes (D-09). A tied continuation is folded
   into its start note: `duration` is the summed length across the tie chain and
   `tiedNoteCount` counts how many written notes contributed (D-03).

   @typedef {{
     number: number,
     start: Rational,
     length: Rational,
     timeSignature: { beats: number, beatType: number }
   }} ModelMeasure

   @typedef {{
     schemaVersion: number,
     title: string,
     measures: ModelMeasure[],
     notes: ModelNote[]
   }} ScoreModel
   Persisted contract from Phase 2 on (D-08): plain JSON, no OSMD object ever reachable from it.
   `JSON.parse(JSON.stringify(model))` must deep-equal `model`.
*/
'use strict';
globalThis.ScoreModel = (() => {
  const SCHEMA_VERSION = 1;

  // Pinned facts (see 01-01-PLAN.md "Facts pinned by planning-time probes"):
  // Pitch.ToStringShort(3) === Pitch.OctaveXmlDifference; MIDI = halfTone + 12 (middle C = 60).
  const OCTAVE_XML_DIFFERENCE = 3;
  const MIDI_OFFSET = 12;

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      const next = a % b;
      a = b;
      b = next;
    }
    return a;
  }

  function rational(num, den) {
    if (den < 0) {
      num = -num;
      den = -den;
    }
    const divisor = gcd(num, den) || 1;
    const n = num / divisor;
    const d = den / divisor;
    return { num: n, den: d, beats: n / d };
  }

  function addRationals(a, b) {
    return rational(a.num * b.den + b.num * a.den, a.den * b.den);
  }

  function compareRationals(a, b) {
    const left = a.num * b.den;
    const right = b.num * a.den;
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }

  // OSMD Fractions are whole-note based (1 = one whole note). Quarter-note beats are
  // GetExpandedNumerator() * 4 over Denominator, reduced by gcd — exact rational math,
  // never the float accessor times four (float rounding would bite dotted/tuplet values).
  function toQuarterBeats(fraction) {
    return rational(fraction.GetExpandedNumerator() * 4, fraction.Denominator);
  }

  function pitchOf(osmdNote) {
    return {
      name: osmdNote.Pitch.ToStringShort(OCTAVE_XML_DIFFERENCE),
      midi: osmdNote.halfTone + MIDI_OFFSET,
    };
  }

  function deriveNoteId({ measure, staff, voice, onset, midi }) {
    return `m${measure}-s${staff}-v${voice}-b${onset.num}_${onset.den}-p${midi}`;
  }

  // The single structural walk both the model and the renderer's SVG map use, so the two
  // stay in lockstep by construction rather than by lookup (RESEARCH Pattern 1).
  function walkNotes(sheet, visit) {
    for (const measure of sheet.SourceMeasures) {
      const measureNumber = measure.MeasureNumberXML;
      for (const container of measure.VerticalSourceStaffEntryContainers) {
        for (const staffEntry of container.StaffEntries) {
          if (!staffEntry) continue; // a staff can have no entry at this timestamp
          const staff = staffEntry.ParentStaff.Id;
          for (const voiceEntry of staffEntry.VoiceEntries) {
            const voice = voiceEntry.ParentVoice.VoiceId;
            const onset = toQuarterBeats(voiceEntry.Timestamp);
            voiceEntry.Notes.forEach((note, chordPosition) => {
              visit({ measure, measureNumber, staff, voice, onset, chordPosition, note });
            });
          }
        }
      }
    }
  }

  // Canonical order: measure ascending, then onset, then staff, then voice, then pitch.midi
  // ascending. Stable and float-free (compareRationals, never `.beats`).
  function compareNotes(a, b) {
    if (a.measure !== b.measure) return a.measure - b.measure;
    const onsetCmp = compareRationals(a.onset, b.onset);
    if (onsetCmp !== 0) return onsetCmp;
    if (a.staff !== b.staff) return a.staff - b.staff;
    if (a.voice !== b.voice) return a.voice - b.voice;
    return a.pitch.midi - b.pitch.midi;
  }

  function extract(sheet, hooks) {
    const measures = sheet.SourceMeasures.map((measure) => ({
      number: measure.MeasureNumberXML,
      start: toQuarterBeats(measure.AbsoluteTimestamp),
      length: toQuarterBeats(measure.Duration),
      timeSignature: {
        beats: measure.ActiveTimeSignature.Numerator,
        beatType: measure.ActiveTimeSignature.Denominator,
      },
    }));

    const notes = [];
    // Tie continuations look up the model note already emitted for their tie's start note.
    // Keyed by the live OSMD Note object (reference identity), discarded on return — never
    // part of the returned model.
    const modelByOsmdNote = new Map();
    // id -> live OSMD start note, so the onNote hook can pair ids with OSMD notes after the
    // final sort, without ever storing an OSMD object on the model itself.
    const osmdNoteById = new Map();

    walkNotes(sheet, ({ measureNumber, staff, voice, onset, note }) => {
      if (note.isRest()) return;

      const tie = note.NoteTie;
      const isContinuation = Boolean(tie) && tie.StartNote !== note;
      if (isContinuation) {
        const startModelNote = modelByOsmdNote.get(tie.StartNote);
        if (!startModelNote) {
          throw new Error('Tie continuation without a start note in measure ' + measureNumber);
        }
        startModelNote.duration = addRationals(startModelNote.duration, toQuarterBeats(note.Length));
        startModelNote.tiedNoteCount += 1;
        return;
      }

      const pitch = pitchOf(note);
      const id = deriveNoteId({ measure: measureNumber, staff, voice, onset, midi: pitch.midi });
      if (osmdNoteById.has(id)) {
        throw new Error('Duplicate note id ' + id);
      }

      const modelNote = {
        id,
        measure: measureNumber,
        staff,
        voice,
        onset,
        duration: toQuarterBeats(note.Length),
        pitch,
        tiedNoteCount: 1,
      };
      modelByOsmdNote.set(note, modelNote);
      osmdNoteById.set(id, note);
      notes.push(modelNote);
    });

    notes.sort(compareNotes);

    if (hooks && typeof hooks.onNote === 'function') {
      for (const modelNote of notes) {
        hooks.onNote(modelNote, osmdNoteById.get(modelNote.id));
      }
    }

    return { schemaVersion: SCHEMA_VERSION, title: sheet.TitleString, measures, notes };
  }

  return {
    SCHEMA_VERSION,
    extract,
    walkNotes,
    toQuarterBeats,
    deriveNoteId,
    pitchOf,
    compareNotes,
    rational,
    addRationals,
    compareRationals,
    gcd,
  };
})();
