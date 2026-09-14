/* Pure clock correlation: converts between two clock domains that meet only through a paired
   sample. `performance.now()` and `MIDIMessageEvent.timeStamp` share one origin, in
   milliseconds. `AudioContext.currentTime` is seconds on its own origin, fixed the moment the
   AudioContext was created. Neither domain is privileged inside this module -- callers pass
   plain numbers, never a live `performance`/`AudioContext` object, so this file touches no
   browser global and is `node:test`-able exactly like src/score-model.js (D-09).

   samplePair() is taken once at Start, re-sampled periodically and at Stop; the pair currently
   in effect is what every conversion below uses. Stored MIDI timeStamp values are never
   rewritten -- conversion happens only where a comparison is made (D-09, D-11).

   offsetMs()/nearestClick()/median() (added by 02-02 Task 2) feed the diagnostic readout only
   (D-10); nothing here is ever applied back to a stored timestamp.
*/
'use strict';
globalThis.Clock = (() => {
  function samplePair(performanceNow, audioContextTime) {
    return { performanceNow, audioContextTime };
  }

  function toAudioContextTime(pageMs, pair) {
    return pair.audioContextTime + (pageMs - pair.performanceNow) / 1000;
  }

  function toPageTime(audioSeconds, pair) {
    return pair.performanceNow + (audioSeconds - pair.audioContextTime) * 1000;
  }

  function offsetMs(pageMs, clickAudioTime, pair) {
    return (toAudioContextTime(pageMs, pair) - clickAudioTime) * 1000;
  }

  // Scans for the click time closest to audioTime; on an exact tie keeps the earlier index
  // (only replaces the current best on a STRICTLY smaller diff).
  function nearestClick(audioTime, clickTimes) {
    if (clickTimes.length === 0) return null;
    let bestIndex = 0;
    let bestDiff = Math.abs(audioTime - clickTimes[0]);
    for (let i = 1; i < clickTimes.length; i++) {
      const diff = Math.abs(audioTime - clickTimes[i]);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIndex = i;
      }
    }
    return {
      index: bestIndex,
      clickTime: clickTimes[bestIndex],
      offsetMs: (audioTime - clickTimes[bestIndex]) * 1000,
    };
  }

  // Never mutates its input (sorts a copy).
  function median(values) {
    if (values.length === 0) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
    return sorted[mid];
  }

  return { samplePair, toAudioContextTime, toPageTime, offsetMs, nearestClick, median };
})();

if (typeof module !== 'undefined') module.exports = globalThis.Clock;
