// A small stand-in for the Esportra backend's Air endpoints, for tests and the dev walkthrough.
// Mirrors the request/response shapes of the real backend (AuthEndpoints, AirAccountEndpoints,
// AirBroadcastEndpoints, AirBroadcastPublication, AirResultReview, AirBroadcastVeto, read 15 Nov) closely
// enough to exercise sign-in, device registration and its limit, signed offline leases, token refresh,
// the match list, prepare (configurationJson is a JSON string), the live veto, the bracket, result
// proposals and their review, heartbeats and logos uploaded on Esportra.
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { generateKeyPairSync, randomUUID, sign, constants } from 'node:crypto';

export interface FakeMatch {
  id: string;
  tournamentId: string;
  tournamentName: string;
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
}

export interface FakeVetoStep { team: number; action: 'ban' | 'pick' | 'decider'; map: string; side: string | null; sideTeam?: number | null }
export interface FakeVeto { status: string; steps: FakeVetoStep[]; sequence: Array<{ action: string; team: number }> | null; turn: { team: number; action: string; startedAt: string; seconds: number } | null; toss: { pending: boolean; winner: number | null } | null }
export interface FakeProposal { id: string; packageId: string; mapNumber: number; teamAScore: number; teamBScore: number; reason: string; status: 'pending' | 'apply' | 'reject' }

/** A 1×1 PNG, served as a sponsor logo uploaded on Esportra. */
export const FAKE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

export class FakeEsportra {
  readonly userId = randomUUID();
  readonly email = 'producer@example.com';
  readonly password = 'correct horse battery';
  /** Access can be switched off, as when a plan expires. */
  allowed = true;
  /** Simulates the backend being unreachable (connections are dropped). */
  down = false;
  /** Token lifetime in seconds. */
  tokenSeconds = 3600;
  matches: FakeMatch[] = [];
  readonly calls: string[] = [];
  readonly devices = new Map<string, { name: string; mode: string }>();
  /** Production PCs the plan allows (null: no limit). */
  deviceLimit: number | null = null;
  /** The veto per match, as the teams make it on Esportra (map names as Esportra spells them). */
  readonly vetoes = new Map<string, FakeVeto>();
  readonly mapPool = ['Abyss', 'Ascent', 'Bind', 'Corrode', 'Haven', 'Lotus', 'Sunset'];
  /** The production draft's sponsors and talent (prepare copies them into the package). */
  draft: { sponsors: Array<{ name: string; logoUrl?: string; assetId?: string }>; talent: Array<{ name: string; role?: string }> } = {
    sponsors: [{ name: 'Northwind', logoUrl: 'https://example.com/northwind.png' }, { name: 'Bluefin', assetId: '7d8c2c55-3a4e-4a8c-9f0e-1b2a3c4d5e6f' }],
    talent: [{ name: 'Sam Rivers', role: 'Caster' }, { name: 'Alex Moore', role: 'Host' }],
  };
  /** Players with a verified Riot account (their PUUID); the rest have only a registered name. */
  readonly riot = new Map<string, string>();
  readonly packages = new Map<string, { id: string; matchId: string; version: number; hash: string; requests: Map<string, number> }>();
  readonly proposals: FakeProposal[] = [];
  /** This account may apply or reject results (organizer, or crew allowed to submit). */
  canReview = true;
  /** The next N proposals fail as if Esportra were unavailable. */
  failProposals = 0;
  readonly heartbeats: Array<Record<string, unknown>> = [];
  /** Official map scores per match, as reviews apply them. */
  readonly official = new Map<string, Map<number, [number, number]>>();
  private readonly bracketIds = new Map<string, [string, string]>();
  private readonly keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  private readonly publicKey = this.keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  private access = 1;
  private refresh = 1;
  private server: Server | null = null;
  port = 0;

