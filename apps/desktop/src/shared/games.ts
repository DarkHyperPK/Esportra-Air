// The game modules (docs/SPEC.md section 10). Generic screens read these fields, so no game's wording
// appears outside its own module. Games that are not ready show as "coming later", never faked.

export type GameId = 'valorant' | 'cs2' | 'lol' | 'dota2';

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
}

const coming = (id: GameId, name: string): GameDef => ({ id, name, available: false, identity: null, matchData: '', playerPcData: null, pack: '' });

export const GAMES: GameDef[] = [
  {
    id: 'valorant', name: 'Valorant', available: true,
    identity: { label: 'In-game name', placeholder: 'Name#TAG', help: 'Must match the game exactly, as Name#TAG. Air uses it to find this player’s data.' },
    matchData: 'Score, rounds, kills, spike plants and economy',
    playerPcData: 'Health, abilities and ultimate charge for each player',
    pack: 'Esportra Broadcast',
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
