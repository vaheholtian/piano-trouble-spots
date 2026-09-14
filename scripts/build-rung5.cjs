#!/usr/bin/env node
'use strict';
/* Reproducible ladder rung 5 build (D-06): exports the user's MuseScore file with the
   MuseScore 4 CLI into a temp directory, trims trailing empty measures if the source has
   not been trimmed in MuseScore itself, exports the compressed .mxl from the (trimmed)
   .musicxml, validates both outputs, and only then replaces the committed fixtures. A
   failed run never leaves fixtures/ half-refreshed — the temp dir is left in place for
   inspection instead.
   Usage: node scripts/build-rung5.cjs
   Env overrides: MUSESCORE_EXE, RUNG5_SOURCE */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const MUSESCORE_EXE = process.env.MUSESCORE_EXE || 'C:\\Program Files\\MuseScore 4\\bin\\MuseScore4.exe';
const SOURCE = process.env.RUNG5_SOURCE;
if (!SOURCE) {
  console.error(
    'RUNG5_SOURCE env var is not set. Set it to the absolute path of the MuseScore ' +
    'source file (e.g. RUNG5_SOURCE="C:\\path\\to\\Yanni - 4 measures.mscz") and re-run.'
  );
  process.exit(1);
}
const OUT_XML = path.resolve(__dirname, '..', 'fixtures', '05-yanni-4-measures.musicxml');
const OUT_MXL = path.resolve(__dirname, '..', 'fixtures', '05-yanni-4-measures.mxl');

const EXPECTED_MEASURES = 4;
const EXPECTED_PITCHES = 41;

function trimTrailingEmptyMeasures(xml) {
  // Tolerant of extra attributes on <measure ...> (e.g. width="..."), non-greedy body match.
  const measureRe = /<measure\b[^>]*>[\s\S]*?<\/measure>/g;
  const measures = xml.match(measureRe) || [];
  let removed = 0;
  const kept = [];
  let stillTrimming = true;
  for (let i = measures.length - 1; i >= 0; i--) {
    const block = measures[i];
    if (stillTrimming && !block.includes('<pitch>')) {
      removed += 1;
      continue;
    }
    stillTrimming = false;
    kept.unshift(block);
  }
  if (removed === 0) {
    return { xml, removed: 0 };
  }
  // Rebuild the XML by removing the trimmed measure blocks from the tail, preserving
  // everything else (part-list, attributes, closing tags) exactly as MuseScore wrote it.
  let result = xml;
  const trimmedBlocks = measures.slice(measures.length - removed);
  for (const block of trimmedBlocks) {
    result = result.replace(block, '');
  }
  return { xml: result, removed, keptCount: kept.length };
}

function main() {
  console.log('Step 1: export .musicxml from ' + SOURCE);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rung5-'));
  const TMP_XML = path.join(work, '05-yanni-4-measures.musicxml');
  const TMP_MXL = path.join(work, '05-yanni-4-measures.mxl');

  try {
    execFileSync(MUSESCORE_EXE, ['-f', '-o', TMP_XML, SOURCE], { stdio: 'inherit' });
  } catch (error) {
    console.error('MuseScore export failed (exe: ' + MUSESCORE_EXE + '): ' + error.message);
    process.exit(1);
  }

  console.log('Step 2: trim trailing empty measures (D-06 fallback)');
  const xmlBefore = fs.readFileSync(TMP_XML, 'utf8');
  const { xml: xmlAfter, removed } = trimTrailingEmptyMeasures(xmlBefore);
  if (removed > 0) {
    fs.writeFileSync(TMP_XML, xmlAfter, 'utf8');
    const totalMeasuresBefore = (xmlBefore.match(/<measure\b/g) || []).length;
    const firstTrimmed = totalMeasuresBefore - removed + 1;
    console.log(
      'Trimmed ' + removed + ' trailing empty measures (bars ' + firstTrimmed + '-' + totalMeasuresBefore + '). ' +
      'Preferred fix: delete those bars in MuseScore and save, then re-run; this step is then a no-op.'
    );
  } else {
    console.log('No trailing empty measures; source already trimmed.');
  }

  console.log('Step 3: export compressed .mxl from the (trimmed) .musicxml');
  try {
    execFileSync(MUSESCORE_EXE, ['-f', '-o', TMP_MXL, TMP_XML], { stdio: 'inherit' });
  } catch (error) {
    console.error('MuseScore .mxl export failed: ' + error.message);
    process.exit(1);
  }

  console.log('Step 4: validate before touching fixtures/');
  const finalXml = fs.readFileSync(TMP_XML, 'utf8');
  const measureCount = (finalXml.match(/<measure\b/g) || []).length;
  const pitchCount = (finalXml.match(/<pitch>/g) || []).length;
  const mxlBytes = fs.readFileSync(TMP_MXL);
  const firstTwoBytes = mxlBytes.slice(0, 2).toString('utf8');
  console.log('measures=' + measureCount + ' pitches=' + pitchCount + ' mxlSignature=' + JSON.stringify(firstTwoBytes));

  if (measureCount !== EXPECTED_MEASURES || pitchCount !== EXPECTED_PITCHES || firstTwoBytes !== 'PK') {
    console.error('Validation failed; fixtures/ untouched; inspect ' + work);
    process.exit(1);
  }

  console.log('Step 5: replace fixtures/ with the validated outputs');
  fs.copyFileSync(TMP_XML, OUT_XML);
  fs.copyFileSync(TMP_MXL, OUT_MXL);
  console.log('Replaced fixtures/05-yanni-4-measures.musicxml and .mxl');
  try {
    fs.rmSync(work, { recursive: true, force: true });
  } catch {
    // best-effort — OS temp-dir cleanup will reclaim this eventually
  }
}

main();
