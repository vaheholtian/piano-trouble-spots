#!/usr/bin/env node
'use strict';
/* Headless-Chrome end-to-end proof of painting, finalization, detail regeneration, resize,
   same-file reopen, piece switching, reload, Start during a delayed restoration, and an
   unreadable file during live capture (03-01 Task 3; implemented by 03-02).

   Drives real Chrome over the DevTools protocol, exactly like scripts/check-capture-roundtrip.cjs
   and scripts/check-svg-map.cjs, extended with a fake navigator.requestMIDIAccess installed via
   Page.addScriptToEvaluateOnNewDocument plus a page error/unhandledrejection collector
   (window.__pageErrors).

   The scenario is split into ordered groups. Each group collects its own failures and, the
   moment its last assertion passes, prints its one "OK paint: <what>" line before the next
   group starts. The first group with any failure prints one "FAIL paint: " line joining that
   group's failures with " | ", closes Chrome and exits 1 without running later groups -- so an
   earlier OK line stays visible even while a later group still fails (review 03-01 MEDIUM
   round 2). A missing CaptureApp.analysis object, or any other app-side absence, is an
   assertion failure (exit 1), never exit 2.

   Each group's own line is printed with console.log('OK paint: <description>') immediately
   after that group's own assertions pass -- nine such lines once 03-02 lands (one carries an
   apostrophe in its description and is therefore printed via a double-quoted string below, the
   only one of the nine that is).

   Usage: node scripts/check-paint.cjs
   Exit codes: 0 pass, 1 assertion failed (or paint not yet implemented), 2 environment problem. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const url = require('url');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const CHROME_EXE = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEVTOOLS_LINE = /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+)/;

const IDS = {
  C4: 'm1-s1-v1-b0_1-p60',
  D4: 'm1-s1-v1-b1_1-p62',
  E4: 'm1-s1-v1-b2_1-p64',
  F4: 'm1-s1-v1-b3_1-p65',
  G4: 'm1-s1-v1-b4_1-p67',
};

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
  // Page error / unhandledrejection collector, read by the "unreadable file during capture"
  // group (8c) to assert a failed load never surfaces a page error.
  window.__pageErrors = [];
  window.addEventListener('error', (ev) => {
    window.__pageErrors.push('error: ' + (ev.message || String(ev)));
  });
  window.addEventListener('unhandledrejection', (ev) => {
    window.__pageErrors.push('unhandledrejection: ' + (ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason)));
  });
})();
`;

function fillExpr(id) {
  return `(() => {
    if (!window.ScoreRenderer || !ScoreRenderer.state.svgMap) return null;
    const el = ScoreRenderer.state.svgMap.get(${JSON.stringify(id)});
    if (!el) return null;
    return el.children[0].getAttribute('fill');
  })()`;
}

function clickNoteExpression(id) {
  return `(() => {
    const el = ScoreRenderer.state.svgMap.get(${JSON.stringify(id)});
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return true;
  })()`;
}

async function detailText(ws) {
  return evaluate(ws, "document.getElementById('detail') ? document.getElementById('detail').textContent : null");
}

async function headingText(ws) {
  return evaluate(ws, "document.getElementById('analysisHeading') ? document.getElementById('analysisHeading').textContent : null");
}

// Polls CaptureApp.analysis.pendingOrdinals.length === 0 -- the finalization gate every group
// waits on before reading fills or the detail panel (section 5 of docs/analysis-rules.md). A
// missing CaptureApp.analysis is an assertion failure (thrown here), never an environment
// problem -- the caller converts it into a group failure, not an exit-2 crash.
async function waitFinal(ws, timeoutMs) {
  const expression = `(() => {
    if (!window.CaptureApp || !CaptureApp.analysis) return { missing: true };
    return { pending: CaptureApp.analysis.pendingOrdinals.length };
  })()`;
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await evaluate(ws, expression);
    if (last && last.missing) throw new Error('CaptureApp.analysis is missing (paint not implemented yet)');
    if (last && last.pending === 0) return;
    await sleep(100);
  }
  throw new Error('pendingOrdinals did not reach 0 within ' + timeoutMs + 'ms: ' + JSON.stringify(last));
}

function xhrLoadFileExpr(fixturePath) {
  return `(async () => {
    const file = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', ${JSON.stringify(fixturePath)});
      xhr.responseType = 'blob';
      xhr.onload = () => resolve(new File([xhr.response], ${JSON.stringify(fixturePath)}.split('/').pop()));
      xhr.onerror = () => reject(new Error('xhr failed for ' + ${JSON.stringify(fixturePath)}));
      xhr.send();
    });
    await ScoreRenderer.loadPiece(file);
  })()`;
}

async function runGroup(fn) {
  try {
    return await fn();
  } catch (error) {
    return [error && error.message ? error.message : String(error)];
  }
}

// ---- Group implementations ----------------------------------------------------------------

// Step 3: pass 1 = C D F F G, marked as soon as its clicks exist.
async function group3(ws) {
  const failures = [];

  const send1 = await evaluate(ws, `(async () => {
    const deadline = Date.now() + 15000;
    while (CaptureApp.state.clicks.length < 5) {
      if (Date.now() > deadline) throw new Error('clicks did not reach 5 in time');
      await new Promise((r) => setTimeout(r, 2));
    }
    const clicks = CaptureApp.state.clicks;
    const pitches = [60, 62, 65, 65, 67];
    pitches.forEach((note, i) => {
      const t = clicks[i].pageTime;
      window.__fakeMidi.send([0x90, note, 80], t);
      window.__fakeMidi.send([0x80, note, 0], t + 100);
    });
    CaptureApp.mark('spacebar', clicks[4].pageTime + 100);
    return { bar: clicks[0].bar, beat: clicks[0].beat, accent: clicks[0].accent };
  })()`, { awaitPromise: true });

  if (!send1 || send1.bar !== 1 || send1.beat !== 1 || send1.accent !== true) {
    failures.push('pass 1: first click was ' + JSON.stringify(send1) + ', expected bar 1 beat 1 accent true');
    return failures;
  }

  await waitFinal(ws, 10000);

  const fillE = await evaluate(ws, fillExpr(IDS.E4));
  if (fillE !== '#d00000') failures.push('pass 1: fill(E4) was ' + fillE + ', expected #d00000');
  for (const id of [IDS.C4, IDS.D4, IDS.F4, IDS.G4]) {
    const f = await evaluate(ws, fillExpr(id));
    if (f !== '#000000') failures.push('pass 1: fill(' + id + ') was ' + f + ', expected #000000');
  }
  const heading = await headingText(ws);
  if (!heading || !heading.includes('120 BPM')) failures.push('pass 1: #analysisHeading was "' + heading + '", expected to contain "120 BPM"');

  await evaluate(ws, clickNoteExpression(IDS.E4));
  const detail = await detailText(ws);
  const expectedDetail = 'E4, bar 1 beat 3: wrong in 1 of 1 assessed passes (played F4 once)';
  if (detail !== expectedDetail) failures.push('pass 1: #detail was "' + detail + '", expected "' + expectedDetail + '"');

  return failures;
}

// Step 4: pass 2 = C D E F with G omitted, marked before G's click is recorded (the
// finalization / scheduler-horizon case, review 03-02 HIGH).
async function group4(ws) {
  const failures = [];

  const result = await evaluate(ws, `(async () => {
    const deadline = Date.now() + 15000;
    while (CaptureApp.state.clicks.length < 9) {
      if (Date.now() > deadline) throw new Error('clicks did not reach 9 in time');
      await new Promise((r) => setTimeout(r, 2));
    }
    const clicks = CaptureApp.state.clicks;
    const pitches = [60, 62, 64, 65];
    pitches.forEach((note, i) => {
      const t = clicks[5 + i].pageTime;
      window.__fakeMidi.send([0x90, note, 80], t);
      window.__fakeMidi.send([0x80, note, 0], t + 100);
    });
    CaptureApp.mark('spacebar', clicks[8].pageTime + 300);
    return {
      recorded: CaptureApp.state.clicks.length,
      pending: window.CaptureApp && CaptureApp.analysis ? [...CaptureApp.analysis.pendingOrdinals] : null,
      g: window.ScoreRenderer && ScoreRenderer.state.svgMap && ScoreRenderer.state.svgMap.get(${JSON.stringify(IDS.G4)})
        ? ScoreRenderer.state.svgMap.get(${JSON.stringify(IDS.G4)}).children[0].getAttribute('fill')
        : null,
    };
  })()`, { awaitPromise: true });

  if (!result || result.recorded !== 9) failures.push('pass 2: recorded clicks was ' + (result && result.recorded) + ', expected 9');
  if (!result || !Array.isArray(result.pending) || !result.pending.includes(2)) {
    failures.push('pass 2: pendingOrdinals was ' + JSON.stringify(result && result.pending) + ', expected to include 2');
  }
  if (result && result.g === '#0050d0') failures.push('pass 2: fill(G4) was already #0050d0 before finalization');

  await waitFinal(ws, 10000);

  const fillG = await evaluate(ws, fillExpr(IDS.G4));
  if (fillG !== '#0050d0') failures.push('pass 2: fill(G4) was ' + fillG + ', expected #0050d0');
  const fillE = await evaluate(ws, fillExpr(IDS.E4));
  if (fillE !== '#d00000') failures.push('pass 2: fill(E4) was ' + fillE + ', expected #d00000');
  for (const id of [IDS.C4, IDS.D4, IDS.F4]) {
    const f = await evaluate(ws, fillExpr(id));
    if (f !== '#000000') failures.push('pass 2: fill(' + id + ') was ' + f + ', expected #000000');
  }

  const detail = await detailText(ws);
  const expectedDetail = 'E4, bar 1 beat 3: wrong in 1 of 2 assessed passes (played F4 once)';
  if (detail !== expectedDetail) failures.push('pass 2: #detail with no new click was "' + detail + '", expected "' + expectedDetail + '"');

  await evaluate(ws, clickNoteExpression(IDS.G4));
  const detailG = await detailText(ws);
  const expectedDetailG = 'G4, bar 1 beat 5: missed in 1 of 2 assessed passes';
  if (detailG !== expectedDetailG) failures.push('pass 2: #detail for G4 was "' + detailG + '", expected "' + expectedDetailG + '"');

  return failures;
}

// Step 5: pass 3 = clean.
async function group5(ws, ctx) {
  const failures = [];

  await evaluate(ws, `(async () => {
    const deadline = Date.now() + 15000;
    while (CaptureApp.state.clicks.length < 15) {
      if (Date.now() > deadline) throw new Error('clicks did not reach 15 in time');
      await new Promise((r) => setTimeout(r, 2));
    }
    const clicks = CaptureApp.state.clicks;
    const pitches = [60, 62, 64, 65, 67];
    pitches.forEach((note, i) => {
      const t = clicks[10 + i].pageTime;
      window.__fakeMidi.send([0x90, note, 80], t);
      window.__fakeMidi.send([0x80, note, 0], t + 100);
    });
    CaptureApp.mark('spacebar', clicks[14].pageTime + 100);
  })()`, { awaitPromise: true });

  await waitFinal(ws, 10000);

  const detailNoClick = await detailText(ws);
  const expectedNoClick = 'G4, bar 1 beat 5: missed in 1 of 3 assessed passes';
  if (detailNoClick !== expectedNoClick) failures.push('pass 3: #detail with no click was "' + detailNoClick + '", expected "' + expectedNoClick + '"');

  await evaluate(ws, clickNoteExpression(IDS.E4));
  const detailE = await detailText(ws);
  const expectedE = 'E4, bar 1 beat 3: wrong in 1 of 3 assessed passes (played F4 once)';
  if (detailE !== expectedE) failures.push('pass 3: #detail for E4 was "' + detailE + '", expected "' + expectedE + '"');

  await evaluate(ws, clickNoteExpression(IDS.C4));
  const detailC = await detailText(ws);
  const expectedC = 'C4, bar 1 beat 1: played correctly in all 3 assessed passes';
  if (detailC !== expectedC) failures.push('pass 3: #detail for C4 was "' + detailC + '", expected "' + expectedC + '"');

  const snapshot = {};
  for (const id of [IDS.C4, IDS.D4, IDS.E4, IDS.F4, IDS.G4]) {
    snapshot[id] = await evaluate(ws, fillExpr(id));
  }
  ctx.snapshot = snapshot;

  return failures;
}

// Step 6: resize survival (RESEARCH Pitfall 13).
async function group6(ws, ctx) {
  const failures = [];

  await evaluate(ws, `(() => {
    document.getElementById('notation').style.width = '60%';
    window.dispatchEvent(new Event('resize'));
  })()`);

  const deadline = Date.now() + 10000;
  let renderCount = null;
  while (Date.now() < deadline) {
    renderCount = await evaluate(ws, "document.getElementById('status').dataset.renderCount");
    if (renderCount === '2') break;
    await sleep(200);
  }
  if (renderCount !== '2') failures.push('resize: #status renderCount was ' + renderCount + ', expected 2 within 10s');

  for (const id of [IDS.C4, IDS.D4, IDS.E4, IDS.F4, IDS.G4]) {
    const f = await evaluate(ws, fillExpr(id));
    if (f !== ctx.snapshot[id]) failures.push('resize: fill(' + id + ') was ' + f + ', expected ' + ctx.snapshot[id] + ' (snapshot)');
  }
  return failures;
}

// Step 6b: reopen the same file while capture is live (review 03-02 HIGH round 2).
async function group6b(ws, ctx) {
  const failures = [];

  const sid = await evaluate(ws, 'CaptureApp.state.session ? CaptureApp.state.session.id : null');
  ctx.sessionId = sid;

  await evaluate(ws, xhrLoadFileExpr('fixtures/01-right-hand.musicxml'), { awaitPromise: true });

  const deadline = Date.now() + 10000;
  let heading = null;
  let modelMatches = false;
  while (Date.now() < deadline) {
    const check = await evaluate(ws, `(() => ({
      heading: document.getElementById('analysisHeading') ? document.getElementById('analysisHeading').textContent : null,
      modelMatches: !!(window.CaptureApp && CaptureApp.analysis && CaptureApp.analysis.session && CaptureApp.analysis.session.model === ScoreRenderer.state.model),
    }))()`);
    heading = check.heading;
    modelMatches = check.modelMatches;
    if (heading && heading.includes('120 BPM') && modelMatches) break;
    await sleep(200);
  }
  if (!heading || !heading.includes('120 BPM')) failures.push('reopen: #analysisHeading was "' + heading + '", expected to contain "120 BPM"');
  if (!modelMatches) failures.push('reopen: CaptureApp.analysis.session.model did not match ScoreRenderer.state.model within 10s');

  const sidAfter = await evaluate(ws, 'CaptureApp.state.session ? CaptureApp.state.session.id : null');
  if (sidAfter !== sid) failures.push('reopen: CaptureApp.state.session.id was ' + sidAfter + ', expected ' + sid + ' (the same session continued)');

  for (const id of [IDS.C4, IDS.D4, IDS.E4, IDS.F4, IDS.G4]) {
    const f = await evaluate(ws, fillExpr(id));
    if (f !== ctx.snapshot[id]) failures.push('reopen: fill(' + id + ') was ' + f + ', expected ' + ctx.snapshot[id] + ' (snapshot)');
  }

  const detail = await detailText(ws);
  const expectedDetail = 'Click a coloured notehead or a + to see what happened there.';
  if (detail !== expectedDetail) failures.push('reopen: #detail was "' + detail + '", expected "' + expectedDetail + '" (the model change cleared the remembered target)');

  return failures;
}

// Step 7: piece switch mid-session (review 03-02 HIGH).
async function group7(ws, ctx) {
  const failures = [];

  await evaluate(ws, `(() => {
    window.__switchFills = null;
    document.addEventListener('piece-rendered', () => {
      const fills = {};
      for (const [id, el] of ScoreRenderer.state.svgMap) {
        fills[id] = el.children[0].getAttribute('fill');
      }
      window.__switchFills = fills;
    }, { once: true });
  })()`);

  await evaluate(ws, xhrLoadFileExpr('fixtures/03-both-hands.musicxml'), { awaitPromise: true });

  const deadline = Date.now() + 10000;
  let state = null;
  while (Date.now() < deadline) {
    state = await evaluate(ws, `(() => ({
      session: CaptureApp.state.session,
      heading: document.getElementById('analysisHeading') ? document.getElementById('analysisHeading').textContent : null,
    }))()`);
    if (state.session === null && state.heading === 'No session') break;
    await sleep(200);
  }
  if (!state || state.session !== null) failures.push('piece switch: CaptureApp.state.session was ' + JSON.stringify(state && state.session) + ', expected null (session ended by the switch)');
  if (!state || state.heading !== 'No session') failures.push('piece switch: #analysisHeading was "' + (state && state.heading) + '", expected "No session"');

  const switchCheck = await evaluate(ws, `(() => {
    const stale = ['#d00000', '#0050d0', '#b0b0b0'];
    const staleFound = [];
    for (const [id, el] of ScoreRenderer.state.svgMap) {
      const f = el.children[0].getAttribute('fill');
      if (stale.includes(f)) staleFound.push(id + ':' + f);
    }
    return { switchFills: window.__switchFills, staleFound };
  })()`);
  if (switchCheck.switchFills !== null) failures.push('piece switch: window.__switchFills was ' + JSON.stringify(switchCheck.switchFills) + ', expected null (no repaint fired against the new piece)');
  if (switchCheck.staleFound.length > 0) failures.push('piece switch: stale paint found on rung 3: ' + switchCheck.staleFound.join(', '));

  const detailAfterSwitch = await detailText(ws);
  const expectedDetail = 'Click a coloured notehead or a + to see what happened there.';
  if (detailAfterSwitch !== expectedDetail) failures.push('piece switch: #detail after switching was "' + detailAfterSwitch + '", expected "' + expectedDetail + '"');

  await evaluate(ws, xhrLoadFileExpr('fixtures/01-right-hand.musicxml'), { awaitPromise: true });

  const deadline2 = Date.now() + 10000;
  let hasSession = false;
  while (Date.now() < deadline2) {
    hasSession = await evaluate(ws, '!!(window.CaptureApp && CaptureApp.analysis && CaptureApp.analysis.session)');
    if (hasSession) break;
    await sleep(200);
  }
  if (!hasSession) failures.push('piece switch: CaptureApp.analysis.session did not become non-null after reopening rung 1 within 10s');

  await waitFinal(ws, 10000);

  for (const id of [IDS.C4, IDS.D4, IDS.E4, IDS.F4, IDS.G4]) {
    const f = await evaluate(ws, fillExpr(id));
    if (f !== ctx.snapshot[id]) failures.push('piece switch: fill(' + id + ') after replay was ' + f + ', expected ' + ctx.snapshot[id] + ' (snapshot)');
  }

  return failures;
}

// Step 8: reload -- latest session painted identically to the live result.
async function group8(ws, ctx, indexUrl) {
  const failures = [];

  await send(ws, 'Page.navigate', { url: indexUrl });
  const restoreStatus = await pollRestore(ws, 90000);

  const expectedPrefix = '01-right-hand.musicxml: 1 bars, 5 notes, 5/5 noteheads mapped, map OK';
  if (!restoreStatus.text.startsWith(expectedPrefix)) {
    failures.push('reload: status text was "' + restoreStatus.text + '", expected to start with "' + expectedPrefix + '"');
  }

  const deadline = Date.now() + 10000;
  let hasSession = false;
  while (Date.now() < deadline) {
    hasSession = await evaluate(ws, '!!(window.CaptureApp && CaptureApp.analysis && CaptureApp.analysis.session)');
    if (hasSession) break;
    await sleep(200);
  }
  if (!hasSession) failures.push('reload: CaptureApp.analysis.session did not become non-null within 10s');

  await waitFinal(ws, 10000);

  for (const id of [IDS.C4, IDS.D4, IDS.E4, IDS.F4, IDS.G4]) {
    const f = await evaluate(ws, fillExpr(id));
    if (f !== ctx.snapshot[id]) failures.push('reload: fill(' + id + ') was ' + f + ', expected ' + ctx.snapshot[id] + ' (snapshot, live equals replay)');
  }

  await evaluate(ws, clickNoteExpression(IDS.E4));
  const detail = await detailText(ws);
  const expectedDetail = 'E4, bar 1 beat 3: wrong in 1 of 3 assessed passes (played F4 once)';
  if (detail !== expectedDetail) failures.push('reload: #detail for E4 was "' + detail + '", expected "' + expectedDetail + '"');

  return failures;
}

// Step 8b: Start during a delayed restoration (review 03-02 HIGH round 3).
async function group8b(ws, ctx) {
  const failures = [];

  const pid = await evaluate(ws, `(async () => {
    window.__pid = CaptureApp.state.pieceId;
    window.__origReadClicks = Storage.readClicks;
    window.__restoreEntered = false;
    window.__restoreDone = false;
    Storage.readClicks = async (...args) => {
      window.__restoreEntered = true;
      await new Promise((r) => setTimeout(r, 1500));
      const result = await window.__origReadClicks(...args);
      window.__restoreDone = true;
      return result;
    };
    window.__restorePromise = CaptureApp.loadLatestSession(window.__pid, ScoreRenderer.state.model);
    return window.__pid;
  })()`, { awaitPromise: true });
  ctx.pieceId = pid;

  const deadline = Date.now() + 5000;
  let entered = false;
  while (Date.now() < deadline) {
    entered = await evaluate(ws, '!!window.__restoreEntered');
    if (entered) break;
    await sleep(50);
  }
  if (!entered) {
    failures.push('start-during-restore: window.__restoreEntered never became true within 5s');
    return failures;
  }

  await evaluate(ws, "document.getElementById('bpm').value = '120'");
  await evaluate(ws, 'CaptureApp.start()', { awaitPromise: true });

  await evaluate(ws, `(async () => {
    await window.__restorePromise;
    Storage.readClicks = window.__origReadClicks;
  })()`, { awaitPromise: true });

  const deadline2 = Date.now() + 5000;
  let restoreDone = false;
  while (Date.now() < deadline2) {
    restoreDone = await evaluate(ws, '!!window.__restoreDone');
    if (restoreDone) break;
    await sleep(50);
  }
  if (!restoreDone) failures.push('start-during-restore: window.__restoreDone never became true within 5s');
  await sleep(200);

  const check = await evaluate(ws, `(() => ({
    analysisSessionId: window.CaptureApp && CaptureApp.analysis && CaptureApp.analysis.session ? CaptureApp.analysis.session.id : null,
    stateSessionId: CaptureApp.state.session ? CaptureApp.state.session.id : null,
    live: window.CaptureApp && CaptureApp.analysis && CaptureApp.analysis.session ? CaptureApp.analysis.session.live : null,
    heading: document.getElementById('analysisHeading') ? document.getElementById('analysisHeading').textContent : null,
  }))()`);
  if (check.analysisSessionId !== check.stateSessionId) {
    failures.push('start-during-restore: CaptureApp.analysis.session.id (' + check.analysisSessionId + ') did not match CaptureApp.state.session.id (' + check.stateSessionId + ')');
  }
  if (check.live !== true) failures.push('start-during-restore: CaptureApp.analysis.session.live was ' + check.live + ', expected true');
  if (!check.heading || !check.heading.includes('- 0 passes')) failures.push('start-during-restore: #analysisHeading was "' + check.heading + '", expected to contain "- 0 passes"');

  const staleCheck = await evaluate(ws, `(() => {
    const stale = ['#d00000', '#0050d0'];
    const found = [];
    for (const [id, el] of ScoreRenderer.state.svgMap) {
      const f = el.children[0].getAttribute('fill');
      if (stale.includes(f)) found.push(id + ':' + f);
    }
    return found;
  })()`);
  if (staleCheck.length > 0) failures.push('start-during-restore: stale restored paint found on screen: ' + staleCheck.join(', '));

  return failures;
}

// Step 8c: an unreadable file during live capture (review 03-02 HIGH round 3).
async function group8c(ws, ctx) {
  const failures = [];

  await evaluate(ws, `(async () => {
    const deadline = Date.now() + 15000;
    while (CaptureApp.state.clicks.length < 5) {
      if (Date.now() > deadline) throw new Error('clicks did not reach 5 in time');
      await new Promise((r) => setTimeout(r, 2));
    }
    const clicks = CaptureApp.state.clicks;
    const pitches = [60, 62, 65, 65, 67];
    pitches.forEach((note, i) => {
      const t = clicks[i].pageTime;
      window.__fakeMidi.send([0x90, note, 80], t);
      window.__fakeMidi.send([0x80, note, 0], t + 100);
    });
    CaptureApp.mark('spacebar', clicks[4].pageTime + 100);
  })()`, { awaitPromise: true });

  await waitFinal(ws, 10000);

  const fillE = await evaluate(ws, fillExpr(IDS.E4));
  if (fillE !== '#d00000') failures.push('unreadable file: fill(E4) was ' + fillE + ', expected #d00000 before the failed load');

  const sid = await evaluate(ws, 'CaptureApp.state.session ? CaptureApp.state.session.id : null');
  ctx.sessionId = sid;

  await evaluate(ws, 'window.__pageErrors = []');
  await evaluate(ws, "ScoreRenderer.loadPiece(new File(['this is not MusicXML'], 'broken.musicxml'))", { awaitPromise: true });

  const deadline = Date.now() + 5000;
  let sessionNull = false;
  while (Date.now() < deadline) {
    sessionNull = await evaluate(ws, 'CaptureApp.state.session === null');
    if (sessionNull) break;
    await sleep(100);
  }
  if (!sessionNull) failures.push('unreadable file: CaptureApp.state.session did not become null within 5s');

  const n = await evaluate(ws, 'CaptureApp.state.clicks.length');
  await sleep(1500);
  const nAfter = await evaluate(ws, 'CaptureApp.state.clicks.length');
  if (nAfter !== n) failures.push('unreadable file: click count changed from ' + n + ' to ' + nAfter + ', expected the metronome to have stopped');

  const pageErrors = await evaluate(ws, 'window.__pageErrors ? window.__pageErrors.length : -1');
  if (pageErrors !== 0) failures.push('unreadable file: window.__pageErrors had ' + pageErrors + ' entries, expected 0');

  const statusText = await evaluate(ws, "document.getElementById('status').textContent");
  if (statusText !== 'No piece loaded') failures.push('unreadable file: #status was "' + statusText + '", expected "No piece loaded"');

  const heading = await headingText(ws);
  if (heading !== 'No session') failures.push('unreadable file: #analysisHeading was "' + heading + '", expected "No session"');

  const analysisCheck = await evaluate(ws, `(() => ({
    id: window.CaptureApp && CaptureApp.analysis && CaptureApp.analysis.session ? CaptureApp.analysis.session.id : null,
    live: window.CaptureApp && CaptureApp.analysis && CaptureApp.analysis.session ? CaptureApp.analysis.session.live : null,
  }))()`);
  if (analysisCheck.id !== sid) failures.push('unreadable file: CaptureApp.analysis.session.id was ' + analysisCheck.id + ', expected ' + sid + ' (the ended session is retained)');
  if (analysisCheck.live !== false) failures.push('unreadable file: CaptureApp.analysis.session.live was ' + analysisCheck.live + ', expected false');

  const endReason = await evaluate(ws, `(async () => {
    const sessions = await Storage.listSessionsForPiece(CaptureApp.state.db, ${JSON.stringify(ctx.pieceId)});
    const s = sessions.find((x) => x.id === ${JSON.stringify(sid)});
    return s ? s.endReason : null;
  })()`, { awaitPromise: true });
  if (endReason !== 'piece-unloaded') failures.push('unreadable file: stored session endReason was ' + endReason + ', expected piece-unloaded');

  await evaluate(ws, xhrLoadFileExpr('fixtures/01-right-hand.musicxml'), { awaitPromise: true });

  const deadline2 = Date.now() + 10000;
  let recovered = false;
  while (Date.now() < deadline2) {
    recovered = await evaluate(ws, `(() => !!(window.CaptureApp && CaptureApp.analysis && CaptureApp.analysis.session && CaptureApp.analysis.session.id === ${JSON.stringify(sid)} && CaptureApp.analysis.session.model === ScoreRenderer.state.model))()`);
    if (recovered) break;
    await sleep(200);
  }
  if (!recovered) failures.push('unreadable file: CaptureApp.analysis.session did not recover to id ' + sid + ' with the reopened model within 10s');

  await waitFinal(ws, 10000);

  const fillEAfter = await evaluate(ws, fillExpr(IDS.E4));
  if (fillEAfter !== '#d00000') failures.push('unreadable file: fill(E4) after recovery was ' + fillEAfter + ', expected #d00000');

  const headingAfter = await headingText(ws);
  if (!headingAfter || !headingAfter.includes('1 pass')) failures.push('unreadable file: #analysisHeading after recovery was "' + headingAfter + '", expected to contain "1 pass"');

  return failures;
}

// ---- Orchestration --------------------------------------------------------------------------

async function main() {
  if (!fs.existsSync(CHROME_EXE)) {
    console.log('FAIL paint: Chrome not found at ' + CHROME_EXE + '; set CHROME_EXE');
    process.exit(2);
  }

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piano-mistakes-paint-'));
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

  let ws = null;

  async function cleanupAndExit(code) {
    try {
      if (ws) ws.close();
    } catch {
      // ignore -- Chrome may already be gone
    }
    try {
      child.kill();
    } catch {
      // ignore
    }
    await sleep(500);
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // ignore -- OS temp-dir cleanup will reclaim this eventually
    }
    process.exit(code);
  }

  try {
    let browserWsUrl;
    try {
      browserWsUrl = await waitForDevToolsUrl(child, 20000);
    } catch (error) {
      console.log('FAIL paint: ' + error.message);
      await cleanupAndExit(2);
      return;
    }

    const target = await findPageTarget(browserWsUrl);
    if (!target) {
      console.log('FAIL paint: no page target found');
      await cleanupAndExit(2);
      return;
    }

    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });

    await send(ws, 'Page.enable');
    await send(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: FAKE_MIDI_INIT_SCRIPT });

    await send(ws, 'Page.navigate', { url: fixtureUrl });
    await pollCapture(ws, 90000);

    await evaluate(ws, "document.getElementById('bpm').value = '120'");

    const sessionId = await evaluate(ws, 'CaptureApp.start()', { awaitPromise: true });
    if (typeof sessionId !== 'number') {
      console.log('FAIL paint: CaptureApp.start() did not return a session id: ' + JSON.stringify(sessionId));
      await cleanupAndExit(1);
      return;
    }

    const audioState = await evaluate(ws, 'CaptureApp.state.audioState');
    if (audioState !== 'running') {
      console.log('FAIL paint: AudioContext state ' + audioState + ' in headless Chrome (check the autoplay flag)');
      await cleanupAndExit(2);
      return;
    }

    const ctx = { pieceId: await evaluate(ws, 'CaptureApp.state.pieceId'), sessionId, snapshot: null };
    let failures;

    failures = await runGroup(() => group3(ws));
    if (failures.length > 0) {
      console.log('FAIL paint: ' + failures.join(' | '));
      await cleanupAndExit(1);
      return;
    }
    console.log('OK paint: wrong E4 painted red on the notehead child after a mark');

    failures = await runGroup(() => group4(ws));
    if (failures.length > 0) {
      console.log('FAIL paint: ' + failures.join(' | '));
      await cleanupAndExit(1);
      return;
    }
    console.log('OK paint: a pass marked before its last click existed is judged once the timeline covers it');

    failures = await runGroup(() => group5(ws, ctx));
    if (failures.length > 0) {
      console.log('FAIL paint: ' + failures.join(' | '));
      await cleanupAndExit(1);
      return;
    }
    console.log('OK paint: aggregate and detail sentences over three passes, regenerated after each pass');

    failures = await runGroup(() => group6(ws, ctx));
    if (failures.length > 0) {
      console.log('FAIL paint: ' + failures.join(' | '));
      await cleanupAndExit(1);
      return;
    }
    console.log('OK paint: colours survive a resize re-render');

    failures = await runGroup(() => group6b(ws, ctx));
    if (failures.length > 0) {
      console.log('FAIL paint: ' + failures.join(' | '));
      await cleanupAndExit(1);
      return;
    }
    console.log('OK paint: reopening the same file during capture keeps painting the live session');

    failures = await runGroup(() => group7(ws, ctx));
    if (failures.length > 0) {
      console.log('FAIL paint: ' + failures.join(' | '));
      await cleanupAndExit(1);
      return;
    }
    console.log("OK paint: switching pieces never paints one piece's marks on another");

    failures = await runGroup(() => group8(ws, ctx, indexUrl));
    if (failures.length > 0) {
      console.log('FAIL paint: ' + failures.join(' | '));
      await cleanupAndExit(1);
      return;
    }
    console.log('OK paint: latest session painted on reload identical to the live result');

    failures = await runGroup(() => group8b(ws, ctx));
    if (failures.length > 0) {
      console.log('FAIL paint: ' + failures.join(' | '));
      await cleanupAndExit(1);
      return;
    }
    console.log('OK paint: starting a session during a delayed restoration keeps the live session on screen');

    failures = await runGroup(() => group8c(ws, ctx));
    if (failures.length > 0) {
      console.log('FAIL paint: ' + failures.join(' | '));
      await cleanupAndExit(1);
      return;
    }
    console.log('OK paint: an unreadable file during capture ends the session cleanly and its passes return with the piece');

    await cleanupAndExit(0);
  } catch (error) {
    console.log('FAIL paint: ' + (error && error.stack ? error.stack : String(error)));
    await cleanupAndExit(1);
  }
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(2);
});
