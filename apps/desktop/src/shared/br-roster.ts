// The test-game roster check (28 Nov): while a test game is on and no match is live, which of the game's players the
// roster places by Character ID (PCOB's `uID`), and for each one it cannot place, who it most likely is. Pure; the
// observer feed (src/main/br-live.ts) supplies the players and Production the lobby, and nothing here writes anything.
// The producer decides each row (Use this UID, Pick player, Ignore), and the roster only changes in a test game.
import type { LobbyTeam } from './br.ts';
import { matchPlayer, normName, seatTeams, type PcobPlayer, type PcobTeam } from './pcob.ts';
import { digitsApart } from './uid.ts';

export interface RosterSuggestion {
  /** The Teams/Players player, and the lobby team they are on. */
  playerId: string; name: string; team: string; teamName: string;
  /** Plain words: why Air thinks so. */
  why: string; detail: string;
  /** The UID Teams/Players already holds for them, when it differs from the game's. */
  savedUid: string | null;
}
export interface RosterRow {
  uid: string; name: string; /** PCOB's team slot (its own team id). */ slot: number;
  /** The lobby team the slot is seated on, or null when no team is paired. */
  team: string | null;
  suggestion: RosterSuggestion | null;
  /** Why this row is not placed (shown under the name when there is no suggestion). */
  note: string;
}
export interface RosterCheck {
  total: number; placed: number;
  teamsPaired: number; teamsTotal: number;
  rows: RosterRow[];
}

/** A person in the roster: what Teams/Players holds for them. */
interface Person { id: string; name: string; uid: string; openId: string; team: string }

const near = (a: string, b: string) => {
  if (!a || !b) return false;
  if (a === b) return true;
  if ((a.length >= 3 && b.includes(a)) || (b.length >= 3 && a.includes(b))) return true;
  // Within two letters (a swapped or missed key).
  if (Math.abs(a.length - b.length) > 2) return false;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]! <= 2;
};

export function rosterCheck(players: PcobPlayer[], pcobTeams: PcobTeam[], lobbyTeams: LobbyTeam[], manual: Record<string, string> = {}): RosterCheck {
  const refs = lobbyTeams.map((t) => ({ id: t.id, name: t.name, tag: t.tag, players: t.players, openIds: t.openIds, uids: t.uids }));
  const seats = seatTeams(pcobTeams, players, refs, manual);
  const roster = new Map<string, Person[]>(lobbyTeams.map((t) => [t.id, t.players.map((name, i) => ({ id: t.playerIds?.[i] ?? '', name, uid: t.uids?.[i] ?? '', openId: t.openIds?.[i] ?? '', team: t.id }))]));
  const everyone = [...roster.values()].flat();
  const slots = [...new Set([...pcobTeams.map((t) => t.teamId), ...players.map((p) => p.teamId)])];
  // Placed by UID: the game's uID is on the seated team's roster.
  const takenUids = new Set<string>();
  const rows: RosterRow[] = [];
  let placed = 0;
  const unplaced: PcobPlayer[] = [];
  for (const p of players) {
    const team = seats.get(p.teamId) ?? null;
    const mine = team ? roster.get(team) ?? [] : [];
    const hit = p.uid ? mine.find((r) => r.uid === p.uid) : undefined;
    if (hit) { placed++; takenUids.add(p.uid); } else unplaced.push(p);
  }
  for (const p of unplaced) {
    const team = seats.get(p.teamId) ?? null;
    const teamName = lobbyTeams.find((t) => t.id === team)?.name ?? '';
    const mine = team ? roster.get(team) ?? [] : [];
    // Players of this team that no game player has taken by UID yet.
    const free = mine.filter((r) => !r.uid || !players.some((q) => q.uid === r.uid && seats.get(q.teamId) === team));
    let suggestion: RosterSuggestion | null = null;
    let note = '';
    const make = (r: Person, why: string, detail: string): RosterSuggestion => ({ playerId: r.id, name: r.name, team: r.team, teamName: lobbyTeams.find((t) => t.id === r.team)?.name ?? '', why, detail, savedUid: r.uid && r.uid !== p.uid ? r.uid : null });
    if (team) {
      const n = normName(p.name);
      const same = free.find((r) => normName(r.name) === n) ?? (matchPlayer({ uid: '', openId: p.openId, name: p.name }, free) ? free[matchPlayer({ uid: '', openId: p.openId, name: p.name }, free)!.index] : undefined);
      const similar = same ? undefined : free.find((r) => near(normName(r.name), n));
      const blank = free.filter((r) => !r.uid);
      if (same) {
        const apart = same.uid ? digitsApart(same.uid, p.uid) : null;
        suggestion = make(same, 'Same name and team', same.uid ? (apart !== null && apart <= 3 ? `The UID differs by ${apart} digit${apart === 1 ? '' : 's'}: yours ${same.uid}.` : `Teams/Players has a different UID for ${same.name}: ${same.uid}.`) : `No UID saved for ${same.name} yet.`);
      } else if (similar) suggestion = make(similar, 'Looks like', `Similar name on the same team slot. ${similar.uid ? `Teams/Players has ${similar.uid} for ${similar.name}.` : `No UID saved for ${similar.name} yet.`}`);
      else if (blank.length === 1) suggestion = make(blank[0]!, 'Same team slot', `No UID saved for ${blank[0]!.name} yet, and nobody else on this team is missing one.`);
      if (!suggestion) note = free.length ? 'No one on this team looks like this player. Pick the player.' : 'Every player on this team already has a UID in the game.';
    } else note = 'This team slot is not paired with a team yet.';
    // The UID belongs to someone on another team: say so, never move them.
    const elsewhere = p.uid ? everyone.find((r) => r.uid === p.uid && r.team !== team) : undefined;
    if (elsewhere) { suggestion = null; note = `This UID is ${elsewhere.name}’s on ${lobbyTeams.find((t) => t.id === elsewhere.team)?.name ?? 'another team'}. Pair the team slot with that team, or fix the UID in Teams/Players.`; }
    rows.push({ uid: p.uid, name: p.name, slot: p.teamId, team, suggestion, note });
  }
  return { total: players.length, placed, teamsPaired: slots.filter((s) => seats.has(s)).length, teamsTotal: slots.length, rows };
}
