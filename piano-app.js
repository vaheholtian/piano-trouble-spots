'use strict';
const C = PianoCore;
const $ = id => document.getElementById(id);
const S = {song: null, takes: [], midi: null, input: null, recState: 'idle', notes: [],
  active: new Map(), recordingSettings: null, t0: 0, selectedBar: null, dirty: false, loading: false};
const settingIds = ['startBar', 'measures', 'track', 'lengthTolerance', 'attackTolerance'];
const defaults = () => ({startBar: 1, measures: 4, track: 'all', lengthTolerance: 80, attackTolerance: 80});
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { $('toast').hidden = true; }, 6500);
}
function settings() {
  return {startBar: Number($('startBar').value), measures: Number($('measures').value),
    track: $('track').value === 'all' ? 'all' : Number($('track').value),
    lengthTolerance: Number($('lengthTolerance').value), attackTolerance: Number($('attackTolerance').value)};
}
const keyFor = s => [s.startBar, s.measures, s.track, s.lengthTolerance, s.attackTolerance].join(':');
function currentSettings() { return C.validateSettings(settings(), S.song); }
function sectionEnd(s) { return Math.min(S.song.nBars, s.startBar + s.measures - 1); }
function refreshControls() {
  const busy = S.recState !== 'idle' || S.loading;
  for (const id of settingIds) $(id).disabled = busy || !S.song;
  for (const id of ['midiFile', 'importFile', 'connect', 'inputs']) $(id).disabled = busy;
  $('reset').disabled = busy || !S.takes.length;
  $('export').disabled = busy || !S.song;
  let ready = !!S.song && !!S.input;
  try { if (S.song && !C.sectionNotes(S.song, currentSettings()).length) ready = false; }
  catch { ready = false; }
  $('arm').disabled = busy || !ready;
  $('arm').hidden = S.recState !== 'idle';
  $('stop').hidden = S.recState !== 'recording';
  $('discard').hidden = S.recState === 'idle';
  $('dot').className = 'dot ' + S.recState;
  if (S.recState === 'idle') $('takeStatus').textContent = ready ? 'Ready for the selected section.' : 'Load a section and connect your piano.';
}
function renderSection() {
  if (!S.song) { refreshControls(); return; }
  try {
    const s = currentSettings(), notes = C.sectionNotes(S.song, s);
    const first = notes.filter(n => n.on < .001).map(n => C.pitchName(n.pitch));
    $('sectionSummary').textContent = 'Measures ' + s.startBar + '–' + sectionEnd(s) + ' · ' + notes.length +
      ' notes' + (first.length ? ' · starts on ' + [...new Set(first)].join(' / ') : ' · no notes in this part');
    if (S.selectedBar === null || S.selectedBar < s.startBar || S.selectedBar > sectionEnd(s)) S.selectedBar = s.startBar;
    renderHistory(s);
  } catch (error) {
    $('sectionSummary').textContent = 'Choose a valid measure and tolerances between 10 and 500 ms.';
    $('grid').replaceChildren(); $('detail').textContent = 'Check the practice settings above.';
    $('lastTake').hidden = true;
  }
  refreshControls();
}
function describe(value, metric) {
  if (value === null) return metric === 'attack' ? 'Start anchor' : 'Release not recorded';
  const rounded = Math.round(Math.abs(value));
  if (!rounded) return 'On target';
  return rounded + ' ms ' + (metric === 'length' ? (value < 0 ? 'short' : 'long') : (value < 0 ? 'early' : 'late'));
}
const ms = value => value === null ? '—' : Math.round(value) + ' ms';
const beat = value => Number(value.toFixed(2));
function renderLastTake(take) {
  $('lastTake').hidden = !take;
  if (!take) return;
  const a = take.analysis, s = take.settings;
  $('lastSummary').textContent = 'Measures ' + s.startBar + '–' + sectionEnd(s) + ' · ' +
    a.observations.length + '/' + a.expectedCount + ' notes assessed · ' + new Date(take.at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  $('lengthMetric').textContent = ms(a.medianLengthMs);
  $('attackMetric').textContent = ms(a.medianAttackMs);
  $('driftMetric').textContent = a.driftMs === null ? '—' : (a.driftMs > .5 ? '+' : a.driftMs < -.5 ? '−' : '') + Math.round(Math.abs(a.driftMs)) + ' ms';
  $('driftCaption').textContent = a.driftMs === null ? 'needs two note starts' :
    Math.abs(a.driftMs) < .5 ? 'no net drift in assessed span' : a.driftMs > 0 ? 'behind across assessed span' : 'ahead across assessed span';
  const notices = [];
  if (a.unassessed) notices.push(a.unassessed + ' reference notes unassessed');
  if (a.unusedPlayed) notices.push(a.unusedPlayed + ' played notes could not be timed against the section');
  if (a.unfinished) notices.push(a.unfinished + ' key releases not recorded; those lengths are unassessed');
  $('coverageNotice').textContent = notices.length ? notices.join('. ') + '. Unassessed notes are not counted as clean.' : 'All reference notes have timing samples.';
  $('coverageNotice').className = notices.length ? 'notice' : 'hint';
  $('noteRows').replaceChildren();
  for (const o of a.observations.slice(0, 200)) {
    const row = node('tr');
    row.append(node('td', o.bar + ' · ' + beat(o.beat)), node('td', C.pitchName(o.pitch)),
      node('td', ms(o.expectedLength)), node('td', ms(o.actualLength)),
      node('td', describe(o.lengthMs, 'length'), Math.abs(o.lengthMs || 0) > s.lengthTolerance + 1e-6 ? 'issue' : ''),
      node('td', describe(o.attackMs, 'attack'), Math.abs(o.attackMs || 0) > s.attackTolerance + 1e-6 ? 'issue' : ''));
    $('noteRows').append(row);
  }
  $('rowLimit').textContent = a.observations.length > 200 ? 'Showing the first 200 assessed notes. All samples are saved in the session.' :
    'Length = how long the key was held. Note start = early or late against the MIDI timeline.';
}
function renderHistory(s) {
  const takes = S.takes.filter(t => keyFor(t.settings) === keyFor(s));
  const samples = C.aggregate(takes);
  const refs = C.sectionNotes(S.song, s);
  $('takeCount').textContent = takes.length + ' takes here · ' + S.takes.length + ' in session';
  $('grid').replaceChildren();
  for (let bar = s.startBar; bar <= sectionEnd(s); bar++) {
    const local = samples.filter(o => o.bar === bar), total = refs.filter(n => n.bar === bar).length;
    const measured = new Set(local.map(o => o.id)).size;
    const ratio = Math.max(0, ...local.map(o => o.issues / o.attempts));
    const button = node('button', String(bar).padStart(2, '0'), 'bar' + (local.length ? ' covered' : ''));
    const label = total === 0 ? 'Rest' : local.length ? measured + '/' + total + ' notes' : 'No data';
    button.append(node('small', label));
    button.setAttribute('aria-pressed', String(S.selectedBar === bar));
    button.setAttribute('aria-label', 'Measure ' + bar + ', ' + label + (local.length ? ', highest issue recurrence ' + Math.round(ratio * 100) + '%' : ''));
    if (local.length) button.style.backgroundColor = 'rgb(' + [45, 59, 77].map((v, i) => Math.round(v + ([151, 82, 62][i] - v) * ratio)).join(',') + ')';
    button.onclick = () => { S.selectedBar = bar; renderHistory(s); };
    $('grid').append(button);
  }
  const detail = $('detail'); detail.replaceChildren();
  const local = samples.filter(o => o.bar === S.selectedBar);
  detail.append(node('h3', 'Measure ' + S.selectedBar));
  if (!local.length) detail.append(node('p', 'No timing samples for this measure yet.', 'sub'));
  else {
    const issues = local.filter(o => o.issues).sort((a, b) => b.issues / b.attempts - a.issues / a.attempts || a.beat - b.beat);
    if (!issues.length) detail.append(node('p', 'Assessed notes are within tolerance. Unassessed notes have no result yet.', 'sub'));
    else {
      const list = node('ul', undefined, 'issue-list');
      for (const o of issues) {
        const item = node('li'), info = node('span');
        info.append(node('span', 'Beat ' + beat(o.beat) + ' · ' + C.pitchName(o.pitch) + ' · ' + (o.metric === 'length' ? 'note length' : 'note start')));
        const issueValues = o.values.filter(v => Math.abs(v) > (o.metric === 'length' ? s.lengthTolerance : s.attackTolerance) + 1e-6);
        const direction = issueValues.some(v => v < 0) && issueValues.some(v => v > 0) ?
          Math.round(C.median(issueValues.map(Math.abs))) + ' ms off · varies in direction' : describe(C.median(issueValues), o.metric);
        info.append(node('div', 'Typical issue: ' + direction, 'hint'));
        item.append(info, node('span', o.issues + '/' + o.attempts + ' samples', 'count'));
        list.append(item);
      }
      detail.append(list);
    }
  }
  renderLastTake(takes[takes.length - 1]);
}

function resetRecording() {
  S.recState = 'idle'; S.active.clear(); S.recordingSettings = null; S.notes = [];
  refreshControls();
}
function onMidi(event) {
  const [status, pitch, velocity] = event.data, kind = status >> 4, channel = status & 15;
  const isOn = kind === 9 && velocity > 0, isOff = kind === 8 || (kind === 9 && velocity === 0);
  if (!isOn && !isOff) return; // Pedal does not change physical key-hold lengths.
  const now = event.timeStamp / 1000;
  if (S.recState === 'armed' && isOn) { S.t0 = now; S.recState = 'recording'; refreshControls(); }
  if (S.recState !== 'recording') return;
  const key = channel + ':' + pitch;
  if (isOn) {
    if (S.notes.length >= 20000) { finishTake(); toast('Take stopped at the recording limit.'); return; }
    const note = {pitch, channel, on: now - S.t0, off: null};
    S.notes.push(note);
    if (!S.active.has(key)) S.active.set(key, []);
    S.active.get(key).push(note);
  } else {
    const queue = S.active.get(key), note = queue?.shift();
    if (note) note.off = Math.max(note.on, now - S.t0);
    if (queue && !queue.length) S.active.delete(key);
  }
  $('takeStatus').textContent = 'Recording · ' + S.notes.length + ' notes · ' +
    [...S.active.values()].reduce((sum, q) => sum + q.length, 0) + ' keys held';
}
function finishTake() {
  if (S.recState !== 'recording') return;
  const notes = S.notes.map(n => ({...n})).sort((a, b) => a.on - b.on), takeSettings = {...S.recordingSettings};
  resetRecording();
  try {
    const analysis = C.analyze(S.song, takeSettings, notes);
    S.takes.push({at: new Date().toISOString(), settings: takeSettings, notes, analysis}); S.dirty = true;
    renderSection();
    toast('Take saved in this session. Review its note lengths and timing below.');
  } catch (error) { toast(error.message); }
}
$('arm').onclick = () => {
  if ($('arm').disabled) return;
  S.notes = []; S.active.clear(); S.recordingSettings = {...currentSettings()}; S.recState = 'armed';
  refreshControls(); $('takeStatus').textContent = 'Listening for the section’s first note or chord…';
};
$('stop').onclick = finishTake;
$('discard').onclick = () => { resetRecording(); toast('Take discarded.'); };

function useInput(id) {
  const next = S.midi.inputs.get(id);
  if (next === S.input) return;
  if (S.input) S.input.onmidimessage = null;
  S.input = next || null;
  if (S.input) S.input.onmidimessage = onMidi;
  $('midiStatus').textContent = S.input ? 'Connected to ' + (S.input.name || 'piano') + '.' : 'No connected MIDI input.';
  refreshControls();
}
function listInputs() {
  const inputs = [...S.midi.inputs.values()].filter(input => input.state === 'connected');
  const selected = S.input?.id;
  if (S.input && !inputs.some(input => input.id === selected)) {
    if (S.recState === 'recording') finishTake(); else resetRecording();
    S.input.onmidimessage = null; S.input = null;
    toast('Piano disconnected. Any recorded take was reviewed with unfinished releases left unassessed.');
  }
  $('inputs').replaceChildren();
  for (const input of inputs) { const option = node('option', input.name || 'MIDI input'); option.value = input.id; $('inputs').append(option); }
  $('inputs').hidden = !inputs.length;
  if (inputs.length) { $('inputs').value = inputs.some(input => input.id === selected) ? selected : inputs[0].id; useInput($('inputs').value); }
  else { $('midiStatus').textContent = 'No MIDI devices found. Check your connection.'; refreshControls(); }
}
$('inputs').onchange = () => useInput($('inputs').value);
$('connect').onclick = async () => {
  if (!navigator.requestMIDIAccess) { toast('MIDI access is unavailable in this browser. Try opening this file in Chrome or Edge.'); return; }
  try { S.midi = await navigator.requestMIDIAccess(); S.midi.onstatechange = listInputs; listInputs(); }
  catch (error) { $('midiStatus').textContent = 'MIDI access was blocked: ' + error.message; }
};

function replaceSession(song, nextSettings, takes) {
  resetRecording(); S.song = song; S.takes = takes; S.selectedBar = nextSettings.startBar;
  $('songName').textContent = song.name + ' · ' + song.nBars + ' measures';
  $('startBar').max = song.nBars;
  $('track').replaceChildren();
  const all = node('option', 'All tracks'); all.value = 'all'; $('track').append(all);
  for (const track of [...new Set(song.notes.map(n => n.track))].sort((a, b) => a - b)) {
    const option = node('option', 'Track ' + (track + 1)); option.value = track; $('track').append(option);
  }
  for (const id of settingIds) $(id).value = nextSettings[id];
  renderSection();
}
async function importFile(event, session) {
  const file = event.target.files[0]; if (!file || S.loading || S.recState !== 'idle') return;
  S.loading = true; refreshControls();
  try {
    if (file.size > 16 * 1024 * 1024) throw new Error('Choose a file smaller than 16 MB.');
    let data;
    if (session) data = C.readSession(await file.text());
    else {
      const song = {name: file.name.replace(/\.midi?$/i, ''), ...C.parseMidi(await file.arrayBuffer())};
      C.validateSong(song); data = {song, settings: defaults(), takes: []};
    }
    if (S.dirty && !confirm('Replace your current unsaved practice? Cancel to save it first.')) return;
    replaceSession(data.song, data.settings, data.takes); S.dirty = false;
    toast(session ? 'Session loaded: ' + data.takes.length + ' takes.' : 'Reference loaded. Choose the measures you want to practise.');
  } catch (error) { toast(error.message); }
  finally { S.loading = false; event.target.value = ''; refreshControls(); }
}
$('midiFile').onchange = event => importFile(event, false);
$('importFile').onchange = event => importFile(event, true);
for (const id of settingIds) $(id).onchange = () => { S.dirty = !!S.song; renderSection(); };
$('export').onclick = () => {
  if (!S.song) return;
  try {
    const data = {version: 2, song: S.song, settings: currentSettings(), takes: S.takes.map(({at, settings, notes}) => ({at, settings, notes}))};
    const link = node('a'); const url = URL.createObjectURL(new Blob([JSON.stringify(data)], {type: 'application/json'}));
    link.href = url; link.download = (S.song.name.replace(/\W+/g, '-') || 'piano') + '-timing-session.json';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    S.dirty = false; toast('Session download started. Keep the file to restore your practice.');
  } catch (error) { toast(error.message); }
};
$('reset').onclick = () => {
  if (S.takes.length && confirm('Clear every take for this song?')) { S.takes = []; S.dirty = true; renderSection(); }
};
window.addEventListener('beforeunload', event => {
  if (S.dirty || S.recState === 'recording') { event.preventDefault(); event.returnValue = ''; }
});
refreshControls();
