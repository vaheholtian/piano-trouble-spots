const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Small DOM/MIDI adapter: these tests exercise application events without a physical piano.
function harness() {
  class Element {
    constructor(tag = 'div') { this.tagName = tag; this.children = []; this.style = {}; this.attributes = {}; this.value = ''; this.hidden = false; this.disabled = false; this._text = ''; }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
    append(...children) { this.children.push(...children); if (this.tagName === 'select' && !this.value && this.children.length) this.value = this.children[0].value; }
    replaceChildren(...children) { this.children = []; this._text = ''; if (this.tagName === 'select') this.value = ''; this.append(...children); }
    setAttribute(key, value) { this.attributes[key] = value; }
    click() { if (!this.disabled) return this.onclick?.(); }
    remove() {}
  }
  const elements = new Map(), timers = new Map(), events = new Map(); let timer = 0;
  const html = fs.readFileSync(__dirname + '/piano-mistake-tracker.html', 'utf8');
  for (const match of html.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const element = new Element(match[1]);
    element.value = match[0].match(/\bvalue="([^"]+)"/)?.[1] || '';
    element.hidden = /\bhidden\b/.test(match[0]); elements.set(match[2], element);
  }
  elements.get('measures').value = '4'; elements.get('track').value = 'all';
  const context = {console, Blob, URL: {createObjectURL() {return 'blob:test';}, revokeObjectURL() {}},
    document: {getElementById: id => elements.get(id), createElement: tag => new Element(tag), body: new Element('body')},
    navigator: {}, window: {addEventListener: (name, fn) => events.set(name, fn)}, confirm: () => true,
    setTimeout(fn, delay) { timers.set(++timer, {fn, delay}); return timer; }, clearTimeout(id) { timers.delete(id); }};
  vm.createContext(context);
  for (const filename of ['piano-core.js', 'piano-app.js']) vm.runInContext(fs.readFileSync(__dirname + '/' + filename, 'utf8'), context);
  const run = code => vm.runInContext(code, context);
  const reference = {name: 'Practice', nBars: 8, notes: Array.from({length: 32}, (_, i) =>
    ({pitch: [60, 62, 64, 65][i % 4], channel: 0, track: 0, on: i * .5, off: i * .5 + .4, bar: Math.floor(i / 4) + 1, beat: i % 4 + 1}))};
  context.reference = reference;
  const load = () => run('replaceSession(reference, defaults(), []); S.input = {id:"piano",name:"Test piano",state:"connected"}; refreshControls();');
  const midi = (data, timeStamp) => { context.event = {data, timeStamp}; run('onMidi(event)'); };
  const perform = () => {
    elements.get('arm').click();
    for (let i = 0; i < 4; i++) { midi([144, reference.notes[i].pitch, 80], i * 500); midi([128, reference.notes[i].pitch, 0], i * 500 + 400); }
    elements.get('stop').click();
  };
  return {elements, run, context, timers, events, load, midi, perform};
}

