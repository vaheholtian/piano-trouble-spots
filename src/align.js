/* Pure score-to-performance alignment engine (D-01 to D-16, D-20; docs/analysis-rules.md is the
   interpretation contract this file implements). Classic script so index.html opens directly
   from disk (D-13) and node:test can `require()` it for side effects. Never touches the DOM,
   Web MIDI or Web Audio (ANLZ-03) -- plain data in, plain data out, inputs never mutated.

   This plan (03-02) runs the in-time reading only (lag 0). `alignAtLag`'s `lag` parameter and
   the loop that will try lag 1..H are the seam plan 03-03 extends for late-entry readings
   (D-02); `alignPass` always calls it with lag 0 and leaves that seam commented below. The
   `tunables.reachClock` switch is the one place the pending user decision on D-11's reach rule
   is applied -- both values agree at lag 0, so this plan cannot yet tell them apart (03-03 does).
   The DP's deterministic back-pointer preference (pair > delete > insert) and pairCost's
   in-chord minimum-distance pairing are placeholders for ordering only; genuine ties become
   `ambiguous` in 03-03 (alignment/lag ties) and 03-08 (in-chord ties, rung 4) -- no fixture in
   this plan exercises a tie.
*/
'use strict';
globalThis.Align = (() => {
  const ScoreModel = globalThis.ScoreModel;

  const ANALYSIS_VERSION = 1;
  const REASONS = ['not-reached', 'restarted', 'ambiguous', 'tempo-changed'];

  const DEFAULT_TUNABLES = Object.freeze({
    chordWindowMs: 50,
    markGraceBeats: 0.5,
    restartPrefixSlots: 3,
    lateEntryProbeTokens: 3,
    // Policy switch for the reach computation (see resolveReach below) -- 'origin' is D-11 as
    // written (user decision pending, review 03-01 HIGH round 2); both values agree at lag 0.
    reachClock: 'origin',
    weights: Object.freeze({
      substitution: 3,
      deletion: 4,
      insertion: 3,
      perBeat: 3.4,
      lateEntry: 2,
    }),
  });

  function resolveTunables(partial) {
    if (!partial) return DEFAULT_TUNABLES;
    const merged = { ...DEFAULT_TUNABLES, ...partial };
    merged.weights = { ...DEFAULT_TUNABLES.weights, ...(partial.weights || {}) };
    return merged;
  }

  // D-01: the first bar-1 (accented) click at or after the pass's start timestamp. null when
  // no such click exists in the recorded timeline (RESEARCH Pitfall 2 -- never nearest-click).
  function resolveOrigin(clicks, passStartTimeStamp) {
    const index = clicks.findIndex((c) => c.accent && c.pageTime >= passStartTimeStamp);
    return index === -1 ? null : index;
  }

  // Expected time for an absolute onset (rational quarter-beats from bar 1 beat 1), looked up
  // in the recorded click array at (originIndex + whole beats), linearly interpolated to the
  // next click for a fractional onset (RESEARCH Pattern 2). `.beats` is used here only for the
  // interpolation fraction -- display/convenience math, never an equality/ordering decision
  // (score-model.js's own convention; ordering elsewhere always goes through compareRationals).
  function expectedTime(clicks, originIndex, onset) {
    if (originIndex === null || originIndex === undefined) return null;
    const whole = Math.floor(onset.num / onset.den);
    const frac = onset.beats - whole;
    const before = clicks[originIndex + whole];
    if (!before) return null;
    if (frac === 0) return before.pageTime;
    const after = clicks[originIndex + whole + 1];
    if (!after) return before.pageTime;
    return before.pageTime + frac * (after.pageTime - before.pageTime);
  }

  // The gap from click `index` to the next recorded click; the previous gap when there is no
  // next click (used for the reach/finalization grace and for the DP's timing-cost denominator).
  function localBeatMs(clicks, index) {
    if (index === null || index === undefined || !clicks[index]) return 0;
    if (clicks[index + 1]) return clicks[index + 1].pageTime - clicks[index].pageTime;
    if (clicks[index - 1]) return clicks[index].pageTime - clicks[index - 1].pageTime;
    return 0;
  }

  function lastClickAtOrBeforeIndex(clicks, time, fallbackIndex) {
    let found = null;
    for (let i = 0; i < clicks.length; i++) {
      if (clicks[i].pageTime <= time) found = i;
      else break;
    }
    return found !== null ? found : fallbackIndex;
  }

  function lastBpmBeforeOrNull(clicks, timeStamp) {
    let bpm = null;
    for (const click of clicks) {
      if (click.pageTime <= timeStamp) bpm = click.bpm;
      else break;
    }
    return bpm;
  }

  // A slot is a distinct absolute onset (measure start + note onset, compared via
  // ScoreModel.compareRationals -- never floats) holding every score note at that onset across
  // both staves, in the model's own canonical order. `model.notes` is already sorted that way
  // (ScoreModel.extract), so consecutive equal-onset notes group naturally; `pitches` is sorted
  // ascending at the end so chord pairing never depends on staff/voice ordering.
  function buildSlots(model) {
    const measureStart = new Map(model.measures.map((m) => [m.number, m.start]));
    const slots = [];
    for (const note of model.notes) {
      const onset = ScoreModel.addRationals(measureStart.get(note.measure), note.onset);
      const last = slots[slots.length - 1];
      if (last && ScoreModel.compareRationals(last.onset, onset) === 0) {
        last.noteIds.push(note.id);
        last.notes.push(note);
        last.pitches.push(note.pitch.midi);
      } else {
        slots.push({ index: slots.length, onset, noteIds: [note.id], notes: [note], pitches: [note.pitch.midi] });
      }
    }
    for (const slot of slots) slot.pitches.sort((a, b) => a - b);
    return slots;
  }

  function idForPitchInSlot(slot, pitch) {
    const note = slot.notes.find((n) => n.pitch.midi === pitch);
    return note ? note.id : null;
  }

  // Note-ons read in seq order, never timestamp order (the segmenter already orders by seq).
  // A note-on joins the open token when the absolute difference between its own timeStamp and
  // the open token's first note-on (never re-set once the token opens) is at most
  // chordWindowMs -- even when a later-seq note carries an earlier timestamp (review 03-01 HIGH
  // round 3). A pitch already in the token joins as a duplicate. Raw notes are never reordered
  // or modified; each token additionally keeps `firstByPitch`, the actual played-note record
  // for each unique pitch (its own real timeStamp/seq), so `deviationMs` is always computed
  // from that note's own timestamp, never the token's shared onset (review 03-02 MEDIUM).
  function tokenizePlayed(notes, chordWindowMs) {
    const tokens = [];
    let open = null;
    for (const note of notes) {
      if (open && Math.abs(note.timeStamp - open.onsetTime) <= chordWindowMs) {
        open.notes.push(note);
      } else {
        open = { onsetTime: note.timeStamp, notes: [note] };
        tokens.push(open);
      }
    }
    for (const token of tokens) {
      const firstByPitch = new Map();
      token.duplicates = [];
      for (const note of token.notes) {
        if (!firstByPitch.has(note.note)) firstByPitch.set(note.note, note);
        else token.duplicates.push(note);
      }
      token.pitches = [...firstByPitch.keys()].sort((a, b) => a - b);
      token.firstByPitch = firstByPitch;
    }
    return tokens;
  }

  // Pair cost for one slot against one token (or a deletion/insertion when one side is null),
  // in integer thousandths of a weight unit -- weights.substitution/deletion/insertion are
  // exact-integer thousandths by construction; only the timing term is ever rounded, once
  // (`Math.round`), so equal-cost alternatives compare exactly with no epsilon.
  //
  // Equal pitches pair one-to-one as a multiset (played, D-09). Any remaining slot/token
  // pitches are paired by nearest semitone distance (sorted-greedy placeholder -- exact
  // minimum-distance assignment and equal-distance ambiguity detection over chords of more than
  // one remaining note on each side is the seam plan 03-08 fills in for rung 4; no fixture here
  // has more than one remaining pitch on either side). Leftover slot pitches are missed;
  // leftover token pitches, including duplicates, are extras.
  function pairCost(slot, token, expected, beatMs, tunables) {
    const w = tunables.weights;

    if (!token) {
      const missed = slot.pitches.slice();
      return { cost: w.deletion * 1000 * missed.length, pairs: [], missed, extraNotes: [], timingCost: 0 };
    }
    if (!slot) {
      const extraNotes = [...token.pitches.map((p) => token.firstByPitch.get(p)), ...token.duplicates];
      return { cost: w.insertion * 1000 * extraNotes.length, pairs: [], missed: [], extraNotes, timingCost: 0 };
    }

    const slotRemaining = slot.pitches.slice();
    const tokenRemaining = token.pitches.slice();
    const pairs = [];
    for (let i = slotRemaining.length - 1; i >= 0; i--) {
      const pitch = slotRemaining[i];
      const idx = tokenRemaining.indexOf(pitch);
      if (idx !== -1) {
        pairs.push({ slotPitch: pitch, tokenPitch: pitch, wrong: false });
        slotRemaining.splice(i, 1);
        tokenRemaining.splice(idx, 1);
      }
    }
    slotRemaining.sort((a, b) => a - b);
    tokenRemaining.sort((a, b) => a - b);
    const n = Math.min(slotRemaining.length, tokenRemaining.length);
    for (let i = 0; i < n; i++) {
      pairs.push({ slotPitch: slotRemaining[i], tokenPitch: tokenRemaining[i], wrong: true });
    }
    const missed = slotRemaining.slice(n);
    const extraPitches = tokenRemaining.slice(n);
    const extraNotes = [...extraPitches.map((p) => token.firstByPitch.get(p)), ...token.duplicates];

    const timingCost = Math.round((w.perBeat * 1000 * Math.abs(token.onsetTime - expected)) / beatMs);
    const cost =
      pairs.filter((p) => p.wrong).length * w.substitution * 1000 +
      missed.length * w.deletion * 1000 +
      extraNotes.length * w.insertion * 1000 +
      timingCost;

    return { cost, pairs, missed, extraNotes, timingCost };
  }

  function countSlotsAtOrBefore(slotInfo, timeStamp) {
    let k = 0;
    for (const si of slotInfo) {
      if (si.expected !== null && si.expected <= timeStamp) k++;
    }
    return k;
  }

  // The full in-reading computation at one lag: expected times and reach at (originIndex +
  // lag), a forward DP over reached slots x tokens (pair/delete/insert, back-pointers
  // preferring pair > delete > insert on a cost tie -- ordering only, see file header), and the
  // resulting per-note labels and gap-keyed extras. `alignPass` always calls this with lag 0
  // (this plan); plan 03-03 loops lag 0..H here and keeps the cheapest reading (D-02).
  function alignAtLag(model, pass, clicks, lag, tunables) {
    const originIndex = resolveOrigin(clicks, pass.startTimeStamp);
    const slots = buildSlots(model);
    const end =
      pass.endTimeStamp !== null && pass.endTimeStamp !== undefined
        ? pass.endTimeStamp
        : pass.notes[pass.notes.length - 1].timeStamp;

    const bIndex = lastClickAtOrBeforeIndex(clicks, end, originIndex);
    const localMsAtB = localBeatMs(clicks, bIndex);
    const graceMs = tunables.markGraceBeats * localMsAtB;

    // Reach clock: the reach-clock time is the lag-0 expected time when tunables.reachClock is
    // 'origin' (the default), or this reading's own expected time when 'reading'. Identical at
    // lag 0 -- this plan cannot tell them apart; plan 03-03 evaluates lag > 0 and the fixtures
    // that do.
    const slotInfo = slots.map((slot) => {
      const readingExpected = expectedTime(clicks, originIndex + lag, slot.onset);
      const reachExpected =
        tunables.reachClock === 'reading' ? readingExpected : expectedTime(clicks, originIndex, slot.onset);
      const reached = reachExpected !== null && reachExpected <= end + graceMs;
      return { slot, expected: readingExpected, reached };
    });

    const reachedList = slotInfo.filter((s) => s.reached);
    const tokens = tokenizePlayed(pass.notes, tunables.chordWindowMs);

    const n = reachedList.length;
    const m = tokens.length;
    const F = [];
    const back = [];
    const pairInfoTable = [];
    for (let i = 0; i <= n; i++) {
      F.push(new Array(m + 1).fill(0));
      back.push(new Array(m + 1).fill(null));
      pairInfoTable.push(new Array(m + 1).fill(null));
    }

    for (let i = 1; i <= n; i++) {
      const delPc = pairCost(reachedList[i - 1].slot, null, null, null, tunables);
      F[i][0] = F[i - 1][0] + delPc.cost;
      back[i][0] = 'delete';
    }
    for (let j = 1; j <= m; j++) {
      const insPc = pairCost(null, tokens[j - 1], null, null, tunables);
      F[0][j] = F[0][j - 1] + insPc.cost;
      back[0][j] = 'insert';
    }

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const s = reachedList[i - 1];
        const t = tokens[j - 1];
        const wholeBeats = Math.floor(s.slot.onset.num / s.slot.onset.den);
        const beatMs = localBeatMs(clicks, originIndex + lag + wholeBeats);
        const pc = pairCost(s.slot, t, s.expected, beatMs, tunables);
        const pairTotal = F[i - 1][j - 1] + pc.cost;
        const delPc = pairCost(s.slot, null, null, null, tunables);
        const delTotal = F[i - 1][j] + delPc.cost;
        const insPc = pairCost(null, t, null, null, tunables);
        const insTotal = F[i][j - 1] + insPc.cost;

        let bestOp = 'pair';
        let bestVal = pairTotal;
        if (delTotal < bestVal) {
          bestOp = 'delete';
          bestVal = delTotal;
        }
        if (insTotal < bestVal) {
          bestOp = 'insert';
          bestVal = insTotal;
        }
        F[i][j] = bestVal;
        back[i][j] = bestOp;
        if (bestOp === 'pair') pairInfoTable[i][j] = pc;
      }
    }

    const notes = {};
    const withinExtras = [];
    const insertExtras = [];
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
      const op = i > 0 && j > 0 ? back[i][j] : i > 0 ? 'delete' : 'insert';
      if (op === 'pair') {
        const s = reachedList[i - 1];
        const t = tokens[j - 1];
        const pc = pairInfoTable[i][j];
        for (const p of pc.pairs) {
          const note = t.firstByPitch.get(p.tokenPitch);
          const id = idForPitchInSlot(s.slot, p.slotPitch);
          notes[id] = p.wrong
            ? { status: 'wrong', playedPitch: p.tokenPitch, playedSeq: note.seq, deviationMs: note.timeStamp - s.expected }
            : { status: 'played', playedSeq: note.seq, deviationMs: note.timeStamp - s.expected };
        }
        for (const pitch of pc.missed) {
          const id = idForPitchInSlot(s.slot, pitch);
          notes[id] = { status: 'missed' };
        }
        for (const note of pc.extraNotes) {
          withinExtras.push({ seq: note.seq, pitch: note.note, timeStamp: note.timeStamp, gap: 'within:' + s.slot.index });
        }
        i--;
        j--;
      } else if (op === 'delete') {
        const s = reachedList[i - 1];
        for (const pitch of s.slot.pitches) {
          const id = idForPitchInSlot(s.slot, pitch);
          notes[id] = { status: 'missed' };
        }
        i--;
      } else {
        const t = tokens[j - 1];
        const pc = pairCost(null, t, null, null, tunables);
        for (const note of pc.extraNotes) {
          insertExtras.push({ seq: note.seq, pitch: note.note, timeStamp: note.timeStamp });
        }
        j--;
      }
    }

    const gapExtras = insertExtras.map((e) => ({ ...e, gap: 'before:' + countSlotsAtOrBefore(slotInfo, e.timeStamp) }));

    for (const si of slotInfo) {
      if (!si.reached) {
        for (const id of si.slot.noteIds) notes[id] = { status: 'unassessed', reason: 'not-reached' };
      }
    }

    const extras = [...withinExtras, ...gapExtras].sort((a, b) => a.seq - b.seq);
    const slotsInfoAll = slotInfo.map((si) => ({
      index: si.slot.index,
      noteIds: si.slot.noteIds,
      expectedTime: si.expected,
      reached: si.reached,
    }));

    return { cost: F[n][m], notes, extras, slotsInfoAll };
  }

  // The full per-pass result (D-14/D-20 shapes). Always uses lag 0 (the seam above) and always
  // reports the origin/deviationMs at lag 0 -- the origin never moves (D-02).
  function alignPass(model, pass, clicks, tunablesInput) {
    const tunables = resolveTunables(tunablesInput);
    const originIndex = resolveOrigin(clicks, pass.startTimeStamp);
    const attempt = pass.notes.length > 0;
    const allSlots = buildSlots(model);

    if (!attempt) {
      const bpm = originIndex !== null ? clicks[originIndex].bpm : lastBpmBeforeOrNull(clicks, pass.startTimeStamp);
      return {
        analysisVersion: ANALYSIS_VERSION,
        passOrdinal: pass.ordinal,
        attempt: false,
        originIndex,
        originTime: originIndex !== null ? clicks[originIndex].pageTime : null,
        bpm,
        endTime: pass.endTimeStamp,
        entryLag: 0,
        totalCost: 0,
        wholeReason: null,
        slots: allSlots.map((s) => ({ index: s.index, noteIds: s.noteIds, expectedTime: null, reached: false })),
        notes: {},
        extras: [],
        ambiguousPlayed: [],
      };
    }

    if (originIndex === null) {
      // D-01 "No origin": every score note is unassessed not-reached; every played note is an
      // extra at before:0, listed but never counted (before:0 is unassessed in this case).
      const tokens = tokenizePlayed(pass.notes, tunables.chordWindowMs);
      const notes = {};
      for (const slot of allSlots) {
        for (const id of slot.noteIds) notes[id] = { status: 'unassessed', reason: 'not-reached' };
      }
      const extras = [];
      for (const token of tokens) {
        const pc = pairCost(null, token, null, null, tunables);
        for (const note of pc.extraNotes) extras.push({ seq: note.seq, pitch: note.note, timeStamp: note.timeStamp, gap: 'before:0' });
      }
      extras.sort((a, b) => a.seq - b.seq);
      return {
        analysisVersion: ANALYSIS_VERSION,
        passOrdinal: pass.ordinal,
        attempt: true,
        originIndex: null,
        originTime: null,
        bpm: lastBpmBeforeOrNull(clicks, pass.startTimeStamp),
        endTime: pass.endTimeStamp,
        entryLag: 0,
        totalCost: 0,
        wholeReason: null,
        slots: allSlots.map((s) => ({ index: s.index, noteIds: s.noteIds, expectedTime: null, reached: false })),
        notes,
        extras,
        ambiguousPlayed: [],
      };
    }

    const reading = alignAtLag(model, pass, clicks, 0, tunables);
    return {
      analysisVersion: ANALYSIS_VERSION,
      passOrdinal: pass.ordinal,
      attempt: true,
      originIndex,
      originTime: clicks[originIndex].pageTime,
      bpm: clicks[originIndex].bpm,
      endTime: pass.endTimeStamp,
      entryLag: 0,
      totalCost: reading.cost,
      wholeReason: null,
      slots: reading.slotsInfoAll,
      notes: reading.notes,
      extras: reading.extras,
      ambiguousPlayed: [],
    };
  }

  function analyzeSession(model, passes, clicks, tunablesInput) {
    const tunables = resolveTunables(tunablesInput);
    return passes.map((pass) => alignPass(model, pass, clicks, tunables));
  }

  // A completed pass is final when the session has ended, or when the recorded timeline holds
  // an accented click at or after the pass start and its last click is at or after
  // pass end + (markGraceBeats + 1) x localBeatMs(b) -- section 5 of docs/analysis-rules.md.
  function isFinal(pass, clicks, sessionEnded, tunablesInput) {
    if (sessionEnded) return true;
    if (pass.endTimeStamp === null || pass.endTimeStamp === undefined) return false;
    const tunables = resolveTunables(tunablesInput);
    const originIndex = resolveOrigin(clicks, pass.startTimeStamp);
    if (originIndex === null) return false;
    const lastClick = clicks[clicks.length - 1];
    if (!lastClick) return false;
    const end = pass.endTimeStamp;
    const bIndex = lastClickAtOrBeforeIndex(clicks, end, originIndex);
    const localMs = localBeatMs(clicks, bIndex);
    const threshold = end + (tunables.markGraceBeats + 1) * localMs;
    return lastClick.pageTime >= threshold;
  }

  // The PassResult with `expectedTime` removed from every slot whose `reached` is false --
  // once final, this is exactly what appending more clicks can never change (section 5). Never
  // mutates its input.
  function stableFields(result) {
    const clone = JSON.parse(JSON.stringify(result));
    if (Array.isArray(clone.slots)) {
      for (const slot of clone.slots) {
        if (!slot.reached) delete slot.expectedTime;
      }
    }
    return clone;
  }

  return {
    ANALYSIS_VERSION,
    REASONS,
    DEFAULT_TUNABLES,
    resolveTunables,
    resolveOrigin,
    expectedTime,
    localBeatMs,
    buildSlots,
    tokenizePlayed,
    pairCost,
    alignAtLag,
    alignPass,
    analyzeSession,
    isFinal,
    stableFields,
  };
})();

if (typeof module !== 'undefined') module.exports = globalThis.Align;
