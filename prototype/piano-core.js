/* Pure MIDI and timing logic. Classic script so the HTML also opens directly from disk. */
'use strict';
globalThis.PianoCore = (() => {
  const finite = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  const integer = (n, min, max) => Number.isInteger(n) && finite(n, min, max);
  const limits = Object.freeze({midiBytes: 16 * 1024 * 1024, sessionBytes: 64 * 1024 * 1024,
    takes: 2000, notesPerTake: 20000, notesPerSession: 200000, seconds: 86400});
  const names = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const pitchName = p => names[p % 12] + (Math.floor(p / 12) - 1);
  const median = values => {
    if (!values.length) return null;
    const a = [...values].sort((x, y) => x - y), m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };

  function parseMidi(buffer) {
    const d = new DataView(buffer);
    let p = 0, limit = d.byteLength;
    const need = n => { if (p + n > limit) throw new Error('Truncated MIDI file.'); };
    const u8 = () => { need(1); return d.getUint8(p++); };
    const u16 = () => (u8() << 8) | u8();
    const u32 = () => u16() * 65536 + u16();
    const str = n => Array.from({length: n}, () => String.fromCharCode(u8())).join('');
    const skip = n => { need(n); p += n; };
    const vlq = () => {
      let value = 0;
      for (let i = 0; i < 4; i++) { const b = u8(); value = value * 128 + (b & 127); if (!(b & 128)) return value; }
      throw new Error('Invalid MIDI variable-length value.');
    };
    if (str(4) !== 'MThd') throw new Error('Not a MIDI file.');
    const headerLength = u32(), format = u16(), nTracks = u16(), division = u16();
    if (headerLength < 6 || format > 1 || !nTracks || (format === 0 && nTracks !== 1) || !division || (division & 0x8000)) {
      throw new Error('Use a format 0 or 1 MIDI file with beat-based timing.');
    }
    skip(headerLength - 6);
    const tempos = [{tick: 0, us: 500000}], meters = [{tick: 0, num: 4, den: 4}], raw = [];
    for (let track = 0; track < nTracks; track++) {
      if (str(4) !== 'MTrk') throw new Error('Invalid MIDI track.');
      const length = u32(); need(length); const end = p + length; limit = end;
      let tick = 0, status = 0;
      const open = new Map();
      while (p < end) {
        tick += vlq(); const b = u8();
        if (b === 0xff) {
          status = 0;
          const type = u8(), size = vlq(); need(size); const next = p + size;
          if (type === 0x51) {
            if (size !== 3) throw new Error('Invalid MIDI tempo event.');
            const us = u8() * 65536 + u16(); if (!us) throw new Error('Invalid MIDI tempo.');
            tempos.push({tick, us});
          } else if (type === 0x58) {
            if (size !== 4) throw new Error('Invalid MIDI time signature.');
            const num = u8(), exponent = u8();
            if (!num || exponent > 7) throw new Error('Unsupported time signature.');
            meters.push({tick, num, den: 2 ** exponent});
          }
          p = next;
          if (type === 0x2f) break;
          continue;
        }
        if (b === 0xf0 || b === 0xf7) { status = 0; const size = vlq(); skip(size); continue; }
        let first;
        if (b & 128) {
          if (b >= 0xf0) throw new Error('Unsupported MIDI event.');
          status = b; first = u8();
        } else { if (!status) throw new Error('Invalid MIDI running status.'); first = b; }
        const kind = status >> 4, channel = status & 15;
        const second = kind === 0xc || kind === 0xd ? 0 : u8();
        if (first > 127 || second > 127) throw new Error('Invalid MIDI note data.');
        const key = channel + ':' + first;
        if (kind === 9 && second > 0) {
          let queue = open.get(key);
          if (!queue) open.set(key, queue = {notes: [], head: 0});
          queue.notes.push({pitch: first, tick, track, channel});
        } else if (kind === 8 || (kind === 9 && second === 0)) {
          // Advance a read cursor instead of shifting: shift() is O(n) and quadratic on deep overlaps.
          const queue = open.get(key);
          const note = queue && queue.head < queue.notes.length ? queue.notes[queue.head++] : undefined;
          if (queue && queue.head > 64 && queue.head * 2 >= queue.notes.length) {
            queue.notes = queue.notes.slice(queue.head); queue.head = 0;
          }
          if (note && channel !== 9) raw.push({...note, endTick: tick});
        }
      }
      if ([...open.values()].some(q => q.notes.some((n, i) => i >= q.head && n.channel !== 9))) {
        throw new Error('Some reference notes have no key release. Note lengths cannot be measured reliably.');
      }
      p = end; limit = d.byteLength;
    }
    // Keep the last event at each tick, including overrides of the default tempo/meter.
    const unique = events => [...new Map(events.sort((a, b) => a.tick - b.tick).map(e => [e.tick, e])).values()];
    const tempoSegments = unique(tempos), meterSegments = unique(meters);
    let seconds = 0;
    tempoSegments.forEach((s, i) => {
      const prev = tempoSegments[i - 1];
      if (prev) seconds += (s.tick - prev.tick) / division * prev.us / 1e6;
      s.seconds = seconds;
    });
    const segmentAt = (segments, tick) => {
      let low = 0, high = segments.length - 1;
      while (low < high) { const mid = Math.ceil((low + high) / 2); if (segments[mid].tick <= tick) low = mid; else high = mid - 1; }
      return segments[low];
    };
    const toSeconds = tick => { const s = segmentAt(tempoSegments, tick); return s.seconds + (tick - s.tick) / division * s.us / 1e6; };
    let bar = 1;
    meterSegments.forEach((s, i) => {
      const prev = meterSegments[i - 1];
      if (prev) bar += Math.ceil((s.tick - prev.tick) / prev.ticksPerBar);
      s.bar = bar; s.ticksPerBeat = division * 4 / s.den; s.ticksPerBar = s.ticksPerBeat * s.num;
    });
    const notes = raw.map(n => {
      const s = segmentAt(meterSegments, n.tick), rel = n.tick - s.tick;
      return {pitch: n.pitch, on: toSeconds(n.tick), off: toSeconds(n.endTick),
        bar: s.bar + Math.floor(rel / s.ticksPerBar), beat: 1 + (rel % s.ticksPerBar) / s.ticksPerBeat,
        track: n.track, channel: n.channel};
    }).sort((a, b) => a.on - b.on || a.pitch - b.pitch || a.track - b.track);
    if (!notes.length) throw new Error('No pitched notes found in this MIDI file.');
    return {notes, nBars: notes[notes.length - 1].bar};
  }

  function validateSong(song) {
    if (!song || typeof song.name !== 'string' || song.name.length > 500 || !integer(song.nBars, 1, 10000) ||
        !Array.isArray(song.notes) || !song.notes.length || song.notes.length > 100000) throw new Error('Invalid song data.');
    let previous = -1, previousBar = 1, previousBeat = 1;
    for (const n of song.notes) {
      if (!n || !integer(n.pitch, 0, 127) || !finite(n.on, 0, 86400) || !finite(n.off, n.on, 86400) ||
          !integer(n.bar, 1, song.nBars) || !finite(n.beat, 1, 256) || !integer(n.track, 0, 65535) ||
          !integer(n.channel, 0, 15) || n.channel === 9 || n.on < previous || n.bar < previousBar ||
          (n.bar === previousBar && n.beat < previousBeat)) {
        throw new Error('Invalid reference note data.');
      }
      previous = n.on; previousBar = n.bar; previousBeat = n.beat;
    }
    if (previousBar !== song.nBars) throw new Error('Invalid final reference measure.');
    return song;
  }

  function validateSettings(settings, song) {
    if (!settings || !integer(settings.startBar, 1, song.nBars) || ![4, 8].includes(settings.measures) ||
        !integer(settings.attackTolerance, 10, 500) ||
        !integer(settings.lengthTolerance, 10, 500) ||
        !(settings.track === 'all' || song.notes.some(n => n.track === settings.track))) throw new Error('Invalid practice settings.');
    return settings;
  }

  function sectionNotes(song, settings) {
    const endBar = Math.min(song.nBars, settings.startBar + settings.measures - 1);
    const notes = [];
    song.notes.forEach((n, id) => {
      if (n.bar >= settings.startBar && n.bar <= endBar && (settings.track === 'all' || n.track === settings.track))
        notes.push({...n, id});
    });
    const origin = notes[0]?.on || 0;
    return notes.map(n => ({...n, on: n.on - origin, off: n.off - origin}));
  }

  /* The section is explicit and timing follows the MIDI. No passage search or tempo fitting.
     Pitch only identifies a key's timing sample; unidentified notes are unassessed.
     Repeated keys use disjoint windows to avoid shifting later notes after an omission. */
  function analyze(song, settings, performed) {
    const reference = sectionNotes(song, settings);
    if (!reference.length) throw new Error('There are no notes in this section and part.');
    if (!performed.length) throw new Error('No notes recorded.');
    const byPitch = new Map();
    for (const n of reference) { if (!byPitch.has(n.pitch)) byPitch.set(n.pitch, []); byPitch.get(n.pitch).push(n); }
    const first = performed[0], opening = reference.filter(n => n.on < 0.001);
    if (!opening.some(n => n.pitch === first.pitch)) throw new Error('Start with the first note or chord of the selected section.');
    const anchor = first.on, used = new Set(), observations = [], playedByPitch = new Map(), indices = new Map();
    performed.forEach((n, id) => {
      if (!playedByPitch.has(n.pitch)) playedByPitch.set(n.pitch, []);
      playedByPitch.get(n.pitch).push({n, id, time: n.on - anchor});
    });
    for (const notes of playedByPitch.values()) notes.sort((a, b) => a.time - b.time);
    // First attack strictly after the left boundary. The next attack alone tells
    // us whether the window is ambiguous; no full scan per reference note.
    const afterTime = (notes, time) => {
      let low = 0, high = notes.length;
      while (low < high) { const mid = (low + high) >>> 1; if (notes[mid].time <= time) low = mid + 1; else high = mid; }
      return low;
    };
    for (const r of reference) {
      const siblings = byPitch.get(r.pitch), index = indices.get(r.pitch) || 0, before = siblings[index - 1], after = siblings[index + 1];
      indices.set(r.pitch, index + 1);
      // Duplicate unison parts cannot be assigned separate key lengths from a single MIDI input.
      if ((before && Math.abs(before.on - r.on) < .001) || (after && Math.abs(after.on - r.on) < .001)) continue;
      const left = Math.max(r.on - .75, before ? (before.on + r.on) / 2 : -Infinity);
      const right = Math.min(r.on + .75, after ? (after.on + r.on) / 2 : Infinity);
      const candidates = playedByPitch.get(r.pitch) || [], candidateIndex = afterTime(candidates, left);
      const q = candidates[candidateIndex];
      // Multiple attacks in one window are ambiguous: do not invent a duration measurement.
      if (!q || q.time >= right || used.has(q.id) || candidates[candidateIndex + 1]?.time < right) continue;
      used.add(q.id);
      const actualLength = q.n.off === null ? null : (q.n.off - q.n.on) * 1000;
      const expectedLength = (r.off - r.on) * 1000;
      observations.push({id: r.id, bar: r.bar, beat: r.beat, pitch: r.pitch,
        attackMs: q.id === 0 ? null : (q.time - r.on) * 1000,
        lengthMs: actualLength === null ? null : actualLength - expectedLength,
        expectedLength, actualLength, expectedOn: r.on, actualOn: q.time});
    }
    if (!observations.length) throw new Error('No timing samples could be assessed. Check the section and part, and follow the MIDI tempo.');
    const timed = observations.filter(o => o.attackMs !== null);
    const lengths = observations.filter(o => o.lengthMs !== null);
    const span = observations[observations.length - 1].expectedOn - observations[0].expectedOn;
    const driftMs = observations.length >= 2 && span > 0 ?
      ((observations[observations.length - 1].actualOn - observations[0].actualOn) - span) * 1000 : null;
    return {observations, expectedCount: reference.length, unassessed: reference.length - observations.length,
      unusedPlayed: performed.length - used.size, unfinished: observations.length - lengths.length,
      medianAttackMs: median(timed.map(o => Math.abs(o.attackMs))),
      medianLengthMs: median(lengths.map(o => Math.abs(o.lengthMs))), driftMs};
  }

  function aggregate(takes) {
    const samples = new Map();
    for (const take of takes) for (const o of take.analysis.observations) {
      for (const [metric, value, tolerance] of [['length', o.lengthMs, take.settings.lengthTolerance], ['attack', o.attackMs, take.settings.attackTolerance]]) {
        if (value === null) continue;
        const key = o.id + ':' + metric;
        const sample = samples.get(key) || {...o, metric, attempts: 0, issues: 0, values: []};
        sample.attempts++; sample.values.push(value);
        if (Math.abs(value) > tolerance + 1e-6) sample.issues++;
        samples.set(key, sample);
      }
    }
    return [...samples.values()];
  }

  function readSession(text) {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object') throw new Error('Invalid session data.');
    if (data.version !== 2) throw new Error('This session uses the earlier pitch tracker format. Keep that file and load its original MIDI to start timing practice.');
    validateSong(data.song); validateSettings(data.settings, data.song);
    if (!Array.isArray(data.takes) || data.takes.length > limits.takes) throw new Error('Invalid session takes.');
    if (data.takes.reduce((sum, t) => sum + (Array.isArray(t?.notes) ? t.notes.length : 0), 0) > limits.notesPerSession)
      throw new Error('Session exceeds the recorded-note limit.');
    const takes = data.takes.map(t => {
      if (!t || typeof t.at !== 'string' || t.at.length > 100 || !Number.isFinite(Date.parse(t.at)) || !Array.isArray(t.notes) || !t.notes.length || t.notes.length > limits.notesPerTake) {
        throw new Error('Invalid recorded take.');
      }
      validateSettings(t.settings, data.song);
      let previous = -1;
      for (const n of t.notes) {
        if (!n || !integer(n.pitch, 0, 127) || !integer(n.channel, 0, 15) || n.channel === 9 || !finite(n.on, 0, 86400) ||
            !(n.off === null || finite(n.off, n.on, 86400)) || n.on < previous) throw new Error('Invalid recorded note.');
        previous = n.on;
      }
      // Recompute derived feedback: never trust HTML or historical conclusions in an import.
      return {at: new Date(t.at).toISOString(), settings: cleanSettings(t.settings), notes: t.notes.map(cleanNote), analysis: analyze(data.song, t.settings, t.notes)};
    });
    return {song: cleanSong(data.song), settings: cleanSettings(data.settings), takes};
  }

  const cleanSettings = ({startBar, measures, track, lengthTolerance, attackTolerance}) =>
    ({startBar, measures, track, lengthTolerance, attackTolerance});
  const cleanNote = ({pitch, channel, on, off}) => ({pitch, channel, on, off});
  const cleanSong = ({name, nBars, notes}) => ({name, nBars, notes: notes.map(({bar, beat, track, ...n}) =>
    ({...cleanNote(n), bar, beat, track}))});

  return {parseMidi, validateSong, validateSettings, sectionNotes, analyze, aggregate, readSession, pitchName, median, limits};
})();
