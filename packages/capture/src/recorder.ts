// Record game data (troubleshooting): every raw game message as Overwolf gave it, one JSON line each,
// in a file on this PC only. It never leaves the PC. It stops by itself 10 s after the map ends (so the
// signals that follow the end are in it too), after three
// hours or at 50 MB, so a forgotten switch cannot fill the disk.
import { appendFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface RecorderView {
  on: boolean;
  file: string | null;
  lines: number;
  /** Why the last recording stopped by itself, if it did. */
  stopped: string | null;
}

const MAX_BYTES = 50_000_000;
const MAX_MS = 3 * 60 * 60 * 1000;

export class GameRecorder {
  private file: string | null = null;
  private lines = 0;
  private startedAt = 0;
  private endedAt: number | null = null;
  private stopped: string | null = null;
  private readonly dir: string;
  private readonly now: () => number;
  private readonly changed: () => void;

  constructor(options: { dir: string; changed?: () => void; now?: () => number }) {
    this.dir = options.dir;
    this.changed = options.changed ?? (() => {});
    this.now = options.now ?? Date.now;
  }

  view(): RecorderView {
    return { on: this.file !== null, file: this.file, lines: this.lines, stopped: this.stopped };
  }

  start() {
    if (this.file) return;
    mkdirSync(this.dir, { recursive: true });
    const stamp = new Date(this.now()).toISOString().replace(/[:.]/g, '-');
    this.file = join(this.dir, `game-data-${stamp}.ndjson`);
    this.lines = 0;
    this.startedAt = this.now();
    this.endedAt = null;
    this.stopped = null;
    this.changed();
  }

  stop(reason: string | null = null) {
    if (!this.file) return;
    this.file = null;
    this.stopped = reason;
    this.changed();
  }

  write(kind: 'info' | 'event', message: unknown) {
    if (!this.file) return;
    const t = this.now();
    try {
      appendFileSync(this.file, `${JSON.stringify({ t, kind, message })}\n`);
      this.lines++;
    } catch (error) {
      this.stop(`Could not write the file: ${(error as Error).message}`);
      return;
    }
    if (endsMap(message)) this.endedAt ??= t;
    if (this.endedAt !== null && t - this.endedAt >= 10_000) this.stop('The map ended.');
    else if (t - this.startedAt > MAX_MS) this.stop('Three hours recorded.');
    else if (this.lines % 200 === 0 && this.file && statSync(this.file).size > MAX_BYTES) this.stop('50 MB recorded.');
  }
}

/** The game says the map is over (a match_end event, or the round phase game_end). */
function endsMap(message: unknown): boolean {
  const m = message as { key?: string; name?: string; value?: unknown; data?: unknown; events?: Array<{ name?: string }> } | null;
  if (!m) return false;
  if (m.key === 'match_end' || m.name === 'match_end' || m.events?.some((e) => e?.name === 'match_end')) return true;
  return m.key === 'round_phase' && (m.value === 'game_end' || m.data === 'game_end');
}