test('startup is usable without a song and recording becomes available after setup', () => {
  const h = harness(); assert.equal(h.elements.get('arm').disabled, true); h.load();
  assert.equal(h.elements.get('arm').disabled, false);
  assert.match(h.elements.get('sectionSummary').textContent, /Measures 1–4 · 16 notes/);
  assert.equal(h.elements.get('grid').children.length, 4);
});
test('arming freezes the selected section and prevents imports or input changes', () => {
  const h = harness(); h.load(); h.elements.get('arm').click();
  for (const id of ['startBar', 'measures', 'track', 'lengthTolerance', 'midiFile', 'importFile', 'inputs']) assert.equal(h.elements.get(id).disabled, true, id);
  h.elements.get('discard').click();
  assert.equal(h.elements.get('startBar').disabled, false); assert.equal(h.run('S.recState'), 'idle');
});
test('a long held chord never schedules a silence cutoff', () => {
  const h = harness(); h.load(); h.elements.get('arm').click();
  h.midi([144, 60, 80], 0); h.midi([144, 64, 80], 5); h.midi([144, 67, 80], 10);
  assert.equal(h.timers.size, 0); assert.equal(h.run('S.recState'), 'recording');
  h.midi([128, 60, 0], 8000); h.midi([128, 64, 0], 8005); h.midi([128, 67, 0], 8010);
  assert.equal(h.run('S.recState'), 'recording'); assert.equal(h.run('S.notes[0].off'), 8);
});
test('pedal events do not replace the physical key release time', () => {
  const h = harness(); h.load(); h.elements.get('arm').click();
  h.midi([144, 60, 80], 0); h.midi([176, 64, 127], 200); h.midi([128, 60, 0], 400); h.midi([176, 64, 0], 2000);
  assert.equal(h.run('S.notes[0].off'), .4); assert.equal(h.run('S.notes.length'), 1);
});
test('live key releases are paired by channel as well as pitch', () => {
  const h = harness(); h.load(); h.elements.get('arm').click();
  h.midi([144, 60, 80], 0); h.midi([145, 60, 80], 100); h.midi([129, 60, 0], 200); h.midi([128, 60, 0], 500);
  assert.equal(h.run('S.notes[0].off'), .5); assert.equal(h.run('S.notes[1].off'), .2);
});
test('stopping renders measured lengths and preserves the raw take', () => {
  const h = harness(); h.load(); h.perform();
  assert.equal(h.run('S.takes.length'), 1); assert.equal(h.run('S.takes[0].notes[0].off'), .4);
  assert.equal(h.elements.get('lastTake').hidden, false);
  assert.match(h.elements.get('lastSummary').textContent, /4\/16 notes assessed/);
  assert.match(h.elements.get('coverageNotice').textContent, /12 reference notes unassessed/);
  assert.equal(h.elements.get('lengthMetric').textContent, '0 ms');
  assert.equal(h.elements.get('noteRows').children.length, 4); assert.equal(h.run('S.dirty'), true);
});
test('stopping with a held key reports its length as unassessed', () => {
  const h = harness(); h.load(); h.elements.get('arm').click(); h.midi([144, 60, 80], 0); h.elements.get('stop').click();
  assert.equal(h.run('S.takes[0].notes[0].off'), null);
  assert.match(h.elements.get('coverageNotice').textContent, /1 key releases not recorded/);
  assert.equal(h.elements.get('lengthMetric').textContent, '—');
});
test('changing sections filters history without erasing previous takes', () => {
  const h = harness(); h.load(); h.perform();
  h.elements.get('startBar').value = '5'; h.elements.get('startBar').onchange();
  assert.equal(h.elements.get('lastTake').hidden, true); assert.match(h.elements.get('takeCount').textContent, /0 takes here · 1 in session/);
  h.elements.get('startBar').value = '1'; h.elements.get('startBar').onchange();
  assert.equal(h.elements.get('lastTake').hidden, false);
});
test('invalid section controls disable recording and clear stale results', () => {
  const h = harness(); h.load(); h.elements.get('startBar').value = '0'; h.elements.get('startBar').onchange();
  assert.equal(h.elements.get('arm').disabled, true); assert.equal(h.elements.get('grid').children.length, 0);
});
test('malformed session imports preserve existing song, settings, and takes', async () => {
  const h = harness(); h.load(); h.perform();
  const previous = h.run('JSON.stringify({song:S.song,takes:S.takes})');
  h.context.file = {name: 'bad.json', size: 100, text: async () => JSON.stringify({version: 2, song: h.context.reference,
    settings: {startBar: 1, measures: 4, track: 'all', lengthTolerance: 80, attackTolerance: 80}, takes: [{}]})};
  await h.run('importFile({target:{files:[file],value:""}}, true)');
  assert.equal(h.run('JSON.stringify({song:S.song,takes:S.takes})'), previous);
  assert.match(h.elements.get('toast').textContent, /Invalid recorded take/);
  assert.equal(h.elements.get('arm').disabled, false);
});
test('valid session import restores raw takes and treats a markup song name as text', async () => {
  const h = harness(); h.load(); h.perform();
  const data = h.run('JSON.stringify({version:2,song:{...S.song,name:"<img src=x>"},settings:settings(),takes:S.takes})');
  h.context.file = {name: 'session.json', size: data.length, text: async () => data};
  await h.run('importFile({target:{files:[file],value:""}}, true)');
  assert.equal(h.run('S.takes.length'), 1); assert.equal(h.elements.get('songName').children.length, 0);
  assert.match(h.elements.get('songName').textContent, /<img src=x>/); assert.equal(h.run('S.dirty'), false);
});
test('cancelling replacement of unsaved practice preserves the existing session', async () => {
  const h = harness(); h.load(); h.perform(); h.context.confirm = () => false;
  const data = h.run('JSON.stringify({version:2,song:{...S.song,name:"Replacement"},settings:settings(),takes:[]})');
  h.context.file = {name: 'session.json', size: data.length, text: async () => data};
  await h.run('importFile({target:{files:[file],value:""}}, true)');
  assert.equal(h.run('S.song.name'), 'Practice'); assert.equal(h.run('S.takes.length'), 1);
});
test('MIDI connection changes preserve the selected input', () => {
  const h = harness(); h.load();
  h.run('const inputA={id:"a",name:"A",state:"connected"}; const inputB={id:"b",name:"B",state:"connected"}; S.midi={inputs:new Map([["a",inputA],["b",inputB]])}; useInput("b"); listInputs();');
  assert.equal(h.run('S.input.id'), 'b'); assert.equal(h.elements.get('inputs').value, 'b');
});
test('disconnecting during recording preserves available timing and unlocks controls', () => {
  const h = harness(); h.load(); h.elements.get('arm').click(); h.midi([144, 60, 80], 0);
  h.run('S.midi={inputs:new Map()}; listInputs();');
  assert.equal(h.run('S.recState'), 'idle'); assert.equal(h.run('S.takes.length'), 1);
  assert.equal(h.run('S.takes[0].notes[0].off'), null); assert.equal(h.elements.get('arm').disabled, true);
  assert.equal(h.elements.get('midiFile').disabled, false);
});
test('without Web MIDI the page takes timed input from the relay that served it', async () => {
  const h = harness(); h.load(); h.run('S.input = null; refreshControls();');
  let socket; h.context.location = {protocol: 'http:', host: 'laptop:8765'};
  h.context.WebSocket = class { constructor(url) { this.url = url; socket = this; } close() { this.onclose?.(); } };
  const connecting = h.elements.get('connect').click();
  assert.equal(socket.url, 'ws://laptop:8765/midi');
  socket.onmessage({data: JSON.stringify({type: 'ports', ports: [{id: '0:Roland', name: 'Roland Digital Piano'}]})});
  await connecting;
  assert.equal(h.run('S.input.name'), 'Roland Digital Piano via relay'); assert.equal(h.elements.get('arm').disabled, false);
  h.elements.get('arm').click();
  socket.onmessage({data: JSON.stringify({type: 'midi', id: '0:Roland', data: [144, 60, 80], t: 1000})});
  socket.onmessage({data: JSON.stringify({type: 'midi', id: '0:Roland', data: [128, 60, 0], t: 1400})});
  assert.equal(h.run('S.recState'), 'recording'); assert.equal(Math.round(h.run('S.notes[0].off') * 1000), 400);
  socket.onclose();
  assert.equal(h.run('S.recState'), 'idle'); assert.equal(h.run('S.takes.length'), 1); assert.equal(h.run('S.input'), null);
  assert.ok([...h.timers.values()].some(t => t.delay === 3000), 'schedules a reconnect');
});
test('without Web MIDI or a relay the connect button explains what to do', async () => {
  const h = harness(); h.context.location = {protocol: 'https:', host: 'vaheholtian.github.io'};
  h.context.WebSocket = class { constructor() { h.context.setTimeout(() => this.onclose(), 0); } close() {} };
  const connecting = h.elements.get('connect').click();
  h.timers.get(1).fn(); await connecting;
  assert.match(h.elements.get('midiStatus').textContent, /relay on your computer/);
  assert.equal(h.elements.get('arm').disabled, true);
});

