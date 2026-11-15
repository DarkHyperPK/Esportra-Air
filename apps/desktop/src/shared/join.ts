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

/**
 * Which PC's match data is used. Only one observer PC (or this PC's own capture) is the game data
 * source at a time; the others are held back, so a second observer cannot count every kill twice.
 * Ids are `this-pc` or `peer:<joined PC id>`.
 */
export interface DataSourcesView {
  active: string | null;
  sources: Array<{ id: string; active: boolean; ageMs: number; held: number }>;
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
  /** Which PC's match data is used (while joining is on), or null before it is known. */
  dataSources: DataSourcesView | null;
  error: string | null;
}

export type PcMode = 'production' | 'capture';

export const emptyJoin = (): JoinView => ({ enabled: false, code: null, port: 5301, addresses: [], peers: [], dataSources: null, error: null });
