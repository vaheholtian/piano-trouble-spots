/* Painting: writes analysis-result colours directly onto the SVG elements src/score-renderer.js
   already mapped (S.svgMap), without touching OSMD's renderer or triggering a re-render (D-17).
   Mirrors OSMD 2.1.2's own internal VexFlowGraphicalNote.setColor(): `fill` is set on each
   notehead's *children*, never the container element itself (RESEARCH Pattern 5) -- the leaf
   VexFlow `<path>` already carries its own explicit `fill`, so setting it on the parent alone
   has no visible effect. Reads svgMap only; never assigns into it. No top-level access to
   `document`. Classic script so index.html opens directly from disk (D-13).
*/
'use strict';
globalThis.Paint = (() => {
  const COLOURS = { wrong: '#d00000', missed: '#0050d0', clean: '#000000', untested: '#b0b0b0', extra: '#d00000' };

  // noteKinds: { noteId: 'wrong'|'missed'|'clean'|'untested' } (Aggregate.viewForTempoGroup /
  // viewForPass). Missing noteIds (not on the currently rendered page) are skipped, never thrown.
  function paintNotes(svgMap, noteKinds) {
    for (const [noteId, kind] of Object.entries(noteKinds)) {
      const el = svgMap.get(noteId);
      if (!el) continue;
      const color = COLOURS[kind] || COLOURS.untested;
      for (const child of el.children) child.setAttribute('fill', color);
    }
  }

  // Resets every mapped notehead back to the default (unannotated) black -- used when there is
  // no session to paint (a piece switch, or capture just started with 0 passes).
  function resetAll(svgMap) {
    for (const el of svgMap.values()) {
      for (const child of el.children) child.setAttribute('fill', COLOURS.clean);
    }
  }

  function clearExtras(overlayEl) {
    if (overlayEl) overlayEl.replaceChildren();
  }

  // Clears and returns an empty list in this plan; glyph positioning (Research A1) is deferred
  // to plan 03-04 -- this signature exists now so no capture-app call site changes later.
  function paintExtras(overlayEl, svgMap, model, glyphs, onGlyphClick) {
    clearExtras(overlayEl);
    return [];
  }

  return { COLOURS, paintNotes, resetAll, clearExtras, paintExtras };
})();

if (typeof module !== 'undefined') module.exports = globalThis.Paint;