function relayHarness() {
  const h = harness(), sockets = [];
  h.context.location = {protocol: 'http:', host: 'localhost:8765'};
  h.context.WebSocket = class {
    constructor() { sockets.push(this); }
    close() { this.closed = true; }
    message(value) { this.onmessage?.({data: typeof value === 'string' ? value : JSON.stringify(value)}); }
  };
  const announce = socket => socket.message({type: 'ports', ports: [{id: 'piano', name: 'Piano'}]});
  const fire = delay => {
    const entry = [...h.timers].find(([, timer]) => timer.delay === delay);
    assert.ok(entry, 'timer ' + delay + ' exists'); h.timers.delete(entry[0]); entry[1].fn();
  };
  return {...h, sockets, announce, fire};
}

test('connection in progress locks recording and repeated clicks create one socket', async () => {
  const h = relayHarness(); h.load();
  const pending = h.elements.get('connect').click(); h.elements.get('connect').click();
  assert.equal(h.sockets.length, 1); assert.equal(h.elements.get('arm').disabled, true);
  h.announce(h.sockets[0]); await pending;
  assert.equal(h.elements.get('arm').disabled, false);
  await h.elements.get('connect').click(); assert.equal(h.sockets.length, 1);
});

test('failed initial relay connection stops instead of creating abandoned retries', async () => {
  const h = relayHarness(), pending = h.elements.get('connect').click();
  h.fire(5000); await pending;
  assert.equal(h.sockets[0].closed, true);
  assert.equal([...h.timers.values()].some(t => t.delay === 3000), false);
  assert.equal(h.elements.get('connect').disabled, false);
});

