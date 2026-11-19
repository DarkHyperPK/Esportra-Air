// Still pictures for list cards: only Air's own preview pages, kept in memory and on disk, never a blank picture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Thumbnails, pruneStills } from '../src/main/thumbnails.ts';

const PAGE = 'http://127.0.0.1:5300/overlays/ingame.html?preview=1';
const PNG = `data:image/png;base64,${'A'.repeat(200)}`;

test('only Air preview pages on this PC are rendered', async () => {
  let calls = 0;
  const t = new Thumbnails(async () => { calls++; return PNG; });
  assert.equal(await t.get('https://example.com/overlays/ingame.html'), null);
  assert.equal(await t.get('http://127.0.0.1:5300/api/secret'), null);
  assert.equal(calls, 0);
  assert.equal(await t.get(PAGE), PNG);
});

test('a picture is rendered once, then served from memory', async () => {
  let calls = 0;
  const t = new Thumbnails(async () => { calls++; return PNG; });
  await Promise.all([t.get(PAGE, 'k'), t.get(PAGE, 'k')]);
  await t.get(PAGE, 'k');
  assert.equal(calls, 1);
});

test('a blank or failed picture is null, logged, and tried again next time', async () => {
  const logged: string[] = [];
  let n = 0;
  const t = new Thumbnails(async () => (n++ === 0 ? 'data:image/png;base64,' : PNG), { log: (_u, e) => logged.push(String(e)) });
  assert.equal(await t.get(PAGE), null);
  assert.equal(logged.length, 1);
  assert.equal(await t.get(PAGE), PNG);
});

test('pictures kept on disk are used before rendering', async () => {
  const kept = new Map<string, string>();
  let calls = 0;
  const store = { read: (id: string) => kept.get(id) ?? null, write: (id: string, d: string) => void kept.set(id, d) };
  await new Thumbnails(async () => { calls++; return PNG; }, { store }).get(PAGE, 'a');
  assert.equal(kept.size, 1);
  assert.equal(await new Thumbnails(async () => { calls++; return PNG; }, { store }).get(PAGE, 'a'), PNG);
  assert.equal(calls, 1);
});

test('pruneStills keeps the newest pictures', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stills-'));
  for (let i = 0; i < 5; i++) {
    const f = join(dir, `${i}.png`);
    writeFileSync(f, 'x');
    utimesSync(f, 1000 + i, 1000 + i);
  }
  pruneStills(dir, 2);
  assert.deepEqual(readdirSync(dir).sort(), ['3.png', '4.png']);
});
