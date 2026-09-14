#!/usr/bin/env node
'use strict';
/* Shell-neutral static gates for the file:// run path (index.html and src/). Runs identically
   from PowerShell, cmd, or Git Bash -- one Node script instead of a grep/test chain, because the
   verification environment is not guaranteed to be Bash. Optional --fixtures gate checks the
   ladder files are tracked and README documents Run. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const results = [];

function ok(gate) {
  results.push({ gate, pass: true });
}

function fail(gate, detail) {
  results.push({ gate, pass: false, detail });
}

function readFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function stripHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

const OSMD_CDN_URL = 'https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@2.1.2/build/opensheetmusicdisplay.min.js';
const IDB_CDN_URL = 'https://cdn.jsdelivr.net/npm/idb@8.0.3/build/umd.js';
const EXPECTED_LOCAL_SCRIPTS = [
  'src/score-model.js',
  'src/inspect-table.js',
  'src/score-renderer.js',
  'src/clock.js',
  'src/metronome.js',
  'src/midi-capture.js',
  'src/storage.js',
  'src/capture-app.js',
];

function checkIndexHtml() {
  const raw = readFile('index.html');
  const html = stripHtmlComments(raw);

  const moduleScripts = html.match(/<script\b[^>]*type\s*=\s*"module"[^>]*>/gi) || [];
  if (moduleScripts.length === 0) ok('index.html has no type="module" script tags');
  else fail('index.html has no type="module" script tags', moduleScripts.length + ' found');

  const cdnOccurrences = (html.match(new RegExp(OSMD_CDN_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  if (cdnOccurrences === 1) ok('exactly one pinned OSMD CDN URL');
  else fail('exactly one pinned OSMD CDN URL', cdnOccurrences + ' occurrences');

  const idbCdnOccurrences = (html.match(new RegExp(IDB_CDN_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  if (idbCdnOccurrences === 1) ok('exactly one pinned idb CDN URL');
  else fail('exactly one pinned idb CDN URL', idbCdnOccurrences + ' occurrences');

  const localScriptMatches = [...html.matchAll(/<script\s+src="(src\/[a-z-]+\.js)"/gi)].map((m) => m[1]);
  const inOrder = localScriptMatches.length === EXPECTED_LOCAL_SCRIPTS.length &&
    EXPECTED_LOCAL_SCRIPTS.every((expected, i) => localScriptMatches[i] === expected);
  if (inOrder) ok('local script tags in dependency order');
  else fail('local script tags in dependency order', JSON.stringify(localScriptMatches));

  const requiredMarkers = [
    'accept=".musicxml,.xml,.mxl"',
    'id="pieceFile"',
    'id="status"',
    'id="noteRows"',
    'id="midiInput"',
    'id="startStop"',
    'id="liveCount"',
    'id="sessionList"',
    'id="bpm"',
    'id="readout"',
  ];
  for (const marker of requiredMarkers) {
    if (html.includes(marker)) ok('index.html contains ' + marker);
    else fail('index.html contains ' + marker, 'not found');
  }
}

function checkSourceFile(relativePath) {
  const absolute = path.join(root, relativePath);
  try {
    execFileSync(process.execPath, ['--check', absolute], { stdio: 'pipe' });
    ok(relativePath + ' is syntactically valid');
  } catch (error) {
    fail(relativePath + ' is syntactically valid', error.message);
    return;
  }

  const lines = fs.readFileSync(absolute, 'utf8').split('\n');
  const esmLines = lines.filter((line) => /^\s*(import|export)\s/.test(line));
  if (esmLines.length === 0) ok(relativePath + ' has no ES-module syntax');
  else fail(relativePath + ' has no ES-module syntax', esmLines.join(' | '));
}

function checkFixtures() {
  const fixtureFiles = [
    'fixtures/01-right-hand.musicxml',
    'fixtures/02-left-hand.xml',
    'fixtures/03-both-hands.musicxml',
    'fixtures/04-chords.musicxml',
    'fixtures/05-yanni-4-measures.musicxml',
    'fixtures/05-yanni-4-measures.mxl',
    'test/fixtures/tie.musicxml',
    'fixtures/README.md',
  ];
  for (const file of fixtureFiles) {
    try {
      execFileSync('git', ['ls-files', '--error-unmatch', file], { cwd: root, stdio: 'pipe' });
      ok(file + ' is tracked');
    } catch (error) {
      fail(file + ' is tracked', 'untracked or missing');
    }
  }

  const readme = readFile('README.md');
  if (/## Run/.test(readme)) ok('README.md documents Run');
  else fail('README.md documents Run', 'no "## Run" heading found');
}

checkIndexHtml();
for (const file of EXPECTED_LOCAL_SCRIPTS) checkSourceFile(file);
if (process.argv.includes('--fixtures')) checkFixtures();

let failed = 0;
for (const result of results) {
  if (result.pass) {
    console.log('ok: ' + result.gate);
  } else {
    failed += 1;
    console.log('FAIL: ' + result.gate + ' - ' + result.detail);
  }
}
console.log(results.length + ' gates, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
