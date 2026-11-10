// The games Air produces. Valorant has a data source today; the others are shown as coming, never faked.

export type GameId = 'valorant' | 'cs2' | 'lol' | 'dota2';

export interface GameDef {
  id: GameId;
  name: string;
  /** True when Air can capture this game's data and has its HUD. */
  available: boolean;
  /** How players are recognised in the game's own data. */
  playerId: { label: string; placeholder: string } | null;
}

export const GAMES: GameDef[] = [
  { id: 'valorant', name: 'VALORANT', available: true, playerId: { label: 'Riot ID', placeholder: 'Name#TAG' } },
  { id: 'cs2', name: 'Counter-Strike 2', available: false, playerId: null },
  { id: 'lol', name: 'League of Legends', available: false, playerId: null },
  { id: 'dota2', name: 'Dota 2', available: false, playerId: null },
];

export const gameName = (id: GameId) => GAMES.find((g) => g.id === id)?.name ?? id;
