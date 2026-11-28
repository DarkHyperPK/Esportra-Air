// A lobby's format at work (28 Nov): the match generator for a day, "Copy this lobby" (Group B with the same format and
// points, no teams or results) and the producer's saved points tables. Every change to a lobby goes through Lobbies
// (journalled there); the saved tables belong to this PC and are never part of an event.
import { randomUUID } from 'node:crypto';
import type { Lobby } from '../shared/api.ts';
import { gameState, validScoring, type LobbyDay, type LobbyGame } from '../shared/br.ts';
import { slotsOf, validSpec, nextTitle, validTableName } from '../shared/br-format.ts';
import { isBusy, matchesOfDay } from '../shared/br-run.ts';
import type { Lobbies } from './br-lobbies.ts';
import type { Store } from './store.ts';

const MAX_GAMES = 24, MAX_TABLES = 30;
const untouched = (g: LobbyGame) => gameState(g) === 'scheduled' && !g.results?.length && !g.feed;

export class BrFormat {
  private readonly ctx: { lobbies: Lobbies; store: Store; changed: () => void };
  constructor(ctx: { lobbies: Lobbies; store: Store; changed: () => void }) { this.ctx = ctx; }
  private get lobbies() { return this.ctx.lobbies; }

  /**
   * Fills a day with matches: times step by the gap from the first start, maps repeat in rotation order. Matches nobody has
   * played or armed are rewritten in place (same ids); one that is armed, live or played is left as it is and still counts
   * toward the day's total. Extra untouched matches at the end of the lobby are removed; none are removed otherwise.
   */
  generate(lobbyId: string, dayId: string, input: unknown) {
    const l = this.lobbies.find(lobbyId);
    if (isBusy(l)) throw new Error('A match is live. Confirm, remake or end it before changing the run sheet.');
    const day = l.days?.find((d) => d.id === dayId);
    if (!day) throw new Error('That day is not in this lobby.');
    if (day.closedAt) throw new Error(`${day.title} is closed. Reopen it first.`);
    const spec = validSpec(input);
    const slots = slotsOf(spec);
    const inDay = matchesOfDay(l, day);
    const drop = inDay.slice(spec.count);
    if (drop.some((g) => !untouched(g))) throw new Error(`${day.title} has played or armed matches beyond ${spec.count}. Keep at least ${inDay.length} matches, or void the extra ones on the run sheet.`);
    const highest = [...l.games].sort((a, b) => b.n - a.n).slice(0, drop.length).map((g) => g.id);
    if (drop.some((g) => !highest.includes(g.id))) throw new Error('Those extra matches are not the last ones in the lobby. Remove them from the run sheet instead.');
    if (l.games.length - drop.length + Math.max(0, spec.count - inDay.length) > MAX_GAMES) throw new Error(`A lobby has up to ${MAX_GAMES} matches in all.`);
    let games = l.games.filter((g) => !drop.some((d) => d.id === g.id));
    const ids: string[] = [];
    slots.forEach((slot, i) => {
      const had = inDay[i];
      if (had) {
        ids.push(had.id!);
        if (untouched(had)) games = games.map((g) => (g.id === had.id ? { ...g, map: slot.map, scheduledAt: slot.time, startsAt: slot.time } : g));
        return;
      }
      const id = randomUUID();
      ids.push(id);
      games = [...games, { n: Math.max(0, ...games.map((g) => g.n)) + 1, id, dayId, map: slot.map, scheduledAt: slot.time, startsAt: slot.time, state: 'scheduled', attempts: [] }];
    });
    games = games.sort((a, b) => a.n - b.n).map((g, i) => ({ ...g, n: i + 1 }));
    // The tail removal above keeps earlier numbers; renumbering only closes gaps left by removed tail matches.
    const days = (l.days ?? []).map((d) => (d.id === dayId ? { ...d, matchIds: ids } : { ...d, matchIds: d.matchIds.filter((x) => games.some((g) => g.id === x)) }));
    this.lobbies.commit({ ...l, games, days }, 'lobby.update', { fields: { games: games.map((g) => ({ n: g.n, map: g.map, startsAt: g.startsAt ?? null })) }, format: { day: day.title, ...spec } });
    return this.lobbies.find(lobbyId);
  }

  /** A new lobby with this one's format, points, days and matches (all scheduled), its Rundown and look; no teams, no results. */
  async copy(lobbyId: string, title?: unknown) {
    const l = this.lobbies.find(lobbyId);
    const name = typeof title === 'string' && title.trim() ? title.replace(/[<>]/g, '').trim().slice(0, 60) : nextTitle(l.title);
    const id = randomUUID();
    const dayIds = new Map<string, string>(), gameIds = new Map<string, string>();
    const days: LobbyDay[] = (l.days ?? []).map((d) => { const nid = randomUUID(); dayIds.set(d.id, nid); return { id: nid, date: d.date, title: d.title, ...(d.opensAt ? { opensAt: d.opensAt } : {}), matchIds: [] }; });
    const games: LobbyGame[] = l.games.map((g) => {
      const gid = randomUUID(); gameIds.set(g.id!, gid);
      return { n: g.n, id: gid, dayId: dayIds.get(g.dayId ?? '') ?? days[0]?.id, map: g.map, ...(g.scheduledAt ? { scheduledAt: g.scheduledAt } : {}), ...(g.startsAt ? { startsAt: g.startsAt } : {}), state: 'scheduled' as const, attempts: [] };
    });
    for (const d of l.days ?? []) days.find((x) => x.id === dayIds.get(d.id))!.matchIds = d.matchIds.map((m) => gameIds.get(m)!).filter(Boolean);
    const copy: Lobby = {
      id, code: `L${id.replace(/-/g, '').slice(0, 7).toUpperCase()}`, eventId: l.eventId, game: l.game, title: name, stage: l.stage,
      teams: [], games, scoring: structuredClone(l.scoring), days, adjustments: [], createdAt: Date.now(),
      ...(l.show ? { show: structuredClone(l.show) } : {}), ...(l.look ? { look: structuredClone(l.look) } : {}),
    };
    return this.lobbies.adopt(copy);
  }

  // ── saved points tables (this PC) ──

  tables() { return this.ctx.store.data.pointsTables ?? []; }
  saveTable(input: unknown) {
    const x = (input ?? {}) as Record<string, unknown>;
    const all = this.tables();
    const had = typeof x.id === 'string' ? all.find((t) => t.id === x.id) : undefined;
    if (!had && all.length >= MAX_TABLES) throw new Error(`Keep up to ${MAX_TABLES} points tables; delete one first.`);
    const table = { id: had?.id ?? randomUUID(), name: validTableName(x.name, all, had?.id), scoring: validScoring(x.scoring) };
    this.ctx.store.data.pointsTables = had ? all.map((t) => (t.id === table.id ? table : t)) : [...all, table];
    this.ctx.store.save();
    this.ctx.changed();
    return table;
  }
  deleteTable(id: string) {
    const all = this.tables();
    if (!all.some((t) => t.id === id)) throw new Error('That points table is already gone.');
    this.ctx.store.data.pointsTables = all.filter((t) => t.id !== id);
    this.ctx.store.save();
    this.ctx.changed();
  }
}
