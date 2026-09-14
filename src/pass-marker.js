/* Pass-marker detection: pure function over a stream of decoded MIDI/keydown-shaped records,
   deciding whether the two marker keys (B7+C8, MIDI 107/108 by default) were pressed together
   within a short window (D-01). Classic script so index.html opens directly from disk (D-13)
   and node:test can `require()` it for side effects.

   feed() only ever looks at `event.type === 'noteon'` records whose `event.note` is one of the
   two configured keys (D-01). Note-offs, controls (including CC64 sustain) and any other type
   never touch the pending map (D-02) -- the sustain pedal is never a marker.

   `seq` is read from `event.seq` when present, else the count of events fed so far (all types,
   not just note-ons) -- this lets findMarkers() work over a plain stream that never assigned
   seq numbers itself.
*/
'use strict';
globalThis.PassMarker = (() => {
  const DEFAULT_KEYS = [107, 108];
  const WINDOW_MS = 100;

  function createDetector({ keys = DEFAULT_KEYS, windowMs = WINDOW_MS } = {}) {
    const pending = new Map(); // note -> { timeStamp, seq, note }
    let fedCount = 0;

    function reset() {
      pending.clear();
      fedCount = 0;
    }

    function feed(event) {
      const seq = event.seq !== undefined ? event.seq : fedCount;
      fedCount += 1;

      if (event.type !== 'noteon' || !keys.includes(event.note)) return null;

      const other = keys.find((k) => k !== event.note);
      const pendingOther = pending.get(other);
      if (pendingOther !== undefined && Math.abs(event.timeStamp - pendingOther.timeStamp) <= windowMs) {
        pending.delete(other);
        return {
          timeStamp: event.timeStamp,
          seqs: [pendingOther.seq, seq],
          notes: [pendingOther.note, event.note],
        };
      }

      // Replaces any older press of the same key -- the pair is judged against the most
      // recent press of each note (CAPT-04 ordering edge).
      pending.set(event.note, { timeStamp: event.timeStamp, seq, note: event.note });
      return null;
    }

    return { feed, reset };
  }

  function findMarkers(events, opts) {
    const detector = createDetector(opts);
    const hits = [];
    for (const event of events) {
      const hit = detector.feed(event);
      if (hit) hits.push(hit);
    }
    return hits;
  }

  return { DEFAULT_KEYS, WINDOW_MS, createDetector, findMarkers };
})();

if (typeof module !== 'undefined') module.exports = globalThis.PassMarker;
