/* Pass segmentation: pure function slicing a session's full raw event array into numbered
   passes at each `type: 'marker'` boundary (D-03, D-04, D-07). Classic script so index.html
   opens directly from disk (D-13) and node:test can `require()` it for side effects.

   Everything played inside a pass belongs to it (D-04): a non-marker note-on is pushed onto
   `notes`; a marker-tagged note-on, every note-off, every control, and every other record type
   is counted in `eventCount` only, never in `noteCount`/`notes`. The trailing pass is kept only
   when it holds at least one note or `includeEmptyTrailing` is set (D-03); middle passes
   (between two marks) are always kept, even with zero notes (D-04 -- no double-mark undo).

   Reads `seq` for ordering, never `timeStamp` order (CAPT-04 precision edge). Input events and
   their objects are never mutated; the returned passes are plain JSON.
*/
'use strict';
globalThis.PassSegmenter = (() => {
  function openPass(ordinal, startSeq, startTimeStamp) {
    return {
      ordinal,
      startSeq,
      startTimeStamp,
      endSeq: null,
      endTimeStamp: null,
      noteCount: 0,
      eventCount: 0,
      notes: [],
      _hasEvents: false,
    };
  }

  function finalizePass(pass) {
    const { _hasEvents, ...rest } = pass;
    rest.noteCount = rest.notes.length;
    return rest;
  }

  function segment(events, { sessionStartTimeStamp, sessionEndTimeStamp = null, includeEmptyTrailing = false } = {}) {
    const sorted = events.slice().sort((a, b) => a.seq - b.seq);
    const passes = [];
    let current = openPass(1, 0, sessionStartTimeStamp);
    let lastSeq = null;

    for (const event of sorted) {
      lastSeq = event.seq;

      if (event.type === 'marker') {
        current.endSeq = event.seq;
        current.endTimeStamp = event.timeStamp;
        passes.push(finalizePass(current));
        current = openPass(current.ordinal + 1, event.seq + 1, event.timeStamp);
        continue;
      }

      if (event.type === 'noteon' && event.marker !== true) {
        current.notes.push(event);
      } else {
        current.eventCount += 1;
      }
      current._hasEvents = true;
    }

    current.endSeq = current._hasEvents ? lastSeq : current.startSeq - 1;
    current.endTimeStamp = sessionEndTimeStamp;
    if (includeEmptyTrailing || current.notes.length > 0) {
      passes.push(finalizePass(current));
    }

    return passes;
  }

  return { segment };
})();

if (typeof module !== 'undefined') module.exports = globalThis.PassSegmenter;
