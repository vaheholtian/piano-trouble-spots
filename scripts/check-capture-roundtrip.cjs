#!/usr/bin/env node
'use strict';
/* Headless-Chrome end-to-end proof that one recording of raw MIDI survives a reload (D-13, D-17,
   D-18, CAPT-01, CAPT-05, HIST-01). Drives real Chrome over the DevTools protocol, exactly like
   scripts/check-svg-map.cjs, extended with a fake navigator.requestMIDIAccess installed via
   Page.addScriptToEvaluateOnNewDocument (the raw-CDP equivalent of Playwright's addInitScript()).
   Usage: node scripts/check-capture-roundtrip.cjs
   Exit codes: 0 pass, 1 assertion failed, 2 environment problem. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const url = require('url');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const CHROME_EXE = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEVTOOLS_LINE = /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+)/;

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
  const port = new URL(browserWsUrl).port;
  const list = await fetch('http://127.0.0.1:' + port + '/json/list').then((r) => r.json());
  return list.find((t) => t.type === 'page');
}

// Node's global WebSocket fires WHATWG-style MessageEvents: the payload is `event.data`, not
// the event object itself (see scripts/check-svg-map.cjs's own note on this).
function send(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
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
      else resolve(msg.result);
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

async function evaluate(ws, expression, opts) {
  const params = { expression, returnByValue: true };
  if (opts && opts.awaitPromise) params.awaitPromise = true;
  const result = await send(ws, 'Runtime.evaluate', params);
  if (result && result.exceptionDetails) {
    throw new Error('page threw: ' + JSON.stringify(result.exceptionDetails));
  }
  return result && result.result ? result.result.value : null;
}

async function pollCapture(ws, timeoutMs) {
  const expression = `(() => {
    const el = document.getElementById('status');
    if (!el) return null;
    return {
      check: el.dataset.check || '',
      capture: el.dataset.capture || '',
      restore: el.dataset.restore || '',
      text: el.textContent,
    };
  })()`;
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await evaluate(ws, expression);
    if (last && last.check === 'error') {
      throw new Error('page reported check=error: ' + last.text);
    }
    if (last && last.check === 'done' && last.capture === 'ready') return last;
    await sleep(250);
  }
  throw new Error('page did not finish loading: ' + JSON.stringify(last));
}

async function pollRestore(ws, timeoutMs) {
  const expression = `(() => {
    const el = document.getElementById('status');
    if (!el) return null;
    return { restore: el.dataset.restore || '', capture: el.dataset.capture || '', text: el.textContent };
  })()`;
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await evaluate(ws, expression);
    if (last && last.restore === 'error') {
      throw new Error('page reported restore=error: ' + last.text);
    }
    if (last && last.restore === 'done' && last.capture === 'ready') return last;
    await sleep(250);
  }
  throw new Error('page did not finish restoring: ' + JSON.stringify(last));
}

const FAKE_MIDI_INIT_SCRIPT = `
(function() {
  const fakeInput = {
    id: 'fake-fp60x',
    name: 'Fake FP-60X',
    manufacturer: 'Roland',
    state: 'connected',
    onmidimessage: null,
  };
  window.__fakeMidi = {
    input: fakeInput,
    send(bytes, timeStamp) {
      if (fakeInput.onmidimessage) {
        fakeInput.onmidimessage({ data: new Uint8Array(bytes), timeStamp });
      }
    },
  };
  navigator.requestMIDIAccess = () => Promise.resolve({
    inputs: new Map([[fakeInput.id, fakeInput]]),
    outputs: new Map(),
    sysexEnabled: false,
    onstatechange: null,
  });
})();
`;

async function main() {
  if (!fs.existsSync(CHROME_EXE)) {
    console.log('FAIL capture round-trip: Chrome not found at ' + CHROME_EXE + '; set CHROME_EXE');
    process.exit(2);
  }

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piano-mistakes-capture-'));
  const indexUrl = url.pathToFileURL(path.join(root, 'index.html')).href;
  const fixtureUrl = indexUrl + '?fixture=fixtures/01-right-hand.musicxml';

  const child = spawn(CHROME_EXE, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--allow-file-access-from-files',
    '--autoplay-policy=no-user-gesture-required',
    '--user-data-dir=' + profileDir,
    '--window-size=1400,900',
    '--remote-debugging-port=0',
    'about:blank',
  ]);

  let exitCode = 2;
  try {
    let browserWsUrl;
    try {
      browserWsUrl = await waitForDevToolsUrl(child, 20000);
    } catch (error) {
      console.log('FAIL capture round-trip: ' + error.message);
      exitCode = 2;
      return;
    }

    const target = await findPageTarget(browserWsUrl);
    if (!target) {
      console.log('FAIL capture round-trip: no page target found');
      exitCode = 2;
      return;
    }

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });

    await send(ws, 'Page.enable');
    await send(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: FAKE_MIDI_INIT_SCRIPT });

    await send(ws, 'Page.navigate', { url: fixtureUrl });
    await pollCapture(ws, 90000);

    const sessionId = await evaluate(ws, 'CaptureApp.start()', { awaitPromise: true });
    if (typeof sessionId !== 'number') {
      console.log('FAIL capture round-trip: CaptureApp.start() did not return a session id: ' + JSON.stringify(sessionId));
      exitCode = 1;
      return;
    }

    const sendExpression = `(() => {
      const t = performance.now();
      window.__fakeMidi.send([0x90, 60, 100], t);
      window.__fakeMidi.send([0x80, 60, 64], t + 150);
      window.__fakeMidi.send([0x90, 62, 90], t + 400);
      window.__fakeMidi.send([0x90, 64, 80], t + 400);
      window.__fakeMidi.send([0xB0, 64, 127], t + 500);
      window.__fakeMidi.send([0x90, 62, 0], t + 600);
      window.__fakeMidi.send([0x80, 64, 50], t + 650);
      window.__fakeMidi.send([0xF8], t + 700);
      return t;
    })()`;
    const t = await evaluate(ws, sendExpression);

    await evaluate(ws, 'CaptureApp.flush()', { awaitPromise: true });

    const liveState = await evaluate(ws, `(() => ({
      liveCount: document.getElementById('liveCount').textContent,
      midiState: document.getElementById('midiState').textContent,
    }))()`);

    const failures = [];
    if (liveState.liveCount !== '3') failures.push('liveCount was ' + liveState.liveCount + ', expected 3');
    if (liveState.midiState !== 'Connected: Fake FP-60X') {
      failures.push('midiState was "' + liveState.midiState + '", expected "Connected: Fake FP-60X"');
    }

    await evaluate(ws, 'CaptureApp.stop()', { awaitPromise: true });

    await send(ws, 'Page.navigate', { url: indexUrl });
    const restoreStatus = await pollRestore(ws, 90000);

    const expectedPrefix = '01-right-hand.musicxml: 1 bars, 5 notes, 5/5 noteheads mapped, map OK';
    if (!restoreStatus.text.startsWith(expectedPrefix)) {
      failures.push('status text after reload was "' + restoreStatus.text + '", expected to start with "' + expectedPrefix + '"');
    }

    const restored = await evaluate(ws, 'CaptureApp.state.restored');
    const restoredSession = restored && restored.sessions && restored.sessions.find((s) => s.id === sessionId);
    if (!restoredSession) {
      failures.push('CaptureApp.state.restored.sessions did not contain session ' + sessionId + ': ' + JSON.stringify(restored));
    } else {
      if (restoredSession.endReason !== 'stop') failures.push('restored session endReason was ' + restoredSession.endReason + ', expected stop');
      if (restoredSession.eventCount !== 8) failures.push('restored session eventCount was ' + restoredSession.eventCount + ', expected 8');
    }

    const readBackExpr = `(async () => {
      const db = await Storage.open();
      return await Storage.readRawEvents(db, ${JSON.stringify(sessionId)});
    })()`;
    const events = await evaluate(ws, readBackExpr, { awaitPromise: true });

    if (!Array.isArray(events) || events.length !== 8) {
      failures.push('readRawEvents returned ' + (Array.isArray(events) ? events.length : typeof events) + ' records, expected 8');
    } else {
      const expectedRaw = [
        [144, 60, 100],
        [128, 60, 64],
        [144, 62, 90],
        [144, 64, 80],
        [176, 64, 127],
        [144, 62, 0],
        [128, 64, 50],
        [248],
      ];
      const expectedTimeStamps = [t, t + 150, t + 400, t + 400, t + 500, t + 600, t + 650, t + 700];
      const expectedTypes = ['noteon', 'noteoff', 'noteon', 'noteon', 'control', 'noteoff', 'noteoff', 'other'];

      events.forEach((event, i) => {
        if (event.seq !== i) failures.push('record ' + i + ' has seq ' + event.seq + ', expected ' + i);
        if (JSON.stringify(event.raw) !== JSON.stringify(expectedRaw[i])) {
          failures.push('record ' + i + ' raw was ' + JSON.stringify(event.raw) + ', expected ' + JSON.stringify(expectedRaw[i]));
        }
        if (event.timeStamp !== expectedTimeStamps[i]) {
          failures.push('record ' + i + ' timeStamp was ' + event.timeStamp + ', expected ' + expectedTimeStamps[i]);
        }
        if (event.type !== expectedTypes[i]) {
          failures.push('record ' + i + ' type was ' + event.type + ', expected ' + expectedTypes[i]);
        }
      });
      if (events[4] && (events[4].controller !== 64 || events[4].value !== 127)) {
        failures.push('record 4 controller/value was ' + events[4].controller + '/' + events[4].value + ', expected 64/127');
      }
    }

    ws.close();

    if (failures.length > 0) {
      console.log('FAIL capture round-trip: ' + failures.join(' | '));
      exitCode = 1;
    } else {
      console.log('OK capture round-trip: 8 raw events restored unmodified, piece restored from stored bytes');
      exitCode = 0;
    }
  } catch (error) {
    console.log('FAIL capture round-trip: ' + (error && error.stack ? error.stack : String(error)));
    exitCode = exitCode === 2 ? 2 : 1;
  } finally {
    child.kill();
    await sleep(500);
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // ignore -- OS temp-dir cleanup will reclaim this eventually
    }
  }
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(2);
});