test('silent relay failure preserves the take and reconnects using a fresh clock', async () => {
  const h = relayHarness(); h.load();
  const pending = h.elements.get('connect').click(); h.announce(h.sockets[0]); await pending;
  h.elements.get('arm').click(); h.sockets[0].message({type: 'midi', id: 'piano', data: [144, 60, 80], t: 10000});
  const staleMessage = h.sockets[0].onmessage;
  h.fire(15000);
  assert.equal(h.run('S.recState'), 'idle'); assert.equal(h.run('S.takes[0].notes[0].off'), null);
  assert.equal(h.run('S.input'), null); assert.equal(h.elements.get('arm').disabled, true);
  h.fire(3000); h.announce(h.sockets[1]);
  assert.equal(h.elements.get('arm').disabled, false);
  h.elements.get('arm').click();
  staleMessage({data: JSON.stringify({type: 'midi', id: 'piano', data: [144, 60, 80], t: 20000})});
  assert.equal(h.run('S.recState'), 'armed');
  h.sockets[1].message({type: 'midi', id: 'piano', data: [144, 60, 80], t: 0});
  h.sockets[1].message({type: 'midi', id: 'piano', data: [128, 60, 0], t: 400});
  h.elements.get('stop').click();
  assert.equal(h.run('S.takes[1].notes[0].on'), 0); assert.equal(h.run('S.takes[1].notes[0].off'), .4);
});

test('relay heartbeat renews liveness and malformed frames disconnect safely', async () => {
  for (const bad of ['not JSON', 'null', {type: 'ports', ports: null}, {type: 'midi', data: [144, 60, 80], t: -1}]) {
    const h = relayHarness(), pending = h.elements.get('connect').click();
    h.announce(h.sockets[0]); await pending;
    h.sockets[0].message({type: 'heartbeat'});
    assert.equal([...h.timers.values()].filter(t => t.delay === 15000).length, 1);
    assert.doesNotThrow(() => h.sockets[0].message(bad));
    assert.equal(h.sockets[0].closed, true); assert.equal(h.run('S.input'), null);
  }
});

test('closing a relay access cancels reconnection and releases its devices', async () => {
  const h = relayHarness(), pending = h.elements.get('connect').click(); h.announce(h.sockets[0]); await pending;
  h.run('S.midi.close()'); assert.equal(h.run('S.input'), null);
  assert.equal([...h.timers.values()].some(t => t.delay === 3000), false);
});

test('changing MIDI input during a take finishes it before another clock can arrive', () => {
  const h = harness(); h.load(); h.elements.get('arm').click(); h.midi([144, 60, 80], 10000);
  h.run('S.midi={inputs:new Map([["new",{id:"new",name:"Other piano",state:"connected"}]])}; useInput("new");');
  assert.equal(h.run('S.recState'), 'idle'); assert.equal(h.run('S.takes[0].notes[0].off'), null);
  h.midi([144, 60, 80], 0); assert.equal(h.run('S.notes.length'), 0);
  assert.doesNotThrow(() => h.run('C.readSession(JSON.stringify({version:2,song:S.song,settings:settings(),takes:S.takes}))'));
});

