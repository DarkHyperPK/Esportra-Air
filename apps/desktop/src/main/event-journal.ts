// The event journal (27 Nov): one append-only file per event, userData/events/<eventId>/journal.ndjson. Every change to a
// battle royale lobby's structure or results adds a line {seq, at, kind, eventId, data}, flushed to disk before the call
// returns, so what the producer entered survives a crash or a damaged air.json. `replay` rebuilds the lobbies' results from
// the lines and `verify` compares them with the store. The journal never changes what Air does; it only records.

import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { Lobby } from '../shared/api.ts';
import type { TeamResult } from '../shared/br.ts';
import { appendDurable, fsyncDir } from './durable.ts';

export interface JournalLine {
  seq: number;
  at: number;
  kind: string;
  eventId: string;
  data: Record<string, unknown>;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

export function parseJournal(text: string): JournalLine[] {
  const out: JournalLine[] = [];
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    try {
      const l = JSON.parse(raw) as JournalLine;
      if (l && typeof l.seq === 'number' && typeof l.kind === 'string' && l.data && typeof l.data === 'object') out.push(l);
    } catch { /* a half-written last line from a crash */ }
  }
  return out;
}

interface Known { seq: number; lobbies: Set<string>; needsNewline: boolean }

export class EventJournal {
  private readonly dir: string;
  private readonly now: () => number;
  private readonly known = new Map<string, Known>();

  constructor(dir: string, now: () => number = Date.now) {
    this.dir = dir;
    this.now = now;
  }

  file(eventId: string) {
    if (!SAFE_ID.test(eventId)) throw new Error('That event id cannot be used for a journal.');
    return join(this.dir, eventId, 'journal.ndjson');
  }

  private state(eventId: string): Known {
    let k = this.known.get(eventId);
    if (!k) {
      const text = existsSync(this.file(eventId)) ? readFileSync(this.file(eventId), 'utf8') : '';
      const lines = parseJournal(text);
      k = { seq: lines.at(-1)?.seq ?? 0, lobbies: new Set(lines.map((l) => l.data.lobbyId).filter((x): x is string => typeof x === 'string')), needsNewline: text.length > 0 && !text.endsWith('\n') };
      this.known.set(eventId, k);
    }
    return k;
  }

  read(eventId: string): JournalLine[] {
    try { return parseJournal(readFileSync(this.file(eventId), 'utf8')); } catch { return []; }
  }

  /** True when the journal already has a line about this lobby (so a baseline is not needed). */
  knows(eventId: string, lobbyId: string) { return this.state(eventId).lobbies.has(lobbyId); }

  append(eventId: string, kind: string, data: Record<string, unknown>): JournalLine {
    const k = this.state(eventId);
    const line: JournalLine = { seq: k.seq + 1, at: this.now(), kind, eventId, data };
    appendDurable(this.file(eventId), `${k.needsNewline ? '\n' : ''}${JSON.stringify(line)}\n`);
    k.needsNewline = false;
    k.seq = line.seq;
    if (typeof data.lobbyId === 'string') k.lobbies.add(data.lobbyId);
    return line;
  }

  /** For points the organiser adds or takes away later. Recorded with a reason; the replay lists them and leaves results alone. */
  adjust(eventId: string, data: Record<string, unknown>) { return this.append(eventId, 'adjust', data); }

  /** An imported event file brings its own journal: the one here (if any) is kept aside, never lost. */
  replaceWith(eventId: string, lines: JournalLine[]) {
    const file = this.file(eventId);
    mkdirSync(join(this.dir, eventId), { recursive: true });
    if (existsSync(file)) { renameSync(file, `${file}.replaced-${this.now()}`); fsyncDir(join(this.dir, eventId)); }
    this.known.delete(eventId);
    if (lines.length) appendDurable(file, lines.map((l) => JSON.stringify({ ...l, eventId })).join('\n') + '\n');
  }
}

// ── replay ──

export interface ReplayedLobby {
  /** Lobby team ids (null while the journal has not said). */
  teams: string[] | null;
  games: number | null;
  results: Record<number, TeamResult[]>;
}
export interface Replay { lobbies: Record<string, ReplayedLobby>; adjustments: JournalLine[] }

const rows = (v: unknown): TeamResult[] => (Array.isArray(v) ? v.filter((r): r is TeamResult => !!r && typeof r === 'object' && typeof (r as TeamResult).team === 'string').map((r) => ({ team: r.team, place: Number(r.place), elims: Number(r.elims) })) : []);