  constructor() {
    const soon = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
    const base = { tournamentId: randomUUID(), tournamentName: 'Community Cup', game: 'valorant', logoA: 'https://example.com/a.png', logoB: null, bestOf: 3 };
    this.matches = [
      { ...base, id: randomUUID(), teamA: 'Vanguard Esports', teamB: 'Helix Gaming', tagA: 'VGD', tagB: 'HLX', scheduledAt: soon(2), status: 'scheduled' },
      { ...base, id: randomUUID(), teamA: 'Nova Rising', teamB: 'Ironclad', tagA: 'NVR', tagB: 'ICD', scheduledAt: soon(26), status: 'scheduled', bestOf: 1 },
    ];
  }

  /** The registered starters of a team, as `BroadcastRosterName` (camelCase). */
  lineup(tag: string) {
    return ['One', 'Two', 'Three', 'Four', 'Five'].map((p) => {
      const name = `${tag} ${p}`;
      const gameId = this.riot.get(name);
      return { name, role: 'starter', playerId: null, inGameName: gameId ? `${tag}${p}#${tag}` : null, gameId: gameId ?? null };
    }).concat([{ name: `${tag} Coach`, role: 'coach', playerId: null, inGameName: null, gameId: null }]);
  }

  /** Esportra's default order for Valorant (VetoSequences.cs), as the veto route sends it. */
  defaultOrder(bestOf: number) {
    const o = bestOf === 1 ? ['ban', 'ban', 'ban', 'ban', 'ban', 'ban'] : bestOf === 5 ? ['ban', 'ban', 'pick', 'pick', 'pick', 'pick'] : ['ban', 'ban', 'pick', 'pick', 'ban', 'ban'];
    return [...o.map((action, i) => ({ action, team: i % 2 })), { action: 'decider', team: -1 }];
  }

  vetoOf(matchId: string) {
    let v = this.vetoes.get(matchId);
    if (!v) this.vetoes.set(matchId, (v = { status: 'not_started', steps: [], sequence: null, turn: null, toss: null }));
    return v;
  }

  bracket(m: FakeMatch) {
    // A four-team single elimination: two semi-finals (this match is the first) and the final.
    let ids = this.bracketIds.get(m.id);
    if (!ids) this.bracketIds.set(m.id, (ids = [randomUUID(), randomUUID()]));
    const [semi2, final] = ids;
    const team = (name: string) => ({ id: null, name, logoUrl: null });
    return {
      stages: [{ id: m.tournamentId, label: 'Playoffs', format: 'single_elimination', standings: [], matches: [
        { id: m.id, matchId: m.id, round: 1, side: 'upper', group: null },
        { id: semi2, matchId: semi2, round: 1, side: 'upper', group: null },
        { id: final, matchId: final, round: 2, side: 'upper', group: null },
      ] }],
      matches: [
        { matchId: m.id, status: m.status, scores: [0, 0], winnerId: null, teams: [team(m.teamA), team(m.teamB)] },
        { matchId: semi2, status: 'completed', scores: [2, 1], winnerId: null, teams: [team('Night Owls'), team('Crimson Five')] },
        { matchId: final, status: 'pending', scores: [null, null], winnerId: null, teams: [team('Night Owls'), team('To be decided')] },
      ],
      fetchedAt: new Date().toISOString(),
    };
  }