test('invalid and percussion MIDI cannot start a take, and clock regression stops safely', () => {
  const h = harness(); h.load(); h.elements.get('arm').click();
  for (const [data, time] of [[[153, 60, 80], 0], [[144, 200, 80], 0], [[144, 60], 0], [[144, 60, 80], NaN]]) h.midi(data, time);
  assert.equal(h.run('S.recState'), 'armed');
  h.midi([144, 60, 80], 10000); h.midi([144, 60, 80], 0);
  assert.equal(h.run('S.recState'), 'idle'); assert.equal(h.run('S.takes[0].notes[0].on'), 0);
  assert.doesNotThrow(() => h.run('C.readSession(JSON.stringify({version:2,song:S.song,settings:settings(),takes:S.takes}))'));
});

test('session take and note limits prevent creating exports the importer cannot accept', () => {
  const h = harness(); h.load(); h.perform();
  h.run('S.takes=Array(C.limits.takes).fill(S.takes[0]); refreshControls();');
  assert.equal(h.elements.get('arm').disabled, true); assert.match(h.elements.get('takeStatus').textContent, /Session full/);
  assert.equal(h.elements.get('export').disabled, false);
  h.run('S.takes=Array(10).fill({...S.takes[0],notes:Array(C.limits.notesPerTake).fill(S.takes[0].notes[0])}); refreshControls();');
  assert.equal(h.elements.get('arm').disabled, true);
});

test('last available session notes still preserve their physical release', () => {
  const h = harness(); h.load(); h.perform();
  h.run('S.takes=[{...S.takes[0],notes:Array(C.limits.notesPerSession-1).fill(S.takes[0].notes[0])}]; refreshControls();');
  h.elements.get('arm').click(); h.midi([144, 60, 80], 0); h.midi([128, 60, 0], 400); h.midi([144, 62, 80], 500);
  assert.equal(h.run('S.recState'), 'idle'); assert.equal(h.run('S.takes[1].notes[0].off'), .4);
  assert.equal(h.run('S.takes[1].notes.length'), 1); assert.equal(h.elements.get('arm').disabled, true);
});

test('session import accepts a valid file above the old 16 MB cap', async () => {
  const h = harness(); h.load();
  const text = h.run('JSON.stringify({version:2,song:S.song,settings:settings(),takes:[]})') + ' '.repeat(16 * 1024 * 1024);
  h.context.file = {name: 'large.json', size: text.length, text: async () => text};
  await h.run('importFile({target:{files:[file],value:""}},true)');
  assert.match(h.elements.get('toast').textContent, /Session loaded/);
});

test('an actual exported session at the total-note limit reloads above 16 MB', async () => {
  const h = harness(); h.load(); let saved;
  h.context.URL.createObjectURL = blob => { saved = blob; return 'blob:review-export'; };
  h.run(`
    for (let i = 0; i < 30000; i++) S.song.notes.push({pitch:60,channel:0,track:0,
      on:16+i*.5,off:16+i*.5+.4,bar:9+Math.floor(i/4),beat:1+i%4});
    S.song.nBars = 7508; C.validateSong(S.song);
    const longNotes = Array.from({length:C.limits.notesPerTake}, (_,i) => {
      const on = i < 16 ? i * .5 : 8 + (i - 16) * .40000000000003;
      return {pitch:[60,62,64,65][i%4],channel:0,on,off:on + .31234567890123};
    });
    const longTake = {at:new Date().toISOString(),settings:currentSettings(),notes:longNotes,
      analysis:C.analyze(S.song,currentSettings(),longNotes)};
    S.takes = Array(10).fill(longTake); S.dirty = true; refreshControls();
  `);
  h.elements.get('export').click();
  assert.ok(saved, 'download was created');
  assert.ok(saved.size > 16 * 1024 * 1024, 'exercises the former import limit');
  assert.ok(saved.size <= h.run('C.limits.sessionBytes'));
  h.context.file = {name:'saved.json',size:saved.size,text:()=>saved.text()};
  await h.run('importFile({target:{files:[file],value:""}},true)');
  assert.match(h.elements.get('toast').textContent, /Session loaded: 10 takes/);
  assert.equal(h.run('S.takes.reduce((sum,t)=>sum+t.notes.length,0)'), 200000);
  assert.equal(h.run('S.takes[9].notes[19999].off'), h.run('longNotes[19999].off'));
});

