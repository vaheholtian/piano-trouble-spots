/* Web Audio look-ahead metronome: the setInterval loop only decides which upcoming clicks to
   schedule on the AudioContext clock -- the click's authoritative time is always the
   AudioContext time it was scheduled at, never the timer's own firing time (D-05, CAPT-03,
   PITFALLS.md pitfall 8). `advance()` is the pure scheduling-math core, node:test-able with no
   AudioContext at all; `create()` is the thin side-effecting wrapper that actually makes sound
   and owns the click-timeline callback (D-06).
*/
'use strict';
globalThis.Metronome = (() => {
  const LOOKAHEAD_MS = 25;
  const SCHEDULE_AHEAD_S = 0.1;
  const FIRST_CLICK_DELAY_S = 0.1;
  const ACCENT_HZ = 1500;
  const CLICK_HZ = 1000;
  const CLICK_S = 0.05;
  const MIN_BPM = 20;
  const MAX_BPM = 300;

  // Pure: cursor { nextClickTime, bar, beat, bpm } -> { clicks, cursor }. Never mutates the
  // input cursor. A click whose time equals or exceeds untilAudioTime is left for a later call
  // (CAPT-03 adjacency edge) -- strict less-than, so a click landing exactly on the horizon is
  // scheduled once, on a later tick, never twice and never dropped.
  function advance(cursor, untilAudioTime, timeSignatureFor) {
    const next = { ...cursor };
    const clicks = [];
    while (next.nextClickTime < untilAudioTime) {
      clicks.push({
        audioTime: next.nextClickTime,
        bar: next.bar,
        beat: next.beat,
        bpm: next.bpm,
        accent: next.beat === 1,
      });
      next.nextClickTime += 60 / next.bpm;
      next.beat += 1;
      if (next.beat > timeSignatureFor(next.bar).beats) {
        next.beat = 1;
        next.bar += 1;
      }
    }
    return { clicks, cursor: next };
  }

  function isValidBpm(value) {
    return Number.isInteger(value) && value >= MIN_BPM && value <= MAX_BPM;
  }

  function create(audioContext, { timeSignatureFor, onClick }) {
    let cursor = null;
    let timer = null;

    function scheduleClick(click) {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.frequency.value = click.accent ? ACCENT_HZ : CLICK_HZ;
      gain.gain.setValueAtTime(0.3, click.audioTime);
      gain.gain.exponentialRampToValueAtTime(0.001, click.audioTime + CLICK_S);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(click.audioTime);
      osc.stop(click.audioTime + CLICK_S);
      onClick(click);
    }

    function tick() {
      const { clicks, cursor: next } = advance(cursor, audioContext.currentTime + SCHEDULE_AHEAD_S, timeSignatureFor);
      cursor = next;
      for (const click of clicks) scheduleClick(click);
    }

    return {
      start(bpm) {
        cursor = { nextClickTime: audioContext.currentTime + FIRST_CLICK_DELAY_S, bar: 1, beat: 1, bpm };
        tick();
        timer = setInterval(tick, LOOKAHEAD_MS);
      },
      // D-08/D-14: takes effect from the next unscheduled interval -- the click already
      // computed keeps its own time, only the following interval uses the new BPM.
      setBpm(bpm) {
        if (!isValidBpm(bpm) || !cursor) return false;
        cursor.bpm = bpm;
        return true;
      },
      stop() {
        if (timer !== null) clearInterval(timer);
        timer = null;
      },
      nextClickTime() {
        return cursor ? cursor.nextClickTime : null;
      },
      isRunning() {
        return timer !== null;
      },
      cursor() {
        return cursor ? { ...cursor } : null;
      },
    };
  }

  return {
    LOOKAHEAD_MS,
    SCHEDULE_AHEAD_S,
    FIRST_CLICK_DELAY_S,
    ACCENT_HZ,
    CLICK_HZ,
    CLICK_S,
    MIN_BPM,
    MAX_BPM,
    advance,
    isValidBpm,
    create,
  };
})();

if (typeof module !== 'undefined') module.exports = globalThis.Metronome;
