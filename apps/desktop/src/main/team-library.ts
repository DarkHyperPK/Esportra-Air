// Teams/Players (approved 12 Nov): teams and players kept once and picked by matches. A match keeps a
// copy of its two teams and lineups (everything that reads `match.teams` / `match.players` keeps
// working) and that copy follows the library: `teamIds` per side, `libraryId` per lineup entry.

import { randomUUID } from 'node:crypto';
import { PLAYER_ROLES, type LibPlayer, type LibTeam, type Library, type Match, type PlayerInfo } from '../shared/api.ts';
import { HEX, IMAGE, text } from './validate.ts';
import { RIOT_ID, isPuuid } from '../shared/riot.ts';

const COLORS = ['#22d3ee', '#f43f5e'];
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** A short tag from a name: initials of several words, or the first three letters of one. */
const tagOf = (name: string) => {
  const words = name.toUpperCase().match(/[A-Z0-9]+/g) ?? ['TEAM'];
  return (words.length > 1 ? words.map((w) => w[0]).join('') : words[0]!).slice(0, 3);
};

export const emptyLibrary = (): Library => ({ teams: [], players: [] });

/** A team from the interface; throws a plain message when it cannot be used. */
export function validTeam(input: Partial<LibTeam>, lib: Library): LibTeam {
  const id = typeof input?.id === 'string' && lib.teams.some((t) => t.id === input.id) ? input.id : randomUUID();
  const name = text(input?.name, 40, 'Team name');
  if (lib.teams.some((t) => t.id !== id && same(t.name, name))) throw new Error(`There is already a team called ${name}.`);
  const tag = typeof input?.tag === 'string' && input.tag.trim() ? text(input.tag.toUpperCase(), 5, 'Tag') : tagOf(name);
  const color = typeof input?.color === 'string' && HEX.test(input.color) ? input.color.toLowerCase() : COLORS[lib.teams.length % 2]!;
  const logo = typeof input?.logo === 'string' ? input.logo : '';
  if (logo && !IMAGE.test(logo)) throw new Error('Choose the logo again.');
  return { id, name, tag, color, logo };
}

/** A player from the interface; throws a plain message when it cannot be used. */
export function validPlayer(input: Partial<LibPlayer>, lib: Library): LibPlayer {
  const id = typeof input?.id === 'string' && lib.players.some((p) => p.id === input.id) ? input.id : randomUUID();
  const name = text(input?.name, 32, 'Name on air');
  const gameId = typeof input?.gameId === 'string' ? input.gameId.trim() : '';
  if (gameId && !RIOT_ID.test(gameId)) throw new Error('Write the Riot ID as Name#TAG.');
  if (gameId && lib.players.some((p) => p.id !== id && p.gameId && same(p.gameId, gameId))) throw new Error(`${gameId} is already a player.`);
  const photo = typeof input?.photo === 'string' ? input.photo : '';
  if (photo && !IMAGE.test(photo)) throw new Error('Choose the photo again.');
  const role = typeof input?.role === 'string' && (PLAYER_ROLES as readonly string[]).includes(input.role) ? input.role : '';
  const teamId = typeof input?.teamId === 'string' && lib.teams.some((t) => t.id === input.teamId) ? input.teamId : null;
  // The PUUID comes from Esportra, never from the form: an edit keeps the one already known.
  const known = lib.players.find((p) => p.id === id)?.puuid;
  const puuid = isPuuid(input?.puuid) ? input.puuid.trim() : known;
  return { id, name, realName: input?.realName ? text(input.realName, 60, 'Real name') : '', gameId, ...(puuid ? { puuid } : {}), photo, role, teamId };
}

const entry = (p: LibPlayer, id: string = randomUUID()): PlayerInfo => ({ id, name: p.name, realName: p.realName, gameId: p.gameId, ...(p.puuid ? { puuid: p.puuid } : {}), photo: p.photo, libraryId: p.id });

/**
 * Links a match to the library: each team by name, each player by Riot ID (or by name within that
 * team). Anything not there yet is added. Changes `match` and `lib` in place.
 */
