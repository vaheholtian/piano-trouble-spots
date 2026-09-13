#!/usr/bin/env node
'use strict';
/* Headless-Chrome developer evidence that every ladder note maps to its own notehead (D-11),
   including after a resize re-render. Drives real Chrome over the DevTools protocol -- this is
   the gate that finds a mapping defect at the desk, before the piano session.
   Usage: node scripts/check-svg-map.cjs [fixture ...]
   With no arguments, scans fixtures/ for names matching /^0\d-.*\.(musicxml|xml|mxl)$/.
   Exit codes: 0 pass, 1 mapping verdict failed, 2 environment problem. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const url = require('url');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const CHROME_EXE = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEVTOOLS_LINE = /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+)/;
const STATUS_RE = /^(.+): (\d+) bars, (\d+) notes, (\d+)\/(\d+) noteheads mapped, map OK$/;

function resolveFixtures(argv) {
  if (argv.length > 0) return argv;
  const fixturesDir = path.join(root, 'fixtures');
  if (!fs.existsSync(fixturesDir)) return [];
  return fs
    .readdirSync(fixturesDir)
    .filter((name) => /^0\d-.*\.(musicxml|xml|mxl)$/.test(name))
    .sort()
    .map((name) => 'fixtures/' + name);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDevToolsUrl(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      child.stderr.removeListener('data', onData);
      reject(new Error('no DevTools line within ' + timeoutMs + 'ms'));
    }, timeoutMs);
    function onData(chunk) {
      buffer += chunk.toString();
      const match = buffer.match(DEVTOOLS_LINE);
      if (match) {
        clearTimeout(timer);
        child.stderr.removeListener('data', onData);
        resolve(match[1]);
      }
    }
    child.stderr.on('data', onData);
  });
}

async function findPageTarget(browserWsUrl) {
  // The browser-level WebSocket endpoint accepts Target/Browser domain commands; the simplest
  // path to the page's own debugger URL is the HTTP /json/list endpoint on the same port.
  const port = new URL(browserWsUrl).port;
  const list = await fetch('http://127.0.0.1:' + port + '/json/list').then((r) => r.json());
  return list.find((t) => t.type === 'page');
}

function evaluate(ws, expression) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    // Node's global WebSocket fires WHATWG-style MessageEvents: the payload is `event.data`,
    // not the event object itself.
    const onMessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data.toString());
      } catch {
        return;
      }
      if (msg.id !== id) return;
      ws.removeEventListener('message', onMessage);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result && msg.result.result ? msg.result.result.value : null);
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  });
}

async function pollStatus(ws, timeoutMs) {
  const expression = `(() => {
    const el = document.getElementById('status');
    if (!el) return null;
    return { check: el.dataset.check || '', renderCount: el.dataset.renderCount || '', problems: el.dataset.problems || '', text: el.textContent };
  })()`;
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await evaluate(ws, expression);
    if (last && (last.check === 'done' || last.check === 'error')) return last;
    await sleep(250);
  }
  throw new Error('page did not finish: check=' + (last ? last.check : '') + ' status=' + (last ? last.text : ''));
}

async function checkFixture(fixture) {
  if (!fs.existsSync(CHROME_EXE)) {
    return { fixture, env: true, message: 'Chrome not found at ' + CHROME_EXE + '; set CHROME_EXE' };
  }

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piano-mistakes-chrome-'));
  const pageUrl = url.pathToFileURL(path.join(root, 'index.html')).href +
    '?fixture=' + encodeURIComponent(fixture) + '&resize=1';

  const child = spawn(CHROME_EXE, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--allow-file-access-from-files',
    '--user-data-dir=' + profileDir,
    '--window-size=1400,900',
    '--remote-debugging-port=0',
    pageUrl,
  ]);

  let result;
  try {
    let browserWsUrl;
    try {
      browserWsUrl = await waitForDevToolsUrl(child, 20000);
    } catch (error) {
      return { fixture, env: true, message: error.message };
    }

    const target = await findPageTarget(browserWsUrl);
    if (!target) {
      return { fixture, env: true, message: 'no page target found' };
    }

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });

    let status;
    try {
      status = await pollStatus(ws, 90000);
    } catch (error) {
      return { fixture, env: true, message: error.message };
    }
    ws.close();

    if (status.check === 'error') {
      return { fixture, env: true, message: 'page reported check=error: ' + status.text };
    }

    const match = status.text.match(STATUS_RE);
    const mapped = match ? Number(match[4]) : 0;
    const total = match ? Number(match[5]) : 0;
    const pass = Boolean(match) && status.renderCount === '2' && total > 0 && mapped === total;

    result = { fixture, env: false, pass, text: status.text, problems: status.problems, renderCount: status.renderCount };
  } finally {
    child.kill();
    // Windows can hold the profile dir's files locked for a moment after the process is
    // signalled; cleanup is best-effort and must never mask the actual verdict above.
    await sleep(500);
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // ignore — OS temp-dir cleanup will reclaim this eventually
    }
  }
  return result;
}

async function main() {
  const fixtures = resolveFixtures(process.argv.slice(2));
  if (fixtures.length === 0) {
    console.error('no fixtures to check');
    process.exit(2);
  }

  let anyEnvProblem = false;
  let anyFail = false;

  for (const fixture of fixtures) {
    const result = await checkFixture(fixture);
    if (result.env) {
      console.log('FAIL ' + fixture + ': ' + result.message);
      anyEnvProblem = true;
      continue;
    }
    if (result.pass) {
      console.log('OK ' + fixture + ': ' + result.text);
    } else {
      console.log('FAIL ' + fixture + ': ' + result.text + ' | ' + result.problems);
      anyFail = true;
    }
  }

  if (anyEnvProblem) process.exit(2);
  process.exit(anyFail ? 1 : 0);
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(2);
});
