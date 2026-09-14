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

  return { samplePair, toAudioContextTime, toPageTime };
})();

if (typeof module !== 'undefined') module.exports = globalThis.Clock;