export function linkMatch(match: Match, lib: Library) {
  const ids: [string | null, string | null] = [null, null];
  for (const t of [0, 1] as const) {
    const copy = match.teams[t];
    let team = (match.teamIds?.[t] && lib.teams.find((x) => x.id === match.teamIds![t])) || lib.teams.find((x) => same(x.name, copy.name));
    if (!team) {
      team = { id: randomUUID(), name: copy.name, tag: copy.tag, color: copy.color, logo: copy.logo };
      lib.teams.push(team);
    } else if (!team.logo && copy.logo) team.logo = copy.logo;
    ids[t] = team.id;
    for (const p of match.players[t]) {
      let found = (p.libraryId && lib.players.find((x) => x.id === p.libraryId))
        || (p.puuid && lib.players.find((x) => x.puuid === p.puuid))
        || (p.gameId && lib.players.find((x) => x.gameId && same(x.gameId, p.gameId)))
        || lib.players.find((x) => x.teamId === team!.id && same(x.name, p.name));
      if (!found) {
        found = { id: randomUUID(), name: p.name, realName: p.realName, gameId: p.gameId, ...(p.puuid ? { puuid: p.puuid } : {}), photo: p.photo, role: '', teamId: team.id };
        lib.players.push(found);
      } else {
        if (!found.photo && p.photo) found.photo = p.photo;
        if (!found.gameId && p.gameId) found.gameId = p.gameId;
        if (!found.puuid && p.puuid) found.puuid = p.puuid;
        found.teamId ??= team.id;
      }
      p.libraryId = found.id;
    }
  }
  match.teamIds = ids;
}

/**
 * Rewrites a match's copy from the library: team name, tag, colour and logo, and each linked
 * player. A player who left the team leaves the lineup; one deleted from the library stays as typed.
 */
export function refreshMatch(match: Match, lib: Library): boolean {
  // A finished match keeps the teams and players it was played with.
  if (match.finishedAt) return false;
  const before = JSON.stringify([match.teams, match.players]);
  for (const t of [0, 1] as const) {
    const teamId = match.teamIds?.[t];
    const team = teamId ? lib.teams.find((x) => x.id === teamId) : undefined;
    if (teamId && !team) match.teamIds![t] = null;
    if (team) match.teams[t] = { name: team.name, tag: team.tag, color: team.color, logo: team.logo };
    match.players[t] = match.players[t].flatMap((p) => {
      const found = p.libraryId ? lib.players.find((x) => x.id === p.libraryId) : undefined;
      if (!found) {
        const { libraryId: _gone, ...rest } = p;
        return [rest];
      }
      if (team && found.teamId !== team.id) return [];
      return [entry(found, p.id)];
    });
  }
  return JSON.stringify([match.teams, match.players]) !== before;
}

/** A team for one side of a match: its first five players become the starters. */
export function pickTeam(match: Match, side: 0 | 1, teamId: string, lib: Library) {
  const team = lib.teams.find((x) => x.id === teamId);
  if (!team) throw new Error('That team is no longer in Teams/Players.');
  if (match.teamIds?.[1 - side] === teamId) throw new Error('Choose a different team for each side.');
  match.teamIds = [match.teamIds?.[0] ?? null, match.teamIds?.[1] ?? null];
  match.teamIds[side] = teamId;
  match.teams[side] = { name: team.name, tag: team.tag, color: team.color, logo: team.logo };
  match.players[side] = lib.players.filter((p) => p.teamId === teamId).slice(0, 5).map((p) => entry(p));
}

/** The players a side plays with, in order: 1–7 from that side's team (the first five start). */
export function setLineup(match: Match, side: 0 | 1, playerIds: string[], lib: Library) {
  const teamId = match.teamIds?.[side];
  if (!teamId) throw new Error('Choose this side’s team first.');
  if (!Array.isArray(playerIds) || playerIds.length > 7) throw new Error('A team plays with up to seven players.');
  if (new Set(playerIds).size !== playerIds.length) throw new Error('Each player once.');
  const keep = new Map(match.players[side].filter((p) => p.libraryId).map((p) => [p.libraryId!, p.id]));
  match.players[side] = playerIds.map((id) => {
    const p = lib.players.find((x) => x.id === id);
    if (!p || p.teamId !== teamId) throw new Error('Choose players from this team.');
    return entry(p, keep.get(id));
  });
}

/** Deleting a team leaves its players without a team; matches keep their copy. */
export function deleteTeam(lib: Library, id: string) {
  if (!lib.teams.some((t) => t.id === id)) throw new Error('That team is already gone.');
  lib.teams = lib.teams.filter((t) => t.id !== id);
  lib.players = lib.players.map((p) => (p.teamId === id ? { ...p, teamId: null } : p));
}

/** Edits made inside a match (its team's logo and colour, a player's photo) go to the library too. */
export function pushMatch(match: Match, lib: Library) {
  for (const t of [0, 1] as const) {
    const team = match.teamIds?.[t] ? lib.teams.find((x) => x.id === match.teamIds![t]) : undefined;
    if (team) Object.assign(team, match.teams[t]);
    for (const p of match.players[t]) {
      const found = p.libraryId ? lib.players.find((x) => x.id === p.libraryId) : undefined;
      if (found) Object.assign(found, { name: p.name, realName: p.realName, gameId: p.gameId, photo: p.photo }, p.puuid ? { puuid: p.puuid } : {});
    }
  }
  linkMatch(match, lib);
}
