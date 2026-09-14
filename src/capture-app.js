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
    // The model a live session is analysed against, captured once at Start (review 03-02 HIGH
    // round 3): a click callback (timeSignatureFor) must never read the model currently on
    // screen, which a failed load can set to null mid-session.
    sessionModel: null,
  };

  // Analysis state (Phase 3): the alignment/aggregate/paint pipeline's own state, kept
  // separate from C so a restored (non-live) session can be analysed and painted without a
  // live capture session existing. A.session is { id, pieceId, model, live, passes, clicks,
  // bpmAtStart }; passes is null while live (completedPasses() derives it from C.events).
  const A = {
    session: null,
    results: [],
    resultCache: new Map(),
    aggregate: null,
    view: { kind: 'session', bpm: null, ordinal: null },
    pendingOrdinals: [],
    detail: null,
    loadGen: 0,
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
      if (C.pieceId && ScoreRenderer.state.model) await loadLatestSession(C.pieceId, ScoreRenderer.state.model);
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
    const measures = C.sessionModel.measures;
    return measures[(bar - 1) % measures.length].timeSignature;
  }

  // ---- Analysis pipeline (Phase 3: align -> aggregate -> paint) -----------------------------

  // Live: the trailing (still-open) pass is never analysed until it closes with a mark.
  // Restored: A.session.passes was already segmented once by loadLatestSession/endSession.
  function completedPasses() {
    if (A.session && A.session.live) {
      return PassSegmenter.segment(C.events, { sessionStartTimeStamp: C.session.startedPerf, includeEmptyTrailing: true }).slice(0, -1);
    }
    return A.session ? A.session.passes : [];
  }

  // review 03-02 HIGH: a pass is judged only once the click timeline covers it
  // (Align.isFinal, section 5) -- the live result then equals a reload's. Final results are
  // reused from A.resultCache instead of re-aligned on every click (review 03-03 MEDIUM
  // round 2): a final pass's stableFields never change, so caching is safe.
  function analyzeCurrent() {
    if (!A.session) return;
    const sessionEnded = !A.session.live;
    const passes = completedPasses();
    const finalPasses = [];
    const pendingOrdinals = [];
    for (const pass of passes) {
      if (Align.isFinal(pass, A.session.clicks, sessionEnded)) finalPasses.push(pass);
      else pendingOrdinals.push(pass.ordinal);
    }
    A.pendingOrdinals = pendingOrdinals;
    A.results = finalPasses.map((pass) => {
      if (A.resultCache.has(pass.ordinal)) return A.resultCache.get(pass.ordinal);
      const result = Align.alignPass(A.session.model, pass, A.session.clicks);
      A.resultCache.set(pass.ordinal, result);
      return result;
    });
    A.aggregate = Aggregate.foldSession(A.session.model, A.results);
    if (A.view.bpm === null || A.view.bpm === undefined) {
      const firstGroup = A.aggregate.tempoGroups[0];
      A.view.bpm = firstGroup ? firstGroup.bpm : A.session.bpmAtStart;
    }
    renderAnalysis();
  }

  function currentPassResult() {
    return A.results.find((r) => r.passOrdinal === A.view.ordinal) || null;
  }

  function currentGroup() {
    return A.aggregate ? A.aggregate.tempoGroups.find((g) => g.bpm === A.view.bpm) || null : null;
  }

  function currentView() {
    if (A.view.kind === 'pass') {
      const result = currentPassResult();
      return result ? Aggregate.viewForPass(A.session.model, result) : { kind: 'pass', label: null, bpm: null, noteKinds: {}, glyphs: {} };
    }
    return Aggregate.viewForTempoGroup(A.session.model, A.aggregate, A.view.bpm);
  }

  function renderAnalysis() {
    const svgMap = ScoreRenderer.state.svgMap;
    // review 03-02 HIGH: a session is painted only on the score it was recorded against -- a
    // model mismatch (a piece switch's piece-rendered event firing before the session catches
    // up) is treated exactly like no session, so the old session's marks never show on a new
    // piece's notation. No DOM write happens here on purpose: the mismatch/no-session case is
    // reached only right after a fresh render (svgMap is either null, per loadPiece's own
    // teardown, or brand-new elements that VexFlow already drew with no annotation) or with an
    // unchanged, already-reset map -- there is never stale colour on the currently rendered
    // piece to clear, and a piece switch's own repaint must not touch the new piece's noteheads
    // before its own session (if any) is known.
    const modelMismatch = A.session && ScoreRenderer.state.model && A.session.model !== ScoreRenderer.state.model;
    if (!A.session || !ScoreRenderer.state.model || !svgMap || modelMismatch) {
      $('analysisHeading').textContent = 'No session';
      $('tempoGroup').hidden = true;
      refreshDetail();
      return;
    }

    const view = currentView();
    Paint.resetAll(svgMap);
    Paint.paintNotes(svgMap, view.noteKinds);
    Paint.clearExtras($('markOverlay'));
    Paint.paintExtras($('markOverlay'), svgMap, A.session.model, view.glyphs, onGlyphClick);

    $('analysisHeading').textContent = Aggregate.headingFor(A.aggregate, { kind: 'session', bpm: A.view.bpm }, { pendingOrdinals: A.pendingOrdinals });

    const tempoSelect = $('tempoGroup');
    const groups = A.aggregate.tempoGroups;
    if (groups.length > 1) {
      tempoSelect.replaceChildren();
      for (const group of groups) {
        const option = document.createElement('option');
        option.value = String(group.bpm);
        option.textContent = group.bpm + ' BPM (' + group.attempts + ' passes)';
        tempoSelect.appendChild(option);
      }
      tempoSelect.value = String(A.view.bpm);
      tempoSelect.hidden = false;
    } else {
      tempoSelect.hidden = true;
    }

    refreshDetail();
  }

  function refreshDetail() {
    const detailEl = $('detail');
    const defaultText = 'Click a coloured notehead or a + to see what happened there.';
    if (!A.detail || !A.session) {
      detailEl.textContent = defaultText;
      return;
    }

    if (A.detail.type === 'note') {
      const source =
        A.view.kind === 'pass'
          ? { kind: 'pass', result: currentPassResult() }
          : { kind: 'session', counts: (currentGroup() || {}).notes ? currentGroup().notes[A.detail.noteId] : null };
      detailEl.textContent = Aggregate.describeNote(A.session.model, A.detail.noteId, source, { noteName: MidiCapture.noteName });
      return;
    }

    const view = currentView();
    if (!view.glyphs[A.detail.gapKey]) {
      A.detail = null;
      detailEl.textContent = defaultText;
      return;
    }
    const source =
      A.view.kind === 'pass' ? { kind: 'pass', result: currentPassResult() } : { kind: 'session', gap: currentGroup().gaps[A.detail.gapKey] };
    detailEl.textContent = Aggregate.describeGap(A.session.model, A.detail.gapKey, source, { noteName: MidiCapture.noteName });
  }

  function onGlyphClick(gapKey) {
    A.detail = { type: 'gap', gapKey };
    refreshDetail();
  }

  // review 03-02 HIGH round 3: a live session always owns A. start() and endSession() advance
  // A.loadGen before their own first await, and this function re-checks generation AND
  // liveness after every await, so Start pressed while a restoration is in flight (or a piece
  // switch superseding this call) never lets a stale restoration overwrite the live session.
  async function loadLatestSession(pieceId, model) {
    const gen = ++A.loadGen;
    const sessions = await Storage.listSessionsForPiece(C.db, pieceId);
    if (gen !== A.loadGen || C.session) return;
    if (sessions.length === 0) {
      A.session = null;
      A.detail = null;
      renderAnalysis();
      return;
    }
    const sorted = sessions.slice().sort((a, b) => a.id - b.id);
    const s = sorted[sorted.length - 1];
    const events = await Storage.readRawEvents(C.db, s.id);
    if (gen !== A.loadGen || C.session) return;
    const passes = PassSegmenter.segment(events, { sessionStartTimeStamp: s.startedPerf, sessionEndTimeStamp: s.endedPerf, includeEmptyTrailing: false });
    const clicks = await Storage.readClicks(C.db, s.id);
    if (gen !== A.loadGen || C.session) return;
    const changedSession = !A.session || A.session.id !== s.id;
    A.resultCache = new Map();
    A.session = { id: s.id, pieceId, model, live: false, passes, clicks, bpmAtStart: s.bpmAtStart };
    A.view = { kind: 'session', bpm: null, ordinal: null };
    if (changedSession) A.detail = null;
    analyzeCurrent();
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

    // review 03-02 HIGH: a pending pass is judged on the first click that covers it, not only
    // on the next mark -- the click that finalizes it may arrive well after the mark itself.
    if (A.session && A.session.live && A.pendingOrdinals.length > 0) analyzeCurrent();
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
    analyzeCurrent();
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

    // review 03-02 HIGH round 3: captured once, synchronously, before any await -- the
    // metronome's time-signature callback must never read the model currently on screen,
    // which a failed load can set to null mid-session.
    C.sessionModel = ScoreRenderer.state.model;
    // A live session always owns A (review 03-02 HIGH round 3): advance before the first
    // await so an outstanding loadLatestSession discards its result once it re-checks.
    A.loadGen++;

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
    A.resultCache = new Map();
    A.session = { id, pieceId: C.pieceId, model: C.sessionModel, live: true, passes: null, clicks: C.clicks, bpmAtStart: bpm };
    A.view = { kind: 'session', bpm, ordinal: null };
    A.detail = null;
    analyzeCurrent();
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
    // A live session always owns A (review 03-02 HIGH round 3): advance before the first
    // await so an outstanding loadLatestSession discards its result once it re-checks.
    A.loadGen++;
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

    if (A.session) {
      A.session = { ...A.session, live: false, passes: finalPasses, clicks: C.clicks.slice() };
      analyzeCurrent();
    }

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
    // Advanced before any await (review 03-02 HIGH round 3) -- an in-flight loadLatestSession
    // for a previous piece must never overwrite whatever this load (or a Start pressed in the
    // meantime) settles on.
    const gen = ++A.loadGen;
    await C.dbReady;
    try {
      const bytes = await ev.detail.file.arrayBuffer();
      const id = await Storage.hashBytes(bytes);
      if (gen !== A.loadGen) return;
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
      if (A.session && A.session.pieceId === id) {
        // review 03-02 HIGH round 2: reopening the same file during capture. loadPiece always
        // builds a fresh model object; the same bytes give the same structural note ids
        // (Phase 1 D-09), so rebinding to the new model and re-analysing keeps painting. The
        // remembered detail target is cleared -- a model rebind is still a model change.
        A.session = { ...A.session, model: ev.detail.model };
        A.resultCache = new Map();
        A.detail = null;
        analyzeCurrent();
      } else if (!C.session) {
        await loadLatestSession(id, ev.detail.model);
      }
      C.fileName = ev.detail.file.name;
      const storedBpm = await Storage.getSetting(C.db, 'bpm:' + id);
      C.bpm = Metronome.isValidBpm(storedBpm) ? storedBpm : 100;
      $('bpm').value = String(C.bpm);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    }
  });

  // review 03-02 HIGH round 3: a failed piece load ends capture cleanly. loadPiece's catch
  // clears S.model/svgMap and dispatches this event synchronously; endSession's own synchronous
  // prefix stops the metronome and resample timer before any await, and timeSignatureFor already
  // reads C.sessionModel (never the null model on screen), so no click callback can touch it.
  // The ended session keeps its own model, final passes and clicks (live: false) -- nothing is
  // painted while no score is on screen, and reopening the same piece restores its marks.
  document.addEventListener('piece-unloaded', () => {
    A.loadGen++;
    const ending = C.session ? endSession('piece-unloaded') : null;
    C.pieceId = null;
    (async () => {
      try {
        await ending;
      } catch (error) {
        toast(error instanceof Error ? error.message : String(error));
      }
      renderAnalysis();
    })();
  });

  document.addEventListener('piece-rendered', () => {
    renderAnalysis();
  });

  $('notation').addEventListener('click', (ev) => {
    const svgMap = ScoreRenderer.state.svgMap;
    if (!svgMap) return;
    let el = ev.target;
    const notation = $('notation');
    while (el && el !== notation) {
      if (el.classList && el.classList.contains('vf-notehead')) break;
      el = el.parentElement;
    }
    if (!el || el === notation || !el.classList || !el.classList.contains('vf-notehead')) return;
    let noteId = null;
    for (const [id, mapped] of svgMap) {
      if (mapped === el) {
        noteId = id;
        break;
      }
    }
    if (!noteId) return;
    A.detail = { type: 'note', noteId };
    refreshDetail();
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

  return { state: C, init, start, stop, flush, mark, analysis: A, analyzeCurrent, loadLatestSession };
})();
