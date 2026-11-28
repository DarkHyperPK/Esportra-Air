// Record PCOB (27 Nov): while the producer switches it on and Air is reading the observer PC (consent given), every
// raw answer of every PCOB route is written exactly as received, one JSON line each, to a file on this PC only
// (Documents/Esportra Air recordings). Air's own decisions (game start, game end, results saved) go in the same
// file, so they can be compared with the raw data. It never sends anything anywhere. It stops by itself after
// four hours or at 200 MB, so a forgotten switch cannot fill the disk. Pattern: packages/capture/src/recorder.ts.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface PcobRecordingView {
  on: boolean;
  /** The file being written (or the last one written). */
  file: string | null;
  bytes: number;
  lines: number;
  /** When it started (ms), while on. */
  since: number | null;
  /** Why the last recording stopped by itself, if it did. */
  stopped: string | null;
}

export const PCOB_MAX_BYTES = 200_000_000;
export const PCOB_MAX_MS = 4 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

export class PcobRecorder {
  private file: string | null = null;
  private last: string | null = null;
  private bytes = 0;
  private lines = 0;
  private startedAt: number | null = null;
  private shownAt = 0;
  private stopped: string | null = null;
  private readonly dir: string;
  private readonly now: () => number;
  private readonly changed: () => void;
  private readonly maxBytes: number;
  private readonly maxMs: number;

  constructor(options: { dir: string; changed?: () => void; now?: () => number; maxBytes?: number; maxMs?: number }) {
    this.dir = options.dir;
    this.changed = options.changed ?? (() => {});
    this.now = options.now ?? Date.now;
    this.maxBytes = options.maxBytes ?? PCOB_MAX_BYTES;
    this.maxMs = options.maxMs ?? PCOB_MAX_MS;
  }

  get on() { return this.file !== null; }

  view(): PcobRecordingView {
    return { on: this.file !== null, file: this.file ?? this.last, bytes: this.bytes, lines: this.lines, since: this.file ? this.startedAt : null, stopped: this.stopped };
  }

  /** A new file for every start: pcob-yyyy-mm-dd-hhmm.ndjson (seconds are added when that minute is taken). */
  start() {
    if (this.file) return;
    mkdirSync(this.dir, { recursive: true });
    const d = new Date(this.now());
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    let file = join(this.dir, `pcob-${stamp}.ndjson`);
    for (let n = 1; this.exists(file); n++) file = join(this.dir, `pcob-${stamp}-${n}.ndjson`);
    appendFileSync(file, '');
    this.file = this.last = file;
    this.bytes = 0; this.lines = 0; this.startedAt = this.now(); this.stopped = null;
    this.changed();
  }

  stop(reason: string | null = null) {
    if (!this.file) return;
    this.file = null; this.startedAt = null; this.stopped = reason;
    this.changed();
  }

  /** One raw answer: status 0 means no answer, and the body is the error text. */
  record(route: string, status: number, body: string) {
    this.line({ t: new Date(this.now()).toISOString(), ms: this.now(), route, status, body });
  }

  /** What Air decided from the data (game start, game end, results saved). */
  air(event: Record<string, unknown>) {
    this.line({ t: new Date(this.now()).toISOString(), ms: this.now(), kind: 'air', event });
  }

  private line(entry: Record<string, unknown>) {
    if (!this.file) return;
    const text = `${JSON.stringify(entry)}\n`;
    try {
      appendFileSync(this.file, text);
    } catch (error) {
      this.stop(`Could not write the file: ${(error as Error).message}`);
      return;
    }
    this.bytes += Buffer.byteLength(text);
    this.lines++;
    if (this.now() - (this.startedAt ?? 0) > this.maxMs) this.stop('Four hours recorded.');
    else if (this.bytes >= this.maxBytes) this.stop('200 MB recorded.');
    else if (this.now() - this.shownAt >= 1000) { this.shownAt = this.now(); this.changed(); }
  }

  private exists(file: string) {
    try { appendFileSync(file, '', { flag: 'ax' }); return false; } catch { return true; }
  }
}
