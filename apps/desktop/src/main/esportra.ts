// The producer's Esportra account: sign-in, this PC's registration, access (online, or offline on a
// signed lease) and the scheduled matches. Talks to the existing backend endpoints:
//   POST /api/auth/desktop-login        email + password → tokens
//   POST /api/air/auth/refresh          refresh token → tokens
//   POST /api/air/session               who am I, which plan
//   POST /api/air/devices               register this PC
//   POST /api/air/access                is Air access active; returns a signed offline lease
//   GET  /api/air/broadcast/matches     the producer's scheduled matches
//   GET  /api/air/broadcast/matches/{id}/roster
//   POST /api/air/broadcast/matches/{id}/prepare   the match package: lineup with Riot ids, veto, sponsors, bracket
//   GET  /api/air/broadcast/matches/{id}/veto      the veto as the teams make it
//   GET  /api/air/broadcast/matches/{id}/bracket
//   GET/POST /api/air/broadcast/packages/{id}/result-proposals (+ /{proposal}/review)
//   POST /api/air/devices/{id}/heartbeat
//   GET  /api/air/assets/{id}                       a sponsor logo uploaded on Esportra
// Tokens live in the OS-encrypted secrets file; everything else in the saved settings. Air never
// writes scores: a counted map goes back as a result proposal the organizer reviews.

import { createHash } from 'node:crypto';
import type { EsportraAccountInfo, EsportraMatch, EsportraState, EsportraView } from '../shared/esportra.ts';
import { signedOut } from '../shared/esportra.ts';
import { leaseExpiry, verifyLease, type Lease } from './esportra-lease.ts';
import type { Secrets } from '../../../../packages/capture/src/secrets.ts';
import type { Store } from './store.ts';

export interface SavedEsportra {
  userId: string;
  email: string;
  account: EsportraAccountInfo | null;
  deviceId: string;
  access: { checkedAt: number; lastSeenAt: number; lease: Lease | null; pinnedKey: string | null; warning: string | null; denied: boolean; reason?: string | null } | null;
  matches: EsportraMatch[];
  syncedAt: number | null;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class EsportraError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ONLINE_FOR_MS = 5 * 60_000;
const TIMEOUT = 10_000;

export interface EsportraOptions {
  apiBase: string;
  store: Store;
  secrets: Pick<Secrets, 'get' | 'set'>;
  deviceId: string;
  deviceName: string;
  fetch?: typeof fetch;
  now?: () => number;
  /** Called when anything the interface shows has changed. */
  changed?: () => void;
}

export class EsportraAccount {
  private readonly o: EsportraOptions;
  private readonly base: string;
  private readonly doFetch: typeof fetch;
  private tokens: Tokens | null = null;
  private error: string | null = null;
  private refreshing: Promise<void> | null = null;
  private online = false;

  constructor(options: EsportraOptions) {
    this.o = options;
    this.base = options.apiBase.replace(/\/$/, '');
    this.doFetch = options.fetch ?? fetch;
    const saved = options.secrets.get(this.tokenKey);
    if (saved) {
      try {
        this.tokens = JSON.parse(saved) as Tokens;
      } catch {
        this.tokens = null;
      }
    }
  }

  private get tokenKey() {
    // Staging and production accounts never share a saved sign-in.
    return `esportra:${createHash('sha256').update(this.o.apiBase).digest('hex').slice(0, 12)}`;
  }
  private get saved(): SavedEsportra | null {
    return this.o.store.data.esportra ?? null;
  }
  private now() {
    return (this.o.now ?? Date.now)();
  }
  private changed() {
    this.o.changed?.();
  }

  get signedIn() {
    return !!this.tokens && !!this.saved;
  }

  /** Resumes a saved sign-in: confirms access and refreshes the match list, without ever throwing. */
  async start() {
    if (!this.signedIn) return;
    await this.checkAccess().catch(() => {});
    await this.refreshMatches().catch(() => {});
  }

  view(): EsportraView {
    const host = new URL(this.base).host;
    const saved = this.saved;
    if (!this.tokens || !saved) return { ...signedOut(host), deviceName: this.o.deviceName, error: this.error };
    const state = this.state();
    return { state, email: saved.email, account: saved.account, deviceName: this.o.deviceName, host, warning: this.warning(state), error: this.error, syncedAt: saved.syncedAt, matches: saved.matches };
  }