  private configuration(m: FakeMatch, packageId: string) {
    const v = this.vetoOf(m.id);
    const slot = (name: string, tag: string, logo: string | null, i: number) => ({ name, tag, logoUrl: logo, seriesScore: [...(this.official.get(m.id)?.values() ?? [])].filter((s) => s[i]! > s[1 - i]!).length, teamId: null, roster: this.lineup(tag) });
    return {
      showId: packageId, title: m.tournamentName, status: 'draft', matches: [], casters: this.draft.talent.map((t) => ({ ...t, displayName: t.name })), sponsors: this.draft.sponsors.map((s, i) => ({ ...s, displayOrder: i, ...(s.assetId ? { logoUrl: `/air-assets/${s.assetId}` } : {}) })),
      teams: [slot(m.teamA, m.tagA, m.logoA, 0), slot(m.teamB, m.tagB, m.logoB, 1)],
      eventLabel: m.tournamentName, seriesTotal: m.bestOf, tournamentId: m.tournamentId, game: 'valorant',
      veto: v.steps.map((s) => ({ ...s, pickedByTeam: s.team })), vetoSequence: v.sequence ?? this.defaultOrder(m.bestOf), vetoStatus: v.status, mapPool: this.mapPool, packageId, packId: 'esportra-valorant-v1', source: 'esportra', schemaVersion: 1,
      bracketSnapshot: this.bracket(m),
    };
  }

  get url() {
    return `http://127.0.0.1:${this.port}`;
  }

  async start(port = 0) {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((done) => this.server!.listen(port, '127.0.0.1', done));
    this.port = (this.server.address() as { port: number }).port;
    return this;
  }

  async stop() {
    this.server?.closeAllConnections();
    await new Promise((done) => this.server?.close(done));
  }

