// Overwolf Game Events (GEP) for Valorant, in the ow-electron main process.
// Ported from esportra-valorant-hud/capture/overwolf-valorant/main.js and player-source.js.
//
// Capture never starts on its own: game tracking is enabled only after the producer consents.
// The bridge does no parsing; raw messages go to the engine, which owns the Valorant parser.

import { EventEmitter } from 'node:events';

export const VALORANT_IDS = [21640, 22904] as const;
const OBSERVER_FEATURES = ['match_info', 'me', 'game_info'];
const PLAYER_FEATURES = ['me'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The parts of `app.overwolf.packages.gep` that Air uses. */
export interface GepPackage {
  on(event: string, listener: (...args: any[]) => void): unknown;
  setRequiredFeatures(gameId: number, features: string[]): Promise<void>;
  getInfo(gameId: number): Promise<any>;
}

/** The parts of `app.overwolf.packages` that Air uses. */
export interface OverwolfPackages {
  on(event: string, listener: (...args: any[]) => void): unknown;
  gep?: GepPackage;
}

export type CaptureState = 'off' | 'waiting' | 'live' | 'unavailable';

/** On a player PC, forwards only that player's own data, tagged with their Riot id (player-source.js). */
export class PlayerSource {
  playerId: string;
  private pending: Array<{ at: number; packet: any }> = [];
  private readonly role: 'observer' | 'player';
  private readonly now: () => number;

  constructor(role: 'observer' | 'player', playerId = '', now: () => number = Date.now) {
    if (playerId && !UUID.test(playerId)) throw new Error('Player identity must be a valid Riot player ID.');
    this.role = role;
    this.playerId = playerId;
    this.now = now;
  }

  prepare(message: any): any[] {
    if (this.role !== 'player') return [message];
    const me = message?.info?.me;
    const key = message?.feature === 'me' || message?.category === 'me' ? message.key : null;
    const identity = me?.player_id || (key === 'player_id' ? (message.data ?? message.value) : null);
    if (typeof identity === 'string' && UUID.test(identity)) this.playerId = identity;
    if (!me && !key) return [];
    const packet = { ...message };
    if (!this.playerId) {
      this.pending = this.pending.filter((item) => this.now() - item.at < 60_000).slice(-99);
      this.pending.push({ at: this.now(), packet });
      return [];
    }
    const pending = this.pending.filter((item) => this.now() - item.at < 60_000);
    this.pending = [];
    return [...pending.map((item) => ({ ...item.packet, playerId: this.playerId })), { ...packet, playerId: this.playerId }];
  }

  heartbeat() {
    return this.role === 'player' && this.playerId ? { playerId: this.playerId, captureHeartbeat: true } : null;
  }

  reset() {
    this.pending = [];
    this.playerId = '';
  }
}

export interface GepBridgeOptions {
  packages: OverwolfPackages | null;
  send: (message: unknown) => void;
  role?: 'observer' | 'player';
  playerId?: string;
  pollMs?: number;
  log?: (message: string) => void;
}

export class GepBridge extends EventEmitter {
  state: CaptureState;
  reason: string | null = null;
  lastMessageAt: number | null = null;
  private gep: GepPackage | null = null;
  private consented = false;
  private detected: { gameId: number; enable?: () => void } | null = null;
  private tracking: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private readonly source: PlayerSource;
  private readonly options: GepBridgeOptions;

  constructor(options: GepBridgeOptions) {
    super();
    this.options = options;
    this.source = new PlayerSource(options.role ?? 'observer', options.playerId ?? '');
    if (!options.packages) {
      this.state = 'unavailable';
      this.reason = 'Game capture needs the Overwolf runtime (start Air with ow-electron).';
      return;
    }
    this.state = 'off';
    options.packages.on('ready', (_e: unknown, name: string) => {
      if (name !== 'gep' || !options.packages?.gep) return;
      this.gep = options.packages.gep;
      this.listen(this.gep);
      if (this.consented && this.detected) void this.track(this.detected.gameId);
    });
    options.packages.on('failed-to-initialize', (_e: unknown, name: string) => {
      if (name === 'gep') this.set('unavailable', 'Overwolf game events could not start. Check that Overwolf is allowed in your firewall, then restart Air.');
    });
  }

  private set(state: CaptureState, reason: string | null = null) {
    this.state = state;
    this.reason = reason;
    this.emit('change');
  }

  private get features() {
    return (this.options.role ?? 'observer') === 'player' ? PLAYER_FEATURES : OBSERVER_FEATURES;
  }

  private listen(gep: GepPackage) {
    const isValorant = (id: number) => (VALORANT_IDS as readonly number[]).includes(id);
    gep.on('game-detected', (e: { enable?: () => void }, gameId: number) => {
      if (!isValorant(gameId)) return;
      this.detected = { gameId, enable: e?.enable?.bind(e) };
      // Without consent the game is only noted; GEP is not enabled for it.
      if (this.consented) void this.track(gameId);
    });
    gep.on('elevated-privileges-required', (_e: unknown, gameId: number) => {
      if (isValorant(gameId)) this.set('waiting', 'Valorant is running as administrator. Restart Air as administrator too.');
    });
    gep.on('game-exit', (_e: unknown, gameId: number) => {
      if (!isValorant(gameId)) return;
      this.detected = null;
      this.tracking = null;
      this.source.reset();
      if (this.consented) this.set('waiting', 'Valorant closed. Waiting for the next game.');
    });
    gep.on('new-info-update', (_e: unknown, gameId: number, ...args: unknown[]) => {
      if (isValorant(gameId)) for (const message of args) this.forward(message);
    });
    gep.on('new-game-event', (_e: unknown, gameId: number, ...args: any[]) => {
      if (isValorant(gameId)) for (const message of args) this.forward(message?.events ? message : { events: [message] });
    });
    gep.on('error', (_e: unknown, gameId: number, error: unknown) => this.options.log?.(`GEP error for ${gameId}: ${String(error)}`));
  }

  private forward(message: unknown) {
    if (!this.consented) return;
    for (const packet of this.source.prepare(message)) this.options.send(packet);
    this.lastMessageAt = Date.now();
    if (this.state !== 'live') this.set('live');
  }

  private async track(gameId: number) {
    if (!this.gep || this.tracking === gameId) return;
    this.tracking = gameId;
    try {
      this.detected?.enable?.();
      await this.gep.setRequiredFeatures(gameId, this.features);
      const info = await this.gep.getInfo(gameId);
      if (info?.info) this.forward(info);
      else if (info?.me) this.forward({ info });
      if (this.state !== 'live') this.set('waiting', 'Valorant detected. Data starts when you are in the match as observer.');
    } catch (error) {
      this.tracking = null;
      this.set('waiting', `Valorant was found but game events did not start (${String(error)}). Restart Valorant to retry.`);
    }
  }

  /** Starts capture. Must only be called after the producer accepted the capture notice. */
  start() {
    if (this.state === 'unavailable') return;
    this.consented = true;
    this.set('waiting', this.detected ? 'Starting game events for Valorant.' : 'Waiting for Valorant. Open it and join the match as observer.');
    if (this.detected) void this.track(this.detected.gameId);
    this.timer = setInterval(() => void this.poll(), this.options.pollMs ?? 2000);
    this.timer.unref?.();
  }

  private async poll() {
    if (!this.consented || this.tracking === null) return;
    const heartbeat = this.source.heartbeat();
    if (heartbeat) this.options.send(heartbeat);
    if ((this.options.role ?? 'observer') !== 'player' || this.polling || !this.gep) return;
    this.polling = true;
    try {
      const info = await this.gep.getInfo(this.tracking);
      if (info?.info) this.forward(info);
      else if (info?.me) this.forward({ info });
    } catch {
      // Live updates remain the primary source; the next poll retries.
    } finally {
      this.polling = false;
    }
  }

  /** Stops forwarding. GEP keeps the game registered but nothing leaves the bridge. */
  stop() {
    if (this.state === 'unavailable') return;
    this.consented = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.set('off');
  }
}
