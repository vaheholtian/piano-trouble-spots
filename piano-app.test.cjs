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
