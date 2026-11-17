// Riot identifiers, kept apart (17 Nov): the Riot ID `Name#TAG` is what the producer sees and types and what
// the game's scoreboard shows; the PUUID is Riot's account id, which Esportra sends for verified accounts and
// Overwolf reports as the player id. Before, Air stored the PUUID in the Riot ID field.
export const RIOT_ID = /^[^#<>\x00-\x1f]{3,16}#[A-Za-z0-9]{2,5}$/;
export const PUUID = /^[A-Za-z0-9_-]{36,100}$/;
export const isRiotId = (s: unknown): boolean => typeof s === 'string' && RIOT_ID.test(s.trim());
export const isPuuid = (s: unknown): s is string => typeof s === 'string' && PUUID.test(s.trim());

/** An older save kept the PUUID where the Riot ID goes: move it to `puuid`. Returns true when it changed. */
export function splitRiot(p: { gameId: string; puuid?: string }): boolean {
  if (!p.gameId || isRiotId(p.gameId) || !isPuuid(p.gameId)) return false;
  if (!p.puuid) p.puuid = p.gameId.trim();
  p.gameId = '';
  return true;
}

/** What a player's Riot line says in the interface. */
export const riotLabel = (p: { gameId: string; puuid?: string; esportraId?: string }) => p.gameId || (p.puuid ? 'Riot account linked on Esportra' : p.esportraId ? 'No verified Riot ID on Esportra' : 'No Riot ID');
/** Live data can find this player: a Riot ID or an Esportra-verified PUUID. */
export const riotKnown = (p: { gameId: string; puuid?: string }) => !!(p.gameId || p.puuid);
