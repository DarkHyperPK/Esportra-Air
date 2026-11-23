// A stand-in game pack for the dev host and tests (20 Nov): small solid-colour PNGs with the kinds and names of a
// real pack, never the real kit (the kit's files stay out of git). The fake Esportra serves its manifest at
// GET /api/air/game-packs/<game> and the files at /fake-pack/<sha256> (like Esportra's short-lived links).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => { const t = Buffer.from(type, 'latin1'); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, crc]); };

/** A w×h PNG: a diagonal two-colour split, so pictures can be told apart in a grid. */
export function solidPng(w: number, h: number, a: [number, number, number], b: [number, number, number]): Buffer {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { const o = y * (w * 3 + 1); for (let x = 0; x < w; x++) { const c = x / w + y / h < 1 ? a : b; rows[o + 1 + x * 3] = c[0]; rows[o + 2 + x * 3] = c[1]; rows[o + 3 + x * 3] = c[2]; } }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

const ITEMS: Array<[string, string, string, number, number, string?]> = [
  ['char-1', 'character', 'Helmet pose 1', 600, 900], ['char-2', 'character', 'Helmet pose 2', 600, 900], ['char-3', 'character', 'Squad of four', 900, 600],
  ['map-erangel', 'map', 'Erangel', 800, 800], ['map-miramar', 'map', 'Miramar', 800, 800], ['map-sanhok', 'map', 'Sanhok', 800, 800], ['map-vikendi', 'map', 'Vikendi', 800, 800], ['map-rondo', 'map', 'Rondo', 800, 800],
  ['veh-buggy', 'vehicle', 'Buggy', 800, 450], ['veh-dacia', 'vehicle', 'Dacia', 800, 450],
  ['item-crate', 'item', 'Care package', 400, 500], ['item-pan', 'item', 'Pan', 400, 400],
  ['wall-1', 'wallpaper', 'Wallpaper 1', 1280, 720], ['wall-2', 'wallpaper', 'Wallpaper 2', 1280, 720],
  ['logo-esports-white', 'logo-esports', 'PUBG MOBILE Esports · white', 512, 452, 'white'], ['logo-esports-yellow', 'logo-esports', 'PUBG MOBILE Esports · yellow', 512, 452, 'yellow'],
  ['logo-game-white', 'logo-game', 'PUBG MOBILE · white', 512, 452, 'white'], ['logo-ci-white', 'logo-ci', 'CI · white', 900, 134, 'white'],
];
const PALETTE: Array<[number, number, number]> = [[255, 182, 14], [50, 50, 50], [148, 148, 149], [17, 17, 17], [229, 72, 77], [34, 211, 238]];

export function fakePack(game: string, version = '2026.11') {
  const files = new Map<string, Buffer>();
  const put = (b: Buffer) => { const sha = createHash('sha256').update(b).digest('hex'); files.set(sha, b); return { sha256: sha, ext: 'png' as const, bytes: b.length }; };
  const assets = ITEMS.map(([id, kind, name, w, h, variant], i) => {
    const a = PALETTE[i % PALETTE.length]!, b = PALETTE[(i + 2) % PALETTE.length]!;
    const sw = Math.max(8, Math.round(w / 8)), sh = Math.max(8, Math.round(h / 8));
    return { id, kind, name, w, h, file: put(solidPng(sw, sh, a, b)), thumb: put(solidPng(Math.max(4, Math.round(sw / 2)), Math.max(4, Math.round(sh / 2)), a, b)), ...(variant ? { variant } : {}) };
  });
  return { manifest: { game, version, assets }, files };
}

/** A pack from pictures on this machine, for recording walkthroughs with real art (`AIR_DEV_PACK=<dir>` on the dev
 *  host): `<dir>/manifest.json` is `{assets: [{id, kind, name, file, variant?}]}` with files relative to `<dir>`.
 *  The pictures never leave the machine and never go in git. */
export function localPack(game: string, dir: string, version = '2026.11-local') {
  const files = new Map<string, Buffer>();
  const list = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')).assets as Array<{ id: string; kind: string; name: string; file: string; variant?: string }>;
  const assets = list.map((a) => {
    const b = readFileSync(join(dir, a.file));
    const sha = createHash('sha256').update(b).digest('hex');
    files.set(sha, b);
    const ext = b[0] === 0xff ? 'jpg' as const : b[0] === 0x52 ? 'webp' as const : 'png' as const;
    const w = ext === 'png' ? b.readUInt32BE(16) : 1280, h = ext === 'png' ? b.readUInt32BE(20) : 720;
    const file = { sha256: sha, ext, bytes: b.length };
    return { id: a.id, kind: a.kind, name: a.name, w, h, file, thumb: file, ...(a.variant ? { variant: a.variant } : {}) };
  });
  return { manifest: { game, version, assets }, files };
}
