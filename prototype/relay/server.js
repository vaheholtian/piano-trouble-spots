'use strict';
// LAN-only MIDI relay. The page and WebSocket must use this server's own address.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {WebSocketServer} = require('ws');
const ROOT = path.resolve(__dirname, '..');
const FILES = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'],
  ['/piano-mistake-tracker.html', 'piano-mistake-tracker.html'],
  ['/piano-core.js', 'piano-core.js'], ['/piano-app.js', 'piano-app.js']
]);

function createRelay({midi, logger = console, networkInterfaces = os.networkInterfaces} = {}) {
  const inputs = new Map();
  let scanner, scanTimer, heartbeatTimer;
  const ports = () => [...inputs.values()].map(({id, name}) => ({id, name}));
  // Origin compared with an arbitrary Host alone permits DNS rebinding. Only
  // actual local addresses and this computer's hostname may address this service.
  function ownOrigin(req) {
    const host = req.headers.host;
    if (typeof host !== 'string') return null;
    try {
      const url = new URL('http://' + host);
      if (url.host !== host.toLowerCase() || url.username || url.password) return null;
      const names = new Set(['localhost', '127.0.0.1', '[::1]', os.hostname().toLowerCase()]);
      for (const list of Object.values(networkInterfaces())) for (const a of list || [])
        names.add(a.family === 'IPv6' ? '[' + a.address.toLowerCase() + ']' : a.address);
      if (!names.has(url.hostname) || Number(url.port || 80) !== server.address()?.port) return null;
      return url.origin;
    } catch { return null; }
  }
  const server = http.createServer((req, res) => {
    const fail = (code, message) => { res.writeHead(code); res.end(message); };
    const origin = ownOrigin(req);
    if (!origin) return fail(403, 'Forbidden host');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD'); return fail(405, 'Method not allowed');
    }
    let name;
    try { name = decodeURIComponent(new URL(req.url, 'http://relay').pathname); }
    catch { return fail(400, 'Invalid URL'); }
    const file = FILES.get(name);
    if (!file) return fail(404, 'Not found');
    fs.readFile(path.join(ROOT, file), (error, data) => {
      if (error) return fail(404, 'Not found');
      res.writeHead(200, {
        'Content-Type': file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' " + origin.replace('http:', 'ws:') + "; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
  const wss = new WebSocketServer({noServer: true, maxPayload: 1024});
  server.on('upgrade', (req, socket, head) => {
    const origin = ownOrigin(req);
    // No fallback for missing or "null" Origin: browser clients always provide it.
    if (!origin || req.headers.origin !== origin || req.url !== '/midi') {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  function send(client, text) {
    if (client.readyState !== 1) return;
    // Drop stalled consumers instead of buffering piano events indefinitely.
    if (client.bufferedAmount > 64 * 1024) { client.terminate(); return; }
    client.send(text, error => { if (error) client.terminate(); });
  }
  function broadcast(message) {
    const text = JSON.stringify(message);
    for (const client of wss.clients) send(client, text);
  }
  function closeInput(input) {
    input.removeAllListeners('message');
    try { input.closePort(); } catch {} // Vanished hardware may not close cleanly.
  }
  function rescan() {
    try {
      scanner ||= new midi.Input();
      const wanted = [];
      for (let index = 0; index < scanner.getPortCount(); index++) {
        const name = scanner.getPortName(index); wanted.push({id: index + ':' + name, name, index});
      }
      let changed = false;
      for (const [id, entry] of inputs) if (!wanted.some(w => w.id === id)) {
        closeInput(entry.input); inputs.delete(id); changed = true;
        logger.log('MIDI input gone: ' + entry.name);
      }
      for (const w of wanted) if (!inputs.has(w.id)) {
        let input;
        try {
          input = new midi.Input(); input.ignoreTypes(true, true, true);
          let clock = 0;
          input.on('message', (delta, data) => {
            if (!Number.isFinite(delta) || delta < 0) return;
            clock += delta * 1000;
            broadcast({type: 'midi', id: w.id, data, t: clock});
          });
          input.openPort(w.index); inputs.set(w.id, {...w, input}); changed = true;
          logger.log('MIDI input open: ' + w.name);
        } catch (error) {
          if (input) closeInput(input);
          logger.error('Could not open ' + w.name + ': ' + error.message);
        }
      }
      if (changed) broadcast({type: 'ports', ports: ports()});
    } catch (error) {
      for (const entry of inputs.values()) closeInput(entry.input);
      inputs.clear(); broadcast({type: 'ports', ports: []});
      logger.error('MIDI scan failed: ' + error.message);
    }
  }
  wss.on('connection', ws => {
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('error', () => ws.terminate());
    ws.on('message', () => ws.close(1008, 'This relay only sends MIDI.'));
    send(ws, JSON.stringify({type: 'ports', ports: ports()}));
  });
  async function start(port = 8765, host = '0.0.0.0') {
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer between 0 and 65535.');
    midi ||= require('@julusian/midi');
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.off('error', reject); resolve(); });
    });
    rescan(); scanTimer = setInterval(rescan, 1000);
    heartbeatTimer = setInterval(() => {
      for (const ws of wss.clients) {
        if (!ws.alive) { ws.terminate(); continue; }
        ws.alive = false; ws.ping();
      }
      broadcast({type: 'heartbeat'});
    }, 5000);
    return server.address();
  }
  async function close() {
    clearInterval(scanTimer); clearInterval(heartbeatTimer);
    for (const entry of inputs.values()) closeInput(entry.input);
    inputs.clear(); if (scanner) closeInput(scanner);
    for (const ws of wss.clients) ws.terminate();
    await new Promise(resolve => wss.close(resolve));
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
  return {server, start, close, rescan};
}

if (require.main === module) {
  const relay = createRelay();
  relay.start(Number(process.env.PORT || process.argv[2] || 8765)).then(({port}) => {
    console.log('Trouble spots relay. Open one of these on your phone:');
    console.log('  http://localhost:' + port + '/ (this computer)');
    for (const list of Object.values(os.networkInterfaces())) for (const a of list || [])
      if (a.family === 'IPv4' && !a.internal) console.log('  http://' + a.address + ':' + port + '/');
  }).catch(error => { console.error('Relay could not start: ' + error.message); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    relay.close().catch(error => { console.error(error.message); process.exitCode = 1; });
  });
}
module.exports = {createRelay};
