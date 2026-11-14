// Observer and player PCs on the same network.
//   JoinHost  — the producer's Air: switches joining on, makes the join code, lists joined PCs.
//   LinkClient — a capture-only PC: checks the code, then sends this PC's game data to the producer.
// Game data stays on the local network: the join port is opened only while the producer allows it,
// and nothing here talks to the internet.

import { randomInt } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { CODE_ALPHABET, DEFAULT_JOIN_PORT, type PcRole } from '../../../../packages/capture/src/protocol.ts';
import { emptyJoin, type DataSourcesView, type JoinView } from '../shared/join.ts';
import type { EngineClient } from './engine-client.ts';
import type { Secrets } from '../../../../packages/capture/src/secrets.ts';
import type { Store } from './store.ts';

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
  peers: Array<{ id: number; role: PcRole; name: string; ip: string; since: number; lastAgeMs: number | null; messages: number; playerId?: string | null }>;
}

export class JoinHost {
  private readonly d: JoinHostDeps;
  private timer: ReturnType<typeof setInterval> | null = null;
  private peers: JoinView['peers'] = [];
  private sources: JoinView['dataSources'] = null;
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
    return { ...emptyJoin(), enabled, port, code: enabled ? this.d.secrets.get('joinCode') : null, addresses, peers: this.peers, dataSources: enabled ? this.sources : null, error: this.error };
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

  private async readSources() {
    const code = this.d.matchCode();
    this.sources = code ? await this.d.client().get<DataSourcesView>(`/api/${encodeURIComponent(code)}/data-sources`).catch(() => null) : null;
  }

  /** The producer chooses which PC's match data is used (`this-pc` or `peer:<id>`). */
  async useSource(id: string) {
    const code = this.d.matchCode();
    if (!code) throw new Error('Choose a match first.');
    if (!/^(this-pc|peer:\d{1,9})$/.test(String(id))) throw new Error('Choose a PC that sends game data.');
    await this.d.client().post(`/api/${encodeURIComponent(code)}/data-sources`, { use: id });
    await this.readSources();
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
        await this.readSources();
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
