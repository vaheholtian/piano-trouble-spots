/* Web MIDI wiring: decode raw MIDI bytes into plain event records, connect to the browser's
   MIDI access, enumerate inputs, and attach/detach a decoded-event handler. Classic script so
   index.html opens directly from disk (D-13) and node:test can `require()` it for side effects.

   decode() never throws and never filters (D-04, CAPT-01): every message the input delivers,
   including channel 10 (percussion), CC64 (sustain), program change, and 1-byte real-time
   bytes, becomes a plain-data record. Only decode()'s note/control/other classification and
   noteName() are pure; connect()/listInputs()/attach()/detach() are thin side-effecting
   wrappers around navigator.requestMIDIAccess() and MIDIInput.
*/
'use strict';
globalThis.MidiCapture = (() => {
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  function decode(event) {
    const raw = Array.from(event.data || []);
    const status = raw[0];
    const timeStamp = event.timeStamp;

    if (status === undefined) {
      return { type: 'other', channel: null, timeStamp, raw };
    }

    const kind = status >> 4;
    const channel = kind === 15 ? null : status & 15;

    if (kind === 9 && raw[2] > 0) {
      return { type: 'noteon', channel, note: raw[1], velocity: raw[2], timeStamp, raw };
    }
    if (kind === 8 || (kind === 9 && raw[2] === 0)) {
      return { type: 'noteoff', channel, note: raw[1], velocity: raw[2], timeStamp, raw };
    }
    if (kind === 11) {
      return { type: 'control', channel, controller: raw[1], value: raw[2], timeStamp, raw };
    }
    return { type: 'other', channel, timeStamp, raw };
  }

  function noteName(midi) {
    const name = NOTE_NAMES[((midi % 12) + 12) % 12];
    const octave = Math.floor(midi / 12) - 1;
    return name + octave;
  }

  async function connect({ onStateChange } = {}) {
    if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') {
      throw new Error('no-web-midi');
    }
    let access;
    try {
      access = await navigator.requestMIDIAccess();
    } catch (error) {
      if (error && error.name === 'NotAllowedError') {
        throw new Error('permission-denied');
      }
      throw error;
    }
    access.onstatechange = onStateChange || null;
    return access;
  }

  function listInputs(access) {
    return [...access.inputs.values()].map((input) => ({
      id: input.id,
      name: input.name,
      manufacturer: input.manufacturer,
      state: input.state,
    }));
  }

  function attach(input, onEvent) {
    input.onmidimessage = (ev) => onEvent(decode(ev));
  }

  function detach(input) {
    input.onmidimessage = null;
  }

  return { decode, noteName, connect, listInputs, attach, detach };
})();

if (typeof module !== 'undefined') module.exports = globalThis.MidiCapture;