  private state(): EsportraState {
    const saved = this.saved;
    if (!saved?.access || saved.access.denied) return 'denied';
    const now = this.now();
    const recent = this.online && now - saved.access.checkedAt < ONLINE_FOR_MS && now >= saved.access.lastSeenAt - 300_000;
    if (recent) return 'online';
    const lease = saved.access.pinnedKey && verifyLease(saved.access.lease, { userId: saved.userId, deviceId: saved.deviceId, now, lastSeenAt: saved.access.lastSeenAt, pinnedKey: saved.access.pinnedKey });
    return lease ? 'offline' : 'denied';
  }

  private warning(state: EsportraState): string | null {
    const saved = this.saved!;
    if (state === 'denied' && saved.access?.denied && saved.access.reason) return saved.access.reason;
    if (state === 'denied') return saved.access?.denied ? 'Esportra has not turned on Air for this account yet. Your own events and matches work as normal.' : 'Air could not confirm access and no valid offline lease is saved. Reconnect to Esportra to renew it.';
    const expires = leaseExpiry(saved.access?.lease);
    if (state === 'offline') return `Working offline on a verified lease${expires ? ` (valid until ${new Date(expires).toLocaleString()})` : ''}. Reconnect before it expires.`;
    if (expires && expires - this.now() < 86_400_000) return 'Offline access expires within 24 hours. Stay connected before your next broadcast.';
    return saved.access?.warning ?? null;
  }

  // ── sign-in ──

  async login(email: string, password: string) {
    if (typeof email !== 'string' || !email.trim() || email.length > 254 || typeof password !== 'string' || !password || password.length > 4096) throw new Error('Enter your Esportra email and password.');
    const response = await this.send('/api/auth/desktop-login', { email: email.trim(), password }, { auth: false });
    if (!response.ok) throw new EsportraError(response.status === 429 ? 'Too many sign-in attempts. Wait a minute and try again.' : response.status >= 500 ? 'Esportra is unavailable. Try again shortly.' : 'Sign-in failed. Check your email and password.', response.status);
    const previous = { tokens: this.tokens, saved: this.saved };
    this.tokens = this.readTokens(await response.json());
    try {
      const session = await this.json<{ userId: string; account: EsportraAccountInfo | null }>('/api/air/session', { method: 'POST' });
      if (!UUID.test(session.userId)) throw new Error('Esportra did not return an account identity.');
      this.o.store.data.esportra = { userId: session.userId, email: email.trim(), account: session.account ?? null, deviceId: this.o.deviceId, access: null, matches: [], syncedAt: null };
      this.persistTokens();
      this.error = null;
      await this.checkAccess().catch(() => {});
      await this.refreshMatches().catch(() => {});
    } catch (error) {
      this.tokens = previous.tokens;
      this.o.store.data.esportra = previous.saved ?? undefined;
      throw error;
    }
    this.o.store.save();
    this.changed();
  }

  logout() {
    this.tokens = null;
    this.error = null;
    this.online = false;
    this.o.secrets.set(this.tokenKey, null);
    delete this.o.store.data.esportra;
    this.o.store.save();
    this.changed();
  }

  // ── access and matches ──

  /** Registers this PC and asks whether Air access is active. Stores the signed offline lease. */
  async checkAccess() {
    const saved = this.saved;
    if (!saved) throw new Error('Sign in to Esportra first.');
    try {
      const session = await this.json<{ userId: string; account: EsportraAccountInfo | null }>('/api/air/session', { method: 'POST' });
      if (session.userId !== saved.userId) throw new Error('The signed-in account changed. Sign in again.');
      saved.account = session.account ?? null;
      await this.json('/api/air/devices', { method: 'POST', body: { deviceId: saved.deviceId, name: this.o.deviceName, mode: 'production' } });
      const result = await this.json<{ offlineLease?: Lease | null; offlineWarning?: string | null }>('/api/air/access', { method: 'POST', body: { deviceId: saved.deviceId } });
      const now = this.now();
      const previous = saved.access?.lastSeenAt ?? 0;
      const lease = result.offlineLease ?? null;
      if (lease && !verifyLease(lease, { userId: saved.userId, deviceId: saved.deviceId, now, lastSeenAt: previous, pinnedKey: lease.publicKey })) {
        throw new Error('Access verification failed. Check this PC’s date and time, then reconnect.');
      }
      saved.access = { checkedAt: now, lastSeenAt: Math.max(now, previous), lease, pinnedKey: lease?.publicKey ?? null, warning: result.offlineWarning ?? null, denied: false };
      this.online = true;
      this.error = null;
    } catch (error) {
      const status = (error as EsportraError).status;
      if (status === 401 || status === 403 || status === 409) {
        // Refused: no lease may outlive an explicit refusal.
        // A full device allowance is not a missing plan: say which it is.
        const reason = status === 409 ? 'Your Air plan’s device allowance is full, so this PC cannot be registered. Remove a PC on Esportra or ask your admin for more.' : null;
        saved.access = { checkedAt: this.now(), lastSeenAt: saved.access?.lastSeenAt ?? 0, lease: null, pinnedKey: null, warning: null, denied: true, reason };
        this.online = true;
      } else {
        this.online = false;
      }
      this.error = (error as Error).message;
      this.o.store.save();
      this.changed();
      throw error;
    }
    this.o.store.save();
    this.changed();
  }

