const { test } = require('node:test');
const assert = require('node:assert/strict');
const Monitor = require('../src/node-session-monitor');

test('only confirmed node invalidation clears pairing; offline/legacy failures do not', async () => {
  let response = { status: 503 }, revoked = 0;
  const monitor = new Monitor({ apiBase: 'https://fixture.invalid', token: 'fixture', fetch: async () => response, onRevoked: async () => { revoked++; } });
  monitor.stopped = false;
  await monitor.check(); response = { status: 404 }; await monitor.check();
  response = { status: 401, json: async () => ({ error: 'proxy_auth' }) }; await monitor.check();
  assert.equal(revoked, 0);
  response = { status: 401, json: async () => ({ error: 'node_not_active' }) }; await monitor.check();
  assert.equal(revoked, 1); assert.equal(monitor.stopped, true);
  await monitor.check(); assert.equal(revoked, 1);
});

test('a stale response cannot revoke a newly replaced node session', async () => {
  let finish, revoked = 0;
  const monitor = new Monitor({ apiBase: 'https://fixture.invalid', token: 'fixture', fetch: () => new Promise(resolve => { finish = resolve; }), onRevoked: async () => { revoked++; } });
  monitor.stopped = false;
  const check = monitor.check(); monitor.stop();
  finish({ status: 401, json: async () => ({ error: 'node_not_active' }) });
  await check; assert.equal(revoked, 0);
});
