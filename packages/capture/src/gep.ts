// Overwolf Game Events (GEP) for Valorant, in the ow-electron main process.
// Ported from esportra-valorant-hud/capture/overwolf-valorant/main.js and player-source.js.
//
// Capture never starts on its own: game data is requested and forwarded only after the producer consents.
// The bridge does no parsing; raw messages go to the engine, which owns the Valorant parser.

import { EventEmitter } from 'node:events';

export const VALORANT_IDS = [21640, 22904] as const;
const OBSERVER_FEATURES = ['match_info', 'me', 'game_info'];
// A player PC also reads match_info, only to find which player it is from the scoreboard (backup for a
// slow `me.player_id`). Match data is never sent from a player PC (PlayerSource.prepare).
const PLAYER_FEATURES = ['me', 'match_info'];
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

/** Shown before capture starts while Valorant is open on this PC. */
export const GAME_OPEN = 'Valorant is open on this PC. Nothing is read until you start capture.';

/** Shown on a player PC until Valorant reports which player it is. */
export const WAITING_FOR_PLAYER = 'Reading Valorant. Waiting for the game to say which player you are: join the match on this PC.';

const parse = (v: unknown) => {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return null; }
};

/** The local player's Riot id from a scoreboard or roster entry (`is_local` / `local`), if this message has one. */
export function localPlayer(message: any): string | null {
  const entries: Array<[string, unknown]> = [];
  if (typeof message?.key === 'string') entries.push([message.key, message.value ?? message.data]);
  const info = message?.info?.match_info;
  if (info && typeof info === 'object') entries.push(...(Object.entries(info) as Array<[string, unknown]>));
  for (const [key, raw] of entries) {
    if (!/^(scoreboard|roster)_\d+$/.test(key)) continue;
    const v = parse(raw) as any;
    if (v && (v.is_local === true || v.local === true) && typeof v.player_id === 'string' && UUID.test(v.player_id)) return v.player_id;
  }
  return null;
}

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
    // Riot's own `me.player_id` decides; the scoreboard's local player is the backup until it arrives.
    const identity = me?.player_id || (key === 'player_id' ? (message.data ?? message.value) : null) || (this.playerId ? null : localPlayer(message));
    if (typeof identity === 'string' && UUID.test(identity)) this.playerId = identity;
    // Anything else (the match as this player sees it) never leaves the PC; held data goes once identified.
    if (!me && !key) return this.playerId ? this.flush() : [];
    // Only this player's own data leaves the PC. A full getInfo() also carries the player's own view of
    // the match (score, round), which must never reach the production PC.
    const packet = me ? { feature: 'me', info: { me } } : { ...message };
    if (!this.playerId) {
      this.pending = this.pending.filter((item) => this.now() - item.at < 60_000).slice(-99);
      this.pending.push({ at: this.now(), packet });
      return [];
    }
    return [...this.flush(), { ...packet, playerId: this.playerId }];
  }

  private flush() {
    const pending = this.pending.filter((item) => this.now() - item.at < 60_000);
    this.pending = [];
    return pending.map((item) => ({ ...item.packet, playerId: this.playerId }));
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
  private detected: { gameId: number } | null = null;
  private tracking: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private source: PlayerSource;
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

  /** A capture-only PC is either an observer or a player PC. Changing it needs capture stopped. */
  setRole(role: 'observer' | 'player') {
    if (this.consented) throw new Error('Stop capture before changing this PC’s role.');
    this.options.role = role;
    this.source = new PlayerSource(role, '');
  }

  get role() {
    return this.options.role ?? 'observer';
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
      // Enabled while Overwolf is announcing the game (as Overwolf's own apps do); this asks for no data.
      // Without consent no features are requested and nothing is read or sent.
      e?.enable?.();
      this.detected = { gameId };
      if (!this.consented) this.set('off', GAME_OPEN);
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
      else if (this.reason === GAME_OPEN) this.set('off');
    });
    gep.on('new-info-update', (_e: unknown, gameId: number, ...args: any[]) => {
      if (!isValorant(gameId)) return;
      for (const message of args) if (!this.repeatedKill(message?.key, message?.value ?? message?.data)) this.forward(message);
    });
    // ow-electron sends game events flat, like info updates: { gameId, feature, key, value }.
    gep.on('new-game-event', (_e: unknown, gameId: number, ...args: any[]) => {
      if (!isValorant(gameId)) return;
      for (const message of args) {
        if (message?.events) { this.forward(message); continue; }
        const name = message?.name ?? message?.key;
        const data = message?.data ?? message?.value;
        if (typeof name !== 'string' || this.repeatedKill(name, data)) continue;
        this.forward({ events: [{ name, data }] });
      }
    });
    gep.on('error', (_e: unknown, gameId: number, error: unknown) => this.options.log?.(`GEP error for ${gameId}: ${String(error)}`));
  }

  private kills = new Map<string, number>();

  /** Valorant reports each kill twice (an info update and a game event); only the first is passed on. */
  private repeatedKill(key: unknown, value: unknown) {
    if (key !== 'kill_feed' || value == null) return false;
    const id = typeof value === 'string' ? value : JSON.stringify(value);
    const now = Date.now();
    for (const [k, at] of this.kills) if (now - at > 5000) this.kills.delete(k);
    if (this.kills.has(id)) return true;
    this.kills.set(id, now);
    return false;
  }

  private forward(message: unknown) {
    if (!this.consented) return;
    for (const packet of this.source.prepare(message)) this.options.send(packet);
    this.lastMessageAt = Date.now();
    // A player PC holds its data until the game says which player it is; it is not live before then.
    if (this.role === 'player' && !this.source.playerId) {
      if (this.reason !== WAITING_FOR_PLAYER) this.set('waiting', WAITING_FOR_PLAYER);
      return;
    }
    if (this.state !== 'live') this.set('live');
  }

  private async track(gameId: number) {
    if (!this.gep || this.tracking === gameId) return;
    this.tracking = gameId;
    try {
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
    this.set('off', this.detected ? GAME_OPEN : null);
  }
}
