// Is the lobby ready for the show (28 Nov)? What still needs the producer, and what is already in place. Pure: a lobby
// and Teams/Players in, a short list out; Events › lobby shows it as a strip and Start day lists it in its checklist.
// Nothing here stops anything: the show is never blocked, a missing map or UID is only flagged.
import type { LibPlayer, Lobby } from './api.ts';
import { gameState, type SavedPointsTable } from './br.ts';
import { tableGap, tableName } from './br-format.ts';
import { SQUAD_SIZE } from './sheet-import.ts';
import { isCoach } from './games.ts';
import { normName } from './pcob.ts';

export type Goto = 'teams' | 'format' | 'scoring';
export interface ReadyItem {
  id: string; title: string; detail: string; goto?: Goto;
  /** Names to show in "Show them". */
  names?: string[];
  /** Ready items that are not complete (62 of 64 photos): shown in amber, never in Needs you. */
  partial?: boolean;
}
export interface Readiness { needs: ReadyItem[]; ready: ReadyItem[] }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function readiness(lobby: Lobby, library: LibPlayer[], saved: SavedPointsTable[] = []): Readiness {
  const needs: ReadyItem[] = [], ready: ReadyItem[] = [];
  if (!lobby.teams.length) needs.push({ id: 'no-teams', title: 'No teams in this lobby yet', detail: 'Import a list or pick teams from Teams/Players.', goto: 'teams' });
  const squads = lobby.teams.map((t) => ({ team: t, players: library.filter((p) => p.teamId === t.teamId && t.teamId && !isCoach(p.role)) }));
  const noUid = squads.flatMap((s) => s.players.filter((p) => !p.uid).map((p) => `${p.gameId || p.name} (${s.team.name})`));
  if (noUid.length) needs.push({ id: 'no-uid', title: `${plural(noUid.length, 'player')} without a UID`, detail: noUid.slice(0, 4).join(', ') + (noUid.length > 4 ? ` and ${noUid.length - 4} more` : ''), names: noUid, goto: 'teams' });
  const few = squads.filter((s) => s.players.length < SQUAD_SIZE && lobby.teams.length);
  if (few.length) needs.push({ id: 'few-players', title: `${plural(few.length, 'team')} with fewer than ${SQUAD_SIZE} players`, detail: few.slice(0, 4).map((s) => `${s.team.name} (${s.players.length})`).join(', '), names: few.map((s) => s.team.name), goto: 'teams' });
  const day = (g: Lobby['games'][number]) => lobby.days?.find((d) => d.id === g.dayId)?.title ?? '';
  const noMap = lobby.games.filter((g) => !g.map.trim() && gameState(g) !== 'void' && gameState(g) !== 'confirmed');
  if (noMap.length) needs.push({ id: 'no-map', title: noMap.length === 1 ? `Match ${noMap[0]!.n} has no map` : `${plural(noMap.length, 'match', 'matches')} without a map`, detail: noMap.slice(0, 4).map((g) => `${lobby.title}${day(g) ? ` · ${day(g)}` : ''}${noMap.length > 1 ? ` · Match ${g.n}` : ''}`).join(', '), names: noMap.map((g) => `Match ${g.n}`), goto: 'format' });
  const gap = tableGap(lobby.scoring, lobby.teams.length);
  if (gap) needs.push({ id: 'table-gap', title: 'The points table has gaps', detail: `${gap.from === gap.to ? `Place ${gap.from} has` : `Places ${gap.from} to ${gap.to} have`} no points set. Type 0 where a place scores nothing.`, goto: 'scoring' });
  const seen = new Map<string, string[]>();
  for (const s of squads) for (const p of s.players) { const k = normName(p.gameId || p.name); if (k) seen.set(k, [...(seen.get(k) ?? []), `${p.gameId || p.name}|${s.team.name}`]); }
  const dups = [...seen.values()].filter((v) => v.length > 1);
  if (dups.length) needs.push({ id: 'dup-ign', title: `${plural(dups.length, 'in-game name')} used twice in this lobby`, detail: dups.slice(0, 3).map((v) => `${v[0]!.split('|')[0]} (${v.map((x) => x.split('|')[1]).join(', ')})`).join(' · '), names: dups.map((v) => v[0]!.split('|')[0]!), goto: 'teams' });
  const all = squads.flatMap((s) => s.players);
  if (lobby.teams.length) {
    const logos = lobby.teams.filter((t) => t.logo).length;
    ready.push({ id: 'logos', title: `${logos} of ${lobby.teams.length} logos`, detail: logos === lobby.teams.length ? '' : 'A team without a logo shows its tag.', partial: logos < lobby.teams.length });
    const photos = all.filter((p) => p.photo).length;
    ready.push({ id: 'photos', title: `${photos} of ${all.length} photos`, detail: 'The rest show the grey player shadow.', partial: photos < all.length });
  }
  if (!gap) ready.push({ id: 'table', title: 'Points table complete', detail: tableName(lobby.scoring, saved) });
  return { needs, ready };
}
