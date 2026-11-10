// A small stand-in for the Esportra backend's Air endpoints, for tests and the dev walkthrough.
// Mirrors the request/response shapes of the real backend (AuthEndpoints, AirAccountEndpoints,
// AirBroadcastEndpoints) closely enough to exercise sign-in, device registration, signed offline
// leases, token refresh and the match list.
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
      { ...base, id: randomUUID(), teamA: 'Paper Rex', teamB: 'Fnatic', tagA: 'PRX', tagB: 'FNC', scheduledAt: soon(2), status: 'scheduled' },
      { ...base, id: randomUUID(), teamA: 'Team Liquid', teamB: 'Gen.G', tagA: 'TL', tagB: 'GEN', scheduledAt: soon(26), status: 'scheduled', bestOf: 1 },
    ];
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
    switch (route) {
      case 'POST /api/air/session':
        return send(200, { userId: this.userId, account: { status: this.allowed ? 'trial' : 'expired', validUntil: new Date(Date.now() + 30 * 86400_000).toISOString(), trialEndsAt: null }, workspaces: [] });
      case 'POST /api/air/devices':
        if (!this.allowed) return send(403, { error: 'Air access has expired or was suspended.' });
        if (!['production', 'capture-only'].includes(body.mode)) return send(400, { error: 'Choose a valid device and PC role.' });
        this.devices.set(String(body.deviceId), { name: String(body.name), mode: String(body.mode) });
        return send(200, { deviceId: body.deviceId });
      case 'POST /api/air/access':
        if (!this.allowed) return send(403, { error: 'Air access expired or was suspended. Existing production must finish before starting another match.' });
        return send(200, { allowed: true, serverTime: new Date().toISOString(), validUntil: new Date(Date.now() + 30 * 86400_000).toISOString(), offlineLease: this.lease(String(body.deviceId)), offlineWarning: null });
      case 'GET /api/air/broadcast/matches':
        if (!this.allowed || !this.devices.has(deviceId)) return send(403, { error: 'An active Air account and registered production PC are required.' });
        return send(200, { matches: this.matches.map((m) => ({ ...m, packId: 'valorant', supported: m.game === 'valorant' })) });
      default: {
        const roster = /^GET \/api\/air\/broadcast\/matches\/([0-9a-f-]{36})\/roster$/.exec(route);
        if (roster) {
          const m = this.matches.find((x) => x.id === roster[1]);
          if (!m) return send(404, {});
          const players = (n: string) => ['One', 'Two', 'Three', 'Four', 'Five'].map((p) => ({ displayName: `${n} ${p}` }));
          return send(200, { matchId: m.id, team1: { name: m.teamA, players: players(m.tagA) }, team2: { name: m.teamB, players: players(m.tagB) } });
        }
        return send(404, { error: 'Unknown route.' });
      }
    }
  }

  private expired = new Set<string>();
  /** Every access token issued so far stops working (the refresh token still does). */
  expireNow() {
    for (let i = 1; i < this.access; i++) this.expired.add(String(i));
  }
}