  /** Reads the producer's scheduled matches. The last list is kept for offline use. */
  async refreshMatches() {
    const saved = this.saved;
    if (!saved) throw new Error('Sign in to Esportra first.');
    const { matches } = await this.json<{ matches: Array<Record<string, unknown>> }>('/api/air/broadcast/matches');
    saved.matches = (matches ?? []).map(readMatch).filter((m): m is EsportraMatch => m !== null);
    saved.syncedAt = this.now();
    this.o.store.save();
    this.changed();
  }

  async roster(matchId: string) {
    if (!UUID.test(matchId)) throw new Error('Choose an Esportra match.');
    type Side = { name: string; players: Array<{ displayName: string }>; lineup?: unknown };
    return this.json<{ team1: Side; team2: Side }>(`/api/air/broadcast/matches/${matchId}/roster`);
  }

  /** The match package. The same `requestId` returns the same version (safe to retry). */
  async prepare(matchId: string, requestId: string) {
    if (!UUID.test(matchId) || !UUID.test(requestId)) throw new Error('Choose an Esportra match.');
    return this.json<unknown>(`/api/air/broadcast/matches/${matchId}/prepare`, { method: 'POST', body: { requestId } });
  }

  async veto(matchId: string) {
    if (!UUID.test(matchId)) throw new Error('Choose an Esportra match.');
    return this.json<{ status?: string; bestOf?: number; steps?: unknown; mapPool?: unknown; sequence?: unknown; turn?: unknown; toss?: unknown }>(`/api/air/broadcast/matches/${matchId}/veto`);
  }

  async bracket(matchId: string) {
    if (!UUID.test(matchId)) throw new Error('Choose an Esportra match.');
    return this.json<unknown>(`/api/air/broadcast/matches/${matchId}/bracket`);
  }

  async proposeResult(packageId: string, body: { clientKey: string; mapNumber: number; teamAScore: number; teamBScore: number; reason: string }) {
    if (!UUID.test(packageId)) throw new Error('This match has no Esportra package yet.');
    return this.json<{ proposalId: string }>(`/api/air/broadcast/packages/${packageId}/result-proposals`, { method: 'POST', body });
  }

  async results(packageId: string) {
    if (!UUID.test(packageId)) throw new Error('This match has no Esportra package yet.');
    return this.json<{ canReview?: boolean; proposals?: Array<Record<string, unknown>> }>(`/api/air/broadcast/packages/${packageId}/result-proposals`);
  }

  async reviewResult(packageId: string, proposalId: string, body: { decision: 'apply' | 'reject'; currentTeamAScore: number | null; currentTeamBScore: number | null }) {
    if (!UUID.test(packageId) || !UUID.test(proposalId)) throw new Error('Choose a result again.');
    return this.json<{ status: string }>(`/api/air/broadcast/packages/${packageId}/result-proposals/${proposalId}/review`, { method: 'POST', body });
  }

  /** Tells Esportra this PC is alive and what it is doing (shown to the account owner on Esportra). */
  async heartbeat(health: { appVersion: string; obsConnected: boolean; captureActive: boolean; productionActive: boolean; feedState: 'waiting' | 'live' | 'stale' | 'offline' }) {
    const saved = this.saved;
    if (!saved || !this.tokens) return;
    try {
      await this.json(`/api/air/devices/${saved.deviceId}/heartbeat`, { method: 'POST', body: { ...health, appVersion: health.appVersion.slice(0, 40), projectId: null } });
    } catch (error) {
      // A revoked PC: find out properly, so the interface says so.
      if ((error as EsportraError).status === 403) await this.checkAccess().catch(() => {});
      throw error;
    }
  }

