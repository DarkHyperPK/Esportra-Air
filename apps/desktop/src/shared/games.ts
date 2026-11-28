// The game modules (docs/SPEC.md section 10). Generic screens read these fields, so no game's wording
// appears outside its own module. Games that are not ready show as "coming later", never faked.

export type GameId = 'valorant' | 'pubgm' | 'freefire' | 'cs2' | 'lol' | 'dota2';

export interface GameDef {
  id: GameId;
  name: string;
  /** True when Air can read this game's data and has its graphics. */
  available: boolean;
  /** How the game knows each player, so live data can be matched to the lineup. */
  identity: { label: string; placeholder: string; help: string } | null;
  /** What the match itself provides (from the observer's PC). */
  matchData: string;
  /** What only each player's own PC provides, or null when player PCs add nothing for this game. */
  playerPcData: string | null;
  /** The graphics pack for this game. */
  pack: string;
  /** Head-to-head (two teams, maps, a series) or a lobby (many teams, games scored by placement and eliminations). */
  shape: 'versus' | 'lobby';
  /** Lobby games' own words: what one round of the lobby is called, and a win. */
  words?: { game: string; win: string; elim: string };
  /** The scoring preset new lobbies start from (src/shared/br.ts). */
  scoring?: 'pmgc' | 'ffws';
  /** A lobby game's official live data (24 Nov): PUBG MOBILE's observer API (PCOB). Free Fire has none. */
  feed?: 'pcob';
  /** The maps a lobby game rotates through (Format › the match generator's rotation). */
  maps?: string[];
}

/** Player roles per game (Teams/Players, the import). Valorant's are its agent roles; lobby games use squad roles. */
export const SQUAD_ROLES = ['', 'IGL', 'Player', 'Sub', 'Coach'] as const;
export const PLAYER_ROLES: Record<GameId, readonly string[]> = {
  valorant: ['', 'Duelist', 'Initiator', 'Controller', 'Sentinel', 'Flex', 'Substitute', 'Coach'],
  pubgm: SQUAD_ROLES, freefire: SQUAD_ROLES, cs2: SQUAD_ROLES, lol: SQUAD_ROLES, dota2: SQUAD_ROLES,
};
export const playerRoles = (game: GameId | string | null | undefined): readonly string[] => PLAYER_ROLES[(game ?? 'valorant') as GameId] ?? PLAYER_ROLES.valorant;
/** A coach is kept in the team but is never in the game: not counted as a player, not on the squad graphics. */
export const isCoach = (role: string | undefined) => (role ?? '').toLowerCase() === 'coach';

const coming = (id: GameId, name: string): GameDef => ({ id, name, available: false, identity: null, matchData: '', playerPcData: null, pack: '', shape: 'versus' });

export const GAMES: GameDef[] = [
  {
    id: 'valorant', name: 'Valorant', available: true,
    identity: { label: 'In-game name', placeholder: 'Name#TAG', help: 'Must match the game exactly, as Name#TAG. Air uses it to find this player’s data.' },
    matchData: 'Score, rounds, kills, spike plants and economy',
    playerPcData: 'Health, abilities and ultimate charge for each player',
    pack: 'Esportra Broadcast',
    shape: 'versus',
  },
  {
    // 20 Nov: results are typed or come from Esportra; the observer's live data (PCOB) and the pack come next.
    id: 'pubgm', name: 'PUBG MOBILE', available: true,
    identity: { label: 'In-game name', placeholder: 'Name', help: 'As it shows in the game. Air uses it to match the observer’s data to this player.' },
    matchData: 'Placements and eliminations per game (typed for now; live from the observer client later)',
    playerPcData: null,
    pack: 'PUBG MOBILE official kit',
    shape: 'lobby', words: { game: 'Match', win: 'WWCD', elim: 'Elims' }, scoring: 'pmgc', feed: 'pcob', maps: ['Erangel', 'Miramar', 'Sanhok', 'Vikendi', 'Livik', 'Rondo', 'Nusa', 'Karakin'],
  },
  {
    id: 'freefire', name: 'Free Fire', available: true,
    identity: { label: 'In-game name', placeholder: 'Name', help: 'As it shows in the game.' },
    matchData: 'Placements and kills per game (typed)',
    playerPcData: null,
    pack: 'Esportra Broadcast',
    shape: 'lobby', words: { game: 'Match', win: 'Booyah', elim: 'Kills' }, scoring: 'ffws', maps: ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'Nexterra'],
  },
  coming('cs2', 'Counter-Strike 2'),
  coming('lol', 'League of Legends'),
  coming('dota2', 'Dota 2'),
];

export const gameOf = (id: GameId | null | undefined) => GAMES.find((g) => g.id === id) ?? null;
export const gameName = (id: GameId) => gameOf(id)?.name ?? id;

/** How the producer's setup is laid out: decides which checks and devices Air shows. */
export type Profile = 'one-pc' | 'observer' | 'player-pcs';
export const PROFILES: Array<{ id: Profile; name: string; detail: string }> = [
  { id: 'one-pc', name: 'One PC', detail: 'The game, OBS and Air on the same computer.' },
  { id: 'observer', name: 'Observer PC and production PC', detail: 'The observer spectates; Air and OBS run on your PC.' },
  { id: 'player-pcs', name: 'With player PCs', detail: 'Players run Esportra Player too, for what the game only gives to players. Air shows who has checked in.' },
];
