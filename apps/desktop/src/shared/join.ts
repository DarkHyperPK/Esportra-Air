// Observer and player PCs on the same network (Stage 3, local mode).

export type PcRole = 'observer' | 'player';

export interface JoinedPc {
  id: number;
  role: PcRole;
  name: string;
  ip: string;
  since: number;
  lastAgeMs: number | null;
  messages: number;
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

/** The capture-only side: this PC sends its game data to a producer's Air. */
export interface LinkView {
  state: 'off' | 'connecting' | 'connected' | 'rejected' | 'error';
  address: string;
  role: PcRole;
  sent: number;
  queued: number;
  error: string | null;
}

export type PcMode = 'production' | 'capture';

export const emptyJoin = (): JoinView => ({ enabled: false, code: null, port: 5301, addresses: [], peers: [], error: null });
export const emptyLink = (): LinkView => ({ state: 'off', address: '', role: 'observer', sent: 0, queued: 0, error: null });

/** Letters and digits without the look-alikes (0 O 1 I L), so a code can be read aloud. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const formatCode = (code: string) => `${code.slice(0, 3)}-${code.slice(3)}`;
export const parseCode = (input: string) => input.toUpperCase().replace(/[^A-Z0-9]/g, '');
