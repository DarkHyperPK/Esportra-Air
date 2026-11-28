// Game packs on this PC (20 Nov). Esportra hosts each game's official pictures; Air asks for the pack's manifest
// (with short-lived download links), downloads every file once into `<engine data>/packs/<game>/<sha256>.<ext>`,
// checks it against its checksum and keeps the manifest beside them, so graphics work at a venue without internet.
// A new pack version downloads only the files it doesn't have. Only pictures are fetched; nothing is sent.

import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validManifest, type GameAsset, type PackFile, type PackManifest, type PackStatus } from '../shared/game-assets.ts';

/** What Esportra answers for a pack: the manifest and a download link per file checksum. */
export interface PackOffer { manifest: unknown; urls: Record<string, string> }

export interface GamePacksOptions {
  /** `<engine data>/packs`. */
  dir: string;
  /** Asks Esportra for the pack; throws a plain sentence when it can't (offline, not signed in). */
  offer: (game: string) => Promise<PackOffer>;
  fetch?: typeof fetch;
  concurrency?: number;
  retryMs?: number;
}

const MAGIC: Record<PackFile['ext'], (b: Buffer) => boolean> = {
  png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

export const fileName = (f: PackFile) => `${f.sha256}.${f.ext}`;

export class GamePacks extends EventEmitter {
  private readonly o: Required<Omit<GamePacksOptions, 'fetch'>> & { fetch: typeof fetch };
  private readonly manifests = new Map<string, PackManifest>();
  private readonly status = new Map<string, PackStatus>();
  private readonly running = new Map<string, Promise<void>>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private stopped = false;

  constructor(options: GamePacksOptions) {
    super();
    this.o = { dir: options.dir, offer: options.offer, concurrency: options.concurrency ?? 4, retryMs: options.retryMs ?? 60_000, fetch: options.fetch ?? ((i, init) => fetch(i, init)) };
  }

  /** The pack as last downloaded (also when offline), or null. */
  manifest(game: string): PackManifest | null { return this.manifests.get(game) ?? null; }
  statusOf(game: string): PackStatus { return this.status.get(game) ?? { game, version: null, total: 0, have: 0, downloading: false, waiting: null }; }
  assets(game: string): GameAsset[] { return this.manifests.get(game)?.assets ?? []; }

  private set(game: string, patch: Partial<PackStatus>) {
    this.status.set(game, { ...this.statusOf(game), ...patch });
    this.emit('change', game);
  }

  /** Reads the pack kept on this PC, so its pictures work before (or without) a new download. */
  async load(game: string) {
    try {
      const m = validManifest(JSON.parse(await readFile(join(this.o.dir, game, 'manifest.json'), 'utf8')));
      if (m.game !== game) return;
      this.manifests.set(game, m);
      const have = await this.count(game, m);
      this.set(game, { version: m.version, total: this.files(m).length, have });
    } catch { /* no pack kept yet */ }
  }

  /** Brings the pack up to date; resolves when this pass ends. Concurrent calls share one pass. */
  sync(game: string): Promise<void> {
    let run = this.running.get(game);
    if (!run) {
      run = this.pass(game).catch((e) => this.set(game, { downloading: false, waiting: (e as Error).message })).finally(() => this.running.delete(game));
      this.running.set(game, run);
    }
    return run;
  }

  private files(m: PackManifest): PackFile[] {
    const out = new Map<string, PackFile>();
    for (const a of m.assets) for (const f of [a.thumb, a.file]) if (f) out.set(f.sha256, f);
    return [...out.values()];
  }

  private async count(game: string, m: PackManifest) {
    let n = 0;
    for (const f of this.files(m)) if (await sized(join(this.o.dir, game, fileName(f)), f.bytes)) n++;
    return n;
  }

  private async pass(game: string) {
    const t = this.timers.get(game); if (t) clearTimeout(t);
    this.timers.delete(game);
    const offer = await this.o.offer(game);
    const m = validManifest(offer.manifest);
    if (m.game !== game) throw new Error('Esportra sent the pack of another game.');
    const files = this.files(m);
    const missing: PackFile[] = [];
    for (const f of files) if (!(await sized(join(this.o.dir, game, fileName(f)), f.bytes))) missing.push(f);
    // Thumbnails first: lists can show the pack while the large pictures still arrive.
    const small = new Set(m.assets.map((a) => a.thumb?.sha256).filter(Boolean));
    missing.sort((a, b) => Number(small.has(b.sha256)) - Number(small.has(a.sha256)) || a.bytes - b.bytes);
    this.set(game, { version: m.version, total: files.length, have: files.length - missing.length, downloading: missing.length > 0, waiting: null });
    await mkdir(join(this.o.dir, game), { recursive: true });
    let failed = 0, last: string | null = null;
    const queue = [...missing];
    const worker = async () => {
      for (let f = queue.shift(); f && !this.stopped; f = queue.shift()) {
        try {
          const url = offer.urls[f.sha256];
          if (!url || !/^https?:\/\//.test(url)) throw new Error('Esportra sent no download link for a picture.');
          await this.fetchOne(game, f, url);
          this.set(game, { have: this.statusOf(game).have + 1 });
        } catch (e) { failed++; last = (e as Error).message; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.o.concurrency, queue.length) }, worker));
    // The manifest is kept once every file it names is here, so a half-downloaded pack never replaces a whole one.
    if (!failed) {
      await writeAtomic(join(this.o.dir, game, 'manifest.json'), Buffer.from(JSON.stringify(m)));
      this.manifests.set(game, m);
    } else if (!this.manifests.has(game)) {
      this.manifests.set(game, { ...m, assets: [] });
    }
    this.set(game, { downloading: false, waiting: failed ? `${failed} ${failed === 1 ? 'picture' : 'pictures'} still to download: ${last}` : null });
    if (failed && !this.stopped) {
      const timer = setTimeout(() => void this.sync(game), this.o.retryMs);
      timer.unref?.();
      this.timers.set(game, timer);
    }
  }

  private async fetchOne(game: string, f: PackFile, url: string) {
    const res = await this.o.fetch(url, { signal: AbortSignal.timeout(60_000), redirect: 'follow' });
    if (!res.ok) throw new Error(`the download answered ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length !== f.bytes) throw new Error('a picture arrived incomplete');
    if (createHash('sha256').update(bytes).digest('hex') !== f.sha256) throw new Error('a picture did not match its checksum');
    if (!MAGIC[f.ext](bytes)) throw new Error('a file was not the picture it claimed to be');
    await writeAtomic(join(this.o.dir, game, fileName(f)), bytes);
  }

  /** Downloads in the background and keeps retrying while files are missing. */
  start(game: string) {
    this.stopped = false;
    void this.sync(game);
  }

  stop() {
    this.stopped = true;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}

async function writeAtomic(file: string, bytes: Buffer) {
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, file);
}

async function sized(file: string, bytes: number) {
  try { return (await stat(file)).size === bytes; } catch { return false; }
}