  /** A logo uploaded on Esportra (PNG, JPEG or WebP, up to 5 MB). */
  async asset(assetId: string): Promise<{ bytes: Buffer; type: string }> {
    if (!UUID.test(assetId)) throw new Error('Choose a logo again.');
    if (!this.tokens) throw new EsportraError('Sign in to Esportra first.', 401);
    if (this.tokens.expiresAt < this.now() + 30_000) await this.refresh();
    const response = await this.send(`/api/air/assets/${assetId}`, undefined, { method: 'GET', headers: { Authorization: `Bearer ${this.tokens!.accessToken}`, 'X-Air-Device-Id': this.o.deviceId } });
    if (!response.ok) throw new EsportraError('Esportra could not send this logo.', response.status);
    const type = String(response.headers.get('content-type') ?? '').split(';')[0]!.trim();
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 5_242_880) throw new Error('That logo is larger than 5 MB.');
    return { bytes, type };
  }

  // ── transport ──

  private readTokens(input: any): Tokens {
    if (!input?.access_token || !input.refresh_token || !Number.isFinite(Number(input.expires_in))) throw new Error('Esportra returned an incomplete sign-in.');
    return { accessToken: String(input.access_token), refreshToken: String(input.refresh_token), expiresAt: this.now() + Math.min(86_400, Number(input.expires_in)) * 1000 };
  }

  private persistTokens() {
    this.o.secrets.set(this.tokenKey, this.tokens ? JSON.stringify(this.tokens) : null);
  }

  private async send(route: string, body: unknown, options: { auth?: boolean; method?: string; headers?: Record<string, string> } = {}) {
    try {
      return await this.doFetch(this.base + route, {
        method: options.method ?? 'POST',
        headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT),
        redirect: 'error',
      });
    } catch {
      throw new EsportraError('Esportra is not reachable from this PC.', 0);
    }
  }

  private refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    const operation = (async () => {
      const token = this.tokens?.refreshToken;
      if (!token) throw new EsportraError('Sign in again to renew the account session.', 401);
      const response = await this.send('/api/air/auth/refresh', { refreshToken: token });
      if (!response.ok) {
        if (response.status === 401) {
          // The session is over: keep nothing that could look signed in.
          this.tokens = null;
          this.persistTokens();
          this.error = 'Your Esportra session ended. Sign in again.';
          this.changed();
        }
        throw new EsportraError(response.status === 401 ? 'Sign in again to renew the account session.' : 'Esportra is unavailable.', response.status);
      }
      this.tokens = this.readTokens(await response.json());
      this.persistTokens();
    })();
    this.refreshing = operation.finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async json<T = unknown>(route: string, options: { method?: string; body?: unknown } = {}, retry = true): Promise<T> {
    if (!this.tokens) throw new EsportraError('Sign in to Esportra first.', 401);
    if (this.tokens.expiresAt < this.now() + 30_000) await this.refresh();
    const response = await this.send(route, options.body, {
      method: options.method ?? (options.body !== undefined || route.startsWith('/api/air/session') ? 'POST' : 'GET'),
      headers: { Authorization: `Bearer ${this.tokens!.accessToken}`, 'X-Air-Device-Id': this.o.deviceId },
    });
    if (response.status === 401 && retry) {
      await this.refresh();
      return this.json<T>(route, options, false);
    }
    if (!response.ok) {
      let message = 'Esportra could not complete this request.';
      try {
        const body = (await response.json()) as { error?: string };
        if (body.error) message = String(body.error);
      } catch {
        // keep the generic message
      }
      throw new EsportraError(message, response.status);
    }
    this.online = true;
    return (await response.json()) as T;
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const link = (v: unknown) => (typeof v === 'string' && /^https:\/\//i.test(v) ? v : null);

/** Maps one backend row, ignoring anything malformed. Property names are the backend's (PascalCase or camelCase). */
function readMatch(row: Record<string, unknown>): EsportraMatch | null {
  const pick = (k: string) => row[k] ?? row[k.charAt(0).toUpperCase() + k.slice(1)];
  const id = str(pick('id'));
  if (!UUID.test(id)) return null;
  const bestOf = Number(pick('bestOf'));
  return {
    id,
    tournamentId: str(pick('tournamentId')),
    tournament: str(pick('tournamentName')),
    game: str(pick('game')),
    teamA: str(pick('teamA')).slice(0, 40) || 'Team A',
    teamB: str(pick('teamB')).slice(0, 40) || 'Team B',
    tagA: str(pick('tagA')).slice(0, 6),
    tagB: str(pick('tagB')).slice(0, 6),
    logoA: link(pick('logoA')),
    logoB: link(pick('logoB')),
    scheduledAt: str(pick('scheduledAt')) || null,
    status: str(pick('status')),
    bestOf: [1, 3, 5].includes(bestOf) ? bestOf : 3,
    supported: pick('supported') === true,
  };
}