// Web Audio stand-in: the reference playback is scheduled, never rendered, in these tests.
function fakeAudio(h) {
  class Param {
    constructor(value) { this.value = value; this.events = []; }
    setValueAtTime(v, t) { this.events.push(['set', v, t]); }
    exponentialRampToValueAtTime(v, t) { this.events.push(['ramp', v, t]); }
    setTargetAtTime(v, t) { this.events.push(['target', v, t]); }
    cancelScheduledValues(t) { this.events.push(['cancel', t]); }
  }
  const log = {contexts: 0, resumed: 0, master: null, voices: []};
  h.context.AudioContext = class {
    constructor() { this.currentTime = 10; this.destination = 'speakers'; log.contexts++; }
    resume() { log.resumed++; }
    createGain() {
      const gain = {gain: new Param(1), connect(target) { this.target = target; }};
      log.master = log.master || gain; return gain;
    }
    createOscillator() {
      const osc = {type: '', frequency: {value: 0}, stops: [], connect(target) { this.target = target; },
        start(t) { this.startedAt = t; }, stop(t) { this.stops.push(t); }};
      log.voices.push(osc); return osc;
    }
  };
  return log;
}

test('the section plays back one voice per reference note on the graded timeline', () => {
  const h = harness(); h.load(); const audio = fakeAudio(h);
  h.elements.get('play').click();
  assert.equal(audio.voices.length, 16); assert.equal(audio.resumed, 1);
  assert.equal(h.elements.get('play').textContent, 'Stop playback');
  assert.match(h.elements.get('playStatus').textContent, /Playing measures 1–4/);
  assert.equal(Math.round(audio.voices[0].frequency.value), 262); // Middle C.
  assert.equal(audio.voices[0].startedAt, 10.3);                  // Lead-in before the first note.
  assert.equal(audio.voices[1].startedAt, 10.8);                  // Half a second later, as written.
  assert.ok(Math.abs(audio.voices[0].stops[0] - 11.1) < 1e-9);     // Release, then the tail.
});
test('stopping playback releases every voice and restores the button', () => {
  const h = harness(); h.load(); const audio = fakeAudio(h);
  h.elements.get('play').click(); h.elements.get('play').click();
  assert.equal(h.run('P.playing'), false); assert.equal(h.timers.size, 0);
  assert.equal(h.elements.get('play').textContent, 'Hear this section');
  assert.equal(h.elements.get('playStatus').textContent, '');
  assert.ok(audio.voices.every(v => v.stops.length === 2 && v.stops[1] === 10.1));
  assert.deepEqual(audio.master.gain.events.map(e => e[0]), ['cancel', 'target']);
});
test('playback ends on its own and reuses one audio context', () => {
  const h = harness(); h.load(); const audio = fakeAudio(h);
  h.elements.get('play').click();
  const [id, entry] = [...h.timers][0];
  assert.equal(entry.delay, (.3 + 7.9 + .5) * 1000); // Through the last release in the section.
  entry.fn();
  assert.equal(h.run('P.playing'), false);
  h.elements.get('play').click();
  assert.equal(audio.contexts, 1); assert.equal(audio.voices.length, 32);
});
test('recording, a new section, and a new reference all silence playback', () => {
  const h = harness(); h.load(); fakeAudio(h);
  h.elements.get('play').click(); h.elements.get('arm').click();
  assert.equal(h.run('P.playing'), false);
  assert.equal(h.elements.get('play').disabled, true, 'no playback mid-take');
  h.elements.get('discard').click();
  assert.equal(h.elements.get('play').disabled, false);
  h.elements.get('play').click();
  h.elements.get('startBar').value = '5'; h.elements.get('startBar').onchange();
  assert.equal(h.run('P.playing'), false);
  h.elements.get('play').click(); h.load();
  assert.equal(h.run('P.playing'), false);
});
test('playback follows the chosen part and needs both a song and an audio context', () => {
  const h = harness();
  assert.equal(h.elements.get('play').disabled, true, 'nothing to play without a song');
  h.context.reference.notes.forEach((n, i) => { n.track = i % 2; });
  h.load(); h.elements.get('play').click();
  assert.match(h.elements.get('toast').textContent, /cannot play the reference section/);
  const audio = fakeAudio(h);
  h.elements.get('track').value = '1'; h.elements.get('track').onchange();
  h.elements.get('play').click();
  assert.equal(audio.voices.length, 8);
});