/** What the lobbies' structure and results were, according to the journal alone. */
export function replay(lines: JournalLine[]): Replay {
  const lobbies: Record<string, ReplayedLobby> = {};
  const adjustments: JournalLine[] = [];
  const at = (id: string) => (lobbies[id] ??= { teams: null, games: null, results: {} });
  for (const l of [...lines].sort((a, b) => a.seq - b.seq)) {
    const d = l.data;
    const id = typeof d.lobbyId === 'string' ? d.lobbyId : null;
    if (l.kind === 'adjust') { adjustments.push(l); continue; }
    if (!id) continue;
    if (l.kind === 'lobby.delete') { delete lobbies[id]; continue; }
    const x = at(id);
    if (l.kind === 'lobby.baseline' || l.kind === 'lobby.create') {
      x.teams = Array.isArray(d.teams) ? d.teams.map(String) : [];
      x.games = Number(d.games) || 0;
      x.results = {};
      for (const [n, r] of Object.entries((d.results ?? {}) as Record<string, unknown>)) x.results[Number(n)] = rows(r);
    } else if (l.kind === 'lobby.update') {
      const games = (d.fields as { games?: unknown[] } | undefined)?.games;
      if (Array.isArray(games)) {
        x.games = games.length;
        for (const n of Object.keys(x.results)) if (Number(n) > games.length) delete x.results[Number(n)];
      }
    } else if (l.kind === 'lobby.teams') {
      const ids = new Set(Array.isArray(d.teams) ? d.teams.map(String) : []);
      x.teams = [...ids];
      for (const n of Object.keys(x.results)) x.results[Number(n)] = x.results[Number(n)]!.filter((r) => ids.has(r.team));
    } else if (l.kind === 'result.set' || (l.kind === 'result.feed' && d.applied === true)) {
      x.results[Number(d.game)] = rows(d.results);
    } else if ((l.kind === 'match.confirm' || l.kind === 'match.edit') && Array.isArray(d.results)) {
      x.results[Number(d.game)] = rows(d.results);
    } else if (l.kind === 'result.clear') {
      delete x.results[Number(d.game)];
    }
  }
  return { lobbies, adjustments };
}

const norm = (r: TeamResult[]) => [...r].sort((a, b) => (a.team < b.team ? -1 : 1)).map((x) => `${x.team}:${x.place}:${x.elims}`).join(',');

/** The results a lobby holds now, as the journal would have them (games with none left out). */
export function resultsOf(l: Lobby): Record<number, TeamResult[]> {
  const out: Record<number, TeamResult[]> = {};
  for (const g of l.games) if (g.results?.length) out[g.n] = g.results;
  return out;
}

export interface Verify { ok: boolean; problems: string[] }

/** Compares the journal of one event with the store's lobbies of that event. Empty problems: they agree. */
export function verify(lines: JournalLine[], lobbies: Lobby[]): Verify {
  const problems: string[] = [];
  const sorted = [...lines].sort((a, b) => a.seq - b.seq);
  sorted.forEach((l, i) => { if (l.seq !== i + 1) problems.push(`The journal skips from line ${i} to ${l.seq}.`); });
  const rebuilt = replay(lines).lobbies;
  for (const l of lobbies) {
    const r = rebuilt[l.id];
    if (!r) { if (Object.keys(resultsOf(l)).length) problems.push(`${l.title}: the journal has nothing about this lobby.`); continue; }
    const have = resultsOf(l);
    for (const n of new Set([...Object.keys(have), ...Object.keys(r.results)].map(Number))) {
      const a = have[n] ? norm(have[n]!) : '', b = r.results[n]?.length ? norm(r.results[n]!) : '';
      if (a !== b) problems.push(`${l.title}: game ${n} differs (store ${a || 'no results'}, journal ${b || 'no results'}).`);
    }
    if (r.games !== null && r.games !== l.games.length) problems.push(`${l.title}: ${l.games.length} games in the store, ${r.games} in the journal.`);
    if (r.teams !== null && norm0(r.teams) !== norm0(l.teams.map((t) => t.id))) problems.push(`${l.title}: the teams differ.`);
  }
  const ids = new Set(lobbies.map((l) => l.id));
  for (const id of Object.keys(rebuilt)) if (!ids.has(id)) problems.push(`The journal has a lobby (${id.slice(0, 8)}) that the store does not.`);
  return { ok: problems.length === 0, problems };
}
const norm0 = (a: string[]) => [...a].sort().join(',');
