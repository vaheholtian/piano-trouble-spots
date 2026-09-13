'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {EventEmitter, once} = require('node:events');
const {WebSocket} = require('ws');
const {createRelay} = require('./server');

async function fixture(t, options = {}) {
  const opened = [], state = {names: ['Test piano'], fail: false};
  class Input extends EventEmitter {
    getPortCount() { if (state.fail) throw new Error('Synthetic driver failure'); return state.names.length; }
    getPortName(i) { return state.names[i]; }
    openPort(i) { this.index = i; opened.push(this); }
    ignoreTypes() {}
    closePort() { this.closed = true; }
  }
  const relay = createRelay({midi: {Input}, logger: {log() {}, error() {}}, ...options});
  const {port} = await relay.start(0, '127.0.0.1');
  t.after(() => relay.close());
  const origin = 'http://127.0.0.1:' + port, url = 'ws://127.0.0.1:' + port + '/midi';
  const get = (path, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request({hostname: '127.0.0.1', port, path, headers, method}, res => {
      let body = ''; res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body}));
    });
    req.on('error', reject); req.end();
  });
  return {relay, port, origin, url, get, opened, state};
}
const packet = async ws => JSON.parse((await once(ws, 'message'))[0]);
async function rejectConnection(url, options) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, {...options, handshakeTimeout: 2000});
    ws.on('error', () => {});
    ws.on('open', () => { ws.terminate(); reject(new Error('Unauthorized socket opened')); });
    ws.on('unexpected-response', (_req, res) => { res.resume(); ws.terminate(); resolve(res.statusCode); });
  });
}

test('relay serves only its app assets and returns errors for malformed URLs', async t => {
  const f = await fixture(t);
  for (const route of ['/', '/index.html', '/piano-mistake-tracker.html', '/piano-core.js', '/piano-app.js']) {
    const res = await f.get(route); assert.equal(res.status, 200, route);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/);
  }
  for (const route of ['/README.md', '/relay/server.js', '/%2e%2e%2fREADME.md', '/.git/config'])
    assert.equal((await f.get(route)).status, 404, route);
  assert.equal((await f.get('/%ZZ')).status, 400);
  assert.equal((await f.get('/', {}, 'POST')).status, 405);
  assert.equal((await f.get('/', {}, 'HEAD')).body, '');
  assert.equal((await f.get('/')).status, 200, 'still serves requests after invalid input');
});

test('foreign, missing, null, and lookalike origins cannot read any MIDI', async t => {
  const f = await fixture(t);
  for (const origin of [undefined, 'null', 'http://unrelated.example', 'https://127.0.0.1:' + f.port,
    f.origin + '.evil.example', f.origin + '/', f.origin.replace(String(f.port), String(f.port + 1))]) {
    assert.equal(await rejectConnection(f.url, origin === undefined ? {} : {origin}), 403, String(origin));
  }
});

test('matching a forged Host and Origin does not bypass DNS-rebinding protection', async t => {
  const f = await fixture(t), host = 'attacker.example:' + f.port;
  assert.equal((await f.get('/', {Host: host})).status, 403);
  assert.equal(await rejectConnection(f.url, {origin: 'http://' + host, headers: {Host: host}}), 403);
  assert.equal(await rejectConnection(f.url, {origin: f.origin, headers: {Host: '127.0.0.1:' + (f.port + 1)}}), 403);
  assert.equal(await rejectConnection(f.url + '?bypass=1', {origin: f.origin}), 403);
});

test('same-origin client receives driver timing, device changes, and recovery', async t => {
  const f = await fixture(t), ws = new WebSocket(f.url, {origin: f.origin});
  t.after(() => ws.terminate());
  const initial = await packet(ws); assert.equal(initial.ports[0].name, 'Test piano');
  let next = packet(ws); f.opened[0].emit('message', .1, [144, 60, 80]);
  assert.deepEqual(await next, {type: 'midi', id: '0:Test piano', data: [144, 60, 80], t: 100});
  next = packet(ws); f.opened[0].emit('message', .4, [128, 60, 0]); assert.equal((await next).t, 500);
  next = packet(ws); f.state.fail = true; f.relay.rescan();
  assert.deepEqual(await next, {type: 'ports', ports: []}); assert.equal(f.opened[0].closed, true);
  next = packet(ws); f.state.fail = false; f.relay.rescan(); assert.equal((await next).ports.length, 1);
});

test('same-origin localhost hostname works and client data cannot be injected', async t => {
  const f = await fixture(t), host = 'localhost:' + f.port;
  const ws = new WebSocket(f.url, {origin: 'http://' + host, headers: {Host: host}});
  await packet(ws);
  const closing = once(ws, 'close'); ws.send(JSON.stringify({type: 'midi', data: [144, 60, 80]}));
  assert.equal((await closing)[0], 1008);
});

test('server startup reports an occupied port instead of swallowing the error', async t => {
  const f = await fixture(t), other = createRelay({midi: {}});
  t.after(() => other.close());
  await assert.rejects(other.start(f.port, '127.0.0.1'), {code: 'EADDRINUSE'});
});

test('a phone using the printed LAN address is accepted while another address is rejected', async t => {
  const f = await fixture(t, {networkInterfaces: () => ({wifi: [{family: 'IPv4', address: '192.168.1.27'}]})});
  const host = '192.168.1.27:' + f.port;
  assert.equal((await f.get('/', {Host: host})).status, 200);
  const ws = new WebSocket(f.url, {origin: 'http://' + host, headers: {Host: host}});
  assert.equal((await packet(ws)).ports.length, 1); ws.terminate();
  const wrong = '192.168.1.28:' + f.port;
  assert.equal(await rejectConnection(f.url, {origin: 'http://' + wrong, headers: {Host: wrong}}), 403);
});

test('relay emits browser heartbeats and terminates a client that stops answering pings', {timeout: 15000}, async t => {
  const f = await fixture(t), ws = new WebSocket(f.url, {origin: f.origin, autoPong: false});
  await packet(ws);
  const closing = once(ws, 'close');
  assert.deepEqual(await packet(ws), {type: 'heartbeat'});
  assert.equal((await closing)[0], 1006);
});
