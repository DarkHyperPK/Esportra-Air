// A capture-only PC's link to a producer's Air: checks the join code, then sends this PC's game data
// there. Shared by the Esportra Player app and Air's own capture-only mode.

import type { IngestClient } from './ingest.ts';
import { parseAddress, parseCode, type PcRole } from './protocol.ts';

export interface LinkView {
  state: 'off' | 'connecting' | 'connected' | 'rejected' | 'error';
  address: string;
  role: PcRole;
  sent: number;
  queued: number;
  error: string | null;
}

export const emptyLink = (): LinkView => ({ state: 'off', address: '', role: 'observer', sent: 0, queued: 0, error: null });

export interface LinkSaved {
  address: string;
  role: PcRole;
}

export interface LinkDeps {
  /** Where the producer's address and this PC's role are remembered. */
  settings: { read(): LinkSaved | null; write(value: LinkSaved | null): void };
  /** Encrypted storage for the join code. */
  secrets: { get(name: string): string | null; set(name: string, value: string | null): void };
  ingest: IngestClient;
  capture: { role: PcRole; setRole(role: PcRole): void; state: string };
  changed: () => void;
  /** This PC's name, shown on the producer's list. */
  name: () => string;
  fetch?: typeof fetch;
}

export class LinkClient {
  private readonly d: LinkDeps;

  constructor(deps: LinkDeps) {
    this.d = deps;
    deps.ingest.onChange = () => deps.changed();
  }

  view(): LinkView {
    const saved = this.d.settings.read();
    if (!saved) return emptyLink();
    const { state, lastError } = this.d.ingest;
    return { state: state === 'idle' ? 'off' : state, address: saved.address, role: this.d.capture.role, sent: this.d.ingest.sent, queued: this.d.ingest.queued, error: lastError };
  }

  private url(host: string, port: number, code: string, role: PcRole) {
    const name = encodeURIComponent(this.d.name().slice(0, 40));
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
    this.d.settings.write({ address: `${host}:${port}`, role: input.role });
    this.d.secrets.set('linkCode', code);
    this.d.ingest.target(this.url(host, port, code, input.role));
    this.d.changed();
  }

  /** Reconnects a saved link at startup, without asking again. */
  resume() {
    const saved = this.d.settings.read();
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
    this.d.settings.write(null);
    this.d.secrets.set('linkCode', null);
    this.d.changed();
  }
}
