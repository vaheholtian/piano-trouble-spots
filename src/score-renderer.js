/* File open, OSMD render, per-notehead noteId to SVG map, verifySvgMap self-check, resize
   re-render, and the ?fixture= dev hook used only by scripts/check-svg-map.cjs. Classic script,
   opens directly from disk (D-13). The table renders the plain model only — this file never
   hands an OSMD object to inspect-table.js. */
'use strict';
const OSMD = globalThis.opensheetmusicdisplay;
const $ = (id) => document.getElementById(id);

const S = {
  osmd: null,
  model: null,
  sourceNotes: null,
  svgMap: null,
  svgRefs: null,
  problems: [],
  renderCount: 0,
  loading: false,
  fileName: '',
};

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    $('toast').hidden = true;
  }, 6500);
}

function setStatus(text) {
  $('status').textContent = text;
}

async function loadPiece(file) {
  S.loading = true;
  setStatus('Loading ' + file.name + '...');
  try {
    $('notation').replaceChildren();
    const osmd = new OSMD.OpenSheetMusicDisplay($('notation'), { autoResize: false });
    await osmd.load(file); // File is a Blob; OSMD reads it binary and detects .mxl internally
    S.osmd = osmd;
    S.fileName = file.name;
    S.renderCount = 0;
    S.sourceNotes = new Map();
    S.model = ScoreModel.extract(osmd.Sheet, {
      onNote: (modelNote, sourceNote) => S.sourceNotes.set(modelNote.id, sourceNote),
    });
    renderAndMap();
    document.dispatchEvent(new CustomEvent('piece-loaded', { detail: { file, model: S.model } }));
  } catch (error) {
    S.osmd = null;
    S.model = null;
    S.sourceNotes = null;
    S.svgMap = null;
    S.svgRefs = null;
    S.problems = [];
    $('notation').replaceChildren();
    InspectTable.render(null, new Map(), new Map());
    setStatus('No piece loaded');
    toast('Could not open ' + file.name + ': ' + (error instanceof Error ? error.message : String(error)));
    document.dispatchEvent(new CustomEvent('piece-unloaded'));
  } finally {
    S.loading = false;
  }
}

async function openFile(event) {
  const file = event.target.files[0];
  if (!file || S.loading) {
    event.target.value = ''; // reset even on the ignored path, so re-selecting the same
    return;                  // file (the retry) still fires a change event
  }
  try {
    await loadPiece(file);
  } finally {
    event.target.value = ''; // so re-selecting the same file fires change again
  }
}

// Each pitch's own vf-notehead group, never the enclosing stave-note group VexFlow shares
// between every note of a chord. gNote.vfnoteIndex is the position OSMD assigned after
// sorting the chord's notes ascending by halfTone.
function buildSvgMap() {
  const map = new Map();
  const refs = new Map();
  for (const [id, note] of S.sourceNotes) {
    const gNote = S.osmd.EngravingRules.GNote(note);
    if (!gNote) continue;
    const heads = gNote.getNoteheadSVGs();
    const el = heads && heads[gNote.vfnoteIndex];
    if (el && el.isConnected) {
      map.set(id, el);
      refs.set(id, gNote.getSVGId() + '#' + gNote.vfnoteIndex);
    }
  }
  S.svgMap = map;
  S.svgRefs = refs;
  return map;
}

