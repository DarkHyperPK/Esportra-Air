// Observer and player PCs on the same network (Stage 3, local mode).

import type { PcRole } from '../../../../packages/capture/src/protocol.ts';
export type { PcRole };
export { CODE_ALPHABET, formatCode, parseCode } from '../../../../packages/capture/src/protocol.ts';
export type { LinkView } from '../../../../packages/capture/src/link.ts';
export { emptyLink } from '../../../../packages/capture/src/link.ts';

export interface JoinedPc {
  id: number;
  role: PcRole;
  name: string;
  ip: string;
  since: number;
  lastAgeMs: number | null;
  messages: number;
  /** A player PC's in-game player id, once its game has sent it. */
  playerId?: string | null;
}

/** The producer's side: allow other PCs to send game data to this Air with a short code. */
export interface JoinView {
  enabled: boolean;
  /** Shown to the producer, who reads it out to the other PC's operator. Only while joining is on. */
  code: string | null;
  port: number;
  /** This PC's addresses on the local network, for the other PC to type in. */
  addresses: string[];
  peers: JoinedPc[];
  error: string | null;
}

export type PcMode = 'production' | 'capture';

export const emptyJoin = (): JoinView => ({ enabled: false, code: null, port: 5301, addresses: [], peers: [], error: null });
