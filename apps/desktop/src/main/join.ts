// Observer and player PCs on the same network.
//   JoinHost  — the producer's Air: switches joining on, makes the join code, lists joined PCs.
//   LinkClient — a capture-only PC: checks the code, then sends this PC's game data to the producer.
// Game data stays on the local network: the join port is opened only while the producer allows it,
// and nothing here talks to the internet.

import { randomInt } from 'node:crypto';
import { hostname, networkInterfaces } from 'node:os';
import { CODE_ALPHABET, emptyJoin, emptyLink, parseCode, type JoinView, type LinkView, type PcRole } from '../shared/join.ts';
import type { EngineClient } from './engine-client.ts';
import type { IngestClient } from './ingest.ts';
import type { Secrets } from './secrets.ts';
import type { Store } from './store.ts';

export const DEFAULT_JOIN_PORT = 5301;

export const newCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

/** This PC's IPv4 addresses on the local network (not loopback, not link-local). */
export function lanAddresses(interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces()): string[] {
  return Object.values(interfaces)
    .flatMap((list) => list ?? [])
    .filter((i) => i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.'))
    .map((i) => i.address);
}

export interface JoinHostDeps {
  store: Store;
  secrets: Pick<Secrets, 'get' | 'set'>;
  client: () => EngineClient;
  /** The room joined PCs send into: the match selected on this PC. */
  matchCode: () => string | null;
  changed: () => void;
  addresses?: () => string[];
  pollMs?: number;
}

interface EnginePeers {
  enabled: boolean;
  peers: Array<{ id: number; role: PcRole; name: string; ip: string; since: number; lastAgeMs: number | null; messages: number }>;
}

export class JoinHost {
  private readonly d: JoinHostDeps;
  private timer: ReturnType<typeof setInterval> | null = null;
  private peers: JoinView['peers'] = [];
  private error: string | null = null;

  constructor(deps: JoinHostDeps) {
    this.d = deps;
  }

  private get saved() {
    return (this.d.store.data.join ??= { enabled: false, port: DEFAULT_JOIN_PORT });
  }

  view(): JoinView {
    const { enabled, port } = this.saved;
    const addresses = (this.d.addresses ?? lanAddresses)().map((a) => `${a}:${port}`);
    return { ...emptyJoin(), enabled, port, code: enabled ? this.d.secrets.get('joinCode') : null, addresses, peers: this.peers, error: this.error };
  }

  /** Re-applies the saved setting to the engine (after an engine restart, a new match, or at startup). */
  async sync() {
    const { enabled, port } = this.saved;
    if (!enabled) return;
    try {
      await this.apply(true, port);
    } catch (error) {
      this.error = (error as Error).message;
      this.d.changed();
    }
    this.poll();
  }

  private async apply(enabled: boolean, port: number) {
    let code = this.d.secrets.get('joinCode');
    if (enabled && !code) {
      code = newCode();
      this.d.secrets.set('joinCode', code);
    }
    await this.d.client().put('/control/join', enabled ? { enabled: true, code, match: this.d.matchCode() ?? 'MAIN', port } : { enabled: false });
    this.error = null;
  }

  async set(enabled: boolean) {
    const saved = this.saved;
    if (enabled) {
      await this.apply(true, saved.port);
      saved.enabled = true;
      this.poll();
    } else {
      saved.enabled = false;
      this.d.secrets.set('joinCode', null);
      this.peers = [];
      await this.d.client().put('/control/join', { enabled: false }).catch(() => {});
      this.error = null;
    }
    this.d.store.save();
    this.d.changed();
  }

  /** A new code drops every joined PC; they must type the new one. */
  async rotate() {
    if (!this.saved.enabled) throw new Error('Allow other PCs to join first.');
    this.d.secrets.set('joinCode', newCode());
    await this.apply(true, this.saved.port);
    this.d.changed();
  }

  /** Polls the joined PCs while joining is on. */
  private poll() {
    if (this.timer || !this.saved.enabled) return;
    const tick = async () => {
      if (!this.saved.enabled) {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        return;
      }
      try {
        const status = await this.d.client().get<EnginePeers>('/control/join');
        this.peers = status.peers;
        if (!status.enabled) await this.apply(true, this.saved.port); // the engine restarted: switch it back on
        this.error = null;
      } catch (error) {
        this.error = (error as Error).message;
      }
      this.d.changed();
    };
    this.timer = setInterval(() => void tick(), this.d.pollMs ?? 2000);
    this.timer.unref?.();
    void tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export interface LinkDeps {
  store: Store;
  secrets: Pick<Secrets, 'get' | 'set'>;
  ingest: IngestClient;
  capture: { role: PcRole; setRole(role: PcRole): void; state: string };
  changed: () => void;
  fetch?: typeof fetch;
  name?: string;
}

/** `192.168.1.40`, `192.168.1.40:5301` or `studio-pc.local:5301` → host and port. */
export function parseAddress(input: string): { host: string; port: number } {
  const m = /^\s*([A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?)(?::(\d{1,5}))?\s*$/.exec(String(input));
  const port = m?.[3] ? Number(m[3]) : DEFAULT_JOIN_PORT;
  if (!m || port < 1024 || port > 65535) throw new Error('Enter the producer’s address as 192.168.1.40 or 192.168.1.40:5301.');
  return { host: m[1]!, port };
}

export class LinkClient {
  private readonly d: LinkDeps;

  constructor(deps: LinkDeps) {
    this.d = deps;
    deps.ingest.onChange = () => deps.changed();
  }

  private get saved() {
    return this.d.store.data.link ?? null;
  }

  view(): LinkView {
    const saved = this.saved;
    if (!saved) return emptyLink();
    const { state, lastError } = this.d.ingest;
    return { state: state === 'idle' ? 'off' : state, address: saved.address, role: this.d.capture.role, sent: this.d.ingest.sent, queued: this.d.ingest.queued, error: lastError };
  }

  private url(host: string, port: number, code: string, role: PcRole) {
    const name = encodeURIComponent((this.d.name ?? hostname()).slice(0, 40));
    return `ws://${host}:${port}/join?code=${encodeURIComponent(code)}&role=${role}&name=${name}`;
  }

  /** Checks the code with the producer's Air, then starts sending this PC's game data there. */
  async connect(input: { address: string; code: string; role: PcRole }) {
    const { host, port } = parseAddress(input.address);
    const code = parseCode(input.code);
    if (code.length < 6) throw new Error('Enter the join code shown on the producer’s Air.');
    if (input.role !== 'observer' && input.role !== 'player') throw new Error('Choose Observer or Player.');
    const doFetch = this.d.fetch ?? fetch;
    let response: Response;
    try {
      response = await doFetch(`http://${host}:${port}/join/hello?code=${encodeURIComponent(code)}`, { signal: AbortSignal.timeout(4000) });
    } catch {
      throw new Error('Could not reach the producer’s Air at that address. Check the address, that both PCs are on the same network, and that “Allow other PCs to join” is on.');
    }
    if (response.status === 401) throw new Error('That join code was not accepted.');
    if (response.status === 403) throw new Error('Joining is switched off on the producer’s Air.');
    if (response.status === 429) throw new Error('Too many wrong codes. Wait a minute and try again.');
    if (!response.ok) throw new Error('The producer’s Air did not accept this PC.');
    if (this.d.capture.role !== input.role) this.d.capture.setRole(input.role);
    this.d.store.data.link = { address: `${host}:${port}`, role: input.role };
    this.d.secrets.set('linkCode', code);
    this.d.store.save();
    this.d.ingest.target(this.url(host, port, code, input.role));
    this.d.changed();
  }

  /** Reconnects a saved link at startup, without asking again. */
  resume() {
    const saved = this.saved;
    const code = this.d.secrets.get('linkCode');
    if (!saved || !code) return;
    const { host, port } = parseAddress(saved.address);
    if (this.d.capture.role !== saved.role && this.d.capture.state === 'off') this.d.capture.setRole(saved.role);
    this.d.ingest.target(this.url(host, port, code, saved.role));
  }

  retry() {
    this.d.ingest.reconnect();
  }

  disconnect() {
    this.d.ingest.target(null);
    delete this.d.store.data.link;
    this.d.secrets.set('linkCode', null);
    this.d.store.save();
    this.d.changed();
  }
}
