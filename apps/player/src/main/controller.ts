// The Player app's model: one link to a producer's Air and one game capture.
import { EventEmitter } from 'node:events';
import type { IngestClient } from '../../../../packages/capture/src/ingest.ts';
import { LinkClient } from '../../../../packages/capture/src/link.ts';
import type { PcRole } from '../../../../packages/capture/src/protocol.ts';
import type { PlayerSnapshot } from '../shared/api.ts';
import type { PlayerStore } from './store.ts';

export interface CaptureLike {
  state: 'off' | 'waiting' | 'live' | 'unavailable';
  reason: string | null;
  role: PcRole;
  start(): void;
  stop(): void;
  setRole(role: PcRole): void;
  on(event: 'change', listener: () => void): unknown;
}

export interface ControllerDeps {
  store: PlayerStore;
  secrets: { get(name: string): string | null; set(name: string, value: string | null): void };
  ingest: IngestClient;
  capture: CaptureLike;
  name: string;
  version: string;
  fetch?: typeof fetch;
}

export class PlayerController extends EventEmitter {
  readonly link: LinkClient;
  private readonly d: ControllerDeps;

  constructor(deps: ControllerDeps) {
    super();
    this.d = deps;
    const changed = () => this.emit('change');
    deps.capture.on('change', changed);
    // The sent counter moves once a second while capturing.
    const tick = setInterval(() => deps.capture.state === 'live' && changed(), 1000);
    tick.unref?.();
    this.link = new LinkClient({
      settings: { read: () => deps.store.data.link, write: (v) => { deps.store.data.link = v; deps.store.save(); } },
      secrets: deps.secrets, ingest: deps.ingest, capture: deps.capture, name: () => deps.name, changed, fetch: deps.fetch,
    });
  }

  /** Reconnects to the producer remembered from last time. Game capture is never resumed: it needs consent each run. */
  resume() {
    this.link.resume();
  }

  snapshot(): PlayerSnapshot {
    const { capture, name, version } = this.d;
    return { version, name, role: capture.role, link: this.link.view(), feed: { state: capture.state, reason: capture.reason } };
  }

  async connect(input: { address: string; code: string; role: PcRole }) {
    if (this.d.capture.state === 'live' || this.d.capture.state === 'waiting') throw new Error('Stop game capture before changing the producer or this PC’s role.');
    await this.link.connect(input ?? ({} as never));
  }

  disconnect() {
    if (this.d.capture.state === 'live' || this.d.capture.state === 'waiting') this.d.capture.stop();
    this.link.disconnect();
  }

  retry() {
    this.link.retry();
  }

  startCapture(input: { consent?: boolean }) {
    if (input?.consent !== true) throw new Error('Read and accept the capture notice first.');
    if (this.link.view().state !== 'connected') throw new Error('Connect to the producer’s Air first.');
    this.d.capture.start();
  }

  stopCapture() {
    this.d.capture.stop();
  }
}
