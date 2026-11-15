// The Companion connection: a WebSocket on this PC's local network that Bitfocus Companion (the
// Esportra Air module) connects to with a key. Air sends values and game events; Companion buttons
// ask for actions, which run through the same Production methods as Air's own keys. It runs only
// when the producer chose "Stream Deck / Companion" or "Both".

import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { DEFAULT_COMPANION_PORT, eventsFor, isLocalAddress, stateEvents, type CompanionView, type ControlMode, type Values, type WatchState } from '../shared/companion.ts';
import type { Secrets } from '../../../../packages/capture/src/secrets.ts';
import type { Store } from './store.ts';
import { lanAddresses } from './join.ts';

export interface CompanionHostDeps {
  store: Store;
  secrets: Pick<Secrets, 'get' | 'set'>;
  mode(): ControlMode;
  /** Choices for Companion's dropdowns: screens in My show, talent on air, sponsors. */
  hello(): Record<string, unknown>;
  values(): Values;
  watch(): WatchState;
  act(name: string, args: Record<string, unknown>): Promise<void>;
  changed(): void;
  addresses?: () => string[];
  /** Fixed port (tests); otherwise the saved one. */
  port?: number;
}

const newKey = () => randomBytes(9).toString('base64url');

export class CompanionHost {
  private readonly d: CompanionHostDeps;
  private http: Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private error: string | null = null;
  private lastValues = '';
  private lastWatch: WatchState | null = null;
  private valueTimer: ReturnType<typeof setTimeout> | null = null;
  private starting: Promise<void> | null = null;

  constructor(deps: CompanionHostDeps) {
    this.d = deps;
  }

  private get port() {
    return this.d.port ?? this.d.store.data.companion?.port ?? DEFAULT_COMPANION_PORT;
  }

  private key(): string {
    let key = this.d.secrets.get('companionKey');
    if (!key) {
      key = newKey();
      this.d.secrets.set('companionKey', key);
    }
    return key;
  }

  view(): CompanionView {
    const running = !!this.http?.listening;
    return {
      running, port: this.port, addresses: (this.d.addresses ?? lanAddresses)().map((a) => `${a}:${this.port}`),
      key: running ? this.key() : null, connected: this.clients.size, error: this.error,
    };
  }

  /** Starts or stops the connection to match the producer's choice. */
  async sync() {
    const wanted = this.d.mode() !== 'air';
    if (wanted && !this.http) await (this.starting ??= this.start().finally(() => (this.starting = null)));
    else if (!wanted && this.http) await this.stop();
  }

  renewKey() {
    this.d.secrets.set('companionKey', newKey());
    for (const c of this.clients) c.close(4001, 'The key changed.');
    this.d.changed();
  }

  private start(): Promise<void> {
    this.error = null;
    const http = createServer((_, res) => res.writeHead(404).end());
    const wss = new WebSocketServer({ noServer: true });
    http.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://x');
      const deny = (code: number) => { socket.write(`HTTP/1.1 ${code} No\r\n\r\n`); socket.destroy(); };
      if (url.pathname !== '/companion') return deny(404);
      if (!isLocalAddress(req.socket.remoteAddress)) return deny(403);
      if (url.searchParams.get('key') !== this.key()) return deny(401);
      wss.handleUpgrade(req, socket, head, (ws) => this.welcome(ws));
    });
    this.http = http;
    this.wss = wss;
    return new Promise((done) => {
      http.once('error', (e: NodeJS.ErrnoException) => {
        this.error = e.code === 'EADDRINUSE' ? `Port ${this.port} is in use by another program. Choose another port.` : e.message;
        this.http = null;
        this.wss = null;
        this.d.changed();
        done();
      });
      http.listen(this.port, '0.0.0.0', () => {
        this.d.changed();
        done();
      });
    });
  }

  async stop() {
    if (this.valueTimer) clearTimeout(this.valueTimer);
    this.valueTimer = null;
    for (const c of this.clients) c.terminate();
    this.clients.clear();
    this.wss?.close();
    const http = this.http;
    this.http = null;
    this.wss = null;
    if (http) await new Promise<void>((r) => http.close(() => r()));
    this.d.changed();
  }

  private send(ws: WebSocket, msg: unknown) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  private broadcast(msg: unknown) {
    for (const c of this.clients) this.send(c, msg);
  }

  private welcome(ws: WebSocket) {
    this.clients.add(ws);
    this.d.changed();
    this.send(ws, { type: 'hello', mode: this.d.mode(), ...this.d.hello() });
    this.send(ws, { type: 'values', values: this.d.values() });
    ws.on('close', () => {
      this.clients.delete(ws);
      this.d.changed();
    });
    ws.on('message', (raw) => void this.onMessage(ws, raw.toString()));
  }

  private async onMessage(ws: WebSocket, raw: string) {
    let msg: { type?: string; id?: unknown; name?: unknown; args?: unknown };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type !== 'action') return;
    const id = msg.id;
    try {
      if (typeof msg.name !== 'string') throw new Error('Unknown action.');
      const args = msg.args && typeof msg.args === 'object' ? (msg.args as Record<string, unknown>) : {};
      await this.d.act(msg.name, args);
      this.send(ws, { type: 'result', id, ok: true });
    } catch (e) {
      this.send(ws, { type: 'result', id, ok: false, error: (e as Error).message });
    }
  }

  /** A game event from the engine. */
  onEngineEvent(e: Record<string, unknown>) {
    if (!this.clients.size) return;
    for (const ev of eventsFor(e)) this.broadcast({ type: 'event', ...ev });
  }

  /** Air's state changed: new values (at most four times a second) and on-air, pause and data events. */
  onChange() {
    const watch = this.d.watch();
    const events = stateEvents(this.lastWatch, watch);
    this.lastWatch = watch;
    if (!this.clients.size) return;
    for (const ev of events) this.broadcast({ type: 'event', ...ev });
    if (this.valueTimer) return;
    this.valueTimer = setTimeout(() => {
      this.valueTimer = null;
      const values = this.d.values();
      const text = JSON.stringify(values);
      if (text === this.lastValues) return;
      this.lastValues = text;
      this.broadcast({ type: 'values', values });
    }, 250);
    this.valueTimer.unref?.();
  }
}
