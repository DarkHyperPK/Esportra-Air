// Agent, weapon and map pictures on this PC. The HUD catalogue names them on media.valorant-api.com;
// Air downloads each one once into the engine's data folder, and the engine serves them at /art/ and
// points the catalogue there. Graphics then work at a venue without internet. Only pictures are
// fetched: nothing about the match or the game is sent.

import { EventEmitter } from 'node:events';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const ART_ORIGIN = 'https://media.valorant-api.com/';
const PATH = /^((agents|weapons|maps|gear)\/[0-9a-f-]{36}|agents\/[0-9a-f-]{36}\/abilities\/[a-z0-9]{1,16})\/[a-z]{1,32}\.png$/;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_BYTES = 5_000_000;

export interface ArtStatus {
  total: number;
  have: number;
  downloading: boolean;
  /** Why the last attempt left pictures missing (null when none are missing or none failed). */
  lastError: string | null;
  /** Pictures the art server does not have (it answered 404), by name. Not retried: they will not appear. */
  unavailable: string[];
}

/** A picture the art server answered 404 for: it does not exist there, so retrying will not help. */
class NotOnServer extends Error {}

/** A readable name for a picture path, from the catalogue: "Astra", "Astra · ability", "Vandal", "Lotus". */
export function artName(source: string, path: string): string {
  const uuid = path.split('/')[1] ?? '';
  const at = source.indexOf(`"uuid":"${uuid}"`);
  const name = at >= 0 ? /"name":"([^"]{1,40})"/.exec(source.slice(at, at + 400))?.[1] : undefined;
  const what = path.includes('/abilities/') ? 'ability' : /killfeed/.test(path) ? 'kill feed' : /fullportrait/.test(path) ? 'portrait' : '';
  return `${name ?? path.split('/')[0]}${what ? ` · ${what}` : ''}`;
}

/** Every picture path in the catalogue (`agents/<uuid>/displayicon.png`, …), without duplicates. */
export function catalogueArt(source: string): string[] {
  const out = new Set<string>();
  const escaped = ART_ORIGIN.replace(/[.]/g, '\\.').replace(/\//g, '\\/');
  for (const m of source.matchAll(new RegExp(`${escaped}([A-Za-z0-9/._-]+)`, 'g'))) {
    if (PATH.test(m[1]!)) out.add(m[1]!);
  }
  return [...out].sort();
}

export interface ArtCacheOptions {
  /** `core/catalog.js` of the HUD. */
  catalogue: string;
  /** The engine's `<data>/art` folder. */
  dir: string;
  fetch?: typeof fetch;
  /** Where pictures come from (tests point this at a stand-in). */
  origin?: string;
  concurrency?: number;
  retryMs?: number;
}

export class ArtCache extends EventEmitter {
  status: ArtStatus = { total: 0, have: 0, downloading: false, lastError: null, unavailable: [] };
  /** Paths the server does not have; skipped until Air restarts. */
  private notOnServer = new Set<string>();
  private source = '';
  private readonly o: Required<Omit<ArtCacheOptions, 'fetch'>> & { fetch: typeof fetch };
  private paths: string[] = [];
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(options: ArtCacheOptions) {
    super();
    this.o = {
      catalogue: options.catalogue,
      dir: options.dir,
      origin: options.origin ?? ART_ORIGIN,
      concurrency: options.concurrency ?? 6,
      retryMs: options.retryMs ?? 60_000,
      fetch: options.fetch ?? ((input, init) => fetch(input, init)),
    };
  }

  private set(patch: Partial<ArtStatus>) {
    this.status = { ...this.status, ...patch };
    this.emit('change');
  }

  /** Downloads whatever is missing; resolves when this pass ends. Concurrent calls share one pass. */
  download(): Promise<void> {
    this.running ??= this.pass().finally(() => { this.running = null; });
    return this.running;
  }

  private async pass() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.paths.length) {
      this.source = await readFile(this.o.catalogue, 'utf8');
      this.paths = catalogueArt(this.source);
    }
    const missing: string[] = [];
    for (const p of this.paths) if (!this.notOnServer.has(p) && !(await exists(join(this.o.dir, p)))) missing.push(p);
    this.set({ total: this.paths.length, have: this.paths.length - missing.length - this.notOnServer.size, downloading: missing.length > 0, lastError: null });
    let failed = 0;
    let lastError: string | null = null;
    const queue = [...missing];
    const worker = async () => {
      for (let p = queue.shift(); p !== undefined && !this.stopped; p = queue.shift()) {
        try {
          await this.fetchOne(p);
          this.set({ have: this.status.have + 1 });
        } catch (error) {
          if (error instanceof NotOnServer) {
            this.notOnServer.add(p);
            this.set({ unavailable: [...this.notOnServer].map((x) => artName(this.source, x)).sort() });
            continue;
          }
          failed++;
          lastError = (error as Error).message;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.o.concurrency, queue.length) }, worker));
    this.set({ downloading: false, lastError: failed ? lastError : null });
    // Missing pictures are tried again later (the venue's connection may come back).
    if (failed && !this.stopped) {
      this.timer = setTimeout(() => void this.download(), this.o.retryMs);
      this.timer.unref?.();
    }
  }

  private async fetchOne(path: string) {
    const res = await this.o.fetch(this.o.origin + path, { signal: AbortSignal.timeout(15_000) });
    if (res.status === 404) throw new NotOnServer(path);
    if (!res.ok) throw new Error(`The art server answered ${res.status}.`);
    if (!/^image\/png\b/i.test(res.headers.get('content-type') ?? '')) throw new Error('The art server sent something that is not a PNG.');
    if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) throw new Error('A picture was larger than 5 MB.');
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_BYTES) throw new Error('A picture was larger than 5 MB.');
    if (!bytes.subarray(0, 8).equals(PNG)) throw new Error('The art server sent something that is not a PNG.');
    const file = join(this.o.dir, path);
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, bytes);
    await rename(tmp, file);
  }

  /** Downloads now (in the background) and keeps retrying while pictures are missing. */
  start() {
    this.stopped = false;
    void this.download().catch((error) => this.set({ downloading: false, lastError: (error as Error).message }));
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

async function exists(file: string) {
  try {
    return (await stat(file)).size > 0;
  } catch {
    return false;
  }
}
