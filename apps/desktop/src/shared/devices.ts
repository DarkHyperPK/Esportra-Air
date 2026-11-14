// Devices: every PC and camera the show depends on. The player PC board puts each joined PC in its
// seat by the in-game player id it sends, and says how fresh that player's own data is.
import type { Match } from './api.ts';
import type { DataSourcesView, JoinedPc } from './join.ts';

/** A seat's player PC: live (data in the last 10 s), quiet (data stopped), joined (no data yet), none. */
export type SeatState = 'live' | 'quiet' | 'joined' | 'none';
export const QUIET_AFTER_MS = 10_000;

export interface SeatView {
  team: 0 | 1;
  index: number;
  name: string;
  photo: string;
  /** The name of the PC in this seat, or null. */
  pc: string | null;
  state: SeatState;
  /** How long ago this player's own data last arrived, or null. */
  ageMs: number | null;
}

export interface UnseatedPc {
  id: number;
  name: string;
  /** Why it has no seat yet, in the producer's words. */
  detail: string;
}

/** A player PC as it joined: known by its own name and address, never by a player before the game pairs it. */
export interface DetectedPc {
  id: number;
  name: string;
  ip: string;
  /** ready: Valorant has said which player this PC is; joined: waiting for Valorant on that PC. */
  state: 'ready' | 'joined';
  /** The seat it was paired with by the game (its in-game name), once the game lists the players. */
  seat: string | null;
  /** How long ago it last sent anything. */
  ageMs: number | null;
}

export interface DevicesView {
  /** Seats from the game's own player list; empty until the game reports its players (no guessing from the lineup). */
  seats: SeatView[];
  /** Every player PC that has joined, shown by PC before pairing. */
  pcs: DetectedPc[];
  /** Seats whose own data is live. */
  checkedIn: number;
  /** True once the game has reported its players (seats come from the game, not the lineup). */
  fromGame: boolean;
  unseated: UnseatedPc[];
  observers: Array<{ id: number; name: string; ageMs: number | null; data: DataRole }>;
  /** This PC's own capture: the game data source, held back as standby, or not sending. */
  thisPc: DataRole;
}

/** `source`: its match data is used. `standby`: it sends too, but another PC's data is used. */
export type DataRole = 'source' | 'standby' | null;

interface RoomPlayer { name?: string; photo?: string; puuid?: string; captureCoverage?: { lastSeenAt?: number } }

export function devicesView(input: { lineup: Match['players'] | null; roomPlayers: RoomPlayer[][] | null; peers: JoinedPc[]; now: number; sources?: DataSourcesView | null }): DevicesView {
  const role = (id: string): DataRole => {
    const x = input.sources?.sources.find((s) => s.id === id);
    return !x ? null : x.active ? 'source' : 'standby';
  };
  const players = input.peers.filter((p) => p.role === 'player');
  const room = input.roomPlayers ?? [];
  const fromGame = room.some((team) => team?.some((p) => p?.puuid && p.name));
  const seated = new Set<number>();
  const seats: SeatView[] = [];
  for (const team of [0, 1] as const) {
    // Pairing happens when the match starts: the game lists its players and each PC is seated by its
    // player id. Before that there are no seats, so no PC is shown against a player it may not be.
    const list = fromGame ? room[team] ?? [] : [];
    list.forEach((p, index) => {
      const puuid = fromGame ? (p as RoomPlayer).puuid ?? '' : '';
      const pc = puuid ? players.find((x) => x.playerId === puuid) ?? null : null;
      if (pc) seated.add(pc.id);
      const last = fromGame ? (p as RoomPlayer).captureCoverage?.lastSeenAt : undefined;
      const ageMs = typeof last === 'number' ? Math.max(0, input.now - last) : null;
      const state: SeatState = ageMs !== null ? (ageMs < QUIET_AFTER_MS ? 'live' : 'quiet') : pc ? 'joined' : 'none';
      seats.push({ team, index, name: p.name ?? '', photo: p.photo ?? '', pc: pc?.name ?? null, state, ageMs });
    });
  }
  const unseated = players.filter((p) => !seated.has(p.id)).map((p) => ({
    id: p.id,
    name: p.name,
    detail: !p.playerId ? 'Joined. Waiting for Valorant on this PC.' : fromGame ? 'This player is not in the match the observer is watching.' : 'Ready. Pairs with its player when the match starts.',
  }));
  const seatName = (pc: JoinedPc) => (fromGame && pc.playerId ? seats.find((x) => room[x.team]?.[x.index]?.puuid === pc.playerId)?.name ?? null : null);
  const pcs: DetectedPc[] = players.map((p) => ({ id: p.id, name: p.name, ip: p.ip, state: p.playerId ? 'ready' : 'joined', seat: seatName(p), ageMs: p.lastAgeMs }));
  return {
    seats,
    pcs,
    checkedIn: seats.filter((x) => x.state === 'live').length,
    fromGame,
    unseated,
    observers: input.peers.filter((p) => p.role === 'observer').map((p) => ({ id: p.id, name: p.name, ageMs: p.lastAgeMs, data: role(`peer:${p.id}`) })),
    thisPc: role('this-pc'),
  };
}
