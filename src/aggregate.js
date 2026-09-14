/* Pure fold of Align's per-pass PassResults into per-note and per-gap counts across a tempo
   group (D-16), plus the plain-language detail-panel sentences (D-19, section 8 of
   docs/analysis-rules.md). Classic script so index.html opens directly from disk (D-13) and
   node:test can `require()` it for side effects. No browser global anywhere -- noteName is
   always passed in by the caller (MidiCapture.noteName in the browser).
*/
'use strict';
globalThis.Aggregate = (() => {
  const Align = globalThis.Align;

  const REASON_ORDER = ['not-reached', 'restarted', 'ambiguous', 'tempo-changed'];
  const REASON_WORDS = { 'not-reached': 'not reached', restarted: 'restarted', ambiguous: 'ambiguous', 'tempo-changed': 'tempo changed' };
  const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

  function wordCount(n) {
    if (n === 1) return 'once';
    if (n === 2) return 'twice';
    if (n >= 0 && n <= 10) return NUMBER_WORDS[n] + ' times';
    return n + ' times';
  }

  function parseGapKey(gapKey) {
    const [kind, kStr] = gapKey.split(':');
    return { kind, k: Number(kStr) };
  }

  function slotByIndex(result, index) {
    return result.slots.find((s) => s.index === index) || null;
  }

  function slotReached(result, index) {
    const slot = slotByIndex(result, index);
    return !!(slot && slot.reached);
  }

  function slotAssessed(result, index) {
    const slot = slotByIndex(result, index);
    if (!slot) return false;
    return slot.noteIds.every((id) => result.notes[id] && result.notes[id].status !== 'unassessed');
  }

  function slotUnassessedAmbiguous(result, index) {
    const slot = slotByIndex(result, index);
    if (!slot) return false;
    return slot.noteIds.some((id) => {
      const verdict = result.notes[id];
      return verdict && verdict.status === 'unassessed' && verdict.reason === 'ambiguous';
    });
  }

  // The single implementation of the contract's per-pass gap rule (review 03-04 HIGH round 3):
  // returns { baseAssessable, extras, ambiguityAdjacent } from a full PassResult. Both
  // foldSession and describeGap call this -- neither re-derives the rule independently.
  function gapAssessment(result, gapKey) {
    const { kind, k } = parseGapKey(gapKey);
    const hasWholeReason = result.wholeReason !== null && result.wholeReason !== undefined;

    let baseAssessable;
    if (kind === 'before') {
      const slotIdx = k === 0 ? 0 : k - 1;
      baseAssessable = !hasWholeReason && slotReached(result, slotIdx);
    } else {
      baseAssessable = !hasWholeReason && slotAssessed(result, k);
    }

    const extras = (result.extras || [])
      .filter((e) => e.gap === gapKey)
      .slice()
      .sort((a, b) => a.seq - b.seq);

    let ambiguityAdjacent = (result.ambiguousPlayed || []).some((e) => e.gap === gapKey);
    if (!ambiguityAdjacent) {
      if (kind === 'before') {
        ambiguityAdjacent = slotUnassessedAmbiguous(result, k - 1) || slotUnassessedAmbiguous(result, k);
      } else {
        ambiguityAdjacent = slotUnassessedAmbiguous(result, k);
      }
    }

    return { baseAssessable, extras, ambiguityAdjacent };
  }

  function emptyNoteCounts() {
    return { played: 0, wrong: 0, missed: 0, assessed: 0, unassessed: { 'not-reached': 0, restarted: 0, ambiguous: 0 }, unassessedTotal: 0, wrongPitches: {} };
  }

  function emptyGapCounts() {
    return { passesWithExtra: 0, totalExtras: 0, assessedPasses: 0, unassessedPasses: 0, lowerBoundPasses: 0, pitches: {} };
  }

  // D-16: fold PassResults across passes at the same BPM. D-14 excludes non-attempts; D-16
  // excludes tempo-changed passes from every group; a null bpm (no origin) is ungrouped.
  function foldSession(model, passResults) {
    const slots = Align.buildSlots(model);
    const S = slots.length;
    const gapKeys = [];
    for (let k = 0; k <= S; k++) gapKeys.push('before:' + k);
    for (let k = 0; k < S; k++) gapKeys.push('within:' + k);

    const groupsByBpm = new Map();
    const groupOrder = [];
    let attempts = 0;
    let nonAttempts = 0;
    let tempoChanged = 0;
    let ungrouped = 0;

    function ensureGroup(bpm) {
      if (!groupsByBpm.has(bpm)) {
        const notes = {};
        for (const note of model.notes) notes[note.id] = emptyNoteCounts();
        const gaps = {};
        for (const key of gapKeys) gaps[key] = emptyGapCounts();
        const group = { bpm, passOrdinals: [], attempts: 0, notes, gaps };
        groupsByBpm.set(bpm, group);
        groupOrder.push(bpm);
      }
      return groupsByBpm.get(bpm);
    }

    for (const result of passResults) {
      if (!result.attempt) {
        nonAttempts++;
        continue;
      }
      if (result.wholeReason === 'tempo-changed') {
        tempoChanged++;
        continue;
      }
      if (result.bpm === null || result.bpm === undefined) {
        ungrouped++;
        continue;
      }

      attempts++;
      const group = ensureGroup(result.bpm);
      group.passOrdinals.push(result.passOrdinal);
      group.attempts++;

      for (const [noteId, verdict] of Object.entries(result.notes)) {
        const counts = group.notes[noteId];
        if (!counts) continue;
        if (verdict.status === 'played') {
          counts.played++;
          counts.assessed++;
        } else if (verdict.status === 'wrong') {
          counts.wrong++;
          counts.assessed++;
          counts.wrongPitches[verdict.playedPitch] = (counts.wrongPitches[verdict.playedPitch] || 0) + 1;
        } else if (verdict.status === 'missed') {
          counts.missed++;
          counts.assessed++;
        } else if (verdict.status === 'unassessed') {
          if (!(verdict.reason in counts.unassessed)) counts.unassessed[verdict.reason] = 0;
          counts.unassessed[verdict.reason]++;
          counts.unassessedTotal++;
        }
      }

      for (const gapKey of gapKeys) {
        const gapCounts = group.gaps[gapKey];
        const { baseAssessable, extras, ambiguityAdjacent } = gapAssessment(result, gapKey);
        if (!baseAssessable) {
          gapCounts.unassessedPasses++;
          continue;
        }
        if (extras.length > 0) {
          gapCounts.assessedPasses++;
          gapCounts.passesWithExtra++;
          gapCounts.totalExtras += extras.length;
          for (const extra of extras) gapCounts.pitches[extra.pitch] = (gapCounts.pitches[extra.pitch] || 0) + 1;
          if (ambiguityAdjacent) gapCounts.lowerBoundPasses++;
        } else if (ambiguityAdjacent) {
          gapCounts.unassessedPasses++;
        } else {
          gapCounts.assessedPasses++;
        }
      }
    }

    const tempoGroups = groupOrder.map((bpm) => groupsByBpm.get(bpm));
    return { analysisVersion: Align.ANALYSIS_VERSION, attempts, tempoGroups, nonAttempts, tempoChanged, ungrouped };
  }

  // D-18: the larger of wrong/missed picks the colour, tie goes to wrong; assessed 0 ->
  // untested; no mistakes -> clean.
  function colourFor(counts) {
    if (!counts || counts.assessed === 0) return 'untested';
    if (counts.wrong === 0 && counts.missed === 0) return 'clean';
    return counts.wrong >= counts.missed ? 'wrong' : 'missed';
  }

  function viewForTempoGroup(model, aggregate, bpm) {
    const group = aggregate.tempoGroups.find((g) => g.bpm === bpm) || null;
    const noteKinds = {};
    for (const note of model.notes) {
      noteKinds[note.id] = colourFor(group ? group.notes[note.id] : null);
    }
    const glyphs = {};
    if (group) {
      for (const [gapKey, gapCounts] of Object.entries(group.gaps)) {
        if (gapCounts.passesWithExtra > 0) {
          glyphs[gapKey] = { count: gapCounts.totalExtras, text: '+' + gapCounts.totalExtras };
        }
      }
    }
    return { kind: 'session', label: 'This session at ' + bpm + ' BPM', bpm, noteKinds, glyphs };
  }

  function viewForPass(model, passResult) {
    const kindMap = { played: 'clean', wrong: 'wrong', missed: 'missed', unassessed: 'untested' };
    const noteKinds = {};
    for (const note of model.notes) {
      const verdict = passResult.notes[note.id];
      noteKinds[note.id] = verdict ? kindMap[verdict.status] : 'untested';
    }
    const glyphs = {};
    for (const extra of passResult.extras || []) {
      if (!glyphs[extra.gap]) glyphs[extra.gap] = { count: 0, text: '+' };
      glyphs[extra.gap].count++;
    }
    return { kind: 'pass', label: 'Pass ' + passResult.passOrdinal, bpm: passResult.bpm, noteKinds, glyphs };
  }

  function unassessedReasonList(unassessedCounts) {
    const parts = [];
    for (const reason of REASON_ORDER) {
      const n = unassessedCounts && unassessedCounts[reason] ? unassessedCounts[reason] : 0;
      if (n > 0) parts.push(n + ' ' + REASON_WORDS[reason]);
    }
    return parts.join(', ');
  }

  function beatText(note) {
    return String(note.onset.beats + 1);
  }

  function noteLabel(note) {
    return note.pitch.name + ', bar ' + note.measure + ' beat ' + beatText(note) + ':';
  }

  function describeNote(model, noteId, source, options) {
    const note = model.notes.find((n) => n.id === noteId);
    const label = noteLabel(note);
    const noteNameFn = (options && options.noteName) || ((m) => String(m));

    if (source.kind === 'pass') {
      const verdict = source.result.notes[noteId];
      if (!verdict) return label + ' no passes yet';
      if (verdict.status === 'played') return label + ' played';
      if (verdict.status === 'wrong') return label + ' wrong, played ' + noteNameFn(verdict.playedPitch);
      if (verdict.status === 'missed') return label + ' missed';
      return label + ' unassessed (' + REASON_WORDS[verdict.reason] + ')';
    }

    const counts = source.counts;
    if (!counts || (counts.assessed === 0 && counts.unassessedTotal === 0)) return label + ' no passes yet';

    if (counts.assessed === 0) {
      return label + ' not assessed in any pass (' + unassessedReasonList(counts.unassessed) + ')';
    }

    const clauses = [];
    if (counts.wrong > 0) {
      const suffix = clauses.length === 0 ? ' assessed passes' : '';
      const pitches = Object.entries(counts.wrongPitches)
        .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))
        .map(([midi, n]) => noteNameFn(Number(midi)) + ' ' + wordCount(n))
        .join(', ');
      clauses.push('wrong in ' + counts.wrong + ' of ' + counts.assessed + suffix + ' (played ' + pitches + ')');
    }
    if (counts.missed > 0) {
      const suffix = clauses.length === 0 ? ' assessed passes' : '';
      clauses.push('missed in ' + counts.missed + ' of ' + counts.assessed + suffix);
    }

    let sentence;
    if (clauses.length === 0) {
      sentence = label + ' played correctly in all ' + counts.assessed + ' assessed passes';
    } else {
      sentence = label + ' ' + clauses.join('; ');
    }

    if (counts.unassessedTotal > 0) {
      sentence += '; ' + counts.unassessedTotal + (counts.unassessedTotal === 1 ? ' pass' : ' passes') + ' unassessed (' + unassessedReasonList(counts.unassessed) + ')';
    }
    return sentence;
  }

  function slotLabel(slots, index) {
    const slot = slots[index];
    if (!slot) return null;
    if (slot.noteIds.length > 1) {
      return 'the chord at bar ' + slot.notes[0].measure + ' beat ' + beatText(slot.notes[0]);
    }
    return slot.notes[0].pitch.name;
  }

  function gapNamingPhrase(model, gapKey) {
    const slots = Align.buildSlots(model);
    const { kind, k } = parseGapKey(gapKey);
    if (kind === 'within') return 'played with ' + slotLabel(slots, k);
    if (k === 0) return 'before ' + slotLabel(slots, 0);
    if (k === slots.length) return 'after ' + slotLabel(slots, slots.length - 1);
    return 'between ' + slotLabel(slots, k - 1) + ' and ' + slotLabel(slots, k);
  }

  function describeGap(model, gapKey, source, options) {
    const noteNameFn = (options && options.noteName) || ((m) => String(m));
    const phrase = 'Extra notes ' + gapNamingPhrase(model, gapKey) + ':';

    if (source.kind === 'pass') {
      const { extras, ambiguityAdjacent } = gapAssessment(source.result, gapKey);
      const pitchList = extras.map((e) => noteNameFn(e.pitch)).join(', ');
      if (ambiguityAdjacent) return phrase + ' at least ' + pitchList + ' (ambiguous notes nearby)';
      return phrase + ' ' + pitchList;
    }

    const gap = source.gap;
    if (!gap || gap.passesWithExtra === 0) return phrase + ' no extras';

    const pitchEntries = Object.entries(gap.pitches).sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]));
    const pitchList = pitchEntries.map(([midi, n]) => noteNameFn(Number(midi)) + ' ' + wordCount(n)).join(', ');
    const prefix = gap.lowerBoundPasses > 0 ? 'at least ' : '';
    let sentence = phrase + ' in ' + gap.passesWithExtra + ' of ' + gap.assessedPasses + ' assessed passes (' + prefix + pitchList + ')';
    if (gap.unassessedPasses > 0) {
      sentence += '; ' + gap.unassessedPasses + (gap.unassessedPasses === 1 ? ' pass unassessed' : ' passes unassessed');
    }
    if (gap.lowerBoundPasses > 0) {
      sentence += '; ' + gap.lowerBoundPasses + (gap.lowerBoundPasses === 1 ? ' pass with ambiguous notes nearby' : ' passes with ambiguous notes nearby');
    }
    return sentence;
  }

  function headingFor(aggregate, view, options) {
    const pendingOrdinals = (options && options.pendingOrdinals) || [];
    if (!view || view.kind !== 'session' || view.bpm === null || view.bpm === undefined) return 'No session';
    const group = aggregate.tempoGroups.find((g) => g.bpm === view.bpm);
    const count = group ? group.attempts : 0;
    let heading = 'This session at ' + view.bpm + ' BPM - ' + count + (count === 1 ? ' pass' : ' passes');
    if (pendingOrdinals.length > 0) heading += ' - finishing pass ' + pendingOrdinals[0];
    return heading;
  }

  return {
    foldSession,
    gapAssessment,
    colourFor,
    viewForTempoGroup,
    viewForPass,
    describeNote,
    describeGap,
    headingFor,
    wordCount,
  };
})();

if (typeof module !== 'undefined') module.exports = globalThis.Aggregate;
