// The Esportra account contract shared by the main process and the interface (Stage 2).

/** A scheduled match from the Esportra backend (`/api/air/broadcast/matches`). */
export interface EsportraMatch {
  id: string;
  tournamentId: string;
  tournament: string;
  game: string;
  teamA: string;
  teamB: string;
  tagA: string;
  tagB: string;
  logoA: string | null;
  logoB: string | null;
  scheduledAt: string | null;
  status: string;
  bestOf: number;
  /** Air can produce this game (Valorant only for now). */
  supported: boolean;
}

export interface EsportraAccountInfo {
  status: string;
  validUntil: string | null;
  trialEndsAt: string | null;
}

/**
 * signed-out: no account. online: signed in and access confirmed just now. offline: signed in, the
 * backend is unreachable, and a signed lease still proves access. denied: the backend refused access
 * (expired plan, revoked PC). Quick matches work in every state.
 */
export type EsportraState = 'signed-out' | 'online' | 'offline' | 'denied';

/** This account's latest request for Air access (`/api/air/access-request`). */
export interface EsportraAccessRequest {
  status: 'pending' | 'granted' | 'declined' | 'withdrawn';
  note: string;
  /** Why it was declined, in Esportra's words. */
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface EsportraView {
  state: EsportraState;
  email: string | null;
  account: EsportraAccountInfo | null;
  /** The name this PC is registered under. */
  deviceName: string;
  /** The backend host, shown so the producer can tell staging from production. */
  host: string;
  warning: string | null;
  error: string | null;
  syncedAt: number | null;
  matches: EsportraMatch[];
  /** The latest access request, while access is refused. */
  request?: EsportraAccessRequest | null;
  /** Access was refused in a way a request can fix (not a full PC allowance). */
  canRequest?: boolean;
}

export const signedOut = (host = ''): EsportraView => ({ state: 'signed-out', email: null, account: null, deviceName: '', host, warning: null, error: null, syncedAt: null, matches: [] });