  private lease(deviceId: string, hours = 72) {
    const now = Date.now();
    const payload = Buffer.from(JSON.stringify({ version: 1, userId: this.userId, deviceId, issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + hours * 3600_000).toISOString() }));
    const signature = sign('RSA-SHA256', payload, { key: this.keys.privateKey, padding: constants.RSA_PKCS1_PADDING });
    return { algorithm: 'RS256', publicKey: this.publicKey, payload: payload.toString('base64'), signature: signature.toString('base64') };
  }

  private tokens() {
    return { access_token: `access-${this.access++}`, refresh_token: `refresh-${this.refresh}`, expires_in: this.tokenSeconds };
  }

  private async body(req: IncomingMessage): Promise<any> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    try {
      return JSON.parse(Buffer.concat(chunks).toString() || '{}');
    } catch {
      return {};
    }
  }

  private async handle(req: IncomingMessage, res: import('node:http').ServerResponse) {
    if (this.down) return req.socket.destroy();
    const route = `${req.method} ${new URL(req.url ?? '/', this.url).pathname}`;
    this.calls.push(route);
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const body = await this.body(req);
    if (route === 'POST /api/auth/desktop-login') {
      return body.email === this.email && body.password === this.password ? send(200, this.tokens()) : send(401, { error: 'Invalid email or password.' });
    }
    if (route === 'POST /api/air/auth/refresh') {
      if (body.refreshToken !== `refresh-${this.refresh}`) return send(401, { error: 'Session expired.' });
      return send(200, this.tokens());
    }
    // Everything else needs a current access token.
    const auth = /^Bearer access-(\d+)$/.exec(String(req.headers.authorization ?? ''));
    if (!auth || this.expired.has(auth[1]!)) return send(401, { error: 'Unauthorized' });
    const deviceId = String(req.headers['x-air-device-id'] ?? '');
    if (/^GET \/api\/air\/assets\/[0-9a-f-]{36}$/.test(route)) {
      if (!this.draft.sponsors.some((s) => route.endsWith(String(s.assetId)))) return send(404, {});
      res.writeHead(200, { 'Content-Type': 'image/png' });
      return res.end(FAKE_PNG);
    }
    switch (route) {
      case 'POST /api/air/session':
        return send(200, { userId: this.userId, account: { status: this.allowed ? 'trial' : 'expired', validUntil: new Date(Date.now() + 30 * 86400_000).toISOString(), trialEndsAt: null }, workspaces: [] });
      case 'POST /api/air/devices':
        if (!this.allowed) return send(403, { error: 'Air access has expired or was suspended.' });
        if (!['production', 'capture-only'].includes(body.mode)) return send(400, { error: 'Choose a valid device and PC role.' });
        if (!this.devices.has(String(body.deviceId)) && this.deviceLimit !== null && this.devices.size >= this.deviceLimit) return send(409, { error: "Your plan's device allowance is full. Ask your admin to update access." });
        this.devices.set(String(body.deviceId), { name: String(body.name), mode: String(body.mode) });
        return send(200, { deviceId: body.deviceId });
      case 'POST /api/air/access':
        if (!this.allowed) return send(403, { error: 'Air access expired or was suspended. Existing production must finish before starting another match.' });
        return send(200, { allowed: true, serverTime: new Date().toISOString(), validUntil: new Date(Date.now() + 30 * 86400_000).toISOString(), offlineLease: this.lease(String(body.deviceId)), offlineWarning: null });
      case 'GET /api/air/broadcast/matches':
        if (!this.allowed || !this.devices.has(deviceId)) return send(403, { error: 'An active Air account and registered production PC are required.' });
        return send(200, { matches: this.matches.map((m) => ({ ...m, packId: m.game === 'valorant' ? 'esportra-valorant-v1' : null, supported: m.game === 'valorant' })) });
      default:
        return this.routes(route, body, deviceId, send);
    }
  }

  private routes(route: string, body: any, deviceId: string, send: (status: number, body: unknown) => void) {
    const heartbeat = /^POST \/api\/air\/devices\/([0-9a-f-]{36})\/heartbeat$/.exec(route);
    if (heartbeat) {
      if (!this.devices.has(heartbeat[1]!) || !this.allowed) return send(403, { error: 'Device access was revoked.' });
      this.heartbeats.push(body);
      return send(200, { acknowledged: true });
    }
    if (!this.allowed || !this.devices.has(deviceId)) return send(403, { error: 'An active Air account and registered production PC are required.' });
    const m = /^(GET|POST) \/api\/air\/broadcast\/matches\/([0-9a-f-]{36})\/(roster|prepare|veto|bracket)$/.exec(route);
    if (m) {
      const match = this.matches.find((x) => x.id === m[2]);
      if (!match) return send(404, { error: 'This match is unavailable or you no longer have broadcast access.' });
      if (m[3] === 'roster') {
        const side = (name: string, tag: string, logo: string | null) => ({ id: randomUUID(), name, tag, logo, players: [{ participantId: randomUUID(), teamId: randomUUID(), userId: null, displayName: name, avatarUrl: null, role: 'team' }], lineup: this.lineup(tag) });
        return send(200, { matchId: match.id, team1: side(match.teamA, match.tagA, match.logoA), team2: side(match.teamB, match.tagB, match.logoB) });
      }
      if (m[3] === 'veto') {
        const v = this.vetoOf(match.id);
        return send(200, { matchId: match.id, status: v.status, bestOf: match.bestOf, steps: v.steps.map((s) => ({ ...s, pickedByTeam: s.team })), mapPool: this.mapPool, sequence: v.sequence ?? this.defaultOrder(match.bestOf), turn: v.turn, toss: v.toss, team1Id: null, team2Id: null });
      }
      if (m[3] === 'bracket') return send(200, this.bracket(match));
      return this.prepare(match, body, send);
    }
    const p = /^(GET|POST) \/api\/air\/broadcast\/packages\/([0-9a-f-]{36})\/result-proposals(?:\/([0-9a-f-]{36})\/review)?$/.exec(route);
    if (p) return this.results(p[1]!, p[2]!, p[3], body, send);
    return send(404, { error: 'Unknown route.' });
  }

  private prepare(match: FakeMatch, body: any, send: (status: number, body: unknown) => void) {
    if (!/^[0-9a-f-]{36}$/.test(String(body.requestId ?? ''))) return send(400, { error: 'Provide a preparation request identity.' });
    let pkg = [...this.packages.values()].find((x) => x.matchId === match.id);
    if (!pkg) this.packages.set(match.id, (pkg = { id: randomUUID(), matchId: match.id, version: 0, hash: '', requests: new Map() }));
    const config = this.configuration(match, pkg.id);
    // Retrieval time is not content: an unchanged match gives the same version.
    const hash = JSON.stringify({ ...config, bracketSnapshot: { ...config.bracketSnapshot, fetchedAt: null } });
    const prior = pkg.requests.get(body.requestId);
    if (prior === undefined && hash !== pkg.hash) { pkg.version++; pkg.hash = hash; }
    pkg.requests.set(body.requestId, prior ?? pkg.version);
    const configurationJson = JSON.stringify({ ...config, rundownVersion: pkg.version, packageVersion: pkg.version });
    return send(200, { id: pkg.id, version: prior ?? pkg.version, checksum: 'fake', configurationJson, createdAt: new Date().toISOString() });
  }

  private results(method: string, packageId: string, proposalId: string | undefined, body: any, send: (status: number, body: unknown) => void) {
    const pkg = [...this.packages.values()].find((x) => x.id === packageId);
    if (!pkg) return send(404, {});
    const match = this.matches.find((x) => x.id === pkg.matchId)!;
    if (method === 'GET') {
      const official = this.official.get(match.id);
      return send(200, { canReview: this.canReview, proposals: this.proposals.filter((x) => x.packageId === packageId).map((x) => ({
        id: x.id, packageId, status: x.status, currentTeamAScore: official?.get(x.mapNumber)?.[0] ?? null, currentTeamBScore: official?.get(x.mapNumber)?.[1] ?? null,
        proposal: { mapNumber: x.mapNumber, teamAScore: x.teamAScore, teamBScore: x.teamBScore, reason: x.reason, bestOf: match.bestOf },
      })) });
    }
    if (proposalId) {
      if (!['apply', 'reject'].includes(body.decision)) return send(400, {});
      if (!this.canReview) return send(403, {});
      const x = this.proposals.find((y) => y.id === proposalId && y.packageId === packageId);
      if (!x) return send(404, {});
      if (x.status !== 'pending') return send(409, { error: 'This proposal was already reviewed.' });
      const official = this.official.get(match.id) ?? new Map<number, [number, number]>();
      const current = official.get(x.mapNumber);
      if ((current?.[0] ?? null) !== body.currentTeamAScore || (current?.[1] ?? null) !== body.currentTeamBScore) return send(409, { error: 'Official scores changed. Reload before reviewing.' });
      x.status = body.decision;
      if (body.decision === 'apply') { official.set(x.mapNumber, [x.teamAScore, x.teamBScore]); this.official.set(match.id, official); }
      return send(200, { status: body.decision });
    }
    if (this.failProposals > 0) { this.failProposals--; return send(503, { error: 'Esportra is unavailable.' }); }
    const { clientKey, mapNumber, teamAScore, teamBScore, reason } = body;
    if (!/^[0-9a-f-]{36}$/.test(String(clientKey)) || !(mapNumber >= 1 && mapNumber <= 9) || teamAScore < 0 || teamBScore < 0 || teamAScore === teamBScore || !String(reason ?? '').trim() || String(reason).length > 500) return send(400, { error: 'Choose a decisive map score and a reason.' });
    if (mapNumber > match.bestOf) return send(409, { error: 'The match is closed or its format changed.' });
    const prior = this.proposals.find((x) => x.id === clientKey);
    if (prior) return prior.mapNumber === mapNumber && prior.teamAScore === teamAScore && prior.teamBScore === teamBScore ? send(200, { proposalId: clientKey, idempotent: true }) : send(409, { error: 'This proposal identity already belongs to another result.' });
    this.proposals.push({ id: clientKey, packageId, mapNumber, teamAScore, teamBScore, reason: String(reason).trim(), status: 'pending' });
    return send(200, { proposalId: clientKey, status: 'pending' });
  }

  private expired = new Set<string>();
  /** Every access token issued so far stops working (the refresh token still does). */
  expireNow() {
    for (let i = 1; i < this.access; i++) this.expired.add(String(i));
  }
}
