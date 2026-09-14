/* Capture transport: MIDI input selector, connection-state words, live note-on indicator, Start/
   Stop session control, and restore-on-reopen (piece + previous sessions). Classic script,
   loads after src/score-renderer.js, src/midi-capture.js and src/storage.js so it can call
   ScoreRenderer.loadPiece, MidiCapture.*, and Storage.* directly. Declares no top-level
   const/let/var/function outside this IIFE -- score-renderer.js already owns S, $, toast, and
   setStatus at the top level, and this file reuses those directly rather than redeclaring them.
*/
'use strict';
globalThis.CaptureApp = (() => {
  const C = {
    db: null,
    dbReady: null,
    ready: false,
    access: null,
    input: null,
    pieceId: null,
    fileName: '',
    session: null,
    seq: 0,
    passOrdinal: 1,
    liveCount: 0,
    events: [],
    pending: new Set(),
    // seq -> in-flight Storage.appendRawEvent promise (resolves to the record's id) -- lets
    // onMidiEvent tag an earlier note-on's marker flag in storage even if its own write hasn't
    // resolved yet by the time the pairing key completes the marker (D-01).
    pendingWrites: new Map(),
    // pass object -> its in-flight Storage.putPass (create) promise -- lets a pass be closed
    // (an update write) even when a mark lands before its own creation write has resolved an
    // id, without ever risking a second autoIncrement row for the same pass.
    passWrites: new WeakMap(),
    restored: null,
    audio: null,
    audioState: '',
    metronome: null,
    pair: null,
    clicks: [],
    bpm: 100,
    offsets: [],
    offsetCount: 0,
    resampleTimer: null,
    detector: null,
    markerKeys: null,
    markerNotesDown: new Set(),
    currentPass: null,
    passes: [],
  };

  function setMidiState(text) {
    $('midiState').textContent = text;
  }

  async function restore() {
    try {
      const params = new URLSearchParams(location.search);
      const isFixture = params.has('fixture');
      const lastPieceId = await Storage.getSetting(C.db, 'lastPieceId');

      if (!isFixture && lastPieceId) {
        const piece = await Storage.getPiece(C.db, lastPieceId);
        if (piece) {
          await ScoreRenderer.loadPiece(new File([piece.bytes], piece.fileName));
        }
      }

      const open = await Storage.listOpenSessions(C.db);
      // D-15: every session left open when the tab closed is finalized as "reopen" -- its
      // passes are re-derived from the raw stream (never merged with a new session) and the
      // trailing pass record in storage is closed with the last event actually recorded.
      const reopenedPasses = new Map(); // sessionId -> PassSegmenter.segment() result
      for (const s of open) {
        await Storage.updateSession(C.db, s.id, {
          endedAt: new Date().toISOString(),
          endedPerf: null,
          endReason: 'reopen',
        });

        const events = await Storage.readRawEvents(C.db, s.id);
        const passes = PassSegmenter.segment(events, {
          sessionStartTimeStamp: s.startedPerf,
          sessionEndTimeStamp: null,
          includeEmptyTrailing: false,
        });
        reopenedPasses.set(s.id, passes);

        const storedPasses = await Storage.readPasses(C.db, s.id);
        const unfinished = storedPasses.find((p) => p.endSeq === null);
        if (unfinished) {
          const lastEvent = events[events.length - 1];
          unfinished.endSeq = lastEvent ? lastEvent.seq : unfinished.startSeq - 1;
          unfinished.endTimeStamp = lastEvent ? lastEvent.timeStamp : null;
          await Storage.putPass(C.db, unfinished);
        }
      }

      const sessionList = $('sessionList');
      sessionList.replaceChildren();
      const passList = $('passList');
      let sessions = [];
      if (lastPieceId) {
        sessions = await Storage.listSessionsForPiece(C.db, lastPieceId);
        sessions = sessions.slice().sort((a, b) => a.id - b.id);
      }

      const summaries = [];
      for (const s of sessions) {
        const eventCount = await Storage.countRawEvents(C.db, s.id);
        const summary = { id: s.id, endReason: s.endReason, eventCount };
        const li = document.createElement('li');
        if (reopenedPasses.has(s.id)) {
          // D-16: passes are numbered repetitions with a note count each, nothing per-note.
          const passes = reopenedPasses.get(s.id);
          summary.passes = passes.map((p) => ({ ordinal: p.ordinal, noteCount: p.noteCount }));
          li.textContent = 'Session ' + s.id + ' (reopen): ' + passes.length + ' passes, ' + eventCount + ' events';
          passList.replaceChildren();
          passes.forEach((pass) => {
            const item = document.createElement('li');
            item.textContent = 'Pass ' + pass.ordinal + ' - ' + pass.noteCount + ' notes';
            passList.appendChild(item);
          });
        } else {
          li.textContent = 'Session ' + s.id + ' (' + s.endReason + '): ' + eventCount + ' events';
        }
        summaries.push(summary);
        sessionList.appendChild(li);
      }

      C.restored = { pieceId: lastPieceId || null, sessions: summaries };
      if (!isFixture) C.pieceId = lastPieceId || null;
      if (C.pieceId) {
        const storedBpm = await Storage.getSetting(C.db, 'bpm:' + C.pieceId);
        C.bpm = Metronome.isValidBpm(storedBpm) ? storedBpm : 100;
        $('bpm').value = String(C.bpm);
      }
      $('status').dataset.restore = lastPieceId ? 'done' : 'none';
    } catch (error) {
      $('status').dataset.restore = 'error';
      toast(error instanceof Error ? error.message : String(error));
    }
  }

  function attachInput(inputId) {
    if (C.input) MidiCapture.detach(C.input);
    const rawInput = [...C.access.inputs.values()].find((i) => i.id === inputId);
    C.input = rawInput || null;
    if (C.input) {
      MidiCapture.attach(C.input, onMidiEvent);
      setMidiState('Connected: ' + C.input.name);
    }
  }

  async function refreshInputs() {
    const inputs = MidiCapture.listInputs(C.access);
    const select = $('midiInput');
    select.replaceChildren();
    for (const input of inputs) {
      const option = document.createElement('option');
      option.value = input.id;
      option.textContent = input.name;
      select.appendChild(option);
    }

    if (inputs.length === 0) {
      setMidiState('No MIDI inputs found - is the piano on and connected over USB? Close other MIDI apps.');
      if (C.input) MidiCapture.detach(C.input);
      C.input = null;
      return;
    }

    const lastMidiInputId = await Storage.getSetting(C.db, 'lastMidiInputId');
    const chosen = inputs.find((i) => i.id === lastMidiInputId) || inputs[0];
    select.value = chosen.id;
    attachInput(chosen.id);
  }

  function onMidiStateChange(event) {
    const port = event && event.port;
    if (port && C.input && port.id === C.input.id && port.state === 'disconnected') {
      setMidiState('Disconnected: ' + port.name);
    }
  }

  async function connectMidi() {
    try {
      C.access = await MidiCapture.connect({ onStateChange: onMidiStateChange });
      await refreshInputs();
    } catch (error) {
      if (error.message === 'no-web-midi') {
        setMidiState('Web MIDI is not available in this browser');
      } else if (error.message === 'permission-denied') {
        setMidiState('MIDI permission denied - allow MIDI for this page in Chrome site settings and reload');
      } else {
        setMidiState(error.message);
      }
    }
  }

  function readBpm() {
    const value = Number.parseInt($('bpm').value, 10);
    return Metronome.isValidBpm(value) ? value : null;
  }

  function timeSignatureFor(bar) {
    const measures = ScoreRenderer.state.model.measures;
    return measures[(bar - 1) % measures.length].timeSignature;
  }

  function onClick(click) {
    const record = { sessionId: C.session.id, ...click, pageTime: Clock.toPageTime(click.audioTime, C.pair) };
    C.clicks.push(record);
    const p = Storage.appendClick(C.db, record);
    C.pending.add(p);
    p.then((id) => {
      record.id = id;
    }).catch((error) => {
      toast(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      C.pending.delete(p);
    });
  }

  // D-10: a diagnostic number and a running median only -- no per-note judgement of any kind.
  function renderReadout() {
    const last = C.offsets[C.offsets.length - 1];
    if (last === undefined) {
      $('offsetLast').textContent = '-';
    } else {
      const rounded = Math.round(last);
      $('offsetLast').textContent = (rounded >= 0 ? '+' : '') + rounded + ' ms';
    }
    const median = Clock.median(C.offsets);
    $('offsetMedian').textContent = median === null ? '-' : Math.round(median) + ' ms';
    $('offsetCount').textContent = String(C.offsetCount);
    $('latencyBase').textContent = C.audio ? (C.audio.baseLatency * 1000).toFixed(1) + ' ms' : '-';
    $('latencyOutput').textContent = C.audio ? (C.audio.outputLatency * 1000).toFixed(1) + ' ms' : '-';
  }

  // D-11: stores the calibration alongside a fresh clock pair; never applied to any stored
  // timestamp. Called every 30s during a session and once more, as the final sample, at Stop.
  async function resample() {
    if (!C.session || !C.audio) return;
    const pair = { ...Clock.samplePair(performance.now(), C.audio.currentTime), sampledAt: new Date().toISOString() };
    C.pair = pair;
    C.session.clockPairs.push(pair);
    C.session.calibration = { medianOffsetMs: Clock.median(C.offsets), noteCount: C.offsetCount };
    const p = Storage.updateSession(C.db, C.session.id, {
      clockPairs: C.session.clockPairs,
      calibration: C.session.calibration,
      latency: C.session.latency,
    });
    C.pending.add(p);
    try {
      await p;
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    } finally {
      C.pending.delete(p);
    }
  }

  // D-03/D-08: opens the next pass with the BPM in effect right now, writes the pass record
  // (fire-and-tracked like every other write, so the very next MIDI event sees the updated
  // C.currentPass immediately rather than waiting on the IndexedDB round trip).
  function openPass(ordinal, startSeq, startTimeStamp, bpm) {
    const pass = { sessionId: C.session.id, ordinal, startSeq, startTimeStamp, endSeq: null, endTimeStamp: null, bpm };
    C.currentPass = pass;
    C.passes.push(pass);
    const p = Storage.putPass(C.db, pass).then((id) => {
      pass.id = id;
    });
    C.passWrites.set(pass, p);
    C.pending.add(p);
    p.catch((error) => {
      toast(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      C.pending.delete(p);
    });
    return pass;
  }

  // A mark (or Stop) can close a pass before its own creation write above has resolved an id
  // -- calling db.put() on a keyPath-autoIncrement record with no id yet would silently insert
  // a second row instead of updating the first. Wait for the creation write (if still in
  // flight) so the id is always set before the update write goes out.
  function persistPassUpdate(pass) {
    const created = pass.id !== undefined ? Promise.resolve() : C.passWrites.get(pass) || Promise.resolve();
    const p = created.then(() => Storage.putPass(C.db, pass));
    C.pending.add(p);
    p.catch((error) => {
      toast(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      C.pending.delete(p);
    });
    return p;
  }

  // D-04: the session panel lists passes as "Pass N - K notes", computed fresh from the raw
  // event stream every time so it always matches what a reload will restore.
  function renderPassList() {
    const passes = PassSegmenter.segment(C.events, {
      sessionStartTimeStamp: C.session.startedPerf,
      includeEmptyTrailing: true,
    });
    const passList = $('passList');
    passList.replaceChildren();
    passes.forEach((pass, i) => {
      const li = document.createElement('li');
      const suffix = i === passes.length - 1 ? ' (in progress)' : '';
      li.textContent = 'Pass ' + pass.ordinal + ' - ' + pass.noteCount + ' notes' + suffix;
      passList.appendChild(li);
    });
    $('sessionState').textContent = 'Recording session ' + C.session.id + ' at ' + C.bpm + ' BPM - pass ' + C.passOrdinal;
  }

  // D-03: one mark ends the current pass and opens the next. The marker record itself is
  // stored raw like any other event, tagged marker: true, and never snapped to a click (D-07).
  function mark(source, timeStamp) {
    const seq = C.seq++;
    const rec = {
      sessionId: C.session.id,
      seq,
      passOrdinal: C.passOrdinal,
      timeStamp,
      type: 'marker',
      source,
      raw: [],
      marker: true,
    };
    C.events.push(rec);
    const p = Storage.appendRawEvent(C.db, rec);
    C.pending.add(p);
    p.then((id) => {
      rec.id = id;
    }).catch((error) => {
      toast(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      C.pending.delete(p);
    });

    const closingPass = C.currentPass;
    closingPass.endSeq = seq;
    closingPass.endTimeStamp = timeStamp;
    persistPassUpdate(closingPass);

    C.passOrdinal += 1;
    openPass(C.passOrdinal, seq + 1, timeStamp, C.bpm);
    C.liveCount = 0;
    renderPassList();
  }

  function onMidiEvent(record) {
    let isMarker = false;

    // The marker keys' own note-off is tagged the same way its note-on was (D-04).
    if (record.type === 'noteoff' && C.markerNotesDown.has(record.note)) {
      isMarker = true;
      C.markerNotesDown.delete(record.note);
    }

    const hit = C.session && C.detector ? C.detector.feed({ ...record, seq: C.seq }) : null;

    if (hit) {
      isMarker = true;
      hit.notes.forEach((n) => C.markerNotesDown.add(n));
      // Retag the earlier note-on of the pair, in memory and in storage, once its write
      // resolves (it may still be in flight if the pair landed within the marker window).
      const earlierSeq = hit.seqs[0];
      const earlier = C.events.find((e) => e.seq === earlierSeq);
      if (earlier) {
        earlier.marker = true;
        const idPromise = earlier.id !== undefined ? Promise.resolve(earlier.id) : C.pendingWrites.get(earlierSeq);
        if (idPromise) {
          const pu = idPromise.then((id) => Storage.updateRawEvent(C.db, id, { marker: true }));
          C.pending.add(pu);
          pu.catch((error) => {
            toast(error instanceof Error ? error.message : String(error));
          }).finally(() => {
            C.pending.delete(pu);
          });
        }
      }
    }

    // D-19: a marker-tagged note-on does not count toward the live indicator (D-04's note count
    // is the pass's played notes only) and does not feed the clock readout below.
    if (record.type === 'noteon' && !isMarker) {
      C.liveCount += 1;
      $('liveCount').textContent = String(C.liveCount);
      $('lastNote').textContent = MidiCapture.noteName(record.note) + ' ' + record.velocity;
      const flash = $('flash');
      flash.classList.add('on');
      setTimeout(() => flash.classList.remove('on'), 120);
    }

    if (C.session) {
      const stored = {
        ...record,
        sessionId: C.session.id,
        seq: C.seq++,
        passOrdinal: C.passOrdinal,
        marker: isMarker,
        source: 'midi',
      };
      C.events.push(stored);
      const p = Storage.appendRawEvent(C.db, stored);
      C.pending.add(p);
      C.pendingWrites.set(stored.seq, p);
      p.then((id) => {
        stored.id = id;
      }).catch((error) => {
        toast(error instanceof Error ? error.message : String(error));
      }).finally(() => {
        C.pending.delete(p);
        C.pendingWrites.delete(stored.seq);
      });

      if (record.type === 'noteon' && !isMarker && C.metronome && C.pair) {
        const candidates = C.clicks.map((c) => c.audioTime).concat([C.metronome.nextClickTime()]);
        const t = Clock.toAudioContextTime(record.timeStamp, C.pair);
        const nearest = Clock.nearestClick(t, candidates);
        if (nearest) {
          C.offsets.push(nearest.offsetMs);
          if (C.offsets.length > 20) C.offsets.shift();
          C.offsetCount += 1;
          renderReadout();
        }
      }

      // D-16: the pass list stays live as the trailing pass grows; a mark re-renders it too
      // (via mark() itself), so this only needs to fire on the non-mark path.
      if (hit) {
        mark('pair', hit.timeStamp);
      } else {
        renderPassList();
      }
    }
  }

  async function start() {
    if (C.pieceId === null) {
      toast('Open a piece first');
      return null;
    }
    if (C.session) return null;
    const bpm = readBpm();
    if (bpm === null) {
      toast('Set a BPM between 20 and 300');
      return null;
    }

    // Pitfall P2-3: AudioContext (or its resume()) must be created/called synchronously inside
    // this click handler's own task, before any await, or some browsers never honor the
    // gesture and the click stays silently suspended forever.
    if (!C.audio) {
      C.audio = new AudioContext();
      C.audio.onstatechange = () => {
        C.audioState = C.audio.state;
      };
    }
    const resumed = C.audio.resume();
    await resumed;
    C.pair = { ...Clock.samplePair(performance.now(), C.audio.currentTime), sampledAt: new Date().toISOString() };
    C.audioState = C.audio.state;

    // D-01: the marker key pair is a stored setting, read once at Start and copied onto the
    // session record so a later change to the setting never changes an already-recorded pass.
    C.markerKeys = (await Storage.getSetting(C.db, 'markerKeys')) || PassMarker.DEFAULT_KEYS;

    const session = {
      pieceId: C.pieceId,
      startedAt: new Date().toISOString(),
      startedPerf: performance.now(),
      endedAt: null,
      endedPerf: null,
      endReason: null,
      bpmAtStart: bpm,
      markerKeys: C.markerKeys,
      clockPairs: [C.pair],
      latency: { base: C.audio.baseLatency, output: C.audio.outputLatency },
      calibration: null,
    };
    const id = await Storage.createSession(C.db, session);
    C.session = { id, ...session };
    C.seq = 0;
    C.passOrdinal = 1;
    C.liveCount = 0;
    C.events = [];
    C.clicks = [];
    C.bpm = bpm;
    C.offsets = [];
    C.offsetCount = 0;
    C.detector = PassMarker.createDetector({ keys: C.markerKeys });
    C.markerNotesDown = new Set();
    C.pendingWrites = new Map();
    C.passWrites = new WeakMap();
    C.passes = [];
    C.currentPass = null;
    openPass(1, 0, C.session.startedPerf, bpm);
    C.metronome = Metronome.create(C.audio, { timeSignatureFor, onClick });
    C.metronome.start(bpm);
    C.resampleTimer = setInterval(resample, 30000);
    renderReadout();
    renderPassList();
    await Storage.putSetting(C.db, 'bpm:' + C.pieceId, bpm);
    $('startStop').textContent = 'Stop';
    $('startStop').blur();
    return id;
  }

  async function flush() {
    await Promise.allSettled([...C.pending]);
  }

  async function endSession(endReason) {
    if (!C.session) return;
    const id = C.session.id;
    const eventCount = C.events.length;
    if (C.metronome) {
      C.metronome.stop();
      C.metronome = null;
    }
    if (C.resampleTimer !== null) {
      clearInterval(C.resampleTimer);
      C.resampleTimer = null;
    }

    // D-03: the pass in progress at Stop is closed as-is (kept if it holds a non-marker note --
    // renderPassList()/PassSegmenter.segment already applies that keep rule for display below).
    const endedPerf = performance.now();
    if (C.currentPass) {
      C.currentPass.endSeq = C.seq - 1;
      C.currentPass.endTimeStamp = endedPerf;
      persistPassUpdate(C.currentPass);
    }

    await resample();
    await flush();
    await Storage.updateSession(C.db, id, {
      endedAt: new Date().toISOString(),
      endedPerf,
      endReason,
      clockPairs: C.session.clockPairs,
      latency: C.session.latency,
      calibration: C.session.calibration,
    });

    const finalPasses = PassSegmenter.segment(C.events, {
      sessionStartTimeStamp: C.session.startedPerf,
      sessionEndTimeStamp: endedPerf,
      includeEmptyTrailing: false,
    });
    const passList = $('passList');
    passList.replaceChildren();
    finalPasses.forEach((pass) => {
      const li = document.createElement('li');
      li.textContent = 'Pass ' + pass.ordinal + ' - ' + pass.noteCount + ' notes';
      passList.appendChild(li);
    });

    C.session = null;
    C.currentPass = null;
    $('startStop').textContent = 'Start';
    $('sessionState').textContent = 'Stopped - session ' + id + ': ' + eventCount + ' events';
  }

  function stop() {
    $('startStop').blur();
    return endSession('stop');
  }

  // D-01: the spacebar does the same as the B7+C8 pair, from the laptop. The keydown's own
  // DOMHighResTimeStamp shares performance.now()'s origin -- Claude's Discretion: the keydown
  // time is the boundary; the MIDI stream has no corresponding note, so nothing else is tagged.
  function onKeyDown(ev) {
    if (ev.code !== 'Space') return;
    const tag = ev.target && ev.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    ev.preventDefault();
    if (C.session) mark('spacebar', ev.timeStamp);
  }

  async function init() {
    C.dbReady = Storage.open();
    try {
      C.db = await C.dbReady;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast('Storage failed: ' + message);
      setMidiState('Storage failed: ' + message);
      C.ready = true;
      $('status').dataset.capture = 'ready';
      return;
    }
    await restore();
    await connectMidi();
    C.ready = true;
    $('status').dataset.capture = 'ready';
  }

  document.addEventListener('piece-loaded', async (ev) => {
    await C.dbReady;
    try {
      const bytes = await ev.detail.file.arrayBuffer();
      const id = await Storage.hashBytes(bytes);
      if (C.session && id !== C.pieceId) {
        await endSession('piece-change');
      }
      await Storage.putPiece(C.db, {
        id,
        fileName: ev.detail.file.name,
        bytes,
        model: ev.detail.model,
        storedAt: new Date().toISOString(),
      });
      await Storage.putSetting(C.db, 'lastPieceId', id);
      C.pieceId = id;
      C.fileName = ev.detail.file.name;
      const storedBpm = await Storage.getSetting(C.db, 'bpm:' + id);
      C.bpm = Metronome.isValidBpm(storedBpm) ? storedBpm : 100;
      $('bpm').value = String(C.bpm);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    }
  });

  document.addEventListener('piece-unloaded', () => {
    C.pieceId = null;
  });

  $('midiInput').addEventListener('change', async (ev) => {
    const inputId = ev.target.value;
    attachInput(inputId);
    await Storage.putSetting(C.db, 'lastMidiInputId', inputId);
  });

  $('bpm').addEventListener('change', async () => {
    const bpm = readBpm();
    if (bpm === null) return;
    C.bpm = bpm;
    if (C.session && C.metronome) {
      // D-08/D-14: a tempo change neither ends nor restarts the session's click.
      C.metronome.setBpm(bpm);
      renderPassList();
    }
    if (C.pieceId) {
      await Storage.putSetting(C.db, 'bpm:' + C.pieceId, bpm);
    }
  });

  $('startStop').addEventListener('click', () => {
    if (C.session) {
      stop();
    } else {
      start();
    }
  });

  window.addEventListener('pagehide', () => {
    flush();
  });

  window.addEventListener('keydown', onKeyDown);

  init();

  return { state: C, init, start, stop, flush, mark };
})();
