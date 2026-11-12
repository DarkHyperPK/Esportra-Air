// Devices: every PC and camera the show depends on. The player PC board puts each joined PC in its
// seat by the in-game player id it sends, and says how fresh that player's own data is.
import type { Match } from './api.ts';
import type { JoinedPc } from './join.ts';

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

export interface DevicesView {
  seats: SeatView[];
  /** Seats whose own data is live. */
  checkedIn: number;
  /** True once the game has reported its players (seats come from the game, not the lineup). */
  fromGame: boolean;
  unseated: UnseatedPc[];
  observers: Array<{ id: number; name: string; ageMs: number | null }>;
}

interface RoomPlayer { name?: string; photo?: string; puuid?: string; captureCoverage?: { lastSeenAt?: number } }

export function devicesView(input: { lineup: Match['players'] | null; roomPlayers: RoomPlayer[][] | null; peers: JoinedPc[]; now: number }): DevicesView {
  const players = input.peers.filter((p) => p.role === 'player');
  const room = input.roomPlayers ?? [];
  const fromGame = room.some((team) => team?.some((p) => p?.puuid && p.name));
  const seated = new Set<number>();
  const seats: SeatView[] = [];
  for (const team of [0, 1] as const) {
    const list = fromGame ? room[team] ?? [] : (input.lineup?.[team] ?? []).slice(0, 5);
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
    detail: !p.playerId ? 'Joined. Waiting for the game to open on this PC.' : fromGame ? 'This player is not in the match the observer is watching.' : 'Ready. Seated as soon as the match starts.',
  }));
  return {
    seats,
    checkedIn: seats.filter((x) => x.state === 'live').length,
    fromGame,
    unseated,
    observers: input.peers.filter((p) => p.role === 'observer').map((p) => ({ id: p.id, name: p.name, ageMs: p.lastAgeMs })),
  };
}
