const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { load, quiet } = require('./helpers.cjs');

test('real HTTP rejection retains a signed record; retry acknowledges the same identity', async t => {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    requests.push({ route: request.url, authorization: request.headers.authorization, body: JSON.parse(Buffer.concat(chunks)) });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(requests.length === 1 ? { accepted: 0, rejected: 1 } : { accepted: 1, rejected: 0 }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esportra-air-delivery-test-'));
  t.after(() => {
    assert.equal(path.dirname(dir), os.tmpdir()); assert.ok(path.basename(dir).startsWith('esportra-air-delivery-test-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const Queue = load('offline-queue.js', { electron: { app: { getPath: () => dir } } });
  const queue = new Queue({ nodeToken: 'fixture-token', logger: quiet });
  queue.enqueue({ type: 'BroadcastEvent', event: { showId: '5e182c34-49f8-40d3-bf6c-88b576c20c45', type: 'SegmentTake', ts: 1700000000000, data: { segmentId: 'segment-1' } } });
  const apiBase = `http://127.0.0.1:${server.address().port}`;
  const Hub = load('hub-client.js'), client = new Hub({ hubUrl: apiBase + '/hubs/broadcast', apiBase, offlineQueue: queue, logger: quiet });
  client._connected = true; client._nodeToken = 'fixture-token';
  await client._drainQueue();
  assert.ok(fs.readFileSync(path.join(dir, 'offline-queue.ndjson'), 'utf8').trim());
  await client._drainQueue();
  assert.equal(fs.readFileSync(path.join(dir, 'offline-queue.ndjson'), 'utf8'), '');
  assert.equal(requests[0].route, '/api/broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/events/drain');
  assert.equal(requests[0].authorization, 'Bearer fixture-token');
  assert.equal(requests[0].body.events[0].eventId, requests[1].body.events[0].eventId);
  assert.equal(requests[1].body.events[0].payload.segmentId, 'segment-1');
});
