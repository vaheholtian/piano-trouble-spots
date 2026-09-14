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
      for (const s of open) {
        await Storage.updateSession(C.db, s.id, {
          endedAt: new Date().toISOString(),
          endedPerf: null,
          endReason: 'reopen',
        });
      }

      const sessionList = $('sessionList');
      sessionList.replaceChildren();
      let sessions = [];
      if (lastPieceId) {
        sessions = await Storage.listSessionsForPiece(C.db, lastPieceId);
        sessions = sessions.slice().sort((a, b) => a.id - b.id);
      }

      const summaries = [];
      for (const s of sessions) {
        const eventCount = await Storage.countRawEvents(C.db, s.id);
        summaries.push({ id: s.id, endReason: s.endReason, eventCount });
        const li = document.createElement('li');
        li.textContent = 'Session ' + s.id + ' (' + s.endReason + '): ' + eventCount + ' events';
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

  function onMidiEvent(record) {
    if (record.type === 'noteon') {
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
        marker: false,
        source: 'midi',
      };
      C.events.push(stored);
      const p = Storage.appendRawEvent(C.db, stored);
      C.pending.add(p);
      p.then((id) => {
        stored.id = id;
      }).catch((error) => {
        toast(error instanceof Error ? error.message : String(error));
      }).finally(() => {
        C.pending.delete(p);
      });

      if (record.type === 'noteon' && !stored.marker && C.metronome && C.pair) {
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

    const session = {
      pieceId: C.pieceId,
      startedAt: new Date().toISOString(),
      startedPerf: performance.now(),
      endedAt: null,
      endedPerf: null,
      endReason: null,
      bpmAtStart: bpm,
      markerKeys: null,
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
    C.metronome = Metronome.create(C.audio, { timeSignatureFor, onClick });
    C.metronome.start(bpm);
    C.resampleTimer = setInterval(resample, 30000);
    renderReadout();
    await Storage.putSetting(C.db, 'bpm:' + C.pieceId, bpm);
    $('startStop').textContent = 'Stop';
    $('sessionState').textContent = 'Recording session ' + id + ' at ' + bpm + ' BPM';
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
    await resample();
    await flush();
    await Storage.updateSession(C.db, id, {
      endedAt: new Date().toISOString(),
      endedPerf: performance.now(),
      endReason,
      clockPairs: C.session.clockPairs,
      latency: C.session.latency,
      calibration: C.session.calibration,
    });
    C.session = null;
    $('startStop').textContent = 'Start';
    $('sessionState').textContent = 'Stopped - session ' + id + ': ' + eventCount + ' events';
  }

  function stop() {
    return endSession('stop');
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
      $('sessionState').textContent = 'Recording session ' + C.session.id + ' at ' + bpm + ' BPM';
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

  init();

  return { state: C, init, start, stop, flush };
})();
