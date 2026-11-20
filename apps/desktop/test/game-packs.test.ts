// Game packs: the manifest is checked, files are downloaded once, checked against their checksum, kept on disk,
// resumed after a failure, and a new version fetches only what changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GamePacks, type PackOffer } from '../src/main/game-packs.ts';
import { validAsset, validManifest, packPath } from '../src/shared/game-assets.ts';

const png = (seed: string) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(seed.repeat(40))]);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const fileOf = (b: Buffer) => ({ sha256: sha(b), ext: 'png' as const, bytes: b.length });

function pack(version: string, pictures: Record<string, Buffer>) {
  const assets = Object.entries(pictures).map(([id, b]) => ({ id, kind: id.startsWith('logo') ? 'logo-esports' : 'character', name: id, w: 100, h: 100, file: fileOf(b) }));
  const urls = Object.fromEntries(Object.values(pictures).map((b) => [sha(b), `https://packs.test/${sha(b)}`]));
  const bodies = new Map(Object.values(pictures).map((b) => [`https://packs.test/${sha(b)}`, b]));
  return { offer: { manifest: { game: 'pubgm', version, assets }, urls } as PackOffer, bodies };
}

test('a manifest is checked: game, version, checksums, kinds; logos never come from the producer', () => {
  const ok = { game: 'pubgm', version: '2026.1', assets: [{ id: 'a', kind: 'map', name: 'Erangel', w: 2048, h: 2048, file: { sha256: 'a'.repeat(64), ext: 'jpg', bytes: 10 } }] };
  assert.equal(validManifest(ok).assets[0]!.source, 'kit');
  assert.throws(() => validManifest({ ...ok, game: '../x' }), /names no game/);
  assert.throws(() => validManifest({ ...ok, assets: [{ ...ok.assets[0], file: { sha256: 'x', ext: 'png', bytes: 1 } }] }), /checksum/);
  assert.throws(() => validManifest({ ...ok, assets: [{ ...ok.assets[0], file: { sha256: 'a'.repeat(64), ext: 'svg', bytes: 1 } }] }), /PNG, JPEG or WebP/);
  assert.throws(() => validAsset({ ...ok.assets[0], kind: 'logo-ci' }, 'mine'), /only come from the official pack/);
  assert.equal(packPath('pubgm', { sha256: 'b'.repeat(64), ext: 'png', bytes: 1 }), `/packs/pubgm/${'b'.repeat(64)}.png`);
});

test('a pack downloads once, checks every file, keeps the manifest, and a new version fetches only changes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'packs-'));
  const A = png('a'), B = png('b'), C = png('c');
  let current = pack('1', { hero: A, logo: B });
  const fetched: string[] = [];
  let failNext = 0;
  const fetchFn = (async (url: string) => {
    if (failNext > 0) { failNext--; return new Response('no', { status: 503 }); }
    fetched.push(url);
    const body = current.bodies.get(url);
    return body ? new Response(new Uint8Array(body)) : new Response('missing', { status: 404 });
  }) as unknown as typeof fetch;
  const packs = new GamePacks({ dir, offer: async () => current.offer, fetch: fetchFn, retryMs: 10_000_000 });

  // A failure keeps the pack incomplete and says why; nothing half-done is kept as the manifest.
  failNext = 1;
  await packs.sync('pubgm');
  assert.match(packs.statusOf('pubgm').waiting ?? '', /1 picture still to download/);
  assert.equal(existsSync(join(dir, 'pubgm', 'manifest.json')), false);
  // Resume: only the missing file is fetched.
  fetched.length = 0;
  await packs.sync('pubgm');
  assert.equal(fetched.length, 1);
  assert.deepEqual({ ...packs.statusOf('pubgm'), waiting: packs.statusOf('pubgm').waiting }, { game: 'pubgm', version: '1', total: 2, have: 2, downloading: false, waiting: null });
  assert.equal(packs.assets('pubgm').length, 2);

  // A new version with one new picture downloads just that one.
  current = pack('2', { hero: A, logo: B, crate: C });
  fetched.length = 0;
  await packs.sync('pubgm');
  assert.deepEqual(fetched, [`https://packs.test/${sha(C)}`]);
  assert.equal(packs.manifest('pubgm')?.version, '2');

  // Another Air start reads the pack from disk without the network.
  const offline = new GamePacks({ dir, offer: async () => { throw new Error('Esportra is not reachable from this PC.'); } });
  await offline.load('pubgm');
  assert.equal(offline.assets('pubgm').length, 3);
  await offline.sync('pubgm');
  assert.match(offline.statusOf('pubgm').waiting ?? '', /not reachable/);
  assert.equal(offline.assets('pubgm').length, 3, 'an offline check keeps the pack it has');
});

test('a file that does not match its checksum is refused and never kept', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'packs-'));
  const A = png('a');
  const { offer } = pack('1', { hero: A });
  const packs = new GamePacks({ dir, offer: async () => offer, fetch: (async () => new Response(new Uint8Array(png('z')))) as unknown as typeof fetch, retryMs: 10_000_000 });
  await packs.sync('pubgm');
  assert.match(packs.statusOf('pubgm').waiting ?? '', /checksum/);
  assert.deepEqual(readdirSync(join(dir, 'pubgm')), []);
});
