const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WebSocketServer } = require('ws');
const { discoverOBS, allowedOBSHost } = require('../src/obs-discovery');
test('OBS discovery reads Hello without exposing its authentication material', async t => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { for (const socket of server.clients) socket.terminate(); await new Promise(resolve => server.close(resolve)); });
  server.on('connection', socket => socket.send(JSON.stringify({ op: 0, d: { rpcVersion: 1, obsStudioVersion: '32.0.0', authentication: { challenge: 'synthetic-challenge', salt: 'synthetic-salt' } } })));
  const result = await discoverOBS(server.address().port);
  assert.equal(result.found, true); assert.equal(result.passwordRequired, true);
  assert.equal(JSON.stringify(result).includes('synthetic'), false);
});
test('remote OBS validation accepts private IPv4 only and rejects DNS/public endpoints', () => {
  assert.equal(allowedOBSHost('192.168.1.10').valid, true);
  assert.equal(allowedOBSHost('172.16.0.10').valid, true);
  for (const host of ['example.com', '8.8.8.8', '172.32.0.10', '127.0.0.2', '192.168.0.256']) assert.equal(allowedOBSHost(host).valid, false);
});
