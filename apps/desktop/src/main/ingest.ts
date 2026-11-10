// Sends raw game messages to the engine's match room over WebSocket (`role=ingest`).
// While disconnected, messages are kept for up to 60 s (8 MB, 10 000 messages) and replayed with
// their age, so the engine applies them at their real capture time. Ported from
// capture/overwolf-valorant/capture-queue.js.

import WebSocket from 'ws';

interface Queued {
  message: unknown;
  bytes: number;
  at: number;
}

const MAX_AGE_MS = 60_000;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ITEMS = 10_000;

export class CaptureQueue {
  private items: Queued[] = [];
  private bytes = 0;
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  add(message: unknown) {
    const bytes = Buffer.byteLength(JSON.stringify(message));
    if (bytes > MAX_BYTES) return;
    this.items.push({ message, bytes, at: this.now() });
    this.bytes += bytes;
    while (this.items.length && (this.now() - this.items[0]!.at > MAX_AGE_MS || this.bytes > MAX_BYTES || this.items.length > MAX_ITEMS)) {
      this.bytes -= this.items.shift()!.bytes;
    }
  }

  /** Everything still fresh, oldest first, with its age. */
  drain(): Array<{ message: unknown; ageMs: number }> {
    const now = this.now();
    const out = this.items.filter((i) => now - i.at <= MAX_AGE_MS).map((i) => ({ message: i.message, ageMs: now - i.at }));
    this.items = [];
    this.bytes = 0;
    return out;
  }

  get size() {
    return this.items.length;
  }
}

export interface IngestSocket {
  readyState: number;
  send(data: string): void;
  close(): void;
  on(event: 'open' | 'close' | 'error', listener: (...args: unknown[]) => void): unknown;
}

export class IngestClient {
  private socket: IngestSocket | null = null;
  private url: string | null = null;
  private readonly queue: CaptureQueue;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private readonly connectImpl: (url: string) => IngestSocket;
  sent = 0;

  constructor(options: { connect?: (url: string) => IngestSocket; now?: () => number } = {}) {
    this.connectImpl = options.connect ?? ((url) => new WebSocket(url) as unknown as IngestSocket);
    this.queue = new CaptureQueue(options.now);
  }

  /** Points the client at a match room; a different room drops anything queued for the old one. */
  target(url: string | null) {
    if (url === this.url) return;
    if (this.url !== null) this.queue.drain();
    this.url = url;
    this.disconnect();
    if (url) this.connect();
  }

  private connect() {
    if (!this.url) return;
    const socket = this.connectImpl(this.url);
    this.socket = socket;
    socket.on('open', () => {
      for (const { message, ageMs } of this.queue.drain()) this.write(message, ageMs, true);
    });
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.retry = setTimeout(() => this.connect(), 1500);
      this.retry.unref?.();
    });
    socket.on('error', () => {
      // 'close' follows and schedules the retry.
    });
  }

  private disconnect() {
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  private write(message: unknown, ageMs: number, recovered: boolean) {
    this.socket!.send(JSON.stringify({ type: 'valorant', message, bufferedAgeMs: Math.min(ageMs, MAX_AGE_MS), recovered }));
    this.sent += 1;
  }

  send(message: unknown) {
    if (this.socket && this.socket.readyState === 1) this.write(message, 0, false);
    else this.queue.add(message);
  }

  get queued() {
    return this.queue.size;
  }

  close() {
    this.url = null;
    this.disconnect();
  }
}
