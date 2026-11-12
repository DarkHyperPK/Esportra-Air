import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArtCache, catalogueArt } from '../src/main/art-cache.ts';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('picture')]);
const A = '41fb69c1-4189-7b37-f117-bcaf1e96f1bf';
const B = '5f8d3a7f-467b-97f3-062c-13acf203c006';
const W = '9c82e19d-4575-0200-1a81-3eacf00cf872';

test('the real catalogue lists every agent, weapon and map picture once', () => {
  const art = catalogueArt(readFileSync(new URL('../../../esportra-valorant-hud/core/catalog.js', import.meta.url), 'utf8'));
  assert.ok(art.length > 200, String(art.length));
  assert.equal(new Set(art).size, art.length);
  assert.ok(art.every((p) => /^((agents|weapons|maps|gear)\/[0-9a-f-]{36}|agents\/[0-9a-f-]{36}\/abilities\/[a-z0-9]+)\/[a-z]+\.png$/.test(p)));
  assert.ok(art.some((p) => p.includes('/abilities/ultimate/')), 'ability icons are included');
  assert.deepEqual(catalogueArt('"https://media.valorant-api.com/agents/../../etc/passwd.png" "https://evil.example/agents/x.png"'), []);
});

test('downloads missing pictures, skips ones already here, refuses non-PNGs and retries failures', async () => {
  const served: string[] = [];
  let bOk = false;
  const server = createServer((req, res) => {
    served.push(req.url!);
    if (req.url === `/agents/${A}/displayicon.png`) return res.writeHead(200, { 'content-type': 'image/png' }).end(PNG);
    if (req.url === `/agents/${B}/displayicon.png`) return bOk ? res.writeHead(200, { 'content-type': 'image/png' }).end(PNG) : res.writeHead(503).end();
    if (req.url === `/weapons/${W}/displayicon.png`) return res.writeHead(200, { 'content-type': 'text/html' }).end('<html>');
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  const dir = mkdtempSync(join(tmpdir(), 'air-art-'));
  const catalogue = join(dir, 'catalog.js');
  const remote = (p: string) => `https://media.valorant-api.com/${p}`;
  writeFileSync(catalogue, `window.VCAT=${JSON.stringify({ a: remote(`agents/${A}/displayicon.png`), b: remote(`agents/${B}/displayicon.png`), w: remote(`weapons/${W}/displayicon.png`), dup: remote(`agents/${A}/displayicon.png`), already: remote(`maps/${A}/splash.png`) })};`);
  const art = join(dir, 'art');
  mkdirSync(join(art, 'maps', A), { recursive: true });
  writeFileSync(join(art, 'maps', A, 'splash.png'), PNG);
  const cache = new ArtCache({ catalogue, dir: art, origin, retryMs: 50 });
  const changes: number[] = [];
  cache.on('change', () => changes.push(cache.status.have));
  try {
    await cache.download();
    assert.deepEqual([cache.status.total, cache.status.have, cache.status.downloading], [4, 2, false]);
    assert.match(cache.status.lastError ?? '', /503|not a PNG/);
    assert.ok(existsSync(join(art, 'agents', A, 'displayicon.png')));
    assert.ok(!existsSync(join(art, 'weapons', W, 'displayicon.png')), 'a non-PNG is never stored');
    assert.ok(!served.some((u) => u.startsWith('/maps/')), 'a picture already here is not fetched');
    assert.ok(changes.length > 0, 'progress is reported');
    // The art host comes back: the retry fills in what was missing (the HTML one stays refused).
    bOk = true;
    await new Promise((r) => setTimeout(r, 200));
    await cache.download();
    assert.equal(cache.status.have, 3);
    assert.ok(existsSync(join(art, 'agents', B, 'displayicon.png')));
  } finally {
    cache.stop();
    server.close();
  }
});

test('a picture the art server does not have (404) is named, counted apart and not retried', async () => {
  let asked = 0;
  const server = createServer((req, res) => {
    if (req.url === `/agents/${B}/killfeedportrait.png`) { asked++; return res.writeHead(404).end(); }
    res.writeHead(200, { 'content-type': 'image/png' }).end(PNG);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  const dir = mkdtempSync(join(tmpdir(), 'air-art404-'));
  const catalogue = join(dir, 'catalog.js');
  const remote = (p: string) => `https://media.valorant-api.com/${p}`;
  writeFileSync(catalogue, `window.VCAT={"agents":{"BREACH":{"uuid":"${B}","name":"Breach","icon":"${remote(`agents/${B}/displayicon.png`)}","kf":"${remote(`agents/${B}/killfeedportrait.png`)}"}}};`);
  const cache = new ArtCache({ catalogue, dir: join(dir, 'art'), origin, retryMs: 20 });
  try {
    await cache.download();
    assert.deepEqual([cache.status.total, cache.status.have, cache.status.lastError], [2, 1, null], 'a 404 is not a connection problem');
    assert.deepEqual(cache.status.unavailable, ['Breach · kill feed']);
    await new Promise((r) => setTimeout(r, 80));
    await cache.download();
    assert.equal(asked, 1, 'not asked for again');
  } finally {
    cache.stop();
    server.close();
  }
});
