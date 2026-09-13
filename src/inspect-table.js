/* D-12: the user's tool for checking the model against the sheet at the piano. Renders the
   plain score model (never an OSMD object) as a plain, readable table. Classic script so it
   opens directly from disk (D-13). */
'use strict';
globalThis.InspectTable = (() => {
  const $ = (id) => document.getElementById(id);

  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }

  // Round to 3 decimal places so 0, 1.5, 2.5, 0.75 read plainly with no float noise.
  function fmtBeats(r) {
    return String(Math.round(r.beats * 1000) / 1000);
  }

  function render(model, svgMap, svgRefs) {
    $('noteRows').replaceChildren();

    if (!model) {
      $('inspectSummary').textContent = 'Notes';
      return;
    }

    let mapped = 0;
    model.notes.forEach((note, i) => {
      const row = node('tr');
      row.append(
        node('td', String(i + 1)),
        node('td', String(note.measure)),
        node('td', String(note.staff)),
        node('td', String(note.voice)),
        node('td', fmtBeats(note.onset)),
        node('td', fmtBeats(note.duration)),
        node('td', note.pitch.name),
        node('td', String(note.pitch.midi)),
        node('td', note.tiedNoteCount > 1 ? 'tied x' + note.tiedNoteCount : '-'),
      );
      // The Notehead cell is the D-11 completeness proof: a fingerprint string
      // `<staveNoteId>#<index>` so two notes of one chord visibly show the same
      // stave-note id with different indexes, and a mapping defect that sends two
      // pitches to one notehead shows identical fingerprints.
      if (svgMap.has(note.id)) {
        row.append(node('td', svgRefs.get(note.id)));
        mapped += 1;
      } else {
        row.append(node('td', 'MISSING', 'missing'));
      }
      $('noteRows').append(row);
    });

    const total = model.notes.length;
    let summary = total + ' notes - ' + mapped + ' of ' + total + ' noteheads mapped';
    if (mapped < total) summary += ' - MISSING ' + (total - mapped);
    $('inspectSummary').textContent = summary;
  }

  return { render, fmtBeats, node };
})();