// Developer evidence the mapping is trustworthy: completeness, distinct targets, notehead
// class, and correct chord y-order by pitch (geometry, not bookkeeping).
function verifySvgMap() {
  const problems = [];
  const elementToId = new Map();

  for (const note of S.model.notes) {
    if (!S.svgMap.has(note.id)) {
      problems.push('MISSING ' + note.id);
      continue;
    }
    const el = S.svgMap.get(note.id);
    const firstId = elementToId.get(el);
    if (firstId) {
      problems.push('duplicate target: ' + firstId + ' and ' + note.id);
    } else {
      elementToId.set(el, note.id);
    }
    if (!el.classList.contains('vf-notehead')) {
      problems.push('not a notehead: ' + note.id);
    }
  }

  const chords = new Map();
  for (const note of S.model.notes) {
    if (!S.svgRefs.has(note.id)) continue;
    const staveNoteId = S.svgRefs.get(note.id).split('#')[0];
    if (!chords.has(staveNoteId)) chords.set(staveNoteId, []);
    chords.get(staveNoteId).push(note);
  }
  for (const notes of chords.values()) {
    if (notes.length < 2) continue;
    const byPitch = [...notes].sort((a, b) => a.pitch.midi - b.pitch.midi);
    for (let i = 1; i < byPitch.length; i++) {
      const lower = byPitch[i - 1];
      const higher = byPitch[i];
      const lowerTop = S.svgMap.get(lower.id).getBoundingClientRect().top;
      const higherTop = S.svgMap.get(higher.id).getBoundingClientRect().top;
      if (higherTop > lowerTop) {
        problems.push('chord order: ' + lower.id + ' is drawn above ' + higher.id);
      }
    }
  }

  return problems;
}

function renderAndMap() {
  S.osmd.render();
  S.renderCount += 1;
  buildSvgMap();
  S.problems = verifySvgMap();
  InspectTable.render(S.model, S.svgMap, S.svgRefs);

  const counts = S.fileName + ': ' + S.model.measures.length + ' bars, ' + S.model.notes.length +
    ' notes, ' + S.svgMap.size + '/' + S.model.notes.length + ' noteheads mapped, ';
  const verdict = S.problems.length === 0 ? 'map OK' : 'map FAIL (' + S.problems.length + '): ' + S.problems[0];
  setStatus(counts + verdict);
  if (S.problems.length > 0) {
    for (const problem of S.problems) console.error(problem);
    toast(S.problems[0]);
  }

  // Invisible to the user; this is what the headless developer check reads.
  $('status').dataset.renderCount = String(S.renderCount);
  $('status').dataset.problems = S.problems.join('; ');

  // Fired after buildSvgMap() so any repaint listener always sees the freshly rebuilt map
  // (Phase 3 D-17; fires on every load and on the debounced resize re-render).
  document.dispatchEvent(new CustomEvent('piece-rendered', { detail: { renderCount: S.renderCount } }));
}

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    // D-16: re-render and rebuild the map from the retained source notes; the model is not
    // re-extracted.
    if (S.osmd && S.model && !S.loading) renderAndMap();
  }, 150);
});

// Dev hook used only by scripts/check-svg-map.cjs; a normal double-click has no query string
// and this code does nothing.
function devLoadFixture(fixturePath, resize) {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', fixturePath);
  xhr.responseType = 'blob';
  xhr.onload = async () => {
    try {
      const file = new File([xhr.response], fixturePath.split('/').pop());
      await loadPiece(file);
      if (resize) {
        $('notation').style.width = '60%';
        window.dispatchEvent(new Event('resize'));
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      $('status').dataset.check = 'done';
    } catch (error) {
      $('status').dataset.check = 'error';
      setStatus('Dev check: could not read ' + fixturePath);
    }
  };
  xhr.onerror = () => {
    $('status').dataset.check = 'error';
    setStatus('Dev check: could not read ' + fixturePath);
  };
  xhr.send();
}

globalThis.ScoreRenderer = { state: S, loadPiece, buildSvgMap, verifySvgMap, renderAndMap };

if (!OSMD) {
  setStatus('OpenSheetMusicDisplay did not load - connect to the internet once and reload');
  $('pieceFile').disabled = true;
  $('status').dataset.check = 'error';
} else {
  $('pieceFile').addEventListener('change', openFile);
  $('copyJson').onclick = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(S.model, null, 2));
      toast('Model copied');
    } catch (error) {
      toast(error.message);
    }
  };

  const params = new URLSearchParams(location.search);
  const fixture = params.get('fixture');
  if (fixture) devLoadFixture(fixture, params.get('resize') === '1');
}
