// What Live › Game data shows for the test-game roster check (src/shared/br-roster.ts): only while the observer feed is
// in a game, and never filled in while a match is live (the roster must not change under a game being read).
import type { Lobby } from '../shared/api.ts';
import { rosterCheck, type RosterCheck } from '../shared/br-roster.ts';
import { liveMatch } from '../shared/br-run.ts';
import type { PcobPlayer, PcobTeam } from '../shared/pcob.ts';

export interface RosterView { lobbyId: string; /** Why the check is off (a match is live), or null. */ blocked: string | null; check: RosterCheck | null }

/** The feed's view of the game on now: its players and teams. Null when no game is on. */
export interface GameNow { players: PcobPlayer[]; teams: PcobTeam[] }

export function rosterView(lobby: Lobby | null, game: GameNow | null): RosterView | null {
  if (!lobby || !game || !game.players.length) return null;
  const live = liveMatch(lobby);
  if (live) return { lobbyId: lobby.id, blocked: `Match ${live.n} is live. The roster is only checked in a test game, never while a match is being read.`, check: null };
  return { lobbyId: lobby.id, blocked: null, check: rosterCheck(game.players, game.teams, lobby.teams, lobby.pcobSeats ?? {}) };
}
